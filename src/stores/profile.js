// src/stores/profile.js
// Phase 6.1：用户档案 store（单例读写）

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, now } from '../db/schema'
import { toPlain } from '../db/utils'
import { logger } from '../services/logger'

const PROFILE_ID = 'me'

/**
 * 空档案模板
 * - 用于首次访问 & reset 后的内存占位
 * - createdAt 为 null 表示"从未保存过"（用于首次填写引导判定）
 */
function emptyProfile() {
  return {
    id: PROFILE_ID,
    // 基本信息
    gender: '',           // 'male' | 'female' | 'other' | ''
    age: null,            // number | null
    city: '',             // 用于 Phase 9 天气
    // 中医体质九分法：'平和' | '气虚' | '阳虚' | '阴虚'
    //               | '痰湿' | '湿热' | '血瘀' | '气郁' | '特禀' | ''
    constitution: '',
    // 结构化：{ name, dosage, frequency, note }
    medications: [],
    supplements: [],
    // 字符串数组
    allergies: [],
    dietaryRestrictions: [],
    // 长文本：想改善的方向
    goals: '',
    createdAt: null,
    updatedAt: null
  }
}

export const useProfileStore = defineStore('profile', () => {
  // ============ state ============
  const profile = ref(emptyProfile())
  const isLoaded = ref(false)

  // ============ getter ============
  /** 用户是否真正保存过档案（用于首次填写引导判定） */
  const hasProfile = computed(() => !!profile.value.createdAt)

  // ============ actions ============

  /**
   * 从 IDB 载入档案
   * - 有记录：合并到空模板（补齐可能后续新增的字段）
   * - 无记录：保留空模板，不写库（避免"空档案"污染）
   * @param {boolean} force 强制重载
   */
  async function load(force = false) {
    if (isLoaded.value && !force) return
    try {
      const row = await db.profile.get(PROFILE_ID)
      if (row) {
        profile.value = { ...emptyProfile(), ...row }
      } else {
        profile.value = emptyProfile()
      }
      isLoaded.value = true
    } catch (e) {
      logger.error('[profile] 加载失败', e)
      throw e
    }
  }

  /**
   * 增量保存（浅合并）
   * - 数组字段整体替换（medications: [...] 直接覆盖）
   * - 首次保存自动写入 createdAt
   * - 每次都刷新 updatedAt
   * @param {Object} patch 需要更新的字段
   */
  async function save(patch = {}) {
    const t = now()
    const next = {
      ...profile.value,
      ...patch,
      id: PROFILE_ID,
      createdAt: profile.value.createdAt || t,
      updatedAt: t
    }
    try {
      await db.profile.put(toPlain(next))
      profile.value = next
      logger.info('[profile] 已保存', { fields: Object.keys(patch) })
    } catch (e) {
      logger.error('[profile] 保存失败', e)
      throw e
    }
  }

  /** 清空档案：删库 + 内存重置 */
  async function reset() {
    try {
      await db.profile.delete(PROFILE_ID)
      profile.value = emptyProfile()
      logger.info('[profile] 已重置')
    } catch (e) {
      logger.error('[profile] 重置失败', e)
      throw e
    }
  }

  return {
    // state
    profile,
    isLoaded,
    // getter
    hasProfile,
    // actions
    load,
    save,
    reset
  }
})

