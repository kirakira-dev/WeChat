import React, { useState, useEffect, useCallback } from 'react'
import { useSession } from '../../contexts/SessionContext'
import IconSidebar from './IconSidebar'
import ChatListView from '../chat-list/ChatListView'
import ContactsListView from '../contacts/ContactsListView'
import MomentsView from '../moments/MomentsView'
import CallHistoryView from '../calls/CallHistoryView'
import BookmarksView from '../bookmarks/BookmarksView'
import GlobalSearchOverlay from '../search/GlobalSearchOverlay'
import ChatView from '../chat/ChatView'
import SettingsWindow from '../settings/SettingsWindow'
import { SearchIcon, WeChatLogo } from '../common/Icons'
import './layout.css'

export default function MainView() {
  const { state, setTab } = useSession()
  const [searchText, setSearchText] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const selectedSession = state.chatSessions.find(s => s.id === state.selectedChatId)

  // QOL: Global keyboard shortcuts
  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey

    if (meta && e.key === ',') {
      e.preventDefault()
      setShowSettings(prev => !prev)
    }
    if (meta && e.key === '1') {
      e.preventDefault()
      setTab('chats')
      setShowSettings(false)
    }
    if (meta && e.key === '2') {
      e.preventDefault()
      setTab('contacts')
      setShowSettings(false)
    }
    if (meta && e.key === '3') {
      e.preventDefault()
      setTab('moments')
      setShowSettings(false)
    }
    if (meta && e.key === '4') {
      e.preventDefault()
      setTab('calls')
      setShowSettings(false)
    }
    if (meta && e.key === '5') {
      e.preventDefault()
      setTab('bookmarks')
      setShowSettings(false)
    }
    if (meta && e.shiftKey && e.key === 'f') {
      e.preventDefault()
      setShowGlobalSearch(true)
      return
    }
    if (meta && e.key === 'f') {
      e.preventDefault()
      searchInputRef.current?.focus()
    }
    if (e.key === 'Escape') {
      if (showGlobalSearch) {
        setShowGlobalSearch(false)
      } else if (showSettings) {
        setShowSettings(false)
      } else if (searchText) {
        setSearchText('')
      }
    }
  }, [setTab, showSettings, showGlobalSearch, searchText])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [handleKeyboard])

  // Full-width tabs (settings, moments, calls, bookmarks)
  const fullWidthTabs = ['moments', 'calls', 'bookmarks'] as const

  if (showSettings) {
    return (
      <div className="main-view">
        <IconSidebar onOpenSettings={() => setShowSettings(false)} onOpenGlobalSearch={() => setShowGlobalSearch(true)} />
        <div className="divider-v" />
        <div style={{ flex: 1, display: 'flex' }}>
          <SettingsWindow />
        </div>
        {showGlobalSearch && <GlobalSearchOverlay onClose={() => setShowGlobalSearch(false)} />}
      </div>
    )
  }

  if (fullWidthTabs.includes(state.currentTab as any)) {
    return (
      <div className="main-view">
        <IconSidebar onOpenSettings={() => setShowSettings(true)} onOpenGlobalSearch={() => setShowGlobalSearch(true)} />
        <div className="divider-v" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-chatlist-bg)' }}>
          <div className="traffic-light-space" />
          {state.currentTab === 'moments' && <MomentsView />}
          {state.currentTab === 'calls' && <CallHistoryView />}
          {state.currentTab === 'bookmarks' && <BookmarksView />}
        </div>
        {showGlobalSearch && <GlobalSearchOverlay onClose={() => setShowGlobalSearch(false)} />}
      </div>
    )
  }

  return (
    <div className="main-view">
      <IconSidebar onOpenSettings={() => setShowSettings(true)} onOpenGlobalSearch={() => setShowGlobalSearch(true)} />
      <div className="divider-v" />
      <div className="middle-panel">
        <div className="traffic-light-space" />
        <div className="search-bar">
          <SearchIcon size={14} color="var(--color-secondary-text)" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search (⌘F)"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="middle-content">
          {state.currentTab === 'chats' && <ChatListView searchText={searchText} />}
          {state.currentTab === 'contacts' && <ContactsListView searchText={searchText} />}
        </div>
      </div>
      <div className="divider-v" />
      <div className="chat-area">
        {selectedSession ? (
          <ChatView key={selectedSession.id} session={selectedSession} />
        ) : (
          <div className="empty-chat">
            <div className="empty-icon"><WeChatLogo size={120} /></div>
          </div>
        )}
      </div>
      {showGlobalSearch && <GlobalSearchOverlay onClose={() => setShowGlobalSearch(false)} />}
    </div>
  )
}
