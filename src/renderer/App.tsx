import { useEffect, useState } from 'react'
import { useGSI } from './hooks/useGSI'
import { LivePanel } from './components/LivePanel'
import type { SetupStatus } from '@shared/types'

/**
 * Root layout. This is an intentionally minimal shell so the skeleton launches
 * and shows live GSI data — build out routing and the remaining panels
 * (MatchHistory, StatsOverview, ImprovementDash, DeathHeatmap, ...) from here.
 */
export default function App(): JSX.Element {
  const live = useGSI()
  const [setup, setSetup] = useState<SetupStatus | null>(null)

  useEffect(() => {
    window.electronAPI.getSetupStatus().then(setSetup)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">CS2 Companion</h1>
        <p className="text-sm text-muted-foreground">
          Live game-state integration &amp; post-match improvement analytics
        </p>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        {setup && (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            <span className="font-medium text-card-foreground">Setup:</span> {setup.message}
          </div>
        )}

        <LivePanel state={live} />

        <section className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Match history, stats overview, and improvement dashboards land here.
          <br />
          See <code className="text-card-foreground">cs2-companion-spec (1).md</code> §UI Panels.
        </section>
      </main>
    </div>
  )
}
