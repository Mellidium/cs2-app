// Computes improvement metrics from parsed demo data: opening duel win rate,
// trade kills, KAST per round, flash effectiveness, average death time,
// accuracy, death positions, utility damage, money wasted on losses.
//
// Stub — see the spec's "Improvement metrics explained" section for definitions.

import type { ParsedMatch } from './demo-types'

export interface ImprovementMetrics {
  steamId: string
  headshotPct: number
  openingDuelsTaken: number
  openingDuelsWon: number
  tradeKills: number
  kastPct: number
  adr: number
  // ...extend to match the match_improvement_stats table in the schema.
}

export function analyze(_match: ParsedMatch): ImprovementMetrics {
  throw new Error('demo-analyzer: not yet implemented')
}
