// @laihoe/demoparser2 wrapper. Query-style API: each call scans the .dem, so
// the parse is batched into as few scans as possible (events, ticks, grenades).
// A full competitive match parses in a few seconds; this runs in the demo
// worker thread, never on the Electron main thread.

import { basename } from 'node:path'
import type {
  BombCarryEvent,
  BombDefusedEvent,
  BombPlantedEvent,
  GrenadeDetonateEvent,
  GrenadeTrajectoryRow,
  ParsedDemo,
  PlayerBlindEvent,
  PlayerDeathEvent,
  PlayerHurtEvent,
  RosterEntry,
  RoundEndEvent,
  TickSample,
  WeaponFireEvent
} from './demo-types'
import { buildPlaybackWindows, frameStep } from './match-context'

/** CS2 matchmaking demos are 64 tick; the header does not carry a tick rate. */
export const TICK_RATE = 64

const EVENT_NAMES = [
  'round_start',
  'round_end',
  'round_freeze_end',
  'player_death',
  'player_hurt',
  'player_blind',
  'weapon_fire',
  'bomb_planted',
  'bomb_defused',
  'bomb_pickup',
  'bomb_dropped',
  'smokegrenade_detonate',
  'hegrenade_detonate',
  'flashbang_detonate',
  'inferno_startburn'
]

const TICK_PROPS = [
  'X',
  'Y',
  'yaw',
  'health',
  'is_alive',
  'active_weapon_name',
  'team_num'
]

type Row = Record<string, unknown>

/** Read the first present candidate key — CS2 patches have renamed fields. */
function pick<T>(row: Row, candidates: string[], fallback: T): T {
  for (const key of candidates) {
    const v = row[key]
    if (v !== undefined && v !== null) return v as T
  }
  return fallback
}

const num = (row: Row, keys: string[]): number => pick<number>(row, keys, 0)
const numOrNull = (row: Row, keys: string[]): number | null => pick<number | null>(row, keys, null)
const str = (row: Row, keys: string[]): string | null => pick<string | null>(row, keys, null)
const bool = (row: Row, keys: string[]): boolean => Boolean(pick(row, keys, false))

function detonate(row: Row): GrenadeDetonateEvent {
  return {
    tick: num(row, ['tick']),
    entityid: num(row, ['entityid', 'entity_id']),
    user_steamid: str(row, ['user_steamid']),
    x: num(row, ['x', 'X']),
    y: num(row, ['y', 'Y']),
    z: num(row, ['z', 'Z'])
  }
}

export async function parseDemo(demPath: string): Promise<ParsedDemo> {
  const { parseHeader, parseEvents, parseTicks, parsePlayerInfo, parseGrenades } = await import(
    '@laihoe/demoparser2'
  )
  const warnings: string[] = []

  const header = parseHeader(demPath) as Row
  const map = (header['map_name'] as string) ?? 'unknown'

  const rosterRows = (parsePlayerInfo(demPath) as Row[]) ?? []
  const roster: RosterEntry[] = rosterRows
    .filter((r) => {
      const id = r['steamid']
      const team = r['team_number']
      return typeof id === 'string' && id.length > 5 && (team === 2 || team === 3)
    })
    .map((r) => ({
      name: (r['name'] as string) ?? 'unknown',
      steamid: r['steamid'] as string,
      team_number: r['team_number'] as number
    }))
  if (roster.length === 0) warnings.push('roster: parsePlayerInfo returned no human players')

  // One scan for every event type, with X/Y attached to user/attacker/assister.
  const allEvents = (parseEvents(demPath, EVENT_NAMES, ['X', 'Y']) as Row[]) ?? []
  const byName = new Map<string, Row[]>()
  for (const row of allEvents) {
    const name = row['event_name'] as string
    let bucket = byName.get(name)
    if (!bucket) byName.set(name, (bucket = []))
    bucket.push(row)
  }
  const events = (name: string): Row[] => {
    const rows = byName.get(name) ?? []
    if (rows.length === 0) warnings.push(`events: no ${name} events captured`)
    return rows
  }

  const roundStarts = events('round_start').map((r) => ({ tick: num(r, ['tick']) }))
  const roundEnds: RoundEndEvent[] = events('round_end').map((r) => ({
    tick: num(r, ['tick']),
    winner: str(r, ['winner']) ?? '',
    reason: str(r, ['reason']) ?? ''
  }))
  const freezeEnds = events('round_freeze_end').map((r) => ({ tick: num(r, ['tick']) }))

  const deaths: PlayerDeathEvent[] = events('player_death').map((r) => ({
    tick: num(r, ['tick']),
    attacker_steamid: str(r, ['attacker_steamid']),
    user_steamid: str(r, ['user_steamid']),
    assister_steamid: str(r, ['assister_steamid']),
    assistedflash: bool(r, ['assistedflash']),
    weapon: str(r, ['weapon']),
    headshot: bool(r, ['headshot']),
    thrusmoke: bool(r, ['thrusmoke']),
    attackerblind: bool(r, ['attackerblind']),
    penetrated: num(r, ['penetrated']),
    attacker_X: numOrNull(r, ['attacker_X']),
    attacker_Y: numOrNull(r, ['attacker_Y']),
    user_X: numOrNull(r, ['user_X']),
    user_Y: numOrNull(r, ['user_Y'])
  }))

  const hurts: PlayerHurtEvent[] = events('player_hurt').map((r) => ({
    tick: num(r, ['tick']),
    attacker_steamid: str(r, ['attacker_steamid']),
    user_steamid: str(r, ['user_steamid']),
    weapon: str(r, ['weapon']),
    dmg_health: num(r, ['dmg_health']),
    hitgroup: str(r, ['hitgroup'])
  }))

  const blinds: PlayerBlindEvent[] = events('player_blind').map((r) => ({
    tick: num(r, ['tick']),
    attacker_steamid: str(r, ['attacker_steamid']),
    user_steamid: str(r, ['user_steamid']),
    blind_duration: num(r, ['blind_duration'])
  }))

  const shots: WeaponFireEvent[] = events('weapon_fire').map((r) => ({
    tick: num(r, ['tick']),
    user_steamid: str(r, ['user_steamid']),
    weapon: str(r, ['weapon'])
  }))

  const plants: BombPlantedEvent[] = events('bomb_planted').map((r) => ({
    tick: num(r, ['tick']),
    user_steamid: str(r, ['user_steamid']),
    user_X: numOrNull(r, ['user_X']),
    user_Y: numOrNull(r, ['user_Y'])
  }))

  const defuses: BombDefusedEvent[] = events('bomb_defused').map((r) => ({
    tick: num(r, ['tick']),
    user_steamid: str(r, ['user_steamid']),
    user_X: numOrNull(r, ['user_X']),
    user_Y: numOrNull(r, ['user_Y'])
  }))

  const carry = (r: Row): BombCarryEvent => ({
    tick: num(r, ['tick']),
    user_steamid: str(r, ['user_steamid'])
  })
  const bombPickups = events('bomb_pickup').map(carry)
  const bombDrops = events('bomb_dropped').map(carry)

  const smokeDetonates = events('smokegrenade_detonate').map(detonate)
  const heDetonates = events('hegrenade_detonate').map(detonate)
  const flashDetonates = events('flashbang_detonate').map(detonate)
  const infernoStarts = events('inferno_startburn').map(detonate)

  // Downsampled position samples, restricted to each round's playback window
  // (freeze time trimmed) so the tick scan returns a fraction of the match.
  const windows = buildPlaybackWindows(roundStarts, roundEnds, freezeEnds, TICK_RATE)
  const step = frameStep(TICK_RATE)
  const wantedTicks: number[] = []
  for (const w of windows) {
    for (let t = w.firstTick; t <= w.lastTick; t += step) wantedTicks.push(t)
  }

  let ticks: TickSample[] = []
  if (wantedTicks.length > 0) {
    const rows = (parseTicks(demPath, TICK_PROPS, wantedTicks) as Row[]) ?? []
    ticks = rows
      .filter((r) => typeof r['steamid'] === 'string')
      .map((r) => ({
        tick: num(r, ['tick']),
        steamid: r['steamid'] as string,
        X: num(r, ['X']),
        Y: num(r, ['Y']),
        yaw: num(r, ['yaw']),
        health: num(r, ['health']),
        is_alive: bool(r, ['is_alive']),
        active_weapon_name: str(r, ['active_weapon_name']),
        team_num: num(r, ['team_num']),
        inventory: null
      }))
  }
  if (ticks.length === 0) warnings.push('ticks: parseTicks returned no samples')

  // Bomb-carrier seed: who holds the C4 at each round's first rendered tick.
  // Separate cheap query so the main tick pull doesn't carry inventory arrays.
  const seedTicks = windows.map((w) => w.firstTick)
  if (seedTicks.length > 0) {
    const seedRows = (parseTicks(demPath, ['inventory'], seedTicks) as Row[]) ?? []
    const bySeed = new Map<string, string[]>()
    for (const r of seedRows) {
      const inv = r['inventory']
      if (typeof r['steamid'] === 'string' && Array.isArray(inv)) {
        bySeed.set(`${r['tick']}:${r['steamid']}`, inv as string[])
      }
    }
    for (const t of ticks) {
      const inv = bySeed.get(`${t.tick}:${t.steamid}`)
      if (inv) t.inventory = inv
    }
  }

  let grenadeTrajectories: GrenadeTrajectoryRow[] = []
  try {
    // grenades=false → projectile entities only (C*Projectile rows). Without it
    // the result also tracks grenades *held* in players' hands every tick.
    const rows = (parseGrenades(demPath, null, false) as Row[]) ?? []
    grenadeTrajectories = rows
      .filter((r) => r['x'] != null && r['y'] != null)
      .map((r) => ({
        tick: num(r, ['tick']),
        // NB: the field really is grenade_entity_id; `name` is the THROWER's name.
        entity_id: num(r, ['grenade_entity_id', 'entity_id', 'entityid']),
        grenade_type: str(r, ['grenade_type']),
        thrower_steamid: str(r, ['steamid', 'thrower_steamid', 'user_steamid']),
        x: numOrNull(r, ['x', 'X']),
        y: numOrNull(r, ['y', 'Y']),
        z: numOrNull(r, ['z', 'Z'])
      }))
  } catch (err) {
    warnings.push(`grenades: parseGrenades failed (${(err as Error).message})`)
  }
  if (grenadeTrajectories.length === 0) warnings.push('grenades: no trajectories captured')

  return {
    demPath,
    map,
    tickRate: TICK_RATE,
    roster,
    roundStarts,
    roundEnds,
    freezeEnds,
    deaths,
    hurts,
    blinds,
    shots,
    plants,
    defuses,
    bombPickups,
    bombDrops,
    smokeDetonates,
    heDetonates,
    flashDetonates,
    infernoStarts,
    grenadeTrajectories,
    ticks,
    warnings
  }
}

export function demoDisplayName(demPath: string): string {
  return basename(demPath)
}
