// src/stores/relations.js
// Phase 6.3：关系库 store（CRUD）

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, uid, now } from '../db/schema'
import { toPlain } from '../db/utils'
import { logger } from '../services/logger'

/**
 * 关系类型枚举（唯一真源）
 * 修改时同步更新 Relations.vue 的 UI 选项
 */
export const RELATION_TYPES = [
  { value: 'family', label: '家人' },
  { value: 'friend', label: '朋友' },
  { value: 'colleague', label: '同事' },
  { value: 'partner', label: '恋人 / 伴侣' },
  { value: 'pet', label: '宠物' },
  { value: 'other', label: '其他' }
]

/**
 * 亲密度枚举
 */
export const SENTIMENT_TYPES = [
  { value: 'warm', label: '亲近', color: '#f5a623' },
  { value: 'normal', label: '一般', color: '#8a8a8a' },
  { value: 'tense', label: '紧张', color: '#e64545' }
]

const RELATION_VALUES = RELATION_TYPES.map((r) => r.value)
const SENTIMENT_VALUES = SENTIMENT_TYPES.map((s) => s.value)

export const useRelationsStore = defineStore('relations', () => {
  // ============ state ============
  const relations = ref([])
  const isLoaded = ref(false)

  // ============ getter ============
  /** 按关系类型分组，返回 { family: [...], friend: [...] } */
  const groupedByRelation = computed(() => {
    const groups = {}
    for (const r of RELATION_VALUES) groups[r] = []
    for (const item of relations.value) {
      const key = groups[item.relation] ? item.relation : 'other'
      groups[key].push(item)
    }
    return groups
  })

  /** 总数 */
  const count = computed(() => relations.value.length)

  // ============ 内部工具 ============
  /** 从 IDB 全量拉取，按更新时间倒序（最近编辑的在前） */
  async function _fetchAll() {
    const list = await db.relations.orderBy('updatedAt').reverse().toArray()
    relations.value = list
  }

  /** 校验并规范化关系类型 */
  function _normalizeRelation(v) {
    return RELATION_VALUES.includes(v) ? v : 'other'
  }

  /** 校验并规范化亲密度 */
  function _normalizeSentiment(v) {
    return SENTIMENT_VALUES.includes(v) ? v : 'normal'
  }

  // ============ actions ============

  /** 加载全部关系到内存 */
  async function load() {
    try {
      await _fetchAll()
      isLoaded.value = true
    } catch (e) {
      logger.error('[relations] 加载失败', e)
      throw e
    }
  }

  /**
   * 新增关系
   * data: { name, relation, sentiment, note, tags }
   */
  async function addRelation(data) {
    if (!data?.name?.trim()) throw new Error('名字不能为空')

    const t = now()
    const item = {
      id: `rel_${uid()}`,
      name: data.name.trim(),
      relation: _normalizeRelation(data.relation),
      sentiment: _normalizeSentiment(data.sentiment),
      note: (data.note || '').trim(),
      tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t).trim()).filter(Boolean) : [],
      createdAt: t,
      updatedAt: t
    }

    try {
      await db.relations.put(toPlain(item))
      await _fetchAll()
      logger.info('[relations] 新增', { id: item.id, name: item.name })
      return item.id
    } catch (e) {
      logger.error('[relations] addRelation 失败', e)
      throw e
    }
  }

  /**
   * 更新关系
   * patch: 允许包含 name / relation / sentiment / note / tags
   */
  async function updateRelation(relationId, patch) {
    const target = relations.value.find((r) => r.id === relationId)
    if (!target) throw new Error('找不到该关系')

    const allowedKeys = ['name', 'relation', 'sentiment', 'note', 'tags']
    const safePatch = {}
    for (const k of allowedKeys) {
      if (patch[k] !== undefined) safePatch[k] = patch[k]
    }

    if (safePatch.name !== undefined) {
      safePatch.name = String(safePatch.name).trim()
      if (!safePatch.name) throw new Error('名字不能为空')
    }
    if (safePatch.relation !== undefined) {
      safePatch.relation = _normalizeRelation(safePatch.relation)
    }
    if (safePatch.sentiment !== undefined) {
      safePatch.sentiment = _normalizeSentiment(safePatch.sentiment)
    }
    if (safePatch.note !== undefined) {
      safePatch.note = String(safePatch.note).trim()
    }
    if (safePatch.tags !== undefined) {
      safePatch.tags = Array.isArray(safePatch.tags)
        ? safePatch.tags.map((t) => String(t).trim()).filter(Boolean)
        : []
    }
    safePatch.updatedAt = now()

    try {
      await db.relations.update(relationId, toPlain(safePatch))
      await _fetchAll()
      logger.info('[relations] 更新', { id: relationId })
    } catch (e) {
      logger.error('[relations] updateRelation 失败', e)
      throw e
    }
  }

  /** 删除关系 */
  async function deleteRelation(relationId) {
    const target = relations.value.find((r) => r.id === relationId)
    if (!target) throw new Error('找不到该关系')

    try {
      await db.relations.delete(relationId)
      await _fetchAll()
      logger.info('[relations] 删除', { id: relationId })
    } catch (e) {
      logger.error('[relations] deleteRelation 失败', e)
      throw e
    }
  }

  /** 清空全部关系（危险操作，UI 层需二次确认） */
  async function clearAll() {
    try {
      await db.relations.clear()
      relations.value = []
      logger.info('[relations] 已清空全部')
    } catch (e) {
      logger.error('[relations] clearAll 失败', e)
      throw e
    }
  }

  /** 按 id 查一条 */
  function getById(relationId) {
    return relations.value.find((r) => r.id === relationId) || null
  }

  /** 按名字模糊查（不区分大小写） */
  function findByName(nameQuery) {
    const q = String(nameQuery || '').trim().toLowerCase()
    if (!q) return []
    return relations.value.filter((r) => r.name.toLowerCase().includes(q))
  }

  return {
    // state
    relations,
    isLoaded,
    // getter
    groupedByRelation,
    count,
    // actions
    load,
    addRelation,
    updateRelation,
    deleteRelation,
    clearAll,
    getById,
    findByName
  }
})
