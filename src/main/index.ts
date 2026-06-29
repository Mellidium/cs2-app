import { app, shell, BrowserWindow, type Tray } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { AppDatabase } from './database'
import { GSIServer, GSI_PORT } from './gsi-server'
import { registerIpcHandlers } from './ipc-handlers'
import { runAutoSetup, loadOrCreateToken } from './auto-setup'
import { createTray } from './tray'
import { DemoManager } from './demo/demo-manager'
import type { SetupStatus } from '@shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let db: AppDatabase
let gsi: GSIServer
let demoManager: DemoManager
let setupStatus: SetupStatus
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Close-to-tray: keep the GSI listener alive while the window is hidden.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function wireGsiToRenderer(): void {
  gsi.on('state', (state) => mainWindow?.webContents.send('gsi:state', state))
  gsi.on('round-end', (payload) => mainWindow?.webContents.send('gsi:round-end', payload))
  gsi.on('match-end', (payload) => {
    mainWindow?.webContents.send('gsi:match-end', payload)
    // Kick off post-match demo enrichment in the background.
    demoManager.onMatchEnd(payload).catch((err) => console.error('[demo]', err))
  })

  demoManager.on('progress', (p) => mainWindow?.webContents.send('demo:enrichment-progress', p))
  demoManager.on('complete', (matchId) =>
    mainWindow?.webContents.send('demo:enrichment-complete', matchId)
  )
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.mellidium.cs2companion')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const dataDir = app.getPath('userData')
  const token = loadOrCreateToken(dataDir)

  db = new AppDatabase(dataDir)
  setupStatus = runAutoSetup(dataDir)
  demoManager = new DemoManager(db)

  registerIpcHandlers(db, () => setupStatus)

  gsi = new GSIServer(token)
  await gsi.start(GSI_PORT).catch((err) => console.error('[gsi] failed to start:', err))

  createWindow()
  wireGsiToRenderer()
  tray = createTray(mainWindow!, join(__dirname, '../../resources'))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => (isQuitting = true))

app.on('window-all-closed', () => {
  // Tray keeps the app alive; only quit explicitly.
  if (process.platform !== 'darwin' && !tray) app.quit()
})

app.on('quit', () => {
  gsi?.stop()
  db?.close()
})
