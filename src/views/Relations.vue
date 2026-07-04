<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  useRelationsStore,
  RELATION_TYPES,
  SENTIMENT_TYPES
} from '../stores/relations'
import { logger } from '../services/logger'

const router = useRouter()
const relationsStore = useRelationsStore()

// ============ 搜索 ============
const searchQuery = ref('')
const filteredList = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return relationsStore.relations
  return relationsStore.relations.filter((r) => {
    if (r.name.toLowerCase().includes(q)) return true
    if (r.note && r.note.toLowerCase().includes(q)) return true
    if (r.tags && r.tags.some((t) => t.toLowerCase().includes(q))) return true
    return false
  })
})

// 按关系类型分组显示（对搜索结果分组）
const groupedFiltered = computed(() => {
  const groups = {}
  for (const t of RELATION_TYPES) groups[t.value] = []
  for (const item of filteredList.value) {
    const key = groups[item.relation] ? item.relation : 'other'
    groups[key].push(item)
  }
  return groups
})

function getRelationLabel(v) {
  return RELATION_TYPES.find((t) => t.value === v)?.label || '其他'
}
function getSentimentMeta(v) {
  return SENTIMENT_TYPES.find((s) => s.value === v) || SENTIMENT_TYPES[1]
}

// ============ 编辑弹窗 ============
const editing = ref(false)
const editingId = ref(null)
const isNew = computed(() => editingId.value === null)

const form = reactive({
  name: '',
  relation: 'family',
  sentiment: 'normal',
  note: '',
  tags: []
})

const tagInput = ref('')

function resetForm() {
  form.name = ''
  form.relation = 'family'
  form.sentiment = 'normal'
  form.note = ''
  form.tags = []
  tagInput.value = ''
}

function openAdd() {
  editingId.value = null
  resetForm()
  editing.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.name = item.name
  form.relation = item.relation
  form.sentiment = item.sentiment
  form.note = item.note || ''
  form.tags = [...(item.tags || [])]
  tagInput.value = ''
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  editingId.value = null
}

function addTag() {
  const v = tagInput.value.trim()
  if (!v) return
  if (!form.tags.includes(v)) form.tags.push(v)
  tagInput.value = ''
}
function removeTag(index) {
  form.tags.splice(index, 1)
}

async function save() {
  try {
    if (isNew.value) {
      await relationsStore.addRelation({
        name: form.name,
        relation: form.relation,
        sentiment: form.sentiment,
        note: form.note,
        tags: form.tags
      })
    } else {
      await relationsStore.updateRelation(editingId.value, {
        name: form.name,
        relation: form.relation,
        sentiment: form.sentiment,
        note: form.note,
        tags: form.tags
      })
    }
    editing.value = false
    editingId.value = null
  } catch (e) {
    alert(e.message || '保存失败')
  }
}

async function remove(item) {
  if (!confirm(`删除「${item.name}」？此操作不可撤销。`)) return
  try {
    await relationsStore.deleteRelation(item.id)
  } catch (e) {
    alert(e.message || '删除失败')
  }
}

// ============ 生命周期 ============
onMounted(async () => {
  try {
    if (!relationsStore.isLoaded) await relationsStore.load()
  } catch (e) {
    logger.error('[Relations] 加载失败', { message: e.message })
    alert('加载关系库失败：' + (e.message || '未知错误'))
  }
})

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<template>
  <div class="relations-page">
    <header class="page-header">
      <button class="btn-icon" @click="goBack" aria-label="返回">←</button>
      <h1>关系库</h1>
      <button class="btn-primary" @click="openAdd">＋ 新增</button>
    </header>

    <div class="privacy-note">
      🔒 所有关系资料仅保存在本设备。AI 对话中提到时，会帮你记住这些人。
    </div>

    <!-- 搜索 -->
    <div class="search-bar">
      <input
        v-model="searchQuery"
        type="search"
        placeholder="搜索名字 / 备注 / 标签"
        maxlength="30"
      />
      <span class="count">共 {{ relationsStore.count }} 位</span>
    </div>

    <!-- 空状态 -->
    <div v-if="!relationsStore.count" class="empty-big">
      <div class="empty-emoji">(・ω・)ﾉ</div>
      <div class="empty-text">
        还没有添加关系。<br />
        添加"我妈"、"最好的朋友小明"或者"我家猫咪"，<br />
        AI 就能在你吐槽时对号入座。
      </div>
      <button class="btn-primary" @click="openAdd">添加第一个</button>
    </div>

    <!-- 搜索无结果 -->
    <div
      v-else-if="filteredList.length === 0"
      class="empty"
    >
      没有匹配的结果
    </div>

    <!-- 分组列表 -->
    <template v-else>
      <section
        v-for="type in RELATION_TYPES"
        :key="type.value"
        class="section"
      >
        <template v-if="groupedFiltered[type.value].length">
          <h2 class="section-title">
            {{ type.label }}
            <span class="section-count">{{ groupedFiltered[type.value].length }}</span>
          </h2>
          <div
            v-for="item in groupedFiltered[type.value]"
            :key="item.id"
            class="rel-card"
          >
            <div class="rel-main">
              <div class="rel-name-row">
                <span class="rel-name">{{ item.name }}</span>
                <span
                  class="sentiment-dot"
                  :style="{ background: getSentimentMeta(item.sentiment).color }"
                  :title="getSentimentMeta(item.sentiment).label"
                ></span>
                <span class="sentiment-label">
                  {{ getSentimentMeta(item.sentiment).label }}
                </span>
              </div>
              <div v-if="item.note" class="rel-note">{{ item.note }}</div>
              <div v-if="item.tags && item.tags.length" class="rel-tags">
                <span v-for="(tag, i) in item.tags" :key="i" class="tag-mini">
                  #{{ tag }}
                </span>
              </div>
            </div>
            <div class="rel-actions">
              <button class="btn-ghost" @click="openEdit(item)">编辑</button>
              <button class="btn-ghost btn-danger" @click="remove(item)">删除</button>
            </div>
          </div>
        </template>
      </section>
    </template>

    <!-- 编辑弹窗 -->
    <div v-if="editing" class="modal-overlay" @click.self="cancelEdit">
      <div class="modal" role="dialog" aria-modal="true">
        <h2 class="modal-title">{{ isNew ? '添加关系' : '编辑关系' }}</h2>

        <label class="field">
          <span class="field-label">名字 / 称呼 <span class="required">*</span></span>
          <input
            v-model="form.name"
            placeholder="例如：我妈 / 小明 / 咪咪"
            maxlength="30"
          />
        </label>

        <label class="field">
          <span class="field-label">关系类型</span>
          <select v-model="form.relation">
            <option
              v-for="t in RELATION_TYPES"
              :key="t.value"
              :value="t.value"
            >
              {{ t.label }}
            </option>
          </select>
        </label>

        <div class="field">
          <span class="field-label">亲密度 / 关系状态</span>
          <div class="segmented">
            <button
              v-for="s in SENTIMENT_TYPES"
              :key="s.value"
              type="button"
              class="seg-btn"
              :class="{ 'is-selected': form.sentiment === s.value }"
              :style="form.sentiment === s.value ? { borderColor: s.color, color: s.color } : {}"
              @click="form.sentiment = s.value"
            >
              <span class="seg-dot" :style="{ background: s.color }"></span>
              {{ s.label }}
            </button>
          </div>
        </div>

        <label class="field">
          <span class="field-label">备注</span>
          <textarea
            v-model="form.note"
            rows="4"
            placeholder="性格特点、共同回忆、忌讳话题……AI 会用这些来更懂 TA"
            maxlength="500"
          ></textarea>
        </label>

        <div class="field">
          <span class="field-label">标签</span>
          <div v-if="form.tags.length" class="tag-list">
            <span v-for="(tag, i) in form.tags" :key="i" class="tag">
              {{ tag }}
              <button class="tag-remove" @click="removeTag(i)" aria-label="移除">×</button>
            </span>
          </div>
          <div class="tag-input-row">
            <input
              v-model="tagInput"
              placeholder="回车添加，例如：北京 / 大学同学 / 爱撸猫"
              maxlength="20"
              @keydown.enter.prevent="addTag"
            />
            <button class="btn-ghost btn-small" type="button" @click="addTag">添加</button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-ghost" @click="cancelEdit">取消</button>
          <button class="btn-primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.relations-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
  color: var(--text-primary);
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.page-header h1 {
  flex: 1;
  font-size: 20px;
  margin: 0;
  text-align: center;
}

.privacy-note {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  margin-bottom: 16px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.search-bar input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
}
.search-bar input:focus {
  outline: none;
  border-color: var(--accent);
}
.count {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.empty {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border-radius: 12px;
  font-size: 14px;
}
.empty-big {
  text-align: center;
  padding: 48px 24px;
}
.empty-emoji {
  font-size: 32px;
  margin-bottom: 16px;
  color: var(--text-primary);
}
.empty-text {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.8;
  margin-bottom: 20px;
}

.section {
  margin-bottom: 24px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 10px;
  font-weight: 500;
}
.section-count {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--border);
  color: var(--text-secondary);
  border-radius: 999px;
}

.rel-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 10px;
}
.rel-main {
  flex: 1;
  min-width: 0;
}
.rel-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.rel-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
}
.sentiment-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sentiment-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.rel-note {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}
.rel-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.tag-mini {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
}

.rel-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

/* Segmented button（亲密度选择） */
.segmented {
  display: flex;
  gap: 8px;
}
.seg-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  font-family: inherit;
}
.seg-btn.is-selected {
  background: var(--bg-primary);
  border-width: 1.5px;
  font-weight: 600;
}
.seg-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* Modal */
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
.required {
  color: var(--accent);
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
  min-height: 90px;
  line-height: 1.6;
}
.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--accent);
}

/* 标签 */
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-primary);
}
.tag-remove {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
  font-family: inherit;
}
.tag-remove:hover {
  color: var(--accent);
}
.tag-input-row {
  display: flex;
  gap: 8px;
}
.tag-input-row input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
}
.tag-input-row input:focus {
  outline: none;
  border-color: var(--accent);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}

/* 按钮体系（对齐 Personas.vue） */
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
.btn-danger {
  color: #e64545;
  border-color: #e64545;
}
.btn-small {
  padding: 4px 10px;
  font-size: 12px;
}
.btn-ghost:hover {
  background: var(--border);
}
</style>
