import fs from 'fs'
import path from 'path'
import os from 'os'
import { BrowserWindow } from 'electron'
import { PluginManifest, PluginState, PluginInfo, PluginLogEntry } from '../../shared/types/plugin'
import { SessionManagerService } from './session-manager.service'
import { WeChatApiService } from './wechat-api.service'
import { SettingsService } from './settings.service'
import { DataReaderService } from './data-reader.service'
import { createPluginAPI } from './plugin-api'

interface LoadedPlugin {
  state: PluginState
  api: ReturnType<typeof createPluginAPI>
  module: any
}

export class PluginManagerService {
  private plugins = new Map<string, LoadedPlugin>()
  private pluginsDir: string

  constructor(
    private sessionManager: SessionManagerService,
    private wechatApi: WeChatApiService,
    private settings: SettingsService,
    private dataReader: DataReaderService,
    private getMainWindow: () => BrowserWindow | null,
  ) {
    this.pluginsDir = path.join(os.homedir(), '.wechat-plugins')
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true })
    }
  }

  /** Get plugin directory path */
  getPluginsDir(): string {
    return this.pluginsDir
  }

  /** Scan plugins directory and return found manifests */
  scanPlugins(): PluginManifest[] {
    const manifests: PluginManifest[] = []
    if (!fs.existsSync(this.pluginsDir)) return manifests

    const entries = fs.readdirSync(this.pluginsDir)
    for (const entry of entries) {
      const pluginPath = path.join(this.pluginsDir, entry)
      const stat = fs.statSync(pluginPath)

      if (stat.isDirectory()) {
        // Directory-based plugin: look for manifest.json or index.js
        const manifestPath = path.join(pluginPath, 'manifest.json')
        if (fs.existsSync(manifestPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
            manifests.push({
              id: raw.id || entry,
              name: raw.name || entry,
              version: raw.version || '1.0.0',
              description: raw.description || '',
              author: raw.author || 'Unknown',
              entryFile: path.join(pluginPath, raw.main || 'index.js'),
              enabled: this.isPluginEnabled(raw.id || entry),
              autoStart: raw.autoStart ?? false,
            })
          } catch {}
        } else if (fs.existsSync(path.join(pluginPath, 'index.js'))) {
          manifests.push({
            id: entry, name: entry, version: '1.0.0',
            description: '', author: 'Unknown',
            entryFile: path.join(pluginPath, 'index.js'),
            enabled: this.isPluginEnabled(entry),
            autoStart: false,
          })
        }
      } else if (entry.endsWith('.js')) {
        // Single-file plugin
        const id = entry.replace('.js', '')
        const header = this.parsePluginHeader(pluginPath)
        manifests.push({
          id,
          name: header.name || id,
          version: header.version || '1.0.0',
          description: header.description || '',
          author: header.author || 'Unknown',
          entryFile: pluginPath,
          enabled: this.isPluginEnabled(id),
          autoStart: header.autoStart ?? false,
        })
      }
    }

    return manifests
  }

  /** Parse header comments from a .js plugin file for metadata */
  private parsePluginHeader(filePath: string): Record<string, any> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8').substring(0, 2000)
      const result: Record<string, any> = {}
      const headerMatch = content.match(/\/\*\*([\s\S]*?)\*\//)
      if (headerMatch) {
        const lines = headerMatch[1].split('\n')
        for (const line of lines) {
          const m = line.match(/@(\w+)\s+(.+)/)
          if (m) result[m[1].trim()] = m[2].trim()
        }
      }
      return result
    } catch { return {} }
  }

  private isPluginEnabled(id: string): boolean {
    return this.settings.get(`plugin_enabled_${id}` as any) !== false
  }

  /** Load and execute a plugin */
  async loadPlugin(pluginId: string): Promise<PluginInfo> {
    // If already loaded, unload first
    if (this.plugins.has(pluginId)) {
      await this.unloadPlugin(pluginId)
    }

    const manifests = this.scanPlugins()
    const manifest = manifests.find(m => m.id === pluginId)
    if (!manifest) throw new Error(`Plugin "${pluginId}" not found`)

    if (!fs.existsSync(manifest.entryFile)) {
      throw new Error(`Plugin entry file not found: ${manifest.entryFile}`)
    }

    const api = createPluginAPI(
      pluginId, this.sessionManager, this.wechatApi,
      this.settings, this.dataReader, this.getMainWindow,
    )

    // Set __dirname for the plugin
    api.ctx.__dirname = path.dirname(manifest.entryFile)

    const state: PluginState = {
      manifest,
      loaded: true,
      running: false,
      error: null,
      logs: [],
      registeredEvents: [],
      registeredTimers: 0,
      registeredCommands: [],
    }

    const loaded: LoadedPlugin = { state, api, module: null }
    this.plugins.set(pluginId, loaded)

    try {
      // Clear module cache for hot-reloading
      delete require.cache[require.resolve(manifest.entryFile)]
      const mod = require(manifest.entryFile)

      loaded.module = mod

      // Call the plugin's setup/init function
      if (typeof mod === 'function') {
        await mod(api.ctx)
      } else if (typeof mod.setup === 'function') {
        await mod.setup(api.ctx)
      } else if (typeof mod.init === 'function') {
        await mod.init(api.ctx)
      } else if (typeof mod.default === 'function') {
        await mod.default(api.ctx)
      }

      state.running = true
      state.registeredEvents = api.getEventNames()
      state.registeredTimers = api.getTimerCount()
      api.ctx.log.info(`Plugin "${manifest.name}" loaded successfully`)

    } catch (err: any) {
      state.error = err.message || String(err)
      state.running = false
      api.ctx.log.error(`Failed to load: ${state.error}`)
    }

    state.logs = api.getLogs() as PluginLogEntry[]
    return this.pluginToInfo(loaded)
  }

  /** Unload a plugin, cleaning up all its resources */
  async unloadPlugin(pluginId: string): Promise<void> {
    const loaded = this.plugins.get(pluginId)
    if (!loaded) return

    // Call plugin's teardown if available
    try {
      if (loaded.module?.teardown) await loaded.module.teardown()
      else if (loaded.module?.cleanup) await loaded.module.cleanup()
      else if (loaded.module?.destroy) await loaded.module.destroy()
    } catch {}

    // Clean up all registered resources
    loaded.api.cleanup()
    loaded.state.running = false

    // Remove from cache
    try {
      delete require.cache[require.resolve(loaded.state.manifest.entryFile)]
    } catch {}

    this.plugins.delete(pluginId)
  }

  /** Reload a plugin (unload then load) */
  async reloadPlugin(pluginId: string): Promise<PluginInfo> {
    await this.unloadPlugin(pluginId)
    return this.loadPlugin(pluginId)
  }

  /** Enable/disable a plugin */
  setPluginEnabled(pluginId: string, enabled: boolean): void {
    this.settings.set(`plugin_enabled_${pluginId}` as any, enabled)
    if (!enabled && this.plugins.has(pluginId)) {
      this.unloadPlugin(pluginId)
    }
  }

  /** Get info for all plugins (loaded + scanned) */
  getAllPluginInfo(): PluginInfo[] {
    const manifests = this.scanPlugins()
    return manifests.map(m => {
      const loaded = this.plugins.get(m.id)
      if (loaded) {
        loaded.state.logs = loaded.api.getLogs() as PluginLogEntry[]
        loaded.state.registeredEvents = loaded.api.getEventNames()
        loaded.state.registeredTimers = loaded.api.getTimerCount()
        return this.pluginToInfo(loaded)
      }
      return {
        id: m.id, name: m.name, version: m.version,
        description: m.description, author: m.author,
        enabled: m.enabled, autoStart: m.autoStart,
        running: false, error: null, logs: [],
        registeredEvents: [], registeredTimers: 0, registeredCommands: [],
      }
    })
  }

  /** Get detailed info for a single plugin */
  getPluginInfo(pluginId: string): PluginInfo | null {
    const loaded = this.plugins.get(pluginId)
    if (loaded) {
      loaded.state.logs = loaded.api.getLogs() as PluginLogEntry[]
      return this.pluginToInfo(loaded)
    }
    const manifests = this.scanPlugins()
    const m = manifests.find(m => m.id === pluginId)
    if (!m) return null
    return {
      id: m.id, name: m.name, version: m.version,
      description: m.description, author: m.author,
      enabled: m.enabled, autoStart: m.autoStart,
      running: false, error: null, logs: [],
      registeredEvents: [], registeredTimers: 0, registeredCommands: [],
    }
  }

  /** Auto-load all enabled plugins marked with autoStart */
  async autoLoadPlugins(): Promise<void> {
    const manifests = this.scanPlugins()
    for (const m of manifests) {
      if (m.enabled && m.autoStart) {
        try {
          await this.loadPlugin(m.id)
        } catch {}
      }
    }
  }

  /** Create a new plugin from template */
  createPlugin(name: string, template: 'blank' | 'auto-reply' | 'scheduler' | 'stats' = 'blank'): PluginManifest {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const pluginDir = path.join(this.pluginsDir, id)
    fs.mkdirSync(pluginDir, { recursive: true })

    const manifest = {
      id, name,
      version: '1.0.0',
      description: `${name} plugin`,
      author: 'User',
      main: 'index.js',
      autoStart: false,
    }
    fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

    let code = ''
    switch (template) {
      case 'auto-reply':
        code = `/**
 * Auto-Reply Plugin
 * Automatically replies to messages matching patterns.
 */
module.exports.setup = function(ctx) {
  ctx.log.info('Auto-Reply plugin loaded!')

  // Reply "Hello!" when someone says "hi" in any chat
  ctx.addAutoReply('*', 'hi', 'Hello! This is an auto-reply.', false)

  // Regex-based auto-reply
  // ctx.addAutoReply('*', '^(good morning|早上好)', 'Good morning! ☀️', true)

  // Listen for all incoming messages
  ctx.on('message', (msg) => {
    ctx.log.debug('Received: ' + msg.content)
  })
}

module.exports.teardown = function() {
  // Cleanup runs automatically, but you can add custom logic here
}
`
        break
      case 'scheduler':
        code = `/**
 * Message Scheduler Plugin
 * Schedule messages to be sent at specific times.
 */
module.exports.setup = function(ctx) {
  ctx.log.info('Scheduler plugin loaded!')

  // Example: Send a message in 60 seconds
  // const chatId = 'wxid_someone'
  // const futureTime = Math.floor(Date.now() / 1000) + 60
  // ctx.scheduleMessage(chatId, 'This is a scheduled message!', futureTime)

  // Example: Recurring task every 5 minutes
  // ctx.setTimer(() => {
  //   ctx.log.info('5-minute check running...')
  //   const sessions = ctx.getSessions()
  //   ctx.log.info('Active sessions: ' + sessions.length)
  // }, 5 * 60 * 1000)
}
`
        break
      case 'stats':
        code = `/**
 * Chat Stats Plugin
 * Provides enhanced statistics about your chats.
 */
module.exports.setup = function(ctx) {
  ctx.log.info('Stats plugin loaded!')

  // Log overall stats
  const contacts = ctx.getContacts()
  const sessions = ctx.getSessions()
  ctx.log.info('Total contacts: ' + contacts.length)
  ctx.log.info('Active sessions: ' + sessions.length)

  // Show top 5 most active chats
  const sorted = sessions.sort((a, b) => b.messageCount - a.messageCount)
  for (const s of sorted.slice(0, 5)) {
    ctx.log.info(s.name + ': ' + s.messageCount + ' messages')
  }

  // Listen for new messages and track them
  ctx.on('message', (msg) => {
    const count = ctx.storeGet('total_received') || 0
    ctx.storeSet('total_received', count + 1)
  })
}
`
        break
      default:
        code = `/**
 * ${name} Plugin
 *
 * Available tools (90+): sendText, getMessages, getContacts, queryMessageDB,
 * addAutoReply, scheduleMessage, on/off/once, httpGet, md5, showNotification,
 * storeGet/storeSet, and many more.
 *
 * Full API: ctx.sendText(chatId, text), ctx.getContacts(), ctx.on('message', fn), etc.
 * See the Plugin API reference for all available tools.
 */
module.exports.setup = function(ctx) {
  ctx.log.info('${name} plugin loaded!')

  // Your plugin code here...
  // Examples:
  // ctx.on('message', (msg) => { ctx.log.info('New message: ' + msg.content) })
  // ctx.sendText('wxid_someone', 'Hello from plugin!')
  // ctx.addAutoReply('*', 'ping', 'pong!')
}
`
    }

    fs.writeFileSync(path.join(pluginDir, 'index.js'), code)

    return {
      id, name, version: '1.0.0',
      description: manifest.description,
      author: 'User', entryFile: path.join(pluginDir, 'index.js'),
      enabled: true, autoStart: false,
    }
  }

  /** Delete a plugin entirely */
  async deletePlugin(pluginId: string): Promise<void> {
    await this.unloadPlugin(pluginId)

    // Remove settings
    this.settings.set(`plugin_enabled_${pluginId}` as any, undefined)

    // Remove plugin files
    const manifests = this.scanPlugins()
    const m = manifests.find(m => m.id === pluginId)
    if (m) {
      const dir = path.dirname(m.entryFile)
      if (dir.startsWith(this.pluginsDir)) {
        try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
      }
    }
    // Also try single-file
    const singleFile = path.join(this.pluginsDir, `${pluginId}.js`)
    if (fs.existsSync(singleFile)) {
      try { fs.unlinkSync(singleFile) } catch {}
    }
  }

  /** Install plugin from a .js file path (copy into plugins dir) */
  installPluginFromFile(filePath: string): PluginManifest {
    const name = path.basename(filePath, '.js')
    const dest = path.join(this.pluginsDir, path.basename(filePath))
    fs.copyFileSync(filePath, dest)
    const manifests = this.scanPlugins()
    return manifests.find(m => m.id === name) || {
      id: name, name, version: '1.0.0', description: '', author: 'Unknown',
      entryFile: dest, enabled: true, autoStart: false,
    }
  }

  /** Process incoming message through all loaded plugin auto-replies/triggers */
  processIncomingMessage(msg: any): void {
    for (const [, loaded] of this.plugins) {
      if (!loaded.state.running) continue
      try {
        loaded.api.processIncomingMessage(msg)
        // Emit the message event to all plugins
        loaded.api.ctx.emit('message', msg)
      } catch {}
    }
  }

  /** Execute arbitrary code in a plugin's context (for the console) */
  async executeInPlugin(pluginId: string, code: string): Promise<string> {
    const loaded = this.plugins.get(pluginId)
    if (!loaded) throw new Error(`Plugin "${pluginId}" is not loaded`)

    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
      const fn = new AsyncFunction('ctx', code)
      const result = await fn(loaded.api.ctx)
      return result !== undefined ? JSON.stringify(result, null, 2) : 'undefined'
    } catch (err: any) {
      throw new Error(err.message || String(err))
    }
  }

  /** Run code in a temporary sandbox with full API access */
  async runCode(code: string): Promise<string> {
    const tempId = `_temp_${Date.now()}`
    const api = createPluginAPI(
      tempId, this.sessionManager, this.wechatApi,
      this.settings, this.dataReader, this.getMainWindow,
    )
    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
      const fn = new AsyncFunction('ctx', code)
      const result = await fn(api.ctx)
      return result !== undefined ? JSON.stringify(result, null, 2) : 'undefined'
    } finally {
      api.cleanup()
    }
  }

  private pluginToInfo(loaded: LoadedPlugin): PluginInfo {
    const s = loaded.state
    return {
      id: s.manifest.id, name: s.manifest.name,
      version: s.manifest.version, description: s.manifest.description,
      author: s.manifest.author, enabled: s.manifest.enabled,
      autoStart: s.manifest.autoStart, running: s.running,
      error: s.error, logs: s.logs.slice(-100),
      registeredEvents: s.registeredEvents,
      registeredTimers: s.registeredTimers,
      registeredCommands: s.registeredCommands,
    }
  }
}
