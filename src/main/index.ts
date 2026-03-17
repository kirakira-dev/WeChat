import { app, BrowserWindow } from 'electron'
import path from 'path'
import { DataReaderService } from './services/data-reader.service'
import { KeyExtractorService } from './services/key-extractor.service'
import { WeChatApiService } from './services/wechat-api.service'
import { SettingsService } from './services/settings.service'
import { SessionManagerService } from './services/session-manager.service'
import { registerAllHandlers } from './ipc/register-handlers'

let mainWindow: BrowserWindow | null = null

const dataReader = new DataReaderService()
dataReader.initialize()

const keyExtractor = new KeyExtractorService(dataReader)
const api = new WeChatApiService()
const settings = new SettingsService()
const sessionManager = new SessionManagerService(dataReader, keyExtractor, api, settings)

function createWindow(): void {
  const alwaysOnTop = settings.get('keepWindowOnTop')

  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform === 'darwin',
    backgroundColor: '#1f1f1f',
    alwaysOnTop,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  sessionManager.setMainWindow(mainWindow)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (settings.get('confirmBeforeQuit')) {
    mainWindow.on('close', (e) => {
      e.preventDefault()
      const { dialog } = require('electron')
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        buttons: ['Quit', 'Cancel'],
        title: 'Quit WeChat',
        message: 'Are you sure you want to quit?',
      })
      if (choice === 0) {
        mainWindow?.destroy()
      }
    })
  }
}

app.whenReady().then(() => {
  registerAllHandlers(sessionManager, api, settings, dataReader, keyExtractor, () => mainWindow)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
