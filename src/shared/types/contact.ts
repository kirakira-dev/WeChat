export interface GroupMember {
  userName: string
  nickName: string
  displayName: string
}

export interface WXContact {
  id: string
  nickname: string
  remarkName: string
  avatarURL: string
  sex: number
  signature: string
  province: string
  city: string
  contactFlag: number
  snsFlag: number
  isGroup: boolean
  memberCount: number
  memberList: GroupMember[]
  pinyin: string
  wechatId?: string
  isDeleted?: boolean
  verifyInfo?: string
}

export function contactDisplayName(c: WXContact): string {
  return c.remarkName || c.nickname || c.id
}

export function isSpecialContact(id: string): boolean {
  const special = new Set([
    'newsapp', 'fmessage', 'filehelper', 'weibo', 'qqmail',
    'tmessage', 'qmessage', 'qqsync', 'floatbottle',
    'lbsapp', 'shakeapp', 'medianote', 'qqfriend',
    'readerapp', 'blogapp', 'facebookapp', 'masssendapp',
    'meaborobot', 'feedsapp', 'voip', 'blogappweixin',
    'weixin', 'brandsessionholder', 'weixinreminder',
    'officialaccounts', 'notification_messages', 'wxitil',
    'userexperience_alarm',
  ])
  return special.has(id) || id.startsWith('gh_')
}

export function createEmptyContact(id: string): WXContact {
  return {
    id,
    nickname: id,
    remarkName: '',
    avatarURL: '',
    sex: 0,
    signature: '',
    province: '',
    city: '',
    contactFlag: 0,
    snsFlag: 0,
    isGroup: id.includes('@chatroom'),
    memberCount: 0,
    memberList: [],
    pinyin: '',
  }
}

export function contactFromWebDict(dict: Record<string, any>): WXContact {
  const userName = dict.UserName ?? ''
  const members = (dict.MemberList ?? []).map((m: any) => ({
    userName: m.UserName ?? '',
    nickName: m.NickName ?? '',
    displayName: m.DisplayName ?? '',
  }))
  return {
    id: userName,
    nickname: dict.NickName ?? '',
    remarkName: dict.RemarkName ?? '',
    avatarURL: dict.HeadImgUrl ?? '',
    sex: dict.Sex ?? 0,
    signature: dict.Signature ?? '',
    province: dict.Province ?? '',
    city: dict.City ?? '',
    contactFlag: dict.ContactFlag ?? 0,
    snsFlag: dict.SnsFlag ?? 0,
    isGroup: userName.includes('@@'),
    memberCount: dict.MemberCount ?? 0,
    memberList: members,
    pinyin: dict.PYInitial ?? '',
  }
}
