import React, { useState, useCallback } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { contactDisplayName } from '../../../shared/types/contact'
import { formatMessageTime, displayContent } from '../../../shared/types/message'
import AvatarView from '../common/AvatarView'
import { FilterIcon, PinIcon, LockIcon } from '../common/Icons'
import './chat-list.css'

interface Props {
  searchText: string
}

export default function ChatListView({ searchText }: Props) {
  const { state, selectChat, loadHiddenSessions } = useSession()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null)

  const filtered = state.chatSessions
    .filter(s => {
      if (unreadOnly && s.unreadCount === 0) return false
      if (!searchText) return true
      const name = contactDisplayName(s.contact).toLowerCase()
      return name.includes(searchText.toLowerCase())
    })
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return (b.sortTimestamp || 0) - (a.sortTimestamp || 0)
    })

  const totalUnread = state.chatSessions.reduce((sum, s) => sum + s.unreadCount, 0)

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId })
  }, [])

  const handleTogglePin = useCallback((sessionId: string) => {
    const session = state.chatSessions.find(s => s.id === sessionId)
    if (session) {
      window.electronAPI.settingsSet(`pinned_${sessionId}`, !session.isPinned)
      // Optimistic update — session manager handles this on reload
    }
    setContextMenu(null)
  }, [state.chatSessions])

  const handleCopyName = useCallback((sessionId: string) => {
    const session = state.chatSessions.find(s => s.id === sessionId)
    if (session) {
      window.electronAPI.systemClipboardWrite(contactDisplayName(session.contact))
    }
    setContextMenu(null)
  }, [state.chatSessions])

  const handleCopyId = useCallback((sessionId: string) => {
    window.electronAPI.systemClipboardWrite(sessionId)
    setContextMenu(null)
  }, [])

  return (
    <div className="chat-list" onClick={() => setContextMenu(null)}>
      {totalUnread > 0 && (
        <button
          className={`unread-filter-btn ${unreadOnly ? 'active' : ''}`}
          onClick={e => { e.stopPropagation(); setUnreadOnly(!unreadOnly) }}
          title={unreadOnly ? 'Show all chats' : `Show unread only (${totalUnread})`}
        >
          <FilterIcon size={12} />
          <span>{unreadOnly ? 'All Chats' : `${totalUnread} Unread`}</span>
        </button>
      )}
      {filtered.map(session => (
        <ChatListRow
          key={session.id}
          session={session}
          selected={state.selectedChatId === session.id}
          onClick={() => selectChat(session.id)}
          onContextMenu={e => handleContextMenu(e, session.id)}
        />
      ))}
      {/* Hidden chats toggle */}
      {state.hiddenSessions && state.hiddenSessions.length > 0 && (
        <>
          <button
            className={`unread-filter-btn ${showHidden ? 'active' : ''}`}
            onClick={e => { e.stopPropagation(); setShowHidden(!showHidden) }}
            style={{ marginTop: 4 }}
          >
            <LockIcon size={12} />
            <span>{showHidden ? 'Hide Hidden' : `${state.hiddenSessions.length} Hidden`}</span>
          </button>
          {showHidden && state.hiddenSessions.map(session => (
            <ChatListRow
              key={session.id}
              session={session}
              selected={state.selectedChatId === session.id}
              onClick={() => selectChat(session.id)}
              onContextMenu={e => handleContextMenu(e, session.id)}
              dimmed
            />
          ))}
        </>
      )}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={() => handleTogglePin(contextMenu.sessionId)}>
            <PinIcon size={14} />
            <span>{state.chatSessions.find(s => s.id === contextMenu.sessionId)?.isPinned ? 'Unpin' : 'Pin to Top'}</span>
          </button>
          <button className="context-menu-item" onClick={() => handleCopyName(contextMenu.sessionId)}>
            Copy Name
          </button>
          <button className="context-menu-item" onClick={() => handleCopyId(contextMenu.sessionId)}>
            Copy ID
          </button>
        </div>
      )}
    </div>
  )
}

function ChatListRow({ session, selected, onClick, onContextMenu, dimmed }: {
  session: any; selected: boolean; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void; dimmed?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const name = contactDisplayName(session.contact)
  const lastMsg = session.messages[session.messages.length - 1]
  const preview = lastMsg ? displayContent(lastMsg).substring(0, 60) : ''
  const time = lastMsg ? formatMessageTime(lastMsg.timestamp) : ''

  return (
    <div
      className={`chat-row ${selected ? 'selected' : ''} ${hovered ? 'hovered' : ''} ${session.isPinned ? 'pinned' : ''} ${dimmed ? 'dimmed' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="chat-row-avatar">
        <AvatarView url={session.contact.avatarURL} size={40} fallbackName={name} />
        {session.unreadCount > 0 && (
          <span className="badge">{session.unreadCount > 99 ? '99+' : session.unreadCount}</span>
        )}
      </div>
      <div className="chat-row-text">
        <div className="chat-row-top">
          <span className="chat-row-name">
            {session.isPinned && <span className="pin-indicator">📌 </span>}
            {name}
          </span>
          <span className="chat-row-time">{time}</span>
        </div>
        <p className="chat-row-preview">{preview}</p>
      </div>
    </div>
  )
}
