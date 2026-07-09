import type { DemoPlayerStats, DemoSummary } from '@shared/types'

/**
 * Per-player table for one parsed demo, split by starting side. Full-width
 * with horizontal scroll — the improvement metrics matter more than fitting
 * every column on screen.
 */
export function DemoScoreboard({
  demo,
  stats
}: {
  demo: DemoSummary
  stats: DemoPlayerStats[]
}): JSX.Element {
  const ctStart = stats.filter((s) => s.startingSide === 'CT').sort((a, b) => b.adr - a.adr)
  const tStart = stats.filter((s) => s.startingSide !== 'CT').sort((a, b) => b.adr - a.adr)

  return (
    <div className="space-y-4">
      <Team
        label={`Started CT — ${demo.ctStartScore} rounds`}
        color="text-blue-400"
        players={ctStart}
        won={demo.ctStartScore > demo.tStartScore}
      />
      <Team
        label={`Started T — ${demo.tStartScore} rounds`}
        color="text-amber-400"
        players={tStart}
        won={demo.tStartScore > demo.ctStartScore}
      />
    </div>
  )
}

function Team({
  label,
  color,
  players,
  won
}: {
  label: string
  color: string
  players: DemoPlayerStats[]
  won: boolean
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className={`text-sm font-semibold ${color}`}>{label}</span>
        {won && (
          <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-xs font-medium text-green-400">
            winner
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted-foreground [&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left">
              <th>Player</th>
              <th>K</th>
              <th>D</th>
              <th>A</th>
              <th title="Average damage per round">ADR</th>
              <th title="Headshot kill %">HS%</th>
              <th title="Kill / Assist / Survive / Traded rounds">KAST%</th>
              <th title="Opening kills / opening deaths">Open</th>
              <th title="Kills avenging a fresh teammate death">Trades</th>
              <th title="Deaths no teammate answered within 5s">Untrd</th>
              <th title="Multi-kill rounds: 2k / 3k / 4k / ace">Multi</th>
              <th title="Clutch wins/attempts: 1v1 · 1v2">Clutch</th>
              <th title="Kills on enemies you flashed">FA</th>
              <th title="Seconds of enemy blindness dealt">Blind s</th>
              <th title="Seconds you blinded your own team (lower is better)">TeamFl s</th>
              <th title="HE + fire damage">Util</th>
              <th title="Bomb plants / defuses">P/D</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr
                key={p.steamId}
                className="border-t border-border/60 [&>td]:px-3 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left"
              >
                <td className="font-medium">{p.name}</td>
                <td>{p.kills}</td>
                <td>{p.deaths}</td>
                <td>{p.assists}</td>
                <td>{p.adr.toFixed(1)}</td>
                <td>{p.headshotPct.toFixed(0)}</td>
                <td>{p.kastPct.toFixed(0)}</td>
                <td>
                  {p.openingKills}/{p.openingDeaths}
                </td>
                <td>{p.tradeKills}</td>
                <td>{p.untradedDeaths}</td>
                <td>
                  {p.multiKills2}/{p.multiKills3}/{p.multiKills4}/{p.multiKills5}
                </td>
                <td>
                  {p.clutch1v1Wins}/{p.clutch1v1Attempts} · {p.clutch1v2Wins}/
                  {p.clutch1v2Attempts}
                </td>
                <td>{p.flashAssists}</td>
                <td>{p.enemyBlindDuration.toFixed(1)}</td>
                <td className={p.teamflashDuration > 10 ? 'text-red-400' : ''}>
                  {p.teamflashDuration.toFixed(1)}
                </td>
                <td>{p.utilityDamage}</td>
                <td>
                  {p.plants}/{p.defuses}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
