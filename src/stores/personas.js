// src/stores/personas.js
// Phase 5：AI 人设 store（CRUD + 激活 + 首次种子）

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, uid, now } from '../db/schema'
import { toPlain } from '../db/utils'
import { logger } from '../services/logger'
import { PRESET_PERSONAS, PRESET_PERSONA_MAP } from '../data/presetPersonas'

export const usePersonasStore = defineStore('personas', () => {
  // ============ state ============
  const personas = ref([])          // 全部人设（预设 + 自定义）
  const isLoaded = ref(false)       // 是否已从 IDB 加载
  const isSeeding = ref(false)      // 是否正在写入种子（防并发）

  // ============ getter ============
  const activePersona = computed(() => {
    return personas.value.find((p) => p.isActive) || null
  })

  const presetPersonas = computed(() =>
    personas.value.filter((p) => p.isPreset)
  )

  const customPersonas = computed(() =>
    personas.value.filter((p) => !p.isPreset)
  )

  // ============ 内部工具 ============
  /** 从 IDB 全量拉取到 personas.value，按 createdAt 升序 */
  async function _fetchAll() {
    const list = await db.personas.orderBy('id').toArray()
    // 预设排前面（保持 PRESET_PERSONAS 中的顺序），自定义按 createdAt 升序
    const presetOrder = PRESET_PERSONAS.map((p) => p.id)
    list.sort((a, b) => {
      const ai = presetOrder.indexOf(a.id)
      const bi = presetOrder.indexOf(b.id)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return (a.createdAt || 0) - (b.createdAt || 0)
    })
    personas.value = list
  }

  /** 写入预设种子（仅在 IDB 表为空时执行一次） */
  async function _seedPresets() {
    if (isSeeding.value) return
    isSeeding.value = true
    try {
      const t = now()
      const seeds = PRESET_PERSONAS.map((p) => ({
        ...p,
        createdAt: t,
        updatedAt: t
      }))
      await db.personas.bulkPut(toPlain(seeds))
      logger.info('[personas] 已写入预设种子', { count: seeds.length })
    } catch (e) {
      logger.error('[personas] 写入预设种子失败', e)
      throw e
    } finally {
      isSeeding.value = false
    }
  }

  // ============ actions ============

  /** 首次加载：如果 IDB 为空则写入预设，然后拉取全部到 state */
  async function load() {
    try {
      const count = await db.personas.count()
      if (count === 0) {
        await _seedPresets()
      }
      await _fetchAll()

      // 确保至少有一个 active（默认第一个预设）
      if (!activePersona.value && personas.value.length > 0) {
        await setActive(personas.value[0].id)
      }
      isLoaded.value = true
    } catch (e) {
      logger.error('[personas] 加载失败', e)
      throw e
    }
  }

  /**
   * 切换激活人设
   * 采用"清空 + 单激活"策略：先把所有 isActive 置 false，再激活目标
   */
  async function setActive(personaId) {
    const target = personas.value.find((p) => p.id === personaId)
    if (!target) {
      logger.warn('[personas] setActive: 找不到 personaId', personaId)
      return
    }
    try {
      await db.transaction('rw', db.personas, async () => {
        // 清空所有 active
        const allActive = await db.personas.where('isActive').equals(1).toArray()
        for (const p of allActive) {
          await db.personas.update(p.id, { isActive: false, updatedAt: now() })
        }
        // 上面 where('isActive').equals(1) 匹配不到 boolean true，做兜底：
        await db.personas.toCollection().modify((p) => {
          if (p.isActive) p.isActive = false
        })
        // 激活目标
        await db.personas.update(personaId, { isActive: true, updatedAt: now() })
      })
      await _fetchAll()
      logger.info('[personas] 切换激活人设', { id: personaId, name: target.name })
    } catch (e) {
      logger.error('[personas] setActive 失败', e)
      throw e
    }
  }

  /**
   * 新增自定义人设
   * data: { name, avatar, kaomojiStyle, description, systemPrompt }
   */
  async function addCustom(data) {
    if (!data?.name?.trim()) throw new Error('人设名字不能为空')
    if (!data?.systemPrompt?.trim()) throw new Error('人设提示词不能为空')
    if (!data?.kaomojiStyle) throw new Error('必须选择一个颜文字风格')

    const t = now()
    const persona = {
      id: `custom-${uid()}`,
      name: data.name.trim(),
      avatar: (data.avatar || '(๑•́ ω •̀๑)').trim(),
      kaomojiStyle: data.kaomojiStyle,
      description: (data.description || '').trim(),
      systemPrompt: data.systemPrompt.trim(),
      isPreset: false,
      isActive: false,
      createdAt: t,
      updatedAt: t
    }

    try {
      await db.personas.put(toPlain(persona))
      await _fetchAll()
      logger.info('[personas] 新增自定义人设', { id: persona.id, name: persona.name })
      return persona.id
    } catch (e) {
      logger.error('[personas] addCustom 失败', e)
      throw e
    }
  }

  /**
   * 更新人设（预设和自定义都可以改）
   * patch: 允许包含 name / avatar / kaomojiStyle / description / systemPrompt
   * 注意：不允许通过此方法修改 isActive / isPreset / id
   */
  async function updatePersona(personaId, patch) {
    const target = personas.value.find((p) => p.id === personaId)
    if (!target) throw new Error('找不到人设')

    const allowedKeys = ['name', 'avatar', 'kaomojiStyle', 'description', 'systemPrompt']
    const safePatch = {}
    for (const k of allowedKeys) {
      if (patch[k] !== undefined) safePatch[k] = patch[k]
    }
    if (safePatch.name !== undefined) {
      safePatch.name = String(safePatch.name).trim()
      if (!safePatch.name) throw new Error('人设名字不能为空')
    }
    if (safePatch.systemPrompt !== undefined) {
      safePatch.systemPrompt = String(safePatch.systemPrompt).trim()
      if (!safePatch.systemPrompt) throw new Error('人设提示词不能为空')
    }
    safePatch.updatedAt = now()

    try {
      await db.personas.update(personaId, toPlain(safePatch))
      await _fetchAll()
      logger.info('[personas] 更新人设', { id: personaId })
    } catch (e) {
      logger.error('[personas] updatePersona 失败', e)
      throw e
    }
  }

  /** 删除人设（仅限自定义，预设禁止删除） */
  async function deletePersona(personaId) {
    const target = personas.value.find((p) => p.id === personaId)
    if (!target) throw new Error('找不到人设')
    if (target.isPreset) throw new Error('预设人设不能删除，可以编辑或恢复默认')

    const wasActive = !!target.isActive

    try {
      await db.personas.delete(personaId)
      await _fetchAll()

      // 如果删的是当前激活人设，自动激活第一个预设
      if (wasActive && personas.value.length > 0) {
        const fallback = personas.value.find((p) => p.isPreset) || personas.value[0]
        await setActive(fallback.id)
      }
      logger.info('[personas] 删除人设', { id: personaId })
    } catch (e) {
      logger.error('[personas] deletePersona 失败', e)
      throw e
    }
  }

  /** 把某个预设人设恢复为出厂默认值 */
  async function resetPreset(personaId) {
    const seed = PRESET_PERSONA_MAP[personaId]
    if (!seed) throw new Error('该 ID 不是预设人设')

    const current = personas.value.find((p) => p.id === personaId)
    const keepActive = current?.isActive ?? false

    const t = now()
    const restored = {
      ...seed,
      isActive: keepActive, // 保留激活状态
      createdAt: current?.createdAt ?? t,
      updatedAt: t
    }
    try {
      await db.personas.put(toPlain(restored))
      await _fetchAll()
      logger.info('[personas] 恢复预设默认', { id: personaId })
    } catch (e) {
      logger.error('[personas] resetPreset 失败', e)
      throw e
    }
  }

  /** 根据 id 查一个人设 */
  function getById(personaId) {
    return personas.value.find((p) => p.id === personaId) || null
  }

  return {
    // state
    personas,
    isLoaded,
    // getter
    activePersona,
    presetPersonas,
    customPersonas,
    // actions
    load,
    setActive,
    addCustom,
    updatePersona,
    deletePersona,
    resetPreset,
    getById
  }
})
