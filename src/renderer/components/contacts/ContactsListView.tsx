import React, { useState, useMemo } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { contactDisplayName } from '../../../shared/types/contact'
import AvatarView from '../common/AvatarView'
import { ContactsIcon, StarIcon, GridIcon, ChatIcon } from '../common/Icons'
import './contacts.css'

interface Props {
  searchText: string
}

export default function ContactsListView({ searchText }: Props) {
  const { state, openChat } = useSession()

  const filtered = state.contacts.filter(c => {
    if (!searchText) return true
    return contactDisplayName(c).toLowerCase().includes(searchText.toLowerCase())
  })

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {}
    for (const c of filtered) {
      const first = (c.pinyin || contactDisplayName(c))[0]?.toUpperCase() || '#'
      const key = /[A-Z]/.test(first) ? first : '#'
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    }
    return Object.entries(groups).sort(([a], [b]) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b))
  }, [filtered])

  const specialRows = [
    { Icon: ContactsIcon, title: 'New Friends' },
    { Icon: ChatIcon, title: 'Group Chats' },
    { Icon: StarIcon, title: 'Tags' },
    { Icon: GridIcon, title: 'Official Accounts' },
  ]

  return (
    <div className="contacts-list">
      {specialRows.map(row => (
        <div key={row.title} className="contact-special-row">
          <div className="contact-special-icon"><row.Icon size={18} color="var(--color-wechat-green)" /></div>
          <span className="contact-special-title">{row.title}</span>
        </div>
      ))}
      <div className="contacts-divider" />

      {grouped.map(([letter, contacts]) => (
        <div key={letter}>
          <div className="contacts-section-header">{letter}</div>
          {contacts.map(c => (
            <ContactRow key={c.id} contact={c} onClick={() => openChat(c.id)} />
          ))}
        </div>
      ))}

      <div className="contacts-footer">{filtered.length} contacts</div>
    </div>
  )
}

function ContactRow({ contact, onClick }: { contact: any; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const name = contactDisplayName(contact)

  return (
    <div
      className={`contact-row ${hovered ? 'hovered' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <AvatarView url={contact.avatarURL} size={36} fallbackName={name} />
      <span className="contact-row-name">{name}</span>
    </div>
  )
}
