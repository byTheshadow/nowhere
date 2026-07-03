import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { logger } from './services/logger'
import './styles/global.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 安装全局错误捕获
logger.install(app)

app.mount('#app')

logger.info('App mounted', { version: '0.0.2' })
