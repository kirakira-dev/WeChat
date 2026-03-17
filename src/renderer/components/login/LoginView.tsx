import React, { useState } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { WeChatLogo } from '../common/Icons'
import './login.css'

export default function LoginView() {
  const { state, initialize, extractKeys } = useSession()
  const [showQR, setShowQR] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)

  const startQRLogin = async () => {
    setQrLoading(true)
    try {
      await window.electronAPI.apiGetUUID()
      await window.electronAPI.apiGetQRCode()
      pollLoop()
    } catch (err) {
      console.error('QR login failed:', err)
    }
    setQrLoading(false)
  }

  const pollLoop = async () => {
    let loggedIn = false
    while (!loggedIn) {
      try {
        const result = await window.electronAPI.apiPollLogin()
        if (result.success && result.redirectURL) {
          await window.electronAPI.apiCompleteLogin(result.redirectURL)
          loggedIn = true
        }
      } catch {}
      if (!loggedIn) await new Promise(r => setTimeout(r, 1000))
    }
  }

  const handleRetry = () => {
    initialize()
  }

  const copyCommand = () => {
    window.electronAPI.systemClipboardWrite('sudo /tmp/find_wechat_keys')
  }

  return (
    <div className="login-view">
      <div className="login-content">
        <div className="login-icon"><WeChatLogo size={80} /></div>
        <h1 className="login-title">WeChat</h1>

        {!showQR ? (
          <div className="login-section">
            {state.dbKeyStatus.kind === 'checking' && (
              <div className="login-status">
                <div className="spinner" />
                <p className="status-text">Checking WeChat data...</p>
                <div className="loading-shimmer" />
              </div>
            )}

            {state.dbKeyStatus.kind === 'ready' && (
              <div className="login-status">
                <span className="status-icon success">✓</span>
                <p className="status-text">Loading from WeChat database...</p>
              </div>
            )}

            {state.dbKeyStatus.kind === 'extracting' && (
              <div className="login-status">
                <div className="spinner" />
                <p className="status-text">Extracting DB key from WeChat...</p>
                <div className="loading-shimmer" />
                <p className="status-hint">Make sure WeChat is running</p>
              </div>
            )}

            {state.dbKeyStatus.kind === 'noKey' && (
              <div className="login-status">
                {state.wxid && <p className="status-wxid">Found: {state.wxid}</p>}
                <p className="status-text">{state.statusMessage}</p>
                <button className="wechat-btn" onClick={extractKeys}>Extract Keys</button>
                <div className="code-block" onClick={copyCommand}>
                  <code>sudo /tmp/find_wechat_keys</code>
                  <span className="copy-hint">Click to copy</span>
                </div>
                <p className="status-hint">Keys will be saved to ~/.wechat_db_keys.json</p>
              </div>
            )}

            {state.dbKeyStatus.kind === 'failed' && (
              <div className="login-status">
                <span className="status-icon error">✕</span>
                <p className="status-text error">{state.dbKeyStatus.message}</p>
                <button className="wechat-btn" onClick={handleRetry}>Retry</button>
              </div>
            )}

            <button className="toggle-login" onClick={() => { setShowQR(true); startQRLogin() }}>
              Use QR Code Login Instead
            </button>
          </div>
        ) : (
          <div className="login-section">
            <div className="qr-container">
              {state.qrCodeData ? (
                <img src={`data:image/png;base64,${state.qrCodeData}`} alt="QR Code" className="qr-image" />
              ) : qrLoading ? (
                <div className="spinner" />
              ) : null}
              {state.loginState.kind === 'scanned' && (
                <div className="qr-overlay">
                  <span className="status-icon success">✓</span>
                  <p>Scanned</p>
                  <p className="status-hint">Confirm login on your phone</p>
                </div>
              )}
            </div>

            <p className="status-text">
              {state.loginState.kind === 'waitingScan' ? 'Open WeChat on your phone and scan this QR Code' :
               state.loginState.kind === 'scanned' ? 'Confirm login on your phone' :
               state.loginState.kind === 'loggedIn' ? 'Login successful' :
               state.loginState.kind === 'failed' ? `Login failed: ${state.loginState.message}` :
               'Scan QR Code to log in to WeChat'}
            </p>

            <button className="toggle-login" onClick={() => setShowQR(false)}>
              Use Local Data Instead
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
