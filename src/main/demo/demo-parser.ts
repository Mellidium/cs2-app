// @laihoe/demoparser2 wrapper. Query-style API: ask for specific events / tick
// data rather than streaming. A full competitive match parses in ~1 second.
//
// Stub — see the spec's "Post-Match Demo Enrichment" → "Source 2" for the
// available parse_event / parse_ticks queries.

import type { ParsedMatch } from './demo-types'

export async function parseDemo(_demPath: string, _steamId: string): Promise<ParsedMatch> {
  // Example shape once implemented:
  //   const { parseEvent, parseTicks } = await import('@laihoe/demoparser2')
  //   const deaths = parseEvent(demPath, 'player_death', [], ['X', 'Y', 'Z'])
  //   const hurts  = parseEvent(demPath, 'player_hurt')
  throw new Error('demo-parser: not yet implemented')
}
