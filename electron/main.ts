/**
 * QDM - Quantum Download Manager
 * Electron Main Process
 * 
 * Credits:
 * - XDM (Xtreme Download Manager) by subhra74 for download engine architecture
 *   https://github.com/subhra74/xdm
 * - IDM (Internet Download Manager) for pioneering segmented download technology
 */

import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, Notification } from 'electron'
import path from 'path'
import { DownloadEngine } from './download-engine'
import { BrowserMonitor } from './browser-monitor'
import { ClipboardMonitor } from './clipboard-monitor'
import { QueueManager } from './queue-manager'
import { AutoUpdater } from './auto-updater'
import type { NewDownloadRequest, AppConfig } from './types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let downloadEngine: DownloadEngine
let browserMonitor: BrowserMonitor
let clipboardMonitor: ClipboardMonitor
let queueManager: QueueManager
let autoUpdater: AutoUpdater

const defaultConfig: AppConfig = {
  downloadDir: app.getPath('downloads'),
  maxConcurrentDownloads: 3,
  maxSegmentsPerDownload: 8,
  speedLimit: 0,
  showNotifications: true,
  minimizeToTray: true,
  startWithWindows: false,
  theme: 'dark',
}

function emit(event: string, data: any) {
  mainWindow?.webContents.send(event, data)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (event) => {
    if (defaultConfig.minimizeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  try {
    const icon = nativeImage.createEmpty()
    tray = new Tray(icon)
    
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show QDM', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'New Download', click: () => {
        mainWindow?.show()
        mainWindow?.webContents.send('show-new-download')
      }},
      { type: 'separator' },
      { label: 'Pause All', click: () => {
        const downloads = downloadEngine.getAllDownloads()
        downloads.forEach(d => {
          if (d.status === 'downloading') downloadEngine.pauseDownload(d.id)
        })
      }},
      { label: 'Resume All', click: () => {
        const downloads = downloadEngine.getAllDownloads()
        downloads.forEach(d => {
          if (d.status === 'paused') downloadEngine.resumeDownload(d.id)
        })
      }},
      { type: 'separator' },
      { label: 'Quit', click: () => {
        app.exit(0)
      }}
    ])

    tray.setToolTip('Quantum Download Manager')
    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => mainWindow?.show())
  } catch (err) {
    console.warn('Failed to create tray:', err)
  }
}

function showNotification(title: string, body: string) {
  if (defaultConfig.showNotifications && Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}

function setupIPC() {
  // Window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized())

  // ── Download operations ──────────────────────────────────────
  ipcMain.handle('download:add', async (_event, request: NewDownloadRequest) => {
    return downloadEngine.addDownload(request)
  })

  ipcMain.handle('download:start', async (_event, id: string) => {
    return downloadEngine.startDownload(id)
  })

  ipcMain.handle('download:pause', async (_event, id: string) => {
    return downloadEngine.pauseDownload(id)
  })

  ipcMain.handle('download:resume', async (_event, id: string) => {
    return downloadEngine.resumeDownload(id)
  })

  ipcMain.handle('download:cancel', async (_event, id: string) => {
    return downloadEngine.cancelDownload(id)
  })

  ipcMain.handle('download:remove', async (_event, id: string, deleteFile: boolean) => {
    return downloadEngine.removeDownload(id, deleteFile)
  })

  ipcMain.handle('download:retry', async (_event, id: string) => {
    return downloadEngine.retryDownload(id)
  })

  ipcMain.handle('download:getAll', async () => {
    return downloadEngine.getAllDownloads()
  })

  ipcMain.handle('download:openFile', async (_event, id: string) => {
    return downloadEngine.openFile(id)
  })

  ipcMain.handle('download:openFolder', async (_event, id: string) => {
    return downloadEngine.openFolder(id)
  })

  // ── Browser Monitor ──────────────────────────────────────────
  ipcMain.handle('browser:getMediaList', async () => {
    return browserMonitor.getMediaList()
  })

  ipcMain.handle('browser:clearMedia', async () => {
    browserMonitor.clearMediaList()
    return true
  })

  ipcMain.handle('browser:downloadMedia', async (_event, mediaId: string) => {
    const media = browserMonitor.getMediaList().find(m => m.id === mediaId)
    if (media) {
      return downloadEngine.addDownload({
        url: media.url,
        fileName: media.name,
        headers: media.headers,
        autoStart: true,
      })
    }
    return null
  })

  ipcMain.handle('browser:getStatus', async () => {
    return {
      running: true,
      port: browserMonitor.getPort(),
      config: browserMonitor.getConfig(),
      mediaCount: browserMonitor.getMediaList().length,
    }
  })

  ipcMain.handle('browser:setConfig', async (_event, config: any) => {
    browserMonitor.setConfig(config)
    return browserMonitor.getConfig()
  })

  // ── Clipboard Monitor ────────────────────────────────────────
  ipcMain.handle('clipboard:getEnabled', async () => {
    return clipboardMonitor.isEnabled()
  })

  ipcMain.handle('clipboard:setEnabled', async (_event, enabled: boolean) => {
    clipboardMonitor.setEnabled(enabled)
    return enabled
  })

  // ── Queue Manager ────────────────────────────────────────────
  ipcMain.handle('queue:getAll', async () => {
    return queueManager.getQueues()
  })

  ipcMain.handle('queue:create', async (_event, name: string, maxConcurrent: number) => {
    return queueManager.createQueue(name, maxConcurrent)
  })

  ipcMain.handle('queue:update', async (_event, id: string, updates: any) => {
    return queueManager.updateQueue(id, updates)
  })

  ipcMain.handle('queue:delete', async (_event, id: string) => {
    return queueManager.deleteQueue(id)
  })

  ipcMain.handle('queue:addDownloads', async (_event, queueId: string, downloadIds: string[]) => {
    return queueManager.addToQueue(queueId, downloadIds)
  })

  ipcMain.handle('queue:setSchedule', async (_event, queueId: string, schedule: any) => {
    return queueManager.setSchedule(queueId, schedule)
  })

  // ── Config ───────────────────────────────────────────────────
  ipcMain.handle('config:get', async () => {
    return defaultConfig
  })

  ipcMain.handle('config:set', async (_event, config: Partial<AppConfig>) => {
    Object.assign(defaultConfig, config)
    return defaultConfig
  })

  // ── Dialog ───────────────────────────────────────────────────
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    return result.filePaths[0] || null
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })
}

app.whenReady().then(() => {
  // Initialize all services
  downloadEngine = new DownloadEngine(defaultConfig, emit)
  browserMonitor = new BrowserMonitor(emit)
  clipboardMonitor = new ClipboardMonitor(emit)
  
  const dbPath = path.join(defaultConfig.downloadDir, '.qdm_data')
  queueManager = new QueueManager(dbPath, emit)

  // Auto-updater
  autoUpdater = new AutoUpdater(emit)

  // Start services
  browserMonitor.start()
  clipboardMonitor.start()
  queueManager.startScheduler()
  autoUpdater.startPeriodicCheck()

  createWindow()
  // createTray()  // Enable on Windows
  setupIPC()

  // ── Auto-updater IPC ──────────────────────────────────────
  ipcMain.handle('update:check', async () => {
    return autoUpdater.checkForUpdates()
  })
  ipcMain.handle('update:getVersion', async () => {
    return autoUpdater.getCurrentVersion()
  })
  ipcMain.handle('update:openRelease', async (_event, version?: string) => {
    return autoUpdater.openReleasePage(version)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  browserMonitor?.stop()
  clipboardMonitor?.stop()
  queueManager?.stopScheduler()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
