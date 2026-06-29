import type { GSIConnectionStatus } from '../hooks/useGSI'

const META: Record<GSIConnectionStatus, { label: string; dot: string; pulse: boolean }> = {
  waiting: { label: 'Waiting for GSI', dot: 'bg-zinc-500', pulse: false },
  live: { label: 'Receiving live data', dot: 'bg-green-500', pulse: true },
  idle: { label: 'Connected · idle', dot: 'bg-yellow-500', pulse: false }
}

/**
 * Compact GSI connection indicator: a colored (and, when live, pulsing) dot plus
 * a label and a relative "updated Ns ago" timestamp. Gives an unambiguous
 * is-it-working signal that the live stat panel alone can't convey.
 */
export function ConnectionStatus({
  status,
  lastUpdate,
  count
}: {
  status: GSIConnectionStatus
  lastUpdate: number | null
  count: number
}): JSX.Element {
  const meta = META[status]

  return (
    <div
      className="flex items-center gap-2 text-sm text-muted-foreground"
      title={
        lastUpdate
          ? `${count} payload${count === 1 ? '' : 's'} received this session`
          : 'No GSI payloads received yet'
      }
    >
      <span className="relative flex h-2.5 w-2.5">
        {meta.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${meta.dot}`}
          />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${meta.dot}`} />
      </span>
      <span className="font-medium text-card-foreground">{meta.label}</span>
      {lastUpdate !== null && (
        <span className="tabular-nums">· updated {formatAgo(lastUpdate)}</span>
      )}
    </div>
  )
}

function formatAgo(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (secs < 1) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}
