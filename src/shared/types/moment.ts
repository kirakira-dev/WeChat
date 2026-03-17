export interface MomentLike {
  userId: string
  userName: string
}

export interface MomentComment {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
  replyTo?: string
}

export interface MomentPost {
  id: string
  authorId: string
  authorName: string
  authorAvatar: string
  content: string
  images: string[]
  timestamp: number
  likes: MomentLike[]
  comments: MomentComment[]
  type: 'text' | 'image' | 'link' | 'repost'
  linkUrl?: string
  linkTitle?: string
  isLocal?: boolean
}

export function formatMomentTime(timestamp: number): string {
  const now = Date.now() / 1000
  const diff = now - timestamp
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  if (diff < 172800) return 'Yesterday'
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
  const d = new Date(timestamp * 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function groupMomentsByDate(posts: MomentPost[]): { label: string; posts: MomentPost[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
  const yesterday = today - 86400
  const weekAgo = today - 604800

  const groups: Map<string, MomentPost[]> = new Map()
  for (const post of posts) {
    let label: string
    if (post.timestamp >= today) label = 'Today'
    else if (post.timestamp >= yesterday) label = 'Yesterday'
    else if (post.timestamp >= weekAgo) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      label = days[new Date(post.timestamp * 1000).getDay()]
    } else {
      const d = new Date(post.timestamp * 1000)
      const pad = (n: number) => n.toString().padStart(2, '0')
      label = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(post)
  }

  return Array.from(groups.entries()).map(([label, posts]) => ({ label, posts }))
}
