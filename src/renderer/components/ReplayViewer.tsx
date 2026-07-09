import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReplayPayload } from '@shared/replay-types'
import { autoFitProjector, boundsOf } from '../replay/project'
import { roundTickRange, viewStateAt } from '../replay/playback'
import { DEFAULT_THEME, drawScene } from '../replay/draw'

const SPEEDS = [0.5, 1, 2, 4]

/**
 * Canvas 2D replay player. The pure modules (project/playback/draw) resolve
 * and paint one moment; this shell owns the RAF clock, round selection, and
 * the transport controls. The scrubber is uncontrolled and synced
 * imperatively each frame to avoid a per-frame React re-render.
 */
export function ReplayViewer({ payload }: { payload: ReplayPayload }): JSX.Element {
  const [roundIdx, setRoundIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrubberRef = useRef<HTMLInputElement | null>(null)
  const clockRef = useRef<HTMLSpanElement | null>(null)

  const tickRef = useRef(0)
  const playingRef = useRef(playing)
  const speedRef = useRef(speed)
  const roundIdxRef = useRef(roundIdx)
  playingRef.current = playing
  speedRef.current = speed

  const bounds = useMemo(() => boundsOf(payload), [payload])
  const range = useMemo(() => roundTickRange(payload.rounds[roundIdx]), [payload, roundIdx])

  // Round switch: reset the clock to the round's first tick.
  useEffect(() => {
    roundIdxRef.current = roundIdx
    tickRef.current = range.first
  }, [roundIdx, range])

  // RAF loop: advance game time, resolve the view, paint.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      width = container.clientWidth
      height = container.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    let raf = 0
    let lastTs = performance.now()
    const frame = (ts: number): void => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (ts - lastTs) / 1000)
      lastTs = ts

      const ri = roundIdxRef.current
      const round = payload.rounds[ri]
      const r = roundTickRange(round)

      if (playingRef.current) {
        tickRef.current += dt * payload.tickRate * speedRef.current
        if (tickRef.current > r.last) {
          if (ri < payload.rounds.length - 1) {
            setRoundIdx(ri + 1) // effect resets the clock
            tickRef.current = r.last
          } else {
            tickRef.current = r.last
            setPlaying(false)
          }
        }
      }
      const tick = Math.max(r.first, Math.min(r.last, tickRef.current))

      // Sync scrubber + clock without re-rendering React.
      if (scrubberRef.current && document.activeElement !== scrubberRef.current) {
        scrubberRef.current.value = String(Math.round(tick))
      }
      if (clockRef.current) {
        const sec = Math.max(0, (tick - round.startTick) / payload.tickRate)
        const total = Math.max(0, (r.last - round.startTick) / payload.tickRate)
        clockRef.current.textContent = `${fmt(sec)} / ${fmt(total)}`
      }

      ctx.clearRect(0, 0, width, height)
      const proj = autoFitProjector(bounds, width, height)
      const view = viewStateAt(payload, ri, tick)
      drawScene(ctx, view, proj, DEFAULT_THEME)
      drawHud(ctx, view, payload, ri, width)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [payload, bounds])

  const round = payload.rounds[roundIdx]

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative h-[520px] w-full overflow-hidden rounded-lg border border-border bg-zinc-950"
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            className="rounded-md border border-border px-2 py-1 text-sm hover:bg-accent disabled:opacity-40"
            onClick={() => setRoundIdx((i) => Math.max(0, i - 1))}
            disabled={roundIdx === 0}
          >
            ◀
          </button>
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={roundIdx}
            onChange={(e) => setRoundIdx(Number(e.target.value))}
          >
            {payload.rounds.map((r, i) => (
              <option key={r.round} value={i}>
                Round {r.round}
              </option>
            ))}
          </select>
          <button
            className="rounded-md border border-border px-2 py-1 text-sm hover:bg-accent disabled:opacity-40"
            onClick={() => setRoundIdx((i) => Math.min(payload.rounds.length - 1, i + 1))}
            disabled={roundIdx === payload.rounds.length - 1}
          >
            ▶
          </button>
        </div>

        <button
          className="w-20 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-accent"
          onClick={() => {
            // Replay the round if it already finished.
            if (!playing && tickRef.current >= range.last) tickRef.current = range.first
            setPlaying((p) => !p)
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>

        <button
          className="rounded-md border border-border px-3 py-1 text-sm tabular-nums hover:bg-accent"
          onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
          title="Playback speed"
        >
          {speed}×
        </button>

        <input
          ref={scrubberRef}
          type="range"
          min={range.first}
          max={range.last}
          step={1}
          defaultValue={range.first}
          className="min-w-40 flex-1 accent-zinc-400"
          onInput={(e) => {
            tickRef.current = Number((e.target as HTMLInputElement).value)
          }}
        />
        <span ref={clockRef} className="text-sm tabular-nums text-muted-foreground" />
      </div>

      <p className="text-xs text-muted-foreground">
        {payload.map} · round {round.round} of {payload.rounds.length} · auto-fit view (radar
        images not yet wired)
      </p>
    </div>
  )
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Kill feed (top right) + round result banner, drawn on the canvas. */
function drawHud(
  ctx: CanvasRenderingContext2D,
  view: ReturnType<typeof viewStateAt>,
  payload: ReplayPayload,
  roundIdx: number,
  width: number
): void {
  ctx.save()
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'right'
  let y = 18
  for (const k of view.killFeed) {
    const attacker = k.attacker ?? 'world'
    const text = `${attacker}  ${k.headshot ? '✱' : '›'} ${k.weapon ?? '?'} ›  ${k.victim}`
    ctx.fillStyle =
      k.attackerSide === 'CT' ? '#60a5fa' : k.attackerSide === 'T' ? '#fbbf24' : '#a1a1aa'
    ctx.fillText(text, width - 12, y)
    y += 15
  }

  if (view.roundOver) {
    ctx.textAlign = 'center'
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = view.roundOver.winner === 'CT' ? '#60a5fa' : '#fbbf24'
    const label =
      view.roundOver.winner !== null
        ? `${view.roundOver.winner} win — ${view.roundOver.reason.replace(/_/g, ' ')}`
        : 'round over'
    ctx.fillText(`Round ${payload.rounds[roundIdx].round}: ${label}`, width / 2, 24)
  }
  ctx.restore()
}
