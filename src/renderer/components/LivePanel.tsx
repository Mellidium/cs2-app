import type { LiveGameState } from '@shared/types'

/**
 * Real-time HP / armor / money / round info, updated on every GSI push.
 * Serves as the worked example for the renderer ↔ IPC ↔ GSI data flow.
 */
export function LivePanel({ state }: { state: LiveGameState | null }): JSX.Element {
  if (!state || !state.player) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Waiting for live game data… Launch CS2 (or run{' '}
        <code className="text-card-foreground">npm run mock-gsi</code> in dev) to start receiving GSI
        updates.
      </div>
    )
  }

  const p = state.player
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{state.map ?? 'Unknown map'}</h2>
        <span className="text-sm text-muted-foreground">
          {state.mode ?? '—'} · Round {state.round ?? '—'} · CT {state.ctScore} : {state.tScore} T
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Health" value={p.health} />
        <Stat label="Armor" value={p.helmet ? `${p.armor} 🪖` : p.armor} />
        <Stat label="Money" value={`$${p.money}`} />
        <Stat label="Equipment" value={`$${p.equipValue}`} />
        <Stat label="Round K" value={`${p.roundKills} (${p.roundHeadshots} hs)`} />
        <Stat label="Match K/D/A" value={`${p.matchKills}/${p.matchDeaths}/${p.matchAssists}`} />
        <Stat label="Team" value={p.team ?? '—'} />
        <Stat label="Weapon" value={p.activeWeapon?.replace('weapon_', '') ?? '—'} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}
