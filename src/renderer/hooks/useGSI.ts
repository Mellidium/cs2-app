import { useEffect, useState } from 'react'
import type { LiveGameState } from '@shared/types'

/**
 * Connection state derived from GSI push timing (the listener is push-based, so
 * "connected" means we recently received a payload — there is no handshake):
 *  - 'waiting' — no payload received yet this session
 *  - 'live'    — a payload arrived within {@link IDLE_AFTER_MS}
 *  - 'idle'    — payloads arrived earlier but have since gone quiet
 */
export type GSIConnectionStatus = 'waiting' | 'live' | 'idle'

export interface GSIStatus {
  state: LiveGameState | null
  status: GSIConnectionStatus
  /** Epoch ms of the last received payload, or null if none yet. */
  lastUpdate: number | null
  /** Total payloads received this session. */
  count: number
}

/** No payload within this window flips 'live' → 'idle'. */
const IDLE_AFTER_MS = 15_000
/** How often the status decays/relative-time label refreshes while idle-watching. */
const TICK_MS = 1_000

/** Subscribes to live GSI state and exposes a derived connection status. */
export function useGSI(): GSIStatus {
  const [state, setState] = useState<LiveGameState | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  // `now` ticks so 'live' can decay to 'idle' even when no payload arrives.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const unsubscribe = window.electronAPI.onGSIState((s) => {
      setState(s)
      setLastUpdate(Date.now())
      setCount((c) => c + 1)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const status: GSIConnectionStatus =
    lastUpdate === null ? 'waiting' : now - lastUpdate < IDLE_AFTER_MS ? 'live' : 'idle'

  return { state, status, lastUpdate, count }
}
