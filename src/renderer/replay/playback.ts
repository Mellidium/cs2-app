// Clockless playback state: viewStateAt(payload, round, tick) resolves what
// the world looks like at one tick — interpolated player positions, active
// grenade effects, tracers, bomb state, kill feed. The React shell owns the
// clock (RAF); everything here is pure and unit-testable.

import type {
  ReplayGrenade,
  ReplayKillEvent,
  ReplayPayload,
  ReplayPlayerFrame,
  ReplayRound,
  Side
} from '@shared/replay-types'

/** How long each grenade effect lingers after detonation, in seconds. */
export const GRENADE_EFFECT: Record<string, { seconds: number; radius: number }> = {
  smoke: { seconds: 18, radius: 144 },
  molotov: { seconds: 7, radius: 120 },
  incendiary: { seconds: 7, radius: 150 },
  he: { seconds: 0.6, radius: 90 },
  flashbang: { seconds: 0.5, radius: 70 },
  decoy: { seconds: 15, radius: 24 }
}

const SHOT_TRACER_SECONDS = 0.14
const KILL_TRACER_SECONDS = 0.6
const HURT_BLINK_SECONDS = 0.45
const KILL_FEED_SECONDS = 8
const KILL_FEED_MAX = 5
const EXPLOSION_SECONDS = 1.2

export interface ViewPlayer {
  id: number
  name: string
  side: Side | null
  x: number
  y: number
  yaw: number
  hp: number
  alive: boolean
  weapon: string | null
  /** 0..1 — whiteout intensity from flashes. */
  flash: number
  /** 0..1 — red damage blink. */
  hurt: number
}

export interface ViewGrenade {
  type: string
  x: number
  y: number
  phase: 'flight' | 'effect'
  /** 0..1 remaining life of the current phase. */
  fade: number
  radius: number
}

export interface ViewTracer {
  fromX: number
  fromY: number
  /** Direction in degrees (shot tracers) — draw a ray. */
  yaw: number | null
  /** Explicit endpoint (kill tracers). */
  toX: number | null
  toY: number | null
  kind: 'shot' | 'kill'
  fade: number
}

export interface ViewBomb {
  x: number
  y: number
  state: 'carried' | 'dropped' | 'planted' | 'defused'
}

export interface KillFeedEntry {
  attacker: string | null
  attackerSide: Side | null
  victim: string
  victimSide: Side | null
  weapon: string | null
  headshot: boolean
  tick: number
}

export interface ViewState {
  tick: number
  players: ViewPlayer[]
  grenades: ViewGrenade[]
  tracers: ViewTracer[]
  bomb: ViewBomb | null
  explosion: { x: number; y: number; progress: number } | null
  killFeed: KillFeedEntry[]
  roundOver: { winner: Side | null; reason: string } | null
}

export function roundTickRange(round: ReplayRound): { first: number; last: number } {
  if (round.frames.length === 0) return { first: round.startTick, last: round.endTick }
  return { first: round.frames[0].tick, last: round.frames[round.frames.length - 1].tick }
}

/** Binary search: index of the last frame with frame.tick <= tick. */
function frameIndexAt(round: ReplayRound, tick: number): number {
  const frames = round.frames
  let lo = 0
  let hi = frames.length - 1
  if (hi < 0 || tick < frames[0].tick) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (frames[mid].tick <= tick) lo = mid
    else hi = mid - 1
  }
  return lo
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Shortest-path yaw interpolation (no 350°→10° spin the long way round). */
function lerpYaw(a: number, b: number, t: number): number {
  let d = ((b - a + 540) % 360) - 180
  return a + d * t
}

interface InterpolatedPlayer extends ReplayPlayerFrame {
  present: boolean
}

function playersAt(round: ReplayRound, tick: number, playerCount: number): InterpolatedPlayer[] {
  const idx = frameIndexAt(round, tick)
  const out: InterpolatedPlayer[] = []
  if (idx < 0) return out
  const a = round.frames[idx]
  const b = round.frames[idx + 1]
  const t = b && b.tick > a.tick ? (tick - a.tick) / (b.tick - a.tick) : 0
  const byIdA = new Map(a.players.map((p) => [p.id, p]))
  const byIdB = b ? new Map(b.players.map((p) => [p.id, p])) : null

  for (let id = 0; id < playerCount; id++) {
    const pa = byIdA.get(id)
    if (!pa) continue
    const pb = byIdB?.get(id)
    if (pb && pa.alive && pb.alive) {
      out.push({
        id,
        x: lerp(pa.x, pb.x, t),
        y: lerp(pa.y, pb.y, t),
        yaw: lerpYaw(pa.yaw, pb.yaw, t),
        hp: pa.hp,
        alive: pa.alive,
        weapon: pa.weapon,
        present: true
      })
    } else {
      out.push({ ...pa, present: true })
    }
  }
  return out
}

export function viewStateAt(payload: ReplayPayload, roundIdx: number, tick: number): ViewState {
  const round = payload.rounds[roundIdx]
  const rate = payload.tickRate
  const interpolated = playersAt(round, tick, payload.players.length)
  const byId = new Map(interpolated.map((p) => [p.id, p]))

  // Flash / hurt overlays (alive players only — resolved below).
  const flashById = new Map<number, number>()
  for (const b of round.blinds) {
    const end = b.tick + b.duration * rate
    if (tick >= b.tick && tick <= end && b.duration > 0) {
      const remaining = (end - tick) / (b.duration * rate)
      flashById.set(b.playerId, Math.max(flashById.get(b.playerId) ?? 0, remaining))
    }
  }
  const hurtById = new Map<number, number>()
  for (const h of round.hurts) {
    const end = h.tick + HURT_BLINK_SECONDS * rate
    if (tick >= h.tick && tick <= end) {
      const remaining = (end - tick) / (HURT_BLINK_SECONDS * rate)
      hurtById.set(h.playerId, Math.max(hurtById.get(h.playerId) ?? 0, remaining))
    }
  }

  const players: ViewPlayer[] = interpolated.map((p) => ({
    id: p.id,
    name: payload.players[p.id]?.name ?? `#${p.id}`,
    side: round.sides[p.id] ?? null,
    x: p.x,
    y: p.y,
    yaw: p.yaw,
    hp: p.hp,
    alive: p.alive,
    weapon: p.weapon,
    flash: p.alive ? (flashById.get(p.id) ?? 0) : 0,
    hurt: p.alive ? (hurtById.get(p.id) ?? 0) : 0
  }))

  return {
    tick,
    players,
    grenades: grenadesAt(round, tick, rate),
    tracers: tracersAt(round, tick, rate, byId),
    bomb: bombStateAt(round, tick, byId),
    explosion: explosionAt(round, tick, rate),
    killFeed: killFeedAt(payload, round, tick, rate),
    roundOver:
      tick >= round.endTick
        ? (() => {
            const end = round.events.find((e) => e.type === 'round_end')
            return end && end.type === 'round_end'
              ? { winner: end.winner, reason: end.reason }
              : { winner: null, reason: '' }
          })()
        : null
  }
}

function grenadesAt(round: ReplayRound, tick: number, rate: number): ViewGrenade[] {
  const out: ViewGrenade[] = []
  for (const g of round.grenades) {
    const traj = g.trajectory
    if (traj.length === 0) continue
    const det = g.detonateTick ?? traj[traj.length - 1].tick
    const effect = GRENADE_EFFECT[g.type] ?? { seconds: 0.5, radius: 40 }

    if (tick >= traj[0].tick && tick < det) {
      // In flight: interpolate along the trajectory.
      let i = 0
      while (i < traj.length - 1 && traj[i + 1].tick <= tick) i++
      const a = traj[i]
      const b = traj[Math.min(i + 1, traj.length - 1)]
      const t = b.tick > a.tick ? (tick - a.tick) / (b.tick - a.tick) : 0
      out.push({
        type: g.type,
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        phase: 'flight',
        fade: 1,
        radius: effect.radius
      })
    } else if (tick >= det && tick <= det + effect.seconds * rate) {
      const rest = traj[traj.length - 1]
      let fade = 1 - (tick - det) / (effect.seconds * rate)
      // Decoys pop intermittently — pulse their visibility.
      if (g.type === 'decoy') {
        const phase = ((tick - det) / rate) % 2
        fade *= phase < 1.2 ? 1 : 0.25
      }
      out.push({ type: g.type, x: rest.x, y: rest.y, phase: 'effect', fade, radius: effect.radius })
    }
  }
  return out
}

function tracersAt(
  round: ReplayRound,
  tick: number,
  rate: number,
  byId: Map<number, InterpolatedPlayer>
): ViewTracer[] {
  const out: ViewTracer[] = []
  const shotWindow = SHOT_TRACER_SECONDS * rate
  for (const s of round.shots) {
    if (tick < s.tick || tick > s.tick + shotWindow) continue
    const shooter = byId.get(s.shooterId)
    if (!shooter || !shooter.alive) continue
    out.push({
      fromX: shooter.x,
      fromY: shooter.y,
      yaw: shooter.yaw,
      toX: null,
      toY: null,
      kind: 'shot',
      fade: 1 - (tick - s.tick) / shotWindow
    })
  }
  const killWindow = KILL_TRACER_SECONDS * rate
  for (const e of round.events) {
    if (e.type !== 'kill' || !e.attacker || !e.victim) continue
    if (tick < e.tick || tick > e.tick + killWindow) continue
    out.push({
      fromX: e.attacker.x,
      fromY: e.attacker.y,
      yaw: null,
      toX: e.victim.x,
      toY: e.victim.y,
      kind: 'kill',
      fade: 1 - (tick - e.tick) / killWindow
    })
  }
  return out
}

function bombStateAt(
  round: ReplayRound,
  tick: number,
  byId: Map<number, InterpolatedPlayer>
): ViewBomb | null {
  // Plant/defuse take priority once they've happened.
  let plant: { tick: number; x: number; y: number } | null = null
  let defused = false
  for (const e of round.events) {
    if (e.tick > tick) break
    if (e.type === 'plant') plant = { tick: e.tick, x: e.x, y: e.y }
    if (e.type === 'defuse') defused = true
  }
  if (plant) {
    // The C4 detonation is drawn by explosionAt; hide the icon after it pops.
    const end = round.events.find((e) => e.type === 'round_end')
    if (end && end.type === 'round_end' && end.reason === 'target_bombed' && tick >= end.tick) {
      return null
    }
    return { x: plant.x, y: plant.y, state: defused ? 'defused' : 'planted' }
  }

  // Otherwise resolve the latest carrier change-point.
  let carrier: number | null = null
  let carrierTick = -1
  let seen = false
  for (const c of round.bombCarrier) {
    if (c.tick > tick) break
    carrier = c.carrierId
    carrierTick = c.tick
    seen = true
  }
  if (!seen) return null
  if (carrier !== null) {
    const p = byId.get(carrier)
    return p ? { x: p.x, y: p.y, state: 'carried' } : null
  }
  // Dropped: sits where the carrier was at the drop tick — approximate with
  // the nearest known frame position at that tick (resolved by caller passing
  // current positions; the drop spot barely moves between frames).
  const dropFrame = frameIndexAt(round, carrierTick)
  if (dropFrame < 0) return null
  // Use the previous carrier's position at the drop tick.
  let prevCarrier: number | null = null
  for (const c of round.bombCarrier) {
    if (c.tick >= carrierTick) break
    prevCarrier = c.carrierId
  }
  if (prevCarrier === null) return null
  const frame = round.frames[dropFrame]
  const p = frame.players.find((fp) => fp.id === prevCarrier)
  return p ? { x: p.x, y: p.y, state: 'dropped' } : null
}

function explosionAt(
  round: ReplayRound,
  tick: number,
  rate: number
): { x: number; y: number; progress: number } | null {
  const end = round.events.find((e) => e.type === 'round_end')
  if (!end || end.type !== 'round_end' || end.reason !== 'target_bombed') return null
  const window = EXPLOSION_SECONDS * rate
  if (tick < end.tick || tick > end.tick + window) return null
  let plant: { x: number; y: number } | null = null
  for (const e of round.events) {
    if (e.type === 'plant' && e.tick <= end.tick) plant = { x: e.x, y: e.y }
  }
  if (!plant) return null
  return { x: plant.x, y: plant.y, progress: (tick - end.tick) / window }
}

function killFeedAt(
  payload: ReplayPayload,
  round: ReplayRound,
  tick: number,
  rate: number
): KillFeedEntry[] {
  const out: KillFeedEntry[] = []
  const window = KILL_FEED_SECONDS * rate
  for (const e of round.events) {
    if (e.type !== 'kill' || e.tick > tick || tick - e.tick > window) continue
    const kill = e as ReplayKillEvent
    out.push({
      attacker: kill.attackerId !== null ? (payload.players[kill.attackerId]?.name ?? null) : null,
      attackerSide: kill.attackerId !== null ? (round.sides[kill.attackerId] ?? null) : null,
      victim: payload.players[kill.victimId]?.name ?? `#${kill.victimId}`,
      victimSide: round.sides[kill.victimId] ?? null,
      weapon: kill.weapon,
      headshot: kill.headshot,
      tick: kill.tick
    })
  }
  return out.slice(-KILL_FEED_MAX)
}

/** Grenade flight paths currently worth drawing (thin trail behind the dot). */
export function grenadeTrailAt(
  g: ReplayGrenade,
  tick: number
): { x: number; y: number }[] | null {
  const traj = g.trajectory
  if (traj.length === 0 || tick < traj[0].tick) return null
  const det = g.detonateTick ?? traj[traj.length - 1].tick
  if (tick >= det) return null
  return traj.filter((p) => p.tick <= tick).map((p) => ({ x: p.x, y: p.y }))
}
