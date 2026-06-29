// Types for parsed demo data. These mirror the event/tick shapes returned by
// @laihoe/demoparser2 (parse_event / parse_ticks). Refine field names against
// the actual parser output as the pipeline is built out.

export interface PlayerDeathEvent {
  tick: number
  attacker_steamid?: string
  user_steamid?: string // victim
  weapon?: string
  headshot?: boolean
  penetrated?: number
  thrusmoke?: boolean
  attackerblind?: boolean
  assister_steamid?: string
  assistedflash?: boolean
  attacker_X?: number
  attacker_Y?: number
  attacker_Z?: number
  user_X?: number
  user_Y?: number
  user_Z?: number
}

export interface PlayerHurtEvent {
  tick: number
  attacker_steamid?: string
  user_steamid?: string
  weapon?: string
  dmg_health?: number
  dmg_armor?: number
  hitgroup?: string
}

export interface ParsedMatch {
  steamId: string
  map: string
  deaths: PlayerDeathEvent[]
  hurts: PlayerHurtEvent[]
  // grenades, weapon_fire, round boundaries, etc. added as the analyzer grows.
}
