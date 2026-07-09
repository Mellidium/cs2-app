// Round structure shared by the analyzer and the replay extractor.
//
// Round-counter gotcha (learned from community demo-parsing work): round
// counters on events are inconsistent — `round_end` carries the round that just
// ended while mid-round events carry rounds completed so far, and kills can
// land in the post-round window after the counter has already bumped. So
// nothing here trusts an event's round counter: every event is bucketed by
// tick into windows derived from round_start/round_end ticks.

import { REPLAY_FRAME_RATE, type Side } from '@shared/replay-types'
import type { ParsedDemo, RoundEndEvent, RoundStartEvent, RoundFreezeEndEvent } from './demo-types'

/** Seconds of freeze time kept before round_freeze_end (context, not dead air). */
const PRE_LIVE_SECONDS = 1
/** Seconds kept after round_end so post-round kills/saves stay visible. */
const POST_ROUND_SECONDS = 7

export function frameStep(tickRate: number): number {
  return Math.max(1, Math.round(tickRate / REPLAY_FRAME_RATE))
}

export interface RoundWindow {
  round: number // 1-based
  startTick: number // round_start
  freezeEndTick: number | null
  endTick: number // round_end
  /** First tick rendered in the replay (freeze trimmed). */
  firstTick: number
  /** Last tick rendered (post-round, capped at the next round_start). */
  lastTick: number
  /** Everything in [startTick, nextStartTick) belongs to this round. */
  nextStartTick: number
  winner: Side | null
  reason: string
}

/**
 * Pairs each round_end with the latest round_start before it. Warmup restarts
 * produce round_starts with no round_end before the next start — those drop
 * out naturally.
 */
export function buildPlaybackWindows(
  roundStarts: RoundStartEvent[],
  roundEnds: RoundEndEvent[],
  freezeEnds: RoundFreezeEndEvent[],
  tickRate: number
): RoundWindow[] {
  const starts = [...roundStarts].sort((a, b) => a.tick - b.tick)
  const ends = [...roundEnds].sort((a, b) => a.tick - b.tick)
  const freezes = [...freezeEnds].sort((a, b) => a.tick - b.tick)

  const windows: RoundWindow[] = []
  for (const end of ends) {
    let startTick: number | null = null
    for (const s of starts) {
      if (s.tick <= end.tick) startTick = s.tick
      else break
    }
    if (startTick === null) continue
    // A restart between this start and end would pair two ends to one start;
    // keep only the first pairing.
    if (windows.some((w) => w.startTick === startTick)) continue

    let freezeEndTick: number | null = null
    for (const f of freezes) {
      if (f.tick >= startTick && f.tick <= end.tick) {
        freezeEndTick = f.tick
        break
      }
    }

    windows.push({
      round: windows.length + 1,
      startTick,
      freezeEndTick,
      endTick: end.tick,
      firstTick: 0, // filled below
      lastTick: 0,
      nextStartTick: Number.MAX_SAFE_INTEGER,
      winner: end.winner === 'CT' || end.winner === 'T' ? end.winner : null,
      reason: end.reason
    })
  }

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]
    const nextStart = starts.find((s) => s.tick > w.startTick + 1 && s.tick > w.endTick)
    w.nextStartTick = nextStart ? nextStart.tick : Number.MAX_SAFE_INTEGER
    // Without a round_freeze_end keep the full freeze time (better too much
    // than a replay that starts mid-action).
    w.firstTick =
      w.freezeEndTick !== null
        ? Math.max(w.startTick, w.freezeEndTick - PRE_LIVE_SECONDS * tickRate)
        : w.startTick
    w.lastTick = Math.min(w.endTick + POST_ROUND_SECONDS * tickRate, w.nextStartTick - 1)
  }
  return windows
}

export interface MatchContext {
  tickRate: number
  windows: RoundWindow[]
  /** steamid → side per round (1-based index 0 = round 1). */
  sidesByRound: Map<string, Side>[]
  roundOfTick: (tick: number) => RoundWindow | null
}

export function buildMatchContext(demo: ParsedDemo): MatchContext {
  const windows = buildPlaybackWindows(
    demo.roundStarts,
    demo.roundEnds,
    demo.freezeEnds,
    demo.tickRate
  )

  // Sides per round from the first position sample of each player in the
  // round's window — no half-time/OT math, works for any format.
  const sidesByRound: Map<string, Side>[] = windows.map(() => new Map())
  const seen: Set<string>[] = windows.map(() => new Set())
  const sorted = [...demo.ticks].sort((a, b) => a.tick - b.tick)
  let wi = 0
  for (const t of sorted) {
    while (wi < windows.length && t.tick > windows[wi].lastTick) wi++
    if (wi >= windows.length) break
    const w = windows[wi]
    if (t.tick < w.firstTick) continue
    if (seen[wi].has(t.steamid)) continue
    seen[wi].add(t.steamid)
    if (t.team_num === 2) sidesByRound[wi].set(t.steamid, 'T')
    else if (t.team_num === 3) sidesByRound[wi].set(t.steamid, 'CT')
  }

  const roundOfTick = (tick: number): RoundWindow | null => {
    for (const w of windows) {
      if (tick >= w.startTick && tick < w.nextStartTick) return w
    }
    return null
  }

  return { tickRate: demo.tickRate, windows, sidesByRound, roundOfTick }
}
