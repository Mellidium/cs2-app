// Worker-thread entry for the demo pipeline. Parsing a 300MB+ .dem is seconds
// of synchronous native work — running it here keeps the Electron main thread
// (and the GSI listener) responsive. Spawned by DemoManager; talks back via
// postMessage.
//
// In: workerData { demPath: string, replayOutPath: string }
// Out: { type: 'progress', stage } | { type: 'done', result } | { type: 'error', message }

import { parentPort, workerData } from 'node:worker_threads'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { parseDemo } from './demo-parser'
import { analyzeDemo, type AnalyzerResult } from './demo-analyzer'
import { extractReplay } from './replay-extract'
import type { DemoStage } from '@shared/types'

export interface DemoWorkerResult {
  map: string
  tickRate: number
  analysis: AnalyzerResult
  replayPath: string
  warnings: string[]
}

const { demPath, replayOutPath } = workerData as { demPath: string; replayOutPath: string }

function progress(stage: DemoStage): void {
  parentPort?.postMessage({ type: 'progress', stage })
}

async function run(): Promise<void> {
  progress('parsing')
  const demo = await parseDemo(demPath)

  progress('analyzing')
  const analysis = analyzeDemo(demo)

  progress('extracting')
  const { payload, warnings: extractWarnings } = extractReplay(demo)

  progress('saving')
  await mkdir(dirname(replayOutPath), { recursive: true })
  await pipeline(
    Readable.from([JSON.stringify(payload)]),
    createGzip({ level: 6 }),
    createWriteStream(replayOutPath)
  )

  const result: DemoWorkerResult = {
    map: demo.map,
    tickRate: demo.tickRate,
    analysis,
    replayPath: replayOutPath,
    warnings: [...analysis.warnings, ...extractWarnings]
  }
  parentPort?.postMessage({ type: 'done', result })
}

run().catch((err: Error) => {
  parentPort?.postMessage({ type: 'error', message: err.stack ?? err.message })
})
