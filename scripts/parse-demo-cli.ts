// Runs the full demo pipeline (parse → analyze → replay-extract) outside
// Electron and prints a scoreboard + payload summary. Dev tool for validating
// the pipeline against a real .dem:
//
//   npx tsx scripts/parse-demo-cli.ts "<path-to.dem>" [--out replay.json.gz]

import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { parseDemo } from '../src/main/demo/demo-parser'
import { analyzeDemo } from '../src/main/demo/demo-analyzer'
import { extractReplay } from '../src/main/demo/replay-extract'

const demPath = process.argv[2]
if (!demPath) {
  console.error('usage: npx tsx scripts/parse-demo-cli.ts <path-to.dem> [--out out.json.gz]')
  process.exit(1)
}
const outIdx = process.argv.indexOf('--out')
const outPath = outIdx > 0 ? process.argv[outIdx + 1] : null

const t0 = Date.now()
const demo = await parseDemo(demPath)
const tParse = Date.now()
console.log(
  `parsed ${demo.map}: ${demo.roster.length} players, ${demo.roundEnds.length} round ends, ` +
    `${demo.deaths.length} deaths, ${demo.hurts.length} hurts, ${demo.shots.length} shots, ` +
    `${demo.ticks.length} tick samples, ${demo.grenadeTrajectories.length} grenade rows ` +
    `(${((tParse - t0) / 1000).toFixed(1)}s)`
)

const analysis = analyzeDemo(demo)
const tAnalyze = Date.now()
console.log(
  `\nscore (CT-start : T-start) = ${analysis.ctStartScore} : ${analysis.tStartScore} over ${analysis.rounds} rounds ` +
    `(${((tAnalyze - tParse) / 1000).toFixed(1)}s)`
)

console.log('\nname                 side  K  D  A    ADR   HS%  KAST%  OK/OD  trades untrd  2k/3k/4k/5k  1v1 1v2  flashA  eBlind  tmBlind utilDmg  P/D')
for (const p of [...analysis.players].sort((a, b) => b.adr - a.adr)) {
  console.log(
    p.name.padEnd(20).slice(0, 20) +
      ` ${(p.startingSide ?? '?').padEnd(4)}` +
      `${String(p.kills).padStart(3)}${String(p.deaths).padStart(3)}${String(p.assists).padStart(3)}` +
      `${p.adr.toFixed(1).padStart(7)}` +
      `${p.headshotPct.toFixed(0).padStart(6)}` +
      `${p.kastPct.toFixed(0).padStart(7)}` +
      `${(p.openingKills + '/' + p.openingDeaths).padStart(7)}` +
      `${String(p.tradeKills).padStart(7)}${String(p.untradedDeaths).padStart(6)}` +
      `${(p.multiKills2 + '/' + p.multiKills3 + '/' + p.multiKills4 + '/' + p.multiKills5).padStart(13)}` +
      `${(p.clutch1v1Wins + '/' + p.clutch1v1Attempts).padStart(5)}` +
      `${(p.clutch1v2Wins + '/' + p.clutch1v2Attempts).padStart(4)}` +
      `${String(p.flashAssists).padStart(7)}` +
      `${p.enemyBlindDuration.toFixed(1).padStart(8)}` +
      `${p.teamflashDuration.toFixed(1).padStart(8)}` +
      `${String(p.utilityDamage).padStart(8)}` +
      `${('  ' + p.plants + '/' + p.defuses).padStart(5)}`
  )
}

const { payload, warnings } = extractReplay(demo)
const tExtract = Date.now()
const json = JSON.stringify(payload)
const gz = gzipSync(json)
console.log(
  `\nreplay payload: ${payload.rounds.length} rounds, ` +
    `${payload.rounds.reduce((n, r) => n + r.frames.length, 0)} frames, ` +
    `${payload.rounds.reduce((n, r) => n + r.grenades.length, 0)} grenades, ` +
    `${payload.rounds.reduce((n, r) => n + r.shots.length, 0)} shots, ` +
    `${payload.rounds.reduce((n, r) => n + r.events.length, 0)} events — ` +
    `${(json.length / 1e6).toFixed(1)}MB raw / ${(gz.length / 1e6).toFixed(1)}MB gz ` +
    `(${((tExtract - tAnalyze) / 1000).toFixed(1)}s)`
)
const r1 = payload.rounds[0]
if (r1) {
  console.log(
    `round 1 window: start=${r1.startTick} end=${r1.endTick}, ${r1.frames.length} frames, ` +
      `first frame players=${r1.frames[0]?.players.length}, bombCarrier points=${r1.bombCarrier.length}`
  )
}

const allWarnings = [...analysis.warnings, ...warnings]
if (allWarnings.length > 0) {
  console.log('\nwarnings:')
  for (const w of allWarnings) console.log(`  - ${w}`)
}

if (outPath) {
  writeFileSync(outPath, gz)
  console.log(`\nwrote ${outPath}`)
}
