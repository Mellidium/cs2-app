import { parseHeader, parseEvents } from '@laihoe/demoparser2'
import { writeFileSync } from 'node:fs'

const dem = process.argv[2]
const outJson = process.argv[3]

// de_ancient calibration from resource/overviews/de_ancient.txt
const CAL = { posX: -2953, posY: 2164, scale: 5, reference: 1024 }
const span = CAL.scale * CAL.reference

const header = parseHeader(dem)
console.log('map:', header['map_name'])

const deaths = parseEvents(dem, ['player_death'], ['X', 'Y'])
console.log('death rows:', deaths.length)
console.log('keys:', Object.keys(deaths[0]).join(', '))

// Victim position keys are prefixed 'user_' by demoparser2.
const pts = []
for (const r of deaths) {
  const x = r['user_X']
  const y = r['user_Y']
  if (typeof x !== 'number' || typeof y !== 'number') continue
  const px = ((x - CAL.posX) / span) * CAL.reference
  const py = ((CAL.posY - y) / span) * CAL.reference
  pts.push({ px: Math.round(px), py: Math.round(py) })
}
const xs = pts.map((p) => p.px)
const ys = pts.map((p) => p.py)
console.log('projected pixel range: x', Math.min(...xs), '..', Math.max(...xs), ' y', Math.min(...ys), '..', Math.max(...ys))
console.log('points:', pts.length)
writeFileSync(outJson, JSON.stringify(pts))
