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
        <div
          v-for="msg in chat.messages"
          :key="msg.id"
          class="bubble"
          :class="`bubble-${msg.role}`"
        >
          <div class="bubble-content">{{ msg.content }}</div>
        </div>
        <div
          v-if="chat.isStreaming"
          class="bubble bubble-assistant streaming"
        >
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import { useAIStore } from '../stores/ai'
import { useConversationsStore } from '../stores/conversations'
import { usePersonasStore } from '../stores/personas'
import { logger } from '../services/logger'
import ChatSidebar from '../components/ChatSidebar.vue'
import PersonaPicker from '../components/PersonaPicker.vue'

const chat = useChatStore()
const ai = useAIStore()
const convStore = useConversationsStore()
const personas = usePersonasStore()

const input = ref('')
const error = ref('')
const stageRef = ref(null)
const textareaRef = ref(null)
const sidebarOpen = ref(false)
const pickerOpen = ref(false)

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
.bubble-user {
  align-self: flex-end;
  background: var(--accent);
  color: white;
  border-bottom-right-radius: 4px;
}
.bubble-assistant {
  align-self: flex-start;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-bottom-left-radius: 4px;
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
