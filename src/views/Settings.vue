<template>
  <div class="settings">
    <header class="topbar">
      <router-link to="/" class="icon-btn" aria-label="返回">←</router-link>
      <div class="title">设置</div>
      <div class="placeholder"></div>
    </header>

    <main class="content">
      <section class="card">
        <h2>外观</h2>
        <div class="row">
          <label>主题</label>
          <select :value="settings.theme" @change="onThemeChange">
            <option value="auto">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
      </section>

      <section class="card">
        <h2>调试</h2>
        <div class="row">
          <label>错误日志</label>
          <div class="actions">
            <button @click="refresh">刷新</button>
            <button @click="triggerError">触发测试错误</button>
            <button @click="clear">清空</button>
          </div>
        </div>

        <div class="log-viewer" v-if="logs.length">
          <div
            v-for="log in logs"
            :key="log.id"
            class="log-entry"
            :class="`log-${log.level.toLowerCase()}`"
          >
            <div class="log-head">
              <span class="log-level">{{ log.level }}</span>
              <span class="log-time">{{ formatTime(log.timestamp) }}</span>
            </div>
            <div class="log-message">{{ log.message }}</div>
            <details v-if="hasMeta(log.meta)" class="log-meta">
              <summary>展开详情</summary>
              <pre>{{ JSON.stringify(log.meta, null, 2) }}</pre>
            </details>
          </div>
        </div>
        <div class="empty" v-else>暂无日志</div>
      </section>

      <section class="card">
        <h2>关于</h2>
        <div class="row">
          <label>版本</label>
          <span class="value">v0.0.2</span>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { logger } from '../services/logger'

const settings = useSettingsStore()
const logs = ref([])

async function refresh() {
  logs.value = await logger.list({ limit: 100 })
}

async function clear() {
  await logger.clear()
  await refresh()
}

function triggerError() {
  // 故意抛错，测试全局错误捕获
  setTimeout(() => {
    throw new Error('这是一个测试错误 - Test error from Settings')
  }, 0)
  // 稍等一下再刷新
  setTimeout(refresh, 300)
}

function onThemeChange(e) {
  settings.set('theme', e.target.value)
}

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function hasMeta(meta) {
  if (!meta) return false
  if (typeof meta === 'object' && Object.keys(meta).length === 0) return false
  return true
}

onMounted(refresh)
</script>

<style scoped>
.settings {
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
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}

.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.card h2 {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 14px;
  letter-spacing: 0.5px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.row:last-child { margin-bottom: 0; }

.row label {
  font-size: 14px;
  color: var(--text-primary);
}

.row .value {
  font-size: 14px;
  color: var(--text-secondary);
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

button, select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
button:hover {
  border-color: var(--accent);
}

.log-viewer {
  margin-top: 12px;
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
}

.log-entry {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
}
.log-entry:last-child { border-bottom: none; }

.log-head {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 4px;
}

.log-level {
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  letter-spacing: 0.5px;
}
.log-error .log-level { background: #fee; color: #c00; }
.log-warn  .log-level { background: #fef3d0; color: #a67c00; }
.log-info  .log-level { background: #e6f4ff; color: #0070c9; }
.log-debug .log-level { background: var(--border); color: var(--text-secondary); }

.log-time {
  color: var(--text-secondary);
  font-size: 11px;
}

.log-message {
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.5;
}

.log-meta {
  margin-top: 6px;
  color: var(--text-secondary);
}
.log-meta summary {
  cursor: pointer;
  font-size: 11px;
}
.log-meta pre {
  margin-top: 6px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
  overflow-x: auto;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.empty {
  margin-top: 12px;
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px dashed var(--border);
}
</style>
