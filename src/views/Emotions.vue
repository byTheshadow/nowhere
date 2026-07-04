<template>
  <main class="emotions-page">
    <header class="page-header">
      <button class="btn-icon" type="button" aria-label="返回" @click="goBack">
        ←
      </button>

      <div>
        <h1>情绪日记</h1>
        <p>把今天的感受轻轻放在这里。</p>
      </div>
    </header>

    <section class="card">
      <div class="section-title">
        <div>
          <h2>今天的心情</h2>
          <p>{{ todayLabel }}</p>
        </div>

        <span class="today-badge" :class="{ empty: !todayEmotion }">
          {{ todayEmotion ? emotionLabel(todayEmotion.dominantEmotion) : '未记录' }}
        </span>
      </div>

      <form class="emotion-form" @submit.prevent="saveToday">
        <label class="field">
          <span class="field-label">主要情绪</span>
          <select v-model="form.dominantEmotion">
            <option
              v-for="option in emotionOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.icon }} {{ option.label }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">强度：{{ form.intensity }}</span>
          <input
            v-model.number="form.intensity"
            type="range"
            min="1"
            max="5"
            step="1"
          />
          <span class="field-hint">
            1 是很轻，5 是很强。没有标准答案，只记录此刻的真实感受。
          </span>
        </label>

        <label class="field">
          <span class="field-label">备注</span>
          <textarea
            v-model="form.note"
            rows="4"
            placeholder="可以写发生了什么，也可以只写一句：今天有点累。"
          ></textarea>
        </label>

        <div class="actions">
          <button class="btn-primary" type="submit" :disabled="isSaving">
            {{ isSaving ? '保存中…' : '保存今天' }}
          </button>

          <button
            class="btn-ghost"
            type="button"
            :disabled="isSaving"
            @click="resetForm"
          >
            重置
          </button>
        </div>

        <p v-if="message" class="form-message">
          {{ message }}
        </p>
      </form>
    </section>

    <section class="card">
      <div class="section-title">
        <div>
          <h2>最近 30 天</h2>
          <p>颜色越深，代表那天情绪强度越高。</p>
        </div>
      </div>

      <div class="heatmap" aria-label="最近 30 天情绪热力图">
        <button
          v-for="day in recentDays"
          :key="day.date"
          class="heat-cell"
          type="button"
          :class="[
            day.dominantEmotion ? `emotion-${day.dominantEmotion}` : 'empty',
            `level-${day.intensity || 0}`
          ]"
          :title="heatCellTitle(day)"
          @click="fillFromDate(day.date)"
        >
          <span class="sr-only">
            {{ heatCellTitle(day) }}
          </span>
        </button>
      </div>

      <div class="legend">
        <span>少</span>
        <span class="legend-cell level-1"></span>
        <span class="legend-cell level-2"></span>
        <span class="legend-cell level-3"></span>
        <span class="legend-cell level-4"></span>
        <span class="legend-cell level-5"></span>
        <span>多</span>
      </div>
    </section>

    <section class="card">
      <div class="section-title">
        <div>
          <h2>记录列表</h2>
          <p>你曾经认真照看过自己的证据。</p>
        </div>
      </div>

      <div v-if="isLoading" class="empty-state">
        正在加载情绪记录…
      </div>

      <div v-else-if="sortedEmotions.length === 0" class="empty-state">
        还没有情绪记录。先从今天开始吧。
      </div>

      <div v-else class="emotion-list">
        <article
          v-for="item in sortedEmotions"
          :key="item.date"
          class="emotion-item"
        >
          <div class="emotion-item-main">
            <div class="emotion-item-header">
              <strong>{{ formatDate(item.date) }}</strong>
              <span>{{ emotionIcon(item.dominantEmotion) }} {{ emotionLabel(item.dominantEmotion) }}</span>
            </div>

            <p v-if="item.note" class="emotion-note">
              {{ item.note }}
            </p>

            <p class="emotion-meta">
              强度 {{ item.intensity || 0 }}/5
              <span v-if="item.source"> · {{ sourceLabel(item.source) }}</span>
            </p>
          </div>

          <div class="emotion-item-actions">
            <button class="btn-ghost btn-small" type="button" @click="editItem(item)">
              编辑
            </button>

            <button
              class="btn-ghost btn-danger btn-small"
              type="button"
              @click="deleteItem(item)"
            >
              删除
            </button>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEmotionsStore } from '../stores/emotions'

const router = useRouter()
const emotionsStore = useEmotionsStore()

const isSaving = ref(false)
const message = ref('')

const form = reactive({
  date: todayKey(),
  dominantEmotion: 'neutral',
  intensity: 3,
  note: ''
})

const emotionOptions = [
  { value: 'happy', label: '开心', icon: '😊' },
  { value: 'calm', label: '平静', icon: '😌' },
  { value: 'sad', label: '难过', icon: '😢' },
  { value: 'anxious', label: '焦虑', icon: '😟' },
  { value: 'angry', label: '生气', icon: '😠' },
  { value: 'tired', label: '疲惫', icon: '😴' },
  { value: 'stressed', label: '压力大', icon: '😵‍💫' },
  { value: 'lonely', label: '孤独', icon: '🌧️' },
  { value: 'confused', label: '困惑', icon: '迷' },
  { value: 'neutral', label: '普通', icon: '🙂' }
]

const isLoading = computed(() => emotionsStore.isLoading)
const sortedEmotions = computed(() => emotionsStore.sortedEmotions)
const todayEmotion = computed(() => emotionsStore.todayEmotion)
const recentDays = computed(() => emotionsStore.getRecent(30))

const todayLabel = computed(() => {
  if (!todayEmotion.value) return '今天还没有记录。'

  return `已记录为「${emotionLabel(todayEmotion.value.dominantEmotion)}」，强度 ${
    todayEmotion.value.intensity || 0
  }/5。`
})

onMounted(async () => {
  await emotionsStore.load()
  fillTodayFromStore()
})

function pad2(value) {
  return String(value).padStart(2, '0')
}

function todayKey() {
  const date = new Date()
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatDate(dateText) {
  if (!dateText) return '未知日期'

  const parts = String(dateText).split('-')
  if (parts.length !== 3) return dateText

  return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`
}

function emotionIcon(value) {
  return emotionOptions.find((item) => item.value === value)?.icon || '🙂'
}

function emotionLabel(value) {
  return emotionOptions.find((item) => item.value === value)?.label || '普通'
}

function sourceLabel(value) {
  if (value === 'chat') return '来自聊天'
  if (value === 'manual') return '手动记录'
  return value
}

function heatCellTitle(day) {
  if (!day?.dominantEmotion) {
    return `${formatDate(day.date)}：未记录`
  }

  return `${formatDate(day.date)}：${emotionLabel(day.dominantEmotion)}，强度 ${
    day.intensity || 0
  }/5`
}

function fillTodayFromStore() {
  const item = todayEmotion.value

  form.date = todayKey()

  if (!item) {
    form.dominantEmotion = 'neutral'
    form.intensity = 3
    form.note = ''
    return
  }

  form.dominantEmotion = item.dominantEmotion || 'neutral'
  form.intensity = item.intensity || 3
  form.note = item.note || ''
}

function fillFromDate(date) {
  const item = emotionsStore.getByDate(date)

  form.date = date || todayKey()
  form.dominantEmotion = item?.dominantEmotion || 'neutral'
  form.intensity = item?.intensity || 3
  form.note = item?.note || ''

  message.value = item
    ? `已载入 ${formatDate(date)} 的记录。`
    : `正在为 ${formatDate(date)} 新建记录。`
}

function editItem(item) {
  if (!item) return

  form.date = item.date || todayKey()
  form.dominantEmotion = item.dominantEmotion || 'neutral'
  form.intensity = item.intensity || 3
  form.note = item.note || ''

  message.value = `已载入 ${formatDate(item.date)} 的记录。`
}

function resetForm() {
  fillTodayFromStore()
  message.value = ''
}

async function saveToday() {
  isSaving.value = true
  message.value = ''

  try {
    await emotionsStore.upsertDailyEmotion({
      date: form.date,
      dominantEmotion: form.dominantEmotion,
      intensity: form.intensity,
      note: form.note,
      source: 'manual'
    })

    message.value = '已保存。谢谢你认真看见了自己的感受。'
  } catch (error) {
    console.error('[emotions] save failed:', error)
    message.value = '保存失败，请稍后再试。'
  } finally {
    isSaving.value = false
  }
}

async function deleteItem(item) {
  if (!item) return

  const confirmed = window.confirm(`确定删除 ${formatDate(item.date)} 的情绪记录吗？`)
  if (!confirmed) return

  try {
    await emotionsStore.deleteEmotion(item.date)
    message.value = '已删除这条记录。'

    if (form.date === item.date) {
      resetForm()
    }
  } catch (error) {
    console.error('[emotions] delete failed:', error)
    message.value = '删除失败，请稍后再试。'
  }
}

function goBack() {
  router.back()
}
</script>

<style scoped>
.emotions-page {
  min-height: 100vh;
  padding: 20px;
  color: var(--text-primary);
  background: var(--bg-primary);
}

.page-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 18px;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
}

.page-header p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.card {
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--bg-secondary);
}

.section-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-title h2 {
  margin: 0;
  font-size: 18px;
}

.section-title p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.today-badge {
  flex: 0 0 auto;
  padding: 6px 10px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--accent);
  font-size: 12px;
}

.today-badge.empty {
  border-color: var(--border);
  color: var(--text-secondary);
}

.emotion-form {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 8px;
}

.field-label {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.field-hint {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

select,
textarea,
input[type='range'] {
  width: 100%;
}

select,
textarea {
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  color: var(--text-primary);
  background: var(--bg-primary);
  font: inherit;
}

textarea {
  resize: vertical;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.form-message {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.heatmap {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 8px;
}

.heat-cell {
  aspect-ratio: 1;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  cursor: pointer;
}

.heat-cell:hover {
  border-color: var(--accent);
}

.heat-cell.level-1 {
  opacity: 0.35;
}

.heat-cell.level-2 {
  opacity: 0.5;
}

.heat-cell.level-3 {
  opacity: 0.7;
}

.heat-cell.level-4 {
  opacity: 0.85;
}

.heat-cell.level-5 {
  opacity: 1;
}

.heat-cell.emotion-happy,
.heat-cell.emotion-calm,
.heat-cell.emotion-neutral {
  background: var(--accent);
}

.heat-cell.emotion-sad,
.heat-cell.emotion-lonely,
.heat-cell.emotion-tired {
  background: var(--text-secondary);
}

.heat-cell.emotion-anxious,
.heat-cell.emotion-angry,
.heat-cell.emotion-stressed,
.heat-cell.emotion-confused {
  background: var(--accent);
}

.heat-cell.empty {
  opacity: 0.28;
  background: var(--bg-primary);
}

.legend {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}

.legend-cell {
  width: 14px;
  height: 14px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--accent);
}

.legend-cell.level-1 {
  opacity: 0.35;
}

.legend-cell.level-2 {
  opacity: 0.5;
}

.legend-cell.level-3 {
  opacity: 0.7;
}

.legend-cell.level-4 {
  opacity: 0.85;
}

.legend-cell.level-5 {
  opacity: 1;
}

.empty-state {
  padding: 18px;
  border: 1px dashed var(--border);
  border-radius: 14px;
  color: var(--text-secondary);
  text-align: center;
  font-size: 14px;
  line-height: 1.6;
}

.emotion-list {
  display: grid;
  gap: 10px;
}

.emotion-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-primary);
}

.emotion-item-main {
  min-width: 0;
}

.emotion-item-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}

.emotion-note {
  margin: 8px 0 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.emotion-meta {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.emotion-item-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.sr-only {
  position: absolute;
  overflow: hidden;
  width: 1px;
  height: 1px;
  white-space: nowrap;
  clip: rect(0, 0, 0, 0);
}

@media (max-width: 640px) {
  .emotions-page {
    padding: 14px;
  }

  .section-title {
    display: grid;
  }

  .heatmap {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .emotion-item {
    display: grid;
  }

  .emotion-item-actions {
    justify-content: flex-end;
  }
}
</style>
