import React, { useState } from 'react'
import { useSession } from '../../contexts/SessionContext'
import AvatarView from '../common/AvatarView'
import { ChatIcon, ContactsIcon, MomentsIcon, PhoneIcon, BookmarkIcon, GlobalSearchIcon, FolderIcon, SettingsIcon } from '../common/Icons'

const TABS = [
  { id: 'chats' as const, Icon: ChatIcon, label: 'Chats' },
  { id: 'contacts' as const, Icon: ContactsIcon, label: 'Contacts' },
  { id: 'moments' as const, Icon: MomentsIcon, label: 'Moments' },
  { id: 'calls' as const, Icon: PhoneIcon, label: 'Calls' },
  { id: 'bookmarks' as const, Icon: BookmarkIcon, label: 'Bookmarks' },
]

interface SidebarProps {
  onOpenSettings: () => void
  onOpenGlobalSearch?: () => void
}

export default function IconSidebar({ onOpenSettings, onOpenGlobalSearch }: SidebarProps) {
  const { state, setTab } = useSession()
  const totalUnread = state.chatSessions.reduce((sum, s) => sum + s.unreadCount, 0)

  const selfContact = state.contacts.find(c => c.id === state.wxid)

  return (
    <div className="icon-sidebar">
      <div className="sidebar-top">
        <div className="traffic-light-space" />
        <div className="sidebar-avatar">
          <AvatarView
            url={selfContact?.avatarURL ?? ''}
            size={34}
            fallbackName={selfContact?.nickname ?? state.wxid ?? 'U'}
          />
        </div>
        <div className="sidebar-tabs">
          {TABS.map(tab => (
            <SidebarButton
              key={tab.id}
              active={state.currentTab === tab.id}
              badge={tab.id === 'chats' ? totalUnread : 0}
              onClick={() => setTab(tab.id)}
            >
              <tab.Icon size={18} />
            </SidebarButton>
          ))}
        </div>
      </div>
      <div className="sidebar-bottom">
        {onOpenGlobalSearch && (
          <SidebarButton onClick={onOpenGlobalSearch}>
            <GlobalSearchIcon size={18} />
          </SidebarButton>
        )}
        <SidebarButton onClick={() => { window.electronAPI.systemGetDBPath().then(p => { if (p) window.electronAPI.systemOpenPath(p) }) }}>
          <FolderIcon size={18} />
        </SidebarButton>
        <SidebarButton onClick={onOpenSettings}>
          <SettingsIcon size={18} />
        </SidebarButton>
      </div>
    </div>
  )
}

function SidebarButton({ children, active, badge, onClick }: {
  children: React.ReactNode; active?: boolean; badge?: number; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      className={`sidebar-btn ${active ? 'active' : ''} ${hovered ? 'hovered' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="sidebar-btn-icon">{children}</span>
      {badge != null && badge > 0 && (
        <span className="badge">{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  )
}
