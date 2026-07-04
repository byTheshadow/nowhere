import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, uid, now } from '../db/schema'
import { toPlain } from '../db/utils'
import { logger } from '../services/logger'
import { useAIStore } from './ai'
import { useConversationsStore } from './conversations'
import { usePersonasStore } from './personas'
import { parseEmotion, stripForStreaming, isValidEmotion } from '../utils/emotionParser'

// 兜底 system prompt：仅当 personas 尚未加载 / active persona 缺失时使用
const DEFAULT_SYSTEM = `你是 Nowhere，一个温柔的情绪陪伴助手，风格像 Baymax。
- 回应尽量简短、温暖、共情，不要说教。
- 在合适的时候可以给出食疗、呼吸法、简单的中医养生建议。
- 用户可能只是想倾诉，不要急着给建议。
- 保持自然的口语化中文。

## 情绪标签规则（必须严格遵守）
每次回复的最末尾必须附带一个情绪标签，格式：[emotion:xxx]
xxx 只能从 idle / happy / thinking / listening / caring / worried / sad / excited / sleepy / confused 中选一个。
标签只能出现一次，且必须在整段回复的最末尾，全部小写。`

export const useChatStore = defineStore('chat', () => {
  const currentConversationId = ref(null)
  const messages = ref([])
  const isStreaming = ref(false)
  const streamingContent = ref('')
  // Phase 5：当前情绪，主页颜文字订阅这个值切换
  const currentEmotion = ref('idle')

  /** 确保 personas store 已加载（幂等） */
  async function _ensurePersonasLoaded() {
    const personas = usePersonasStore()
    if (!personas.isLoaded) {
      await personas.load()
    }
    return personas
  }

  /** 从消息数组里取最后一条 assistant 消息的情绪，用于恢复颜文字状态 */
  function _pickEmotionFromMessages(msgs) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.role === 'assistant' && isValidEmotion(m.emotion)) {
        return m.emotion
      }
    }
    return 'idle'
  }

  async function ensureConversation() {
    const convStore = useConversationsStore()
    if (!convStore.currentId) await convStore.loadCurrentId()

    if (convStore.currentId) {
      const exists = await db.conversations.get(convStore.currentId)
      if (exists) {
        currentConversationId.value = convStore.currentId
        return convStore.currentId
      }
    }

    // 没有当前对话，新建一个（带上当前 active persona）
    const personas = await _ensurePersonasLoaded()
    const id = await convStore.create(personas.activePersona?.id || null)
    currentConversationId.value = id
    return id
  }

  async function switchTo(id) {
    const convStore = useConversationsStore()
    await convStore.setCurrent(id)
    currentConversationId.value = id
    await loadMessages()
  }

  async function newConversation() {
    const convStore = useConversationsStore()
    const personas = await _ensurePersonasLoaded()
    const id = await convStore.create(personas.activePersona?.id || null)
    currentConversationId.value = id
    messages.value = []
    currentEmotion.value = 'idle'
    return id
  }

  async function loadMessages() {
    const id = await ensureConversation()
    messages.value = await db.messages
      .where('conversationId').equals(id)
      .sortBy('timestamp')
    // 从最后一条 assistant 消息恢复颜文字情绪
    currentEmotion.value = _pickEmotionFromMessages(messages.value)
  }

  async function sendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed) return

    const ai = useAIStore()
    const convStore = useConversationsStore()
    const personas = await _ensurePersonasLoaded()

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
    await db.messages.add(toPlain(userMsg))
    messages.value.push(userMsg)

    // 第一条用户消息即用作对话标题（截断）
    const isFirstUser = messages.value.filter((m) => m.role === 'user').length === 1
    if (isFirstUser) {
      await convStore.updateTitleIfNew(convId, trimmed)
    }

    // 从当前 active persona 取 system prompt，兜底走 DEFAULT_SYSTEM
    const systemPrompt = personas.activePersona?.systemPrompt || DEFAULT_SYSTEM

    const payload = [
      { role: 'system', content: systemPrompt },
      ...messages.value.map((m) => ({ role: m.role, content: m.content }))
    ]

    isStreaming.value = true
    streamingContent.value = ''
    // 用户发送瞬间 → 思考中
    currentEmotion.value = 'thinking'

    let fullText = ''
    try {
      const adapter = ai.createChatAdapter()
      for await (const chunk of adapter.chatStream(payload, {
        temperature: ai.temperature
      })) {
        fullText += chunk
        // 展示给用户看的中间态：剥离已完成 + 未完成的情绪标签片段
        streamingContent.value = stripForStreaming(fullText)
      }

      // 流式结束：解析情绪 + 拿到干净正文
      const { emotion, cleanText } = parseEmotion(fullText)

      const assistantMsg = {
        id: uid('msg'),
        conversationId: convId,
        role: 'assistant',
        content: cleanText,
        emotion: emotion || null,
        timestamp: now(),
        mode: 'normal'
      }
      await db.messages.add(toPlain(assistantMsg))
      messages.value.push(assistantMsg)
      await db.conversations.update(convId, { updatedAt: now() })
      await convStore.loadAll()

      // 更新当前颜文字情绪（解析失败则回到 idle）
      currentEmotion.value = emotion || 'idle'
    } catch (e) {
      logger.error('Chat failed', { message: e.message, stack: e.stack })
      // 出错时颜文字回到担心态
      currentEmotion.value = 'worried'
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
    currentEmotion.value = 'idle'
    logger.info('Messages cleared', { conversationId: id })
  }

  return {
    currentConversationId, messages, isStreaming, streamingContent,
    currentEmotion,
    ensureConversation, loadMessages, sendMessage, clearMessages,
    switchTo, newConversation
  }
})
