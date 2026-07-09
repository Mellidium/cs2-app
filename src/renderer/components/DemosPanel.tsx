import { useCallback, useEffect, useState } from 'react'
import type { DemoPlayerStats, DemoProgress, DemoSummary, ReplayFolderEntry } from '@shared/types'
import type { ReplayPayload } from '@shared/replay-types'
import { DemoScoreboard } from './DemoScoreboard'
import { ReplayViewer } from './ReplayViewer'

/**
 * Demo review: scan the CS2 replays folder (or import any .dem), run the
 * parse → analyze → extract pipeline, then browse the scoreboard and the 2D
 * replay for each parsed demo.
 */
export function DemosPanel(): JSX.Element {
  const [folder, setFolder] = useState<ReplayFolderEntry[]>([])
  const [demos, setDemos] = useState<DemoSummary[]>([])
  const [progress, setProgress] = useState<Map<string, DemoProgress>>(new Map())
  const [selected, setSelected] = useState<DemoSummary | null>(null)
  const [stats, setStats] = useState<DemoPlayerStats[]>([])
  const [replay, setReplay] = useState<ReplayPayload | null>(null)
  const [tab, setTab] = useState<'scoreboard' | 'replay'>('scoreboard')
  const [replayLoading, setReplayLoading] = useState(false)

  const refresh = useCallback(async () => {
    const [f, d] = await Promise.all([
      window.electronAPI.scanReplaysFolder(),
      window.electronAPI.getDemos()
    ])
    setFolder(f)
    setDemos(d)
  }, [])

  useEffect(() => {
    void refresh()
    const offProgress = window.electronAPI.onDemoProgress((p) => {
      setProgress((prev) => new Map(prev).set(p.demPath, p))
      if (p.stage === 'done') void refresh()
    })
    return offProgress
  }, [refresh])

  const openDemo = useCallback(async (demo: DemoSummary) => {
    setSelected(demo)
    setTab('scoreboard')
    setReplay(null)
    setStats(await window.electronAPI.getDemoStats(demo.id))
  }, [])

  const openReplay = useCallback(async () => {
    if (!selected) return
    setTab('replay')
    if (!replay) {
      setReplayLoading(true)
      try {
        const payload = (await window.electronAPI.getDemoReplay(selected.id)) as ReplayPayload | null
        setReplay(payload)
      } finally {
        setReplayLoading(false)
      }
    }
  }, [selected, replay])

  const activeJobs = [...progress.values()].filter(
    (p) => p.stage !== 'done' && p.stage !== 'failed'
  )

  return (
    <div className="space-y-6">
      {/* Import sources */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">CS2 replays folder</h2>
            <p className="text-xs text-muted-foreground">
              Demos downloaded in-game (Watch → Your Matches → Download) appear here.
            </p>
          </div>
          <button
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            onClick={() => void window.electronAPI.importDemo()}
          >
            Import .dem…
          </button>
        </div>

        {folder.length === 0 ? (
          <p className="text-sm text-muted-foreground">No .dem files found.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {folder.map((f) => {
              const job = progress.get(f.demPath)
              const busy = job && job.stage !== 'done' && job.stage !== 'failed'
              return (
                <li key={f.demPath} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.fileName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {(f.sizeBytes / 1e6).toFixed(0)} MB ·{' '}
                    {new Date(f.modifiedAt).toLocaleDateString()}
                  </span>
                  {busy ? (
                    <span className="shrink-0 animate-pulse text-xs text-yellow-400">
                      {job.stage}…
                    </span>
                  ) : job?.stage === 'failed' ? (
                    <span className="shrink-0 text-xs text-red-400" title={job.message}>
                      failed
                    </span>
                  ) : null}
                  {!busy && (
                    <button
                      className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                      onClick={() => void window.electronAPI.importDemo(f.demPath)}
                    >
                      {f.demoId ? 'Re-parse' : 'Parse'}
                    </button>
                  )}
                  {f.demoId && (
                    <button
                      className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                      onClick={() => {
                        const demo = demos.find((d) => d.id === f.demoId)
                        if (demo) void openDemo(demo)
                      }}
                    >
                      View
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {activeJobs.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Parsing runs in the background — the UI stays live.
          </p>
        )}
      </section>

      {/* Parsed demos */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Parsed demos</h2>
        {demos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing parsed yet — hit Parse on a demo above.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {demos.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                <button
                  className={`min-w-0 flex-1 truncate text-left hover:underline ${
                    selected?.id === d.id ? 'font-semibold' : ''
                  }`}
                  onClick={() => void openDemo(d)}
                >
                  <span className="font-medium">{d.map}</span>{' '}
                  <span className="tabular-nums text-muted-foreground">
                    {d.ctStartScore} : {d.tStartScore}
                  </span>{' '}
                  <span className="text-xs text-muted-foreground">
                    · {d.rounds} rounds · parsed {new Date(d.parsedAt + 'Z').toLocaleString()}
                  </span>
                </button>
                <button
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-red-400 hover:bg-accent"
                  onClick={() => {
                    void window.electronAPI.deleteDemo(d.id).then(() => {
                      if (selected?.id === d.id) setSelected(null)
                      void refresh()
                    })
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Detail */}
      {selected && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                {selected.map}{' '}
                <span className="tabular-nums text-muted-foreground">
                  {selected.ctStartScore} : {selected.tStartScore}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">{selected.fileName}</p>
            </div>
            <div className="flex gap-1 rounded-md border border-border p-0.5">
              <button
                className={`rounded px-3 py-1 text-sm ${tab === 'scoreboard' ? 'bg-accent font-medium' : 'text-muted-foreground'}`}
                onClick={() => setTab('scoreboard')}
              >
                Scoreboard
              </button>
              <button
                className={`rounded px-3 py-1 text-sm ${tab === 'replay' ? 'bg-accent font-medium' : 'text-muted-foreground'}`}
                onClick={() => void openReplay()}
              >
                2D Replay
              </button>
            </div>
          </div>

          {tab === 'scoreboard' && <DemoScoreboard demo={selected} stats={stats} />}
          {tab === 'replay' &&
            (replayLoading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">loading replay…</p>
            ) : replay ? (
              <ReplayViewer payload={replay} />
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No replay payload for this demo — try re-parsing.
              </p>
            ))}
        </section>
      )}
    </div>
  )
}
