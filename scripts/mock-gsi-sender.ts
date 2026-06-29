/**
 * Mock GSI sender for development without CS2. POSTs sample payloads to the
 * running app's listener on localhost:3000, simulating a short match.
 *
 * Run the app (`npm run dev`) in one terminal, then `npm run mock-gsi` in
 * another. The auth token must match the app's — find it in the app's
 * user-data dir (gsi-token.json) or pass GSI_TOKEN=... when launching both.
 *
 * Usage:
 *   GSI_TOKEN=<token> npm run mock-gsi
 */
const PORT = Number(process.env.GSI_PORT ?? 3000)
const TOKEN = process.env.GSI_TOKEN ?? 'dev-token'
const STEAM_ID = '76561198012345678'

function payload(round: number, health: number, money: number, phase: string): unknown {
  return {
    provider: { steamid: STEAM_ID, timestamp: Math.floor(Date.now() / 1000) },
    map: {
      name: 'de_dust2',
      mode: 'competitive',
      phase: 'live',
      round,
      team_ct: { score: Math.floor(round / 2) },
      team_t: { score: Math.ceil(round / 2) }
    },
    round: { phase },
    player: {
      steamid: STEAM_ID,
      team: round % 2 === 0 ? 'CT' : 'T',
      state: {
        health,
        armor: 100,
        helmet: true,
        money,
        equip_value: 4400,
        round_kills: round % 3,
        round_killhs: round % 2,
        round_totaldmg: 120
      },
      weapons: {
        weapon_0: { name: 'weapon_knife', type: 'Knife', state: 'holstered' },
        weapon_1: { name: 'weapon_ak47', type: 'Rifle', state: 'active', ammo_clip: 25, ammo_reserve: 90 }
      },
      match_stats: { kills: round, assists: 1, deaths: Math.floor(round / 2), mvps: 1, score: round * 3 }
    },
    auth: { token: TOKEN }
  }
}

async function send(body: unknown): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (res.status === 401) console.error('401 — token mismatch. Set GSI_TOKEN to the app\'s token.')
  } catch (err) {
    console.error('Send failed — is the app running?', (err as Error).message)
  }
}

async function main(): Promise<void> {
  console.log(`Sending mock GSI to http://127.0.0.1:${PORT} (token: ${TOKEN})`)
  for (let round = 1; round <= 6; round++) {
    await send(payload(round, 100, 4750, 'freezetime'))
    await new Promise((r) => setTimeout(r, 500))
    await send(payload(round, 100 - round * 10, 800, 'live'))
    await new Promise((r) => setTimeout(r, 500))
    await send(payload(round, round % 2 ? 0 : 60, 800, 'over'))
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log('Done.')
}

main()
