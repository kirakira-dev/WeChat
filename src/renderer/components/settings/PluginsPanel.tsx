import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { PluginInfo } from '../../../shared/types/plugin'
import { PLUGIN_TOOL_CATEGORIES } from '../../../shared/types/plugin'

type ViewMode = 'list' | 'detail' | 'console' | 'api-ref'

export default function PluginsPanel() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('list')
  const [loading, setLoading] = useState(false)
  const [consoleInput, setConsoleInput] = useState('')
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])
  const [consolePluginId, setConsolePluginId] = useState<string>('_sandbox_')
  const [createName, setCreateName] = useState('')
  const [createTemplate, setCreateTemplate] = useState('blank')
  const [showCreate, setShowCreate] = useState(false)
  const consoleInputRef = useRef<HTMLTextAreaElement>(null)
  const consoleOutputRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const list = await window.electronAPI.pluginList()
    setPlugins(list)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const selectedPlugin = plugins.find(p => p.id === selectedId)

  const handleLoad = async (id: string) => {
    setLoading(true)
    try {
      await window.electronAPI.pluginLoad(id)
    } catch (e: any) {
      console.error(e)
    }
    await refresh()
    setLoading(false)
  }

  const handleUnload = async (id: string) => {
    await window.electronAPI.pluginUnload(id)
    await refresh()
  }

  const handleReload = async (id: string) => {
    setLoading(true)
    try {
      await window.electronAPI.pluginReload(id)
    } catch {}
    await refresh()
    setLoading(false)
  }

  const handleEnable = async (id: string, enabled: boolean) => {
    await window.electronAPI.pluginEnable(id, enabled)
    await refresh()
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.pluginDelete(id)
    if (selectedId === id) { setSelectedId(null); setView('list') }
    await refresh()
  }

  const handleCreate = async () => {
    if (!createName.trim()) return
    await window.electronAPI.pluginCreate(createName.trim(), createTemplate)
    setCreateName('')
    setShowCreate(false)
    await refresh()
  }

  const handleInstall = async () => {
    const file = await window.electronAPI.systemOpenFileDialog()
    if (!file) return
    await window.electronAPI.pluginInstall(file.path)
    await refresh()
  }

  const handleOpenDir = async () => {
    const dir = await window.electronAPI.pluginGetDir()
    window.electronAPI.systemOpenPath(dir)
  }

  const handleConsoleRun = async () => {
    const code = consoleInput.trim()
    if (!code) return
    setConsoleOutput(prev => [...prev, `> ${code}`])
    setConsoleInput('')
    try {
      let result: string
      if (consolePluginId === '_sandbox_') {
        result = await window.electronAPI.pluginRunCode(code)
      } else {
        result = await window.electronAPI.pluginExec(consolePluginId, code)
      }
      setConsoleOutput(prev => [...prev, result])
    } catch (err: any) {
      setConsoleOutput(prev => [...prev, `Error: ${err.message || err}`])
    }
    setTimeout(() => consoleOutputRef.current?.scrollTo(0, consoleOutputRef.current.scrollHeight), 50)
  }

  const handleConsoleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleConsoleRun()
    }
  }

  // ── List View ──
  if (view === 'list') {
    return (
      <div className="settings-page">
        <h2>Plugins</h2>
        <p className="settings-desc">
          Load custom JavaScript plugins with full access to 90+ WeChat tools.
          Plugins run in the main process with full Node.js capabilities.
        </p>

        <div className="settings-group" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="settings-btn" onClick={() => setShowCreate(true)}>New Plugin</button>
          <button className="settings-btn" onClick={handleInstall}>Install from File</button>
          <button className="settings-btn" onClick={handleOpenDir}>Open Plugins Folder</button>
          <button className="settings-btn" onClick={() => setView('console')}>Console</button>
          <button className="settings-btn" onClick={() => setView('api-ref')}>API Reference</button>
          <button className="settings-btn" onClick={refresh}>Refresh</button>
        </div>

        {showCreate && (
          <div className="settings-group plugin-create-form">
            <h3>Create New Plugin</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Plugin name..."
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                className="settings-text-input"
                style={{ flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <select
                value={createTemplate}
                onChange={e => setCreateTemplate(e.target.value)}
                className="plugin-template-select"
              >
                <option value="blank">Blank</option>
                <option value="auto-reply">Auto-Reply</option>
                <option value="scheduler">Scheduler</option>
                <option value="stats">Stats</option>
              </select>
              <button className="settings-btn plugin-create-btn" onClick={handleCreate}>Create</button>
              <button className="settings-btn" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        )}

        {plugins.length === 0 && (
          <div className="settings-group">
            <p className="settings-desc" style={{ textAlign: 'center', padding: 24 }}>
              No plugins found. Create one or install a .js plugin file.
            </p>
          </div>
        )}

        {plugins.map(plugin => (
          <div key={plugin.id} className={`plugin-card ${plugin.running ? 'running' : ''} ${plugin.error ? 'errored' : ''}`}>
            <div className="plugin-card-header">
              <div className="plugin-card-info">
                <span className="plugin-card-name">{plugin.name}</span>
                <span className="plugin-card-version">v{plugin.version}</span>
                <span className={`plugin-card-status ${plugin.running ? 'running' : plugin.error ? 'error' : 'stopped'}`}>
                  {plugin.running ? 'Running' : plugin.error ? 'Error' : 'Stopped'}
                </span>
              </div>
              <div className="plugin-card-actions">
                {!plugin.running ? (
                  <button className="settings-btn plugin-action-btn" onClick={() => handleLoad(plugin.id)} disabled={loading}>
                    Load
                  </button>
                ) : (
                  <>
                    <button className="settings-btn plugin-action-btn" onClick={() => handleReload(plugin.id)} disabled={loading}>
                      Reload
                    </button>
                    <button className="settings-btn plugin-action-btn" onClick={() => handleUnload(plugin.id)}>
                      Stop
                    </button>
                  </>
                )}
                <button className="settings-btn plugin-action-btn" onClick={() => { setSelectedId(plugin.id); setView('detail') }}>
                  Details
                </button>
              </div>
            </div>
            {plugin.description && <p className="plugin-card-desc">{plugin.description}</p>}
            {plugin.error && <p className="plugin-card-error">{plugin.error}</p>}
            {plugin.running && (
              <div className="plugin-card-meta">
                {plugin.registeredEvents.length > 0 && <span>Events: {plugin.registeredEvents.join(', ')}</span>}
                {plugin.registeredTimers > 0 && <span>Timers: {plugin.registeredTimers}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  // ── Detail View ──
  if (view === 'detail' && selectedPlugin) {
    return (
      <div className="settings-page">
        <button className="settings-btn" onClick={() => setView('list')} style={{ marginBottom: 12 }}>
          ← Back to Plugins
        </button>
        <h2>{selectedPlugin.name}</h2>
        <div className="settings-group">
          <div className="plugin-detail-grid">
            <span className="plugin-detail-label">ID</span><span>{selectedPlugin.id}</span>
            <span className="plugin-detail-label">Version</span><span>{selectedPlugin.version}</span>
            <span className="plugin-detail-label">Author</span><span>{selectedPlugin.author}</span>
            <span className="plugin-detail-label">Status</span>
            <span className={`plugin-card-status ${selectedPlugin.running ? 'running' : selectedPlugin.error ? 'error' : 'stopped'}`}>
              {selectedPlugin.running ? 'Running' : selectedPlugin.error ? 'Error' : 'Stopped'}
            </span>
          </div>
        </div>

        <div className="settings-group" style={{ display: 'flex', gap: 6 }}>
          {!selectedPlugin.running ? (
            <button className="settings-btn" onClick={() => handleLoad(selectedPlugin.id)} disabled={loading}>Load Plugin</button>
          ) : (
            <>
              <button className="settings-btn" onClick={() => handleReload(selectedPlugin.id)} disabled={loading}>Reload</button>
              <button className="settings-btn" onClick={() => handleUnload(selectedPlugin.id)}>Stop</button>
            </>
          )}
          <button className="settings-btn" onClick={() => { setConsolePluginId(selectedPlugin.id); setView('console') }}>
            Open Console
          </button>
          <button className="settings-danger-btn" onClick={() => handleDelete(selectedPlugin.id)}>Delete</button>
        </div>

        {selectedPlugin.error && (
          <div className="settings-group">
            <h3>Error</h3>
            <pre className="plugin-error-pre">{selectedPlugin.error}</pre>
          </div>
        )}

        {selectedPlugin.logs.length > 0 && (
          <div className="settings-group">
            <h3>Logs ({selectedPlugin.logs.length})</h3>
            <div className="plugin-logs-container">
              {selectedPlugin.logs.slice(-50).map((log, i) => (
                <div key={i} className={`plugin-log-entry plugin-log-${log.level}`}>
                  <span className="plugin-log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="plugin-log-level">[{log.level}]</span>
                  <span className="plugin-log-msg">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedPlugin.running && selectedPlugin.registeredEvents.length > 0 && (
          <div className="settings-group">
            <h3>Registered Events</h3>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {selectedPlugin.registeredEvents.map(e => (
                <span key={e} className="plugin-event-badge">{e}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Console View ──
  if (view === 'console') {
    return (
      <div className="settings-page plugin-console-page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button className="settings-btn" onClick={() => setView('list')}>← Back</button>
          <h2 style={{ margin: 0 }}>Plugin Console</h2>
          <select
            className="plugin-template-select"
            value={consolePluginId}
            onChange={e => setConsolePluginId(e.target.value)}
            style={{ marginLeft: 'auto' }}
          >
            <option value="_sandbox_">Sandbox (no plugin)</option>
            {plugins.filter(p => p.running).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="settings-btn" onClick={() => setConsoleOutput([])}>Clear</button>
        </div>
        <p className="settings-desc" style={{ margin: '0 0 8px' }}>
          Execute code with full access to {consolePluginId === '_sandbox_' ? 'all 90+ plugin tools' : `${consolePluginId}'s context`}.
          Use <code>ctx</code> to access tools. Return values are displayed below.
        </p>
        <div className="plugin-console-output" ref={consoleOutputRef}>
          {consoleOutput.length === 0 && (
            <div className="plugin-console-hint">
              Try: <code>return ctx.getContacts().length</code> or <code>return ctx.getSessions().map(s =&gt; s.name)</code>
            </div>
          )}
          {consoleOutput.map((line, i) => (
            <div key={i} className={`plugin-console-line ${line.startsWith('>') ? 'input' : line.startsWith('Error') ? 'error' : 'output'}`}>
              <pre>{line}</pre>
            </div>
          ))}
        </div>
        <div className="plugin-console-input-wrap">
          <textarea
            ref={consoleInputRef}
            className="plugin-console-input"
            placeholder="return ctx.getContacts().length"
            value={consoleInput}
            onChange={e => setConsoleInput(e.target.value)}
            onKeyDown={handleConsoleKey}
            rows={3}
          />
          <button className="settings-btn plugin-console-run" onClick={handleConsoleRun}>Run (Enter)</button>
        </div>
      </div>
    )
  }

  // ── API Reference View ──
  if (view === 'api-ref') {
    const categories = Object.entries(PLUGIN_TOOL_CATEGORIES)
    const totalTools = categories.reduce((sum, [, tools]) => sum + tools.length, 0)
    return (
      <div className="settings-page">
        <button className="settings-btn" onClick={() => setView('list')} style={{ marginBottom: 12 }}>
          ← Back to Plugins
        </button>
        <h2>Plugin API Reference</h2>
        <p className="settings-desc">
          {totalTools} tools available across {categories.length} categories. All accessed via <code>ctx.toolName()</code> in plugin code.
        </p>
        {categories.map(([category, tools]) => (
          <div key={category} className="settings-group">
            <h3>{category} ({tools.length})</h3>
            <div className="plugin-api-tools">
              {tools.map(tool => (
                <code key={tool} className="plugin-api-tool">{tool}</code>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Fallback
  return (
    <div className="settings-page">
      <button className="settings-btn" onClick={() => setView('list')}>← Back to Plugins</button>
    </div>
  )
}
