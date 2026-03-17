export interface CallRecord {
  chatId: string
  contactName: string
  avatarURL: string
  localId: number
  timestamp: number
  duration: number | null
  isOutgoing: boolean
}
