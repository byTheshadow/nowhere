import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/nowhere/',
  plugins: [vue()],
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
