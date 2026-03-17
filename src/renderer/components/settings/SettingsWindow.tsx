import React, { useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useSession } from '../../contexts/SessionContext'
import { contactDisplayName } from '../../../shared/types/contact'
import PluginsPanel from './PluginsPanel'
import './settings.css'

type Tab = 'General' | 'Appearance' | 'Account' | 'Chat' | 'Notifications' | 'Privacy' | 'Storage' | 'Shortcuts' | 'Network' | 'Plugins' | 'Advanced'

const TABS: Tab[] = ['General', 'Appearance', 'Account', 'Chat', 'Notifications', 'Privacy', 'Storage', 'Shortcuts', 'Network', 'Plugins', 'Advanced']

export default function SettingsWindow() {
  const [activeTab, setActiveTab] = useState<Tab>('General')

  return (
    <div className="settings-window">
      <div className="settings-sidebar">
        {TABS.map(tab => (
          <button key={tab} className={`settings-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      <div className="settings-detail">
        <SettingsContent tab={activeTab} />
      </div>
    </div>
  )
}

function SettingsContent({ tab }: { tab: Tab }) {
  const { settings, setSetting, resetAll } = useSettings()
  const { state, logout } = useSession()

  switch (tab) {
    case 'General':
      return (
        <div className="settings-page">
          <h2>General</h2>
          <div className="settings-group">
            <h3>Startup</h3>
            <Toggle label="Launch WeChat at login" value={settings.launchAtLogin} onChange={v => setSetting('launchAtLogin', v)} />
            <Toggle label="Confirm before quitting" value={settings.confirmBeforeQuit} onChange={v => setSetting('confirmBeforeQuit', v)} />
            <SelectRow label="Default tab on launch" value={settings.defaultTab} options={[['chats','Chats'],['contacts','Contacts']]} onChange={v => setSetting('defaultTab', v)} />
          </div>
          <div className="settings-group">
            <h3>Behavior</h3>
            <Toggle label="Show unread count on Dock icon" value={settings.showDockBadge} onChange={v => setSetting('showDockBadge', v)} />
            <Toggle label="Auto-switch to new incoming chat" value={settings.autoSwitchToNewChat} onChange={v => setSetting('autoSwitchToNewChat', v)} />
            <Toggle label="Keep window on top" value={settings.keepWindowOnTop} onChange={v => setSetting('keepWindowOnTop', v)} />
            <Toggle label="Open links inside app" value={settings.openLinksInApp} onChange={v => setSetting('openLinksInApp', v)} />
          </div>
          <div className="settings-group">
            <h3>Sound</h3>
            <Toggle label="Enable sound effects" value={settings.soundEnabled} onChange={v => setSetting('soundEnabled', v)} />
            <SelectRow label="Notification style" value={settings.notificationStyle} options={[['banner','Banner'],['alert','Alert'],['none','None']]} onChange={v => setSetting('notificationStyle', v)} />
            <Toggle label="Show message preview" value={settings.showMessagePreview} onChange={v => setSetting('showMessagePreview', v)} />
          </div>
        </div>
      )

    case 'Appearance':
      return (
        <div className="settings-page">
          <h2>Appearance</h2>
          <div className="settings-group">
            <h3>Theme</h3>
            <div className="theme-picker">
              {(['light', 'dark', 'custom'] as const).map(mode => (
                <button key={mode} className={`theme-btn ${settings.themeMode === mode ? 'active' : ''}`}
                  onClick={() => setSetting('themeMode', mode)}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</button>
              ))}
            </div>
            {settings.themeMode === 'custom' && (
              <div className="custom-colors">
                <ColorRow label="Accent / Logo Color" r={settings.customAccentR} g={settings.customAccentG} b={settings.customAccentB}
                  onChange={(r,g,b) => { setSetting('customAccentR', r); setSetting('customAccentG', g); setSetting('customAccentB', b) }} />
                <ColorRow label="Your Bubble" r={settings.customBubbleR} g={settings.customBubbleG} b={settings.customBubbleB}
                  onChange={(r,g,b) => { setSetting('customBubbleR', r); setSetting('customBubbleG', g); setSetting('customBubbleB', b) }} />
                <ColorRow label="Other Bubble" r={settings.customBubbleOtherR} g={settings.customBubbleOtherG} b={settings.customBubbleOtherB}
                  onChange={(r,g,b) => { setSetting('customBubbleOtherR', r); setSetting('customBubbleOtherG', g); setSetting('customBubbleOtherB', b) }} />
                <ColorRow label="Background" r={settings.customBgR} g={settings.customBgG} b={settings.customBgB}
                  onChange={(r,g,b) => { setSetting('customBgR', r); setSetting('customBgG', g); setSetting('customBgB', b) }} />
                <ColorRow label="Selected Field" r={settings.customSelectedR} g={settings.customSelectedG} b={settings.customSelectedB}
                  onChange={(r,g,b) => { setSetting('customSelectedR', r); setSetting('customSelectedG', g); setSetting('customSelectedB', b) }} />
                <ColorRow label="Mouse Hover Field" r={settings.customHoverR} g={settings.customHoverG} b={settings.customHoverB}
                  onChange={(r,g,b) => { setSetting('customHoverR', r); setSetting('customHoverG', g); setSetting('customHoverB', b) }} />
                <ColorRow label="Sidebar" r={settings.customSidebarR} g={settings.customSidebarG} b={settings.customSidebarB}
                  onChange={(r,g,b) => { setSetting('customSidebarR', r); setSetting('customSidebarG', g); setSetting('customSidebarB', b) }} />
                <ColorRow label="Chat List" r={settings.customChatlistR} g={settings.customChatlistG} b={settings.customChatlistB}
                  onChange={(r,g,b) => { setSetting('customChatlistR', r); setSetting('customChatlistG', g); setSetting('customChatlistB', b) }} />
                <ColorRow label="Input Area" r={settings.customInputR} g={settings.customInputG} b={settings.customInputB}
                  onChange={(r,g,b) => { setSetting('customInputR', r); setSetting('customInputG', g); setSetting('customInputB', b) }} />
                <ColorRow label="Primary Text" r={settings.customPrimaryTextR} g={settings.customPrimaryTextG} b={settings.customPrimaryTextB}
                  onChange={(r,g,b) => { setSetting('customPrimaryTextR', r); setSetting('customPrimaryTextG', g); setSetting('customPrimaryTextB', b) }} />
                <ColorRow label="Secondary Text" r={settings.customSecondaryTextR} g={settings.customSecondaryTextG} b={settings.customSecondaryTextB}
                  onChange={(r,g,b) => { setSetting('customSecondaryTextR', r); setSetting('customSecondaryTextG', g); setSetting('customSecondaryTextB', b) }} />
              </div>
            )}
          </div>
          <div className="settings-group">
            <h3>Font & Layout</h3>
            <SliderRow label="Font size" value={settings.fontSize} min={10} max={20} onChange={v => setSetting('fontSize', v)} />
            <SelectRow label="Avatar shape" value={settings.avatarStyle} options={[['rounded','Rounded'],['circle','Circle'],['square','Square']]} onChange={v => setSetting('avatarStyle', v as any)} />
            <SelectRow label="Message density" value={settings.messageDensity} options={[['compact','Compact'],['normal','Normal'],['comfortable','Comfortable']]} onChange={v => setSetting('messageDensity', v as any)} />
            <Toggle label="Show avatars in chat" value={settings.showAvatarsInChat} onChange={v => setSetting('showAvatarsInChat', v)} />
          </div>
        </div>
      )

    case 'Account':
      return (
        <div className="settings-page">
          <h2>Account</h2>
          <div className="settings-group">
            <h3>Current Account</h3>
            <p className="settings-info">{state.wxid || 'Not logged in'}</p>
            <p className="settings-info">Contacts: {state.contacts.length}</p>
            <p className="settings-info">Conversations: {state.chatSessions.length}</p>
            <p className="settings-info">Data source: {state.dataSource}</p>
          </div>
          <button className="settings-danger-btn" onClick={() => logout()}>Logout</button>
        </div>
      )

    case 'Chat':
      return (
        <div className="settings-page">
          <h2>Chat</h2>
          <div className="settings-group">
            <h3>Input</h3>
            <Toggle label="Press Return to send" value={settings.sendWithReturn} onChange={v => setSetting('sendWithReturn', v)} />
          </div>
          <div className="settings-group">
            <h3>Display</h3>
            <Toggle label="Show timestamps" value={settings.showTimestamps} onChange={v => setSetting('showTimestamps', v)} />
            <Toggle label="Show read receipts" value={settings.showReadReceipts} onChange={v => setSetting('showReadReceipts', v)} />
          </div>
          <div className="settings-group">
            <h3>Media</h3>
            <Toggle label="Auto-download images" value={settings.autoDownloadImages} onChange={v => setSetting('autoDownloadImages', v)} />
            <Toggle label="Auto-download files" value={settings.autoDownloadFiles} onChange={v => setSetting('autoDownloadFiles', v)} />
            <SliderRow label="Image preview size" value={settings.maxImagePreviewSize} min={100} max={400} step={50} onChange={v => setSetting('maxImagePreviewSize', v)} />
          </div>
          <div className="settings-group">
            <h3>History</h3>
            <NumberRow label="Messages per conversation" value={settings.chatHistoryLimit} onChange={v => setSetting('chatHistoryLimit', v)} />
          </div>
        </div>
      )

    case 'Notifications':
      return (
        <div className="settings-page">
          <h2>Notifications</h2>
          <div className="settings-group">
            <Toggle label="Mute all notifications" value={settings.muteAll} onChange={v => setSetting('muteAll', v)} />
            {!settings.muteAll && <>
              <Toggle label="Group chat notifications" value={settings.groupNotifications} onChange={v => setSetting('groupNotifications', v)} />
              <Toggle label="Notify when mentioned" value={settings.mentionNotifications} onChange={v => setSetting('mentionNotifications', v)} />
              <Toggle label="Play notification sound" value={settings.soundEnabled} onChange={v => setSetting('soundEnabled', v)} />
            </>}
          </div>
          <div className="settings-group">
            <h3>Do Not Disturb</h3>
            <Toggle label="Enable DND schedule" value={settings.doNotDisturbEnabled} onChange={v => setSetting('doNotDisturbEnabled', v)} />
          </div>
        </div>
      )

    case 'Privacy':
      return (
        <div className="settings-page">
          <h2>Privacy & Security</h2>
          <div className="settings-group">
            <Toggle label="Show online status" value={settings.showOnlineStatus} onChange={v => setSetting('showOnlineStatus', v)} />
            <Toggle label="Hide typing indicator" value={settings.hideTypingIndicator} onChange={v => setSetting('hideTypingIndicator', v)} />
            <Toggle label="Allow stranger messages" value={settings.allowStrangerMessages} onChange={v => setSetting('allowStrangerMessages', v)} />
            <Toggle label="Blur media in list" value={settings.blurMediaInList} onChange={v => setSetting('blurMediaInList', v)} />
          </div>
        </div>
      )

    case 'Storage':
      return (
        <div className="settings-page">
          <h2>Storage & Data</h2>
          <div className="settings-group">
            <h3>Database</h3>
            <button className="settings-btn" onClick={() => { window.electronAPI.systemGetDBPath().then(p => { if (p) window.electronAPI.systemOpenPath(p) }) }}>
              Open Database Folder
            </button>
          </div>
          <div className="settings-group">
            <h3>Export</h3>
            <SelectRow label="Export format" value={settings.exportFormat} options={[['json','JSON'],['csv','CSV'],['html','HTML']]} onChange={v => setSetting('exportFormat', v)} />
          </div>
          <div className="settings-group">
            <h3>Cache</h3>
            <Toggle label="Auto-clean temp files" value={settings.autoCleanTempFiles} onChange={v => setSetting('autoCleanTempFiles', v)} />
            <NumberRow label="Keep temp files (days)" value={settings.tempFileRetentionDays} onChange={v => setSetting('tempFileRetentionDays', v)} />
          </div>
        </div>
      )

    case 'Shortcuts':
      return (
        <div className="settings-page">
          <h2>Keyboard Shortcuts</h2>
          <div className="settings-group">
            <h3>Navigation</h3>
            <ShortcutRow label="Settings" keys="Cmd + ," />
            <ShortcutRow label="Chats" keys="Cmd + 1" />
            <ShortcutRow label="Contacts" keys="Cmd + 2" />
            <ShortcutRow label="Search" keys="Cmd + F" />
          </div>
          <div className="settings-group">
            <h3>Chat</h3>
            <ShortcutRow label="Send" keys="Enter" />
            <ShortcutRow label="New line" keys="Shift + Enter" />
            <ShortcutRow label="Attach file" keys="Cmd + Shift + A" />
            <ShortcutRow label="Screenshot" keys="Cmd + Shift + S" />
          </div>
          <p className="settings-desc">Shortcuts are not customizable in this version.</p>
        </div>
      )

    case 'Network':
      return (
        <div className="settings-page">
          <h2>Network</h2>
          <div className="settings-group">
            <h3>Proxy</h3>
            <Toggle label="Use system proxy" value={settings.useSystemProxy} onChange={v => setSetting('useSystemProxy', v)} />
            {!settings.useSystemProxy && <>
              <Toggle label="Enable proxy" value={settings.proxyEnabled} onChange={v => setSetting('proxyEnabled', v)} />
              {settings.proxyEnabled && <>
                <SelectRow label="Type" value={settings.proxyType} options={[['SOCKS5','SOCKS5'],['HTTP','HTTP'],['HTTPS','HTTPS']]} onChange={v => setSetting('proxyType', v)} />
                <TextRow label="Host" value={settings.proxyHost} onChange={v => setSetting('proxyHost', v)} />
                <NumberRow label="Port" value={settings.proxyPort} onChange={v => setSetting('proxyPort', v)} />
              </>}
            </>}
          </div>
          <div className="settings-group">
            <h3>Connection</h3>
            <NumberRow label="Timeout (sec)" value={settings.networkTimeout} onChange={v => setSetting('networkTimeout', v)} />
            <NumberRow label="Max downloads" value={settings.maxConcurrentDownloads} onChange={v => setSetting('maxConcurrentDownloads', v)} />
          </div>
        </div>
      )

    case 'Plugins':
      return <PluginsPanel />

    case 'Advanced':
      return (
        <div className="settings-page">
          <h2>Advanced</h2>
          <div className="settings-group">
            <h3>Performance</h3>
            <Toggle label="Hardware acceleration" value={settings.enableHardwareAcceleration} onChange={v => setSetting('enableHardwareAcceleration', v)} />
            <Toggle label="Reduce motion" value={settings.reduceMotion} onChange={v => setSetting('reduceMotion', v)} />
            <NumberRow label="DB cache (MB)" value={settings.databaseCacheSize} onChange={v => setSetting('databaseCacheSize', v)} />
          </div>
          <div className="settings-group">
            <h3>Text</h3>
            <Toggle label="Spell checking" value={settings.enableSpellCheck} onChange={v => setSetting('enableSpellCheck', v)} />
            <Toggle label="Markdown in messages" value={settings.experimentalMarkdown} onChange={v => setSetting('experimentalMarkdown', v)} />
          </div>
          <div className="settings-group">
            <h3>Developer</h3>
            <Toggle label="Debug logging" value={settings.enableDebugLog} onChange={v => setSetting('enableDebugLog', v)} />
            <Toggle label="Developer mode" value={settings.developerMode} onChange={v => setSetting('developerMode', v)} />
          </div>
          <button className="settings-danger-btn" onClick={resetAll}>Reset All Settings</button>
        </div>
      )
  }
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="settings-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
    </label>
  )
}

function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (v: string) => void }) {
  return (
    <label className="settings-row">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function SliderRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="settings-row">
      <span>{label}</span>
      <div className="slider-wrap">
        <input type="range" min={min} max={max} step={step ?? 1} value={value} onChange={e => onChange(Number(e.target.value))} />
        <span className="slider-value">{value}</span>
      </div>
    </label>
  )
}

function NumberRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="settings-row">
      <span>{label}</span>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} className="settings-number-input" />
    </label>
  )
}

function TextRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="settings-row">
      <span>{label}</span>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className="settings-text-input" />
    </label>
  )
}

function ColorRow({ label, r, g, b, onChange }: { label: string; r: number; g: number; b: number; onChange: (r: number, g: number, b: number) => void }) {
  const hex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
  const handleChange = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (result) onChange(parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255)
  }

  return (
    <label className="settings-row">
      <span>{label}</span>
      <input type="color" value={hex} onChange={e => handleChange(e.target.value)} />
    </label>
  )
}

function ShortcutRow({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="shortcut-row">
      <span>{label}</span>
      <span className="shortcut-keys">{keys}</span>
    </div>
  )
}
