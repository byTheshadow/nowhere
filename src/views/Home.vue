<template>
  <div class="home">
    <header class="topbar">
      <button class="icon-btn" @click="sidebarOpen = true" title="对话列表">☰</button>
      <div class="brand-wrap">
        <div class="brand">nowhere</div>
        <button
          v-if="personas.activePersona"
          class="persona-chip"
          @click="pickerOpen = true"
          :title="`切换人设（当前：${personas.activePersona.name}）`"
        >
          <span class="chip-avatar">{{ personas.activePersona.avatar }}</span>
          <span class="chip-name">{{ personas.activePersona.name }}</span>
        </button>
      </div>
      <div class="actions">
        <button class="icon-btn" @click="onNewChat" title="新对话">+</button>
        <router-link to="/settings" class="icon-btn">⚙</router-link>
      </div>
    </header>

    <main class="stage" ref="stageRef">
      <Transition name="kaomoji-swap" mode="out-in">
        <div
          class="kaomoji"
          :class="{ thinking: chat.isStreaming }"
          :key="kaomoji"
        >
          {{ kaomoji }}
        </div>
      </Transition>

      <p class="greeting" v-if="!hasContent">{{ greeting }}</p>

      <div class="messages" v-else>
        <template v-for="msg in chat.messages" :key="msg.id">
          <!-- 系统提示：只在页面里展示，不进 LLM 上下文 -->
          <div
            v-if="msg.role === 'notice'"
            class="bubble bubble-notice"
          >
            <div class="bubble-content">{{ msg.content }}</div>
            <div class="bubble-tools">
              <button class="mini-btn mini-btn-ghost" @click="onNewChat">新建窗口</button>
            </div>
          </div>

          <!-- 普通用户 / 助手消息 -->
          <div
            v-else
            class="bubble"
            :class="`bubble-${msg.role}`"
          >
            <div class="bubble-head">
              <span class="bubble-role">
                {{ msg.role === 'user' ? '我' : 'Nowhere' }}
              </span>
              <button
                v-if="msg.role === 'user' || msg.role === 'assistant'"
                class="pin-btn"
                @click="openPinModal(msg)"
                title="记住这条内容"
              >
                📌 记住
              </button>
            </div>

            <div class="bubble-content">{{ msg.content }}</div>
          </div>
        </template>

        <div
          v-if="chat.isStreaming"
          class="bubble bubble-assistant streaming"
        >
          <div class="bubble-head">
            <span class="bubble-role">Nowhere</span>
          </div>
          <div class="bubble-content">
            {{ chat.streamingContent || '…' }}
            <span class="cursor" v-if="chat.streamingContent">▊</span>
          </div>
        </div>
      </div>

      <div v-if="error" class="error-bar">{{ error }}</div>
    </main>

    <footer class="composer">
      <textarea
        v-model="input"
        placeholder="慢慢说..."
        rows="1"
        @keydown="onKeydown"
        :disabled="chat.isStreaming"
        ref="textareaRef"
      />
      <button
        class="send-btn"
        @click="onSend"
        :disabled="!input.trim() || chat.isStreaming"
        aria-label="发送"
      >→</button>
    </footer>

    <ChatSidebar
      :open="sidebarOpen"
      @close="sidebarOpen = false"
      @select="onSelectConv"
      @new="onNewChat"
    />

    <PersonaPicker
      v-if="pickerOpen"
      @close="pickerOpen = false"
    />

    <!-- 钉住记忆弹窗 -->
    <div v-if="pinModalOpen" class="modal-overlay" @click.self="closePinModal">
      <div class="modal">
        <div class="modal-header">
          <h3>记住这条内容</h3>
          <button class="icon-btn" @click="closePinModal" title="关闭">✕</button>
        </div>

        <div class="modal-body">
          <label class="field">
            <span class="field-label">内容</span>
            <textarea
              v-model="pinForm.content"
              rows="4"
              class="field-input"
              placeholder="这条会保存到长期记忆里"
            />
          </label>

          <label class="field">
            <span class="field-label">类型</span>
            <select v-model="pinForm.type" class="field-input">
              <option v-for="item in memoryTypes" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="field-label">重要度</span>
            <select v-model="pinForm.importance" class="field-input">
              <option v-for="item in importanceLevels" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
            <span class="field-hint">1 = 一般，2 = 重要，3 = 核心</span>
          </label>

          <label class="field">
            <span class="field-label">标签</span>
            <input
              v-model="pinForm.tagsText"
              class="field-input"
              type="text"
              placeholder="例如：饮食, 失眠, 家人"
            />
            <span class="field-hint">用逗号分隔，可留空</span>
          </label>

          <div v-if="pinError" class="modal-error">{{ pinError }}</div>
        </div>

        <div class="modal-footer">
          <button class="btn-ghost" @click="closePinModal">取消</button>
          <button class="btn-primary" @click="savePin">保存到记忆</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import { useAIStore } from '../stores/ai'
import { useConversationsStore } from '../stores/conversations'
import { usePersonasStore } from '../stores/personas'
import { useMemoriesStore, MEMORY_TYPES, IMPORTANCE_LEVELS } from '../stores/memories'
import { logger } from '../services/logger'
import ChatSidebar from '../components/ChatSidebar.vue'
import PersonaPicker from '../components/PersonaPicker.vue'

const chat = useChatStore()
const ai = useAIStore()
const convStore = useConversationsStore()
const personas = usePersonasStore()
const memories = useMemoriesStore()

const input = ref('')
const error = ref('')
const stageRef = ref(null)
const textareaRef = ref(null)
const sidebarOpen = ref(false)
const pickerOpen = ref(false)

// 记忆钉住弹窗
const pinModalOpen = ref(false)
const pinError = ref('')
const pinSourceMsg = ref(null)
const pinForm = ref({
  content: '',
  type: 'fact',
  importance: 1,
  tagsText: ''
})

// 颜文字库：从 public/knowledge/kaomoji-library.json 拉取
const kaomojiLib = ref(null)

const DEFAULT_KAOMOJI = '(˶ˆᗜˆ˵)'

const hasContent = computed(
  () => chat.messages.length > 0 || chat.isStreaming
)

const greeting = computed(() => {
  if (!ai.isConfigured) {
    return '先去 ⚙ 里配置 AI，我们就可以开始聊了'
  }
  return '你好，我在这里。'
})

/**
 * 颜文字联动：根据当前人设风格 + 当前情绪查表
 * 优先级：thinking(流式中) → currentEmotion → idle → avatar → 默认
 */
const kaomoji = computed(() => {
  const persona = personas.activePersona
  const styleKey = persona?.kaomojiStyle
  const styleKaomoji = kaomojiLib.value?.styles?.[styleKey]?.kaomoji

  // 流式中优先显示 thinking
  const emotion = chat.isStreaming ? 'thinking' : (chat.currentEmotion || 'idle')

  if (styleKaomoji) {
    return (
      styleKaomoji[emotion] ||
      styleKaomoji.idle ||
      persona?.avatar ||
      DEFAULT_KAOMOJI
    )
  }
  return persona?.avatar || DEFAULT_KAOMOJI
})

async function loadKaomojiLib() {
  try {
    const url = `${import.meta.env.BASE_URL}knowledge/kaomoji-library.json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    kaomojiLib.value = await res.json()
  } catch (e) {
    logger.error('[Home] 加载颜文字库失败', { message: e.message })
  }
}

onMounted(async () => {
  await Promise.all([
    ai.load(),
    convStore.loadCurrentId(),
    personas.isLoaded ? Promise.resolve() : personas.load(),
    memories.isLoaded ? Promise.resolve() : memories.load(),
    loadKaomojiLib()
  ])
  await chat.loadMessages()
  scrollToBottom()
})

watch(
  () => [chat.messages.length, chat.streamingContent],
  () => scrollToBottom()
)

watch(input, () => {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
})

function scrollToBottom() {
  nextTick(() => {
    const el = stageRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    onSend()
  }
}

async function onSend() {
  const text = input.value.trim()
  if (!text || chat.isStreaming) return
  error.value = ''
  input.value = ''
  const el = textareaRef.value
  if (el) el.style.height = 'auto'
  try {
    await chat.sendMessage(text)
  } catch (e) {
    error.value = e.message
  }
}

async function onSelectConv(id) {
  await chat.switchTo(id)
  scrollToBottom()
}

async function onNewChat() {
  if (chat.isStreaming) return
  await chat.newConversation()
  error.value = ''
}

function openPinModal(msg) {
  pinError.value = ''
  pinSourceMsg.value = msg
  pinForm.value = {
    content: msg?.content || '',
    type: 'fact',
    importance: 1,
    tagsText: ''
  }
  pinModalOpen.value = true
}

function closePinModal() {
  pinModalOpen.value = false
  pinError.value = ''
  pinSourceMsg.value = null
}

async function savePin() {
  const source = pinSourceMsg.value
  if (!source) return

  const content = String(pinForm.value.content || '').trim()
  if (!content) {
    pinError.value = '内容不能为空'
    return
  }

  const tags = String(pinForm.value.tagsText || '')
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean)

  try {
    await memories.pinFromMessage({
      content,
      messageId: source.id,
      conversationId: source.conversationId,
      type: pinForm.value.type,
      importance: Number(pinForm.value.importance),
      tags
    })
    closePinModal()
  } catch (e) {
    pinError.value = e.message || '保存失败'
  }
}
</script>

<style scoped>
.home {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px;
  flex-shrink: 0;
  gap: 8px;
}

.brand-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.brand {
  font-size: 14px; letter-spacing: 2px;
  color: var(--text-secondary);
}

.persona-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 6px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  border-radius: 999px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
  max-width: 100%;
  transition: background-color 0.2s, color 0.2s, border-color 0.2s;
}
.persona-chip:hover {
  background: var(--border);
  color: var(--text-primary);
}
.chip-avatar {
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
.chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.actions { display: flex; gap: 4px; }

.icon-btn {
  width: 36px; height: 36px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-secondary); background: transparent; border: none;
  text-decoration: none; font-size: 18px; cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  flex-shrink: 0;
}
.icon-btn:hover {
  background: var(--border); color: var(--text-primary);
}

.stage {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.kaomoji {
  font-size: clamp(56px, 12vw, 96px);
  line-height: 1.2;
  color: var(--text-primary);
  animation: breathe 4s ease-in-out infinite;
  user-select: none;
  margin: 24px 0 16px;
  flex-shrink: 0;
  white-space: nowrap;
  text-align: center;
}
.kaomoji.thinking {
  animation: thinking 1.2s ease-in-out infinite;
}

/* 颜文字切换过渡（Transition 组件） */
.kaomoji-swap-enter-active,
.kaomoji-swap-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.kaomoji-swap-enter-from {
  opacity: 0;
  transform: translateY(-4px) scale(0.95);
}
.kaomoji-swap-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.95);
}

.greeting {
  margin-top: 16px;
  font-size: 15px;
  color: var(--text-secondary);
  text-align: center;
}

.messages {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 15px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  animation: fadeIn 0.3s ease-out;
}

.bubble-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 1.2;
}

.bubble-role {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.pin-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  border-radius: 999px;
  font-size: 12px;
  padding: 3px 8px;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s, border-color 0.2s;
  flex-shrink: 0;
}
.pin-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--accent);
}

.bubble-user {
  align-self: flex-end;
  background: var(--accent);
  color: white;
  border-bottom-right-radius: 4px;
}
.bubble-user .bubble-role,
.bubble-user .pin-btn {
  color: rgba(255, 255, 255, 0.9);
}
.bubble-user .pin-btn {
  border-color: rgba(255, 255, 255, 0.35);
}
.bubble-user .pin-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: white;
}

.bubble-assistant {
  align-self: flex-start;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-bottom-left-radius: 4px;
}

.bubble-notice {
  align-self: center;
  max-width: 90%;
  background: rgba(127, 127, 127, 0.08);
  border: 1px dashed var(--border);
  color: var(--text-secondary);
  border-radius: 14px;
}
.bubble-notice .bubble-content {
  font-size: 14px;
}
.bubble-tools {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.mini-btn {
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
}
.mini-btn:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}
.mini-btn-ghost {
  border-color: var(--border);
}

.cursor {
  display: inline-block;
  animation: blink 1s step-end infinite;
  color: var(--accent);
}

.error-bar {
  margin-top: 12px;
  padding: 10px 14px;
  background: rgba(255, 0, 0, 0.06);
  border: 1px solid rgba(255, 0, 0, 0.15);
  color: #c00;
  border-radius: 10px;
  font-size: 13px;
  max-width: 640px;
  width: 100%;
}

.composer {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-primary);
  flex-shrink: 0;
}
.composer textarea {
  flex: 1;
  resize: none;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 15px;
  font-family: inherit;
  line-height: 1.5;
  max-height: 200px;
  min-height: 40px;
}
.composer textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.send-btn {
  width: 40px; height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 20px;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.2s;
}
.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}

.modal {
  width: min(92vw, 520px);
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
}

.modal-header {
  border-bottom: 1px solid var(--border);
}
.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.modal-body {
  padding: 14px 16px 4px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.field-input {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
}
.field-input:focus {
  outline: none;
  border-color: var(--accent);
}

textarea.field-input {
  resize: vertical;
  min-height: 96px;
  line-height: 1.6;
}

.field-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-error {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 0, 0, 0.15);
  background: rgba(255, 0, 0, 0.06);
  color: #c00;
  font-size: 13px;
}

.modal-footer {
  border-top: 1px solid var(--border);
}

@keyframes breathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50%      { transform: translateY(-6px) scale(1.02); }
}
@keyframes thinking {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-3px); }
  75%      { transform: translateX(3px); }
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes blink {
  50% { opacity: 0; }
}
</style>

