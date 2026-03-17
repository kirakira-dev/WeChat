import React, { useEffect, useState } from 'react'
import { SessionProvider, useSession } from './contexts/SessionContext'
import { SettingsProvider } from './contexts/SettingsContext'
import LoginView from './components/login/LoginView'
import MainView from './components/layout/MainView'

function AppContent() {
  const { state, initialize } = useSession()
  const [transitioning, setTransitioning] = useState(false)
  const [showMain, setShowMain] = useState(false)

  useEffect(() => {
    if (!state.isLoggedIn) initialize()
  }, [])

  useEffect(() => {
    if (state.isLoggedIn && !showMain) {
      setTransitioning(true)
      const timer = setTimeout(() => {
        setShowMain(true)
        setTransitioning(false)
      }, 400)
      return () => clearTimeout(timer)
    }
    if (!state.isLoggedIn && showMain) {
      setTransitioning(true)
      const timer = setTimeout(() => {
        setShowMain(false)
        setTransitioning(false)
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [state.isLoggedIn])

  return (
    <div style={{
      width: '100%',
      height: '100%',
      opacity: transitioning ? 0 : 1,
      transition: 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      {showMain ? <MainView /> : <LoginView />}
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <SessionProvider>
        <AppContent />
      </SessionProvider>
    </SettingsProvider>
  )
}
