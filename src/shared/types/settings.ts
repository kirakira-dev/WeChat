export interface AppSettings {
  themeMode: 'light' | 'dark' | 'custom'
  customAccentR: number; customAccentG: number; customAccentB: number
  customBubbleR: number; customBubbleG: number; customBubbleB: number
  customBgR: number; customBgG: number; customBgB: number
  // New theme customization options
  customSelectedR: number; customSelectedG: number; customSelectedB: number
  customHoverR: number; customHoverG: number; customHoverB: number
  customSidebarR: number; customSidebarG: number; customSidebarB: number
  customChatlistR: number; customChatlistG: number; customChatlistB: number
  customInputR: number; customInputG: number; customInputB: number
  customPrimaryTextR: number; customPrimaryTextG: number; customPrimaryTextB: number
  customSecondaryTextR: number; customSecondaryTextG: number; customSecondaryTextB: number
  customBubbleOtherR: number; customBubbleOtherG: number; customBubbleOtherB: number

  fontSize: number
  avatarStyle: 'rounded' | 'circle' | 'square'
  messageDensity: 'compact' | 'normal' | 'comfortable'
  showAvatarsInChat: boolean

  language: string
  launchAtLogin: boolean
  showDockBadge: boolean
  confirmBeforeQuit: boolean
  defaultTab: string
  soundEnabled: boolean
  notificationStyle: string
  autoSwitchToNewChat: boolean
  showMessagePreview: boolean
  keepWindowOnTop: boolean
  minimizeToTray: boolean
  openLinksInApp: boolean

  sendWithReturn: boolean
  showTimestamps: boolean
  showReadReceipts: boolean
  autoPlayVoice: boolean
  autoDownloadImages: boolean
  autoDownloadFiles: boolean
  maxImagePreviewSize: number
  chatHistoryLimit: number

  showOnlineStatus: boolean
  allowStrangerMessages: boolean
  hideTypingIndicator: boolean
  blurMediaInList: boolean
  lockAppWithPassword: boolean

  muteAll: boolean
  groupNotifications: boolean
  mentionNotifications: boolean
  doNotDisturbEnabled: boolean
  doNotDisturbStart: string
  doNotDisturbEnd: string

  enableDebugLog: boolean
  proxyEnabled: boolean
  proxyHost: string
  proxyPort: number
  proxyType: string
  useSystemProxy: boolean
  maxConcurrentDownloads: number
  databaseCacheSize: number
  autoCleanTempFiles: boolean
  tempFileRetentionDays: number
  networkTimeout: number
  enableHardwareAcceleration: boolean
  reduceMotion: boolean
  experimentalMarkdown: boolean
  enableSpellCheck: boolean
  developerMode: boolean
  exportFormat: string
  localMoments: any[]
  starredMessages: { chatId: string; localId: string; content: string; timestamp: number; fromUser: string; chatName: string }[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'dark',
  customAccentR: 0.07, customAccentG: 0.73, customAccentB: 0.33,
  customBubbleR: 0.58, customBubbleG: 0.87, customBubbleB: 0.34,
  customBgR: 0.12, customBgG: 0.12, customBgB: 0.12,
  // Selected field: slightly lighter than bg
  customSelectedR: 0.25, customSelectedG: 0.25, customSelectedB: 0.25,
  // Hover field: between bg and selected
  customHoverR: 0.20, customHoverG: 0.20, customHoverB: 0.20,
  // Sidebar bg
  customSidebarR: 0.15, customSidebarG: 0.15, customSidebarB: 0.15,
  // Chat list bg
  customChatlistR: 0.16, customChatlistG: 0.16, customChatlistB: 0.16,
  // Input bg
  customInputR: 0.18, customInputG: 0.18, customInputB: 0.18,
  // Primary text
  customPrimaryTextR: 0.90, customPrimaryTextG: 0.90, customPrimaryTextB: 0.90,
  // Secondary text
  customSecondaryTextR: 0.55, customSecondaryTextG: 0.55, customSecondaryTextB: 0.55,
  // Other bubble
  customBubbleOtherR: 0.22, customBubbleOtherG: 0.22, customBubbleOtherB: 0.22,

  fontSize: 13,
  avatarStyle: 'rounded',
  messageDensity: 'normal',
  showAvatarsInChat: true,

  language: 'system',
  launchAtLogin: false,
  showDockBadge: true,
  confirmBeforeQuit: false,
  defaultTab: 'chats',
  soundEnabled: true,
  notificationStyle: 'banner',
  autoSwitchToNewChat: true,
  showMessagePreview: true,
  keepWindowOnTop: false,
  minimizeToTray: false,
  openLinksInApp: false,

  sendWithReturn: true,
  showTimestamps: true,
  showReadReceipts: true,
  autoPlayVoice: false,
  autoDownloadImages: true,
  autoDownloadFiles: false,
  maxImagePreviewSize: 200,
  chatHistoryLimit: 200,

  showOnlineStatus: true,
  allowStrangerMessages: false,
  hideTypingIndicator: false,
  blurMediaInList: false,
  lockAppWithPassword: false,

  muteAll: false,
  groupNotifications: true,
  mentionNotifications: true,
  doNotDisturbEnabled: false,
  doNotDisturbStart: '22:00',
  doNotDisturbEnd: '08:00',

  enableDebugLog: false,
  proxyEnabled: false,
  proxyHost: '',
  proxyPort: 1080,
  proxyType: 'SOCKS5',
  useSystemProxy: true,
  maxConcurrentDownloads: 3,
  databaseCacheSize: 50,
  autoCleanTempFiles: true,
  tempFileRetentionDays: 7,
  networkTimeout: 30,
  enableHardwareAcceleration: true,
  reduceMotion: false,
  experimentalMarkdown: false,
  enableSpellCheck: true,
  developerMode: false,
  exportFormat: 'json',
  localMoments: [],
  starredMessages: [],
}
