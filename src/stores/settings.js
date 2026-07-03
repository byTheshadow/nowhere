import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '../db/schema'

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref('auto') // 'light' | 'dark' | 'auto'

  async function load() {
    const rows = await db.settings.toArray()
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    if (map.theme) theme.value = map.theme
    applyTheme()
  }

  async function set(key, value) {
    await db.settings.put({ key, value })
    if (key === 'theme') {
      theme.value = value
      applyTheme()
    }
  }

  function applyTheme() {
    const root = document.documentElement
    if (theme.value === 'auto') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', theme.value)
    }
  }

  return { theme, load, set }
})
