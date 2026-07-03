<template>
  <transition name="sidebar">
    <div v-if="open" class="sidebar-mask" @click="$emit('close')">
      <aside class="sidebar" @click.stop>
        <div class="sidebar-head">
          <span class="sidebar-title">对话</span>
          <button class="icon-btn" @click="onNew" title="新对话">+</button>
        </div>

        <div class="sidebar-list">
          <div v-if="pinned.length" class="group-label">📌 置顶</div>
          <button
            v-for="c in pinned"
            :key="c.id"
            class="conv-item"
            :class="{ active: c.id === convStore.currentId }"
            @click="onSelect(c.id)"
          >
            <div class="conv-title">{{ c.title }}</div>
            <div class="conv-preview">{{ c.preview || '空对话' }}</div>
          </button>

          <div class="group-label">最近</div>
          <button
            v-for="c in others"
            :key="c.id"
            class="conv-item"
            :class="{ active: c.id === convStore.currentId }"
            @click="onSelect(c.id)"
          >
            <div class="conv-title">{{ c.title }}</div>
            <div class="conv-preview">{{ c.preview || '空对话' }}</div>
          </button>

          <div v-if="!convStore.list.length" class="empty">
            还没有对话，点右上角 + 开始一段
          </div>
        </div>

        <div class="sidebar-foot">
          <router-link to="/history" class="foot-link" @click="$emit('close')">
            查看全部 →
          </router-link>
        </div>
      </aside>
    </div>
  </transition>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useConversationsStore } from '../stores/conversations'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close', 'select', 'new'])

const convStore = useConversationsStore()

const pinned = computed(() => convStore.list.filter((c) => c.isPinned))
const others = computed(() => convStore.list.filter((c) => !c.isPinned).slice(0, 20))

onMounted(() => convStore.loadAll())

function onSelect(id) {
  emit('select', id)
  emit('close')
}

function onNew() {
  emit('new')
  emit('close')
}
</script>

<style scoped>
.sidebar-mask {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
}
.sidebar {
  width: min(320px, 85vw);
  height: 100%;
  background: var(--bg-primary);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  box-shadow: 2px 0 20px rgba(0, 0, 0, 0.08);
}

.sidebar-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.sidebar-title {
  font-size: 14px; letter-spacing: 1px;
  color: var(--text-secondary);
}
.icon-btn {
  width: 32px; height: 32px; border-radius: 50%;
  border: none; background: transparent;
  color: var(--text-secondary); font-size: 20px;
  cursor: pointer;
}
.icon-btn:hover { background: var(--border); color: var(--text-primary); }

.sidebar-list {
  flex: 1; overflow-y: auto;
  padding: 8px 0;
}

.group-label {
  padding: 12px 20px 6px;
  font-size: 11px; letter-spacing: 1px;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.conv-item {
  display: block; width: 100%;
  text-align: left;
  padding: 10px 20px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background-color 0.15s, border-color 0.15s;
}
.conv-item:hover { background: var(--border); }
.conv-item.active {
  background: var(--bg-secondary);
  border-left-color: var(--accent);
}

.conv-title {
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 2px;
}
.conv-preview {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.sidebar-foot {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}
.foot-link {
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
}

.sidebar-enter-active, .sidebar-leave-active {
  transition: background-color 0.25s;
}
.sidebar-enter-active .sidebar,
.sidebar-leave-active .sidebar {
  transition: transform 0.25s ease-out;
}
.sidebar-enter-from, .sidebar-leave-to {
  background: rgba(0, 0, 0, 0);
}
.sidebar-enter-from .sidebar,
.sidebar-leave-to .sidebar {
  transform: translateX(-100%);
}
</style>
