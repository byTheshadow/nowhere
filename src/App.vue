<template>
  <div class="app">
    <main class="stage">
      <div class="kaomoji">{{ kaomoji }}</div>
      <p class="greeting">你好，我在这里。</p>
      <p class="subtitle">Nowhere is now-here.</p>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const kaomoji = ref('(˶ˆᗜˆ˵)')
</script>

<style scoped>
.app {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.stage {
  text-align: center;
}

.kaomoji {
  font-size: clamp(64px, 16vw, 128px);
  line-height: 1.2;
  color: var(--text-primary);
  animation: breathe 4s ease-in-out infinite;
  user-select: none;
}

.greeting {
  margin-top: 32px;
  font-size: 18px;
  color: var(--text-primary);
  opacity: 0.85;
}

.subtitle {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}

@keyframes breathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50%      { transform: translateY(-6px) scale(1.02); }
}
</style>
