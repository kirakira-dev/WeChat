import type { SessionState } from '../../shared/types/api'
import type { AppSettings } from '../../shared/types/settings'
import type { GlobalSearchResult } from '../../shared/types/search'
import type { CallRecord } from '../../shared/types/call'
import type { PluginInfo, PluginManifest } from '../../shared/types/plugin'

interface ElectronAPI {
  dbInitialize: () => Promise<SessionState>
  dbLoadMessages: (sessionId: string) => Promise<SessionState>
  dbExtractKeys: () => Promise<SessionState>
  dbImportKey: (keyJson: string) => Promise<SessionState>

  apiGetUUID: () => Promise<string>
  apiGetQRCode: () => Promise<string>
  apiPollLogin: () => Promise<{ success: boolean; redirectURL?: string }>
  apiCompleteLogin: (url: string) => Promise<SessionState>
  apiSendText: (to: string, text: string) => Promise<SessionState>
  apiSendImage: (to: string, base64: string, filename: string) => Promise<SessionState>
  apiSendFile: (to: string, base64: string, filename: string) => Promise<SessionState>
  apiGetAvatar: (path: string) => Promise<string | null>
  apiLogout: () => Promise<SessionState>
  apiRestoreSession: () => Promise<{ restored: boolean; state: SessionState }>

  settingsGetAll: () => Promise<AppSettings>
  settingsGet: (key: string) => Promise<any>
  settingsSet: (key: string, value: any) => Promise<void>
  settingsReset: () => Promise<void>

  systemOpenPath: (path: string) => Promise<void>
  systemOpenFileDialog: () => Promise<{ path: string; name: string; data: string } | null>
  systemCaptureScreenshot: () => Promise<string | null>
  systemClipboardWrite: (text: string) => Promise<void>
  systemGetPlatform: () => Promise<string>
  systemGetDBPath: () => Promise<string>
  systemGetDBSizes: () => Promise<Record<string, number>>
  systemSaveDialog: (opts: any) => Promise<string | null>

  momentsRefresh: () => Promise<SessionState>
  momentsAddPost: (content: string) => Promise<SessionState>
  momentsToggleLike: (postId: string) => Promise<SessionState>
  momentsAddComment: (postId: string, content: string) => Promise<SessionState>

  dbGlobalSearch: (query: string) => Promise<GlobalSearchResult[]>
  dbExportChat: (sessionId: string, format: string, filePath: string) => Promise<{ success: boolean; error?: string }>
  dbLoadHiddenSessions: () => Promise<SessionState>
  dbLoadMoreMessages: (sessionId: string, beforeTimestamp: number) => Promise<SessionState>
  dbLoadAllMessages: (sessionId: string) => Promise<SessionState>
  dbGetCallHistory: () => Promise<CallRecord[]>

  favoritesStar: (chatId: string, msg: any) => Promise<void>
  favoritesUnstar: (chatId: string, localId: string) => Promise<void>
  favoritesGet: () => Promise<any[]>

  pluginList: () => Promise<PluginInfo[]>
  pluginLoad: (id: string) => Promise<PluginInfo>
  pluginUnload: (id: string) => Promise<void>
  pluginReload: (id: string) => Promise<PluginInfo>
  pluginEnable: (id: string, enabled: boolean) => Promise<void>
  pluginDelete: (id: string) => Promise<void>
  pluginCreate: (name: string, template: string) => Promise<PluginManifest>
  pluginInstall: (filePath: string) => Promise<PluginManifest>
  pluginGetInfo: (id: string) => Promise<PluginInfo | null>
  pluginRunCode: (code: string) => Promise<string>
  pluginExec: (id: string, code: string) => Promise<string>
  pluginGetDir: () => Promise<string>

  fileOpenLocal: (filePath: string) => Promise<string>
  fileSaveAttachment: (srcPath: string, defaultName: string) => Promise<{ success: boolean; error?: string }>
  fileResolvePath: (type: string, identifier: string) => Promise<string | null>
  fileReadVideoThumb: (hash: string) => Promise<string | null>

  getSessionState: () => Promise<SessionState>
  selectChat: (chatId: string) => Promise<SessionState>
  openChat: (contactId: string) => Promise<SessionState>
  setTab: (tab: string) => Promise<SessionState>

  onSessionStateUpdate: (cb: (state: SessionState) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
