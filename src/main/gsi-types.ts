// TypeScript shapes for the raw GSI payload CS2 POSTs to the listener.
// Every block is optional: CS2 only sends what is enabled in the .cfg and what
// is relevant to the current game phase. See the spec's "GSI Payload" section.

export interface GSIProvider {
  name?: string
  appid?: number
  version?: number
  steamid?: string
  timestamp?: number
}

export interface GSIMap {
  name?: string
  mode?: string
  phase?: 'warmup' | 'live' | 'gameover' | 'intermission'
  round?: number
  team_ct?: { score?: number }
  team_t?: { score?: number }
}

export interface GSIRound {
  phase?: 'freezetime' | 'live' | 'over'
  win_team?: 'CT' | 'T'
  bomb?: 'planted' | 'defused' | 'exploded'
}

export interface GSIPlayerState {
  health?: number
  armor?: number
  helmet?: boolean
  money?: number
  equip_value?: number
  round_kills?: number
  round_killhs?: number
  round_totaldmg?: number
}

export interface GSIWeapon {
  name?: string
  type?: string
  state?: 'active' | 'holstered' | 'reloading'
  ammo_clip?: number
  ammo_reserve?: number
}

export interface GSIPlayer {
  steamid?: string
  name?: string
  team?: 'CT' | 'T'
  state?: GSIPlayerState
  weapons?: Record<string, GSIWeapon>
  match_stats?: {
    kills?: number
    assists?: number
    deaths?: number
    mvps?: number
    score?: number
  }
}

export interface GSIPayload {
  provider?: GSIProvider
  map?: GSIMap
  round?: GSIRound
  player?: GSIPlayer
  auth?: { token?: string }
  previously?: Partial<GSIPayload>
  added?: Partial<GSIPayload>
}
