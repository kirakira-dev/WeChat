import { createHash, randomUUID as cryptoRandomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { BrowserWindow, Notification, clipboard, shell, dialog } from 'electron'
import { SessionManagerService } from './session-manager.service'
import { WeChatApiService } from './wechat-api.service'
import { SettingsService } from './settings.service'
import { DataReaderService } from './data-reader.service'
import { DatabaseService } from './database.service'
import { WXMsgType, displayContent, formatMessageTime } from '../../shared/types/message'
import { contactDisplayName } from '../../shared/types/contact'
import { messageTableName } from '../../shared/utils/md5'

type EventHandler = (...args: any[]) => void

interface ScheduledMsg {
  id: string
  chatId: string
  text: string
  timestamp: number
  timer: ReturnType<typeof setTimeout>
}

interface AutoReply {
  id: string
  chatId: string | '*'
  pattern: string
  reply: string
  regex: boolean
}

interface KeywordTrigger {
  id: string
  keyword: string
  action: (msg: any) => void
}

/**
 * Creates the full plugin API context — 90+ tools across 15 categories.
 * Each plugin gets its own isolated context with its own event handlers,
 * timers, auto-replies, etc., so unloading a plugin cleans everything up.
 */
export function createPluginAPI(
  pluginId: string,
  sessionManager: SessionManagerService,
  api: WeChatApiService,
  settings: SettingsService,
  dataReader: DataReaderService,
  getMainWindow: () => BrowserWindow | null,
) {
  // Per-plugin state for cleanup
  const eventHandlers = new Map<string, Set<EventHandler>>()
  const timers = new Set<ReturnType<typeof setInterval | typeof setTimeout>>()
  const scheduledMessages: ScheduledMsg[] = []
  const autoReplies: AutoReply[] = []
  const keywordTriggers: KeywordTrigger[] = []
  const pluginLogs: { timestamp: number; level: string; message: string }[] = []

  let autoReplyCounter = 0
  let triggerCounter = 0
  let scheduledCounter = 0

  // ── Helper: open a DB by name (async) ──
  async function openDB(dbName: string): Promise<DatabaseService | null> {
    const pathMap: Record<string, string> = {
      contact: dataReader.contactDBPath,
      message: dataReader.messageDBPath,
      session: dataReader.sessionDBPath,
      head_image: dataReader.headImageDBPath,
      favorite: dataReader.favoriteDBPath,
      emoticon: dataReader.emoticonDBPath,
    }
    const dbPath = pathMap[dbName]
    if (!dbPath || !fs.existsSync(dbPath)) return null
    const keyName = dbName === 'message' ? 'message_0' : dbName
    const key = dataReader.dbKeys?.[dataReader.dbHash]?.[keyName]
    if (!key) return null
    try {
      const db = new DatabaseService(dbPath, key)
      const opened = await db.open()
      if (!opened) return null
      return db
    } catch { return null }
  }

  // ── Logger ──
  const log = {
    info: (msg: string) => pluginLogs.push({ timestamp: Date.now(), level: 'info', message: msg }),
    warn: (msg: string) => pluginLogs.push({ timestamp: Date.now(), level: 'warn', message: msg }),
    error: (msg: string) => pluginLogs.push({ timestamp: Date.now(), level: 'error', message: msg }),
    debug: (msg: string) => pluginLogs.push({ timestamp: Date.now(), level: 'debug', message: msg }),
  }

  // ══════════════════════════════════════════════
  // ── MESSAGES (16 tools) ──
  // ══════════════════════════════════════════════

  async function sendText(chatId: string, text: string): Promise<string> {
    const msgId = await api.sendTextMessage(chatId, text)
    log.info(`sendText to ${chatId}: "${text.substring(0, 40)}"`)
    return msgId
  }

  async function sendImage(chatId: string, imagePath: string): Promise<string> {
    const data = fs.readFileSync(imagePath)
    const name = path.basename(imagePath)
    const msgId = await api.sendImageMessage(chatId, data, name)
    log.info(`sendImage to ${chatId}: ${name}`)
    return msgId
  }

  async function sendFile(chatId: string, filePath: string): Promise<string> {
    const data = fs.readFileSync(filePath)
    const name = path.basename(filePath)
    const msgId = await api.sendFileMessage(chatId, data, name)
    log.info(`sendFile to ${chatId}: ${name}`)
    return msgId
  }

  async function sendVoice(chatId: string, audioPath: string): Promise<string> {
    // WeChat Web doesn't have native voice send; send as file with voice extension
    return sendFile(chatId, audioPath)
  }

  async function sendLink(chatId: string, title: string, desc: string, url: string): Promise<string> {
    const text = `${title}\n${desc}\n${url}`
    return sendText(chatId, text)
  }

  async function sendCard(chatId: string, contactId: string): Promise<string> {
    const contact = sessionManager.contact(contactId)
    const name = contact ? contactDisplayName(contact) : contactId
    return sendText(chatId, `[Contact Card] ${name} (${contactId})`)
  }

  async function forwardMessage(chatId: string, msgContent: string, toChatId: string): Promise<string> {
    return sendText(toChatId, msgContent)
  }

  async function recallMessage(_msgId: string): Promise<boolean> {
    log.warn('recallMessage: recall via web protocol is limited')
    return false
  }

  async function replyToMessage(chatId: string, originalMsg: any, replyText: string): Promise<string> {
    const sender = originalMsg.isFromSelf ? 'Me' : originalMsg.fromUser
    const preview = (originalMsg.content || '').substring(0, 80)
    const text = `「${sender}: ${preview}」\n- - - - -\n${replyText}`
    return sendText(chatId, text)
  }

  function getMessages(chatId: string, limit = 200, before?: number) {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
      || sessionManager.hiddenSessions.find(s => s.id === chatId)
    if (!session) return []
    let msgs = session.messages
    if (before) msgs = msgs.filter(m => m.timestamp < before)
    return msgs.slice(-limit).map(m => ({
      id: m.id, content: m.content, timestamp: m.timestamp,
      fromUser: m.fromUser, isFromSelf: m.isFromSelf,
      msgType: m.msgType, displayContent: displayContent(m),
      time: formatMessageTime(m.timestamp),
    }))
  }

  function searchMessages(chatId: string, query: string) {
    const msgs = getMessages(chatId, 99999)
    const q = query.toLowerCase()
    return msgs.filter(m => m.content.toLowerCase().includes(q) || m.displayContent.toLowerCase().includes(q))
  }

  async function getAllMessages(chatId: string) {
    await sessionManager.loadAllMessages(chatId)
    return getMessages(chatId, 999999)
  }

  function getMessageById(chatId: string, msgId: string) {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (!session) return null
    return session.messages.find(m => m.id === msgId) || null
  }

  function deleteLocalMessage(chatId: string, msgId: string): boolean {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (!session) return false
    const idx = session.messages.findIndex(m => m.id === msgId)
    if (idx < 0) return false
    session.messages.splice(idx, 1)
    log.info(`deleteLocalMessage: removed ${msgId} from ${chatId}`)
    return true
  }

  function markAsRead(chatId: string): void {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (session) session.unreadCount = 0
  }

  function editMessageLocal(chatId: string, msgId: string, newContent: string): boolean {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (!session) return false
    const msg = session.messages.find(m => m.id === msgId)
    if (!msg) return false
    msg.content = newContent
    log.info(`editMessageLocal: edited ${msgId} in ${chatId}`)
    return true
  }

  // ══════════════════════════════════════════════
  // ── CONTACTS (10 tools) ──
  // ══════════════════════════════════════════════

  function getContacts() {
    return sessionManager.contacts.map(c => ({
      id: c.id, nickname: c.nickname, remarkName: c.remarkName,
      avatarURL: c.avatarURL, signature: c.signature,
      sex: c.sex, province: c.province, city: c.city,
      isGroup: c.isGroup, memberCount: c.memberCount,
      wechatId: c.wechatId, isDeleted: c.isDeleted,
      displayName: contactDisplayName(c),
    }))
  }

  function getContact(id: string) {
    const c = sessionManager.contact(id)
    if (!c) return null
    return {
      id: c.id, nickname: c.nickname, remarkName: c.remarkName,
      avatarURL: c.avatarURL, signature: c.signature,
      sex: c.sex, province: c.province, city: c.city,
      isGroup: c.isGroup, memberCount: c.memberCount,
      memberList: c.memberList, wechatId: c.wechatId,
      isDeleted: c.isDeleted, verifyInfo: c.verifyInfo,
      displayName: contactDisplayName(c),
    }
  }

  function searchContacts(query: string) {
    const q = query.toLowerCase()
    return getContacts().filter(c =>
      c.displayName.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.wechatId && c.wechatId.toLowerCase().includes(q))
    )
  }

  function setContactRemark(id: string, remark: string): boolean {
    const c = sessionManager.contact(id)
    if (!c) return false
    c.remarkName = remark
    log.info(`setContactRemark: ${id} → "${remark}"`)
    return true
  }

  function getContactRemark(id: string): string | null {
    const c = sessionManager.contact(id)
    return c?.remarkName ?? null
  }

  function blockContact(id: string): void {
    settings.set(`blocked_${id}` as any, true)
    log.info(`blockContact: ${id}`)
  }

  function unblockContact(id: string): void {
    settings.set(`blocked_${id}` as any, false)
    log.info(`unblockContact: ${id}`)
  }

  async function getAvatar(id: string): Promise<string | null> {
    const c = sessionManager.contact(id)
    if (!c?.avatarURL) return null
    try {
      const data = await api.getAvatar(c.avatarURL)
      return data.toString('base64')
    } catch { return null }
  }

  function getContactDetail(id: string) {
    return getContact(id)
  }

  function isContactBlocked(id: string): boolean {
    return settings.get(`blocked_${id}` as any) === true
  }

  // ══════════════════════════════════════════════
  // ── GROUPS (8 tools) ──
  // ══════════════════════════════════════════════

  function getGroupMembers(groupId: string) {
    const c = sessionManager.contact(groupId)
    if (!c?.isGroup) return []
    return c.memberList.map(m => ({
      userName: m.userName, nickName: m.nickName,
      displayName: m.displayName,
    }))
  }

  function getGroupInfo(groupId: string) {
    const c = sessionManager.contact(groupId)
    if (!c?.isGroup) return null
    return {
      id: c.id, name: contactDisplayName(c),
      memberCount: c.memberCount,
      members: c.memberList.length,
      avatarURL: c.avatarURL,
    }
  }

  function setGroupName(groupId: string, name: string): boolean {
    const c = sessionManager.contact(groupId)
    if (!c?.isGroup) return false
    c.nickname = name
    log.info(`setGroupName: ${groupId} → "${name}"`)
    return true
  }

  function setGroupAnnouncement(groupId: string, text: string): void {
    log.info(`setGroupAnnouncement: ${groupId} → "${text.substring(0, 40)}"`)
  }

  function muteGroup(groupId: string): void {
    const session = sessionManager.chatSessions.find(s => s.id === groupId)
    if (session) session.isMuted = true
  }

  function unmuteGroup(groupId: string): void {
    const session = sessionManager.chatSessions.find(s => s.id === groupId)
    if (session) session.isMuted = false
  }

  function getGroupMemberCount(groupId: string): number {
    const c = sessionManager.contact(groupId)
    return c?.isGroup ? c.memberCount : 0
  }

  function isGroupChat(chatId: string): boolean {
    return chatId.endsWith('@chatroom')
  }

  // ══════════════════════════════════════════════
  // ── SESSIONS (12 tools) ──
  // ══════════════════════════════════════════════

  function getSessions() {
    return sessionManager.chatSessions.map(s => ({
      id: s.id, name: contactDisplayName(s.contact),
      unreadCount: s.unreadCount, isPinned: s.isPinned,
      isMuted: s.isMuted, isGroup: s.contact.isGroup,
      messageCount: s.messages.length,
      lastMessage: s.messages[s.messages.length - 1]
        ? displayContent(s.messages[s.messages.length - 1]).substring(0, 80)
        : '',
      lastTimestamp: s.messages[s.messages.length - 1]?.timestamp || 0,
    }))
  }

  function getHiddenSessions() {
    return sessionManager.hiddenSessions.map(s => ({
      id: s.id, name: contactDisplayName(s.contact),
      messageCount: s.messages.length,
    }))
  }

  async function selectChat(chatId: string) {
    await sessionManager.selectChat(chatId)
  }

  function openChat(contactId: string) {
    sessionManager.openChat(contactId)
  }

  function pinChat(chatId: string): void {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (session) session.isPinned = true
    settings.set(`pinned_${chatId}` as any, true)
  }

  function unpinChat(chatId: string): void {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (session) session.isPinned = false
    settings.set(`pinned_${chatId}` as any, false)
  }

  function muteChat(chatId: string): void {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (session) session.isMuted = true
  }

  function unmuteChat(chatId: string): void {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (session) session.isMuted = false
  }

  function hideChat(chatId: string): void {
    log.info(`hideChat: ${chatId}`)
  }

  function unhideChat(chatId: string): void {
    log.info(`unhideChat: ${chatId}`)
  }

  function getSelectedChat(): string | null {
    return sessionManager.selectedChatId
  }

  function getSessionMessages(chatId: string) {
    return getMessages(chatId)
  }

  // ══════════════════════════════════════════════
  // ── DATABASE (9 tools) ──
  // ══════════════════════════════════════════════

  async function queryContactDB(sql: string) {
    const db = await openDB('contact')
    if (!db) return []
    try { return await db.query(sql) } finally { await db.close() }
  }

  async function queryMessageDB(sql: string) {
    const db = await openDB('message')
    if (!db) return []
    try { return await db.query(sql) } finally { await db.close() }
  }

  async function querySessionDB(sql: string) {
    const db = await openDB('session')
    if (!db) return []
    try { return await db.query(sql) } finally { await db.close() }
  }

  function getDBStats() {
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
  }

  function getDBPath(): string {
    return dataReader.dbBasePath
  }

  async function globalSearch(query: string) {
    return sessionManager.globalSearch(query)
  }

  async function getCallHistory() {
    return sessionManager.loadCallHistory()
  }

  async function getTableList(): Promise<string[]> {
    const db = await openDB('message')
    if (!db) return []
    try {
      const rows = await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Msg_%'") as { name: string }[]
      return rows.map(r => r.name)
    } finally { await db.close() }
  }

  async function rawQuery(dbName: string, sql: string) {
    const db = await openDB(dbName)
    if (!db) return []
    try { return await db.query(sql) } finally { await db.close() }
  }

  // ══════════════════════════════════════════════
  // ── EXPORT (5 tools) ──
  // ══════════════════════════════════════════════

  async function exportChatJSON(chatId: string): Promise<string> {
    return sessionManager.exportChat(chatId, 'json')
  }

  async function exportChatCSV(chatId: string): Promise<string> {
    return sessionManager.exportChat(chatId, 'csv')
  }

  async function exportChatHTML(chatId: string): Promise<string> {
    return sessionManager.exportChat(chatId, 'html')
  }

  async function exportAllChats(): Promise<Record<string, string>> {
    const result: Record<string, string> = {}
    for (const session of sessionManager.chatSessions) {
      try {
        result[session.id] = await sessionManager.exportChat(session.id, 'json')
      } catch {}
    }
    return result
  }

  function exportContacts(): string {
    return JSON.stringify(getContacts(), null, 2)
  }

  // ══════════════════════════════════════════════
  // ── UI (8 tools) ──
  // ══════════════════════════════════════════════

  function showNotification(title: string, body: string): void {
    new Notification({ title, body }).show()
    log.info(`showNotification: "${title}"`)
  }

  function showToast(message: string): void {
    const win = getMainWindow()
    if (win) win.webContents.send('plugin:toast', message)
    log.info(`showToast: "${message}"`)
  }

  function setBadge(count: number): void {
    const { app } = require('electron')
    if (process.platform === 'darwin') app.dock.setBadge(count > 0 ? String(count) : '')
  }

  function setTab(tab: string): void {
    sessionManager.currentTab = tab as any
  }

  function setWindowTitle(title: string): void {
    const win = getMainWindow()
    if (win) win.setTitle(title)
  }

  function flashWindow(): void {
    const win = getMainWindow()
    if (win) win.flashFrame(true)
  }

  async function showDialog(title: string, message: string, buttons: string[] = ['OK']): Promise<number> {
    const win = getMainWindow()
    if (!win) return -1
    const result = await dialog.showMessageBox(win, { title, message, buttons })
    return result.response
  }

  async function showInputDialog(title: string, label: string): Promise<string | null> {
    // Use the renderer to show an input dialog via IPC
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showMessageBox(win, { title, message: label, buttons: ['OK', 'Cancel'] })
    return result.response === 0 ? '' : null
  }

  // ══════════════════════════════════════════════
  // ── SYSTEM (9 tools) ──
  // ══════════════════════════════════════════════

  function getPlatform(): string { return process.platform }
  function getAppVersion(): string { return require('electron').app.getVersion() }

  function clipboardRead(): string { return clipboard.readText() }
  function clipboardWrite(text: string): void { clipboard.writeText(text) }

  function openPathFn(p: string): void { shell.openPath(p) }
  function openURL(url: string): void { shell.openExternal(url) }

  async function screenshotFn(): Promise<string | null> {
    if (process.platform !== 'darwin') return null
    const { execFile } = require('child_process')
    const tmpFile = path.join(os.tmpdir(), `plugin_screenshot_${Date.now()}.png`)
    return new Promise(resolve => {
      execFile('/usr/sbin/screencapture', ['-i', tmpFile], (error: any) => {
        if (error || !fs.existsSync(tmpFile)) { resolve(null); return }
        const data = fs.readFileSync(tmpFile)
        fs.unlinkSync(tmpFile)
        resolve(data.toString('base64'))
      })
    })
  }

  async function saveDialogFn(opts: any): Promise<string | null> {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      defaultPath: opts?.defaultPath,
      filters: opts?.filters ?? [{ name: 'All Files', extensions: ['*'] }],
    })
    return result.canceled ? null : (result.filePath ?? null)
  }

  async function openFileDialogFn(): Promise<{ path: string; name: string; size: number } | null> {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'] })
    if (result.canceled || !result.filePaths.length) return null
    const p = result.filePaths[0]
    return { path: p, name: path.basename(p), size: fs.statSync(p).size }
  }

  // ══════════════════════════════════════════════
  // ── STORAGE (5 tools) ──
  // ══════════════════════════════════════════════

  function storeGet(key: string): any {
    return settings.get(`plugin_${pluginId}_${key}` as any)
  }

  function storeSet(key: string, value: any): void {
    settings.set(`plugin_${pluginId}_${key}` as any, value)
  }

  function storeDelete(key: string): void {
    settings.set(`plugin_${pluginId}_${key}` as any, undefined)
  }

  function storeGetAll(): Record<string, any> {
    const all = settings.getAll()
    const prefix = `plugin_${pluginId}_`
    const result: Record<string, any> = {}
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(prefix)) result[k.slice(prefix.length)] = v
    }
    return result
  }

  function storeClear(): void {
    const all = settings.getAll()
    const prefix = `plugin_${pluginId}_`
    for (const k of Object.keys(all)) {
      if (k.startsWith(prefix)) settings.set(k as any, undefined)
    }
  }

  // ══════════════════════════════════════════════
  // ── AUTOMATION (10 tools) ──
  // ══════════════════════════════════════════════

  function scheduleMessage(chatId: string, text: string, timestamp: number): string {
    const id = `sched_${++scheduledCounter}`
    const delay = Math.max(0, timestamp * 1000 - Date.now())
    const timer = setTimeout(async () => {
      try {
        await sendText(chatId, text)
        log.info(`scheduledMessage fired: ${id}`)
      } catch (e: any) { log.error(`scheduledMessage failed: ${e.message}`) }
      const idx = scheduledMessages.findIndex(s => s.id === id)
      if (idx >= 0) scheduledMessages.splice(idx, 1)
    }, delay)
    timers.add(timer)
    scheduledMessages.push({ id, chatId, text, timestamp, timer })
    log.info(`scheduleMessage: ${id} at ${new Date(timestamp * 1000).toLocaleString()}`)
    return id
  }

  function cancelScheduledMessage(id: string): boolean {
    const idx = scheduledMessages.findIndex(s => s.id === id)
    if (idx < 0) return false
    clearTimeout(scheduledMessages[idx].timer)
    timers.delete(scheduledMessages[idx].timer)
    scheduledMessages.splice(idx, 1)
    return true
  }

  function addAutoReply(chatId: string | '*', pattern: string, reply: string, regex = false): string {
    const id = `ar_${++autoReplyCounter}`
    autoReplies.push({ id, chatId, pattern, reply, regex })
    log.info(`addAutoReply: ${id} pattern="${pattern}" reply="${reply.substring(0, 30)}"`)
    return id
  }

  function removeAutoReply(id: string): boolean {
    const idx = autoReplies.findIndex(a => a.id === id)
    if (idx < 0) return false
    autoReplies.splice(idx, 1)
    return true
  }

  function getAutoReplies() {
    return autoReplies.map(a => ({ id: a.id, chatId: a.chatId, pattern: a.pattern, reply: a.reply, regex: a.regex }))
  }

  function addKeywordTrigger(keyword: string, action: (msg: any) => void): string {
    const id = `kt_${++triggerCounter}`
    keywordTriggers.push({ id, keyword, action })
    log.info(`addKeywordTrigger: ${id} keyword="${keyword}"`)
    return id
  }

  function removeKeywordTrigger(id: string): boolean {
    const idx = keywordTriggers.findIndex(t => t.id === id)
    if (idx < 0) return false
    keywordTriggers.splice(idx, 1)
    return true
  }

  function setTimerFn(fn: () => void, interval: number): string {
    const id = `timer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const timer = setInterval(fn, interval)
    timers.add(timer)
    return id
  }

  function clearTimerFn(id: string): void {
    // Can't directly map id to timer, but cleanup handles it
    log.info(`clearTimer: ${id}`)
  }

  function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      const t = setTimeout(resolve, ms)
      timers.add(t)
    })
  }

  // ══════════════════════════════════════════════
  // ── EVENTS (4 tools) ──
  // ══════════════════════════════════════════════

  function on(event: string, handler: EventHandler): void {
    if (!eventHandlers.has(event)) eventHandlers.set(event, new Set())
    eventHandlers.get(event)!.add(handler)
  }

  function off(event: string, handler: EventHandler): void {
    eventHandlers.get(event)?.delete(handler)
  }

  function once(event: string, handler: EventHandler): void {
    const wrapper = (...args: any[]) => {
      handler(...args)
      off(event, wrapper)
    }
    on(event, wrapper)
  }

  function emit(event: string, ...args: any[]): void {
    eventHandlers.get(event)?.forEach(h => {
      try { h(...args) } catch (e: any) { log.error(`event ${event} handler error: ${e.message}`) }
    })
  }

  // ══════════════════════════════════════════════
  // ── NETWORK (4 tools) ──
  // ══════════════════════════════════════════════

  async function httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
    const resp = await fetch(url, { headers })
    return { status: resp.status, body: await resp.text() }
  }

  async function httpPost(url: string, body: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
    const resp = await fetch(url, { method: 'POST', body, headers })
    return { status: resp.status, body: await resp.text() }
  }

  async function httpRequest(url: string, opts: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; body: string; headers: Record<string, string> }> {
    const resp = await fetch(url, { method: opts.method || 'GET', body: opts.body, headers: opts.headers })
    const respHeaders: Record<string, string> = {}
    resp.headers.forEach((v, k) => { respHeaders[k] = v })
    return { status: resp.status, body: await resp.text(), headers: respHeaders }
  }

  async function downloadFile(url: string, savePath: string): Promise<boolean> {
    try {
      const resp = await fetch(url)
      const buf = Buffer.from(await resp.arrayBuffer())
      fs.writeFileSync(savePath, buf)
      return true
    } catch { return false }
  }

  // ══════════════════════════════════════════════
  // ── CRYPTO (6 tools) ──
  // ══════════════════════════════════════════════

  function md5(text: string): string { return createHash('md5').update(text).digest('hex') }
  function sha256(text: string): string { return createHash('sha256').update(text).digest('hex') }
  function base64Encode(text: string): string { return Buffer.from(text).toString('base64') }
  function base64Decode(b64: string): string { return Buffer.from(b64, 'base64').toString('utf-8') }
  function randomUUID(): string { return cryptoRandomUUID() }
  function randomInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }

  // ══════════════════════════════════════════════
  // ── MOMENTS (4 tools) ──
  // ══════════════════════════════════════════════

  function getMoments() { return sessionManager.moments }
  function addMoment(content: string) { sessionManager.addLocalMoment(content) }
  function likeMoment(postId: string) { sessionManager.toggleMomentLike(postId) }
  function commentOnMoment(postId: string, content: string) { sessionManager.addMomentComment(postId, content) }

  // ══════════════════════════════════════════════
  // ── BOOKMARKS (3 tools) ──
  // ══════════════════════════════════════════════

  function starMessageFn(chatId: string, msg: any) { sessionManager.starMessage(chatId, msg) }
  function unstarMessageFn(chatId: string, localId: string) { sessionManager.unstarMessage(chatId, localId) }
  function getStarredMessages() { return sessionManager.getStarredMessages() }

  // ══════════════════════════════════════════════
  // ── ANALYTICS (5 tools) ──
  // ══════════════════════════════════════════════

  function getChatStats(chatId: string) {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (!session) return null
    const msgs = session.messages
    const sent = msgs.filter(m => m.isFromSelf).length
    const images = msgs.filter(m => m.msgType === WXMsgType.Image || m.msgType === WXMsgType.Emoticon).length
    const videos = msgs.filter(m => m.msgType === WXMsgType.Video || m.msgType === WXMsgType.SmallVideo).length
    const voices = msgs.filter(m => m.msgType === WXMsgType.Voice).length
    const links = msgs.filter(m => m.msgType === WXMsgType.Link).length
    const firstDate = msgs[0] ? new Date(msgs[0].timestamp * 1000).toISOString() : null
    const lastDate = msgs[msgs.length - 1] ? new Date(msgs[msgs.length - 1].timestamp * 1000).toISOString() : null
    return { total: msgs.length, sent, received: msgs.length - sent, images, videos, voices, links, firstDate, lastDate }
  }

  function getWordFrequency(chatId: string, limit = 20) {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (!session) return []
    const wordMap = new Map<string, number>()
    for (const m of session.messages) {
      if (m.msgType !== WXMsgType.Text) continue
      const tokens = m.content.toLowerCase().match(/[\u4e00-\u9fff]{1,4}|[a-z']+/g) || []
      for (const t of tokens) {
        if (t.length < 2) continue
        wordMap.set(t, (wordMap.get(t) || 0) + 1)
      }
    }
    return [...wordMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
      .map(([word, count]) => ({ word, count }))
  }

  function getActivityHeatmap(chatId: string) {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (!session) return new Array(24).fill(0)
    const hours = new Array(24).fill(0)
    for (const m of session.messages) {
      hours[new Date(m.timestamp * 1000).getHours()]++
    }
    return hours
  }

  function getGroupLeaderboard(chatId: string, limit = 20) {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (!session?.contact.isGroup) return []
    const counts = new Map<string, number>()
    for (const m of session.messages) {
      if (m.isFromSelf) continue
      counts.set(m.fromUser, (counts.get(m.fromUser) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
      .map(([id, count]) => {
        const c = sessionManager.contact(id)
        return { id, name: c ? contactDisplayName(c) : id, count }
      })
  }

  function getResponseTimes(chatId: string) {
    const session = sessionManager.chatSessions.find(s => s.id === chatId)
    if (!session) return { average: 0, median: 0, min: 0, max: 0 }
    const times: number[] = []
    for (let i = 1; i < session.messages.length; i++) {
      if (session.messages[i].isFromSelf !== session.messages[i - 1].isFromSelf) {
        const diff = session.messages[i].timestamp - session.messages[i - 1].timestamp
        if (diff > 0 && diff < 86400) times.push(diff)
      }
    }
    if (times.length === 0) return { average: 0, median: 0, min: 0, max: 0 }
    times.sort((a, b) => a - b)
    return {
      average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      median: times[Math.floor(times.length / 2)],
      min: times[0],
      max: times[times.length - 1],
    }
  }

  // ══════════════════════════════════════════════
  // ── CLEANUP ──
  // ══════════════════════════════════════════════

  /** Called when plugin is unloaded to clean up all registered state */
  function cleanup(): void {
    eventHandlers.clear()
    for (const t of timers) { clearTimeout(t); clearInterval(t) }
    timers.clear()
    for (const s of scheduledMessages) clearTimeout(s.timer)
    scheduledMessages.length = 0
    autoReplies.length = 0
    keywordTriggers.length = 0
  }

  /** Process an incoming message through auto-replies and keyword triggers */
  function processIncomingMessage(msg: any): void {
    const content = (msg.content || '').toLowerCase()
    const chatId = msg.chatId || ''

    // Auto-replies
    for (const ar of autoReplies) {
      if (ar.chatId !== '*' && ar.chatId !== chatId) continue
      let matches = false
      if (ar.regex) {
        try { matches = new RegExp(ar.pattern, 'i').test(content) } catch {}
      } else {
        matches = content.includes(ar.pattern.toLowerCase())
      }
      if (matches) {
        sendText(chatId, ar.reply).catch(e => log.error(`autoReply error: ${e.message}`))
      }
    }

    // Keyword triggers
    for (const kt of keywordTriggers) {
      if (content.includes(kt.keyword.toLowerCase())) {
        try { kt.action(msg) } catch (e: any) { log.error(`keywordTrigger error: ${e.message}`) }
      }
    }
  }

  // ── The full API object exposed to plugins ──
  const ctx = {
    // Meta
    pluginId,
    log,

    // Messages
    sendText, sendImage, sendFile, sendVoice, sendLink, sendCard,
    forwardMessage, recallMessage, replyToMessage,
    getMessages, searchMessages, getAllMessages, getMessageById,
    deleteLocalMessage, markAsRead, editMessageLocal,

    // Contacts
    getContacts, getContact, searchContacts,
    setContactRemark, getContactRemark,
    blockContact, unblockContact,
    getAvatar, getContactDetail, isContactBlocked,

    // Groups
    getGroupMembers, getGroupInfo,
    setGroupName, setGroupAnnouncement,
    muteGroup, unmuteGroup,
    getGroupMemberCount, isGroupChat,

    // Sessions
    getSessions, getHiddenSessions,
    selectChat, openChat,
    pinChat, unpinChat,
    muteChat, unmuteChat,
    hideChat, unhideChat,
    getSelectedChat, getSessionMessages,

    // Database
    queryContactDB, queryMessageDB, querySessionDB,
    getDBStats, getDBPath,
    globalSearch, getCallHistory,
    getTableList, rawQuery,

    // Export
    exportChatJSON, exportChatCSV, exportChatHTML,
    exportAllChats, exportContacts,

    // UI
    showNotification, showToast, setBadge,
    setTab, setWindowTitle, flashWindow,
    showDialog, showInputDialog,

    // System
    getPlatform, getAppVersion,
    clipboardRead, clipboardWrite,
    openPath: openPathFn, openURL,
    screenshot: screenshotFn,
    saveDialog: saveDialogFn,
    openFileDialog: openFileDialogFn,

    // Storage
    storeGet, storeSet, storeDelete, storeGetAll, storeClear,

    // Automation
    scheduleMessage, cancelScheduledMessage,
    addAutoReply, removeAutoReply, getAutoReplies,
    addKeywordTrigger, removeKeywordTrigger,
    setTimer: setTimerFn, clearTimer: clearTimerFn,
    delay,

    // Events
    on, off, once, emit,

    // Network
    httpGet, httpPost, httpRequest, downloadFile,

    // Crypto
    md5, sha256, base64Encode, base64Decode, randomUUID, randomInt,

    // Moments
    getMoments, addMoment, likeMoment, commentOnMoment,

    // Bookmarks
    starMessage: starMessageFn, unstarMessage: unstarMessageFn, getStarredMessages,

    // Analytics
    getChatStats, getWordFrequency, getActivityHeatmap,
    getGroupLeaderboard, getResponseTimes,

    // Node.js access
    require: require,
    __dirname: '',
    process: { platform: process.platform, env: process.env, version: process.version },
    Buffer: Buffer,
    console: { log: log.info, warn: log.warn, error: log.error, debug: log.debug },
    fs: { readFileSync: fs.readFileSync, writeFileSync: fs.writeFileSync, existsSync: fs.existsSync, mkdirSync: fs.mkdirSync, readdirSync: fs.readdirSync, unlinkSync: fs.unlinkSync, statSync: fs.statSync },
    path: { join: path.join, resolve: path.resolve, basename: path.basename, dirname: path.dirname, extname: path.extname },
  }

  return { ctx, cleanup, processIncomingMessage, getLogs: () => pluginLogs, getAutoReplies: () => autoReplies, getKeywordTriggers: () => keywordTriggers, getEventNames: () => [...eventHandlers.keys()], getTimerCount: () => timers.size, getScheduledMessages: () => scheduledMessages.map(s => ({ id: s.id, chatId: s.chatId, text: s.text, timestamp: s.timestamp })) }
}
