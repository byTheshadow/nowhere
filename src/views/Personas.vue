<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePersonasStore } from '../stores/personas'
import { logger } from '../services/logger'

const router = useRouter()
const personas = usePersonasStore()

const kaomojiLib = ref(null)
const styleOptions = computed(() => {
  if (!kaomojiLib.value) return []
  return Object.entries(kaomojiLib.value.styles).map(([key, val]) => ({
    key,
    label: val.label,
    description: val.description,
    idle: val.kaomoji?.idle || '(・_・)'
  }))
})

async function loadKaomojiLib() {
  try {
    const url = `${import.meta.env.BASE_URL}knowledge/kaomoji-library.json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    kaomojiLib.value = await res.json()
  } catch (e) {
    logger.error('[Personas] 加载颜文字库失败', { message: e.message })
  }
}

onMounted(async () => {
  await Promise.all([
    personas.isLoaded ? Promise.resolve() : personas.load(),
    loadKaomojiLib()
  ])
})

const editing = ref(false)
const editingId = ref(null)
const isNew = computed(() => editingId.value === null)

const form = reactive({
  name: '',
  avatar: '',
  kaomojiStyle: 'baymax',
  description: '',
  systemPrompt: ''
})

function openAdd() {
  editingId.value = null
  form.name = ''
  form.avatar = kaomojiLib.value?.styles?.baymax?.kaomoji?.idle || '(◕‿◕)'
  form.kaomojiStyle = 'baymax'
  form.description = ''
  form.systemPrompt = ''
  editing.value = true
}

function openEdit(p) {
  editingId.value = p.id
  form.name = p.name
  form.avatar = p.avatar
  form.kaomojiStyle = p.kaomojiStyle
  form.description = p.description || ''
  form.systemPrompt = p.systemPrompt
  editing.value = true
}

function onStyleChange() {
  const opt = styleOptions.value.find((s) => s.key === form.kaomojiStyle)
  if (opt) form.avatar = opt.idle
}

function cancelEdit() {
  editing.value = false
  editingId.value = null
}

async function save() {
  try {
    if (isNew.value) {
      await personas.addCustom({
        name: form.name,
        avatar: form.avatar,
        kaomojiStyle: form.kaomojiStyle,
        description: form.description,
        systemPrompt: form.systemPrompt
      })
    } else {
      await personas.updatePersona(editingId.value, {
        name: form.name,
        avatar: form.avatar,
        kaomojiStyle: form.kaomojiStyle,
        description: form.description,
        systemPrompt: form.systemPrompt
      })
    }
    editing.value = false
    editingId.value = null
  } catch (e) {
    alert(e.message || '保存失败')
  }
}

async function activate(id) {
  try {
    await personas.setActive(id)
  } catch (e) {
    alert(e.message || '切换失败')
  }
}

async function resetPreset(p) {
  if (!confirm(`将「${p.name}」恢复为出厂设置吗？你对它的所有修改会丢失。`)) return
  try {
    await personas.resetPreset(p.id)
  } catch (e) {
    alert(e.message || '恢复失败')
  }
}

async function removeCustom(p) {
  if (!confirm(`删除人设「${p.name}」？此操作不可撤销。`)) return
  try {
    await personas.deletePersona(p.id)
  } catch (e) {
    alert(e.message || '删除失败')
  }
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<template>
  <div class="personas-page">
    <header class="page-header">
      <button class="btn-icon" @click="goBack" aria-label="返回">←</button>
      <h1>AI 人设</h1>
      <button class="btn-primary" @click="openAdd">＋ 新增</button>
    </header>

    <section class="section">
      <h2 class="section-title">预设人设</h2>
      <div v-if="!personas.presetPersonas.length" class="empty">加载中…</div>
      <div
        v-for="p in personas.presetPersonas"
        :key="p.id"
        class="persona-card"
        :class="{ 'is-active': p.isActive }"
      >
        <div class="avatar">{{ p.avatar }}</div>
        <div class="info">
          <div class="name-row">
            <span class="name">{{ p.name }}</span>
            <span v-if="p.isActive" class="badge">当前</span>
          </div>
          <div class="desc">{{ p.description }}</div>
        </div>
        <div class="actions">
          <button v-if="!p.isActive" class="btn-ghost" @click="activate(p.id)">启用</button>
          <button class="btn-ghost" @click="openEdit(p)">编辑</button>
          <button class="btn-ghost btn-warn" @click="resetPreset(p)">恢复默认</button>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">自定义人设</h2>
      <div v-if="!personas.customPersonas.length" class="empty">
        还没有自定义人设，点上方「＋ 新增」创建一个专属于你的陪伴。
      </div>
      <div
        v-for="p in personas.customPersonas"
        :key="p.id"
        class="persona-card"
        :class="{ 'is-active': p.isActive }"
      >
        <div class="avatar">{{ p.avatar }}</div>
        <div class="info">
          <div class="name-row">
            <span class="name">{{ p.name }}</span>
            <span v-if="p.isActive" class="badge">当前</span>
          </div>
          <div class="desc">{{ p.description || '（无简介）' }}</div>
        </div>
        <div class="actions">
          <button v-if="!p.isActive" class="btn-ghost" @click="activate(p.id)">启用</button>
          <button class="btn-ghost" @click="openEdit(p)">编辑</button>
          <button class="btn-ghost btn-danger" @click="removeCustom(p)">删除</button>
        </div>
      </div>
    </section>

    <div v-if="editing" class="modal-overlay" @click.self="cancelEdit">
      <div class="modal" role="dialog" aria-modal="true">
        <h2 class="modal-title">{{ isNew ? '新增自定义人设' : '编辑人设' }}</h2>

        <label class="field">
          <span class="field-label">名字</span>
          <input v-model="form.name" placeholder="例如：温柔小熊" maxlength="20" />
        </label>

        <label class="field">
          <span class="field-label">颜文字风格</span>
          <select v-model="form.kaomojiStyle" @change="onStyleChange">
            <option
              v-for="s in styleOptions"
              :key="s.key"
              :value="s.key"
            >
              {{ s.label }} — {{ s.description }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">头像颜文字</span>
          <input v-model="form.avatar" placeholder="(◕‿◕)" maxlength="30" />
          <span class="field-hint">切换风格会自动填入该风格的默认表情，你也可以自己改</span>
        </label>

        <label class="field">
          <span class="field-label">简介</span>
          <input v-model="form.description" placeholder="一句话描述这个人设" maxlength="60" />
        </label>

        <label class="field">
          <span class="field-label">System Prompt（性格设定）</span>
          <textarea
            v-model="form.systemPrompt"
            rows="10"
            placeholder="描述这个人设的性格、说话风格、陪伴原则……"
          ></textarea>
          <span class="field-hint">
            提示：情绪标签规则会随消息发送时自动追加，你不需要自己写。
          </span>
        </label>

        <div class="modal-actions">
          <button class="btn-ghost" @click="cancelEdit">取消</button>
          <button class="btn-primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.personas-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
  color: var(--text-primary);
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.page-header h1 {
  flex: 1;
  font-size: 20px;
  margin: 0;
  text-align: center;
}

.section {
  margin-bottom: 32px;
}
.section-title {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 12px;
  font-weight: 500;
}

.empty {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border-radius: 12px;
  font-size: 14px;
}

.persona-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 12px;
  transition: border-color 0.2s;
}
.persona-card.is-active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.avatar {
  font-size: 24px;
  min-width: 72px;
  text-align: center;
  line-height: 1;
  white-space: nowrap;
  color: var(--text-primary);
}

.info {
  flex: 1;
  min-width: 0;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
}
.badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--accent);
  color: #fff;
  border-radius: 4px;
}
.desc {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.btn-primary,
.btn-ghost,
.btn-icon {
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.4;
  font-family: inherit;
}
.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.btn-icon {
  padding: 6px 10px;
  font-size: 16px;
}
.btn-warn {
  color: #d48806;
}
.btn-danger {
  color: #e64545;
  border-color: #e64545;
}
.btn-ghost:hover {
  background: var(--border);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.modal {
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}
.modal-title {
  margin: 0 0 20px;
  font-size: 18px;
}

.field {
  display: block;
  margin-bottom: 16px;
}
.field-label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  box-sizing: border-box;
}
.field textarea {
  resize: vertical;
  min-height: 120px;
  line-height: 1.6;
}
.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.field-hint {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}
</style>
