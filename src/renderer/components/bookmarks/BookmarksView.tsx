import React, { useState, useEffect } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { BookmarkIcon, CloseIcon } from '../common/Icons'
import { formatMessageTime } from '../../../shared/types/message'
import './bookmarks.css'

interface StarredMessage {
  chatId: string
  localId: string
  content: string
  timestamp: number
  fromUser: string
  chatName: string
}

export default function BookmarksView() {
  const { getStarredMessages, unstarMessage, selectChat } = useSession()
  const [starred, setStarred] = useState<StarredMessage[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getStarredMessages().then(msgs => {
      setStarred(msgs)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [getStarredMessages])

  const handleClick = (chatId: string) => {
    selectChat(chatId)
  }

  const handleUnstar = async (e: React.MouseEvent, chatId: string, localId: string) => {
    e.stopPropagation()
    await unstarMessage(chatId, localId)
    setStarred(prev => prev.filter(m => !(m.chatId === chatId && m.localId === localId)))
  }

  return (
    <div className="bookmarks-view">
      <div className="bookmarks-header">Bookmarks ({starred.length})</div>
      <div className="bookmarks-list">
        {!loaded && <div className="bookmarks-empty">Loading...</div>}
        {loaded && starred.length === 0 && (
          <div className="bookmarks-empty">
            <BookmarkIcon size={32} color="var(--color-secondary-text)" />
            <span>No bookmarked messages</span>
            <span style={{ fontSize: 11 }}>Star messages in any chat to save them here</span>
          </div>
        )}
        {starred.map(msg => (
          <div key={`${msg.chatId}-${msg.localId}`} className="bookmark-row" onClick={() => handleClick(msg.chatId)}>
            <div className="bookmark-row-content">
              <div className="bookmark-row-top">
                <span className="bookmark-chat-name">{msg.chatName}</span>
                <span className="bookmark-time">{formatMessageTime(msg.timestamp)}</span>
              </div>
              <span className="bookmark-from">{msg.fromUser}</span>
              <span className="bookmark-text">{msg.content}</span>
            </div>
            <button className="bookmark-unstar" onClick={e => handleUnstar(e, msg.chatId, msg.localId)} title="Remove bookmark">
              <CloseIcon size={12} color="var(--color-secondary-text)" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
