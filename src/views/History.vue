<template>
  <div class="page">
    <header class="topbar">
      <router-link to="/" class="icon-btn">←</router-link>
      <div class="title">对话历史</div>
      <button class="icon-btn" @click="toggleSelect">
        {{ selectMode ? '完成' : '选择' }}
      </button>
    </header>

    <div class="search-bar">
      <input v-model="query" type="text" placeholder="🔍 搜索对话..." />
    </div>

    <main class="content">
      <div v-if="selectMode && selected.size > 0" class="bulk-bar">
        <span>已选 {{ selected.size }} 项</span>
        <div class="bulk-actions">
          <button @click="selectAll">全选</button>
          <button class="danger" @click="onBulkDelete">删除</button>
        </div>
      </div>

      <div v-for="group in groups" :key="group.label" class="group">
        <div class="group-label">{{ group.label }}</div>
        <div
          v-for="c in group.items"
          :key="c.id"
          class="item"
          :class="{ active: c.id === convStore.currentId, selected: selected.has(c.id) }"
        >
          <label v-if="selectMode" class="checkbox">
            <input type="checkbox" :checked="selected.has(c.id)" @change="toggleOne(c.id)" />
          </label>

          <div class="item-body" @click="onOpen(c)">
            <div class="item-title">
              <span v-if="c.isPinned" class="pin-mark">📌</span>
              {{ c.title }}
            </div>
            <div class="item-preview">{{ c.preview || '空对话' }}</div>
            <div class="item-meta">
              {{ formatTime(c.updatedAt) }} · {{ c.messageCount }} 条消息
            </div>
          </div>

          <button
            v-if="!selectMode"
            class="menu-btn"
            @click.stop="openMenu(c)"
          >⋮</button>
        </div>
      </div>

      <div v-if="!filtered.length" class="empty">
        {{ query ? '没有找到匹配的对话' : '还没有对话' }}
      </div>
    </main>

    <!-- 操作菜单 -->
    <transition name="fade">
      <div v-if="menuTarget" class="menu-mask" @click="menuTarget = null">
        <div class="menu-sheet" @click.stop>
          <div class="menu-head">{{ menuTarget.title }}</div>
          <button @click="onPin">
            {{ menuTarget.isPinned ? '取消置顶' : '置顶' }}
          </button>
          <button @click="onRename">重命名</button>
          <button class="danger" @click="onDelete">删除</button>
          <button class="cancel" @click="menuTarget = null">取消</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConversationsStore } from '../stores/conversations'
import { useChatStore } from '../stores/chat'
import dayjs from '../utils/date'

const router = useRouter()
const convStore = useConversationsStore()
const chat = useChatStore()

const query = ref('')
const selectMode = ref(false)
const selected = ref(new Set())
const menuTarget = ref(null)

onMounted(() => {
  convStore.loadAll()
  convStore.loadCurrentId()
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return convStore.list
  return convStore.list.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.preview.toLowerCase().includes(q)
  )
})

const groups = computed(() => {
  const pinned = filtered.value.filter((c) => c.isPinned)
  const others = filtered.value.filter((c) => !c.isPinned)

  const today = dayjs().startOf('day')
  const yesterday = today.subtract(1, 'day')
  const weekAgo = today.subtract(7, 'day')

  const buckets = {
    today: [], yesterday: [], week: [], earlier: []
  }
  for (const c of others) {
    const d = dayjs(c.updatedAt)
    if (d.isAfter(today)) buckets.today.push(c)
    else if (d.isAfter(yesterday)) buckets.yesterday.push(c)
    else if (d.isAfter(weekAgo)) buckets.week.push(c)
    else buckets.earlier.push(c)
  }

  const g = []
  if (pinned.length) g.push({ label: '📌 置顶', items: pinned })
  if (buckets.today.length) g.push({ label: '今天', items: buckets.today })
  if (buckets.yesterday.length) g.push({ label: '昨天', items: buckets.yesterday })
  if (buckets.week.length) g.push({ label: '过去一周', items: buckets.week })
  if (buckets.earlier.length) g.push({ label: '更早', items: buckets.earlier })
  return g
})

function formatTime(ts) {
  const d = dayjs(ts)
  const now = dayjs()
  if (d.isSame(now, 'day')) return d.format('HH:mm')
  if (d.isSame(now, 'year')) return d.format('MM-DD HH:mm')
  return d.format('YYYY-MM-DD')
}

async function onOpen(c) {
  if (selectMode.value) {
    toggleOne(c.id)
    return
  }
  await convStore.setCurrent(c.id)
  await chat.loadMessages()
  router.push('/')
}

function toggleSelect() {
  selectMode.value = !selectMode.value
  selected.value = new Set()
}

function toggleOne(id) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}

function selectAll() {
  selected.value = new Set(filtered.value.map((c) => c.id))
}

async function onBulkDelete() {
  if (!confirm(`删除选中的 ${selected.value.size} 个对话？`)) return
  await convStore.removeMany([...selected.value])
  selected.value = new Set()
  selectMode.value = false
}

function openMenu(c) {
  menuTarget.value = c
}

async function onPin() {
  const id = menuTarget.value.id
  menuTarget.value = null
  await convStore.togglePin(id)
}

async function onRename() {
  const c = menuTarget.value
  menuTarget.value = null
  const name = prompt('新的对话名称', c.title)
  if (name !== null) {
    await convStore.rename(c.id, name)
  }
}

async function onDelete() {
  const c = menuTarget.value
  menuTarget.value = null
  if (!confirm(`删除对话「${c.title}」？此操作不可撤销。`)) return
  await convStore.remove(c.id)
  // 如果删的是当前对话，chat store 也要清空
  if (chat.currentConversationId === c.id) {
    chat.messages = []
    chat.currentConversationId = null
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh; min-height: 100dvh;
  display: flex; flex-direction: column;
}
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
}
.title { font-size: 16px; }
.icon-btn {
  min-width: 36px; height: 36px; border-radius: 18px;
  padding: 0 12px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-secondary); background: transparent; border: none;
  text-decoration: none; font-size: 15px; cursor: pointer;
}
.icon-btn:hover { background: var(--border); color: var(--text-primary); }

.search-bar {
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
}
.search-bar input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
}
.search-bar input:focus { outline: none; border-color: var(--accent); }

.content {
  flex: 1; overflow-y: auto;
  padding: 8px 0;
  max-width: 720px; margin: 0 auto; width: 100%;
}

.bulk-bar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.bulk-actions { display: flex; gap: 8px; }
.bulk-actions button {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  font-size: 13px; cursor: pointer;
  color: var(--text-primary);
  font-family: inherit;
}
.bulk-actions button.danger { color: #c00; border-color: rgba(200,0,0,0.3); }

.group-label {
  padding: 14px 20px 6px;
  font-size: 11px; letter-spacing: 1px;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.item {
  display: flex; align-items: stretch;
  padding: 10px 20px;
  border-left: 3px solid transparent;
  transition: background-color 0.15s;
  gap: 8px;
}
.item:hover { background: var(--border); }
.item.active { border-left-color: var(--accent); }
.item.selected { background: rgba(212, 163, 115, 0.08); }

.checkbox {
  display: flex; align-items: center;
  cursor: pointer;
}
.checkbox input { width: 18px; height: 18px; cursor: pointer; }

.item-body {
  flex: 1; min-width: 0;
  cursor: pointer;
}
.item-title {
  font-size: 14px; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 2px;
}
.pin-mark { font-size: 11px; margin-right: 4px; }
.item-preview {
  font-size: 12px; color: var(--text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 2px;
}
.item-meta {
  font-size: 11px; color: var(--text-secondary);
  opacity: 0.7;
}

.menu-btn {
  width: 32px; border: none; background: transparent;
  color: var(--text-secondary); font-size: 20px; cursor: pointer;
  border-radius: 6px;
}
.menu-btn:hover { background: var(--border); color: var(--text-primary); }

.empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.menu-mask {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: flex-end; justify-content: center;
}
.menu-sheet {
  width: 100%; max-width: 480px;
  background: var(--bg-secondary);
  border-radius: 16px 16px 0 0;
  padding: 8px;
  display: flex; flex-direction: column; gap: 4px;
}
.menu-head {
  padding: 14px 16px 8px;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.menu-sheet button {
  padding: 14px 16px;
  border: none; background: transparent;
  color: var(--text-primary);
  font-size: 15px; font-family: inherit;
  text-align: center; cursor: pointer;
  border-radius: 8px;
}
.menu-sheet button:hover { background: var(--border); }
.menu-sheet button.danger { color: #c00; }
.menu-sheet button.cancel {
  margin-top: 8px;
  background: var(--bg-primary);
  color: var(--text-secondary);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
