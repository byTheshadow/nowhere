<template>
  <div class="home">
    <header class="topbar">
      <div class="brand">nowhere</div>
      <router-link to="/settings" class="icon-btn" aria-label="设置">
        ⚙
      </router-link>
    </header>

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
.home {
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
}

.brand {
  font-size: 14px;
  letter-spacing: 2px;
  color: var(--text-secondary);
  text-transform: lowercase;
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
  transition: background-color 0.2s, color 0.2s;
}
.icon-btn:hover {
  background: var(--border);
  color: var(--text-primary);
}

.stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
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
