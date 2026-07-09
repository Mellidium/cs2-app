// Builds the 2D-replay payload (shared/replay-types) from a parsed demo:
// freeze-trimmed downsampled position frames, kill/plant/defuse/round-end
// events, grenade trajectories with detonate ticks, shot ticks for tracers,
// blind/hurt overlays, and bomb-carrier change-points.

import {
  REPLAY_FRAME_RATE,
  REPLAY_SCHEMA_VERSION,
  type GrenadeKind,
  type ReplayEvent,
  type ReplayFrame,
  type ReplayGrenade,
  type ReplayPayload,
  type ReplayRound
} from '@shared/replay-types'
import type { GrenadeTrajectoryRow, ParsedDemo } from './demo-types'
import { buildMatchContext, frameStep, type RoundWindow } from './match-context'

/** Weapons whose `weapon_fire` should NOT draw a bullet tracer. */
const NO_TRACER = /knife|bayonet|c4|grenade|molotov|decoy|flashbang|healthshot|shield|fists|snowball|breachcharge|bumpmine|tablet/

export interface ExtractResult {
  payload: ReplayPayload
  warnings: string[]
}

export function extractReplay(demo: ParsedDemo): ExtractResult {
  const ctx = buildMatchContext(demo)
  const warnings: string[] = []

  const players = demo.roster.map((p, id) => ({ id, name: p.name, steamId: p.steamid }))
  const idOf = new Map(demo.roster.map((p, id) => [p.steamid, id]))
  const toId = (steamId: string | null | undefined): number | null =>
    steamId != null ? (idOf.get(steamId) ?? null) : null

  // Group position samples into frames per round.
  const framesByRound: Map<number, ReplayFrame>[] = ctx.windows.map(() => new Map())
  for (const t of demo.ticks) {
    const w = windowOfPlaybackTick(ctx.windows, t.tick)
    if (!w) continue
    const id = idOf.get(t.steamid)
    if (id === undefined) continue
    const frames = framesByRound[w.round - 1]
    let frame = frames.get(t.tick)
    if (!frame) frames.set(t.tick, (frame = { tick: t.tick, players: [] }))
    frame.players.push({
      id,
      x: t.X,
      y: t.Y,
      yaw: t.yaw,
      hp: t.health,
      alive: t.is_alive,
      weapon: t.active_weapon_name
    })
  }

  // Grenade trajectories grouped by projectile entity, typed and detonated.
  const grenadesByRound = bucketGrenades(demo, ctx.windows, toId, warnings)

  // Fire kills come through as weapon `inferno`; relabel to the attacker's
  // actual fire grenade by their most recent molotov/incendiary throw.
  const fireThrows = demo.shots
    .filter((s) => s.weapon === 'weapon_molotov' || s.weapon === 'weapon_incgrenade')
    .sort((a, b) => a.tick - b.tick)
  const fireKillLabel = (attacker: string | null, tick: number): string => {
    let label = 'molotov'
    for (const s of fireThrows) {
      if (s.tick > tick) break
      if (s.user_steamid === attacker) label = s.weapon === 'weapon_incgrenade' ? 'incendiary' : 'molotov'
    }
    return label
  }

  const rounds: ReplayRound[] = ctx.windows.map((w) => {
    const wi = w.round - 1
    const inRound = (tick: number): boolean => tick >= w.startTick && tick < w.nextStartTick
    const inPlayback = (tick: number): boolean => tick >= w.firstTick && tick <= w.lastTick

    const events: ReplayEvent[] = []
    for (const d of demo.deaths) {
      // Kills are bucketed by tick window — post-round kills land after the
      // counter bump, so an event round counter would misfile them.
      if (!inRound(d.tick)) continue
      const victimId = toId(d.user_steamid)
      if (victimId === null) continue
      events.push({
        type: 'kill',
        tick: d.tick,
        attackerId: toId(d.attacker_steamid),
        victimId,
        assisterId: toId(d.assister_steamid),
        weapon: d.weapon === 'inferno' ? fireKillLabel(d.attacker_steamid, d.tick) : d.weapon,
        headshot: d.headshot,
        attacker:
          d.attacker_X != null && d.attacker_Y != null
            ? { x: d.attacker_X, y: d.attacker_Y }
            : null,
        victim: d.user_X != null && d.user_Y != null ? { x: d.user_X, y: d.user_Y } : null
      })
    }
    for (const p of demo.plants) {
      if (inRound(p.tick)) {
        events.push({
          type: 'plant',
          tick: p.tick,
          playerId: toId(p.user_steamid),
          x: p.user_X ?? 0,
          y: p.user_Y ?? 0
        })
      }
    }
    for (const d of demo.defuses) {
      if (inRound(d.tick)) {
        events.push({
          type: 'defuse',
          tick: d.tick,
          playerId: toId(d.user_steamid),
          x: d.user_X ?? 0,
          y: d.user_Y ?? 0
        })
      }
    }
    events.push({ type: 'round_end', tick: w.endTick, winner: w.winner, reason: w.reason })
    events.sort((a, b) => a.tick - b.tick)

    // Bomb carrier: inventory seed at the first rendered tick, then pickups/drops.
    const bombCarrier: ReplayRound['bombCarrier'] = []
    const firstFrame = framesByRound[wi].get(w.firstTick)
    if (firstFrame) {
      const seed = demo.ticks.find(
        (t) => t.tick === w.firstTick && t.inventory?.some((i) => i.toUpperCase().includes('C4'))
      )
      if (seed) {
        const id = toId(seed.steamid)
        if (id !== null) bombCarrier.push({ tick: w.firstTick, carrierId: id })
      }
    }
    for (const p of demo.bombPickups) {
      if (inPlayback(p.tick)) bombCarrier.push({ tick: p.tick, carrierId: toId(p.user_steamid) })
    }
    for (const d of demo.bombDrops) {
      if (inPlayback(d.tick)) bombCarrier.push({ tick: d.tick, carrierId: null })
    }
    bombCarrier.sort((a, b) => a.tick - b.tick)

    return {
      round: w.round,
      startTick: w.startTick,
      endTick: w.endTick,
      sides: players.map((p) => ctx.sidesByRound[wi].get(p.steamId) ?? null),
      frames: [...framesByRound[wi].values()].sort((a, b) => a.tick - b.tick),
      events,
      grenades: grenadesByRound[wi],
      shots: demo.shots
        .filter(
          (s) =>
            inPlayback(s.tick) &&
            s.weapon != null &&
            !NO_TRACER.test(s.weapon) &&
            toId(s.user_steamid) !== null
        )
        .map((s) => ({ tick: s.tick, shooterId: toId(s.user_steamid)! })),
      blinds: demo.blinds
        .filter((b) => inPlayback(b.tick) && toId(b.user_steamid) !== null)
        .map((b) => ({ tick: b.tick, playerId: toId(b.user_steamid)!, duration: b.blind_duration })),
      hurts: demo.hurts
        .filter((h) => inPlayback(h.tick) && toId(h.user_steamid) !== null)
        .map((h) => ({ tick: h.tick, playerId: toId(h.user_steamid)! })),
      bombCarrier
    }
  })

  const emptyFrameRounds = rounds.filter((r) => r.frames.length === 0).length
  if (emptyFrameRounds > 0) warnings.push(`replay: ${emptyFrameRounds} rounds have no frames`)

  return {
    payload: {
      version: REPLAY_SCHEMA_VERSION,
      map: demo.map,
      tickRate: demo.tickRate,
      frameRate: REPLAY_FRAME_RATE,
      players,
      rounds
    },
    warnings
  }
}

function windowOfPlaybackTick(windows: RoundWindow[], tick: number): RoundWindow | null {
  for (const w of windows) {
    if (tick >= w.firstTick && tick <= w.lastTick) return w
  }
  return null
}

/** Projectile class (e.g. "CSmokeGrenadeProjectile") → normalized kind. */
function normalizeGrenadeKind(raw: string | null): GrenadeKind | null {
  if (!raw) return null
  const s = raw.toLowerCase()
  // Held-grenade classes (no "projectile") appear if the parser ever ignores
  // the projectiles-only flag — those aren't throws, skip them.
  if (!s.includes('projectile')) return null
  if (s.includes('smoke')) return 'smoke'
  if (s.includes('flash')) return 'flashbang'
  if (s.includes('inc')) return 'incendiary'
  if (s.includes('molotov')) return 'molotov' // may be refined to incendiary by throw
  if (s.includes('hegrenade')) return 'he'
  if (s.includes('decoy')) return 'decoy'
  return null
}

function bucketGrenades(
  demo: ParsedDemo,
  windows: RoundWindow[],
  toId: (steamId: string | null | undefined) => number | null,
  warnings: string[]
): ReplayGrenade[][] {
  const byRound: ReplayGrenade[][] = windows.map(() => [])

  // Group trajectory rows per projectile instance. Entity ids are recycled
  // across rounds, so key on (entity_id, large tick gap starts a new instance).
  const byEntity = new Map<number, GrenadeTrajectoryRow[]>()
  for (const row of demo.grenadeTrajectories) {
    if (row.x == null || row.y == null) continue
    let rows = byEntity.get(row.entity_id)
    if (!rows) byEntity.set(row.entity_id, (rows = []))
    rows.push(row)
  }

  // Detonate events indexed by entity id for exact matching.
  const detonates = new Map<number, number>()
  for (const d of [...demo.smokeDetonates, ...demo.heDetonates, ...demo.flashDetonates]) {
    detonates.set(d.entityid, d.tick)
  }

  const step = frameStep(demo.tickRate)
  let dropped = 0
  for (const rows of byEntity.values()) {
    rows.sort((a, b) => a.tick - b.tick)
    // Split recycled entity ids into instances on a gap > 2s.
    const instances: GrenadeTrajectoryRow[][] = []
    let current: GrenadeTrajectoryRow[] = []
    for (const row of rows) {
      if (current.length > 0 && row.tick - current[current.length - 1].tick > demo.tickRate * 2) {
        instances.push(current)
        current = []
      }
      current.push(row)
    }
    if (current.length > 0) instances.push(current)

    for (const inst of instances) {
      let kind = normalizeGrenadeKind(inst[0].grenade_type)
      if (!kind) {
        dropped++
        continue
      }
      const startTick = inst[0].tick
      const wi = windows.findIndex((w) => startTick >= w.startTick && startTick < w.nextStartTick)
      if (wi < 0) continue

      // The engine uses the molotov projectile for incendiaries too — refine
      // by the thrower's most recent fire-grenade throw.
      if (kind === 'molotov') {
        const thrower = inst[0].thrower_steamid
        for (const s of demo.shots) {
          if (s.tick > startTick + demo.tickRate) break
          if (s.tick < startTick - 5 * demo.tickRate || s.user_steamid !== thrower) continue
          if (s.weapon === 'weapon_incgrenade') kind = 'incendiary'
          else if (s.weapon === 'weapon_molotov') kind = 'molotov'
        }
      }

      const full = inst.map((r) => ({ tick: r.tick, x: r.x!, y: r.y!, z: r.z ?? 0 }))
      const detonateTick =
        detonates.get(inst[0].entity_id) ?? restingTick(full) ?? full[full.length - 1].tick
      // Smoke/fire entities linger after landing — the flight path ends at the
      // detonate; the effect itself is drawn by playback from detonateTick on.
      const flight = full.filter((p) => p.tick <= detonateTick)
      const trajectory = flight.filter(
        (p, i) => i === 0 || i === flight.length - 1 || p.tick % step === 0
      )

      byRound[wi].push({
        type: kind,
        throwerId: toId(inst[0].thrower_steamid),
        trajectory: trajectory.length > 0 ? trajectory : full.slice(0, 1),
        detonateTick
      })
    }
  }
  if (dropped > 0) warnings.push(`grenades: ${dropped} projectiles had unrecognized types`)
  return byRound
}

/**
 * Tick the projectile reaches its resting position — walk back from the end
 * while the position stays put, so a smoke blooms when it lands, not when its
 * entity expires.
 */
function restingTick(trajectory: { tick: number; x: number; y: number; z: number }[]): number | null {
  if (trajectory.length < 2) return null
  const last = trajectory[trajectory.length - 1]
  let resting = last.tick
  for (let i = trajectory.length - 2; i >= 0; i--) {
    const p = trajectory[i]
    const still =
      Math.abs(p.x - last.x) < 1 && Math.abs(p.y - last.y) < 1 && Math.abs(p.z - last.z) < 1
    if (!still) break
    resting = p.tick
  }
  return resting
}
