import { ipcMain } from 'electron'
import type { AppDatabase } from './database'
import type { SetupStatus } from '@shared/types'

/**
 * Registers request/response IPC handlers (renderer → main). Live push events
 * (main → renderer) are sent directly from index.ts via webContents.send.
 *
 * Channel names mirror the IPC Contract in the project spec.
 */
export function registerIpcHandlers(db: AppDatabase, setupStatus: () => SetupStatus): void {
  ipcMain.handle('get-matches', (_e, steamId: string, limit?: number) =>
    db.getMatches(steamId, limit)
  )

  ipcMain.handle('get-aggregate-stats', (_e, steamId: string) => db.getAggregateStats(steamId))

  ipcMain.handle('get-setup-status', () => setupStatus())

  // TODO (demo-enriched, see spec IPC Contract):
  //   get-weapon-breakdown, get-map-performance, get-improvement-stats,
  //   get-death-positions, get-opening-duel-stats, get-utility-stats,
  //   get-round-timeline, get-stat-trends
}
