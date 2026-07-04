import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/Home.vue') },
  { path: '/settings', name: 'settings', component: () => import('../views/Settings.vue') },
  { path: '/ai', name: 'ai-settings', component: () => import('../views/AISettings.vue') },
  { path: '/history', name: 'history', component: () => import('../views/History.vue') },
  { path: '/personas', name: 'personas', component: () => import('../views/Personas.vue') },
  { path: '/profile', name: 'profile', component: () => import('../views/Profile.vue') },
  { path: '/relations', name: 'relations', component: () => import('../views/Relations.vue') },
  { path: '/memories', name: 'memories', component: () => import('../views/Memories.vue') }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})


