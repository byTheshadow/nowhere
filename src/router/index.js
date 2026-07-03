import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/Settings.vue')
  }
    {
    path: '/ai',
    name: 'ai-settings',
    component: () => import('../views/AISettings.vue')
  }

]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
