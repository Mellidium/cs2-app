import { EventEmitter } from 'node:events'
import { Worker } from 'node:worker_threads'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { AppDatabase } from '../database'
import type { GSIPayload } from '../gsi-types'
import type { DemoProgress, DemoStage, ReplayFolderEntry } from '@shared/types'
import type { DemoWorkerResult } from './demo-worker'

/**
 * Orchestrates demo enrichment: a .dem (from the CS2 replays folder or a file
 * picker) is parsed → analyzed → replay-extracted in a worker thread, then the
 * stats land in SQLite and the replay payload lands gzipped on disk.
 *
 * Events:
 *  - 'progress' (p: DemoProgress)  stage transitions for the renderer
 *  - 'complete' (demoId: number)   enriched data is ready
 */
export class DemoManager extends EventEmitter {
  private queue: string[] = []
  private active: string | null = null

  constructor(
    private readonly db: AppDatabase,
    /** Directory where gzipped replay payloads are stored (userData/replays). */
    private readonly replayStoreDir: string,
    /** Compiled demo-worker.js, sibling of the main bundle. */
    private readonly workerPath: string,
    /** Resolves the CS2 replays folder (null when CS2 isn't found). */
    private readonly findReplaysDir: () => string | null
  ) {
    super()
  }

  /** Queue a .dem for the full pipeline. Re-importing replaces the old row. */
  importDemo(demPath: string): void {
    if (this.active === demPath || this.queue.includes(demPath)) return
    this.queue.push(demPath)
    this.report(demPath, 'queued')
    void this.drain()
  }

  /** .dem files in the CS2 replays folder, flagged if already parsed. */
  async scanReplaysFolder(): Promise<ReplayFolderEntry[]> {
    const dir = this.findReplaysDir()
    if (!dir || !existsSync(dir)) return []
    const names = await readdir(dir)
    const entries: ReplayFolderEntry[] = []
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.dem')) continue
      const demPath = join(dir, name)
      const s = await stat(demPath)
      entries.push({
        demPath,
        fileName: name,
        sizeBytes: s.size,
        modifiedAt: s.mtime.toISOString(),
        demoId: this.db.getDemoIdByPath(demPath)
      })
    }
    return entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  }

  /**
   * GSI match-end hook. Downloading the demo via the Steam Game Coordinator
   * (demo-downloader.ts) is still stubbed — for now enrichment starts from the
   * replays folder or a manual import.
   */
  async onMatchEnd(_payload: GSIPayload): Promise<void> {
    console.log('[demo] match ended — auto-download not implemented; import the demo manually.')
  }

  private async drain(): Promise<void> {
    if (this.active !== null) return
    const demPath = this.queue.shift()
    if (!demPath) return
    this.active = demPath
    try {
      await this.runPipeline(demPath)
    } catch (err) {
      console.error('[demo] pipeline failed:', err)
      this.report(demPath, 'failed', (err as Error).message)
    } finally {
      this.active = null
      void this.drain()
    }
  }

  private runPipeline(demPath: string): Promise<void> {
    const replayOutPath = join(this.replayStoreDir, `${basename(demPath, '.dem')}.replay.json.gz`)
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, { workerData: { demPath, replayOutPath } })
      let settled = false
      const finish = (err?: Error): void => {
        if (settled) return
        settled = true
        err ? reject(err) : resolve()
      }

      worker.on('message', (msg: { type: string; stage?: DemoStage; message?: string; result?: DemoWorkerResult }) => {
        if (msg.type === 'progress' && msg.stage) {
          this.report(demPath, msg.stage)
        } else if (msg.type === 'done' && msg.result) {
          try {
            const demoId = this.persist(demPath, msg.result)
            for (const w of msg.result.warnings) console.warn(`[demo] ${basename(demPath)}: ${w}`)
            this.report(demPath, 'done', undefined, demoId)
            this.emit('complete', demoId)
            finish()
          } catch (err) {
            finish(err as Error)
          }
        } else if (msg.type === 'error') {
          finish(new Error(msg.message ?? 'demo worker failed'))
        }
      })
      worker.on('error', finish)
      worker.on('exit', (code) => {
        if (code !== 0) finish(new Error(`demo worker exited with code ${code}`))
        else finish(new Error('demo worker exited without a result'))
      })
    })
  }

  private persist(demPath: string, result: DemoWorkerResult): number {
    return this.db.saveDemo({
      demPath,
      fileName: basename(demPath),
      map: result.map,
      tickRate: result.tickRate,
      rounds: result.analysis.rounds,
      ctStartScore: result.analysis.ctStartScore,
      tStartScore: result.analysis.tStartScore,
      replayPath: result.replayPath,
      players: result.analysis.players
    })
  }

  private report(demPath: string, stage: DemoStage, message?: string, demoId?: number): void {
    const progress: DemoProgress = { demPath, stage, message, demoId }
    this.emit('progress', progress)
  }
}
