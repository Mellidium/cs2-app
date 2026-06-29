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

function activeWeaponInfo(player: GSIPayload['player']): {
  name: string | null
  type: string | null
  ammoClip: number | null
  ammoReserve: number | null
} {
  const weapons = player?.weapons
  const empty = { name: null, type: null, ammoClip: null, ammoReserve: null }
  if (!weapons) return empty
  for (const w of Object.values(weapons)) {
    if (w.state === 'active') {
      return {
        name: w.name ?? null,
        type: w.type ?? null,
        ammoClip: w.ammo_clip ?? null,
        ammoReserve: w.ammo_reserve ?? null
      }
    }
  }
  return empty
}

export function toLiveState(payload: GSIPayload): LiveGameState {
  const p = payload.player
  const weapon = activeWeaponInfo(p)
  return {
    steamId: payload.provider?.steamid ?? p?.steamid ?? '',
    map: payload.map?.name ?? null,
    mode: payload.map?.mode ?? null,
    mapPhase: payload.map?.phase ?? null,
    round: payload.map?.round ?? null,
    roundPhase: payload.round?.phase ?? null,
    ctScore: payload.map?.team_ct?.score ?? 0,
    tScore: payload.map?.team_t?.score ?? 0,
    bombStatus: payload.round?.bomb ?? null,
    roundWinTeam: payload.round?.win_team ?? null,
    player: p
      ? {
          name: p.name ?? null,
          team: p.team ?? null,
          health: p.state?.health ?? 0,
          armor: p.state?.armor ?? 0,
          helmet: p.state?.helmet ?? false,
          money: p.state?.money ?? 0,
          equipValue: p.state?.equip_value ?? 0,
          activeWeapon: weapon.name,
          activeWeaponType: weapon.type,
          activeWeaponAmmoClip: weapon.ammoClip,
          activeWeaponAmmoReserve: weapon.ammoReserve,
          roundKills: p.state?.round_kills ?? 0,
          roundHeadshots: p.state?.round_killhs ?? 0,
          roundTotalDmg: p.state?.round_totaldmg ?? 0,
          matchKills: p.match_stats?.kills ?? 0,
          matchAssists: p.match_stats?.assists ?? 0,
          matchDeaths: p.match_stats?.deaths ?? 0,
          matchMvps: p.match_stats?.mvps ?? 0,
          matchScore: p.match_stats?.score ?? 0
        }
      : null
  }
}
