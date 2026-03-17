import React, { useState, useEffect } from 'react'

const COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6']

function hashColor(name: string): string {
  let hash = 0
  for (const ch of name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
}

interface Props {
  url: string
  size: number
  fallbackName: string
}

export default function AvatarView({ url, size, fallbackName }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!url || failed) return
    setImgSrc(null)

    if (url.startsWith('http://') || url.startsWith('https://')) {
      setImgSrc(url)
    } else if (url.startsWith('/')) {
      window.electronAPI.apiGetAvatar(url).then(base64 => {
        if (base64) setImgSrc(`data:image/png;base64,${base64}`)
        else setFailed(true)
      })
    }
  }, [url])

  const initial = (fallbackName || '?')[0].toUpperCase()
  const borderRadius = `var(--avatar-border-radius)`

  if (imgSrc && !failed) {
    return (
      <img
        src={imgSrc}
        alt=""
        onError={() => { setFailed(true); setImgSrc(null) }}
        style={{ width: size, height: size, borderRadius, objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius, flexShrink: 0,
      background: hashColor(fallbackName), display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: '#fff', fontSize: size * 0.38, fontWeight: 600 }}>{initial}</span>
    </div>
  )
}
