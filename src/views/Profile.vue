<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProfileStore } from '../stores/profile'
import { logger } from '../services/logger'

const router = useRouter()
const profileStore = useProfileStore()

// 中医体质九分法
const CONSTITUTION_OPTIONS = [
  '平和', '气虚', '阳虚', '阴虚',
  '痰湿', '湿热', '血瘀', '气郁', '特禀'
]

const GENDER_OPTIONS = [
  { value: 'female', label: '女' },
  { value: 'male', label: '男' },
  { value: 'other', label: '其他' }
]

// ============ 本地表单副本 ============
const form = reactive({
  gender: '',
  age: null,
  city: '',
  constitution: '',
  medications: [],
  supplements: [],
  allergies: [],
  dietaryRestrictions: [],
  goals: ''
})

// 标签输入的临时值
const allergyInput = ref('')
const dietInput = ref('')

// 状态
const showPrivacyNotice = ref(false)
const isSaving = ref(false)

function syncFormFromStore() {
  const p = profileStore.profile
  form.gender = p.gender || ''
  form.age = p.age ?? null
  form.city = p.city || ''
  form.constitution = p.constitution || ''
  form.medications = (p.medications || []).map((m) => ({ ...m }))
  form.supplements = (p.supplements || []).map((s) => ({ ...s }))
  form.allergies = [...(p.allergies || [])]
  form.dietaryRestrictions = [...(p.dietaryRestrictions || [])]
  form.goals = p.goals || ''
}

onMounted(async () => {
  try {
    await profileStore.load()
    syncFormFromStore()
    if (!profileStore.hasProfile) {
      showPrivacyNotice.value = true
    }
  } catch (e) {
    logger.error('[Profile] 加载失败', { message: e.message })
    alert('加载档案失败：' + (e.message || '未知错误'))
  }
})

// ============ 结构化列表操作 ============
function addMedication() {
  form.medications.push({ name: '', dosage: '', frequency: '', note: '' })
}
function removeMedication(index) {
  form.medications.splice(index, 1)
}
function addSupplement() {
  form.supplements.push({ name: '', dosage: '', frequency: '', note: '' })
}
function removeSupplement(index) {
  form.supplements.splice(index, 1)
}

// ============ 标签输入 ============
function addAllergy() {
  const v = allergyInput.value.trim()
  if (!v) return
  if (!form.allergies.includes(v)) form.allergies.push(v)
  allergyInput.value = ''
}
function removeAllergy(index) {
  form.allergies.splice(index, 1)
}
function addDiet() {
  const v = dietInput.value.trim()
  if (!v) return
  if (!form.dietaryRestrictions.includes(v)) form.dietaryRestrictions.push(v)
  dietInput.value = ''
}
function removeDiet(index) {
  form.dietaryRestrictions.splice(index, 1)
}

// ============ 保存 / 重置 ============
async function save() {
  if (isSaving.value) return
  isSaving.value = true
  try {
    // 清洗结构化列表：过滤名字为空的行，其他字段 trim
    const cleanedMeds = form.medications
      .filter((m) => m.name?.trim())
      .map((m) => ({
        name: m.name.trim(),
        dosage: (m.dosage || '').trim(),
        frequency: (m.frequency || '').trim(),
        note: (m.note || '').trim()
      }))
    const cleanedSupps = form.supplements
      .filter((s) => s.name?.trim())
      .map((s) => ({
        name: s.name.trim(),
        dosage: (s.dosage || '').trim(),
        frequency: (s.frequency || '').trim(),
        note: (s.note || '').trim()
      }))

    await profileStore.save({
      gender: form.gender,
      age: form.age === '' || form.age == null ? null : Number(form.age),
      city: form.city.trim(),
      constitution: form.constitution,
      medications: cleanedMeds,
      supplements: cleanedSupps,
      allergies: [...form.allergies],
      dietaryRestrictions: [...form.dietaryRestrictions],
      goals: form.goals.trim()
    })
    // 同步一次以拿到清洗后的数据
    syncFormFromStore()
    showPrivacyNotice.value = false
    alert('已保存')
  } catch (e) {
    alert(e.message || '保存失败')
  } finally {
    isSaving.value = false
  }
}

async function reset() {
  if (!confirm('确定清空所有档案信息吗？此操作不可撤销。')) return
  try {
    await profileStore.reset()
    syncFormFromStore()
    showPrivacyNotice.value = true
  } catch (e) {
    alert(e.message || '清空失败')
  }
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<template>
  <div class="profile-page">
    <header class="page-header">
      <button class="btn-icon" @click="goBack" aria-label="返回">←</button>
      <h1>我的档案</h1>
      <button
        class="btn-primary"
        :disabled="isSaving"
        @click="save"
      >
        {{ isSaving ? '保存中…' : '保存' }}
      </button>
    </header>

    <div v-if="showPrivacyNotice" class="notice">
      <div class="notice-title">🔒 隐私说明</div>
      <div class="notice-body">
        你在这里填写的所有信息都<strong>只保存在本设备</strong>，
        不会上传到任何服务器。AI 对话时才会读取，帮它更懂你。
      </div>
      <button class="btn-ghost btn-small" @click="showPrivacyNotice = false">
        我知道了
      </button>
    </div>

    <!-- 基本信息 -->
    <section class="section">
      <h2 class="section-title">基本信息</h2>
      <div class="card">
        <label class="field">
          <span class="field-label">性别</span>
          <select v-model="form.gender">
            <option value="">未填写</option>
            <option v-for="g in GENDER_OPTIONS" :key="g.value" :value="g.value">
              {{ g.label }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">年龄</span>
          <input
            v-model.number="form.age"
            type="number"
            min="0"
            max="150"
            placeholder="选填"
          />
        </label>

        <label class="field">
          <span class="field-label">所在城市</span>
          <input
            v-model="form.city"
            placeholder="用于天气关怀，例如：北京"
            maxlength="30"
          />
        </label>

        <label class="field">
          <span class="field-label">中医体质</span>
          <select v-model="form.constitution">
            <option value="">未测 / 不清楚</option>
            <option v-for="c in CONSTITUTION_OPTIONS" :key="c" :value="c">
              {{ c }}质
            </option>
          </select>
          <span class="field-hint">中医体质九分法，不清楚可以先空着</span>
        </label>
      </div>
    </section>

    <!-- 长期用药 -->
    <section class="section">
      <div class="section-head">
        <h2 class="section-title">长期用药</h2>
        <button class="btn-ghost btn-small" @click="addMedication">＋ 添加</button>
      </div>
      <div v-if="!form.medications.length" class="empty">还没有添加用药记录</div>
      <div
        v-for="(m, i) in form.medications"
        :key="i"
        class="card struct-item"
      >
        <div class="struct-grid">
          <label class="field">
            <span class="field-label">名字 <span class="required">*</span></span>
            <input v-model="m.name" placeholder="例如：氨氯地平" maxlength="40" />
          </label>
          <label class="field">
            <span class="field-label">剂量</span>
            <input v-model="m.dosage" placeholder="例如：5mg" maxlength="30" />
          </label>
          <label class="field">
            <span class="field-label">频次</span>
            <input v-model="m.frequency" placeholder="例如：每日一次 早" maxlength="30" />
          </label>
          <label class="field field-full">
            <span class="field-label">备注</span>
            <input v-model="m.note" placeholder="选填" maxlength="80" />
          </label>
        </div>
        <button class="btn-ghost btn-danger btn-small" @click="removeMedication(i)">
          删除此条
        </button>
      </div>
    </section>

    <!-- 保健品 -->
    <section class="section">
      <div class="section-head">
        <h2 class="section-title">保健品</h2>
        <button class="btn-ghost btn-small" @click="addSupplement">＋ 添加</button>
      </div>
      <div v-if="!form.supplements.length" class="empty">还没有添加保健品</div>
      <div
        v-for="(s, i) in form.supplements"
        :key="i"
        class="card struct-item"
      >
        <div class="struct-grid">
          <label class="field">
            <span class="field-label">名字 <span class="required">*</span></span>
            <input v-model="s.name" placeholder="例如：维生素 D" maxlength="40" />
          </label>
          <label class="field">
            <span class="field-label">剂量</span>
            <input v-model="s.dosage" placeholder="例如：1000 IU" maxlength="30" />
          </label>
          <label class="field">
            <span class="field-label">频次</span>
            <input v-model="s.frequency" placeholder="例如：每日一次" maxlength="30" />
          </label>
          <label class="field field-full">
            <span class="field-label">备注</span>
            <input v-model="s.note" placeholder="选填" maxlength="80" />
          </label>
        </div>
        <button class="btn-ghost btn-danger btn-small" @click="removeSupplement(i)">
          删除此条
        </button>
      </div>
    </section>

    <!-- 过敏项 -->
    <section class="section">
      <h2 class="section-title">过敏项</h2>
      <div class="card">
        <div v-if="form.allergies.length" class="tag-list">
          <span v-for="(t, i) in form.allergies" :key="i" class="tag">
            {{ t }}
            <button class="tag-remove" @click="removeAllergy(i)" aria-label="移除">×</button>
          </span>
        </div>
        <div class="tag-input-row">
          <input
            v-model="allergyInput"
            placeholder="输入过敏项后回车"
            maxlength="30"
            @keydown.enter.prevent="addAllergy"
          />
          <button class="btn-ghost btn-small" @click="addAllergy">添加</button>
        </div>
      </div>
    </section>

    <!-- 忌口 -->
    <section class="section">
      <h2 class="section-title">忌口</h2>
      <div class="card">
        <div v-if="form.dietaryRestrictions.length" class="tag-list">
          <span v-for="(t, i) in form.dietaryRestrictions" :key="i" class="tag">
            {{ t }}
            <button class="tag-remove" @click="removeDiet(i)" aria-label="移除">×</button>
          </span>
        </div>
        <div class="tag-input-row">
          <input
            v-model="dietInput"
            placeholder="例如：辛辣 / 生冷 / 海鲜"
            maxlength="30"
            @keydown.enter.prevent="addDiet"
          />
          <button class="btn-ghost btn-small" @click="addDiet">添加</button>
        </div>
      </div>
    </section>

    <!-- 想改善的方向 -->
    <section class="section">
      <h2 class="section-title">想改善的方向</h2>
      <div class="card">
        <label class="field">
          <textarea
            v-model="form.goals"
            rows="4"
            placeholder="比如：想改善睡眠、缓解焦虑、增强体力……"
            maxlength="500"
          ></textarea>
        </label>
      </div>
    </section>

    <!-- 危险操作 -->
    <section class="section danger-section">
      <button class="btn-ghost btn-danger" @click="reset">清空全部档案</button>
    </section>
  </div>
</template>

<style scoped>
.profile-page {
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

.notice {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 20px;
}
.notice-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-primary);
}
.notice-body {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 10px;
}

.section {
  margin-bottom: 24px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-title {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 12px;
  font-weight: 500;
}
.section-head .section-title {
  margin-bottom: 0;
}

.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.empty {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px dashed var(--border);
  border-radius: 12px;
  font-size: 13px;
}

.struct-item {
  position: relative;
}
.struct-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.field-full {
  grid-column: 1 / -1;
}

.field {
  display: block;
  margin-bottom: 12px;
}
.field:last-child {
  margin-bottom: 0;
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
  background: var(--bg-primary);
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
.field-hint {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* 标签输入 */
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
  background: var(--bg-primary);
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
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
}
.tag-input-row input:focus {
  outline: none;
  border-color: var(--accent);
}

.danger-section {
  text-align: center;
  margin-top: 40px;
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
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

@media (max-width: 480px) {
  .struct-grid {
    grid-template-columns: 1fr;
  }
}
</style>
