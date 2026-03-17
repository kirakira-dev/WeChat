import React, { useState, useRef } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { MomentPost, formatMomentTime, groupMomentsByDate } from '../../../shared/types/moment'
import AvatarView from '../common/AvatarView'
import {
  HeartIcon, HeartOutlineIcon, CommentIcon, ImageIcon,
  RefreshIcon, MomentsIcon, SendIcon,
} from '../common/Icons'
import './moments.css'

export default function MomentsView() {
  const { state, refreshMoments, addMomentPost, toggleMomentLike, addMomentComment } = useSession()
  const [composeText, setComposeText] = useState('')
  const [showCompose, setShowCompose] = useState(false)
  const [commentingOn, setCommentingOn] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)

  const selfContact = state.contacts.find(c => c.id === state.wxid)
  const groups = groupMomentsByDate(state.moments)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refreshMoments()
    setTimeout(() => setRefreshing(false), 600)
  }

  const handlePost = async () => {
    const text = composeText.trim()
    if (!text) return
    await addMomentPost(text)
    setComposeText('')
    setShowCompose(false)
  }

  const handleComment = async (postId: string) => {
    const text = commentText.trim()
    if (!text) return
    await addMomentComment(postId, text)
    setCommentText('')
    setCommentingOn(null)
  }

  return (
    <div className="moments-view">
      {/* Cover banner */}
      <div className="moments-cover">
        <div className="moments-cover-profile">
          <span className="moments-cover-name">
            {selfContact?.remarkName || selfContact?.nickname || state.wxid}
          </span>
          <AvatarView
            url={selfContact?.avatarURL ?? ''}
            size={48}
            fallbackName={selfContact?.nickname ?? 'U'}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="moments-toolbar">
        <div className="moments-toolbar-left">
          <span className="moments-title">Moments</span>
          <span className="moments-count">{state.moments.length} posts</span>
        </div>
        <div className="moments-toolbar-right">
          <button
            className={`moments-tool-btn ${refreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
          >
            <RefreshIcon size={14} />
          </button>
          <button
            className="moments-tool-btn"
            onClick={() => setShowCompose(!showCompose)}
          >
            <MomentsIcon size={14} />
            <span>Post</span>
          </button>
        </div>
      </div>

      {/* Compose area */}
      {showCompose && (
        <div className="moments-compose">
          <div className="moments-compose-inner">
            <textarea
              className="moments-compose-input"
              placeholder="What's on your mind..."
              value={composeText}
              onChange={e => setComposeText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost()
                if (e.key === 'Escape') setShowCompose(false)
              }}
              autoFocus
            />
            <button
              className={`moments-compose-send ${!composeText.trim() ? 'disabled' : ''}`}
              onClick={handlePost}
            >
              Post
            </button>
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="moments-feed" ref={feedRef}>
        {state.moments.length === 0 ? (
          <div className="moments-empty">
            <div className="moments-empty-icon">
              <MomentsIcon size={48} color="var(--color-secondary-text)" />
            </div>
            <p>No moments yet</p>
            <p style={{ fontSize: 11, opacity: 0.6 }}>Posts from your chats will appear here</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label} className="moments-date-group">
              <div className="moments-date-label">{group.label}</div>
              {group.posts.map((post, i) => (
                <MomentCard
                  key={post.id}
                  post={post}
                  selfId={state.wxid}
                  onLike={() => toggleMomentLike(post.id)}
                  onComment={() => {
                    setCommentingOn(commentingOn === post.id ? null : post.id)
                    setCommentText('')
                  }}
                  commenting={commentingOn === post.id}
                  commentText={commentText}
                  onCommentTextChange={setCommentText}
                  onSubmitComment={() => handleComment(post.id)}
                  style={{ animationDelay: `${i * 0.03}s` }}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

interface MomentCardProps {
  post: MomentPost
  selfId: string
  onLike: () => void
  onComment: () => void
  commenting: boolean
  commentText: string
  onCommentTextChange: (t: string) => void
  onSubmitComment: () => void
  style?: React.CSSProperties
}

function MomentCard({
  post, selfId, onLike, onComment,
  commenting, commentText, onCommentTextChange, onSubmitComment,
  style,
}: MomentCardProps) {
  const isLiked = post.likes.some(l => l.userId === selfId)
  const hasSocial = post.likes.length > 0 || post.comments.length > 0

  return (
    <div className="moment-post" style={style}>
      <div className="moment-post-header">
        <AvatarView url={post.authorAvatar} size={36} fallbackName={post.authorName} />
        <div className="moment-author-info">
          <span className="moment-author-name">{post.authorName}</span>
          <div>
            <span className="moment-time">{formatMomentTime(post.timestamp)}</span>
            {post.isLocal && <span className="moment-local-badge">You</span>}
          </div>
        </div>
      </div>

      <div className="moment-content">
        {/* Text content */}
        {post.content && <div className="moment-text">{post.content}</div>}

        {/* Image grid */}
        {post.images.length > 0 && (
          <div className={`moment-images count-${Math.min(post.images.length, 3)}`}>
            {post.images.slice(0, 9).map((_, i) => (
              <div key={i} className="moment-image-placeholder">
                <ImageIcon size={20} color="var(--color-secondary-text)" />
              </div>
            ))}
          </div>
        )}

        {/* Link card */}
        {post.type === 'link' && post.linkTitle && (
          <div className="moment-link-card" onClick={() => post.linkUrl && window.open(post.linkUrl)}>
            <div className="moment-link-icon">
              <SendIcon size={16} color="var(--color-wechat-green)" />
            </div>
            <span className="moment-link-title">{post.linkTitle}</span>
          </div>
        )}

        {/* Actions */}
        <div className="moment-actions">
          <button
            className={`moment-action-btn ${isLiked ? 'liked' : ''}`}
            onClick={onLike}
          >
            {isLiked
              ? <HeartIcon size={14} color="#e74c3c" />
              : <HeartOutlineIcon size={14} />
            }
            {post.likes.length > 0 && <span>{post.likes.length}</span>}
          </button>
          <button className="moment-action-btn" onClick={onComment}>
            <CommentIcon size={14} />
            {post.comments.length > 0 && <span>{post.comments.length}</span>}
          </button>
        </div>

        {/* Social section (likes + comments) */}
        {(hasSocial || commenting) && (
          <div className="moment-social">
            {/* Likes */}
            {post.likes.length > 0 && (
              <div className="moment-likes">
                <HeartIcon size={12} color="#e74c3c" />
                {post.likes.map((like, i) => (
                  <React.Fragment key={like.userId}>
                    {i > 0 && <span className="moment-like-separator">,</span>}
                    <span className="moment-like-name">{like.userName}</span>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Comments */}
            {post.comments.length > 0 && (
              <div className="moment-comments">
                {post.comments.map(cmt => (
                  <div key={cmt.id} className="moment-comment">
                    <span className="moment-comment-author">{cmt.userName}</span>
                    {': '}
                    <span className="moment-comment-text">{cmt.content}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Comment input */}
            {commenting && (
              <div className="moment-comment-input-wrap">
                <input
                  className="moment-comment-input"
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={e => onCommentTextChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && commentText.trim()) onSubmitComment()
                    if (e.key === 'Escape') onComment()
                  }}
                  autoFocus
                />
                <button
                  className="moment-comment-send"
                  onClick={onSubmitComment}
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
