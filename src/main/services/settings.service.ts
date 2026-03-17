import Store from 'electron-store'
import { AppSettings, DEFAULT_SETTINGS } from '../../shared/types/settings'

export class SettingsService {
  private store: Store<AppSettings>

  constructor() {
    this.store = new Store<AppSettings>({
      name: 'settings',
      defaults: DEFAULT_SETTINGS,
    })
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.store.get(key)
  }

  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.store.set(key, value)
  }

  getAll(): AppSettings {
    return this.store.store
  }

  reset(): void {
    this.store.clear()
  }
}
