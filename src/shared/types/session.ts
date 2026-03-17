import { WXContact, createEmptyContact } from './contact'
import { WXMessage } from './message'

export interface ChatSession {
  id: string
  contact: WXContact
  messages: WXMessage[]
  unreadCount: number
  draft: string
  isPinned: boolean
  sortTimestamp: number
  isMuted?: boolean
}

export function createSession(id: string, contact?: WXContact): ChatSession {
  return {
    id,
    contact: contact ?? createEmptyContact(id),
    messages: [],
    unreadCount: 0,
    draft: '',
    isPinned: false,
    sortTimestamp: 0,
  }
}

export function lastMessagePreview(session: ChatSession): string {
  const msg = session.messages[session.messages.length - 1]
  if (!msg) return ''
  if (msg.msgType === 1) {
    let text = msg.content.replace(/<br\/>/g, ' ')
    if (text.length > 50) text = text.substring(0, 50) + '...'
    return text
  }
  return '[' + (msg.msgType === 3 ? 'Image' : msg.msgType === 34 ? 'Voice' : msg.msgType === 43 ? 'Video' : msg.msgType === 47 ? 'Sticker' : msg.msgType === 49 ? 'Link' : 'Message') + ']'
}
