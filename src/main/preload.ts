import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants/ipc-channels'

const api = {
  dbInitialize: () => ipcRenderer.invoke(IPC.DB_INITIALIZE),
  dbLoadMessages: (sessionId: string) => ipcRenderer.invoke(IPC.DB_LOAD_MESSAGES, sessionId),
  dbExtractKeys: () => ipcRenderer.invoke(IPC.DB_EXTRACT_KEYS),
  dbImportKey: (keyJson: string) => ipcRenderer.invoke(IPC.DB_IMPORT_KEY, keyJson),

  apiGetUUID: () => ipcRenderer.invoke(IPC.API_GET_UUID),
  apiGetQRCode: () => ipcRenderer.invoke(IPC.API_GET_QR_CODE),
  apiPollLogin: () => ipcRenderer.invoke(IPC.API_POLL_LOGIN),
  apiCompleteLogin: (url: string) => ipcRenderer.invoke(IPC.API_COMPLETE_LOGIN, url),
  apiSendText: (to: string, text: string) => ipcRenderer.invoke(IPC.API_SEND_TEXT, to, text),
  apiSendImage: (to: string, base64: string, filename: string) => ipcRenderer.invoke(IPC.API_SEND_IMAGE, to, base64, filename),
  apiSendFile: (to: string, base64: string, filename: string) => ipcRenderer.invoke(IPC.API_SEND_FILE, to, base64, filename),
  apiGetAvatar: (path: string) => ipcRenderer.invoke(IPC.API_GET_AVATAR, path),
  apiLogout: () => ipcRenderer.invoke(IPC.API_LOGOUT),
  apiRestoreSession: () => ipcRenderer.invoke(IPC.API_RESTORE_SESSION),

  settingsGetAll: () => ipcRenderer.invoke(IPC.SETTINGS_GET_ALL),
  settingsGet: (key: string) => ipcRenderer.invoke(IPC.SETTINGS_GET, key),
  settingsSet: (key: string, value: any) => ipcRenderer.invoke(IPC.SETTINGS_SET, key, value),
  settingsReset: () => ipcRenderer.invoke(IPC.SETTINGS_RESET),

  systemOpenPath: (path: string) => ipcRenderer.invoke(IPC.SYSTEM_OPEN_PATH, path),
  systemOpenFileDialog: () => ipcRenderer.invoke(IPC.SYSTEM_OPEN_FILE_DIALOG),
  systemCaptureScreenshot: () => ipcRenderer.invoke(IPC.SYSTEM_CAPTURE_SCREENSHOT),
  systemClipboardWrite: (text: string) => ipcRenderer.invoke(IPC.SYSTEM_CLIPBOARD_WRITE, text),
  systemGetPlatform: () => ipcRenderer.invoke(IPC.SYSTEM_GET_PLATFORM),
  systemGetDBPath: () => ipcRenderer.invoke(IPC.SYSTEM_GET_DB_PATH),
  systemGetDBSizes: () => ipcRenderer.invoke(IPC.SYSTEM_GET_DB_SIZES),

  momentsRefresh: () => ipcRenderer.invoke(IPC.MOMENTS_REFRESH),
  momentsAddPost: (content: string) => ipcRenderer.invoke(IPC.MOMENTS_ADD_POST, content),
  momentsToggleLike: (postId: string) => ipcRenderer.invoke(IPC.MOMENTS_TOGGLE_LIKE, postId),
  momentsAddComment: (postId: string, content: string) => ipcRenderer.invoke(IPC.MOMENTS_ADD_COMMENT, postId, content),

  dbGlobalSearch: (query: string) => ipcRenderer.invoke(IPC.DB_GLOBAL_SEARCH, query),
  dbExportChat: (sessionId: string, format: string, filePath: string) => ipcRenderer.invoke(IPC.DB_EXPORT_CHAT, sessionId, format, filePath),
  dbLoadHiddenSessions: () => ipcRenderer.invoke(IPC.DB_LOAD_HIDDEN_SESSIONS),
  dbLoadMoreMessages: (sessionId: string, beforeTimestamp: number) => ipcRenderer.invoke(IPC.DB_LOAD_MORE_MESSAGES, sessionId, beforeTimestamp),
  dbLoadAllMessages: (sessionId: string) => ipcRenderer.invoke(IPC.DB_LOAD_ALL_MESSAGES, sessionId),
  dbGetCallHistory: () => ipcRenderer.invoke(IPC.DB_GET_CALL_HISTORY),

  favoritesStar: (chatId: string, msg: any) => ipcRenderer.invoke(IPC.FAVORITES_STAR, chatId, msg),
  favoritesUnstar: (chatId: string, localId: string) => ipcRenderer.invoke(IPC.FAVORITES_UNSTAR, chatId, localId),
  favoritesGet: () => ipcRenderer.invoke(IPC.FAVORITES_GET),

  systemSaveDialog: (opts: any) => ipcRenderer.invoke(IPC.SYSTEM_SAVE_DIALOG, opts),

  pluginList: () => ipcRenderer.invoke(IPC.PLUGIN_LIST),
  pluginLoad: (id: string) => ipcRenderer.invoke(IPC.PLUGIN_LOAD, id),
  pluginUnload: (id: string) => ipcRenderer.invoke(IPC.PLUGIN_UNLOAD, id),
  pluginReload: (id: string) => ipcRenderer.invoke(IPC.PLUGIN_RELOAD, id),
  pluginEnable: (id: string, enabled: boolean) => ipcRenderer.invoke(IPC.PLUGIN_ENABLE, id, enabled),
  pluginDelete: (id: string) => ipcRenderer.invoke(IPC.PLUGIN_DELETE, id),
  pluginCreate: (name: string, template: string) => ipcRenderer.invoke(IPC.PLUGIN_CREATE, name, template),
  pluginInstall: (filePath: string) => ipcRenderer.invoke(IPC.PLUGIN_INSTALL, filePath),
  pluginGetInfo: (id: string) => ipcRenderer.invoke(IPC.PLUGIN_GET_INFO, id),
  pluginRunCode: (code: string) => ipcRenderer.invoke(IPC.PLUGIN_RUN_CODE, code),
  pluginExec: (id: string, code: string) => ipcRenderer.invoke(IPC.PLUGIN_EXEC, id, code),
  pluginGetDir: () => ipcRenderer.invoke(IPC.PLUGIN_GET_DIR),

  fileOpenLocal: (filePath: string) => ipcRenderer.invoke(IPC.FILE_OPEN_LOCAL, filePath),
  fileSaveAttachment: (srcPath: string, defaultName: string) => ipcRenderer.invoke(IPC.FILE_SAVE_ATTACHMENT, srcPath, defaultName),
  fileResolvePath: (type: string, identifier: string) => ipcRenderer.invoke(IPC.FILE_RESOLVE_PATH, type, identifier),
  fileReadVideoThumb: (hash: string) => ipcRenderer.invoke(IPC.FILE_READ_VIDEO_THUMB, hash),

  getSessionState: () => ipcRenderer.invoke('session:get-state'),
  selectChat: (chatId: string) => ipcRenderer.invoke('session:select-chat', chatId),
  openChat: (contactId: string) => ipcRenderer.invoke('session:open-chat', contactId),
  setTab: (tab: string) => ipcRenderer.invoke('session:set-tab', tab),

  onSessionStateUpdate: (cb: (state: any) => void) => {
    const listener = (_: any, state: any) => cb(state)
    ipcRenderer.on(IPC.ON_SESSION_STATE_UPDATE, listener)
    return () => { ipcRenderer.removeListener(IPC.ON_SESSION_STATE_UPDATE, listener) }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
