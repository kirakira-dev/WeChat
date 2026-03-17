export type LoginState =
  | { kind: 'idle' }
  | { kind: 'waitingScan' }
  | { kind: 'scanned' }
  | { kind: 'loggedIn' }
  | { kind: 'failed'; message: string }

export type DataSource = 'none' | 'localDB' | 'webProtocol'

export type DBKeyStatus =
  | { kind: 'checking' }
  | { kind: 'noKey' }
  | { kind: 'extracting' }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string }

export interface SessionState {
  isLoggedIn: boolean
  contacts: import('./contact').WXContact[]
  chatSessions: import('./session').ChatSession[]
  selectedChatId: string | null
  currentTab: 'chats' | 'contacts' | 'moments' | 'calls' | 'bookmarks'
  dataSource: DataSource
  dbKeyStatus: DBKeyStatus
  statusMessage: string
  wxid: string
  loginState: LoginState
  qrCodeData: string | null
  moments: import('./moment').MomentPost[]
  hiddenSessions: import('./session').ChatSession[]
}
