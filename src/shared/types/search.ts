export interface GlobalSearchResult {
  chatId: string
  chatName: string
  avatarURL: string
  messages: SearchResultMessage[]
}

export interface SearchResultMessage {
  localId: number
  content: string
  timestamp: number
  senderName: string
  isFromSelf: boolean
}
