import React, { useState, useEffect } from 'react'
import { useSession } from '../../contexts/SessionContext'
import type { CallRecord } from '../../../shared/types/call'
import AvatarView from '../common/AvatarView'
import { PhoneIcon, PhoneIncomingIcon, PhoneOutgoingIcon, PhoneMissedIcon } from '../common/Icons'
import { formatMessageTime } from '../../../shared/types/message'
import './calls.css'

export default function CallHistoryView() {
  const { getCallHistory, selectChat } = useSession()
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getCallHistory().then(records => {
      setCalls(records)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [getCallHistory])

  const handleClick = (chatId: string) => {
    selectChat(chatId)
  }

  // Group calls by date
  const grouped: { date: string; calls: CallRecord[] }[] = []
  let currentDate = ''
  for (const call of calls) {
    const d = new Date(call.timestamp * 1000).toLocaleDateString()
    if (d !== currentDate) {
      currentDate = d
      grouped.push({ date: d, calls: [] })
    }
    grouped[grouped.length - 1].calls.push(call)
  }

  const formatDuration = (d: number | null) => {
    if (d == null || d <= 0) return null
    const m = Math.floor(d / 60)
    const s = d % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  return (
    <div className="call-history">
      <div className="call-history-header">Call History</div>
      <div className="call-history-list">
        {!loaded && <div className="call-history-empty">Loading...</div>}
        {loaded && calls.length === 0 && (
          <div className="call-history-empty">
            <PhoneIcon size={32} color="var(--color-secondary-text)" />
            <span>No call history found</span>
            <span style={{ fontSize: 11 }}>VoIP call records from your message database will appear here</span>
          </div>
        )}
        {grouped.map(group => (
          <React.Fragment key={group.date}>
            <div className="call-date-divider">{group.date}</div>
            {group.calls.map((call, i) => {
              const missed = call.duration === 0 || call.duration === null
              const dirClass = missed ? 'missed' : call.isOutgoing ? 'outgoing' : 'incoming'
              const DirIcon = missed ? PhoneMissedIcon : call.isOutgoing ? PhoneOutgoingIcon : PhoneIncomingIcon
              const dur = formatDuration(call.duration)
              return (
                <div key={`${call.chatId}-${call.localId}-${i}`} className="call-row" onClick={() => handleClick(call.chatId)}>
                  <AvatarView url={call.avatarURL} size={36} fallbackName={call.contactName} />
                  <div className="call-row-info">
                    <span className="call-row-name">{call.contactName}</span>
                    <div className="call-row-meta">
                      <span className={`call-row-direction ${dirClass}`}>
                        <DirIcon size={12} />
                        {missed ? 'Missed' : call.isOutgoing ? 'Outgoing' : 'Incoming'}
                      </span>
                      {dur && <span className="call-row-duration">{dur}</span>}
                    </div>
                  </div>
                  <span className="call-row-time">{formatMessageTime(call.timestamp)}</span>
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
