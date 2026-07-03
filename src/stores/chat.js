import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, uid, now } from '../db/schema'
import { logger } from '../services/logger'
import { useAIStore } from './ai'

const CURRENT_CONV_KEY = 'currentConversationId'

const DEFAULT_SYSTEM = `你是 Nowhere，一个温柔的情绪陪伴助手，风格像 Baymax。
- 回应尽量简短、温暖、共情，不要说教。
- 在合适的时候可以给出食疗、呼吸法、简单的中医养生建议。
- 用户可能只是想倾诉，不要急着给建议。
- 保持自然的口语化中文。`

export const useChatStore = defineStore('chat', () => {
  const currentConversationId = ref(null)
  const messages = ref([])
  const isStreaming = ref(false)
  const streamingContent = ref('')

  async function ensureConversation() {
    if (currentConversationId.value) return currentConversationId.value

    const row = await db.settings.get(CURRENT_CONV_KEY)
    if (row?.value) {
      const exists = await db.conversations.get(row.value)
      if (exists) {
        currentConversationId.value = row.value
        return row.value
      }
    }

    const id = uid('conv')
    await db.conversations.add({
      id,
      title: '新对话',
      createdAt: now(),
      updatedAt: now(),
      personaId: null,
      isPinned: false,
      tags: []
    })
    await db.settings.put({ key: CURRENT_CONV_KEY, value: id })
    currentConversationId.value = id
    return id
  }

  async function loadMessages() {
    const id = await ensureConversation()
    messages.value = await db.messages
      .where('conversationId').equals(id)
      .sortBy('timestamp')
  }

  async function sendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed) return

    const ai = useAIStore()
    if (!ai.isConfigured) {
      throw new Error('请先在 设置 → AI 配置 里配置 API Key 和模型')
    }

    const convId = await ensureConversation()

    const userMsg = {
      id: uid('msg'),
      conversationId: convId,
      role: 'user',
      content: trimmed,
      timestamp: now(),
      mode: 'normal'
    }
    await db.messages.add(userMsg)
    messages.value.push(userMsg)

    const payload = [
      { role: 'system', content: DEFAULT_SYSTEM },
      ...messages.value.map((m) => ({ role: m.role, content: m.content }))
    ]

    isStreaming.value = true
    streamingContent.value = ''

    let fullText = ''
    try {
      const adapter = ai.createChatAdapter()
      for await (const chunk of adapter.chatStream(payload, {
        temperature: ai.temperature
      })) {
        fullText += chunk
        streamingContent.value = fullText
      }

      const assistantMsg = {
        id: uid('msg'),
        conversationId: convId,
        role: 'assistant',
        content: fullText,
        timestamp: now(),
        mode: 'normal'
      }
      await db.messages.add(assistantMsg)
      messages.value.push(assistantMsg)
      await db.conversations.update(convId, { updatedAt: now() })
    } catch (e) {
      logger.error('Chat failed', { message: e.message, stack: e.stack })
      throw e
    } finally {
      isStreaming.value = false
      streamingContent.value = ''
    }
  }

  async function clearMessages() {
    const id = currentConversationId.value
    if (!id) return
    await db.messages.where('conversationId').equals(id).delete()
    messages.value = []
    logger.info('Messages cleared', { conversationId: id })
  }

  return {
    currentConversationId, messages, isStreaming, streamingContent,
    ensureConversation, loadMessages, sendMessage, clearMessages
  }
})
