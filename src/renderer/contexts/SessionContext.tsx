import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { SessionState } from '../../shared/types/api'
import type { GlobalSearchResult } from '../../shared/types/search'
import type { CallRecord } from '../../shared/types/call'

const defaultState: SessionState = {
  isLoggedIn: false, contacts: [], chatSessions: [], selectedChatId: null,
  currentTab: 'chats', dataSource: 'none', dbKeyStatus: { kind: 'checking' },
  statusMessage: '', wxid: '', loginState: { kind: 'idle' }, qrCodeData: null,
  moments: [], hiddenSessions: [],
}

interface SessionContextType {
  state: SessionState
  setState: (s: SessionState) => void
  initialize: () => Promise<void>
  selectChat: (id: string) => Promise<void>
  openChat: (id: string) => Promise<void>
  setTab: (tab: string) => Promise<void>
  sendText: (text: string) => Promise<void>
  logout: () => Promise<void>
  extractKeys: () => Promise<void>
  refreshMoments: () => Promise<void>
  addMomentPost: (content: string) => Promise<void>
  toggleMomentLike: (postId: string) => Promise<void>
  addMomentComment: (postId: string, content: string) => Promise<void>
  globalSearch: (query: string) => Promise<GlobalSearchResult[]>
  loadHiddenSessions: () => Promise<void>
  loadMoreMessages: (sessionId: string, beforeTimestamp: number) => Promise<void>
  loadAllMessages: (sessionId: string) => Promise<void>
  getCallHistory: () => Promise<CallRecord[]>
  exportChat: (sessionId: string, format: string, filePath: string) => Promise<{ success: boolean; error?: string }>
  starMessage: (chatId: string, msg: any) => Promise<void>
  unstarMessage: (chatId: string, localId: string) => Promise<void>
  getStarredMessages: () => Promise<any[]>
}

const SessionContext = createContext<SessionContextType>(null!)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>(defaultState)

  useEffect(() => {
    const unsub = window.electronAPI.onSessionStateUpdate((newState) => {
      setState(newState)
    })
    return unsub
  }, [])

  const initialize = useCallback(async () => {
    const s = await window.electronAPI.dbInitialize()
    setState(s)
    // Try restoring a saved web session to avoid QR re-scan
    try {
      const result = await window.electronAPI.apiRestoreSession()
      if (result.restored) {
        console.log('[Session] Web session restored from disk')
        setState(result.state)
      }
    } catch (err) {
      console.warn('[Session] Restore failed:', err)
    }
  }, [])

  const selectChat = useCallback(async (id: string) => {
    const s = await window.electronAPI.selectChat(id)
    setState(s)
  }, [])

  const openChat = useCallback(async (id: string) => {
    const s = await window.electronAPI.openChat(id)
    setState(s)
  }, [])

  const setTab = useCallback(async (tab: string) => {
    const s = await window.electronAPI.setTab(tab)
    setState(s)
  }, [])

  const sendText = useCallback(async (text: string) => {
    if (!state.selectedChatId) return
    const s = await window.electronAPI.apiSendText(state.selectedChatId, text)
    setState(s)
  }, [state.selectedChatId])

  const logout = useCallback(async () => {
    const s = await window.electronAPI.apiLogout()
    setState(s)
  }, [])

  const extractKeys = useCallback(async () => {
    const s = await window.electronAPI.dbExtractKeys()
    setState(s)
  }, [])

  const refreshMoments = useCallback(async () => {
    const s = await window.electronAPI.momentsRefresh()
    setState(s)
  }, [])

  const addMomentPost = useCallback(async (content: string) => {
    const s = await window.electronAPI.momentsAddPost(content)
    setState(s)
  }, [])

  const toggleMomentLike = useCallback(async (postId: string) => {
    const s = await window.electronAPI.momentsToggleLike(postId)
    setState(s)
  }, [])

  const addMomentComment = useCallback(async (postId: string, content: string) => {
    const s = await window.electronAPI.momentsAddComment(postId, content)
    setState(s)
  }, [])

  const globalSearch = useCallback(async (query: string) => {
    return window.electronAPI.dbGlobalSearch(query)
  }, [])

  const loadHiddenSessions = useCallback(async () => {
    const s = await window.electronAPI.dbLoadHiddenSessions()
    setState(s)
  }, [])

  const loadMoreMessages = useCallback(async (sessionId: string, beforeTimestamp: number) => {
    const s = await window.electronAPI.dbLoadMoreMessages(sessionId, beforeTimestamp)
    setState(s)
  }, [])

  const loadAllMessages = useCallback(async (sessionId: string) => {
    const s = await window.electronAPI.dbLoadAllMessages(sessionId)
    setState(s)
  }, [])

  const getCallHistory = useCallback(async () => {
    return window.electronAPI.dbGetCallHistory()
  }, [])

  const exportChat = useCallback(async (sessionId: string, format: string, filePath: string) => {
    return window.electronAPI.dbExportChat(sessionId, format, filePath)
  }, [])

  const starMessage = useCallback(async (chatId: string, msg: any) => {
    await window.electronAPI.favoritesStar(chatId, msg)
  }, [])

  const unstarMessage = useCallback(async (chatId: string, localId: string) => {
    await window.electronAPI.favoritesUnstar(chatId, localId)
  }, [])

  const getStarredMessages = useCallback(async () => {
    return window.electronAPI.favoritesGet()
  }, [])

  return (
    <SessionContext.Provider value={{
      state, setState, initialize, selectChat, openChat, setTab, sendText, logout, extractKeys,
      refreshMoments, addMomentPost, toggleMomentLike, addMomentComment,
      globalSearch, loadHiddenSessions, loadMoreMessages, loadAllMessages,
      getCallHistory, exportChat, starMessage, unstarMessage, getStarredMessages,
    }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}
