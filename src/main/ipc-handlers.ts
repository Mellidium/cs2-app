import { dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import type { AppDatabase } from './database'
import type { DemoManager } from './demo/demo-manager'
import type { RadarManager } from './radar/radar-manager'
import type { SetupStatus } from '@shared/types'

/**
 * Registers request/response IPC handlers (renderer → main). Live push events
 * (main → renderer) are sent directly from index.ts via webContents.send.
 *
 * Channel names mirror the IPC Contract in the project spec.
 */
export function registerIpcHandlers(
  db: AppDatabase,
  demoManager: DemoManager,
  radarManager: RadarManager,
  setupStatus: () => SetupStatus
): void {
  ipcMain.handle('get-matches', (_e, steamId: string, limit?: number) =>
    db.getMatches(steamId, limit)
  )

  ipcMain.handle('get-aggregate-stats', (_e, steamId: string) => db.getAggregateStats(steamId))

  ipcMain.handle('get-setup-status', () => setupStatus())

  // --- Demos -----------------------------------------------------------------

  ipcMain.handle('demo:scan-replays', () => demoManager.scanReplaysFolder())

  ipcMain.handle('demo:import', async (_e, demPath?: string) => {
    let target = demPath
    if (!target) {
      const picked = await dialog.showOpenDialog({
        title: 'Select a CS2 demo',
        properties: ['openFile'],
        filters: [{ name: 'CS2 demos', extensions: ['dem'] }]
      })
      if (picked.canceled || picked.filePaths.length === 0) return { queued: false }
      target = picked.filePaths[0]
    }
    demoManager.importDemo(target)
    return { queued: true, demPath: target }
  })

  ipcMain.handle('demo:list', () => db.getDemos())

  ipcMain.handle('demo:get-stats', (_e, demoId: number) => db.getDemoStats(demoId))

  ipcMain.handle('demo:get-replay', async (_e, demoId: number) => {
    const path = db.getDemoReplayPath(demoId)
    if (!path) return null
    try {
      return JSON.parse(gunzipSync(await readFile(path)).toString('utf8'))
    } catch (err) {
      console.error('[demo] failed to read replay payload:', err)
      return null
    }
  })

  ipcMain.handle('demo:delete', (_e, demoId: number) => db.deleteDemo(demoId))

  // --- Radar (2D map overview for the replay viewer) -------------------------

  ipcMain.handle('radar:get', (_e, map: string) => radarManager.getRadar(map))

  // TODO (GSI-linked enrichment, see spec IPC Contract):
  //   get-weapon-breakdown, get-map-performance, get-improvement-stats,
  //   get-death-positions, get-opening-duel-stats, get-utility-stats,
  //   get-round-timeline, get-stat-trends
}
