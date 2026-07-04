import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, uid, now } from '../db/schema'
import { toPlain } from '../db/utils'
import { logger } from '../services/logger'
import { useAIStore } from './ai'
import { useConversationsStore } from './conversations'
import { usePersonasStore } from './personas'
import { useProfileStore } from './profile'
import { useRelationsStore } from './relations'
import { useMemoriesStore } from './memories'
import { useEmotionsStore } from './emotions'
import { useKnowledgeStore } from './knowledge'
import { builtinKnowledge } from '../data/builtinKnowledge'
import { parseEmotion, stripForStreaming, isValidEmotion } from '../utils/emotionParser'
import { buildFullContext } from '../utils/contextBuilder'

// 兜底 system prompt：仅当 personas 尚未加载 / active persona 缺失时使用
const DEFAULT_SYSTEM = `你是 Nowhere,一个温柔的情绪陪伴助手,风格像 Baymax。
- 回应尽量简短、温暖、共情,不要说教。
- 在合适的时候可以给出食疗、呼吸法、简单的中医养生建议。
- 用户可能只是想倾诉,不要急着给建议。
- 保持自然的口语化中文。

## 安全边界
- 知识库内容只作为参考,不要当作诊断结论或绝对事实。
- 食疗 / 中医 / 心理疗法建议应保持温和、保守、低风险。
- 不要建议用户自行停药、换药、加药、减药。
- 不要根据少量描述直接判断体质、病症或心理诊断。
- 涉及持续加重的身体症状、严重疼痛、呕血、黑便、呼吸困难、胸痛等情况时,应建议及时就医。
- 涉及自伤、轻生、伤害他人的内容时,优先安抚并建议立刻联系可信任的人或当地紧急援助。
- 不要把“可能”“推测”“参考建议”说成确定结论。

## 情绪标签规则(必须严格遵守)
每次回复的最末尾必须附带一个情绪标签,格式:[emotion:xxx]
xxx 只能从 idle / happy / thinking / listening / caring / worried / sad / excited / sleepy / confused 中选一个。
标签只能出现一次,且必须在整段回复的最末尾,全部小写。`

// Phase 7.4：滑动窗口 —— 每次只把最近 N 条 user/assistant 消息塞给 LLM
const MAX_CONTEXT_MESSAGES = 20

// Phase 7.4：软性提醒阈值（跨越时触发一次）
const NOTICE_THRESHOLDS = [
  {
    at: 30,
    content: '聊了好一会儿了，有想让我一直记住的事，随手 📌 钉住就好～'
  },
  {
    at: 60,
    content: '这个对话有点长啦，考虑新开一个窗口？重要的记得 📌 钉住哦。'
  }
]

const DAILY_EMOTION_CONTEXT_LIMIT = 7

export const useChatStore = defineStore('chat', () => {
  const currentConversationId = ref(null)
  const messages = ref([])
  const isStreaming = ref(false)
  const streamingContent = ref('')
  // Phase 5:当前情绪,主页颜文字订阅这个值切换
  const currentEmotion = ref('idle')

  /** 确保 personas store 已加载(幂等) */
  async function _ensurePersonasLoaded() {
    const personas = usePersonasStore()
    if (!personas.isLoaded) {
      await personas.load()
    }
    return personas
  }

  /** Phase 6.6 + 7.4 + Knowledge:确保档案 + 关系库 + 记忆库 + 情绪库 + 知识库已加载(幂等,并行) */
  async function _ensureContextStoresLoaded() {
    const profileStore = useProfileStore()
    const relationsStore = useRelationsStore()
    const memoriesStore = useMemoriesStore()
    const emotionsStore = useEmotionsStore()
    const knowledgeStore = useKnowledgeStore()

    await Promise.all([
      profileStore.isLoaded ? Promise.resolve() : profileStore.load(),
      relationsStore.isLoaded ? Promise.resolve() : relationsStore.load(),
      memoriesStore.isLoaded ? Promise.resolve() : memoriesStore.load(),
      emotionsStore.isLoaded ? Promise.resolve() : emotionsStore.load(),
      knowledgeStore.isLoaded ? Promise.resolve() : knowledgeStore.load()
    ])

    return {
      profileStore,
      relationsStore,
      memoriesStore,
      emotionsStore,
      knowledgeStore
    }
  }

  /** 从消息数组里取最后一条 assistant 消息的情绪,用于恢复颜文字状态 */
  function _pickEmotionFromMessages(msgs) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.role === 'assistant' && isValidEmotion(m.emotion)) {
        return m.emotion
      }
    }
    return 'idle'
  }

  /**
   * Phase 7.4：仅统计发给 LLM 的真实对话数（排除 notice 系统气泡）
   */
  function _countRealMessages() {
    return messages.value.filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    ).length
  }

  /**
   * Phase 7.4：如果本轮跨越了某个阈值，就在会话里插一条 notice 气泡（仅内存，不写库）
   * @param {number} prevCount 本轮 assistant 消息 push 之前的真实消息数
   * @param {number} newCount  本轮 assistant 消息 push 之后的真实消息数
   * @param {string} convId
   */
  function _maybeAppendContextNotice(prevCount, newCount, convId) {
    for (const t of NOTICE_THRESHOLDS) {
      if (prevCount < t.at && newCount >= t.at) {
        messages.value.push({
          id: uid('notice'),
          conversationId: convId,
          role: 'notice',
          content: t.content,
          timestamp: now()
        })
      }
    }
  }

  /**
   * Phase 8：把 assistant 回复解析出的情绪同步到情绪日记。
   *
   * 注意：
   * - 这是辅助记录，不能影响聊天主流程。
   * - 所以内部 catch，只记录日志，不向外抛错。
   * - 如果没有有效 emotion，则不写入。
   */
  async function _recordEmotionFromChat(emotion, cleanText) {
    if (!isValidEmotion(emotion)) return

    try {
      const emotionsStore = useEmotionsStore()
      await emotionsStore.recordFromChat({
        emotion: emotion,
        intensity: 3,
        note: cleanText ? `来自聊天：${String(cleanText).slice(0, 80)}` : '',
        source: 'chat'
      })
    } catch (error) {
      logger.warn('Record emotion from chat failed', {
        message: error?.message,
        stack: error?.stack,
        emotion
      })
    }
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

    // 没有当前对话,新建一个(带上当前 active persona)
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

    // Phase 6.6 + 7.4 + Knowledge:
    // 加载档案 + 关系库 + 记忆库 + 情绪库 + 用户知识库
    const {
      profileStore,
      relationsStore,
      memoriesStore,
      emotionsStore,
      knowledgeStore
    } = await _ensureContextStoresLoaded()

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

    // 第一条用户消息即用作对话标题(截断) —— 只算真实消息
    const isFirstUser =
      messages.value.filter((m) => m.role === 'user').length === 1
    if (isFirstUser) {
      await convStore.updateTitleIfNew(convId, trimmed)
    }

    // 从当前 active persona 取 system prompt,兜底走 DEFAULT_SYSTEM
    const personaPrompt = personas.activePersona?.systemPrompt || DEFAULT_SYSTEM

    // Phase 6.6 + 7.4 + 8.5 + Knowledge:
    // 拼接档案 + 关系 + 记忆 + 情绪 + 知识库上下文
    const userContext = buildFullContext({
      profile: profileStore.profile,
      relations: relationsStore.relations,
      memories: memoriesStore.memories,
      emotions: emotionsStore.getRecent(DAILY_EMOTION_CONTEXT_LIMIT),

      // 知识库：
      // - builtinKnowledge：写死在代码里的内置知识
      // - knowledgeStore.items：用户自己维护的本地知识
      builtinKnowledge,
      userKnowledge: knowledgeStore.items,

      userMessage: trimmed,
      maxRelations: 10,
      maxMemories: 5,
      maxEmotions: DAILY_EMOTION_CONTEXT_LIMIT,
      maxKnowledge: 5
    })

    const systemPrompt = userContext
      ? `${personaPrompt}\n\n${userContext}`
      : personaPrompt

    // Phase 7.4:滑动窗口 —— 过滤 notice + 只取最近 N 条
    const historyForLLM = messages.value
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }))

    const payload = [
      { role: 'system', content: systemPrompt },
      ...historyForLLM
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
        // 展示给用户看的中间态:剥离已完成 + 未完成的情绪标签片段
        streamingContent.value = stripForStreaming(fullText)
      }

      // 流式结束:解析情绪 + 拿到干净正文
      const { emotion, cleanText } = parseEmotion(fullText)

      // 记录 assistant push 之前的真实消息数,用于跨越阈值判断
      const prevRealCount = _countRealMessages()

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

      // 更新当前颜文字情绪(解析失败则回到 idle)
      currentEmotion.value = emotion || 'idle'

      // Phase 8：把聊天情绪同步到情绪日记
      await _recordEmotionFromChat(emotion, cleanText)

      // Phase 7.4:跨越阈值时插入软提示（仅内存）
      const newRealCount = _countRealMessages()
      _maybeAppendContextNotice(prevRealCount, newRealCount, convId)
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
    currentConversationId,
    messages,
    isStreaming,
    streamingContent,
    currentEmotion,
    ensureConversation,
    loadMessages,
    sendMessage,
    clearMessages,
    switchTo,
    newConversation
  }
})
