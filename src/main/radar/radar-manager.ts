import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { RadarAsset, RadarCalibration } from '@shared/radar-types'

const execFileAsync = promisify(execFile)

/**
 * Pinned Source2Viewer (ValveResourceFormat) CLI release. Pinned rather than
 * "latest" so a future VPK/format change can't silently break extraction — bump
 * deliberately after testing. See github.com/ValveResourceFormat/ValveResourceFormat.
 */
const CLI_VERSION = '19.2'

/** Radar textures are authored against a 1024px reference (CS2 convention). */
const REFERENCE_RES = 1024

/** In-VPK paths, parameterized by map name. */
const radarVpkPath = (map: string): string =>
  `panorama/images/overheadmaps/${map}_radar_psd.vtex_c`
const overviewVpkPath = (map: string): string => `resource/overviews/${map}.txt`

/**
 * Resolves CS2 radar images + calibration for the 2D replay viewer.
 *
 * On first request for a map it downloads the Source2Viewer CLI (once, cached),
 * extracts the map's `_radar_psd` texture (decompiled to PNG) and its overview
 * `.txt` straight from the user's own CS2 install, parses the calibration, and
 * caches the result on disk. Subsequent requests are served from cache.
 *
 * Every failure path (no CS2 install, workshop map with no shipped radar, offline
 * during the one-time CLI download, extraction error) resolves to `null` so the
 * viewer falls back to its auto-fit projection instead of erroring.
 */
export class RadarManager {
  private readonly cacheDir: string
  private readonly toolsDir: string
  /** Dedupes concurrent requests and negative results within a session. */
  private readonly inflight = new Map<string, Promise<RadarAsset | null>>()
  private readonly missing = new Set<string>()
  private cliReady: Promise<string | null> | null = null

  constructor(
    dataDir: string,
    private readonly findPakFile: () => string | null
  ) {
    this.cacheDir = join(dataDir, 'radars')
    this.toolsDir = join(dataDir, 'tools', `vrf-${CLI_VERSION}`)
  }

  async getRadar(rawMap: string): Promise<RadarAsset | null> {
    const map = normalizeMap(rawMap)
    if (!map || this.missing.has(map)) return null

    const existing = this.inflight.get(map)
    if (existing) return existing

    const task = this.resolve(map).catch((err) => {
      console.error(`[radar] failed to resolve "${map}":`, err)
      return null
    })
    this.inflight.set(map, task)
    const result = await task
    this.inflight.delete(map)
    if (!result) this.missing.add(map)
    return result
  }

  private async resolve(map: string): Promise<RadarAsset | null> {
    const cached = await this.readCache(map)
    if (cached) return cached

    const pak = this.findPakFile()
    if (!pak) return null // CS2 not installed / not found

    const cli = await this.ensureCli()
    if (!cli) return null // download failed (offline?)

    const work = join(this.toolsDir, 'work', map)
    await rm(work, { recursive: true, force: true })
    await mkdir(work, { recursive: true })
    try {
      // Radar texture → PNG (-d decompiles the vtex_c); overview txt is raw.
      await this.runCli(cli, ['-i', pak, '--vpk_filepath', radarVpkPath(map), '-d', '-o', work])
      await this.runCli(cli, ['-i', pak, '--vpk_filepath', overviewVpkPath(map), '-o', work])

      const pngPath = join(work, 'panorama', 'images', 'overheadmaps', `${map}_radar_psd.png`)
      const txtPath = join(work, 'resource', 'overviews', `${map}.txt`)
      if (!existsSync(pngPath) || !existsSync(txtPath)) return null // not a stock map

      const calibration = parseOverview(await readFile(txtPath, 'utf8'))
      if (!calibration) return null

      const png = await readFile(pngPath)
      await this.writeCache(map, png, calibration)
      return { map, image: pngDataUrl(png), calibration }
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {})
    }
  }

  // --- Disk cache ------------------------------------------------------------

  private async readCache(map: string): Promise<RadarAsset | null> {
    const pngPath = join(this.cacheDir, `${map}.png`)
    const jsonPath = join(this.cacheDir, `${map}.json`)
    if (!existsSync(pngPath) || !existsSync(jsonPath)) return null
    try {
      const calibration = JSON.parse(await readFile(jsonPath, 'utf8')) as RadarCalibration
      const png = await readFile(pngPath)
      return { map, image: pngDataUrl(png), calibration }
    } catch {
      return null
    }
  }

  private async writeCache(map: string, png: Buffer, calibration: RadarCalibration): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true })
    await writeFile(join(this.cacheDir, `${map}.png`), png)
    await writeFile(join(this.cacheDir, `${map}.json`), JSON.stringify(calibration))
  }

  // --- CLI provisioning ------------------------------------------------------

  /** Path to the extraction CLI, downloading + unpacking it once if needed. */
  private ensureCli(): Promise<string | null> {
    if (!this.cliReady) {
      this.cliReady = this.provisionCli().catch((err) => {
        console.error('[radar] CLI provisioning failed:', err)
        this.cliReady = null // allow a later retry (e.g. once back online)
        return null
      })
    }
    return this.cliReady
  }

  private async provisionCli(): Promise<string> {
    const exe = join(this.toolsDir, cliExeName())
    if (existsSync(exe)) return exe

    await mkdir(this.toolsDir, { recursive: true })
    const asset = cliAssetName()
    const url = `https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/${CLI_VERSION}/${asset}`
    console.log(`[radar] downloading extraction CLI (${asset})…`)

    const res = await fetch(url)
    if (!res.ok) throw new Error(`download ${url} → HTTP ${res.status}`)
    const zipPath = join(this.toolsDir, asset)
    await writeFile(zipPath, Buffer.from(await res.arrayBuffer()))
    await unzip(zipPath, this.toolsDir)
    await rm(zipPath, { force: true })

    if (!existsSync(exe)) throw new Error(`CLI missing after unzip: ${exe}`)
    if (process.platform !== 'win32') await chmod(exe, 0o755)
    console.log('[radar] extraction CLI ready.')
    return exe
  }

  private async runCli(cli: string, args: string[]): Promise<void> {
    await execFileAsync(cli, args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true })
  }
}

// --- Pure helpers ------------------------------------------------------------

/** Map names in demos/GSI are lowercase `de_dust2`-style; reject anything else. */
function normalizeMap(map: string): string | null {
  const m = map?.trim().toLowerCase()
  return m && /^[a-z0-9_]+$/.test(m) ? m : null
}

function pngDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`
}

/**
 * Parses the calibration triplet out of a CS2 overview `.txt` (a Valve
 * KeyValues file). Only pos_x/pos_y/scale are needed for the linear projection.
 */
export function parseOverview(text: string): RadarCalibration | null {
  const num = (key: string): number | null => {
    const m = text.match(new RegExp(`"${key}"\\s+"(-?[0-9.]+)"`, 'i'))
    return m ? Number(m[1]) : null
  }
  const posX = num('pos_x')
  const posY = num('pos_y')
  const scale = num('scale')
  if (posX === null || posY === null || !scale) return null
  return { posX, posY, scale, reference: REFERENCE_RES }
}

function cliAssetName(): string {
  const arm = process.arch === 'arm64'
  if (process.platform === 'win32') return arm ? 'cli-windows-arm64.zip' : 'cli-windows-x64.zip'
  if (process.platform === 'darwin') return arm ? 'cli-macos-arm64.zip' : 'cli-macos-x64.zip'
  return arm ? 'cli-linux-arm64.zip' : 'cli-linux-x64.zip'
}

function cliExeName(): string {
  return process.platform === 'win32' ? 'Source2Viewer-CLI.exe' : 'Source2Viewer-CLI'
}

/** Extract a .zip using the platform's built-in tool (no npm dependency). */
async function unzip(zipPath: string, destDir: string): Promise<void> {
  if (process.platform === 'win32') {
    await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`
      ],
      { windowsHide: true }
    )
  } else {
    await execFileAsync('unzip', ['-o', zipPath, '-d', destDir])
  }
}
