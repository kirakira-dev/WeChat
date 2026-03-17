import { createHash } from 'crypto'
import { Cookie, CookieJar } from 'tough-cookie'
import { WXMessage, WXMsgType, messageFromWebDict } from '../../shared/types/message'
import { WXContact, contactFromWebDict, isSpecialContact } from '../../shared/types/contact'
import { LoginState } from '../../shared/types/api'
import path from 'path'
import fs from 'fs'
import os from 'os'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function md5buf(data: Buffer): string {
  return createHash('md5').update(data).digest('hex')
}

export class WeChatApiService {
  private appID = 'wx782c26e4c19acffb'
  private baseURL = 'https://wx2.qq.com'
  private loginBaseURL = 'https://login.wx2.qq.com'
  private fileBaseURL = 'https://file.wx2.qq.com'
  private pushBaseURL = 'https://webpush.wx2.qq.com'

  uuid = ''
  qrCodeData: Buffer | null = null
  loginState: LoginState = { kind: 'idle' }
  userInfo: WXContact | null = null

  private skey = ''
  private sid = ''
  private uin = ''
  private passTicket = ''
  private deviceID: string
  private syncKey: Record<string, any> = {}
  private syncKeyFormatted = ''
  selfUserName = ''
  private isSyncing = false
  private cookieJar = new CookieJar()

  onNewMessages?: (messages: WXMessage[]) => void
  onContactUpdate?: (contacts: WXContact[]) => void
  onLoginStateChange?: (state: LoginState) => void

  private sessionFilePath = path.join(os.homedir(), '.wechat_web_session.json')

  constructor() {
    const rand = Math.floor(Math.random() * 900000000000000) + 100000000000000
    this.deviceID = `e${rand}`
  }

  /** Save web session credentials to disk so we can restore without QR scan */
  async saveSession(): Promise<void> {
    const cookies = await this.cookieJar.serialize()
    const session = {
      skey: this.skey,
      sid: this.sid,
      uin: this.uin,
      passTicket: this.passTicket,
      deviceID: this.deviceID,
      syncKey: this.syncKey,
      syncKeyFormatted: this.syncKeyFormatted,
      selfUserName: this.selfUserName,
      baseURL: this.baseURL,
      loginBaseURL: this.loginBaseURL,
      fileBaseURL: this.fileBaseURL,
      pushBaseURL: this.pushBaseURL,
      cookies,
      savedAt: Date.now(),
    }
    try {
      fs.writeFileSync(this.sessionFilePath, JSON.stringify(session), 'utf-8')
      console.log('[WeChatAPI] Session saved to disk')
    } catch (err) {
      console.error('[WeChatAPI] Failed to save session:', err)
    }
  }

  /** Try to restore a saved web session. Returns true if session was restored and is still valid. */
  async restoreSession(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.sessionFilePath)) return false
      const raw = fs.readFileSync(this.sessionFilePath, 'utf-8')
      const session = JSON.parse(raw)

      // Reject sessions older than 48 hours
      if (Date.now() - (session.savedAt ?? 0) > 48 * 60 * 60 * 1000) {
        console.log('[WeChatAPI] Saved session too old, discarding')
        this.clearSavedSession()
        return false
      }

      // Restore all fields
      this.skey = session.skey ?? ''
      this.sid = session.sid ?? ''
      this.uin = session.uin ?? ''
      this.passTicket = session.passTicket ?? ''
      this.deviceID = session.deviceID ?? this.deviceID
      this.syncKey = session.syncKey ?? {}
      this.syncKeyFormatted = session.syncKeyFormatted ?? ''
      this.selfUserName = session.selfUserName ?? ''
      this.baseURL = session.baseURL ?? this.baseURL
      this.loginBaseURL = session.loginBaseURL ?? this.loginBaseURL
      this.fileBaseURL = session.fileBaseURL ?? this.fileBaseURL
      this.pushBaseURL = session.pushBaseURL ?? this.pushBaseURL

      // Restore cookies
      if (session.cookies) {
        this.cookieJar = await CookieJar.deserialize(session.cookies)
      }

      // Validate by doing a sync check
      console.log('[WeChatAPI] Attempting session restore...')
      const { retcode } = await this.syncCheck()
      if (retcode !== '0') {
        console.log(`[WeChatAPI] Saved session invalid (retcode=${retcode})`)
        this.clearSavedSession()
        this.resetState()
        return false
      }

      // Session is valid — init
      console.log(`[WeChatAPI] Session restored! uin=${this.uin}, user=${this.selfUserName}`)
      this.loginState = { kind: 'loggedIn' }
      this.onLoginStateChange?.(this.loginState)
      return true
    } catch (err) {
      console.error('[WeChatAPI] Session restore failed:', err)
      this.clearSavedSession()
      this.resetState()
      return false
    }
  }

  clearSavedSession(): void {
    try { fs.unlinkSync(this.sessionFilePath) } catch {}
  }

  private resetState(): void {
    this.skey = ''
    this.sid = ''
    this.uin = ''
    this.passTicket = ''
    this.syncKey = {}
    this.syncKeyFormatted = ''
    this.selfUserName = ''
    this.cookieJar = new CookieJar()
  }

  private timestamp(): number {
    return Date.now()
  }

  private async httpGet(url: string, timeout = 15000): Promise<Buffer> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const cookieStr = await this.cookieJar.getCookieString(url)
      const resp = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...(cookieStr ? { Cookie: cookieStr } : {}) },
        signal: controller.signal,
        redirect: 'manual',
      })
      await this.storeCookies(url, resp)
      const arrayBuf = await resp.arrayBuffer()
      return Buffer.from(arrayBuf)
    } finally {
      clearTimeout(timer)
    }
  }

  private async httpPost(url: string, body: Record<string, any>): Promise<Buffer> {
    const cookieStr = await this.cookieJar.getCookieString(url)
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': USER_AGENT,
        ...(cookieStr ? { Cookie: cookieStr } : {}),
      },
      body: JSON.stringify(body),
    })
    await this.storeCookies(url, resp)
    const arrayBuf = await resp.arrayBuffer()
    return Buffer.from(arrayBuf)
  }

  private async httpPostRaw(url: string, bodyBuf: Buffer, contentType: string): Promise<Buffer> {
    const cookieStr = await this.cookieJar.getCookieString(url)
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'User-Agent': USER_AGENT,
        ...(cookieStr ? { Cookie: cookieStr } : {}),
      },
      body: bodyBuf as unknown as BodyInit,
    })
    await this.storeCookies(url, resp)
    const arrayBuf = await resp.arrayBuffer()
    return Buffer.from(arrayBuf)
  }

  private async storeCookies(url: string, resp: Response): Promise<void> {
    const setCookies = resp.headers.getSetCookie?.() ?? []
    for (const sc of setCookies) {
      try { await this.cookieJar.setCookie(sc, url) } catch {}
    }
  }

  private async getCookieValue(name: string): Promise<string> {
    const cookies = await this.cookieJar.getCookies(this.baseURL)
    const cookie = cookies.find(c => c.key === name)
    return cookie?.value ?? ''
  }

  async getUUID(): Promise<string> {
    const url = `${this.loginBaseURL}/jslogin?appid=${this.appID}&redirect_uri=${encodeURIComponent('https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage?mod=desktop')}&fun=new&lang=en_US&_=${this.timestamp()}`
    const data = await this.httpGet(url)
    const body = data.toString('utf-8')

    if (!body.includes('200')) throw new Error('Failed to get UUID')
    const match = body.match(/"([^"]+)"/)
    if (!match) throw new Error('Failed to extract UUID')

    this.uuid = match[1]
    this.loginState = { kind: 'waitingScan' }
    this.onLoginStateChange?.(this.loginState)
    return this.uuid
  }

  async getQRCode(): Promise<Buffer> {
    const url = `${this.loginBaseURL}/qrcode/${this.uuid}`
    const data = await this.httpGet(url)
    this.qrCodeData = data
    return data
  }

  async pollForLogin(): Promise<{ success: boolean; redirectURL?: string }> {
    const tip = this.loginState.kind === 'waitingScan' ? '1' : '0'
    const url = `${this.loginBaseURL}/cgi-bin/mmwebwx-bin/login?loginicon=true&uuid=${this.uuid}&tip=${tip}&r=${~this.timestamp()}&_=${this.timestamp()}`

    const data = await this.httpGet(url, 30000)
    const body = data.toString('utf-8')

    if (body.includes('window.code=200')) {
      const match = body.match(/redirect_uri="([^"]+)"/)
      if (match) {
        let redirectURL = match[1]
        try {
          const urlObj = new URL(redirectURL)
          const host = urlObj.hostname
          if (host.includes('wx2.qq.com')) {
            this.baseURL = 'https://wx2.qq.com'
            this.fileBaseURL = 'https://file.wx2.qq.com'
            this.pushBaseURL = 'https://webpush.wx2.qq.com'
          } else if (host.includes('wx.qq.com')) {
            this.baseURL = 'https://wx.qq.com'
            this.fileBaseURL = 'https://file.wx.qq.com'
            this.pushBaseURL = 'https://webpush.wx.qq.com'
          } else {
            const baseDomain = host.replace('wx', '')
            this.baseURL = `https://wx${baseDomain}`
            this.fileBaseURL = `https://file.wx${baseDomain}`
            this.pushBaseURL = `https://webpush.wx${baseDomain}`
          }
          this.loginBaseURL = `https://login.${host}`
        } catch {}

        if (!redirectURL.includes('fun=')) {
          redirectURL += '&fun=new&version=v2'
        }
        this.loginState = { kind: 'loggedIn' }
        this.onLoginStateChange?.(this.loginState)
        return { success: true, redirectURL }
      }
    } else if (body.includes('window.code=201')) {
      this.loginState = { kind: 'scanned' }
      this.onLoginStateChange?.(this.loginState)
    }

    return { success: false }
  }

  async completeLogin(redirectURL: string): Promise<void> {
    const cookieStr = await this.cookieJar.getCookieString(redirectURL)
    const resp = await fetch(redirectURL, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://wx2.qq.com',
        'client-version': '2.0.0',
        'extspam': this.uosExtSpam(),
        ...(cookieStr ? { Cookie: cookieStr } : {}),
      },
      redirect: 'follow',
    })
    await this.storeCookies(redirectURL, resp)

    const xml = await resp.text()
    this.skey = this.extractXMLValue(xml, 'skey')
    this.sid = this.extractXMLValue(xml, 'wxsid')
    this.uin = this.extractXMLValue(xml, 'wxuin')
    this.passTicket = this.extractXMLValue(xml, 'pass_ticket')

    if (!this.skey || !this.sid || !this.uin) {
      throw new Error('Failed to extract session credentials')
    }
    console.log(`[WeChatAPI] Login successful: uin=${this.uin}, sid=${this.sid}`)
    await this.saveSession()
  }

  async webwxInit(): Promise<WXMessage[]> {
    const url = `${this.baseURL}/cgi-bin/mmwebwx-bin/webwxinit?r=${~this.timestamp()}&pass_ticket=${this.passTicket}`
    const data = await this.httpPost(url, { BaseRequest: this.baseRequest() })
    const json = JSON.parse(data.toString('utf-8'))

    if (json.User) {
      this.selfUserName = json.User.UserName ?? ''
      this.userInfo = contactFromWebDict(json.User)
    }

    if (json.SyncKey) {
      this.syncKey = json.SyncKey
      this.formatSyncKey()
    }

    const messages: WXMessage[] = (json.AddMsgList ?? []).map((d: any) => messageFromWebDict(d, this.selfUserName))

    try { await this.webwxStatusNotify() } catch {}
    return messages
  }

  async getContactList(): Promise<WXContact[]> {
    const url = `${this.baseURL}/cgi-bin/mmwebwx-bin/webwxgetcontact?r=${this.timestamp()}&seq=0&skey=${encodeURIComponent(this.skey)}&pass_ticket=${this.passTicket}`
    const data = await this.httpGet(url)
    const json = JSON.parse(data.toString('utf-8'))
    const memberList: any[] = json.MemberList ?? []
    return memberList.map(contactFromWebDict).filter(c => !isSpecialContact(c.id))
  }

  async getBatchContact(userNames: string[]): Promise<WXContact[]> {
    const url = `${this.baseURL}/cgi-bin/mmwebwx-bin/webwxbatchgetcontact?type=ex&r=${this.timestamp()}&pass_ticket=${this.passTicket}`
    const list = userNames.map(u => ({ UserName: u, ChatRoomId: '' }))
    const data = await this.httpPost(url, { BaseRequest: this.baseRequest(), Count: userNames.length, List: list })
    const json = JSON.parse(data.toString('utf-8'))
    return (json.ContactList ?? []).map(contactFromWebDict)
  }

  async sendTextMessage(to: string, content: string): Promise<string> {
    const url = `${this.baseURL}/cgi-bin/mmwebwx-bin/webwxsendmsg?pass_ticket=${this.passTicket}`
    const msgID = `${this.timestamp()}${String(Math.floor(Math.random() * 9000) + 1000)}`
    const data = await this.httpPost(url, {
      BaseRequest: this.baseRequest(),
      Msg: { Type: 1, Content: content, FromUserName: this.selfUserName, ToUserName: to, LocalID: msgID, ClientMsgId: msgID },
      Scene: 0,
    })
    const json = JSON.parse(data.toString('utf-8'))
    if (json.BaseResponse?.Ret !== 0) throw new Error('Send failed')
    return json.MsgID ?? msgID
  }

  async sendImageMessage(to: string, imageData: Buffer, filename: string): Promise<string> {
    const mediaID = await this.uploadMedia(imageData, filename, 'image/png', to)
    const url = `${this.baseURL}/cgi-bin/mmwebwx-bin/webwxsendmsgimg?fun=async&f=json&pass_ticket=${this.passTicket}`
    const msgID = `${this.timestamp()}${String(Math.floor(Math.random() * 9000) + 1000)}`
    const data = await this.httpPost(url, {
      BaseRequest: this.baseRequest(),
      Msg: { Type: 3, MediaId: mediaID, FromUserName: this.selfUserName, ToUserName: to, LocalID: msgID, ClientMsgId: msgID },
      Scene: 0,
    })
    const json = JSON.parse(data.toString('utf-8'))
    if (json.BaseResponse?.Ret !== 0) throw new Error('Send failed')
    return json.MsgID ?? msgID
  }

  async sendFileMessage(to: string, fileData: Buffer, filename: string): Promise<string> {
    const mediaID = await this.uploadMedia(fileData, filename, 'application/octet-stream', to)
    const url = `${this.baseURL}/cgi-bin/mmwebwx-bin/webwxsendappmsg?fun=async&f=json&pass_ticket=${this.passTicket}`
    const msgID = `${this.timestamp()}${String(Math.floor(Math.random() * 9000) + 1000)}`
    const fileExt = path.extname(filename).replace('.', '')
    const content = `<appmsg appid='wxeb7ec651dd0aefa9' sdkver=''><title>${filename}</title><des></des><action></action><type>6</type><content></content><url></url><lowurl></lowurl><appattach><totallen>${fileData.length}</totallen><attachid>${mediaID}</attachid><fileext>${fileExt}</fileext></appattach><extinfo></extinfo></appmsg>`
    const data = await this.httpPost(url, {
      BaseRequest: this.baseRequest(),
      Msg: { Type: 6, Content: content, FromUserName: this.selfUserName, ToUserName: to, LocalID: msgID, ClientMsgId: msgID },
      Scene: 0,
    })
    const json = JSON.parse(data.toString('utf-8'))
    if (json.BaseResponse?.Ret !== 0) throw new Error('Send failed')
    return json.MsgID ?? msgID
  }

  async getMessageImage(msgID: string): Promise<Buffer> {
    return this.httpGet(`${this.baseURL}/cgi-bin/mmwebwx-bin/webwxgetmsgimg?MsgID=${msgID}&skey=${encodeURIComponent(this.skey)}&type=big`)
  }

  async getVoice(msgID: string): Promise<Buffer> {
    return this.httpGet(`${this.baseURL}/cgi-bin/mmwebwx-bin/webwxgetvoice?msgid=${msgID}&skey=${encodeURIComponent(this.skey)}`)
  }

  async getVideo(msgID: string): Promise<Buffer> {
    return this.httpGet(`${this.baseURL}/cgi-bin/mmwebwx-bin/webwxgetvideo?msgid=${msgID}&skey=${encodeURIComponent(this.skey)}`)
  }

  async getAvatar(avatarPath: string): Promise<Buffer> {
    return this.httpGet(`${this.baseURL}${avatarPath}`)
  }

  private async uploadMedia(data: Buffer, filename: string, mimeType: string, toUser: string): Promise<string> {
    const url = `${this.fileBaseURL}/cgi-bin/mmwebwx-bin/webwxuploadmedia?f=json`
    const uploadMediaRequest = JSON.stringify({
      UploadType: 2, BaseRequest: this.baseRequest(), ClientMediaId: this.timestamp(),
      TotalLen: data.length, StartPos: 0, DataLen: data.length, MediaType: 4,
      FromUserName: this.selfUserName, ToUserName: toUser, FileMd5: md5buf(data),
    })

    const boundary = `----WebKitFormBoundary${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    const parts: Buffer[] = []
    const addField = (name: string, value: string) => {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
    }

    addField('id', 'WU_FILE_0')
    addField('name', filename)
    addField('type', mimeType)
    addField('lastModifiedDate', new Date().toUTCString())
    addField('size', String(data.length))
    addField('mediatype', mimeType.startsWith('image') ? 'pic' : 'doc')
    addField('uploadmediarequest', uploadMediaRequest)
    addField('webwx_data_ticket', await this.getCookieValue('webwx_data_ticket'))
    addField('pass_ticket', this.passTicket)

    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="filename"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`))
    parts.push(data)
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

    const bodyBuf = Buffer.concat(parts)
    const respData = await this.httpPostRaw(url, bodyBuf, `multipart/form-data; boundary=${boundary}`)
    const json = JSON.parse(respData.toString('utf-8'))
    if (!json.MediaId) throw new Error('Upload failed')
    return json.MediaId
  }

  startSyncLoop(): void {
    if (this.isSyncing) return
    this.isSyncing = true

    const loop = async () => {
      while (this.isSyncing) {
        try {
          const { retcode, selector } = await this.syncCheck()
          if (retcode !== '0') {
            console.log(`[Sync] Session expired (retcode=${retcode})`)
            this.isSyncing = false
            this.loginState = { kind: 'failed', message: 'Session expired' }
            this.onLoginStateChange?.(this.loginState)
            break
          }
          if (selector !== '0') {
            const messages = await this.webwxSync()
            if (messages.length > 0) this.onNewMessages?.(messages)
          }
        } catch (err) {
          console.error('[Sync] Error:', err)
          await new Promise(r => setTimeout(r, 3000))
        }
      }
    }
    loop()
  }

  stopSync(): void {
    this.isSyncing = false
  }

  private async syncCheck(): Promise<{ retcode: string; selector: string }> {
    const url = `${this.pushBaseURL}/cgi-bin/mmwebwx-bin/synccheck?r=${this.timestamp()}&skey=${encodeURIComponent(this.skey)}&sid=${encodeURIComponent(this.sid)}&uin=${this.uin}&deviceid=${this.deviceID}&synckey=${encodeURIComponent(this.syncKeyFormatted)}&_=${this.timestamp()}`
    const data = await this.httpGet(url, 30000)
    const body = data.toString('utf-8')
    return {
      retcode: this.extractJSValue(body, 'retcode'),
      selector: this.extractJSValue(body, 'selector'),
    }
  }

  private async webwxSync(): Promise<WXMessage[]> {
    const url = `${this.baseURL}/cgi-bin/mmwebwx-bin/webwxsync?sid=${encodeURIComponent(this.sid)}&skey=${encodeURIComponent(this.skey)}&pass_ticket=${this.passTicket}`
    const data = await this.httpPost(url, { BaseRequest: this.baseRequest(), SyncKey: this.syncKey, rr: ~this.timestamp() })
    const json = JSON.parse(data.toString('utf-8'))

    const newSK = json.SyncKey ?? json.SyncCheckKey
    if (newSK?.List?.length) {
      this.syncKey = newSK
      this.formatSyncKey()
      // Persist updated sync key so session restore works after restart
      this.saveSession().catch(() => {})
    }

    const messages: WXMessage[] = (json.AddMsgList ?? [])
      .map((d: any) => messageFromWebDict(d, this.selfUserName))
      .filter((m: WXMessage) => m.msgType !== WXMsgType.StatusNotify)

    if (json.ModContactList?.length) {
      const contacts = json.ModContactList.map(contactFromWebDict)
      this.onContactUpdate?.(contacts)
    }

    return messages
  }

  private async webwxStatusNotify(): Promise<void> {
    const url = `${this.baseURL}/cgi-bin/mmwebwx-bin/webwxstatusnotify?pass_ticket=${this.passTicket}`
    await this.httpPost(url, {
      BaseRequest: this.baseRequest(), Code: 3,
      FromUserName: this.selfUserName, ToUserName: this.selfUserName, ClientMsgId: this.timestamp(),
    })
  }

  async logout(): Promise<void> {
    const url = `${this.baseURL}/cgi-bin/mmwebwx-bin/webwxlogout?redirect=1&type=0&skey=${encodeURIComponent(this.skey)}`
    try { await this.httpPost(url, { sid: this.sid, uin: this.uin }) } catch {}
    this.stopSync()
    this.clearSavedSession()
    this.resetState()
    this.loginState = { kind: 'idle' }
    this.userInfo = null
    this.onLoginStateChange?.(this.loginState)
  }

  private baseRequest(): Record<string, any> {
    return { Uin: parseInt(this.uin) || 0, Sid: this.sid, Skey: this.skey, DeviceID: this.deviceID }
  }

  private formatSyncKey(): void {
    const list = this.syncKey.List as Array<{ Key: number; Val: number }> | undefined
    if (!list) return
    this.syncKeyFormatted = list.map(e => `${e.Key}_${e.Val}`).join('|')
  }

  private uosExtSpam(): string {
    return 'Go8FCIkFEokFCggwMDAwMDAwMRAGGvAESySibk50w5Wb3AGDa2sourBKarJKanBLqE7MBLwIeHKo0C8iSiVFFQkJBElFQNAhNwQyiJ8AEY6bLksFEILGFWBxBIJBJAEpYRRBRxFIkFEIJFFQkJHEZFAAQalFIcFEchERJASEZBJEJAQkJFRR4FAAkRFREJBQ3E'
  }

  private extractXMLValue(xml: string, tag: string): string {
    const re = new RegExp(`<${tag}>([^<]*)</${tag}>`)
    const m = xml.match(re)
    return m?.[1] ?? ''
  }

  private extractJSValue(js: string, key: string): string {
    const re = new RegExp(`${key}:"([^"]+)"`)
    const m = js.match(re)
    return m?.[1] ?? '0'
  }
}
