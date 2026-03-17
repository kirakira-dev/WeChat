export enum WXMsgType {
  Text = 1,
  Image = 3,
  Voice = 34,
  VerifyMsg = 37,
  PossibleFriend = 40,
  ShareCard = 42,
  Video = 43,
  Emoticon = 47,
  Location = 48,
  Link = 49,
  VoipMsg = 50,
  StatusNotify = 51,
  VoipNotify = 52,
  VoipInvite = 53,
  SmallVideo = 62,
  File = 6,
  SysNotice = 9999,
  System = 10000,
  Recalled = 10002,
  Unknown = -1,
}

export interface WXMessage {
  id: string
  fromUser: string
  toUser: string
  content: string
  msgType: WXMsgType
  timestamp: number
  statusNotifyCode: number
  statusNotifyUserName: string
  localID: string
  isFromSelf: boolean
  /** If set, this message was recalled/deleted at this unix timestamp */
  recalledAt?: number
  /** Original message type before recall (so we can show "[Image] was deleted" etc.) */
  originalMsgType?: WXMsgType
}

export function displayContent(msg: WXMessage): string {
  switch (msg.msgType) {
    case WXMsgType.Text: {
      let text = msg.content.replace(/<br\/>/g, '\n')
      const quoteIdx = text.indexOf(':\n')
      if (quoteIdx > 0 && quoteIdx < 60) {
        text = text.substring(quoteIdx + 2)
      }
      return text
    }
    case WXMsgType.Image: return '[Image]'
    case WXMsgType.Voice: return '[Voice Message]'
    case WXMsgType.Video:
    case WXMsgType.SmallVideo: return '[Video]'
    case WXMsgType.Emoticon: return '[Sticker]'
    case WXMsgType.Location: return '[Location]'
    case WXMsgType.Link: return '[Link]'
    case WXMsgType.File: return '[File]'
    case WXMsgType.ShareCard: return '[Contact Card]'
    case WXMsgType.System: return '[System Message]'
    case WXMsgType.Recalled: return '[Message Recalled]'
    default: return msg.content || '[Unknown]'
  }
}

export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const pad = (n: number) => n.toString().padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (msgDay.getTime() === today.getTime()) return time
  if (msgDay.getTime() === yesterday.getTime()) return `Yesterday ${time}`
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${time}`
}

export function messageFromWebDict(dict: Record<string, any>, selfUserName: string): WXMessage {
  const fromUser = dict.FromUserName ?? ''
  return {
    id: String(dict.MsgId ?? ''),
    fromUser,
    toUser: dict.ToUserName ?? '',
    content: dict.Content ?? '',
    msgType: dict.MsgType ?? WXMsgType.Unknown,
    timestamp: dict.CreateTime ?? 0,
    statusNotifyCode: dict.StatusNotifyCode ?? 0,
    statusNotifyUserName: dict.StatusNotifyUserName ?? '',
    localID: String(dict.MsgId ?? ''),
    isFromSelf: fromUser === selfUserName,
  }
}
