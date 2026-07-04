<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePersonasStore } from '../stores/personas'

const emit = defineEmits(['close'])

const router = useRouter()
const personas = usePersonasStore()

onMounted(async () => {
  if (!personas.isLoaded) await personas.load()
})

async function pick(id) {
  try {
    await personas.setActive(id)
    emit('close')
  } catch (e) {
    alert(e.message || '切换失败')
  }
}

function goManage() {
  emit('close')
  router.push('/personas')
}
</script>

<template>
  <div class="picker-overlay" @click.self="emit('close')">
    <div class="picker-panel" role="dialog" aria-modal="true">
      <div class="picker-header">
        <h3>切换人设</h3>
        <button class="btn-close" @click="emit('close')" aria-label="关闭">×</button>
      </div>

      <div class="picker-list">
        <button
          v-for="p in personas.personas"
          :key="p.id"
          class="picker-item"
          :class="{ active: p.isActive }"
          @click="pick(p.id)"
        >
          <span class="pi-avatar">{{ p.avatar }}</span>
          <span class="pi-info">
            <span class="pi-name">{{ p.name }}</span>
            <span class="pi-desc">{{ p.description || '（自定义）' }}</span>
          </span>
          <span v-if="p.isActive" class="pi-check">✓</span>
        </button>
      </div>

      <div class="picker-footer">
        <button class="btn-manage" @click="goManage">管理人设</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 900;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.picker-panel {
  width: 100%;
  max-width: 520px;
  max-height: 70vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 16px 16px 0 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.15);
  animation: slide-up 0.2s ease-out;
}

@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 12px;
  border-bottom: 1px solid var(--border);
}
.picker-header h3 {
  margin: 0;
  font-size: 15px;
  color: var(--text-primary);
}
.btn-close {
  border: none;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px 8px;
}

.picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  transition: background 0.15s;
}
.picker-item:hover {
  background: var(--border);
}
.picker-item.active {
  border-color: var(--accent);
  background: var(--bg-secondary);
}

.pi-avatar {
  font-size: 20px;
  min-width: 64px;
  text-align: center;
  line-height: 1;
  white-space: nowrap;
  color: var(--text-primary);
}
.pi-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pi-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
.pi-desc {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pi-check {
  color: var(--accent);
  font-weight: bold;
}

.picker-footer {
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: center;
}
.btn-manage {
  background: transparent;
  border: none;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  padding: 8px 16px;
  font-family: inherit;
}
</style>
