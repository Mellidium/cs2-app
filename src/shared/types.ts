// Types shared between the Electron main process and the React renderer.
// Keep this file free of Node- or DOM-specific imports so both sides can use it.

import type { RadarAsset } from './radar-types'

export type RoundSide = 'CT' | 'T'
export type MatchResult = 'win' | 'loss' | 'draw' | 'in_progress'
export type MapPhase = 'warmup' | 'live' | 'gameover' | 'intermission'
export type RoundPhase = 'freezetime' | 'live' | 'over'

/** Trimmed live snapshot pushed to the renderer on every GSI update. */
export interface LiveGameState {
  steamId: string
  map: string | null
  mode: string | null
  mapPhase: MapPhase | null
  round: number | null
  roundPhase: RoundPhase | null
  ctScore: number
  tScore: number
  bombStatus: 'planted' | 'defused' | 'exploded' | null
  roundWinTeam: RoundSide | null
  player: {
    name: string | null
    team: RoundSide | null
    health: number
    armor: number
    helmet: boolean
    money: number
    equipValue: number
    activeWeapon: string | null
    activeWeaponType: string | null
    activeWeaponAmmoClip: number | null
    activeWeaponAmmoReserve: number | null
    roundKills: number
    roundHeadshots: number
    roundTotalDmg: number
    matchKills: number
    matchAssists: number
    matchDeaths: number
    matchMvps: number
    matchScore: number
  } | null
}

export interface MatchSummary {
  id: number
  steamId: string
  map: string
  mode: string | null
  startedAt: string
  endedAt: string | null
  ctScore: number
  tScore: number
  result: MatchResult
  demoParsed: boolean
}

export interface AggregateStats {
  matchesPlayed: number
  kills: number
  deaths: number
  assists: number
  kdRatio: number
  headshotPct: number
  winRate: number
  adr: number
  kastPct: number
}

export type DemoStage =
  | 'queued'
  | 'parsing'
  | 'analyzing'
  | 'extracting'
  | 'saving'
  | 'done'
  | 'failed'

export interface DemoProgress {
  /** Absolute path of the .dem being processed (stable key for the UI). */
  demPath: string
  stage: DemoStage
  message?: string
  /** Set once the demo row exists (from 'saving' onward). */
  demoId?: number
}

/** A parsed demo stored in the local database. */
export interface DemoSummary {
  id: number
  demPath: string
  fileName: string
  map: string
  rounds: number
  /** Rounds won by the team that started CT / started T. */
  ctStartScore: number
  tStartScore: number
  tickRate: number
  parsedAt: string
  hasReplay: boolean
}

/** An unparsed/parsed .dem found in the CS2 replays folder. */
export interface ReplayFolderEntry {
  demPath: string
  fileName: string
  sizeBytes: number
  modifiedAt: string
  /** Set when this file has already been parsed into the DB. */
  demoId: number | null
}

/** Per-player stats computed from one parsed demo (one row per player). */
export interface DemoPlayerStats {
  demoId: number
  steamId: string
  name: string
  startingSide: RoundSide | null
  won: boolean
  roundsPlayed: number
  kills: number
  deaths: number
  assists: number
  damage: number
  adr: number
  headshotKills: number
  headshotPct: number
  kastRounds: number
  kastPct: number
  tradeKills: number
  untradedDeaths: number
  openingKills: number
  openingDeaths: number
  multiKills2: number
  multiKills3: number
  multiKills4: number
  multiKills5: number
  clutch1v1Attempts: number
  clutch1v1Wins: number
  clutch1v2Attempts: number
  clutch1v2Wins: number
  flashesThrown: number
  enemiesFlashed: number
  enemyBlindDuration: number
  teamflashDuration: number
  flashAssists: number
  utilityDamage: number
  plants: number
  defuses: number
  /** CT/T splits for the core stats. */
  sideSplits: {
    CT: SideSplit
    T: SideSplit
  }
}

export interface SideSplit {
  rounds: number
  roundsWon: number
  kills: number
  deaths: number
  assists: number
  damage: number
}

/** The surface exposed on `window.electronAPI` by the preload bridge. */
export interface ElectronAPI {
  // Push (main → renderer)
  onGSIState: (cb: (state: LiveGameState) => void) => () => void
  onRoundEnd: (cb: (summary: unknown) => void) => () => void
  onMatchEnd: (cb: (summary: MatchSummary) => void) => () => void
  onDemoReady: (cb: (demoId: number) => void) => () => void
  onDemoProgress: (cb: (progress: DemoProgress) => void) => () => void

  // Request/response (renderer → main)
  getMatches: (steamId: string, limit?: number) => Promise<MatchSummary[]>
  getAggregateStats: (steamId: string) => Promise<AggregateStats>
  getSetupStatus: () => Promise<SetupStatus>

  // Demos
  scanReplaysFolder: () => Promise<ReplayFolderEntry[]>
  /** Parse a .dem; omit demPath to open a file picker. Resolves when queued. */
  importDemo: (demPath?: string) => Promise<{ queued: boolean; demPath?: string }>
  getDemos: () => Promise<DemoSummary[]>
  getDemoStats: (demoId: number) => Promise<DemoPlayerStats[]>
  /** Parsed replay payload (see shared/replay-types), or null if missing. */
  getDemoReplay: (demoId: number) => Promise<unknown | null>
  deleteDemo: (demoId: number) => Promise<void>
  /**
   * Radar image + calibration for a map (e.g. "de_dust2"), extracted on demand
   * from the local CS2 install. `null` when unavailable (no install, workshop
   * map, or offline during the one-time CLI download) — caller falls back to
   * the auto-fit view.
   */
  getRadar: (map: string) => Promise<RadarAsset | null>
}

export interface SetupStatus {
  platform: NodeJS.Platform
  cs2Found: boolean
  cfgWritten: boolean
  cfgPath: string | null
  needsCs2Restart: boolean
  message: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
