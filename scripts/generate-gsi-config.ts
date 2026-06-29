/**
 * Generates a gamestate_integration_companion.cfg you can drop into CS2's cfg
 * folder manually (useful on macOS during development, where auto-setup is a
 * no-op). Run with: `npm run gen-cfg`
 *
 * The token printed here must match the one the app uses. In the real app the
 * token is persisted to the user-data dir by auto-setup; for manual testing you
 * can hardcode the same token in a dev override, or copy the one printed below
 * into your local gsi-token.json.
 */
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildGsiCfg } from '../src/main/auto-setup'

const token = process.env.GSI_TOKEN ?? randomUUID().replace(/-/g, '')
const outPath = join(process.cwd(), 'gamestate_integration_companion.cfg')

writeFileSync(outPath, buildGsiCfg(token), 'utf8')

console.log(`Wrote ${outPath}`)
console.log(`Auth token: ${token}`)
console.log('\nCopy this file into:')
console.log('  Windows: <Steam>/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/')
console.log('  macOS (Steam): ~/Library/Application Support/Steam/steamapps/common/.../game/csgo/cfg/')
console.log('\nThen restart CS2.')
