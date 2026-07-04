import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, uid, now } from '../db/schema'
import { toPlain } from '../db/utils'
import { logger } from '../services/logger'

const CURRENT_KEY = 'currentConversationId'

export const useConversationsStore = defineStore('conversations', () => {
  const list = ref([])
  const currentId = ref(null)

  async function loadAll() {
    const rows = await db.conversations.orderBy('updatedAt').reverse().toArray()
    // 附加最后一条消息的预览
    const withPreview = await Promise.all(
      rows.map(async (c) => {
        const last = await db.messages
          .where('conversationId').equals(c.id)
          .last()
        return {
          ...c,
          preview: last?.content?.slice(0, 60) || '',
          messageCount: await db.messages.where('conversationId').equals(c.id).count()
        }
      })
    )
    list.value = withPreview
  }

  async function loadCurrentId() {
    const row = await db.settings.get(CURRENT_KEY)
    currentId.value = row?.value || null
  }

  async function setCurrent(id) {
    currentId.value = id
    await db.settings.put({ key: CURRENT_KEY, value: id })
  }

  /**
   * 新建对话
   * @param {string|null} personaId 可选，绑定的人设 id（用于历史回溯"这个对话是哪个人设陪的"）
   */
  async function create(personaId = null) {
    const id = uid('conv')
    const conv = {
      id,
      title: '新对话',
      createdAt: now(),
      updatedAt: now(),
      personaId: personaId || null,
      isPinned: false,
      tags: []
    }
    await db.conversations.add(toPlain(conv))
    await setCurrent(id)
    await loadAll()
    logger.info('Conversation created', { id, personaId: personaId || null })
    return id
  }

  async function rename(id, title) {
    const trimmed = title.trim() || '未命名'
    await db.conversations.update(id, { title: trimmed, updatedAt: now() })
    await loadAll()
  }

  async function togglePin(id) {
    const c = await db.conversations.get(id)
    if (!c) return
    await db.conversations.update(id, { isPinned: !c.isPinned })
    await loadAll()
  }

  async function remove(id) {
    await db.transaction('rw', db.conversations, db.messages, async () => {
      await db.messages.where('conversationId').equals(id).delete()
      await db.conversations.delete(id)
    })
    // 如果删的是当前对话，清空 currentId
    if (currentId.value === id) {
      currentId.value = null
      await db.settings.delete(CURRENT_KEY)
    }
    await loadAll()
    logger.info('Conversation removed', { id })
  }

  async function removeMany(ids) {
    if (!ids.length) return
    await db.transaction('rw', db.conversations, db.messages, async () => {
      await db.messages.where('conversationId').anyOf(ids).delete()
      await db.conversations.bulkDelete(ids)
    })
    if (ids.includes(currentId.value)) {
      currentId.value = null
      await db.settings.delete(CURRENT_KEY)
    }
    await loadAll()
    logger.info('Conversations bulk removed', { count: ids.length })
  }

  async function updateTitleIfNew(id, title) {
    const c = await db.conversations.get(id)
    if (!c) return
    if (c.title === '新对话' && title) {
      await db.conversations.update(id, { title: title.slice(0, 30) })
      await loadAll()
    }
  }

  return {
    list, currentId,
    loadAll, loadCurrentId, setCurrent,
    create, rename, togglePin, remove, removeMany,
    updateTitleIfNew
  }
})
