// Computes per-player improvement metrics from a parsed demo: opening duels,
// trades, KAST, multikills, clutches, flash quality (duration, not just
// counts), utility damage, objective play, and CT/T side splits.
//
// Every event is bucketed by tick via the MatchContext windows — event round
// counters are never trusted (see match-context.ts).

import type { DemoPlayerStats, SideSplit } from '@shared/types'
import type { Side } from '@shared/replay-types'
import type { ParsedDemo, PlayerDeathEvent } from './demo-types'
import { buildMatchContext, type MatchContext, type RoundWindow } from './match-context'

/** A death is "traded" if a teammate kills the killer within this window. */
const TRADE_WINDOW_SECONDS = 5

const UTILITY_WEAPONS = new Set([
  'hegrenade',
  'molotov',
  'incgrenade',
  'inferno',
  'decoy',
  'flashbang'
])

export interface AnalyzerResult {
  rounds: number
  ctStartScore: number
  tStartScore: number
  players: DemoPlayerStats[]
  warnings: string[]
}

function emptySplit(): SideSplit {
  return { rounds: 0, roundsWon: 0, kills: 0, deaths: 0, assists: 0, damage: 0 }
}

interface Acc {
  steamId: string
  name: string
  kills: number
  deaths: number
  assists: number
  damage: number
  headshotKills: number
  kastRounds: number
  tradeKills: number
  untradedDeaths: number
  openingKills: number
  openingDeaths: number
  multi: number[] // index = kills in round (2..5+)
  clutchAttempts: Map<number, number>
  clutchWins: Map<number, number>
  flashesThrown: number
  enemiesFlashed: number
  enemyBlindDuration: number
  teamflashDuration: number
  flashAssists: number
  utilityDamage: number
  plants: number
  defuses: number
  roundsPlayed: number
  roundsWon: number
  splits: { CT: SideSplit; T: SideSplit }
}

export function analyzeDemo(demo: ParsedDemo): AnalyzerResult {
  const ctx = buildMatchContext(demo)
  const warnings: string[] = []
  const accs = new Map<string, Acc>()
  for (const p of demo.roster) {
    accs.set(p.steamid, {
      steamId: p.steamid,
      name: p.name,
      kills: 0,
      deaths: 0,
      assists: 0,
      damage: 0,
      headshotKills: 0,
      kastRounds: 0,
      tradeKills: 0,
      untradedDeaths: 0,
      openingKills: 0,
      openingDeaths: 0,
      multi: [0, 0, 0, 0, 0, 0],
      clutchAttempts: new Map(),
      clutchWins: new Map(),
      flashesThrown: 0,
      enemiesFlashed: 0,
      enemyBlindDuration: 0,
      teamflashDuration: 0,
      flashAssists: 0,
      utilityDamage: 0,
      plants: 0,
      defuses: 0,
      roundsPlayed: 0,
      roundsWon: 0,
      splits: { CT: emptySplit(), T: emptySplit() }
    })
  }

  const sideOf = (w: RoundWindow, steamId: string | null): Side | null =>
    steamId ? (ctx.sidesByRound[w.round - 1].get(steamId) ?? null) : null
  const enemies = (w: RoundWindow, a: string | null, b: string | null): boolean => {
    const sa = sideOf(w, a)
    const sb = sideOf(w, b)
    return sa !== null && sb !== null && sa !== sb
  }

  // Deaths bucketed per round, tick-ordered.
  const deathsByRound: PlayerDeathEvent[][] = ctx.windows.map(() => [])
  for (const d of [...demo.deaths].sort((a, b) => a.tick - b.tick)) {
    const w = ctx.roundOfTick(d.tick)
    if (w) deathsByRound[w.round - 1].push(d)
  }

  // Rounds played / won / side splits.
  for (const w of ctx.windows) {
    for (const [steamId, side] of ctx.sidesByRound[w.round - 1]) {
      const acc = accs.get(steamId)
      if (!acc) continue
      acc.roundsPlayed++
      acc.splits[side].rounds++
      if (w.winner === side) {
        acc.roundsWon++
        acc.splits[side].roundsWon++
      }
    }
  }

  // Kills / deaths / assists / openings / multikills / KAST / trades / clutches.
  const tradeTicks = TRADE_WINDOW_SECONDS * ctx.tickRate
  for (const w of ctx.windows) {
    const roundDeaths = deathsByRound[w.round - 1]
    const killsThisRound = new Map<string, number>()
    const kastEarned = new Set<string>()
    let openingSeen = false

    // Alive tracking for clutch detection.
    const alive: Record<Side, Set<string>> = { CT: new Set(), T: new Set() }
    for (const [steamId, side] of ctx.sidesByRound[w.round - 1]) alive[side].add(steamId)
    const clutchRecorded = new Set<string>()

    for (let i = 0; i < roundDeaths.length; i++) {
      const d = roundDeaths[i]
      const victim = d.user_steamid
      const attacker = d.attacker_steamid
      const victimAcc = victim ? accs.get(victim) : undefined
      const attackerAcc = attacker ? accs.get(attacker) : undefined
      const victimSide = sideOf(w, victim)
      const isEnemyKill = enemies(w, attacker, victim)

      if (victimAcc && victimSide) {
        victimAcc.deaths++
        victimAcc.splits[victimSide].deaths++
      }
      if (attackerAcc && isEnemyKill) {
        const attackerSide = sideOf(w, attacker)!
        attackerAcc.kills++
        attackerAcc.splits[attackerSide].kills++
        if (d.headshot) attackerAcc.headshotKills++
        killsThisRound.set(attacker!, (killsThisRound.get(attacker!) ?? 0) + 1)
        kastEarned.add(attacker!)

        if (!openingSeen) {
          openingSeen = true
          attackerAcc.openingKills++
          if (victimAcc) victimAcc.openingDeaths++
        }

        // Trade: this kill avenges a teammate the victim killed just before.
        for (let j = i - 1; j >= 0; j--) {
          const prev = roundDeaths[j]
          if (d.tick - prev.tick > tradeTicks) break
          if (
            prev.attacker_steamid === victim &&
            enemies(w, prev.attacker_steamid, prev.user_steamid) &&
            sideOf(w, prev.user_steamid) === attackerSide
          ) {
            attackerAcc.tradeKills++
            if (prev.user_steamid) kastEarned.add(prev.user_steamid) // traded death
            break
          }
        }
      }
      const assister = d.assister_steamid
      if (assister && isEnemyKill && sideOf(w, assister) !== victimSide) {
        const acc = accs.get(assister)
        const s = sideOf(w, assister)
        if (acc && s) {
          acc.assists++
          acc.splits[s].assists++
          if (d.assistedflash) acc.flashAssists++
          kastEarned.add(assister)
        }
      }

      // Clutch detection: a death leaves someone alone against N enemies.
      if (victim && victimSide) {
        alive[victimSide].delete(victim)
        for (const side of ['CT', 'T'] as const) {
          const other = side === 'CT' ? 'T' : 'CT'
          if (alive[side].size === 1 && alive[other].size >= 1) {
            const lone = [...alive[side]][0]
            if (!clutchRecorded.has(lone)) {
              clutchRecorded.add(lone)
              const acc = accs.get(lone)
              if (acc) {
                const n = alive[other].size
                acc.clutchAttempts.set(n, (acc.clutchAttempts.get(n) ?? 0) + 1)
                if (w.winner === side) acc.clutchWins.set(n, (acc.clutchWins.get(n) ?? 0) + 1)
              }
            }
          }
        }
      }
    }

    // Survivors get KAST.
    const diedThisRound = new Set(roundDeaths.map((d) => d.user_steamid).filter(Boolean))
    for (const [steamId] of ctx.sidesByRound[w.round - 1]) {
      if (!diedThisRound.has(steamId)) kastEarned.add(steamId)
      const acc = accs.get(steamId)
      if (acc && kastEarned.has(steamId)) acc.kastRounds++
    }
    // Untraded deaths: died to an enemy and no teammate answered in the window
    // (independent of KAST — a 1k-then-untraded-death still counts).
    for (const d of roundDeaths) {
      const victim = d.user_steamid
      const victimSide = sideOf(w, victim)
      if (!victim || !victimSide || !enemies(w, d.attacker_steamid, victim)) continue
      const traded = roundDeaths.some(
        (t) =>
          t.tick > d.tick &&
          t.tick - d.tick <= tradeTicks &&
          t.user_steamid === d.attacker_steamid &&
          sideOf(w, t.attacker_steamid) === victimSide
      )
      if (!traded) {
        const acc = accs.get(victim)
        if (acc) acc.untradedDeaths++
      }
    }

    for (const [steamId, k] of killsThisRound) {
      const acc = accs.get(steamId)
      if (acc && k >= 2) acc.multi[Math.min(k, 5)]++
    }
  }

  // Damage (enemy-only), utility damage.
  for (const h of demo.hurts) {
    const w = ctx.roundOfTick(h.tick)
    if (!w || !h.attacker_steamid || h.attacker_steamid === h.user_steamid) continue
    if (!enemies(w, h.attacker_steamid, h.user_steamid)) continue
    const acc = accs.get(h.attacker_steamid)
    const side = sideOf(w, h.attacker_steamid)
    if (!acc || !side) continue
    acc.damage += h.dmg_health
    acc.splits[side].damage += h.dmg_health
    if (h.weapon && UTILITY_WEAPONS.has(h.weapon)) acc.utilityDamage += h.dmg_health
  }

  // Flash quality: seconds of blindness dealt to enemies vs team (incl. self).
  for (const b of demo.blinds) {
    const w = ctx.roundOfTick(b.tick)
    if (!w || !b.attacker_steamid) continue
    const acc = accs.get(b.attacker_steamid)
    if (!acc) continue
    if (enemies(w, b.attacker_steamid, b.user_steamid)) {
      acc.enemiesFlashed++
      acc.enemyBlindDuration += b.blind_duration
    } else {
      acc.teamflashDuration += b.blind_duration
    }
  }
  for (const s of demo.shots) {
    if (s.weapon === 'weapon_flashbang' && s.user_steamid) {
      const acc = accs.get(s.user_steamid)
      if (acc) acc.flashesThrown++
    }
  }

  for (const p of demo.plants) {
    const acc = p.user_steamid ? accs.get(p.user_steamid) : undefined
    if (acc && ctx.roundOfTick(p.tick)) acc.plants++
  }
  for (const d of demo.defuses) {
    const acc = d.user_steamid ? accs.get(d.user_steamid) : undefined
    if (acc && ctx.roundOfTick(d.tick)) acc.defuses++
  }

  // Final score by starting team (round-1 CT team vs round-1 T team).
  const { ctStartScore, tStartScore } = startTeamScores(ctx)
  if (ctStartScore + tStartScore !== ctx.windows.length) {
    warnings.push(
      `score: start-team scores (${ctStartScore}+${tStartScore}) don't cover all ${ctx.windows.length} rounds`
    )
  }

  const players: DemoPlayerStats[] = [...accs.values()].map((a) => {
    const startingSide = ctx.windows.length > 0 ? (ctx.sidesByRound[0].get(a.steamId) ?? null) : null
    const enemyScore = ctx.windows.length - a.roundsWon
    return {
      demoId: 0, // set by the caller when persisting
      steamId: a.steamId,
      name: a.name,
      startingSide,
      won: a.roundsWon > enemyScore,
      roundsPlayed: a.roundsPlayed,
      kills: a.kills,
      deaths: a.deaths,
      assists: a.assists,
      damage: a.damage,
      adr: a.roundsPlayed > 0 ? a.damage / a.roundsPlayed : 0,
      headshotKills: a.headshotKills,
      headshotPct: a.kills > 0 ? (a.headshotKills / a.kills) * 100 : 0,
      kastRounds: a.kastRounds,
      kastPct: a.roundsPlayed > 0 ? (a.kastRounds / a.roundsPlayed) * 100 : 0,
      tradeKills: a.tradeKills,
      untradedDeaths: a.untradedDeaths,
      openingKills: a.openingKills,
      openingDeaths: a.openingDeaths,
      multiKills2: a.multi[2],
      multiKills3: a.multi[3],
      multiKills4: a.multi[4],
      multiKills5: a.multi[5],
      clutch1v1Attempts: a.clutchAttempts.get(1) ?? 0,
      clutch1v1Wins: a.clutchWins.get(1) ?? 0,
      clutch1v2Attempts: a.clutchAttempts.get(2) ?? 0,
      clutch1v2Wins: a.clutchWins.get(2) ?? 0,
      flashesThrown: a.flashesThrown,
      enemiesFlashed: a.enemiesFlashed,
      enemyBlindDuration: a.enemyBlindDuration,
      teamflashDuration: a.teamflashDuration,
      flashAssists: a.flashAssists,
      utilityDamage: a.utilityDamage,
      plants: a.plants,
      defuses: a.defuses,
      sideSplits: a.splits
    }
  })

  return {
    rounds: ctx.windows.length,
    ctStartScore,
    tStartScore,
    players,
    warnings: [...demo.warnings, ...warnings]
  }
}

/** Rounds won by the team that started CT / started T (handles side swaps). */
function startTeamScores(ctx: MatchContext): { ctStartScore: number; tStartScore: number } {
  if (ctx.windows.length === 0) return { ctStartScore: 0, tStartScore: 0 }
  const round1CT = new Set(
    [...ctx.sidesByRound[0]].filter(([, side]) => side === 'CT').map(([id]) => id)
  )
  let ctStartScore = 0
  let tStartScore = 0
  for (const w of ctx.windows) {
    if (!w.winner) continue
    // Which side is the CT-start team on this round? Majority vote of its
    // members still present (robust to a disconnect).
    let ct = 0
    let t = 0
    for (const [id, side] of ctx.sidesByRound[w.round - 1]) {
      if (!round1CT.has(id)) continue
      if (side === 'CT') ct++
      else t++
    }
    const ctStartSide: Side | null = ct > t ? 'CT' : t > ct ? 'T' : null
    if (!ctStartSide) continue
    if (w.winner === ctStartSide) ctStartScore++
    else tStartScore++
  }
  return { ctStartScore, tStartScore }
}
