// src/stores/memories.js
// Phase 7.1：向量记忆 store（CRUD）
// 说明：v1 不接 embedding，检索走 src/utils/memorySearch.js 的关键词打分。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, uid, now } from '../db/schema'
import { toPlain } from '../db/utils'
import { logger } from '../services/logger'

/**
 * 记忆类型枚举（唯一真源）
 * 修改时同步更新 Memories.vue 的 UI 选项
 */
export const MEMORY_TYPES = [
  { value: 'preference', label: '偏好' },
  { value: 'fact', label: '事实' },
  { value: 'event', label: '事件' },
  { value: 'feeling', label: '心情' },
  { value: 'goal', label: '目标' }
]

/**
 * 重要度枚举（3 档，对应"一般 / 长期 / 核心"）
 */
export const IMPORTANCE_LEVELS = [
  { value: 1, label: '一般' },
  { value: 2, label: '重要' },
  { value: 3, label: '核心' }
]

/**
 * 来源枚举（预留：manual = 用户手动新增；chat = 从聊天气泡钉入）
 */
export const MEMORY_SOURCES = ['manual', 'chat']

const TYPE_VALUES = MEMORY_TYPES.map((t) => t.value)
const IMPORTANCE_VALUES = IMPORTANCE_LEVELS.map((l) => l.value)

export const useMemoriesStore = defineStore('memories', () => {
  // ============ state ============
  const memories = ref([])
  const isLoaded = ref(false)

  // ============ getter ============
  /** 按类型分组，返回 { preference: [...], fact: [...] } */
  const groupedByType = computed(() => {
    const groups = {}
    for (const t of TYPE_VALUES) groups[t] = []
    for (const item of memories.value) {
      const key = groups[item.type] ? item.type : 'fact'
      groups[key].push(item)
    }
    return groups
  })

  /** 按重要度倒序（核心 → 一般），同重要度内按 createdAt 倒序 */
  const sortedByImportance = computed(() => {
    return [...memories.value].sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance
      return b.createdAt - a.createdAt
    })
  })

  /** 核心记忆（importance === 3） */
  const coreMemories = computed(() =>
    memories.value.filter((m) => m.importance === 3)
  )

  /** 总数 */
  const count = computed(() => memories.value.length)

  // ============ 内部工具 ============
  /** 从 IDB 全量拉取，按创建时间倒序（最近的在前） */
  async function _fetchAll() {
    const list = await db.memories.orderBy('createdAt').reverse().toArray()
    memories.value = list
  }

  /** 校验并规范化类型 */
  function _normalizeType(v) {
    return TYPE_VALUES.includes(v) ? v : 'fact'
  }

  /** 校验并规范化重要度 */
  function _normalizeImportance(v) {
    const n = Number(v)
    return IMPORTANCE_VALUES.includes(n) ? n : 1
  }

  /** 校验并规范化来源 */
  function _normalizeSource(v) {
    return MEMORY_SOURCES.includes(v) ? v : 'manual'
  }

  // ============ actions ============

  /** 加载全部记忆到内存 */
  async function load() {
    try {
      await _fetchAll()
      isLoaded.value = true
    } catch (e) {
      logger.error('[memories] 加载失败', e)
      throw e
    }
  }

  /**
   * 新增记忆
   * data: {
   *   content,                 // 必填
   *   type,                    // 可选，默认 fact
   *   importance,              // 可选，默认 1
   *   tags,                    // 可选，字符串数组
   *   source,                  // 可选，默认 manual
   *   sourceMessageId,         // 可选
   *   sourceConversationId     // 可选
   * }
   */
  async function addMemory(data) {
    const content = String(data?.content || '').trim()
    if (!content) throw new Error('记忆内容不能为空')

    const t = now()
    const item = {
      id: `mem_${uid()}`,
      type: _normalizeType(data.type),
      content,
      importance: _normalizeImportance(data.importance),
      tags: Array.isArray(data.tags)
        ? data.tags.map((s) => String(s).trim()).filter(Boolean)
        : [],
      source: _normalizeSource(data.source),
      sourceMessageId: data.sourceMessageId ? String(data.sourceMessageId) : '',
      sourceConversationId: data.sourceConversationId ? String(data.sourceConversationId) : '',
      createdAt: t,
      updatedAt: t
    }

    try {
      await db.memories.put(toPlain(item))
      await _fetchAll()
      logger.info('[memories] 新增', { id: item.id, type: item.type })
      return item.id
    } catch (e) {
      logger.error('[memories] addMemory 失败', e)
      throw e
    }
  }

  /**
   * 更新记忆
   * patch: 允许包含 content / type / importance / tags
   * （source / sourceMessageId / sourceConversationId 不允许改，保持溯源真实）
   */
  async function updateMemory(memoryId, patch) {
    const target = memories.value.find((m) => m.id === memoryId)
    if (!target) throw new Error('找不到该记忆')

    const allowedKeys = ['content', 'type', 'importance', 'tags']
    const safePatch = {}
    for (const k of allowedKeys) {
      if (patch[k] !== undefined) safePatch[k] = patch[k]
    }

    if (safePatch.content !== undefined) {
      safePatch.content = String(safePatch.content).trim()
      if (!safePatch.content) throw new Error('记忆内容不能为空')
    }
    if (safePatch.type !== undefined) {
      safePatch.type = _normalizeType(safePatch.type)
    }
    if (safePatch.importance !== undefined) {
      safePatch.importance = _normalizeImportance(safePatch.importance)
    }
    if (safePatch.tags !== undefined) {
      safePatch.tags = Array.isArray(safePatch.tags)
        ? safePatch.tags.map((s) => String(s).trim()).filter(Boolean)
        : []
    }
    safePatch.updatedAt = now()

    try {
      await db.memories.update(memoryId, toPlain(safePatch))
      await _fetchAll()
      logger.info('[memories] 更新', { id: memoryId })
    } catch (e) {
      logger.error('[memories] updateMemory 失败', e)
      throw e
    }
  }

  /** 删除记忆 */
  async function deleteMemory(memoryId) {
    const target = memories.value.find((m) => m.id === memoryId)
    if (!target) throw new Error('找不到该记忆')

    try {
      await db.memories.delete(memoryId)
      await _fetchAll()
      logger.info('[memories] 删除', { id: memoryId })
    } catch (e) {
      logger.error('[memories] deleteMemory 失败', e)
      throw e
    }
  }

  /** 清空全部记忆（危险操作，UI 层需二次确认） */
  async function clearAll() {
    try {
      await db.memories.clear()
      memories.value = []
      logger.info('[memories] 已清空全部')
    } catch (e) {
      logger.error('[memories] clearAll 失败', e)
      throw e
    }
  }

  /** 按 id 查一条 */
  function getById(memoryId) {
    return memories.value.find((m) => m.id === memoryId) || null
  }

  /** 按内容模糊查（不区分大小写，仅用于管理页搜索） */
  function findByContent(query) {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return []
    return memories.value.filter((m) => m.content.toLowerCase().includes(q))
  }

  /**
   * 从某条聊天消息钉入（供聊天气泡的"📌 记住"按钮调用）
   * 简版包装，本质仍是 addMemory
   */
  async function pinFromMessage({ content, messageId, conversationId, type, importance, tags }) {
    return addMemory({
      content,
      type,
      importance,
      tags,
      source: 'chat',
      sourceMessageId: messageId,
      sourceConversationId: conversationId
    })
  }

  return {
    // state
    memories,
    isLoaded,
    // getter
    groupedByType,
    sortedByImportance,
    coreMemories,
    count,
    // actions
    load,
    addMemory,
    updateMemory,
    deleteMemory,
    clearAll,
    getById,
    findByContent,
    pinFromMessage
  }
})
