import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { DataReaderService } from './data-reader.service'

export class KeyExtractorService {
  private dataReader: DataReaderService

  constructor(dataReader: DataReaderService) {
    this.dataReader = dataReader
  }

  async extractKeys(): Promise<boolean> {
    if (process.platform === 'darwin') return this.extractMacOS()
    if (process.platform === 'win32') return this.extractWindows()
    return false
  }

  private extractMacOS(): Promise<boolean> {
    return new Promise((resolve) => {
      const scannerPath = '/tmp/find_wechat_keys'
      if (!fs.existsSync(scannerPath)) {
        console.log('[KeyExtract] Scanner not found at', scannerPath)
        resolve(false)
        return
      }

      execFile(scannerPath, (error) => {
        if (error) console.error('[KeyExtract] Scanner error:', error)

        const keysPath = '/tmp/wechat_keys.json'
        try {
          const data = fs.readFileSync(keysPath, 'utf-8')
          const json = JSON.parse(data)
          const newKeys: Record<string, Record<string, string>> = {}

          for (const [key, value] of Object.entries(json)) {
            if (key === '__raw_keys') continue
            if (typeof value === 'object' && value !== null) {
              newKeys[key] = value as Record<string, string>
            }
          }

          if (Object.keys(newKeys).length > 0) {
            this.dataReader.cacheKeys(newKeys)
            resolve(true)
            return
          }
        } catch {}

        resolve(false)
      })
    })
  }

  private extractWindows(): Promise<boolean> {
    return new Promise((resolve) => {
      const scannerPaths = [
        path.join(this.dataReader.dbBasePath, '..', '..', 'key.json'),
        path.join(os.homedir(), '.wechat_db_keys.json'),
        path.join(process.env.TEMP || os.tmpdir(), 'wechat_keys.json'),
      ].filter(Boolean)

      for (const keyPath of scannerPaths) {
        try {
          const data = fs.readFileSync(keyPath, 'utf-8')
          const json = JSON.parse(data)
          const newKeys: Record<string, Record<string, string>> = {}

          for (const [key, value] of Object.entries(json)) {
            if (key === '__raw_keys') continue
            if (typeof value === 'object' && value !== null) {
              newKeys[key] = value as Record<string, string>
            }
          }

          if (Object.keys(newKeys).length > 0) {
            this.dataReader.cacheKeys(newKeys)
            resolve(true)
            return
          }
        } catch {}
      }

      const pywxdumpPath = path.join(process.env.TEMP || os.tmpdir(), 'pywxdump_keys.json')
      try {
        const data = fs.readFileSync(pywxdumpPath, 'utf-8')
        const json = JSON.parse(data)
        const rawKey = json.key as string | undefined

        if (rawKey) {
          const newKeys: Record<string, Record<string, string>> = {}
          const dbFiles = ['contact/contact.db', 'session/session.db', 'message/message_0.db']

          for (const dbFile of dbFiles) {
            const fullPath = path.join(this.dataReader.dbStoragePath, ...dbFile.split('/'))
            if (fs.existsSync(fullPath)) {
              const fd = fs.openSync(fullPath, 'r')
              const buf = Buffer.alloc(16)
              fs.readSync(fd, buf, 0, 16, 0)
              fs.closeSync(fd)
              const salt = buf.toString('hex')
              newKeys[dbFile] = { enc_key: rawKey, salt }
            }
          }

          if (Object.keys(newKeys).length > 0) {
            this.dataReader.cacheKeys(newKeys)
            resolve(true)
            return
          }
        }
      } catch {}

      resolve(false)
    })
  }
}
