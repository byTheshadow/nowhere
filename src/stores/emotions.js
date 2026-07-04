import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '../db/schema'

const VALID_EMOTIONS = [
  'happy',
  'calm',
  'sad',
  'anxious',
  'angry',
  'tired',
  'stressed',
  'lonely',
  'confused',
  'neutral'
]

function toPlain(value) {
  return JSON.parse(JSON.stringify(value))
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function todayKey() {
  const date = new Date()
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function timestamp() {
  return Date.now()
}

function normalizeDateKey(value) {
  if (!value) return todayKey()

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }

    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`
    }

    return todayKey()
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
  }

  return todayKey()
}

function normalizeIntensity(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) return 3
  if (number < 1) return 1
  if (number > 5) return 5

  return Math.round(number)
}

function normalizeEmotion(value) {
  if (!value || typeof value !== 'string') return 'neutral'

  const emotion = value.trim().toLowerCase()

  if (VALID_EMOTIONS.includes(emotion)) {
    return emotion
  }

  return 'neutral'
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

export const useEmotionsStore = defineStore('emotions', () => {
  const emotions = ref([])
  const isLoaded = ref(false)
  const isLoading = ref(false)
  const error = ref('')

  const sortedEmotions = computed(() => sortByDateDesc(emotions.value))

  const todayEmotion = computed(() => {
    const key = todayKey()
    return emotions.value.find((item) => item.date === key) || null
  })

  async function _fetchAll() {
    const rows = await db.emotions.toArray()
    emotions.value = sortByDateDesc(rows)
  }

  async function load() {
    if (isLoaded.value || isLoading.value) return

    isLoading.value = true
    error.value = ''

    try {
      await _fetchAll()
      isLoaded.value = true
    } catch (err) {
      console.error('[emotions] load failed:', err)
      error.value = err?.message || '情绪记录加载失败'
    } finally {
      isLoading.value = false
    }
  }

  async function addEmotion(payload = {}) {
    await load()

    const createdAt = timestamp()
    const date = normalizeDateKey(payload.date)

    const item = {
      date,
      dominantEmotion: normalizeEmotion(payload.dominantEmotion || payload.emotion),
      intensity: normalizeIntensity(payload.intensity),
      note: typeof payload.note === 'string' ? payload.note.trim() : '',
      source: payload.source || 'manual',
      createdAt,
      updatedAt: createdAt
    }

    await db.emotions.put(toPlain(item))
    await _fetchAll()

    return item
  }

  async function upsertDailyEmotion(payload = {}) {
    await load()

    const updatedAt = timestamp()
    const date = normalizeDateKey(payload.date)
    const existing = emotions.value.find((item) => item.date === date)

    const item = {
      date,
      dominantEmotion: normalizeEmotion(
        payload.dominantEmotion || payload.emotion || existing?.dominantEmotion
      ),
      intensity: normalizeIntensity(payload.intensity ?? existing?.intensity),
      note:
        typeof payload.note === 'string'
          ? payload.note.trim()
          : existing?.note || '',
      source: payload.source || existing?.source || 'manual',
      createdAt: existing?.createdAt || updatedAt,
      updatedAt
    }

    await db.emotions.put(toPlain(item))
    await _fetchAll()

    return item
  }

  async function recordFromChat(payload = {}) {
    return upsertDailyEmotion({
      date: payload.date || todayKey(),
      dominantEmotion: payload.dominantEmotion || payload.emotion,
      intensity: payload.intensity || 3,
      note: payload.note || '',
      source: 'chat'
    })
  }

  async function updateEmotion(date, patch = {}) {
    await load()

    const key = normalizeDateKey(date)
    const existing = emotions.value.find((item) => item.date === key)

    if (!existing) {
      return upsertDailyEmotion({
        date: key,
        ...patch
      })
    }

    const updated = {
      ...existing,
      ...patch,
      date: key,
      dominantEmotion: normalizeEmotion(
        patch.dominantEmotion || patch.emotion || existing.dominantEmotion
      ),
      intensity: normalizeIntensity(patch.intensity ?? existing.intensity),
      note:
        typeof patch.note === 'string'
          ? patch.note.trim()
          : existing.note || '',
      updatedAt: timestamp()
    }

    delete updated.emotion

    await db.emotions.put(toPlain(updated))
    await _fetchAll()

    return updated
  }

  async function deleteEmotion(date) {
    await load()

    const key = normalizeDateKey(date)

    await db.emotions.delete(key)
    emotions.value = emotions.value.filter((item) => item.date !== key)
  }

  async function clearAll() {
    await db.emotions.clear()
    emotions.value = []
    isLoaded.value = true
  }

  function getByDate(date) {
    const key = normalizeDateKey(date)
    return emotions.value.find((item) => item.date === key) || null
  }

  function getRecent(days = 30) {
    const count = Number(days)

    if (!Number.isFinite(count) || count <= 0) {
      return []
    }

    const result = []
    const base = new Date()

    for (let index = 0; index < count; index += 1) {
      const date = new Date(base)
      date.setDate(base.getDate() - index)

      const key = normalizeDateKey(date)
      const item = getByDate(key)

      result.push({
        date: key,
        emotion: item?.dominantEmotion || '',
        dominantEmotion: item?.dominantEmotion || '',
        intensity: item?.intensity || 0,
        note: item?.note || '',
        source: item?.source || ''
      })
    }

    return result.reverse()
  }

  return {
    emotions,
    isLoaded,
    isLoading,
    error,

    sortedEmotions,
    todayEmotion,

    load,
    addEmotion,
    upsertDailyEmotion,
    recordFromChat,
    updateEmotion,
    deleteEmotion,
    clearAll,
    getByDate,
    getRecent
  }
})
