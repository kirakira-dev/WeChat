import React, { useMemo } from 'react'
import { WXMessage, WXMsgType, displayContent } from '../../../shared/types/message'
import { ChatSession } from '../../../shared/types/session'
import { contactDisplayName, WXContact } from '../../../shared/types/contact'
import { CloseIcon, TrophyIcon } from '../common/Icons'
import AvatarView from '../common/AvatarView'
import './analytics.css'

interface Props {
  session: ChatSession
  contactMap: Map<string, WXContact>
  onClose: () => void
}

export default function AnalyticsDashboard({ session, contactMap, onClose }: Props) {
  const msgs = session.messages

  const stats = useMemo(() => {
    const sent = msgs.filter(m => m.isFromSelf).length
    const recv = msgs.length - sent
    const textMsgs = msgs.filter(m => m.msgType === WXMsgType.Text)
    const images = msgs.filter(m => m.msgType === WXMsgType.Image || m.msgType === WXMsgType.Emoticon).length
    const videos = msgs.filter(m => m.msgType === WXMsgType.Video || m.msgType === WXMsgType.SmallVideo).length
    const voices = msgs.filter(m => m.msgType === WXMsgType.Voice).length
    const links = msgs.filter(m => m.msgType === WXMsgType.Link).length
    const files = msgs.filter(m => m.msgType === WXMsgType.File).length

    // Daily message counts (last 30 days)
    const now = Date.now() / 1000
    const thirtyDaysAgo = now - 30 * 86400
    const dailyCounts: Record<string, number> = {}
    for (const m of msgs) {
      if (m.timestamp < thirtyDaysAgo) continue
      const d = new Date(m.timestamp * 1000).toISOString().slice(5, 10) // MM-DD
      dailyCounts[d] = (dailyCounts[d] || 0) + 1
    }
    const dailyEntries = Object.entries(dailyCounts).sort((a, b) => a[0].localeCompare(b[0]))
    const maxDaily = Math.max(...dailyEntries.map(e => e[1]), 1)

    // 24-hour heatmap
    const hourCounts = new Array(24).fill(0)
    for (const m of msgs) {
      const h = new Date(m.timestamp * 1000).getHours()
      hourCounts[h]++
    }
    const maxHour = Math.max(...hourCounts, 1)

    // Average response time (consecutive sent→recv or recv→sent)
    let totalResponseTime = 0
    let responseCount = 0
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i].isFromSelf !== msgs[i - 1].isFromSelf) {
        const diff = msgs[i].timestamp - msgs[i - 1].timestamp
        if (diff > 0 && diff < 86400) { // ignore gaps > 1 day
          totalResponseTime += diff
          responseCount++
        }
      }
    }
    const avgResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0

    // Word frequency (Chinese + English)
    const wordMap = new Map<string, number>()
    const stopWords = new Set(['的', '了', '是', '我', '在', '有', '和', '不', '这', '他', '她', '它', '你', '也', '就', '都', '而', '及', '与', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'for', 'and', 'on', 'at', 'by', 'i', 'me', 'my', 'it', 'do', 'so', 'no', 'or', 'if', 'be'])
    for (const m of textMsgs) {
      const text = displayContent(m).toLowerCase()
      // Split on spaces and common punctuation for English; individual chars for CJK
      const tokens = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]{1,4}|[a-z']+/g) || []
      for (const t of tokens) {
        if (t.length < 2 || stopWords.has(t)) continue
        wordMap.set(t, (wordMap.get(t) || 0) + 1)
      }
    }
    const topWords = [...wordMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    const maxWordCount = topWords[0]?.[1] || 1

    // Group member leaderboard
    let leaderboard: { name: string; avatar: string; count: number }[] = []
    if (session.contact.isGroup) {
      const memberCounts = new Map<string, number>()
      for (const m of msgs) {
        if (m.isFromSelf) continue
        memberCounts.set(m.fromUser, (memberCounts.get(m.fromUser) || 0) + 1)
      }
      leaderboard = [...memberCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([id, count]) => {
          const c = contactMap.get(id)
          return {
            name: c ? contactDisplayName(c) : id,
            avatar: c?.avatarURL ?? '',
            count,
          }
        })
    }
    const maxLeader = leaderboard[0]?.count || 1

    // First/last dates
    const firstDate = msgs[0] ? new Date(msgs[0].timestamp * 1000).toLocaleDateString() : 'N/A'
    const lastDate = msgs[msgs.length - 1] ? new Date(msgs[msgs.length - 1].timestamp * 1000).toLocaleDateString() : 'N/A'

    // Total days span
    const daySpan = msgs.length >= 2 ? Math.ceil((msgs[msgs.length - 1].timestamp - msgs[0].timestamp) / 86400) : 0
    const msgsPerDay = daySpan > 0 ? (msgs.length / daySpan).toFixed(1) : '0'

    return {
      total: msgs.length, sent, recv, images, videos, voices, links, files,
      dailyEntries, maxDaily, hourCounts, maxHour,
      avgResponseTime, topWords, maxWordCount,
      leaderboard, maxLeader,
      firstDate, lastDate, daySpan, msgsPerDay,
    }
  }, [msgs, session.contact.isGroup, contactMap])

  const formatDuration = (s: number) => {
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  }

  const sentPct = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0

  return (
    <div className="analytics-dashboard">
      <div className="analytics-header">
        <span className="analytics-title">Chat Analytics</span>
        <button className="analytics-close" onClick={onClose}>
          <CloseIcon size={16} color="var(--color-secondary-text)" />
        </button>
      </div>

      <div className="analytics-body">
        {/* Overview stats */}
        <div className="analytics-section">
          <h4>Overview</h4>
          <div className="analytics-stats-grid">
            <div className="analytics-stat-card">
              <span className="analytics-stat-label">Total Messages</span>
              <span className="analytics-stat-value">{stats.total.toLocaleString()}</span>
            </div>
            <div className="analytics-stat-card">
              <span className="analytics-stat-label">Msgs/Day</span>
              <span className="analytics-stat-value">{stats.msgsPerDay}</span>
            </div>
            <div className="analytics-stat-card">
              <span className="analytics-stat-label">Date Range</span>
              <span className="analytics-stat-value" style={{ fontSize: 11 }}>{stats.daySpan}d</span>
            </div>
            <div className="analytics-stat-card">
              <span className="analytics-stat-label">Avg Response</span>
              <span className="analytics-stat-value" style={{ fontSize: 14 }}>{formatDuration(stats.avgResponseTime)}</span>
            </div>
          </div>
        </div>

        {/* Send/Receive ratio */}
        <div className="analytics-section">
          <h4>Send / Receive</h4>
          <div className="analytics-ratio-bar">
            <div className="analytics-ratio-sent" style={{ width: `${sentPct}%` }} />
            <div className="analytics-ratio-recv" />
          </div>
          <div className="analytics-ratio-labels">
            <span>Sent: {stats.sent} ({sentPct}%)</span>
            <span>Received: {stats.recv} ({100 - sentPct}%)</span>
          </div>
        </div>

        {/* Daily activity bar chart */}
        {stats.dailyEntries.length > 0 && (
          <div className="analytics-section">
            <h4>Daily Activity (30d)</h4>
            <div className="analytics-bar-chart">
              {stats.dailyEntries.map(([day, count]) => (
                <div
                  key={day}
                  className="analytics-bar"
                  style={{ height: `${(count / stats.maxDaily) * 100}%` }}
                  title={`${day}: ${count} msgs`}
                />
              ))}
            </div>
          </div>
        )}

        {/* 24-hour heatmap */}
        <div className="analytics-section">
          <h4>Hourly Activity</h4>
          <div className="analytics-heatmap">
            {stats.hourCounts.map((count, h) => (
              <div
                key={h}
                className="analytics-heat-cell"
                style={{ opacity: count > 0 ? 0.15 + (count / stats.maxHour) * 0.85 : 0.05 }}
                title={`${h}:00 — ${count} msgs`}
              />
            ))}
          </div>
          <div className="analytics-heatmap-labels">
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>23h</span>
          </div>
        </div>

        {/* Media breakdown */}
        <div className="analytics-section">
          <h4>Media Breakdown</h4>
          <div className="analytics-media-row"><span className="analytics-media-icon">📷</span><span className="analytics-media-label">Images</span><span className="analytics-media-count">{stats.images}</span></div>
          <div className="analytics-media-row"><span className="analytics-media-icon">🎬</span><span className="analytics-media-label">Videos</span><span className="analytics-media-count">{stats.videos}</span></div>
          <div className="analytics-media-row"><span className="analytics-media-icon">🎤</span><span className="analytics-media-label">Voice</span><span className="analytics-media-count">{stats.voices}</span></div>
          <div className="analytics-media-row"><span className="analytics-media-icon">🔗</span><span className="analytics-media-label">Links</span><span className="analytics-media-count">{stats.links}</span></div>
          <div className="analytics-media-row"><span className="analytics-media-icon">📄</span><span className="analytics-media-label">Files</span><span className="analytics-media-count">{stats.files}</span></div>
        </div>

        {/* Top words */}
        {stats.topWords.length > 0 && (
          <div className="analytics-section">
            <h4>Top Words</h4>
            <div className="analytics-word-list">
              {stats.topWords.map(([word, count], i) => (
                <div key={word} className="analytics-word-row">
                  <span className="analytics-word-rank">{i + 1}</span>
                  <span className="analytics-word-text">{word}</span>
                  <div className="analytics-word-bar-wrap">
                    <div className="analytics-word-bar-fill" style={{ width: `${(count / stats.maxWordCount) * 100}%` }} />
                  </div>
                  <span className="analytics-word-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Group leaderboard */}
        {stats.leaderboard.length > 0 && (
          <div className="analytics-section">
            <h4><TrophyIcon size={12} /> Group Leaderboard</h4>
            <div className="analytics-leaderboard">
              {stats.leaderboard.map((member, i) => (
                <div key={i} className="analytics-leader-row">
                  <span className={`analytics-leader-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal'}`}>
                    {i + 1}
                  </span>
                  <AvatarView url={member.avatar} size={20} fallbackName={member.name} />
                  <span className="analytics-leader-name">{member.name}</span>
                  <div className="analytics-leader-bar-wrap">
                    <div className="analytics-leader-bar-fill" style={{ width: `${(member.count / stats.maxLeader) * 100}%` }} />
                  </div>
                  <span className="analytics-leader-count">{member.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
