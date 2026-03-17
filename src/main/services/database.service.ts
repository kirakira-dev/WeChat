import path from 'path'

// @journeyapps/sqlcipher uses the node-sqlite3 async/callback API
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite3 = require('@journeyapps/sqlcipher')

function runAsync(db: any, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, (err: Error | null) => err ? reject(err) : resolve())
  })
}

function allAsync(db: any, sql: string): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, (err: Error | null, rows: Record<string, any>[]) => err ? reject(err) : resolve(rows ?? []))
  })
}

function getAsync(db: any, sql: string): Promise<Record<string, any> | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, (err: Error | null, row: Record<string, any> | undefined) => err ? reject(err) : resolve(row))
  })
}

function closeAsync(db: any): Promise<void> {
  return new Promise((resolve) => {
    db.close((err: Error | null) => {
      if (err) console.error('[SQLCipher] Close error:', err)
      resolve()
    })
  })
}

export class DatabaseService {
  private db: any = null
  private dbPath: string
  private pragmaKey: string

  constructor(dbPath: string, pragmaKey: string) {
    this.dbPath = dbPath
    this.pragmaKey = pragmaKey
  }

  async open(): Promise<boolean> {
    try {
      this.db = await new Promise<any>((resolve, reject) => {
        const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err: Error | null) => {
          if (err) reject(err)
          else resolve(db)
        })
      })

      await runAsync(this.db, `PRAGMA key = "${this.pragmaKey}"`)
      await runAsync(this.db, 'PRAGMA cipher_compatibility = 4')

      const result = await getAsync(this.db, 'SELECT count(*) as cnt FROM sqlite_master')
      if (!result || result.cnt === undefined) {
        await this.close()
        return false
      }

      const name = path.basename(this.dbPath)
      console.log(`[SQLCipher] Opened ${name} - ${result.cnt} tables`)
      return true
    } catch (err) {
      console.error(`[SQLCipher] Failed to open ${this.dbPath}:`, err)
      await this.close()
      return false
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await closeAsync(this.db)
      this.db = null
    }
  }

  async query(sql: string): Promise<Record<string, any>[]> {
    if (!this.db) return []
    try {
      return await allAsync(this.db, sql)
    } catch (err) {
      console.error(`[SQLCipher] Query error:`, err)
      return []
    }
  }

  get isOpen(): boolean {
    return this.db !== null
  }
}
