import fs from 'fs'
import path from 'path'
import os from 'os'
import { BrowserWindow } from 'electron'
import * as fzstd from 'fzstd'
import { WXContact, createEmptyContact, contactDisplayName, isSpecialContact } from '../../shared/types/contact'
import { WXMessage, WXMsgType } from '../../shared/types/message'
import { ChatSession, createSession } from '../../shared/types/session'
import { SessionState, DataSource, DBKeyStatus, LoginState } from '../../shared/types/api'
import { MomentPost, MomentComment, MomentLike } from '../../shared/types/moment'
import { GlobalSearchResult } from '../../shared/types/search'
import { CallRecord } from '../../shared/types/call'
import { IPC } from '../../shared/constants/ipc-channels'
import { SYSTEM_ACCOUNTS } from '../../shared/constants/special-accounts'
import { messageTableName } from '../../shared/utils/md5'
import { DatabaseService } from './database.service'
import { DataReaderService } from './data-reader.service'
import { KeyExtractorService } from './key-extractor.service'
import { WeChatApiService } from './wechat-api.service'
import { SettingsService } from './settings.service'

function isBinaryContent(str: string): boolean {
  let bad = 0
  const sample = str.substring(0, 200)
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i)
    // Non-printable control chars (except newline/tab/carriage-return), replacement char, private use area
    if ((c < 32 && c !== 10 && c !== 13 && c !== 9) || c === 0xFFFD || (c >= 0xE000 && c <= 0xF8FF)) bad++
  }
  return sample.length > 0 && bad > sample.length * 0.15
}

function decompressContent(raw: any): string {
  const buf = raw instanceof Buffer ? raw
    : raw instanceof Uint8Array ? Buffer.from(raw)
    : null
  if (buf && buf.length >= 4 && buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd) {
    try { return Buffer.from(fzstd.decompress(new Uint8Array(buf))).toString('utf-8') }
    catch { return '' }
  }
  if (buf) return buf.toString('utf-8')
  return String(raw ?? '')
}

export class SessionManagerService {
  private contactMap = new Map<string, WXContact>()
  private sessionMap = new Map<string, ChatSession>()
  private contactDB: DatabaseService | null = null
  private messageDB: DatabaseService | null = null
  private sessionDB: DatabaseService | null = null
  private snsDB: DatabaseService | null = null
  private selfRowId = 0
  /** Message log for anti-recall: stores messages by ID so recalled messages can be recovered */
  private messageLog = new Map<string, WXMessage>()
  private messageLogPath = ''

  isLoggedIn = false
  contacts: WXContact[] = []
  chatSessions: ChatSession[] = []
  selectedChatId: string | null = null
  currentTab: 'chats' | 'contacts' | 'moments' | 'calls' | 'bookmarks' = 'chats'
  dataSource: DataSource = 'none'
  dbKeyStatus: DBKeyStatus = { kind: 'checking' }
  statusMessage = ''
  moments: MomentPost[] = []
  hiddenSessions: ChatSession[] = []

  private mainWindow: BrowserWindow | null = null

  constructor(
    private dataReader: DataReaderService,
    private keyExtractor: KeyExtractorService,
    private api: WeChatApiService,
    private settings: SettingsService,
  ) {
    const defaultTab = this.settings.get('defaultTab')
    if (defaultTab === 'contacts') this.currentTab = 'contacts'
    else if (defaultTab === 'moments') this.currentTab = 'moments'

    this.api.onNewMessages = (messages) => this.handleNewMessages(messages)
    this.api.onContactUpdate = (contacts) => this.handleContactUpdates(contacts)
    this.api.onLoginStateChange = (state) => this.pushState()

    // Initialize message log for anti-recall
    this.messageLogPath = path.join(os.homedir(), '.wechat_message_log.json')
    this.loadMessageLog()
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  private loadMessageLog(): void {
    try {
      const data = fs.readFileSync(this.messageLogPath, 'utf-8')
      const entries: [string, WXMessage][] = JSON.parse(data)
      this.messageLog = new Map(entries)
      console.log(`[AntiRecall] Loaded ${this.messageLog.size} logged messages`)
    } catch {
      // No log file yet
    }
  }

  private saveMessageLog(): void {
    try {
      // Keep only messages from the last 7 days to prevent unbounded growth
      const cutoff = Date.now() / 1000 - 7 * 86400
      const entries: [string, WXMessage][] = []
      for (const [id, msg] of this.messageLog) {
        if (msg.timestamp > cutoff) entries.push([id, msg])
      }
      this.messageLog = new Map(entries)
      fs.writeFileSync(this.messageLogPath, JSON.stringify(entries))
    } catch (err) {
      console.error('[AntiRecall] Failed to save message log:', err)
    }
  }

  private logMessage(msg: WXMessage): void {
    if (msg.msgType !== WXMsgType.System && msg.msgType !== WXMsgType.StatusNotify && msg.msgType !== WXMsgType.Recalled) {
      this.messageLog.set(msg.id, { ...msg })
    }
  }

  private pushState(): void {
    if (!this.mainWindow) return
    const state = this.getState()
    this.mainWindow.webContents.send(IPC.ON_SESSION_STATE_UPDATE, state)
  }

  getState(): SessionState {
    return {
      isLoggedIn: this.isLoggedIn,
      contacts: this.contacts,
      chatSessions: this.chatSessions,
      selectedChatId: this.selectedChatId,
      currentTab: this.currentTab,
      dataSource: this.dataSource,
      dbKeyStatus: this.dbKeyStatus,
      statusMessage: this.statusMessage,
      wxid: this.dataReader.wxid,
      loginState: this.api.loginState,
      qrCodeData: this.api.qrCodeData ? this.api.qrCodeData.toString('base64') : null,
      moments: this.moments,
      hiddenSessions: this.hiddenSessions,
    }
  }

  async initialize(): Promise<void> {
    this.statusMessage = 'Checking WeChat data...'
    this.pushState()

    const containerExists = fs.existsSync(this.dataReader.containerBase)
    if (!containerExists) {
      this.statusMessage = 'WeChat data not found. Use QR code login.'
      this.dbKeyStatus = { kind: 'noKey' }
      this.pushState()
      return
    }

    if (!this.dataReader.wxid) {
      this.statusMessage = 'No WeChat user data found. Use QR code login.'
      this.dbKeyStatus = { kind: 'noKey' }
      this.pushState()
      return
    }

    this.statusMessage = `Found user: ${this.dataReader.wxid}`
    this.pushState()

    if (this.dataReader.hasKeys) {
      this.dbKeyStatus = { kind: 'ready' }
      this.pushState()
      await this.loadLocalData()
      return
    }

    this.statusMessage = 'Attempting automatic key extraction...'
    this.dbKeyStatus = { kind: 'extracting' }
    this.pushState()

    const extracted = await this.keyExtractor.extractKeys()
    if (extracted && this.dataReader.hasKeys) {
      console.log('[SessionManager] Auto key extraction succeeded')
      this.dbKeyStatus = { kind: 'ready' }
      this.pushState()
      await this.loadLocalData()
      return
    }

    console.log('[SessionManager] Auto key extraction failed, waiting for manual input')
    this.dbKeyStatus = { kind: 'noKey' }
    this.statusMessage = 'DB keys not found. Run key extractor or enter manually.'
    this.pushState()
  }

  async loadLocalData(): Promise<void> {
    if (!this.dataReader.hasKeys) return

    this.statusMessage = 'Opening databases...'
    this.pushState()

    const tryOpenDB = async (dbPath: string): Promise<DatabaseService | null> => {
      const key = this.dataReader.pragmaKeyForDBFile(dbPath)
      if (!key) return null
      const db = new DatabaseService(dbPath, key)
      return (await db.open()) ? db : null
    }

    this.contactDB = await tryOpenDB(this.dataReader.contactDBPath)
    this.sessionDB = await tryOpenDB(this.dataReader.sessionDBPath)
    this.messageDB = await tryOpenDB(this.dataReader.messageDBPath)
    this.snsDB = await tryOpenDB(this.dataReader.snsDBPath)

    if (!this.contactDB && !this.messageDB && !this.sessionDB) {
      this.statusMessage = 'Failed to open databases. Keys may be stale.'
      this.dbKeyStatus = { kind: 'failed', message: 'All databases failed to open' }
      this.pushState()
      return
    }

    this.statusMessage = 'Loading contacts...'
    this.pushState()

    if (this.contactDB) await this.loadContactsFromDB(this.contactDB)
    if (this.sessionDB) await this.loadSessionsFromDB(this.sessionDB)

    if (this.messageDB) {
      try {
        const idRows = await this.messageDB.query(`SELECT ROWID as rowid FROM Name2Id WHERE user_name = '${this.dataReader.wxid}'`)
        if (idRows.length > 0 && idRows[0].rowid != null) {
          this.selfRowId = idRows[0].rowid as number
          console.log(`[SessionManager] Self rowid in Name2Id: ${this.selfRowId}`)
        } else {
          console.log('[SessionManager] Self wxid not found in Name2Id, using fallback detection')
        }
      } catch (err) {
        console.log('[SessionManager] Name2Id query failed, using fallback detection:', err)
      }
    }

    if (this.messageDB) {
      for (const session of this.chatSessions.slice(0, 20)) {
        await this.loadMessagesForSession(session)
      }
    }

    if (this.sessionDB) await this.loadHiddenSessions()

    this.dataSource = 'localDB'
    this.isLoggedIn = true
    await this.generateMoments()
    this.statusMessage = `Loaded ${this.contacts.length} contacts, ${this.chatSessions.length} conversations`
    this.pushState()
  }

  private async loadContactsFromDB(db: DatabaseService): Promise<void> {
    // Use SELECT * to avoid missing-column errors, then read fields optionally
    const rows = await db.query(`
      SELECT * FROM contact
      WHERE username != ''
      ORDER BY nick_name COLLATE NOCASE
    `)

    for (const row of rows) {
      const userName = (row.username as string) ?? ''
      const nickName = (row.nick_name as string) ?? ''
      const remark = (row.remark as string) ?? ''
      const bigHeadUrl = (row.big_head_url as string) ?? ''
      const smallHeadUrl = (row.small_head_url as string) ?? ''
      const localType = (row.local_type as number) ?? 0
      const desc = (row.description as string) ?? ''
      const alias = (row.alias as string) ?? ''
      const sex = (row.sex as number) ?? 0
      const delFlag = (row.del_flag as number) ?? 0
      const verifyInfo = (row.verify_info as string) ?? ''

      const contact: WXContact = {
        id: userName, nickname: nickName, remarkName: remark,
        avatarURL: bigHeadUrl || smallHeadUrl, sex, signature: desc,
        province: '', city: '', contactFlag: localType, snsFlag: 0,
        isGroup: userName.includes('@chatroom'), memberCount: 0, memberList: [], pinyin: '',
        wechatId: alias || undefined,
        isDeleted: delFlag !== 0 ? true : undefined,
        verifyInfo: verifyInfo || undefined,
      }

      if (!isSpecialContact(userName)) {
        this.contactMap.set(userName, contact)
      }
    }

    this.contacts = Array.from(this.contactMap.values())
      .filter(c => c.id)
      .sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b)))

    console.log(`[SessionManager] Loaded ${this.contacts.length} contacts`)
  }

  private async loadSessionsFromDB(db: DatabaseService): Promise<void> {
    const rows = await db.query(`
      SELECT * FROM SessionTable
      WHERE username != '' AND is_hidden = 0
      ORDER BY sort_timestamp DESC
      LIMIT 200
    `)

    for (const row of rows) {
      const userName = (row.username as string) ?? ''
      if (SYSTEM_ACCOUNTS.has(userName) || userName.startsWith('gh_')) continue

      const unread = (row.unread_count as number) ?? 0
      const rawSummary = row.summary
      let summary = rawSummary instanceof Buffer || rawSummary instanceof Uint8Array
        ? Buffer.from(rawSummary).toString('utf-8') : String(rawSummary ?? '')
      if (isBinaryContent(summary)) summary = ''
      const lastTime = (row.last_timestamp as number) ?? 0
      const lastSender = (row.last_msg_sender as string) ?? ''
      const sortTime = (row.sort_timestamp as number) ?? 0
      const muteNotify = (row.mute_notify as number) ?? 0

      const session = this.getOrCreateSession(userName)
      session.unreadCount = unread
      session.sortTimestamp = sortTime
      session.isMuted = muteNotify === 1

      if (summary) {
        const msg: WXMessage = {
          id: `session_${userName}`, fromUser: lastSender || userName,
          toUser: this.dataReader.wxid, content: summary, msgType: WXMsgType.Text,
          timestamp: lastTime, statusNotifyCode: 0, statusNotifyUserName: '',
          localID: `session_${userName}`, isFromSelf: lastSender === this.dataReader.wxid,
        }
        session.messages = [msg]
      }
    }

    console.log(`[SessionManager] Loaded ${this.chatSessions.length} sessions`)
  }

  async loadMessagesForSession(session: ChatSession): Promise<void> {
    if (!this.messageDB) return
    const tableName = messageTableName(session.id)
    const limit = this.settings.get('chatHistoryLimit')

    const rows = await this.messageDB.query(`
      SELECT local_id, server_id, local_type, real_sender_id, create_time,
             message_content, sort_seq
      FROM ${tableName}
      ORDER BY sort_seq DESC
      LIMIT ${limit}
    `)

    if (!rows.length) return
    const messages: WXMessage[] = []

    for (const row of [...rows].reverse()) {
      const localId = (row.local_id as number) ?? 0
      const serverId = (row.server_id as number) ?? 0
      const localType = (row.local_type as number) ?? 1
      const realSenderId = (row.real_sender_id as number) ?? 0
      const createTime = (row.create_time as number) ?? 0
      const content = decompressContent(row.message_content)
      const actualType = localType & 0xFFFF

      // Anti-recall: don't skip recalled messages, preserve metadata
      if (actualType === WXMsgType.Recalled) {
        if (!content) continue // decompression failed completely
      } else {
        if (!content) continue
        if (isBinaryContent(content)) continue
      }
      // Detect self messages: match by selfRowId, or for 1-on-1 chats use real_sender_id == 0
      // (WeChat sets real_sender_id to 0 or the self rowid for outgoing messages)
      let isSelf = false
      if (this.selfRowId > 0) {
        isSelf = realSenderId === this.selfRowId
      } else {
        // Fallback: in 1-on-1 chats, real_sender_id 0 usually means self
        if (!session.contact.isGroup) {
          isSelf = realSenderId === 0
        }
      }

      let msgContent = content
      let senderID = session.id

      if (session.contact.isGroup) {
        const colonNewline = content.indexOf(':\n')
        if (colonNewline !== -1 && colonNewline < 80) {
          const possibleSender = content.substring(0, colonNewline)
          // Valid sender IDs: wxid_xxx, username, or @chatroom member IDs
          // They won't contain spaces, <, >, or newlines
          if (possibleSender && !possibleSender.includes('<') && !possibleSender.includes(' ') && !possibleSender.includes('>')) {
            senderID = possibleSender
            msgContent = content.substring(colonNewline + 2)
          }
        }
        if (isSelf) senderID = this.dataReader.wxid
      }

      const msgId = String(serverId > 0 ? serverId : localId)

      // Anti-recall: for recalled messages from DB, try to recover original from message log
      if (actualType === WXMsgType.Recalled) {
        const recalledOrigId = this.parseRecallMsgId(content)
        const original = recalledOrigId ? this.messageLog.get(recalledOrigId) : null
        if (original) {
          // Recovered! Show original content with recall annotation
          messages.push({
            ...original,
            recalledAt: createTime,
          })
        } else {
          // No recovery possible, show recall notification
          messages.push({
            id: msgId,
            fromUser: isSelf ? this.dataReader.wxid : senderID,
            toUser: isSelf ? session.id : this.dataReader.wxid,
            content: msgContent, msgType: WXMsgType.Recalled,
            timestamp: createTime, statusNotifyCode: 0, statusNotifyUserName: '',
            localID: String(localId), isFromSelf: isSelf,
          })
        }
      } else {
        messages.push({
          id: msgId,
          fromUser: isSelf ? this.dataReader.wxid : senderID,
          toUser: isSelf ? session.id : this.dataReader.wxid,
          content: msgContent, msgType: actualType as WXMsgType,
          timestamp: createTime, statusNotifyCode: 0, statusNotifyUserName: '',
          localID: String(localId), isFromSelf: isSelf,
        })
      }
    }

    if (messages.length) {
      session.messages = messages
    }
  }

  handleNewMessages(messages: WXMessage[]): void {
    let logDirty = false
    for (const msg of messages) {
      // Anti-recall: intercept recall notifications
      if (msg.msgType === WXMsgType.Recalled || msg.msgType === WXMsgType.System) {
        const recalledMsgId = this.parseRecallMsgId(msg.content)
        if (recalledMsgId) {
          const original = this.messageLog.get(recalledMsgId)
          if (original) {
            // Find and annotate the original message in the session
            const chatID = original.isFromSelf ? original.toUser : original.fromUser
            const session = this.sessionMap.get(chatID)
            if (session) {
              const existing = session.messages.find(m => m.id === recalledMsgId)
              if (existing) {
                existing.recalledAt = msg.timestamp
                console.log(`[AntiRecall] Marked message ${recalledMsgId} as recalled (content preserved)`)
              }
            }
            continue // Don't add the recall notification as a separate message
          }
          // Original not in log — still skip the system recall message,
          // but we can't recover the content
          console.log(`[AntiRecall] Recall for ${recalledMsgId} but original not in log`)
          continue
        }
      }

      // Log every non-system message for future recall recovery
      this.logMessage(msg)
      logDirty = true

      const chatID = msg.isFromSelf ? msg.toUser : msg.fromUser
      const session = this.getOrCreateSession(chatID)
      session.messages.push(msg)
      if (!msg.isFromSelf) session.unreadCount++
      session.sortTimestamp = msg.timestamp

      const idx = this.chatSessions.findIndex(s => s.id === chatID)
      if (idx > 0) {
        const [s] = this.chatSessions.splice(idx, 1)
        this.chatSessions.unshift(s)
      }

      if (this.settings.get('autoSwitchToNewChat') && !msg.isFromSelf && !this.selectedChatId) {
        this.selectedChatId = session.id
      }
    }
    if (logDirty) this.saveMessageLog()
    this.pushState()
  }

  /** Parse a recall/revoke system message to extract the original message ID */
  private parseRecallMsgId(content: string): string | null {
    // WeChat recall notification formats:
    // <sysmsg type="revokemsg"><revokemsg><msgid>1234567890</msgid>...</revokemsg></sysmsg>
    // <msgid>1234567890</msgid>
    const match = content.match(/<msgid>(\d+)<\/msgid>/)
    if (match) return match[1]
    // Also try <newmsgid>
    const match2 = content.match(/<newmsgid>(\d+)<\/newmsgid>/)
    if (match2) return match2[1]
    return null
  }

  handleContactUpdates(updatedContacts: WXContact[]): void {
    for (const contact of updatedContacts) {
      this.contactMap.set(contact.id, contact)
      const session = this.sessionMap.get(contact.id)
      if (session) session.contact = contact
    }
    this.contacts = Array.from(this.contactMap.values())
      .filter(c => !isSpecialContact(c.id) && c.id)
      .sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b)))
    this.pushState()
  }

  getOrCreateSession(userName: string): ChatSession {
    const existing = this.sessionMap.get(userName)
    if (existing) return existing

    const contact = this.contactMap.get(userName) ?? createEmptyContact(userName)
    const session = createSession(userName, contact)
    this.sessionMap.set(userName, session)
    if (!this.chatSessions.some(s => s.id === userName)) {
      this.chatSessions.push(session)
    }
    return session
  }

  async selectChat(chatId: string): Promise<void> {
    this.selectedChatId = chatId
    const session = this.sessionMap.get(chatId)
    if (session) {
      session.unreadCount = 0
      if (this.dataSource === 'localDB' && session.messages.length <= 1) {
        await this.loadMessagesForSession(session)
      }
    }
    this.pushState()
  }

  openChat(contactId: string): void {
    const contact = this.contactMap.get(contactId)
    const session = this.getOrCreateSession(contactId)
    if (contact) session.contact = contact
    if (!this.chatSessions.some(s => s.id === contactId)) {
      this.chatSessions.unshift(session)
    }
    this.selectChat(contactId)
    this.currentTab = 'chats'
    this.pushState()
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.selectedChatId || !text) return
    const chatId = this.selectedChatId

    // Send via web API if we have a valid session
    if (this.api.selfUserName) {
      try {
        await this.api.sendTextMessage(chatId, text)
      } catch (err) {
        console.error('[Send] Failed:', err)
      }
    } else {
      console.warn('[Send] No web API session — message not delivered')
    }

    // Add local echo
    const localMsg: WXMessage = {
      id: `${Date.now()}`, fromUser: this.api.selfUserName || this.dataReader.wxid,
      toUser: chatId, content: text, msgType: WXMsgType.Text,
      timestamp: Date.now() / 1000, statusNotifyCode: 0, statusNotifyUserName: '',
      localID: `${Date.now()}`, isFromSelf: true,
    }

    const session = this.sessionMap.get(chatId)
    if (session) {
      session.messages.push(localMsg)
      session.sortTimestamp = localMsg.timestamp
    }
    this.pushState()
  }

  async logout(): Promise<void> {
    if (this.dataSource === 'webProtocol') {
      try { await this.api.logout() } catch {}
    }
    if (this.contactDB) await this.contactDB.close()
    if (this.messageDB) await this.messageDB.close()
    if (this.sessionDB) await this.sessionDB.close()
    this.isLoggedIn = false
    this.dataSource = 'none'
    this.contacts = []
    this.chatSessions = []
    this.selectedChatId = null
    this.contactMap.clear()
    this.sessionMap.clear()
    this.pushState()
  }

  // ── Moments ──

  async generateMoments(): Promise<void> {
    const posts: MomentPost[] = []
    const localPosts: MomentPost[] = this.settings.get('localMoments') ?? []
    posts.push(...localPosts)

    if (this.snsDB) {
      await this.loadMomentsFromDB(posts)
    }

    posts.sort((a, b) => b.timestamp - a.timestamp)
    this.moments = posts.slice(0, 200)
  }

  private async loadMomentsFromDB(posts: MomentPost[]): Promise<void> {
    if (!this.snsDB) return

    // Discover tables in sns.db
    try {
      const tables = await this.snsDB.query(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      const tableNames = tables.map((t: any) => t.name as string)
      console.log('[Moments] sns.db tables:', tableNames.join(', '))

      // Find the main feed table — common names: snsItem, SnsItem, FeedsV20, TimelineItem, etc.
      const feedTable = tableNames.find(t =>
        /^(sns_?item|feed|timeline_?item|sns_?feed)/i.test(t)
      ) || tableNames.find(t => /sns|feed|timeline|moment/i.test(t))

      if (!feedTable) {
        console.log('[Moments] No feed table found in sns.db, tables:', tableNames)
        return
      }

      console.log('[Moments] Using feed table:', feedTable)

      // Discover columns
      const colInfo = await this.snsDB.query(`PRAGMA table_info('${feedTable}')`)
      const colNames = colInfo.map((c: any) => (c.name as string).toLowerCase())
      console.log('[Moments] Columns:', colNames.join(', '))

      // Query with SELECT * to handle unknown schemas
      const rows = await this.snsDB.query(`SELECT * FROM "${feedTable}" ORDER BY ROWID DESC LIMIT 200`)
      console.log(`[Moments] Loaded ${rows.length} rows from ${feedTable}`)

      for (const row of rows) {
        try {
          const post = this.parseSnsRow(row, colNames)
          if (post) posts.push(post)
        } catch (err) {
          // Skip unparseable rows
        }
      }
    } catch (err) {
      console.error('[Moments] Failed to query sns.db:', err)
    }
  }

  private parseSnsRow(row: any, colNames: string[]): MomentPost | null {
    // Map column names (case-insensitive lookup)
    const get = (names: string[]): any => {
      for (const n of names) {
        // Try original case keys first, then lowercase match
        if (row[n] !== undefined) return row[n]
        for (const key of Object.keys(row)) {
          if (key.toLowerCase() === n.toLowerCase()) return row[key]
        }
      }
      return undefined
    }

    // Try to extract key fields from the row
    const userName = get(['userName', 'user_name', 'username', 'author', 'fromUser', 'from_user', 'wxid']) as string | undefined
    const createTime = get(['createTime', 'create_time', 'timestamp', 'time', 'createtime']) as number | undefined
    const rawContent = get(['content', 'contentObj', 'content_obj', 'contentV2', 'data', 'body'])

    if (!createTime) return null

    // Decompress content if zstd-compressed
    let contentStr = ''
    if (rawContent) {
      contentStr = decompressContent(rawContent)
    }

    // Parse XML content — WeChat Moments content is typically XML with:
    // <TimelineObject>...<contentDesc>text</contentDesc>...</TimelineObject>
    const authorId = userName || 'unknown'
    const contact = this.contactMap.get(authorId)
    const authorName = contact
      ? (contact.remarkName || contact.nickname || authorId)
      : authorId

    const authorAvatar = contact?.avatarURL || ''

    // Extract text content
    let text = ''
    const descMatch = contentStr.match(/<contentDesc>([\s\S]*?)<\/contentDesc>/)
    if (descMatch) {
      text = descMatch[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .trim()
    }

    // If no XML structure, use raw string if it's text
    if (!text && contentStr && !contentStr.startsWith('\x00') && !isBinaryContent(contentStr)) {
      // Might be plain text or simple XML
      const plainText = contentStr.replace(/<[^>]+>/g, '').trim()
      if (plainText.length > 0) text = plainText
    }

    // Extract images from media list
    const images: string[] = []
    const mediaRegex = /<url[^>]*><!\[CDATA\[(.*?)\]\]><\/url[^>]*>/g
    let mediaMatch
    while ((mediaMatch = mediaRegex.exec(contentStr)) !== null) {
      images.push(mediaMatch[1])
    }
    // Also check <thumbUrl> patterns
    const thumbRegex = /<thumbUrl><!\[CDATA\[(.*?)\]\]><\/thumbUrl>/g
    while ((mediaMatch = thumbRegex.exec(contentStr)) !== null) {
      if (!images.includes(mediaMatch[1])) images.push(mediaMatch[1])
    }

    // Extract link info
    let linkTitle = ''
    let linkUrl = ''
    const linkTitleMatch = contentStr.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)
    const linkUrlMatch = contentStr.match(/<url><!\[CDATA\[(.*?)\]\]><\/url>/)
    if (linkTitleMatch) linkTitle = linkTitleMatch[1]
    if (linkUrlMatch) linkUrl = linkUrlMatch[1]

    // Determine post type
    let type: 'text' | 'image' | 'link' | 'repost' = 'text'
    if (linkTitle && linkUrl) type = 'link'
    else if (images.length > 0) type = 'image'

    // Extract likes and comments from the row if available
    const likes: MomentLike[] = []
    const comments: MomentComment[] = []

    // Some schemas store likes/comments as separate columns or embedded XML
    const likeRaw = get(['likeUsers', 'like_users', 'likeList', 'like_list'])
    if (likeRaw) {
      const likeContent = decompressContent(likeRaw)
      const likeRegex = /<username><!\[CDATA\[(.*?)\]\]><\/username>/g
      let likeMatch
      while ((likeMatch = likeRegex.exec(likeContent)) !== null) {
        const likeUserId = likeMatch[1]
        const likeContact = this.contactMap.get(likeUserId)
        likes.push({
          userId: likeUserId,
          userName: likeContact ? (likeContact.remarkName || likeContact.nickname || likeUserId) : likeUserId,
        })
      }
    }

    const commentRaw = get(['commentUsers', 'comment_users', 'commentList', 'comment_list'])
    if (commentRaw) {
      const commentContent = decompressContent(commentRaw)
      const commentBlockRegex = /<comment>([\s\S]*?)<\/comment>/g
      let commentBlock
      while ((commentBlock = commentBlockRegex.exec(commentContent)) !== null) {
        const block = commentBlock[1]
        const cUserMatch = block.match(/<username><!\[CDATA\[(.*?)\]\]><\/username>/)
        const cContentMatch = block.match(/<content><!\[CDATA\[(.*?)\]\]><\/content>/)
        const cTimeMatch = block.match(/<createTime>(\d+)<\/createTime>/)
        if (cUserMatch && cContentMatch) {
          const cUserId = cUserMatch[1]
          const cContact = this.contactMap.get(cUserId)
          comments.push({
            id: `c_${cUserId}_${cTimeMatch?.[1] || '0'}`,
            userId: cUserId,
            userName: cContact ? (cContact.remarkName || cContact.nickname || cUserId) : cUserId,
            content: cContentMatch[1],
            timestamp: cTimeMatch ? parseInt(cTimeMatch[1]) : (createTime || 0),
          })
        }
      }
    }

    // Skip if no meaningful content
    if (!text && images.length === 0 && !linkTitle) return null

    const rowId = get(['ROWID', 'rowid', 'id', 'feedId', 'feed_id', 'snsId', 'sns_id'])

    return {
      id: `sns_${rowId ?? createTime}`,
      authorId,
      authorName,
      authorAvatar,
      content: text,
      images,
      timestamp: createTime,
      likes,
      comments,
      type,
      linkTitle: linkTitle || undefined,
      linkUrl: linkUrl || undefined,
    }
  }

  addLocalMoment(content: string): void {
    const selfContact = this.contactMap.get(this.dataReader.wxid)
    const post: MomentPost = {
      id: `local_${Date.now()}`,
      authorId: this.dataReader.wxid,
      authorName: selfContact?.nickname ?? this.dataReader.wxid,
      authorAvatar: selfContact?.avatarURL ?? '',
      content,
      images: [],
      timestamp: Date.now() / 1000,
      likes: [], comments: [],
      type: 'text',
      isLocal: true,
    }
    const localPosts: MomentPost[] = this.settings.get('localMoments') ?? []
    localPosts.unshift(post)
    this.settings.set('localMoments', localPosts)
    this.moments.unshift(post)
    this.pushState()
  }

  toggleMomentLike(postId: string): void {
    const post = this.moments.find(p => p.id === postId)
    if (!post) return
    const selfId = this.dataReader.wxid
    const selfContact = this.contactMap.get(selfId)
    const existing = post.likes.findIndex(l => l.userId === selfId)
    if (existing >= 0) {
      post.likes.splice(existing, 1)
    } else {
      post.likes.push({ userId: selfId, userName: selfContact?.nickname ?? selfId })
    }
    this.pushState()
  }

  addMomentComment(postId: string, content: string): void {
    const post = this.moments.find(p => p.id === postId)
    if (!post) return
    const selfId = this.dataReader.wxid
    const selfContact = this.contactMap.get(selfId)
    const comment: MomentComment = {
      id: `cmt_${Date.now()}`,
      userId: selfId,
      userName: selfContact?.nickname ?? selfId,
      content,
      timestamp: Date.now() / 1000,
    }
    post.comments.push(comment)
    this.pushState()
  }

  // ── Global Cross-Chat Search ──

  async globalSearch(query: string): Promise<GlobalSearchResult[]> {
    if (!this.messageDB || !query.trim()) return []

    const tables = await this.messageDB.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Msg_%'`
    )
    const results: GlobalSearchResult[] = []
    const escapedQuery = query.replace(/'/g, "''")

    for (const row of tables) {
      const tableName = row.name as string
      try {
        const msgs = await this.messageDB.query(`
          SELECT local_id, create_time, message_content, real_sender_id
          FROM ${tableName}
          WHERE message_content LIKE '%${escapedQuery}%'
            AND (local_type & 0xFFFF) = 1
          ORDER BY create_time DESC
          LIMIT 20
        `)
        if (!msgs.length) continue

        const chatId = this.resolveTableNameToChatId(tableName)
        const session = chatId ? this.sessionMap.get(chatId) : null
        const chatName = session ? contactDisplayName(session.contact) : chatId ?? tableName

        results.push({
          chatId: chatId ?? tableName,
          chatName,
          avatarURL: session?.contact.avatarURL ?? '',
          messages: msgs.map(m => {
            let content = decompressContent(m.message_content)
            // Strip group sender prefix
            const colonNl = content.indexOf(':\n')
            if (colonNl > 0 && colonNl < 80) {
              const prefix = content.substring(0, colonNl)
              if (!prefix.includes('<') && !prefix.includes(' ')) {
                content = content.substring(colonNl + 2)
              }
            }
            return {
              localId: m.local_id as number,
              content: content.substring(0, 200),
              timestamp: m.create_time as number,
              senderName: chatName,
              isFromSelf: this.selfRowId > 0 && (m.real_sender_id as number) === this.selfRowId,
            }
          }),
        })
      } catch { /* skip tables that fail */ }
    }

    return results.sort((a, b) => b.messages.length - a.messages.length)
  }

  private resolveTableNameToChatId(tableName: string): string | null {
    for (const session of this.chatSessions) {
      if (messageTableName(session.id) === tableName) return session.id
    }
    return null
  }

  // ── File Export ──

  async exportChat(sessionId: string, format: 'json' | 'csv' | 'html'): Promise<string> {
    if (!this.messageDB) return ''
    const session = this.sessionMap.get(sessionId)
    const tableName = messageTableName(sessionId)
    const name = session ? contactDisplayName(session.contact) : sessionId

    const rows = await this.messageDB.query(`
      SELECT local_id, server_id, local_type, real_sender_id, create_time, message_content
      FROM ${tableName}
      ORDER BY create_time ASC
    `)

    const messages: { time: string; sender: string; type: string; content: string }[] = []
    for (const row of rows) {
      let content = decompressContent(row.message_content)
      if (!content || isBinaryContent(content)) continue

      const actualType = (row.local_type as number) & 0xFFFF
      const isSelf = this.selfRowId > 0 && (row.real_sender_id as number) === this.selfRowId
      const time = new Date((row.create_time as number) * 1000).toISOString()

      let senderName = isSelf ? 'Me' : name
      if (session?.contact.isGroup) {
        const colonNl = content.indexOf(':\n')
        if (colonNl > 0 && colonNl < 80) {
          const prefix = content.substring(0, colonNl)
          if (!prefix.includes('<') && !prefix.includes(' ')) {
            senderName = isSelf ? 'Me' : prefix
            content = content.substring(colonNl + 2)
          }
        }
      }

      const typeNames: Record<number, string> = {
        1: 'Text', 3: 'Image', 34: 'Voice', 43: 'Video', 47: 'Sticker',
        48: 'Location', 49: 'Link', 10000: 'System', 10002: 'Recalled',
      }

      messages.push({ time, sender: senderName, type: typeNames[actualType] ?? 'Other', content: content.substring(0, 2000) })
    }

    if (format === 'json') {
      return JSON.stringify({ chatName: name, exportDate: new Date().toISOString(), totalMessages: messages.length, messages }, null, 2)
    }
    if (format === 'csv') {
      const header = 'Time,Sender,Type,Content'
      const csvRows = messages.map(m => `"${m.time}","${m.sender.replace(/"/g, '""')}","${m.type}","${m.content.replace(/"/g, '""').replace(/\n/g, ' ')}"`)
      return header + '\n' + csvRows.join('\n')
    }
    // HTML
    const msgHtml = messages.map(m => {
      const isSelf = m.sender === 'Me'
      return `<div class="msg ${isSelf ? 'self' : 'other'}"><span class="sender">${m.sender}</span><span class="time">${m.time.replace('T', ' ').substring(0, 19)}</span><div class="bubble ${isSelf ? 'self' : 'other'}">${m.content.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div></div>`
    }).join('\n')
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chat: ${name}</title><style>
body{font-family:-apple-system,sans-serif;background:#1f1f1f;color:#e6e6e6;margin:0;padding:20px}
h1{font-size:18px;color:#12ba54;margin-bottom:20px}.msg{margin:8px 0;display:flex;flex-direction:column}
.msg.self{align-items:flex-end}.msg.other{align-items:flex-start}
.sender{font-size:11px;color:#8c8c8c;margin-bottom:2px}.time{font-size:9px;color:#666;margin-bottom:2px}
.bubble{padding:8px 12px;border-radius:12px;max-width:60%;word-wrap:break-word;font-size:13px}
.bubble.self{background:#94de57;color:#000;border-top-right-radius:3px}
.bubble.other{background:#383838;color:#e6e6e6;border-top-left-radius:3px}
</style></head><body><h1>Chat: ${name}</h1><p style="color:#8c8c8c;font-size:12px">${messages.length} messages | Exported ${new Date().toLocaleString()}</p><hr style="border-color:#404040">${msgHtml}</body></html>`
  }

  // ── Hidden Chats ──

  async loadHiddenSessions(): Promise<void> {
    if (!this.sessionDB) return
    const rows = await this.sessionDB.query(`
      SELECT * FROM SessionTable
      WHERE username != '' AND is_hidden = 1
      ORDER BY sort_timestamp DESC
      LIMIT 200
    `)

    this.hiddenSessions = []
    for (const row of rows) {
      const userName = (row.username as string) ?? ''
      if (SYSTEM_ACCOUNTS.has(userName) || userName.startsWith('gh_')) continue

      const contact = this.contactMap.get(userName) ?? createEmptyContact(userName)
      const rawSummary = row.summary
      let summary = rawSummary instanceof Buffer || rawSummary instanceof Uint8Array
        ? Buffer.from(rawSummary).toString('utf-8') : String(rawSummary ?? '')
      if (isBinaryContent(summary)) summary = ''

      const session = createSession(userName, contact)
      session.unreadCount = (row.unread_count as number) ?? 0
      session.sortTimestamp = (row.sort_timestamp as number) ?? 0
      session.isMuted = (row.mute_notify as number) === 1

      if (summary) {
        session.messages = [{
          id: `hidden_${userName}`, fromUser: (row.last_msg_sender as string) || userName,
          toUser: this.dataReader.wxid, content: summary, msgType: WXMsgType.Text,
          timestamp: (row.last_timestamp as number) ?? 0, statusNotifyCode: 0, statusNotifyUserName: '',
          localID: `hidden_${userName}`, isFromSelf: false,
        }]
      }
      this.hiddenSessions.push(session)
    }
    this.pushState()
  }

  // ── Load More / Load All Messages ──

  async loadMoreMessages(sessionId: string, beforeTimestamp: number, limit = 100): Promise<void> {
    if (!this.messageDB) return
    const session = this.sessionMap.get(sessionId)
    if (!session) return
    const tableName = messageTableName(sessionId)

    const rows = await this.messageDB.query(`
      SELECT local_id, server_id, local_type, real_sender_id, create_time,
             message_content, sort_seq
      FROM ${tableName}
      WHERE create_time < ${beforeTimestamp}
      ORDER BY sort_seq DESC
      LIMIT ${limit}
    `)

    if (!rows.length) return
    const newMessages: WXMessage[] = []

    for (const row of [...rows].reverse()) {
      const localId = (row.local_id as number) ?? 0
      const serverId = (row.server_id as number) ?? 0
      const localType = (row.local_type as number) ?? 1
      const realSenderId = (row.real_sender_id as number) ?? 0
      const createTime = (row.create_time as number) ?? 0
      const content = decompressContent(row.message_content)

      const actualType = localType & 0xFFFF
      if (actualType === WXMsgType.Recalled) {
        if (!content) continue
      } else {
        if (!content || isBinaryContent(content)) continue
      }

      let isSelf = this.selfRowId > 0 ? realSenderId === this.selfRowId : (!session.contact.isGroup && realSenderId === 0)
      let msgContent = content
      let senderID = session.id

      if (session.contact.isGroup) {
        const colonNewline = content.indexOf(':\n')
        if (colonNewline !== -1 && colonNewline < 80) {
          const possibleSender = content.substring(0, colonNewline)
          if (possibleSender && !possibleSender.includes('<') && !possibleSender.includes(' ') && !possibleSender.includes('>')) {
            senderID = possibleSender
            msgContent = content.substring(colonNewline + 2)
          }
        }
        if (isSelf) senderID = this.dataReader.wxid
      }

      const msgId = String(serverId > 0 ? serverId : localId)
      if (actualType === WXMsgType.Recalled) {
        const recalledOrigId = this.parseRecallMsgId(content)
        const original = recalledOrigId ? this.messageLog.get(recalledOrigId) : null
        if (original) {
          newMessages.push({ ...original, recalledAt: createTime })
        } else {
          newMessages.push({
            id: msgId, fromUser: isSelf ? this.dataReader.wxid : senderID,
            toUser: isSelf ? session.id : this.dataReader.wxid,
            content: msgContent, msgType: WXMsgType.Recalled,
            timestamp: createTime, statusNotifyCode: 0, statusNotifyUserName: '',
            localID: String(localId), isFromSelf: isSelf,
          })
        }
      } else {
        newMessages.push({
          id: msgId, fromUser: isSelf ? this.dataReader.wxid : senderID,
          toUser: isSelf ? session.id : this.dataReader.wxid,
          content: msgContent, msgType: actualType as WXMsgType,
          timestamp: createTime, statusNotifyCode: 0, statusNotifyUserName: '',
          localID: String(localId), isFromSelf: isSelf,
        })
      }
    }

    if (newMessages.length) {
      session.messages = [...newMessages, ...session.messages]
    }
    this.pushState()
  }

  async loadAllMessages(sessionId: string): Promise<void> {
    if (!this.messageDB) return
    const session = this.sessionMap.get(sessionId)
    if (!session) return
    // Reload with no limit
    const tableName = messageTableName(sessionId)
    const rows = await this.messageDB.query(`
      SELECT local_id, server_id, local_type, real_sender_id, create_time,
             message_content, sort_seq
      FROM ${tableName}
      ORDER BY sort_seq ASC
    `)

    if (!rows.length) return
    const messages: WXMessage[] = []

    for (const row of rows) {
      const localId = (row.local_id as number) ?? 0
      const serverId = (row.server_id as number) ?? 0
      const localType = (row.local_type as number) ?? 1
      const realSenderId = (row.real_sender_id as number) ?? 0
      const createTime = (row.create_time as number) ?? 0
      const content = decompressContent(row.message_content)

      const actualType = localType & 0xFFFF
      if (actualType === WXMsgType.Recalled) {
        if (!content) continue
      } else {
        if (!content || isBinaryContent(content)) continue
      }

      let isSelf = this.selfRowId > 0 ? realSenderId === this.selfRowId : (!session.contact.isGroup && realSenderId === 0)
      let msgContent = content
      let senderID = session.id

      if (session.contact.isGroup) {
        const colonNewline = content.indexOf(':\n')
        if (colonNewline !== -1 && colonNewline < 80) {
          const possibleSender = content.substring(0, colonNewline)
          if (possibleSender && !possibleSender.includes('<') && !possibleSender.includes(' ') && !possibleSender.includes('>')) {
            senderID = possibleSender
            msgContent = content.substring(colonNewline + 2)
          }
        }
        if (isSelf) senderID = this.dataReader.wxid
      }

      const msgId = String(serverId > 0 ? serverId : localId)
      if (actualType === WXMsgType.Recalled) {
        const recalledOrigId = this.parseRecallMsgId(content)
        const original = recalledOrigId ? this.messageLog.get(recalledOrigId) : null
        if (original) {
          messages.push({ ...original, recalledAt: createTime })
        } else {
          messages.push({
            id: msgId, fromUser: isSelf ? this.dataReader.wxid : senderID,
            toUser: isSelf ? session.id : this.dataReader.wxid,
            content: msgContent, msgType: WXMsgType.Recalled,
            timestamp: createTime, statusNotifyCode: 0, statusNotifyUserName: '',
            localID: String(localId), isFromSelf: isSelf,
          })
        }
      } else {
        messages.push({
          id: msgId, fromUser: isSelf ? this.dataReader.wxid : senderID,
          toUser: isSelf ? session.id : this.dataReader.wxid,
          content: msgContent, msgType: actualType as WXMsgType,
          timestamp: createTime, statusNotifyCode: 0, statusNotifyUserName: '',
          localID: String(localId), isFromSelf: isSelf,
        })
      }
    }

    if (messages.length) session.messages = messages
    this.pushState()
  }

  // ── Call History ──

  async loadCallHistory(): Promise<CallRecord[]> {
    if (!this.messageDB) return []

    const tables = await this.messageDB.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Msg_%'`
    )
    const calls: CallRecord[] = []

    for (const row of tables) {
      const tableName = row.name as string
      try {
        const msgs = await this.messageDB.query(`
          SELECT local_id, local_type, real_sender_id, create_time, message_content
          FROM ${tableName}
          WHERE (local_type & 0xFFFF) IN (50, 52, 53)
          ORDER BY create_time DESC
          LIMIT 100
        `)

        const chatId = this.resolveTableNameToChatId(tableName)
        const session = chatId ? this.sessionMap.get(chatId) : null

        for (const m of msgs) {
          const content = String(m.message_content ?? '')
          const duration = this.extractCallDuration(content)
          const isOutgoing = this.selfRowId > 0 && (m.real_sender_id as number) === this.selfRowId

          calls.push({
            chatId: chatId ?? tableName,
            contactName: session ? contactDisplayName(session.contact) : chatId ?? 'Unknown',
            avatarURL: session?.contact.avatarURL ?? '',
            localId: m.local_id as number,
            timestamp: m.create_time as number,
            duration,
            isOutgoing,
          })
        }
      } catch { /* skip */ }
    }

    return calls.sort((a, b) => b.timestamp - a.timestamp).slice(0, 200)
  }

  private extractCallDuration(content: string): number | null {
    // Try to extract duration from various VoIP XML formats
    const durMatch = content.match(/duration["\s:>]*(\d+)/i)
    if (durMatch) return parseInt(durMatch[1], 10)
    const timeMatch = content.match(/(\d+):(\d+)/g)
    if (timeMatch && timeMatch.length > 0) {
      const parts = timeMatch[0].split(':')
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
    }
    return null
  }

  // ── Bookmarks / Stars ──

  starMessage(chatId: string, msg: { localId: string; content: string; timestamp: number; fromUser: string }): void {
    const session = this.sessionMap.get(chatId)
    const chatName = session ? contactDisplayName(session.contact) : chatId
    const starred = this.settings.get('starredMessages') ?? []
    if (starred.some((s: any) => s.localId === msg.localId && s.chatId === chatId)) return
    starred.push({ chatId, localId: msg.localId, content: msg.content, timestamp: msg.timestamp, fromUser: msg.fromUser, chatName })
    this.settings.set('starredMessages', starred)
  }

  unstarMessage(chatId: string, localId: string): void {
    const starred = (this.settings.get('starredMessages') ?? []).filter(
      (s: any) => !(s.localId === localId && s.chatId === chatId)
    )
    this.settings.set('starredMessages', starred)
  }

  getStarredMessages(): any[] {
    return this.settings.get('starredMessages') ?? []
  }

  contact(userName: string): WXContact | undefined {
    return this.contactMap.get(userName)
  }

  get groupContacts(): WXContact[] { return this.contacts.filter(c => c.isGroup) }
  get personalContacts(): WXContact[] { return this.contacts.filter(c => !c.isGroup) }
}
