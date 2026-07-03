<template>
  <div class="page">
    <header class="topbar">
      <router-link to="/settings" class="icon-btn">←</router-link>
      <div class="title">AI 配置</div>
      <div class="placeholder"></div>
    </header>

    <main class="content">
      <section class="card">
        <h2>服务商</h2>
        <div class="row">
          <label>Provider</label>
          <select :value="ai.providerId" @change="onProviderChange">
            <option v-for="p in ai.PROVIDERS" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select>
        </div>

        <div class="row" v-if="ai.currentProvider?.editableBaseUrl">
          <label>Base URL</label>
          <input
            v-model="ai.baseUrl"
            type="text"
            :placeholder="ai.currentProvider?.baseUrl || 'https://...'"
          />
        </div>

        <div class="row">
          <label>API Key</label>
          <input
            v-model="ai.apiKey"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-..."
            autocomplete="off"
          />
          <button class="mini" @click="showKey = !showKey">
            {{ showKey ? '隐藏' : '显示' }}
          </button>
        </div>
      </section>

      <section class="card">
        <h2>模型</h2>
        <div class="row">
          <label>Model</label>
          <select v-model="ai.model" :disabled="!ai.availableModels.length">
            <option value="" disabled>
              {{ ai.availableModels.length ? '请选择模型' : '先获取模型列表' }}
            </option>
            <option v-for="m in ai.availableModels" :key="m.id" :value="m.id">
              {{ m.name }}
            </option>
          </select>
        </div>
        <div class="row">
          <span class="hint">共 {{ ai.availableModels.length }} 个模型</span>
          <button @click="onFetchModels" :disabled="!ai.apiKey || loading">
            {{ loading ? '获取中...' : '获取模型列表' }}
          </button>
        </div>
        <div v-if="fetchError" class="error">{{ fetchError }}</div>
      </section>

      <section class="card">
        <h2>参数</h2>
        <div class="row">
          <label>Temperature</label>
          <div class="slider-row">
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              v-model.number="ai.temperature"
            />
            <span class="value">{{ ai.temperature.toFixed(1) }}</span>
          </div>
        </div>
      </section>

      <div class="footer">
        <button class="primary" @click="onSave">保存配置</button>
        <span v-if="saved" class="saved">已保存 ✓</span>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAIStore } from '../stores/ai'
import { logger } from '../services/logger'

const ai = useAIStore()
const showKey = ref(false)
const loading = ref(false)
const fetchError = ref('')
const saved = ref(false)

onMounted(() => ai.load())

function onProviderChange(e) {
  ai.providerId = e.target.value
  ai.resetOnProviderChange()
}

async function onFetchModels() {
  loading.value = true
  fetchError.value = ''
  try {
    const models = await ai.fetchModels()
    if (models.length && !ai.model) ai.model = models[0].id
  } catch (e) {
    fetchError.value = e.message
    logger.error('Fetch models failed', { message: e.message })
  } finally {
    loading.value = false
  }
}

async function onSave() {
  await ai.save()
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}
</script>

<style scoped>
.page {
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
.title { font-size: 16px; }
.placeholder { width: 36px; }
.icon-btn {
  width: 36px; height: 36px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-secondary); text-decoration: none; font-size: 18px;
}
.icon-btn:hover { background: var(--border); color: var(--text-primary); }

.content {
  flex: 1; padding: 20px; max-width: 720px; margin: 0 auto; width: 100%;
}

.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}
.card h2 {
  font-size: 14px; font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 14px; letter-spacing: 0.5px;
}

.row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 12px; flex-wrap: wrap;
}
.row:last-child { margin-bottom: 0; }
.row label { font-size: 14px; color: var(--text-primary); min-width: 90px; }

input[type='text'], input[type='password'], select {
  flex: 1; min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
}
input:focus, select:focus { outline: none; border-color: var(--accent); }

button {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px; cursor: pointer; font-family: inherit;
  transition: border-color 0.2s;
}
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.mini { padding: 6px 10px; font-size: 12px; }
button.primary {
  background: var(--accent); color: white; border-color: var(--accent);
  padding: 10px 24px;
}
button.primary:hover:not(:disabled) { opacity: 0.9; }

.slider-row {
  display: flex; align-items: center; gap: 12px; flex: 1;
}
.slider-row input[type='range'] { flex: 1; }
.slider-row .value {
  min-width: 32px; text-align: right;
  font-size: 13px; color: var(--text-secondary);
  font-family: ui-monospace, monospace;
}

.hint { font-size: 12px; color: var(--text-secondary); }
.error {
  margin-top: 8px; padding: 10px 12px;
  background: rgba(255, 0, 0, 0.06);
  border: 1px solid rgba(255, 0, 0, 0.15);
  border-radius: 8px;
  font-size: 12px; color: #c00;
  word-break: break-all;
}

.footer {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 0 24px;
}
.saved { font-size: 13px; color: var(--accent); }
</style>
