import { useEffect, useState } from 'react'
import type { AggregateStats } from '@shared/types'

/** Queries aggregate historical stats for a SteamID via IPC invoke. */
export function useStats(steamId: string | null): AggregateStats | null {
  const [stats, setStats] = useState<AggregateStats | null>(null)

  useEffect(() => {
    if (!steamId) return
    let active = true
    window.electronAPI.getAggregateStats(steamId).then((s) => {
      if (active) setStats(s)
    })
    return () => {
      active = false
    }
  }, [steamId])

  return stats
}
