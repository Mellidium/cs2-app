import { useEffect, useState } from 'react'
import type { LiveGameState } from '@shared/types'

/** Subscribes to live GSI state pushed from the main process over IPC. */
export function useGSI(): LiveGameState | null {
  const [state, setState] = useState<LiveGameState | null>(null)

  useEffect(() => {
    const unsubscribe = window.electronAPI.onGSIState(setState)
    return unsubscribe
  }, [])

  return state
}
