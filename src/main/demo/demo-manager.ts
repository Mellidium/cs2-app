import { EventEmitter } from 'node:events'
import type { AppDatabase } from '../database'
import type { GSIPayload } from '../gsi-types'
import type { DemoProgress } from '@shared/types'

/**
 * Orchestrates post-match enrichment: detect match end → download .dem via the
 * Steam Game Coordinator → parse with demoparser2 → compute improvement metrics
 * → write to SQLite → notify the renderer.
 *
 * This is a stub. Each step is isolated in its own module (demo-downloader,
 * demo-parser, demo-analyzer) so they can be built and tested independently.
 *
 * Events:
 *  - 'progress' (p: DemoProgress)  stage transitions for the renderer
 *  - 'complete' (matchId: number)  enriched data is ready
 */
export class DemoManager extends EventEmitter {
  constructor(private readonly _db: AppDatabase) {
    super()
  }

  async onMatchEnd(_payload: GSIPayload): Promise<void> {
    // 1. Wait ~60s for Valve to finalize the demo.
    // 2. downloadDemo()  -> emit progress 'downloading'
    // 3. parseDemo()     -> emit progress 'parsing'
    // 4. analyze()       -> emit progress 'analyzing'
    // 5. persist + mark matches.demo_parsed = 1
    // 6. this.emit('complete', matchId)
    console.log('[demo] match ended — enrichment pipeline not yet implemented (stub).')
  }

  private reportProgress(progress: DemoProgress): void {
    this.emit('progress', progress)
  }
}
