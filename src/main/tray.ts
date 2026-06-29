import { Tray, Menu, app, nativeImage, type BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * System tray icon + menu. The app is meant to run quietly alongside CS2, so the
 * window close button hides to tray rather than quitting (wired in index.ts).
 */
export function createTray(window: BrowserWindow, iconDir: string): Tray | null {
  const iconPath = join(iconDir, 'tray-icon.png')
  // resources/tray-icon.png is a placeholder until a real asset is added.
  const image = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()

  let tray: Tray
  try {
    tray = new Tray(image)
  } catch {
    return null
  }

  tray.setToolTip('CS2 Companion')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Dashboard', click: () => window.show() },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.exit(0)
        }
      }
    ])
  )
  tray.on('click', () => window.show())
  return tray
}
