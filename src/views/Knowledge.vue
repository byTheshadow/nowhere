<template>
  <div class="knowledge-page">
    <header class="topbar">
      <router-link to="/settings" class="icon-btn" aria-label="返回">←</router-link>
      <div class="title">我的知识库</div>
      <div class="placeholder"></div>
    </header>

    <main class="content">
      <section class="card">
        <div class="head">
          <div>
            <h2>用户自定义知识</h2>
            <p>记录你的个人经验、医嘱、偏好和安抚方式</p>
          </div>
          <button class="btn-primary" @click="openCreate">新增</button>
        </div>

        <div class="toolbar">
          <input
            v-model="query"
            type="text"
            placeholder="搜索标题、内容、标签"
          />
          <select v-model="typeFilter">
            <option value="">全部类型</option>
            <option value="diet">食疗</option>
            <option value="tcm">中医养生</option>
            <option value="mental">心理疏解</option>
            <option value="therapy">心理疗法</option>
            <option value="seasonal">节气时令</option>
            <option value="breathing">呼吸放松</option>
            <option value="sleep">睡眠调节</option>
            <option value="emergency">紧急安抚</option>
            <option value="custom">自定义</option>
          </select>
        </div>

        <div v-if="filteredItems.length" class="list">
          <article v-for="item in filteredItems" :key="item.id" class="item">
            <div class="item-head">
              <div class="item-title">{{ item.title || '未命名知识' }}</div>
              <div class="item-type">{{ typeLabel(item.type) }}</div>
            </div>

            <div class="item-content">{{ item.content }}</div>

            <div class="item-tags" v-if="item.tags && item.tags.length">
              <span v-for="tag in item.tags" :key="tag" class="tag">#{{ tag }}</span>
            </div>

            <div class="item-actions">
              <button @click="openEdit(item)">编辑</button>
              <button @click="removeItem(item.id)">删除</button>
            </div>
          </article>
        </div>

        <div v-else class="empty">
          暂无知识条目
        </div>
      </section>
    </main>

    <div v-if="editorVisible" class="modal-mask" @click.self="closeEditor">
      <div class="modal">
        <div class="modal-head">
          <h3>{{ editingId ? '编辑知识' : '新增知识' }}</h3>
          <button class="close-btn" @click="closeEditor">×</button>
        </div>

        <div class="form">
          <label>
            类型
            <select v-model="form.type">
              <option value="custom">自定义</option>
              <option value="diet">食疗</option>
              <option value="tcm">中医养生</option>
              <option value="mental">心理疏解</option>
              <option value="therapy">心理疗法</option>
              <option value="seasonal">节气时令</option>
              <option value="breathing">呼吸放松</option>
              <option value="sleep">睡眠调节</option>
              <option value="emergency">紧急安抚</option>
            </select>
          </label>

          <label>
            标题
            <input v-model.trim="form.title" type="text" placeholder="例如：我适合喝温水" />
          </label>

          <label>
            内容
            <textarea
              v-model.trim="form.content"
              rows="8"
              placeholder="输入你的知识内容"
            ></textarea>
          </label>

          <label>
            标签（用英文逗号分隔）
            <input v-model="tagsText" type="text" placeholder="胃, 饮食, 个人经验" />
          </label>
        </div>

        <div class="modal-actions">
          <button @click="closeEditor">取消</button>
          <button class="btn-primary" @click="saveItem">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useKnowledgeStore, USER_KNOWLEDGE_TYPES } from '../stores/knowledge'

const store = useKnowledgeStore()

const query = ref('')
const typeFilter = ref('')
const editorVisible = ref(false)
const editingId = ref('')

const form = reactive({
  type: 'custom',
  title: '',
  content: ''
})

const tagsText = ref('')

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase()
  return store.items.filter(item => {
    if (typeFilter.value && item.type !== typeFilter.value) return false
    if (!q) return true

    const text = [
      item.title,
      item.content,
      ...(item.tags || [])
    ]
      .join(' ')
      .toLowerCase()

    return text.includes(q)
  })
})

function typeLabel(type) {
  return USER_KNOWLEDGE_TYPES[type] || type || '自定义'
}

function resetForm() {
  form.type = 'custom'
  form.title = ''
  form.content = ''
  tagsText.value = ''
  editingId.value = ''
}

function openCreate() {
  resetForm()
  editorVisible.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.type = item.type || 'custom'
  form.title = item.title || ''
  form.content = item.content || ''
  tagsText.value = Array.isArray(item.tags) ? item.tags.join(', ') : ''
  editorVisible.value = true
}

function closeEditor() {
  editorVisible.value = false
}

async function saveItem() {
  const tags = tagsText.value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const payload = {
    type: form.type,
    title: form.title,
    content: form.content,
    tags
  }

  if (editingId.value) {
    await store.update(editingId.value, payload)
  } else {
    await store.add(payload)
  }

  await store.load()
  closeEditor()
}

async function removeItem(id) {
  if (!confirm('确定删除这条知识吗？')) return
  await store.remove(id)
}

onMounted(async () => {
  if (!store.isLoaded) await store.load()
})
</script>

<style scoped>
.knowledge-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.title {
  font-size: 16px;
  color: var(--text-primary);
}

.placeholder {
  width: 36px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 18px;
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
  padding: 20px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.head h2 {
  margin: 0 0 4px;
  font-size: 16px;
  color: var(--text-primary);
}

.head p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

input, select, textarea, button {
  font: inherit;
}

input, select, textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.toolbar input {
  flex: 1;
  min-width: 220px;
}

.toolbar select {
  width: 180px;
}

.list {
  display: grid;
  gap: 12px;
}

.item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  background: var(--bg-primary);
}

.item-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.item-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.item-type {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.item-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.item-tags {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
}

.item-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

button {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}

button:hover {
  border-color: var(--accent);
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--text-secondary);
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal {
  width: min(720px, 100%);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px;
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-head h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.form {
  display: grid;
  gap: 12px;
}

.form label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

textarea {
  resize: vertical;
  min-height: 160px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
