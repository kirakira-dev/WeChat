import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { useSettings } from '../../contexts/SettingsContext'
import { WXContact, contactDisplayName } from '../../../shared/types/contact'
import { WXMessage, WXMsgType, formatMessageTime, displayContent } from '../../../shared/types/message'
import { ChatSession } from '../../../shared/types/session'
import AvatarView from '../common/AvatarView'
import AnalyticsDashboard from '../analytics/AnalyticsDashboard'
import { SmileIcon, AttachIcon, ScissorsIcon, CopyIcon, ReplyIcon, ExportIcon, InfoIcon, CloseIcon, SearchIcon, ImageIcon, VideoIcon, BarChartIcon, BookmarkIcon, BookmarkOutlineIcon, ShieldIcon, AsciiIcon } from '../common/Icons'
import './chat-view.css'

const URL_REGEX = /https?:\/\/[^\s<]+/g

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(1)} GB`
}

function fileTypeIcon(ext: string): string {
  const e = ext.toLowerCase()
  if (['pdf'].includes(e)) return '📕'
  if (['doc', 'docx'].includes(e)) return '📘'
  if (['xls', 'xlsx'].includes(e)) return '📗'
  if (['ppt', 'pptx'].includes(e)) return '📙'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return '📦'
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(e)) return '🎵'
  if (['mp4', 'avi', 'mkv', 'mov', 'wmv'].includes(e)) return '🎬'
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(e)) return '🖼'
  if (['txt', 'md', 'log', 'csv'].includes(e)) return '📄'
  if (['js', 'ts', 'py', 'c', 'cpp', 'java', 'rs', 'go', 'html', 'css'].includes(e)) return '💻'
  return '📎'
}

/** Extract <type>N</type> from app message XML to distinguish subtypes */
function extractAppMsgType(content: string): number {
  const m = content.match(/<type>(\d+)<\/type>/)
  return m ? parseInt(m[1], 10) : 0
}

interface Props {
  session: ChatSession
}

export default function ChatView({ session }: Props) {
  const { state, sendText, loadMoreMessages, loadAllMessages, exportChat, starMessage } = useSession()
  const { settings } = useSettings()
  const [inputText, setInputText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [quoteMsg, setQuoteMsg] = useState<WXMessage | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [msgSearch, setMsgSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: WXMessage } | null>(null)
  const [connectingWeb, setConnectingWeb] = useState(false)
  const isNearBottomRef = useRef(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const msgSearchRef = useRef<HTMLInputElement>(null)

  const name = contactDisplayName(session.contact)

  const contactMap = new Map<string, WXContact>()
  for (const c of state.contacts) contactMap.set(c.id, c)
  const selfContact = contactMap.get(state.wxid)

  // Filter messages by search
  const filteredMessages = msgSearch
    ? session.messages.filter(m => m.content.toLowerCase().includes(msgSearch.toLowerCase()))
    : session.messages

  // Auto-scroll to bottom only when user is already near the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: settings.reduceMotion ? 'auto' : 'smooth' })
    }
  }, [session.messages.length])

  // Always scroll to bottom on chat switch
  useEffect(() => {
    isNearBottomRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [session.id])

  useEffect(() => {
    if (searchOpen && msgSearchRef.current) msgSearchRef.current.focus()
  }, [searchOpen])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return
    let finalText = text
    if (quoteMsg) {
      const quoteSender = quoteMsg.isFromSelf ? 'Me' : quoteMsg.fromUser
      const quotePreview = displayContent(quoteMsg).substring(0, 80)
      finalText = `「${quoteSender}: ${quotePreview}」\n- - - - -\n${text}`
      setQuoteMsg(null)
    }
    setInputText('')
    await sendText(finalText)
  }, [inputText, sendText, quoteMsg])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setQuoteMsg(null)
      setShowEmoji(false)
      setSearchOpen(false)
      setMsgSearch('')
      return
    }
    if (settings.sendWithReturn) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    } else {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    }
  }

  const handleFileAttach = async () => {
    const file = await window.electronAPI.systemOpenFileDialog()
    if (!file || !state.selectedChatId) return
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (imageExts.includes(ext)) {
      await window.electronAPI.apiSendImage(state.selectedChatId, file.data, file.name)
    } else {
      await window.electronAPI.apiSendFile(state.selectedChatId, file.data, file.name)
    }
  }

  const handleScreenshot = async () => {
    const base64 = await window.electronAPI.systemCaptureScreenshot()
    if (base64 && state.selectedChatId) {
      await window.electronAPI.apiSendImage(state.selectedChatId, base64, 'screenshot.png')
    }
  }

  // QOL: Drag and drop file
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!state.selectedChatId) return
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        if (!base64) return
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        if (imageExts.includes(ext)) {
          await window.electronAPI.apiSendImage(state.selectedChatId!, base64, file.name)
        } else {
          await window.electronAPI.apiSendFile(state.selectedChatId!, base64, file.name)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  // Context menu on messages
  const handleMessageContextMenu = useCallback((e: React.MouseEvent, msg: WXMessage) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, msg })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // QOL: Copy message text
  const handleCopyMessage = (msg: WXMessage) => {
    const text = displayContent(msg)
    window.electronAPI.systemClipboardWrite(text)
    setCopiedId(msg.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  // QOL: Quote reply
  const handleQuoteReply = (msg: WXMessage) => {
    setQuoteMsg(msg)
    textareaRef.current?.focus()
  }

  // QOL: Export chat — now exports to file via save dialog
  const handleExportChat = async () => {
    const filePath = await window.electronAPI.systemSaveDialog({
      defaultPath: `${name.replace(/[/\\?%*:|"<>]/g, '_')}_export.json`,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: 'HTML', extensions: ['html'] },
      ],
    })
    if (!filePath) return
    const ext = filePath.split('.').pop()?.toLowerCase() || 'json'
    const format = ext === 'csv' ? 'csv' : ext === 'html' ? 'html' : 'json'
    const result = await exportChat(session.id, format, filePath)
    if (result.success) {
      window.electronAPI.systemOpenPath(filePath)
    }
  }

  // Load more messages on scroll to top + track scroll position
  const handleScroll = useCallback(async () => {
    const container = messagesContainerRef.current
    if (!container) return

    // Track whether user is near bottom (within 150px)
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    isNearBottomRef.current = distFromBottom < 150

    if (loadingMore) return
    if (container.scrollTop < 50 && session.messages.length > 0) {
      const firstMsg = session.messages[0]
      if (!firstMsg) return
      setLoadingMore(true)
      const prevHeight = container.scrollHeight
      await loadMoreMessages(session.id, firstMsg.timestamp)
      // Preserve scroll position after prepending
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevHeight
        }
      })
      setLoadingMore(false)
    }
  }, [session.id, session.messages, loadingMore, loadMoreMessages])

  const handleLoadAll = async () => {
    setLoadingMore(true)
    await loadAllMessages(session.id)
    setLoadingMore(false)
  }

  // Star message
  const handleStarMessage = (msg: WXMessage) => {
    const chatName = contactDisplayName(session.contact)
    starMessage(session.id, {
      localId: msg.id,
      content: displayContent(msg).substring(0, 200),
      timestamp: msg.timestamp,
      fromUser: msg.isFromSelf ? 'Me' : msg.fromUser,
      chatName,
    })
  }

  // Web protocol connect for sending
  const handleWebConnect = async () => {
    if (connectingWeb) return
    setConnectingWeb(true)
    try {
      await window.electronAPI.apiGetUUID()
      await window.electronAPI.apiGetQRCode()
      // Poll for login
      let done = false
      while (!done) {
        try {
          const result = await window.electronAPI.apiPollLogin()
          if (result.success && result.redirectURL) {
            await window.electronAPI.apiCompleteLogin(result.redirectURL)
            done = true
          }
        } catch {}
        if (!done) await new Promise(r => setTimeout(r, 1000))
      }
    } catch (err) {
      console.error('Web connect failed:', err)
    }
    setConnectingWeb(false)
  }

  // ASCII Art: pick image → convert to ASCII → send as text
  const handleAsciiImage = async () => {
    const file = await window.electronAPI.systemOpenFileDialog()
    if (!file) return
    const img = new Image()
    img.onload = () => {
      const ASCII_WIDTH = 100
      const aspect = img.height / img.width
      const asciiHeight = Math.round(ASCII_WIDTH * aspect * 0.55)
      const canvas = document.createElement('canvas')
      canvas.width = ASCII_WIDTH
      canvas.height = asciiHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, ASCII_WIDTH, asciiHeight)
      const imageData = ctx.getImageData(0, 0, ASCII_WIDTH, asciiHeight)
      const ramp = ' .\'`^",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'
      const lines: string[] = []
      for (let y = 0; y < asciiHeight; y++) {
        let line = ''
        for (let x = 0; x < ASCII_WIDTH; x++) {
          const idx = (y * ASCII_WIDTH + x) * 4
          const r = imageData.data[idx]
          const g = imageData.data[idx + 1]
          const b = imageData.data[idx + 2]
          const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255
          const charIdx = Math.floor(brightness * (ramp.length - 1))
          line += ramp[charIdx]
        }
        lines.push(line)
      }
      const ascii = lines.join('\n')
      sendText(ascii)
    }
    img.src = `data:image/png;base64,${file.data}`
  }

  // Input char/word count
  const charCount = inputText.length
  const wordCount = inputText.trim() ? inputText.trim().split(/\s+/).length : 0

  const EMOJIS = ['😀','😂','🥰','😎','🤔','👍','❤️','🔥','🎉','😢','😡','🙏','💪','🤝','👋','✨','🌟','💯','🎵','🌈',
    '☀️','🌙','🍕','🍜','☕','🎮','📱','💻','🏠','✈️','🚗','🎁','📷','🎤','⚽','🏀','🎯','🎨','📚','🔑']

  return (
    <div
      className={`chat-view ${dragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <AttachIcon size={48} color="var(--color-wechat-green)" />
            <p>Drop files to send</p>
          </div>
        </div>
      )}

      <div className="chat-header">
        <div className="chat-header-left" onClick={() => setShowInfo(!showInfo)} style={{ cursor: 'pointer' }}>
          <AvatarView url={session.contact.avatarURL} size={28} fallbackName={name} />
          <span className="chat-header-name">{name}</span>
          {session.contact.isGroup && session.contact.memberCount > 0 && (
            <span className="chat-header-count">({session.contact.memberCount})</span>
          )}
        </div>
        <div className="chat-header-actions">
          <button className="chat-header-btn" onClick={() => { setSearchOpen(!searchOpen); setMsgSearch('') }} title="Search messages">
            <SearchIcon size={16} color="var(--color-secondary-text)" />
          </button>
          <button className="chat-header-btn" onClick={() => setShowAnalytics(!showAnalytics)} title="Chat analytics">
            <BarChartIcon size={16} color="var(--color-secondary-text)" />
          </button>
          <button className="chat-header-btn" onClick={handleExportChat} title="Export chat to file">
            <ExportIcon size={16} color="var(--color-secondary-text)" />
          </button>
          <button className="chat-header-btn" onClick={() => setShowInfo(!showInfo)} title="Contact info">
            <InfoIcon size={16} color="var(--color-secondary-text)" />
          </button>
        </div>
      </div>

      {/* QOL: Message search bar */}
      {searchOpen && (
        <div className="msg-search-bar">
          <SearchIcon size={12} color="var(--color-secondary-text)" />
          <input
            ref={msgSearchRef}
            type="text"
            placeholder="Search in this chat..."
            value={msgSearch}
            onChange={e => setMsgSearch(e.target.value)}
            className="msg-search-input"
          />
          {msgSearch && <span className="msg-search-count">{filteredMessages.length} found</span>}
          <button className="msg-search-close" onClick={() => { setSearchOpen(false); setMsgSearch('') }}>
            <CloseIcon size={12} color="var(--color-secondary-text)" />
          </button>
        </div>
      )}

      <div className="divider-h" />

      <div className="messages-container" ref={messagesContainerRef} onScroll={handleScroll} onClick={closeContextMenu}>
        {loadingMore && <div className="load-more-indicator">Loading older messages...</div>}
        {!loadingMore && session.messages.length >= 200 && (
          <div className="load-more-bar">
            <button className="load-more-btn" onClick={handleLoadAll}>Load All History</button>
          </div>
        )}
        {filteredMessages.map((msg, i) => (
          <MessageRow
            key={msg.id || i}
            message={msg}
            session={session}
            wxid={state.wxid}
            selfContact={selfContact}
            contactMap={contactMap}
            showAvatar={settings.showAvatarsInChat}
            showTimestamps={settings.showTimestamps}
            fontSize={settings.fontSize}
            copied={copiedId === msg.id}
            onCopy={() => handleCopyMessage(msg)}
            onReply={() => handleQuoteReply(msg)}
            onStar={() => handleStarMessage(msg)}
            onContextMenu={(e: React.MouseEvent) => handleMessageContextMenu(e, msg)}
          />
        ))}
        <div ref={messagesEndRef} />

        {/* Right-click context menu */}
        {contextMenu && (
          <div
            className="msg-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <button className="msg-context-menu-item" onClick={() => { handleCopyMessage(contextMenu.msg); closeContextMenu() }}>
              <CopyIcon size={14} /> Copy Text
            </button>
            <button className="msg-context-menu-item" onClick={() => {
              const content = contextMenu.msg.content
              const withLinks = content.replace(URL_REGEX, (url: string) => `[${url}](${url})`)
              window.electronAPI.systemClipboardWrite(withLinks)
              closeContextMenu()
            }}>
              <CopyIcon size={14} /> Copy as Markdown
            </button>
            <div className="msg-context-menu-divider" />
            <button className="msg-context-menu-item" onClick={() => { handleQuoteReply(contextMenu.msg); closeContextMenu() }}>
              <ReplyIcon size={14} /> Quote Reply
            </button>
            <button className="msg-context-menu-item" onClick={() => { handleStarMessage(contextMenu.msg); closeContextMenu() }}>
              <BookmarkOutlineIcon size={14} /> Bookmark
            </button>
            <button className="msg-context-menu-item" onClick={() => {
              setMsgSearch(displayContent(contextMenu.msg).substring(0, 40))
              setSearchOpen(true)
              closeContextMenu()
            }}>
              <SearchIcon size={14} /> Search Similar
            </button>
            <div className="msg-context-menu-divider" />
            <button className="msg-context-menu-item" onClick={() => {
              window.electronAPI.systemClipboardWrite(contextMenu.msg.id)
              closeContextMenu()
            }}>
              Copy Message ID
            </button>
            <button className="msg-context-menu-item" onClick={() => {
              window.electronAPI.systemClipboardWrite(contextMenu.msg.fromUser)
              closeContextMenu()
            }}>
              Copy Sender ID
            </button>
            <button className="msg-context-menu-item" onClick={() => {
              const d = new Date(contextMenu.msg.timestamp * 1000)
              window.electronAPI.systemClipboardWrite(d.toISOString())
              closeContextMenu()
            }}>
              Copy Timestamp
            </button>
            <button className="msg-context-menu-item" onClick={() => {
              window.electronAPI.systemClipboardWrite(contextMenu.msg.content)
              closeContextMenu()
            }}>
              View Raw Content
            </button>
          </div>
        )}
      </div>

      <div className="divider-h" />

      {/* Web connect banner when reading from local DB without web session */}
      {state.dataSource === 'localDB' && state.loginState.kind !== 'loggedIn' && (
        <div className="web-connect-banner">
          {!connectingWeb && !state.qrCodeData && (
            <>
              <span className="web-connect-text">Reading from local DB — scan QR to enable sending</span>
              <button className="web-connect-btn" onClick={handleWebConnect}>Connect</button>
            </>
          )}
          {(connectingWeb || state.qrCodeData) && state.loginState.kind === 'idle' && state.qrCodeData && (
            <div className="web-connect-qr">
              <img src={`data:image/png;base64,${state.qrCodeData}`} alt="QR" className="web-connect-qr-img" />
              <span className="web-connect-text">Scan with WeChat to connect</span>
            </div>
          )}
          {state.loginState.kind === 'waitingScan' && state.qrCodeData && (
            <div className="web-connect-qr">
              <img src={`data:image/png;base64,${state.qrCodeData}`} alt="QR" className="web-connect-qr-img" />
              <span className="web-connect-text">Scan with WeChat to connect</span>
            </div>
          )}
          {state.loginState.kind === 'scanned' && (
            <div className="web-connect-qr">
              <span className="web-connect-text">Scanned — confirm on your phone</span>
            </div>
          )}
          {connectingWeb && !state.qrCodeData && (
            <span className="web-connect-text">Connecting...</span>
          )}
        </div>
      )}

      <div className="input-area">
        <div className="input-toolbar">
          <button className="input-tool-btn" onClick={() => setShowEmoji(!showEmoji)} title="Emoji">
            <SmileIcon size={18} color="var(--color-secondary-text)" />
          </button>
          <button className="input-tool-btn" onClick={handleFileAttach} title="Attach file (or drag & drop)">
            <AttachIcon size={18} color="var(--color-secondary-text)" />
          </button>
          <button className="input-tool-btn" onClick={handleScreenshot} title="Screenshot">
            <ScissorsIcon size={18} color="var(--color-secondary-text)" />
          </button>
          <button className="input-tool-btn" onClick={handleAsciiImage} title="Send image as ASCII art">
            <AsciiIcon size={18} color="var(--color-secondary-text)" />
          </button>
        </div>

        {showEmoji && (
          <div className="emoji-picker">
            {EMOJIS.map(e => (
              <button key={e} className="emoji-btn" onClick={() => { setInputText(prev => prev + e); setShowEmoji(false) }}>
                {e}
              </button>
            ))}
          </div>
        )}

        {/* QOL: Quote reply bar */}
        {quoteMsg && (
          <div className="quote-reply-bar">
            <div className="quote-reply-content">
              <ReplyIcon size={12} color="var(--color-secondary-text)" />
              <span className="quote-reply-sender">{quoteMsg.isFromSelf ? 'Me' : quoteMsg.fromUser}:</span>
              <span className="quote-reply-text">{displayContent(quoteMsg).substring(0, 60)}</span>
            </div>
            <button className="quote-reply-close" onClick={() => setQuoteMsg(null)}>
              <CloseIcon size={12} color="var(--color-secondary-text)" />
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="input-textarea"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          style={{ fontSize: settings.fontSize }}
        />

        <div className="input-footer">
          {/* QOL: Char/word count */}
          {inputText && (
            <span className="char-count">
              {charCount} chars · {wordCount} words
            </span>
          )}
          <div className="input-footer-right">
            {inputText && (
              <span className="send-hint">
                {settings.sendWithReturn ? '⏎ Send · ⇧⏎ New line' : '⇧⏎ Send · ⏎ New line'}
              </span>
            )}
            <button
              className={`send-btn ${!inputText.trim() ? 'disabled' : ''}`}
              onClick={handleSend}
              disabled={!inputText.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* QOL: Contact info sidebar */}
      {showInfo && (
        <ContactInfoPanel
          session={session}
          contactMap={contactMap}
          onClose={() => setShowInfo(false)}
        />
      )}

      {/* Analytics dashboard sidebar */}
      {showAnalytics && (
        <AnalyticsDashboard
          session={session}
          contactMap={contactMap}
          onClose={() => setShowAnalytics(false)}
        />
      )}
    </div>
  )
}

function MessageRow({ message, session, wxid, selfContact, contactMap, showAvatar, showTimestamps, fontSize, copied, onCopy, onReply, onStar, onContextMenu }: {
  message: WXMessage; session: ChatSession; wxid: string; selfContact?: WXContact;
  contactMap: Map<string, WXContact>; showAvatar: boolean; showTimestamps: boolean; fontSize: number;
  copied: boolean; onCopy: () => void; onReply: () => void; onStar: () => void; onContextMenu: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)

  if (message.msgType === WXMsgType.System || message.msgType === WXMsgType.StatusNotify) {
    return (
      <div className="system-message">
        <span>{message.content}</span>
      </div>
    )
  }

  const isSelf = message.isFromSelf

  const senderContact = isSelf
    ? selfContact
    : session.contact.isGroup
      ? contactMap.get(message.fromUser)
      : session.contact

  const senderName = session.contact.isGroup && !isSelf
    ? (senderContact ? contactDisplayName(senderContact) : message.fromUser)
    : undefined

  const renderContent = () => {
    switch (message.msgType) {
      case WXMsgType.Image:
      case WXMsgType.Emoticon: {
        const width = parseInt(extractXmlAttr(message.content, 'cdnthumbwidth') || extractXmlAttr(message.content, 'width') || '0', 10)
        const height = parseInt(extractXmlAttr(message.content, 'cdnthumbheight') || extractXmlAttr(message.content, 'height') || '0', 10)
        const imgSize = parseInt(extractXmlAttr(message.content, 'length') || '0', 10)
        const maxW = 180
        let displayW = maxW
        let displayH = maxW
        if (width > 0 && height > 0) {
          const scale = Math.min(maxW / width, maxW / height, 1)
          displayW = Math.round(width * scale)
          displayH = Math.round(height * scale)
        }
        return (
          <div className="msg-media-placeholder" style={{ width: displayW, height: displayH }}>
            <ImageIcon size={28} color="var(--color-secondary-text)" />
            <span className="msg-media-size">
              {width > 0 && height > 0 ? `${width}×${height}` : 'Image'}
              {imgSize > 0 ? ` · ${formatFileSize(imgSize)}` : ''}
            </span>
          </div>
        )
      }
      case WXMsgType.Voice: {
        const voiceLen = parseInt(extractXmlAttr(message.content, 'voicelength') || '0', 10)
        const seconds = voiceLen > 0 ? Math.round(voiceLen / 1000) : 0
        return (
          <div className="msg-voice">
            <span className="msg-voice-icon">🎤</span>
            <span className="msg-voice-bar" />
            {seconds > 0 && <span className="msg-voice-duration">{seconds}″</span>}
          </div>
        )
      }
      case WXMsgType.Video:
      case WXMsgType.SmallVideo: {
        const width = parseInt(extractXmlAttr(message.content, 'cdnthumbwidth') || '0', 10)
        const height = parseInt(extractXmlAttr(message.content, 'cdnthumbheight') || '0', 10)
        const duration = parseInt(extractXmlAttr(message.content, 'playlength') || '0', 10)
        const vidSize = parseInt(extractXmlAttr(message.content, 'length') || extractXmlAttr(message.content, 'rawlength') || '0', 10)
        const maxW = 180
        let displayW = maxW
        let displayH = Math.round(maxW * 0.75)
        if (width > 0 && height > 0) {
          const scale = Math.min(maxW / width, maxW / height, 1)
          displayW = Math.round(width * scale)
          displayH = Math.round(height * scale)
        }
        const handlePlayVideo = async () => {
          // Try to find and open local video file using md5/rawmd5 as hash
          const hash = extractXmlAttr(message.content, 'md5') || extractXmlAttr(message.content, 'rawmd5') || ''
          if (hash) {
            const localPath = await window.electronAPI.fileResolvePath('video', hash)
            if (localPath) { await window.electronAPI.fileOpenLocal(localPath); return }
          }
        }
        return (
          <div className="msg-media-placeholder video" style={{ width: displayW, height: displayH }}
               onClick={handlePlayVideo} title="Click to play">
            <div className="msg-video-play">▶</div>
            <span className="msg-media-size">
              {duration > 0 ? `${duration}s` : 'Video'}
              {vidSize > 0 ? ` · ${formatFileSize(vidSize)}` : ''}
            </span>
          </div>
        )
      }
      case WXMsgType.Link: {
        const appType = extractAppMsgType(message.content)
        // App message subtype 6 = file transfer
        if (appType === 6) {
          const fileName = extractXmlTag(message.content, 'title') || 'File'
          const fileSize = parseInt(extractXmlTag(message.content, 'totallen') || '0', 10)
          const fileExt = extractXmlTag(message.content, 'fileext') || fileName.split('.').pop() || ''
          const handleOpenFile = async () => {
            const localPath = await window.electronAPI.fileResolvePath('file', fileName)
            if (localPath) await window.electronAPI.fileOpenLocal(localPath)
          }
          const handleSaveFile = async () => {
            const localPath = await window.electronAPI.fileResolvePath('file', fileName)
            if (localPath) await window.electronAPI.fileSaveAttachment(localPath, fileName)
          }
          return (
            <div className="msg-file-card">
              <div className="msg-file-icon">{fileTypeIcon(fileExt)}</div>
              <div className="msg-file-info">
                <div className="msg-file-name" title={fileName}>{fileName}</div>
                <div className="msg-file-meta">{formatFileSize(fileSize)}{fileExt ? ` · ${fileExt.toUpperCase()}` : ''}</div>
              </div>
              <div className="msg-file-actions">
                <button className="msg-file-btn" onClick={handleOpenFile} title="Open">Open</button>
                <button className="msg-file-btn" onClick={handleSaveFile} title="Save As">Save</button>
              </div>
            </div>
          )
        }
        const title = extractXmlTag(message.content, 'title')
        const desc = extractXmlTag(message.content, 'des')
        const url = extractXmlTag(message.content, 'url')
        if (title) {
          return (
            <div className="msg-link-card">
              <div className="msg-link-title">{title}</div>
              {desc && <div className="msg-link-desc">{desc}</div>}
              {url && <a className="msg-link-url" href={url} target="_blank" rel="noopener noreferrer">Open Link</a>}
            </div>
          )
        }
        return <span className="msg-placeholder">[Link]</span>
      }
      case WXMsgType.File: {
        // Standalone file type (from web protocol)
        const fileName = extractXmlTag(message.content, 'title') || 'File'
        const fileSize = parseInt(extractXmlTag(message.content, 'totallen') || '0', 10)
        const fileExt = extractXmlTag(message.content, 'fileext') || fileName.split('.').pop() || ''
        const handleOpenFile = async () => {
          const localPath = await window.electronAPI.fileResolvePath('file', fileName)
          if (localPath) await window.electronAPI.fileOpenLocal(localPath)
        }
        const handleSaveFile = async () => {
          const localPath = await window.electronAPI.fileResolvePath('file', fileName)
          if (localPath) await window.electronAPI.fileSaveAttachment(localPath, fileName)
        }
        return (
          <div className="msg-file-card">
            <div className="msg-file-icon">{fileTypeIcon(fileExt)}</div>
            <div className="msg-file-info">
              <div className="msg-file-name" title={fileName}>{fileName}</div>
              <div className="msg-file-meta">{formatFileSize(fileSize)}{fileExt ? ` · ${fileExt.toUpperCase()}` : ''}</div>
            </div>
            <div className="msg-file-actions">
              <button className="msg-file-btn" onClick={handleOpenFile} title="Open">Open</button>
              <button className="msg-file-btn" onClick={handleSaveFile} title="Save As">Save</button>
            </div>
          </div>
        )
      }
      case WXMsgType.Location:
        return <span className="msg-placeholder">📍 Location</span>
      case WXMsgType.ShareCard:
        return <span className="msg-placeholder">👤 Contact Card</span>
      case WXMsgType.Recalled: {
        // Try to parse recall XML for any useful info
        const recallWho = message.content.match(/<replacemsg><!\[CDATA\[(.*?)\]\]><\/replacemsg>/)
        const displayText = recallWho ? recallWho[1] : 'Message was recalled'
        return (
          <div className="msg-recalled-forensic">
            <div className="msg-recalled-badge"><ShieldIcon size={12} /> Deleted</div>
            <span className="msg-recalled-note">{displayText}</span>
          </div>
        )
      }
      default:
        return <RichText text={message.content} fontSize={fontSize} />
    }
  }

  return (
    <div
      className={`message-row ${isSelf ? 'self' : 'other'}`}
      style={{ padding: `var(--message-padding) 16px` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onReply}
      onContextMenu={onContextMenu}
    >
      {!isSelf && showAvatar && (
        <AvatarView
          url={senderContact?.avatarURL ?? ''}
          size={36}
          fallbackName={senderName ?? contactDisplayName(session.contact)}
        />
      )}
      <div className={`message-bubble-wrap ${isSelf ? 'self' : 'other'}`}>
        {senderName && <span className="message-sender">{senderName}</span>}
        <div className={`message-bubble ${isSelf ? 'self' : 'other'} ${message.recalledAt ? 'recalled' : ''}`}>
          {renderContent()}
          {message.recalledAt && (
            <div className="msg-deleted-badge">
              <ShieldIcon size={10} />
              <span>Deleted {formatMessageTime(message.recalledAt)}</span>
            </div>
          )}
        </div>
        <div className="message-meta-row">
          {showTimestamps && (
            <span className={`message-time ${isSelf ? 'self' : 'other'}`}>
              {formatMessageTime(message.timestamp)}
            </span>
          )}
          {/* QOL: Message action buttons on hover */}
          {hovered && (
            <div className="message-actions">
              <button className="msg-action-btn" onClick={onCopy} title="Copy text">
                <CopyIcon size={12} />
              </button>
              <button className="msg-action-btn" onClick={onReply} title="Quote reply">
                <ReplyIcon size={12} />
              </button>
              <button className="msg-action-btn" onClick={onStar} title="Bookmark">
                <BookmarkOutlineIcon size={12} />
              </button>
            </div>
          )}
          {copied && <span className="copied-toast">Copied!</span>}
        </div>
      </div>
      {isSelf && showAvatar && (
        <AvatarView
          url={selfContact?.avatarURL ?? ''}
          size={36}
          fallbackName={selfContact ? contactDisplayName(selfContact) : (wxid || 'Me')}
        />
      )}
    </div>
  )
}

// QOL: Contact info panel
function ContactInfoPanel({ session, contactMap, onClose }: {
  session: ChatSession; contactMap: Map<string, WXContact>; onClose: () => void
}) {
  const c = session.contact
  const name = contactDisplayName(c)

  // Count messages by type
  const msgStats = {
    total: session.messages.length,
    text: session.messages.filter(m => m.msgType === WXMsgType.Text).length,
    image: session.messages.filter(m => m.msgType === WXMsgType.Image || m.msgType === WXMsgType.Emoticon).length,
    link: session.messages.filter(m => m.msgType === WXMsgType.Link).length,
  }

  // For group chats, count unique senders
  const uniqueSenders = c.isGroup
    ? new Set(session.messages.filter(m => !m.isFromSelf).map(m => m.fromUser)).size
    : 0

  // Find first and last message dates
  const firstMsg = session.messages[0]
  const lastMsg = session.messages[session.messages.length - 1]
  const firstDate = firstMsg ? new Date(firstMsg.timestamp * 1000).toLocaleDateString() : 'N/A'
  const lastDate = lastMsg ? new Date(lastMsg.timestamp * 1000).toLocaleDateString() : 'N/A'

  return (
    <div className="info-panel">
      <div className="info-panel-header">
        <span className="info-panel-title">Info</span>
        <button className="info-panel-close" onClick={onClose}>
          <CloseIcon size={16} color="var(--color-secondary-text)" />
        </button>
      </div>
      <div className="info-panel-body">
        <div className="info-avatar-section">
          <AvatarView url={c.avatarURL} size={64} fallbackName={name} />
          <h3 className="info-name">{name}</h3>
          {c.remarkName && c.remarkName !== c.nickname && (
            <p className="info-remark">Nickname: {c.nickname}</p>
          )}
          {c.signature && <p className="info-signature">{c.signature}</p>}
        </div>

        <div className="info-section">
          <h4>Details</h4>
          <div className="info-row"><span>ID</span><span className="info-value">{c.id}</span></div>
          {c.wechatId && <div className="info-row"><span>WeChat ID</span><span className="info-value">{c.wechatId}</span></div>}
          {c.isGroup && <div className="info-row"><span>Members</span><span className="info-value">{c.memberCount}</span></div>}
          {c.isGroup && <div className="info-row"><span>Active Senders</span><span className="info-value">{uniqueSenders}</span></div>}
          {!c.isGroup && c.sex > 0 && <div className="info-row"><span>Gender</span><span className="info-value">{c.sex === 1 ? 'Male' : 'Female'}</span></div>}
          {c.province && <div className="info-row"><span>Location</span><span className="info-value">{c.city ? `${c.city}, ${c.province}` : c.province}</span></div>}
          {c.isDeleted && <div className="info-row"><span>Status</span><span className="info-value" style={{ color: '#e74c3c' }}>Deleted Contact</span></div>}
          {c.verifyInfo && <div className="info-row"><span>Verify Info</span><span className="info-value">{c.verifyInfo}</span></div>}
          {session.isMuted && <div className="info-row"><span>Notifications</span><span className="info-value">Muted</span></div>}
        </div>

        <div className="info-section">
          <h4>Message Stats</h4>
          <div className="info-row"><span>Total</span><span className="info-value">{msgStats.total}</span></div>
          <div className="info-row"><span>Text</span><span className="info-value">{msgStats.text}</span></div>
          <div className="info-row"><span>Images</span><span className="info-value">{msgStats.image}</span></div>
          <div className="info-row"><span>Links</span><span className="info-value">{msgStats.link}</span></div>
          <div className="info-row"><span>First Message</span><span className="info-value">{firstDate}</span></div>
          <div className="info-row"><span>Last Message</span><span className="info-value">{lastDate}</span></div>
        </div>

        {c.isGroup && c.memberList.length > 0 && (
          <div className="info-section">
            <h4>Members ({c.memberList.length})</h4>
            <div className="info-members-list">
              {c.memberList.slice(0, 50).map(m => {
                const memberContact = contactMap.get(m.userName)
                return (
                  <div key={m.userName} className="info-member-row">
                    <AvatarView url={memberContact?.avatarURL ?? ''} size={24} fallbackName={m.displayName || m.nickName || m.userName} />
                    <span className="info-member-name">{m.displayName || m.nickName || m.userName}</span>
                  </div>
                )
              })}
              {c.memberList.length > 50 && <p className="info-more">+{c.memberList.length - 50} more</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RichText({ text, fontSize }: { text: string; fontSize: number }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const cleaned = text.replace(/<br\/>/g, '\n')

  let match: RegExpExecArray | null
  const regex = new RegExp(URL_REGEX)
  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      parts.push(cleaned.substring(lastIndex, match.index))
    }
    const url = match[0]
    parts.push(<a key={match.index} href={url} target="_blank" rel="noopener noreferrer">{url}</a>)
    lastIndex = match.index + url.length
  }
  if (lastIndex < cleaned.length) {
    parts.push(cleaned.substring(lastIndex))
  }

  return <span style={{ fontSize, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parts}</span>
}

function extractXmlAttr(xml: string, attr: string): string | null {
  const regex = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`)
  const match = regex.exec(xml)
  if (match) return match[1].replace(/&amp;/g, '&')
  return null
}

function extractXmlTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}><!\\[CDATA\\[([^\\]]*?)\\]\\]></${tag}>|<${tag}>([^<]*)</${tag}>`)
  const match = regex.exec(xml)
  if (match) return (match[1] ?? match[2] ?? '').replace(/&amp;/g, '&')
  return null
}
