// Types shared between the Electron main process and the React renderer.
// Keep this file free of Node- or DOM-specific imports so both sides can use it.

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

export type DemoStage = 'downloading' | 'parsing' | 'analyzing'

export interface DemoProgress {
  matchId: number
  stage: DemoStage
}

/** The surface exposed on `window.electronAPI` by the preload bridge. */
export interface ElectronAPI {
  // Push (main → renderer)
  onGSIState: (cb: (state: LiveGameState) => void) => () => void
  onRoundEnd: (cb: (summary: unknown) => void) => () => void
  onMatchEnd: (cb: (summary: MatchSummary) => void) => () => void
  onDemoReady: (cb: (matchId: number) => void) => () => void
  onDemoProgress: (cb: (progress: DemoProgress) => void) => () => void

  // Request/response (renderer → main)
  getMatches: (steamId: string, limit?: number) => Promise<MatchSummary[]>
  getAggregateStats: (steamId: string) => Promise<AggregateStats>
  getSetupStatus: () => Promise<SetupStatus>
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
