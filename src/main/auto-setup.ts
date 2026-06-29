import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SetupStatus } from '@shared/types'

const CFG_NAME = 'gamestate_integration_companion.cfg'

/**
 * First-launch setup. On Windows this locates the CS2 install via the registry
 * and writes the GSI .cfg into the game's cfg folder. On macOS (development) it
 * is a no-op that returns a status telling the dev to wire the .cfg manually or
 * use the mock GSI sender (`npm run mock-gsi`).
 *
 * The auth token is generated once and persisted in `dataDir` so the GSI server
 * and the .cfg always agree.
 */
export function runAutoSetup(dataDir: string): SetupStatus {
  const token = loadOrCreateToken(dataDir)

  if (process.platform !== 'win32') {
    return {
      platform: process.platform,
      cs2Found: false,
      cfgWritten: false,
      cfgPath: null,
      needsCs2Restart: false,
      message:
        'Non-Windows platform: auto-setup skipped. Run `npm run mock-gsi` to feed sample GSI data, ' +
        'or place the generated .cfg into your CS2 cfg folder manually (`npm run gen-cfg`).'
    }
  }

  const cs2Cfg = findCs2CfgDir()
  if (!cs2Cfg) {
    return {
      platform: process.platform,
      cs2Found: false,
      cfgWritten: false,
      cfgPath: null,
      needsCs2Restart: false,
      message:
        'Could not locate the CS2 install. Open the app once after CS2 is installed, or set the path manually.'
    }
  }

  const cfgPath = join(cs2Cfg, CFG_NAME)
  if (existsSync(cfgPath)) {
    // Already configured on a previous launch — keep the existing token in sync.
    return {
      platform: process.platform,
      cs2Found: true,
      cfgWritten: false,
      cfgPath,
      needsCs2Restart: false,
      message: 'GSI config already present. Stats will appear once you launch CS2.'
    }
  }

  writeFileSync(cfgPath, buildGsiCfg(token), 'utf8')
  return {
    platform: process.platform,
    cs2Found: true,
    cfgWritten: true,
    cfgPath,
    needsCs2Restart: true,
    message: 'GSI config written. Restart CS2 (if running) for stats to start flowing.'
  }
}

export function loadOrCreateToken(dataDir: string): string {
  mkdirSync(dataDir, { recursive: true })
  const tokenPath = join(dataDir, 'gsi-token.json')
  if (existsSync(tokenPath)) {
    try {
      return JSON.parse(readFileSync(tokenPath, 'utf8')).token as string
    } catch {
      /* fall through and regenerate */
    }
  }
  const token = randomUUID().replace(/-/g, '')
  writeFileSync(tokenPath, JSON.stringify({ token }, null, 2), 'utf8')
  return token
}

export function buildGsiCfg(token: string): string {
  return `"CS2 Companion"
{
    "uri"           "http://127.0.0.1:3000"
    "timeout"       "5.0"
    "buffer"        "0.1"
    "throttle"      "0.5"
    "heartbeat"     "30.0"
    "auth"
    {
        "token"     "${token}"
    }
    "data"
    {
        "provider"              "1"
        "map"                   "1"
        "round"                 "1"
        "player_id"             "1"
        "player_state"          "1"
        "player_weapons"        "1"
        "player_match_stats"    "1"
        "map_round_wins"        "1"
    }
}
`
}

/**
 * Locates `<CS2>/game/csgo/cfg` on Windows.
 *
 * TODO: read `HKCU\Software\Valve\Steam` → `SteamPath`, then parse
 * `<SteamPath>/steamapps/libraryfolders.vdf` to find the library that holds
 * app 730 (CS2). For now this only checks the default Steam location so the
 * module is safe to call on a fresh machine.
 */
function findCs2CfgDir(): string | null {
  const defaultPath = join(
    'C:',
    'Program Files (x86)',
    'Steam',
    'steamapps',
    'common',
    'Counter-Strike Global Offensive',
    'game',
    'csgo',
    'cfg'
  )
  return existsSync(defaultPath) ? defaultPath : null
}
