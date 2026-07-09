import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AggregateStats,
  DemoPlayerStats,
  DemoProgress,
  DemoSummary,
  ElectronAPI,
  LiveGameState,
  MatchSummary,
  ReplayFolderEntry,
  SetupStatus
} from '@shared/types'
import type { RadarAsset } from '@shared/radar-types'

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
  getSetupStatus: () => ipcRenderer.invoke('get-setup-status') as Promise<SetupStatus>,

  // Demos
  scanReplaysFolder: () =>
    ipcRenderer.invoke('demo:scan-replays') as Promise<ReplayFolderEntry[]>,
  importDemo: (demPath) =>
    ipcRenderer.invoke('demo:import', demPath) as Promise<{ queued: boolean; demPath?: string }>,
  getDemos: () => ipcRenderer.invoke('demo:list') as Promise<DemoSummary[]>,
  getDemoStats: (demoId) =>
    ipcRenderer.invoke('demo:get-stats', demoId) as Promise<DemoPlayerStats[]>,
  getDemoReplay: (demoId) => ipcRenderer.invoke('demo:get-replay', demoId),
  deleteDemo: (demoId) => ipcRenderer.invoke('demo:delete', demoId) as Promise<void>,

  // Radar
  getRadar: (map) => ipcRenderer.invoke('radar:get', map) as Promise<RadarAsset | null>
}

contextBridge.exposeInMainWorld('electronAPI', api)
