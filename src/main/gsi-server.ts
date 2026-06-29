import { createServer, type Server } from 'node:http'
import { EventEmitter } from 'node:events'
import type { GSIPayload } from './gsi-types'
import type { LiveGameState } from '@shared/types'

export const GSI_PORT = 3000

/**
 * HTTP server that receives push-based GSI payloads from CS2 on localhost:3000.
 *
 * It does not poll the game — CS2 POSTs JSON whenever state changes (subject to
 * the throttle/buffer in the .cfg). Each payload is auth-validated, normalized
 * into a {@link LiveGameState}, and emitted for the database + renderer to consume.
 *
 * Events:
 *  - 'state'      (state: LiveGameState)  every accepted payload
 *  - 'round-end'  (payload: GSIPayload)   round.phase transitioned to 'over'
 *  - 'match-end'  (payload: GSIPayload)   map.phase transitioned to 'gameover'
 */
export class GSIServer extends EventEmitter {
  private server: Server | null = null
  private lastMapPhase: string | null = null
  private lastRoundPhase: string | null = null

  constructor(private readonly authToken: string) {
    super()
  }

  start(port = GSI_PORT): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }

        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const payload = JSON.parse(body) as GSIPayload
            if (payload.auth?.token !== this.authToken) {
              res.writeHead(401)
              res.end()
              return
            }
            this.handlePayload(payload)
            res.writeHead(200)
            res.end()
          } catch (err) {
            console.error('[gsi] failed to parse payload:', err)
            res.writeHead(400)
            res.end()
          }
        })
      })

      this.server.on('error', reject)
      this.server.listen(port, '127.0.0.1', () => {
        console.log(`[gsi] listening on http://127.0.0.1:${port}`)
        resolve()
      })
    })
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  private handlePayload(payload: GSIPayload): void {
    this.emit('state', toLiveState(payload))

    const roundPhase = payload.round?.phase ?? null
    if (roundPhase === 'over' && this.lastRoundPhase !== 'over') {
      this.emit('round-end', payload)
    }
    this.lastRoundPhase = roundPhase

    const mapPhase = payload.map?.phase ?? null
    if (mapPhase === 'gameover' && this.lastMapPhase !== 'gameover') {
      this.emit('match-end', payload)
    }
    this.lastMapPhase = mapPhase
  }
}

function activeWeapon(player: GSIPayload['player']): string | null {
  const weapons = player?.weapons
  if (!weapons) return null
  for (const w of Object.values(weapons)) {
    if (w.state === 'active') return w.name ?? null
  }
  return null
}

export function toLiveState(payload: GSIPayload): LiveGameState {
  const p = payload.player
  return {
    steamId: payload.provider?.steamid ?? p?.steamid ?? '',
    map: payload.map?.name ?? null,
    mode: payload.map?.mode ?? null,
    mapPhase: payload.map?.phase ?? null,
    round: payload.map?.round ?? null,
    roundPhase: payload.round?.phase ?? null,
    ctScore: payload.map?.team_ct?.score ?? 0,
    tScore: payload.map?.team_t?.score ?? 0,
    player: p
      ? {
          team: p.team ?? null,
          health: p.state?.health ?? 0,
          armor: p.state?.armor ?? 0,
          helmet: p.state?.helmet ?? false,
          money: p.state?.money ?? 0,
          equipValue: p.state?.equip_value ?? 0,
          activeWeapon: activeWeapon(p),
          roundKills: p.state?.round_kills ?? 0,
          roundHeadshots: p.state?.round_killhs ?? 0,
          matchKills: p.match_stats?.kills ?? 0,
          matchAssists: p.match_stats?.assists ?? 0,
          matchDeaths: p.match_stats?.deaths ?? 0
        }
      : null
  }
}
