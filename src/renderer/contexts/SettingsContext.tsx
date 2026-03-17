import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { AppSettings } from '../../shared/types/settings'
import { DEFAULT_SETTINGS } from '../../shared/types/settings'

interface SettingsContextType {
  settings: AppSettings
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  resetAll: () => void
}

const SettingsContext = createContext<SettingsContextType>(null!)

function rgb(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    window.electronAPI.settingsGetAll().then(setSettings)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (settings.themeMode === 'light') {
      root.setAttribute('data-theme', 'light')
    } else {
      root.removeAttribute('data-theme')
    }

    if (settings.themeMode === 'custom') {
      root.style.setProperty('--color-wechat-green', rgb(settings.customAccentR, settings.customAccentG, settings.customAccentB))
      root.style.setProperty('--color-bubble-self', rgb(settings.customBubbleR, settings.customBubbleG, settings.customBubbleB))
      root.style.setProperty('--color-chat-bg', rgb(settings.customBgR, settings.customBgG, settings.customBgB))
      root.style.setProperty('--color-chatlist-selected', rgb(settings.customSelectedR, settings.customSelectedG, settings.customSelectedB))
      root.style.setProperty('--color-chatlist-hover', rgb(settings.customHoverR, settings.customHoverG, settings.customHoverB))
      root.style.setProperty('--color-sidebar-bg', rgb(settings.customSidebarR, settings.customSidebarG, settings.customSidebarB))
      root.style.setProperty('--color-chatlist-bg', rgb(settings.customChatlistR, settings.customChatlistG, settings.customChatlistB))
      root.style.setProperty('--color-chat-input-bg', rgb(settings.customInputR, settings.customInputG, settings.customInputB))
      root.style.setProperty('--color-primary-text', rgb(settings.customPrimaryTextR, settings.customPrimaryTextG, settings.customPrimaryTextB))
      root.style.setProperty('--color-secondary-text', rgb(settings.customSecondaryTextR, settings.customSecondaryTextG, settings.customSecondaryTextB))
      root.style.setProperty('--color-bubble-other', rgb(settings.customBubbleOtherR, settings.customBubbleOtherG, settings.customBubbleOtherB))
    } else {
      const customProps = [
        '--color-wechat-green', '--color-bubble-self', '--color-chat-bg',
        '--color-chatlist-selected', '--color-chatlist-hover', '--color-sidebar-bg',
        '--color-chatlist-bg', '--color-chat-input-bg', '--color-primary-text',
        '--color-secondary-text', '--color-bubble-other',
      ]
      customProps.forEach(p => root.style.removeProperty(p))
    }

    root.style.setProperty('--font-size-message', `${settings.fontSize}px`)
    root.style.setProperty('--avatar-border-radius', settings.avatarStyle === 'circle' ? '50%' : settings.avatarStyle === 'square' ? '6%' : '18%')
    root.style.setProperty('--message-padding', settings.messageDensity === 'compact' ? '2px' : settings.messageDensity === 'comfortable' ? '8px' : '4px')
  }, [settings])

  const setSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    window.electronAPI.settingsSet(key, value)
  }, [])

  const resetAll = useCallback(() => {
    window.electronAPI.settingsReset()
    setSettings(DEFAULT_SETTINGS)
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, setSetting, resetAll }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
