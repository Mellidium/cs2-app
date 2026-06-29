import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AggregateStats,
  DemoProgress,
  ElectronAPI,
  LiveGameState,
  MatchSummary,
  SetupStatus
} from '@shared/types'

/**
 * Wraps an ipcRenderer.on subscription and returns an unsubscribe function so
 * React effects can clean up listeners.
 */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ElectronAPI = {
  // Push (main → renderer)
  onGSIState: (cb) => subscribe<LiveGameState>('gsi:state', cb),
  onRoundEnd: (cb) => subscribe<unknown>('gsi:round-end', cb),
  onMatchEnd: (cb) => subscribe<MatchSummary>('gsi:match-end', cb),
  onDemoReady: (cb) => subscribe<number>('demo:enrichment-complete', cb),
  onDemoProgress: (cb) => subscribe<DemoProgress>('demo:enrichment-progress', cb),

  // Request/response (renderer → main)
  getMatches: (steamId, limit) =>
    ipcRenderer.invoke('get-matches', steamId, limit) as Promise<MatchSummary[]>,
  getAggregateStats: (steamId) =>
    ipcRenderer.invoke('get-aggregate-stats', steamId) as Promise<AggregateStats>,
  getSetupStatus: () => ipcRenderer.invoke('get-setup-status') as Promise<SetupStatus>
}

contextBridge.exposeInMainWorld('electronAPI', api)
