import { ipcMain, dialog, shell, clipboard, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC } from '../../shared/constants/ipc-channels'
import { SessionManagerService } from '../services/session-manager.service'
import { WeChatApiService } from '../services/wechat-api.service'
import { SettingsService } from '../services/settings.service'
import { DataReaderService } from '../services/data-reader.service'
import { KeyExtractorService } from '../services/key-extractor.service'
import { PluginManagerService } from '../services/plugin-manager.service'

export function registerAllHandlers(
  sessionManager: SessionManagerService,
  api: WeChatApiService,
  settings: SettingsService,
  dataReader: DataReaderService,
  keyExtractor: KeyExtractorService,
  getMainWindow: () => BrowserWindow | null,
): void {
  const pluginManager = new PluginManagerService(sessionManager, api, settings, dataReader, getMainWindow)

  // Auto-load enabled plugins after a short delay
  setTimeout(() => pluginManager.autoLoadPlugins(), 2000)
  ipcMain.handle(IPC.DB_INITIALIZE, async () => {
    await sessionManager.initialize()
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.DB_LOAD_MESSAGES, async (_e, sessionId: string) => {
    const session = sessionManager.chatSessions.find(s => s.id === sessionId)
    if (session) await sessionManager.loadMessagesForSession(session)
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.DB_EXTRACT_KEYS, async () => {
    const extracted = await keyExtractor.extractKeys()
    if (extracted && dataReader.hasKeys) {
      await sessionManager.loadLocalData()
    }
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.DB_IMPORT_KEY, async (_e, keyJson: string) => {
    try {
      const keys = JSON.parse(keyJson)
      dataReader.cacheKeys(keys)
      await sessionManager.loadLocalData()
    } catch {}
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.API_RESTORE_SESSION, async () => {
    const restored = await api.restoreSession()
    if (restored) {
      // Session valid — do a webwxInit to get user info and contacts
      try {
        const messages = await api.webwxInit()
        sessionManager.handleNewMessages(messages)
        const contacts = await api.getContactList()
        sessionManager.handleContactUpdates(contacts)
        sessionManager.isLoggedIn = true
        api.startSyncLoop()
      } catch (err) {
        console.error('[Restore] Init after restore failed:', err)
        api.clearSavedSession()
        return { restored: false, state: sessionManager.getState() }
      }
      return { restored: true, state: sessionManager.getState() }
    }
    return { restored: false, state: sessionManager.getState() }
  })

  ipcMain.handle(IPC.API_GET_UUID, async () => {
    return api.getUUID()
  })

  ipcMain.handle(IPC.API_GET_QR_CODE, async () => {
    const data = await api.getQRCode()
    return data.toString('base64')
  })

  ipcMain.handle(IPC.API_POLL_LOGIN, async () => {
    return api.pollForLogin()
  })

  ipcMain.handle(IPC.API_COMPLETE_LOGIN, async (_e, redirectURL: string) => {
    await api.completeLogin(redirectURL)
    const messages = await api.webwxInit()
    sessionManager.handleNewMessages(messages)
    const contacts = await api.getContactList()
    sessionManager.handleContactUpdates(contacts)
    sessionManager.dataSource = 'webProtocol'
    sessionManager.isLoggedIn = true
    api.startSyncLoop()
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.API_SEND_TEXT, async (_e, to: string, text: string) => {
    await sessionManager.sendMessage(text)
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.API_SEND_IMAGE, async (_e, to: string, base64: string, filename: string) => {
    const data = Buffer.from(base64, 'base64')
    await api.sendImageMessage(to, data, filename)
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.API_SEND_FILE, async (_e, to: string, base64: string, filename: string) => {
    const data = Buffer.from(base64, 'base64')
    await api.sendFileMessage(to, data, filename)
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.API_GET_AVATAR, async (_e, avatarPath: string) => {
    try {
      const data = await api.getAvatar(avatarPath)
      return data.toString('base64')
    } catch { return null }
  })

  ipcMain.handle(IPC.API_LOGOUT, async () => {
    await sessionManager.logout()
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.SETTINGS_GET_ALL, () => settings.getAll())
  ipcMain.handle(IPC.SETTINGS_GET, (_e, key: string) => settings.get(key as any))
  ipcMain.handle(IPC.SETTINGS_SET, (_e, key: string, value: any) => {
    settings.set(key as any, value)
    const win = getMainWindow()
    if (key === 'keepWindowOnTop' && win) win.setAlwaysOnTop(value as boolean)
  })
  ipcMain.handle(IPC.SETTINGS_RESET, () => settings.reset())

  ipcMain.handle(IPC.SYSTEM_OPEN_PATH, (_e, p: string) => shell.openPath(p))
  ipcMain.handle(IPC.SYSTEM_OPEN_FILE_DIALOG, async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'] })
    if (result.canceled || !result.filePaths.length) return null
    const filePath = result.filePaths[0]
    const data = fs.readFileSync(filePath)
    return { path: filePath, name: path.basename(filePath), data: data.toString('base64') }
  })

  ipcMain.handle(IPC.SYSTEM_CAPTURE_SCREENSHOT, async () => {
    if (process.platform === 'darwin') {
      return new Promise<string | null>((resolve) => {
        const tmpFile = path.join(os.tmpdir(), `screenshot_${Date.now()}.png`)
        execFile('/usr/sbin/screencapture', ['-i', tmpFile], (error) => {
          if (error || !fs.existsSync(tmpFile)) { resolve(null); return }
          const data = fs.readFileSync(tmpFile)
          fs.unlinkSync(tmpFile)
          resolve(data.toString('base64'))
        })
      })
    }
    return null
  })

  ipcMain.handle(IPC.SYSTEM_CLIPBOARD_WRITE, (_e, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle(IPC.SYSTEM_GET_PLATFORM, () => process.platform)
  ipcMain.handle(IPC.SYSTEM_GET_DB_PATH, () => dataReader.dbBasePath)
  ipcMain.handle(IPC.SYSTEM_GET_DB_SIZES, () => {
    const sizes: Record<string, number> = {}
    const paths: Record<string, string> = {
      'contact.db': dataReader.contactDBPath,
      'session.db': dataReader.sessionDBPath,
      'message_0.db': dataReader.messageDBPath,
      'head_image.db': dataReader.headImageDBPath,
      'favorite.db': dataReader.favoriteDBPath,
      'emoticon.db': dataReader.emoticonDBPath,
    }
    for (const [name, p] of Object.entries(paths)) {
      try { sizes[name] = fs.statSync(p).size } catch { sizes[name] = 0 }
    }
    return sizes
  })

  // ── Power features ──

  ipcMain.handle(IPC.DB_GLOBAL_SEARCH, async (_e, query: string) => {
    return sessionManager.globalSearch(query)
  })

  ipcMain.handle(IPC.DB_EXPORT_CHAT, async (_e, sessionId: string, format: string, filePath: string) => {
    try {
      const data = await sessionManager.exportChat(sessionId, format as any)
      if (data) { fs.writeFileSync(filePath, data, 'utf-8'); return { success: true } }
      return { success: false, error: 'No data' }
    } catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle(IPC.SYSTEM_SAVE_DIALOG, async (_e, opts: any) => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      defaultPath: opts?.defaultPath,
      filters: opts?.filters ?? [{ name: 'All Files', extensions: ['*'] }],
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle(IPC.DB_LOAD_HIDDEN_SESSIONS, async () => {
    await sessionManager.loadHiddenSessions()
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.DB_LOAD_MORE_MESSAGES, async (_e, sessionId: string, beforeTimestamp: number) => {
    await sessionManager.loadMoreMessages(sessionId, beforeTimestamp)
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.DB_LOAD_ALL_MESSAGES, async (_e, sessionId: string) => {
    await sessionManager.loadAllMessages(sessionId)
    return sessionManager.getState()
  })

  ipcMain.handle(IPC.DB_GET_CALL_HISTORY, async () => {
    return sessionManager.loadCallHistory()
  })

  ipcMain.handle(IPC.FAVORITES_STAR, (_e, chatId: string, msg: any) => {
    sessionManager.starMessage(chatId, msg)
  })

  ipcMain.handle(IPC.FAVORITES_UNSTAR, (_e, chatId: string, localId: string) => {
    sessionManager.unstarMessage(chatId, localId)
  })

  ipcMain.handle(IPC.FAVORITES_GET, () => {
    return sessionManager.getStarredMessages()
  })

  ipcMain.handle(IPC.MOMENTS_REFRESH, async () => {
    await sessionManager.generateMoments()
    return sessionManager.getState()
  })
  ipcMain.handle(IPC.MOMENTS_ADD_POST, (_e, content: string) => {
    sessionManager.addLocalMoment(content)
    return sessionManager.getState()
  })
  ipcMain.handle(IPC.MOMENTS_TOGGLE_LIKE, (_e, postId: string) => {
    sessionManager.toggleMomentLike(postId)
    return sessionManager.getState()
  })
  ipcMain.handle(IPC.MOMENTS_ADD_COMMENT, (_e, postId: string, content: string) => {
    sessionManager.addMomentComment(postId, content)
    return sessionManager.getState()
  })

  ipcMain.handle('session:get-state', () => sessionManager.getState())
  ipcMain.handle('session:select-chat', async (_e, chatId: string) => {
    await sessionManager.selectChat(chatId)
    return sessionManager.getState()
  })
  ipcMain.handle('session:open-chat', (_e, contactId: string) => {
    sessionManager.openChat(contactId)
    return sessionManager.getState()
  })
  ipcMain.handle('session:set-tab', (_e, tab: string) => {
    sessionManager.currentTab = tab as any
    return sessionManager.getState()
  })

  // ── Plugin handlers ──

  ipcMain.handle(IPC.PLUGIN_LIST, () => pluginManager.getAllPluginInfo())

  ipcMain.handle(IPC.PLUGIN_LOAD, async (_e, pluginId: string) => {
    return pluginManager.loadPlugin(pluginId)
  })

  ipcMain.handle(IPC.PLUGIN_UNLOAD, async (_e, pluginId: string) => {
    await pluginManager.unloadPlugin(pluginId)
  })

  ipcMain.handle(IPC.PLUGIN_RELOAD, async (_e, pluginId: string) => {
    return pluginManager.reloadPlugin(pluginId)
  })

  ipcMain.handle(IPC.PLUGIN_ENABLE, (_e, pluginId: string, enabled: boolean) => {
    pluginManager.setPluginEnabled(pluginId, enabled)
  })

  ipcMain.handle(IPC.PLUGIN_DELETE, async (_e, pluginId: string) => {
    await pluginManager.deletePlugin(pluginId)
  })

  ipcMain.handle(IPC.PLUGIN_CREATE, (_e, name: string, template: string) => {
    return pluginManager.createPlugin(name, template as any)
  })

  ipcMain.handle(IPC.PLUGIN_INSTALL, (_e, filePath: string) => {
    return pluginManager.installPluginFromFile(filePath)
  })

  ipcMain.handle(IPC.PLUGIN_GET_INFO, (_e, pluginId: string) => {
    return pluginManager.getPluginInfo(pluginId)
  })

  ipcMain.handle(IPC.PLUGIN_RUN_CODE, async (_e, code: string) => {
    return pluginManager.runCode(code)
  })

  ipcMain.handle(IPC.PLUGIN_EXEC, async (_e, pluginId: string, code: string) => {
    return pluginManager.executeInPlugin(pluginId, code)
  })

  ipcMain.handle(IPC.PLUGIN_GET_DIR, () => pluginManager.getPluginsDir())

  // ── File Transfer ──

  ipcMain.handle(IPC.FILE_OPEN_LOCAL, async (_e, filePath: string) => {
    if (filePath && fs.existsSync(filePath)) {
      return shell.openPath(filePath)
    }
    return 'File not found'
  })

  ipcMain.handle(IPC.FILE_SAVE_ATTACHMENT, async (_e, srcPath: string, defaultName: string) => {
    const win = getMainWindow()
    if (!win || !srcPath || !fs.existsSync(srcPath)) return { success: false, error: 'File not found' }
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName || path.basename(srcPath),
    })
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }
    try {
      fs.copyFileSync(srcPath, result.filePath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.FILE_RESOLVE_PATH, async (_e, type: string, identifier: string) => {
    if (type === 'file') return dataReader.resolveFilePath(identifier)
    if (type === 'video') return dataReader.resolveVideoPath(identifier)
    if (type === 'video_thumb') return dataReader.resolveVideoThumb(identifier)
    return null
  })

  ipcMain.handle(IPC.FILE_READ_VIDEO_THUMB, async (_e, hash: string) => {
    const thumbPath = dataReader.resolveVideoThumb(hash)
    if (!thumbPath) return null
    try {
      return fs.readFileSync(thumbPath).toString('base64')
    } catch { return null }
  })

}
