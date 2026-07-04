import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, uid, now } from '../db/schema'

export const USER_KNOWLEDGE_TYPES = {
  diet: '食疗',
  tcm: '中医养生',
  mental: '心理疏解',
  therapy: '心理疗法',
  seasonal: '节气时令',
  breathing: '呼吸放松',
  sleep: '睡眠调节',
  emergency: '紧急安抚',
  custom: '自定义'
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  const items = ref([])
  const isLoaded = ref(false)

  const count = computed(() => items.value.length)

  async function load() {
    items.value = await db.knowledge.orderBy('updatedAt').reverse().toArray()
    isLoaded.value = true
  }

  async function add(payload) {
    const ts = now()
    const item = {
      id: uid('knowledge'),
      type: payload.type || 'custom',
      title: payload.title || '',
      content: payload.content || '',
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      source: 'user',
      createdAt: ts,
      updatedAt: ts
    }
    await db.knowledge.add(item)
    items.value.unshift(item)
    return item
  }

  async function update(id, payload) {
    const existing = await db.knowledge.get(id)
    if (!existing) return null

    const patch = {
      type: payload.type ?? existing.type,
      title: payload.title ?? existing.title,
      content: payload.content ?? existing.content,
      tags: Array.isArray(payload.tags) ? payload.tags : existing.tags || [],
      updatedAt: now()
    }

    await db.knowledge.update(id, patch)

    const idx = items.value.findIndex(i => i.id === id)
    if (idx !== -1) {
      items.value[idx] = { ...items.value[idx], ...patch }
    }

    return { ...existing, ...patch }
  }

  async function remove(id) {
    await db.knowledge.delete(id)
    items.value = items.value.filter(i => i.id !== id)
  }

  async function clear() {
    await db.knowledge.clear()
    items.value = []
  }

  function getById(id) {
    return items.value.find(i => i.id === id) || null
  }

  return {
    items,
    isLoaded,
    count,
    load,
    add,
    update,
    remove,
    clear,
    getById
  }
})
