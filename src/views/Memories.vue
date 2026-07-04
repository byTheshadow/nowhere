<template>
  <div class="memories-page">
    <header class="topbar">
      <router-link to="/settings" class="icon-btn" aria-label="返回">←</router-link>
      <div class="title-wrap">
        <div class="title">记忆</div>
        <div class="subtitle">{{ memories.count ? `${memories.count} 条长期记忆` : '还没有记忆' }}</div>
      </div>
      <button class="icon-btn" @click="openAddModal" title="新增记忆">＋</button>
    </header>

    <main class="content">
      <section class="card">
        <div class="search-row">
          <input
            v-model="query"
            type="text"
            class="search-input"
            placeholder="搜索内容 / 标签"
          />
          <button class="btn-ghost btn-small" @click="query = ''" :disabled="!query">清空</button>
        </div>

        <div class="filter-row">
          <button
            v-for="t in typeOptions"
            :key="t.value"
            class="filter-chip"
            :class="{ active: typeFilter === t.value }"
            @click="typeFilter = t.value"
          >
            {{ t.label }}
          </button>
        </div>
      </section>

      <section class="card" v-if="displayList.length">
        <div
          v-for="item in displayList"
          :key="item.id"
          class="memory-item"
        >
          <div class="memory-head">
            <div class="memory-meta">
              <span class="memory-type">{{ typeLabel(item.type) }}</span>
              <span class="memory-importance importance-{{ item.importance }}">
                {{ importanceLabel(item.importance) }}
              </span>
              <span v-if="item.source" class="memory-source">{{ sourceLabel(item.source) }}</span>
            </div>

            <div class="memory-actions">
              <button class="btn-ghost btn-small" @click="editMemory(item)">编辑</button>
              <button class="btn-danger btn-small" @click="removeMemory(item.id)">删除</button>
            </div>
          </div>

          <div class="memory-content">{{ item.content }}</div>

          <div v-if="item.tags && item.tags.length" class="memory-tags">
            <span v-for="tag in item.tags" :key="tag" class="tag">#{{ tag }}</span>
          </div>

          <div class="memory-footer">
            <span>创建于 {{ formatTime(item.createdAt) }}</span>
            <span v-if="item.updatedAt && item.updatedAt !== item.createdAt">
              更新于 {{ formatTime(item.updatedAt) }}
            </span>
          </div>
        </div>
      </section>

      <section class="card empty" v-else>
        <div>暂无匹配的记忆</div>
      </section>
    </main>

    <!-- 新增 / 编辑弹窗 -->
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingId ? '编辑记忆' : '新增记忆' }}</h3>
          <button class="icon-btn" @click="closeModal" title="关闭">✕</button>
        </div>

        <div class="modal-body">
          <label class="field">
            <span class="field-label">内容</span>
            <textarea v-model="form.content" rows="4" class="field-input" placeholder="记忆内容" />
          </label>

          <label class="field">
            <span class="field-label">类型</span>
            <select v-model="form.type" class="field-input">
              <option v-for="item in typeOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="field-label">重要度</span>
            <select v-model="form.importance" class="field-input">
              <option v-for="item in importanceOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="field-label">标签</span>
            <input v-model="form.tagsText" type="text" class="field-input" placeholder="例如：失眠, 饮食, 家人" />
            <span class="field-hint">用逗号分隔</span>
          </label>

          <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        </div>

        <div class="modal-footer">
          <button class="btn-ghost" @click="closeModal">取消</button>
          <button class="btn-primary" @click="saveMemory">{{ editingId ? '保存' : '新增' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMemoriesStore, MEMORY_TYPES, IMPORTANCE_LEVELS } from '../stores/memories'

const router = useRouter()
const memories = useMemoriesStore()

const query = ref('')
const typeFilter = ref('all')

const modalOpen = ref(false)
const modalError = ref('')
const editingId = ref(null)

const form = reactive({
  content: '',
  type: 'fact',
  importance: 1,
  tagsText: ''
})

const typeOptions = [{ value: 'all', label: '全部' }, ...MEMORY_TYPES]
const importanceOptions = IMPORTANCE_LEVELS

const displayList = computed(() => {
  let list = memories.memories

  const q = query.value.trim().toLowerCase()
  if (q) {
    list = list.filter((m) => {
      const content = String(m.content || '').toLowerCase()
      const tags = Array.isArray(m.tags) ? m.tags.join(' ').toLowerCase() : ''
      return content.includes(q) || tags.includes(q)
    })
  }

  if (typeFilter.value !== 'all') {
    list = list.filter((m) => m.type === typeFilter.value)
  }

  return list
})

function typeLabel(type) {
  return MEMORY_TYPES.find((t) => t.value === type)?.label || '事实'
}

function importanceLabel(v) {
  return IMPORTANCE_LEVELS.find((x) => x.value === Number(v))?.label || '一般'
}

function sourceLabel(v) {
  if (v === 'chat') return '来自聊天'
  if (v === 'manual') return '手动'
  return v
}

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function openAddModal() {
  editingId.value = null
  modalError.value = ''
  form.content = ''
  form.type = 'fact'
  form.importance = 1
  form.tagsText = ''
  modalOpen.value = true
}

function editMemory(item) {
  editingId.value = item.id
  modalError.value = ''
  form.content = item.content || ''
  form.type = item.type || 'fact'
  form.importance = Number(item.importance) || 1
  form.tagsText = Array.isArray(item.tags) ? item.tags.join(', ') : ''
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  modalError.value = ''
}

async function saveMemory() {
  const content = String(form.content || '').trim()
  if (!content) {
    modalError.value = '内容不能为空'
    return
  }

  const tags = String(form.tagsText || '')
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean)

  try {
    if (editingId.value) {
      await memories.updateMemory(editingId.value, {
        content,
        type: form.type,
        importance: Number(form.importance),
        tags
      })
    } else {
      await memories.addMemory({
        content,
        type: form.type,
        importance: Number(form.importance),
        tags,
        source: 'manual'
      })
    }
    closeModal()
  } catch (e) {
    modalError.value = e.message || '保存失败'
  }
}

async function removeMemory(id) {
  const ok = confirm('确定删除这条记忆吗？')
  if (!ok) return
  await memories.deleteMemory(id)
}

onMounted(async () => {
  if (!memories.isLoaded) await memories.load()
})
</script>

<style scoped>
.memories-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.title-wrap {
  flex: 1;
  min-width: 0;
  text-align: center;
}
.title {
  font-size: 16px;
  color: var(--text-primary);
}
.subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  text-decoration: none;
  font-size: 18px;
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--border);
  color: var(--text-primary);
}

.content {
  flex: 1;
  padding: 20px;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}

.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
}

.filter-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.filter-chip {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
}
.filter-chip.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.memory-item {
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.memory-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.memory-item:first-child {
  padding-top: 0;
}

.memory-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.memory-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.memory-type,
.memory-source {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
}

.memory-importance {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
}
.importance-1 {
  background: rgba(127, 127, 127, 0.08);
  color: var(--text-secondary);
}
.importance-2 {
  background: rgba(245, 166, 35, 0.12);
  color: #a86d00;
}
.importance-3 {
  background: rgba(230, 69, 69, 0.12);
  color: #c12b2b;
}

.memory-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.memory-content {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.memory-tags {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.tag {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
}

.memory-footer {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-secondary);
}

.empty {
  text-align: center;
  color: var(--text-secondary);
}

.btn-primary,
.btn-ghost,
.btn-danger,
.btn-small {
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}
.btn-primary {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
  padding: 8px 14px;
}
.btn-ghost {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  padding: 8px 14px;
}
.btn-danger {
  border: 1px solid #e64545;
  background: transparent;
  color: #e64545;
  padding: 8px 14px;
}
.btn-small {
  padding: 5px 10px;
  font-size: 12px;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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
  width: min(92vw, 560px);
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
</style>
