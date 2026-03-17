import fs from 'fs'
import path from 'path'
import os from 'os'

export class DataReaderService {
  wxid = ''
  dbHash = ''
  dbBasePath = ''
  dbKeys: Record<string, Record<string, string>> = {}

  get containerBase(): string {
    switch (process.platform) {
      case 'darwin':
        return path.join(os.homedir(), 'Library/Containers/com.tencent.xinWeChat/Data/Documents')
      case 'win32': {
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming')
        return path.join(appData, 'Tencent', 'WeChat')
      }
      default:
        return ''
    }
  }

  get dbStoragePath(): string { return path.join(this.dbBasePath, 'db_storage') }
  get contactDBPath(): string { return path.join(this.dbStoragePath, 'contact', 'contact.db') }
  get messageDBPath(): string { return path.join(this.dbStoragePath, 'message', 'message_0.db') }
  get sessionDBPath(): string { return path.join(this.dbStoragePath, 'session', 'session.db') }
  get headImageDBPath(): string { return path.join(this.dbStoragePath, 'head_image', 'head_image.db') }
  get favoriteDBPath(): string { return path.join(this.dbStoragePath, 'favorite', 'favorite.db') }
  get emoticonDBPath(): string { return path.join(this.dbStoragePath, 'emoticon', 'emoticon.db') }
  get snsDBPath(): string { return path.join(this.dbStoragePath, 'sns', 'sns.db') }

  get keysFilePath(): string {
    return path.join(os.homedir(), '.wechat_db_keys.json')
  }

  get hasKeys(): boolean {
    return Object.keys(this.dbKeys).length > 0
  }

  initialize(): void {
    this.discoverUserDirectory()
    this.loadCachedKeys()
  }

  private discoverUserDirectory(): void {
    if (process.platform === 'darwin') this.discoverMacOS()
    else if (process.platform === 'win32') this.discoverWindows()
  }

  private discoverMacOS(): void {
    const appDataPath = path.join(this.containerBase, 'app_data', 'login')
    const xwechatPath = path.join(this.containerBase, 'xwechat_files')

    try {
      const entries = fs.readdirSync(appDataPath)
      for (const entry of entries) {
        if (entry.startsWith('wxid_')) {
          this.wxid = entry
          break
        }
      }
    } catch {}

    try {
      const entries = fs.readdirSync(xwechatPath)
      for (const entry of entries) {
        if (entry.startsWith(this.wxid) && entry.length > this.wxid.length) {
          this.dbBasePath = path.join(xwechatPath, entry)
          this.dbHash = entry.substring(this.wxid.length + 1)
          break
        }
      }
    } catch {}

    console.log(`[DataReader] wxid=${this.wxid} hash=${this.dbHash}`)
    console.log(`[DataReader] dbPath=${this.dbBasePath}`)
  }

  private discoverWindows(): void {
    const userProfile = process.env.USERPROFILE || ''
    const wechatFilesPath = path.join(userProfile, 'Documents', 'WeChat Files')

    try {
      const entries = fs.readdirSync(wechatFilesPath)
      for (const entry of entries) {
        if (entry.startsWith('wxid_')) {
          this.wxid = entry
          this.dbBasePath = path.join(wechatFilesPath, entry)
          break
        }
      }
    } catch {}

    if (!this.wxid) {
      const altPath = path.join(this.containerBase, 'All Users')
      try {
        const entries = fs.readdirSync(altPath)
        for (const entry of entries) {
          if (entry.startsWith('wxid_')) {
            this.wxid = entry
            this.dbBasePath = path.join(altPath, entry)
            break
          }
        }
      } catch {}
    }
  }

  loadCachedKeys(): void {
    try {
      const data = fs.readFileSync(this.keysFilePath, 'utf-8')
      const json = JSON.parse(data)
      for (const [key, value] of Object.entries(json)) {
        if (key === '__raw_keys') continue
        if (typeof value === 'object' && value !== null) {
          this.dbKeys[key] = value as Record<string, string>
        }
      }
      console.log(`[DataReader] Loaded ${Object.keys(this.dbKeys).length} cached DB keys`)
    } catch {}
  }

  cacheKeys(keys: Record<string, Record<string, string>>): void {
    this.dbKeys = keys
    try {
      fs.writeFileSync(this.keysFilePath, JSON.stringify(keys, null, 2))
      console.log(`[DataReader] Cached ${Object.keys(keys).length} DB keys`)
    } catch (err) {
      console.error('[DataReader] Failed to cache keys:', err)
    }
  }

  pragmaKeyForDBFile(dbPath: string): string | null {
    try {
      const fd = fs.openSync(dbPath, 'r')
      const buf = Buffer.alloc(16)
      fs.readSync(fd, buf, 0, 16, 0)
      fs.closeSync(fd)
      const salt = buf.toString('hex')

      for (const entry of Object.values(this.dbKeys)) {
        if (entry.salt === salt && entry.enc_key) {
          return `x'${entry.enc_key}${salt}'`
        }
      }
    } catch {}
    return null
  }

  get msgBasePath(): string { return path.join(this.dbBasePath, 'msg') }

  resolveFilePath(filename: string): string | null {
    const fileDir = path.join(this.msgBasePath, 'file')
    try {
      const months = fs.readdirSync(fileDir).filter(d => /^\d{4}-\d{2}$/.test(d)).sort().reverse()
      for (const month of months) {
        const filePath = path.join(fileDir, month, filename)
        if (fs.existsSync(filePath)) return filePath
      }
    } catch {}
    return null
  }

  resolveVideoPath(hash: string): string | null {
    const videoDir = path.join(this.msgBasePath, 'video')
    try {
      const months = fs.readdirSync(videoDir).filter(d => /^\d{4}-\d{2}$/.test(d)).sort().reverse()
      for (const month of months) {
        const monthDir = path.join(videoDir, month)
        for (const name of [`${hash}_raw.mp4`, `${hash}.mp4`]) {
          const p = path.join(monthDir, name)
          if (fs.existsSync(p)) return p
        }
      }
    } catch {}
    return null
  }

  resolveVideoThumb(hash: string): string | null {
    const videoDir = path.join(this.msgBasePath, 'video')
    try {
      const months = fs.readdirSync(videoDir).filter(d => /^\d{4}-\d{2}$/.test(d)).sort().reverse()
      for (const month of months) {
        const monthDir = path.join(videoDir, month)
        for (const name of [`${hash}_thumb.jpg`, `${hash}.jpg`]) {
          const p = path.join(monthDir, name)
          if (fs.existsSync(p)) return p
        }
      }
    } catch {}
    return null
  }

  pragmaKeyForDB(relativePath: string): string | null {
    const entry = this.dbKeys[relativePath]
    if (!entry?.enc_key || !entry?.salt) return null
    return `x'${entry.enc_key}${entry.salt}'`
  }
}
