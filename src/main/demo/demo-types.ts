// Raw shapes coming out of @laihoe/demoparser2, validated against a real
// matchmaking demo (de_ancient, patch 14098) via scripts/probe-demo.ts.
// CS2 patches have renamed event fields before — read defensively (see
// pick() in demo-parser.ts) and re-run the probe when something drifts.

export interface RosterEntry {
  name: string
  steamid: string
  /** Source team at match start: 2 = T, 3 = CT. */
  team_number: number
}

export interface RoundStartEvent {
  tick: number
}

export interface RoundEndEvent {
  tick: number
  winner: 'CT' | 'T' | string
  reason: string
}

export interface RoundFreezeEndEvent {
  tick: number
}

export interface PlayerDeathEvent {
  tick: number
  attacker_steamid: string | null
  user_steamid: string | null // victim
  assister_steamid: string | null
  assistedflash: boolean
  weapon: string | null // bare name, e.g. "ak47", "usp_silencer", "inferno"
  headshot: boolean
  thrusmoke: boolean
  attackerblind: boolean
  penetrated: number
  attacker_X: number | null
  attacker_Y: number | null
  user_X: number | null
  user_Y: number | null
}

export interface PlayerHurtEvent {
  tick: number
  attacker_steamid: string | null
  user_steamid: string | null
  weapon: string | null
  dmg_health: number
  hitgroup: string | null
}

export interface PlayerBlindEvent {
  tick: number
  attacker_steamid: string | null
  user_steamid: string | null
  blind_duration: number
}

export interface WeaponFireEvent {
  tick: number
  user_steamid: string | null
  weapon: string | null // prefixed, e.g. "weapon_ak47"
}

export interface BombPlantedEvent {
  tick: number
  user_steamid: string | null
  user_X: number | null
  user_Y: number | null
}

export interface BombDefusedEvent {
  tick: number
  user_steamid: string | null
  user_X: number | null
  user_Y: number | null
}

export interface BombCarryEvent {
  tick: number
  user_steamid: string | null
}

export interface GrenadeDetonateEvent {
  tick: number
  entityid: number
  user_steamid: string | null
  x: number
  y: number
  z: number
}

/** One row of parseTicks output for the props we request. */
export interface TickSample {
  tick: number
  steamid: string
  X: number
  Y: number
  yaw: number
  health: number
  is_alive: boolean
  active_weapon_name: string | null
  team_num: number // 2 = T, 3 = CT
  inventory: string[] | null
}

/** One row of parseGrenades output (projectile trajectories). */
export interface GrenadeTrajectoryRow {
  tick: number
  /** From `grenade_entity_id`; ids are recycled across rounds. */
  entity_id: number
  /** Projectile class, e.g. "CSmokeGrenadeProjectile". */
  grenade_type: string | null
  thrower_steamid: string | null
  x: number | null
  y: number | null
  z: number | null
}

/** Everything read from the .dem in one pass, before analysis/extraction. */
export interface ParsedDemo {
  demPath: string
  map: string
  tickRate: number
  roster: RosterEntry[]
  roundStarts: RoundStartEvent[]
  roundEnds: RoundEndEvent[]
  freezeEnds: RoundFreezeEndEvent[]
  deaths: PlayerDeathEvent[]
  hurts: PlayerHurtEvent[]
  blinds: PlayerBlindEvent[]
  shots: WeaponFireEvent[]
  plants: BombPlantedEvent[]
  defuses: BombDefusedEvent[]
  bombPickups: BombCarryEvent[]
  bombDrops: BombCarryEvent[]
  smokeDetonates: GrenadeDetonateEvent[]
  heDetonates: GrenadeDetonateEvent[]
  flashDetonates: GrenadeDetonateEvent[]
  infernoStarts: GrenadeDetonateEvent[]
  grenadeTrajectories: GrenadeTrajectoryRow[]
  /** Downsampled position samples covering each round's playback window. */
  ticks: TickSample[]
  /** Non-fatal oddities (empty collectors, missing fields) for the UI/log. */
  warnings: string[]
}
