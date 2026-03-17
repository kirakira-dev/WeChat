/** Plugin metadata stored in plugin manifest or header comment */
export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  entryFile: string
  enabled: boolean
  /** Auto-loaded on startup */
  autoStart: boolean
}

/** Runtime state of a loaded plugin */
export interface PluginState {
  manifest: PluginManifest
  loaded: boolean
  running: boolean
  error: string | null
  logs: PluginLogEntry[]
  registeredEvents: string[]
  registeredTimers: number
  registeredCommands: string[]
}

export interface PluginLogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

/** Serialized plugin info for the renderer */
export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  autoStart: boolean
  running: boolean
  error: string | null
  logs: PluginLogEntry[]
  registeredEvents: string[]
  registeredTimers: number
  registeredCommands: string[]
}

/** All 50+ tools available to plugins, organized by category */
export const PLUGIN_TOOL_CATEGORIES = {
  'Messages': [
    'sendText', 'sendImage', 'sendFile', 'sendVoice', 'sendLink', 'sendCard',
    'forwardMessage', 'recallMessage', 'replyToMessage',
    'getMessages', 'searchMessages', 'getAllMessages', 'getMessageById',
    'deleteLocalMessage', 'markAsRead', 'editMessageLocal',
  ],
  'Contacts': [
    'getContacts', 'getContact', 'searchContacts',
    'setContactRemark', 'getContactRemark',
    'blockContact', 'unblockContact',
    'getAvatar', 'getContactDetail',
    'isContactBlocked',
  ],
  'Groups': [
    'getGroupMembers', 'getGroupInfo',
    'setGroupName', 'setGroupAnnouncement',
    'muteGroup', 'unmuteGroup',
    'getGroupMemberCount', 'isGroupChat',
  ],
  'Sessions': [
    'getSessions', 'getHiddenSessions',
    'selectChat', 'openChat',
    'pinChat', 'unpinChat',
    'muteChat', 'unmuteChat',
    'hideChat', 'unhideChat',
    'getSelectedChat', 'getSessionMessages',
  ],
  'Database': [
    'queryContactDB', 'queryMessageDB', 'querySessionDB',
    'getDBStats', 'getDBPath',
    'globalSearch', 'getCallHistory',
    'getTableList', 'rawQuery',
  ],
  'Export': [
    'exportChatJSON', 'exportChatCSV', 'exportChatHTML',
    'exportAllChats', 'exportContacts',
  ],
  'UI': [
    'showNotification', 'showToast', 'setBadge',
    'setTab', 'setWindowTitle', 'flashWindow',
    'showDialog', 'showInputDialog',
  ],
  'System': [
    'getPlatform', 'getAppVersion',
    'clipboardRead', 'clipboardWrite',
    'openPath', 'openURL',
    'screenshot', 'saveDialog', 'openFileDialog',
  ],
  'Storage': [
    'storeGet', 'storeSet', 'storeDelete', 'storeGetAll', 'storeClear',
  ],
  'Automation': [
    'scheduleMessage', 'cancelScheduledMessage',
    'addAutoReply', 'removeAutoReply', 'getAutoReplies',
    'addKeywordTrigger', 'removeKeywordTrigger',
    'setTimer', 'clearTimer',
    'delay',
  ],
  'Events': [
    'on', 'off', 'once', 'emit',
  ],
  'Network': [
    'httpGet', 'httpPost', 'httpRequest',
    'downloadFile',
  ],
  'Crypto': [
    'md5', 'sha256', 'base64Encode', 'base64Decode',
    'randomUUID', 'randomInt',
  ],
  'Moments': [
    'getMoments', 'addMoment', 'likeMoment', 'commentOnMoment',
  ],
  'Bookmarks': [
    'starMessage', 'unstarMessage', 'getStarredMessages',
  ],
  'Analytics': [
    'getChatStats', 'getWordFrequency', 'getActivityHeatmap',
    'getGroupLeaderboard', 'getResponseTimes',
  ],
} as const
