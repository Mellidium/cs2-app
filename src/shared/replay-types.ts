// The replay payload contract — the single shape the demo extractor (main
// process), the on-disk `<demoId>.replay.json.gz` artifact, and the renderer's
// 2D replay player all agree on. Keep this file free of Node/DOM imports.
//
// Positions are raw CS2 world units; the renderer projects them to canvas px
// (auto-fit today, radar-calibrated later — see renderer/replay/project.ts).

export type Side = 'CT' | 'T'

/** Bump on incompatible shape changes; the player refuses unknown versions. */
export const REPLAY_SCHEMA_VERSION = 1

/** Playback cadence after downsampling (frames per second of game time). */
export const REPLAY_FRAME_RATE = 16

export interface ReplayPayload {
  version: number // === REPLAY_SCHEMA_VERSION
  map: string
  /** Engine ticks per second (CS2 matchmaking: 64). */
  tickRate: number
  /** Frames per second after downsampling — playback cadence. */
  frameRate: number
  /** Roster metadata. Frames/events reference players by index into this array. */
  players: ReplayPlayerMeta[]
  rounds: ReplayRound[]
}

export interface ReplayPlayerMeta {
  id: number // index into ReplayPayload.players
  name: string
  steamId: string
}

export interface ReplayRound {
  /** 1-based round number. */
  round: number
  startTick: number // round_start
  /** round_end tick — frames extend past this by the post-round window. */
  endTick: number
  /** Side each rostered player played this round (index-aligned with players). */
  sides: (Side | null)[]
  /** Positional snapshots, freeze-time trimmed, downsampled to frameRate. */
  frames: ReplayFrame[]
  /** Kills/plants/defuses/round end — powers the timeline and kill feed. */
  events: ReplayEvent[]
  grenades: ReplayGrenade[]
  /** One entry per bullet fired — drives tracers (ray cast at render time). */
  shots: ReplayShot[]
  /** Flash events — drive the per-player whiteout overlay. */
  blinds: ReplayBlind[]
  /** Damage events — drive the per-player red damage blink. */
  hurts: ReplayHurt[]
  /**
   * Bomb-carrier change-points, tick-ordered. First entry is the round-start
   * seed (who holds the C4 at the first rendered tick); later entries come from
   * bomb_pickup / bomb_dropped. `carrierId: null` = dropped on the ground.
   */
  bombCarrier: BombCarrierPoint[]
}

export interface ReplayFrame {
  tick: number
  /** Sparse: only players present at this tick. */
  players: ReplayPlayerFrame[]
}

export interface ReplayPlayerFrame {
  id: number
  x: number
  y: number
  /** Facing direction in degrees (eye yaw). */
  yaw: number
  hp: number
  alive: boolean
  /** Active weapon display name (e.g. "AK-47"), null if unknown/dead. */
  weapon: string | null
}

export interface BombCarrierPoint {
  tick: number
  carrierId: number | null
}

export interface ReplayShot {
  tick: number
  shooterId: number
}

export interface ReplayBlind {
  tick: number
  playerId: number
  /** Seconds blinded; the whiteout fades back to team color over this. */
  duration: number
}

export interface ReplayHurt {
  tick: number
  playerId: number
}

export type ReplayEvent =
  | ReplayKillEvent
  | ReplayPlantEvent
  | ReplayDefuseEvent
  | ReplayRoundEndEvent

export interface ReplayKillEvent {
  type: 'kill'
  tick: number
  attackerId: number | null // null = world/suicide
  victimId: number
  assisterId: number | null
  weapon: string | null
  headshot: boolean
  attacker: { x: number; y: number } | null
  victim: { x: number; y: number } | null
}

export interface ReplayPlantEvent {
  type: 'plant'
  tick: number
  playerId: number | null
  x: number
  y: number
}

export interface ReplayDefuseEvent {
  type: 'defuse'
  tick: number
  playerId: number | null
  x: number
  y: number
}

export interface ReplayRoundEndEvent {
  type: 'round_end'
  tick: number
  winner: Side | null
  /** Engine reason string, e.g. `t_killed`, `bomb_defused`, `target_bombed`. */
  reason: string
}

export type GrenadeKind = 'smoke' | 'flashbang' | 'he' | 'molotov' | 'incendiary' | 'decoy'

export interface ReplayGrenade {
  type: GrenadeKind
  throwerId: number | null
  /** Downsampled flight path (world units). */
  trajectory: { tick: number; x: number; y: number; z: number }[]
  /** Tick the projectile reaches its resting position (bloom starts here). */
  detonateTick: number | null
}
