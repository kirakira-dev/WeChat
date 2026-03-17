import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from '../../contexts/SessionContext'
import type { GlobalSearchResult } from '../../../shared/types/search'
import { GlobalSearchIcon, CloseIcon } from '../common/Icons'
import AvatarView from '../common/AvatarView'
import { formatMessageTime } from '../../../shared/types/message'
import './global-search.css'

interface Props {
  onClose: () => void
}

export default function GlobalSearchOverlay({ onClose }: Props) {
  const { globalSearch, selectChat } = useSession()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    try {
      const r = await globalSearch(q.trim())
      setResults(r)
      setSearched(true)
    } catch { setResults([]) }
    setLoading(false)
  }, [globalSearch])

  const handleInput = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 400)
  }

  const handleResultClick = (chatId: string) => {
    selectChat(chatId)
    onClose()
  }

  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  const totalMessages = results.reduce((sum, g) => sum + g.messages.length, 0)

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-modal" onClick={e => e.stopPropagation()}>
        <div className="global-search-header">
          <GlobalSearchIcon size={18} color="var(--color-secondary-text)" />
          <input
            ref={inputRef}
            className="global-search-input"
            placeholder="Search all chats..."
            value={query}
            onChange={e => handleInput(e.target.value)}
          />
          {searched && (
            <span className="global-search-hint">
              {totalMessages} result{totalMessages !== 1 ? 's' : ''} in {results.length} chat{results.length !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={onClose} style={{ padding: 4, borderRadius: 'var(--radius-sm)', display: 'flex' }}>
            <CloseIcon size={16} color="var(--color-secondary-text)" />
          </button>
        </div>

        <div className="global-search-results">
          {loading && <div className="global-search-loading">Searching...</div>}
          {!loading && searched && results.length === 0 && (
            <div className="global-search-empty">No results found for "{query}"</div>
          )}
          {!loading && !searched && (
            <div className="global-search-empty">Type at least 2 characters to search across all chats</div>
          )}
          {!loading && results.map(group => (
            <div key={group.chatId} className="global-search-group">
              <div className="global-search-group-header" onClick={() => handleResultClick(group.chatId)} style={{ cursor: 'pointer' }}>
                <AvatarView url={group.avatarURL} size={24} fallbackName={group.chatName} />
                <span className="global-search-group-name">{group.chatName}</span>
                <span className="global-search-group-count">{group.messages.length} match{group.messages.length !== 1 ? 'es' : ''}</span>
              </div>
              {group.messages.slice(0, 5).map(msg => (
                <div key={msg.localId} className="global-search-msg" onClick={() => handleResultClick(group.chatId)}>
                  <div className="global-search-msg-top">
                    <span className="global-search-msg-sender">{msg.isFromSelf ? 'Me' : msg.senderName}</span>
                    <span className="global-search-msg-time">{formatMessageTime(msg.timestamp)}</span>
                  </div>
                  <div className="global-search-msg-content">
                    {highlightMatch(msg.content.substring(0, 200), query)}
                  </div>
                </div>
              ))}
              {group.messages.length > 5 && (
                <div className="global-search-msg" onClick={() => handleResultClick(group.chatId)} style={{ opacity: 0.6, fontSize: 11 }}>
                  +{group.messages.length - 5} more matches...
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
