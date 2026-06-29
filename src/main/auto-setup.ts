import { execFileSync } from 'node:child_process'
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
  const desired = buildGsiCfg(token)
  const existing = existsSync(cfgPath) ? readFileSync(cfgPath, 'utf8') : null

  if (existing === desired) {
    // Already present and the token (and data fields) match — nothing to do.
    return {
      platform: process.platform,
      cs2Found: true,
      cfgWritten: false,
      cfgPath,
      needsCs2Restart: false,
      message: 'GSI config present and up to date. Stats will appear once you launch CS2.'
    }
  }

  // Missing, or drifted from the app's current token — (re)write so the .cfg and
  // the GSI server always agree, otherwise CS2's payloads get rejected (401).
  writeFileSync(cfgPath, desired, 'utf8')
  return {
    platform: process.platform,
    cs2Found: true,
    cfgWritten: true,
    cfgPath,
    needsCs2Restart: true,
    message: existing
      ? 'GSI config token re-synced. Restart CS2 (if running) for stats to start flowing.'
      : 'GSI config written. Restart CS2 (if running) for stats to start flowing.'
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

const CS2_APP_ID = '730'
const CS2_CFG_SUBPATH = ['steamapps', 'common', 'Counter-Strike Global Offensive', 'game', 'csgo', 'cfg']

/**
 * Locates `<CS2>/game/csgo/cfg` on Windows.
 *
 * CS2 can live in any Steam library, not just the default `C:` install — and a
 * leftover/partial CSGO folder in the default location will happily exist while
 * the real game runs from another drive, so we must resolve the library that
 * actually owns app 730 rather than guessing. We read Steam's location from the
 * registry, parse `libraryfolders.vdf`, and check the 730-owning libraries
 * first, falling back to the default install only if nothing else resolves.
 */
function findCs2CfgDir(): string | null {
  const steam = findSteamPath()
  const roots = steam ? cs2LibraryRoots(steam) : []

  // Last-resort fallbacks for when the registry/vdf can't be read.
  if (steam) roots.push(steam)
  roots.push(join('C:', 'Program Files (x86)', 'Steam'))

  for (const root of roots) {
    const cfgDir = join(root, ...CS2_CFG_SUBPATH)
    if (existsSync(cfgDir)) return cfgDir
  }
  return null
}

/** Active Steam install root, from the registry with default-location fallbacks. */
function findSteamPath(): string | null {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
      encoding: 'utf8',
      windowsHide: true
    })
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/i)
    if (m) return m[1].trim().replace(/\//g, '\\')
  } catch {
    /* registry unavailable — fall through to defaults */
  }
  for (const p of [join('C:', 'Program Files (x86)', 'Steam'), join('C:', 'Program Files', 'Steam')]) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Every Steam library root recorded in `libraryfolders.vdf`, with the libraries
 * that actually hold CS2 (app 730) listed first so a stale CSGO folder in a
 * different library never wins.
 */
function cs2LibraryRoots(steam: string): string[] {
  const vdfPath = join(steam, 'steamapps', 'libraryfolders.vdf')
  if (!existsSync(vdfPath)) return []

  const vdf = readFileSync(vdfPath, 'utf8')
  const withCs2: string[] = []
  const others: string[] = []

  // Each library is a block: "N" { "path" "..." ... "apps" { "730" "..." } }
  const blockRe = /"path"\s*"([^"]+)"[\s\S]*?"apps"\s*\{([\s\S]*?)\}/g
  for (let m = blockRe.exec(vdf); m !== null; m = blockRe.exec(vdf)) {
    const path = m[1].replace(/\\\\/g, '\\')
    const ownsCs2 = new RegExp(`"${CS2_APP_ID}"`).test(m[2])
    ;(ownsCs2 ? withCs2 : others).push(path)
  }
  return [...withCs2, ...others]
}
