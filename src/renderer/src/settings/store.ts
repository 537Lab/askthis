import { create } from 'zustand'
import type { PublicConfig } from '@shared/types'

interface SettingsStore {
  config: PublicConfig | null
  patch(patch: Record<string, unknown>): Promise<PublicConfig>
  load(): Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  config: null,

  load: async () => {
    const config = await window.api.config.get()
    set({ config })
  },

  patch: async (patch) => {
    const config = await window.api.config.patch(patch)
    set({ config })
    return config
  }
}))
