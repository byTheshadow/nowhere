import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '../db/schema'
import { logger } from '../services/logger'
import { createAdapter, PROVIDERS, getProvider } from '../services/llm'

const CONFIG_KEY = 'aiConfig'

export const useAIStore = defineStore('ai', () => {
  const providerId = ref('openai')
  const apiKey = ref('')
  const baseUrl = ref('')
  const model = ref('')
  const temperature = ref(0.7)
  const availableModels = ref([])
  const loaded = ref(false)

  const currentProvider = computed(() => getProvider(providerId.value))
  const isConfigured = computed(() => !!apiKey.value && !!model.value)

  async function load() {
    if (loaded.value) return
    const row = await db.settings.get(CONFIG_KEY)
    if (row?.value) {
      const c = row.value
      providerId.value = c.providerId || 'openai'
      apiKey.value = c.apiKey || ''
      baseUrl.value = c.baseUrl || ''
      model.value = c.model || ''
      temperature.value = c.temperature ?? 0.7
      availableModels.value = c.availableModels || []
    }
    loaded.value = true
  }

    async function save() {
    // 转成纯对象，剥离 Vue 的响应式 Proxy
    const plain = JSON.parse(JSON.stringify({
      providerId: providerId.value,
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
      temperature: temperature.value,
      availableModels: availableModels.value
    }))
    await db.settings.put({ key: CONFIG_KEY, value: plain })
    logger.info('AI config saved', { providerId: providerId.value, model: model.value })
  }


  function getConfig() {
    return {
      providerId: providerId.value,
      apiKey: apiKey.value,
      baseUrl: baseUrl.value || currentProvider.value?.baseUrl,
      model: model.value,
      temperature: temperature.value
    }
  }

  async function fetchModels() {
    const adapter = createAdapter(getConfig())
    const models = await adapter.listModels()
    availableModels.value = models
    await save()
    logger.info('Models fetched', { count: models.length, providerId: providerId.value })
    return models
  }

  function createChatAdapter() {
    return createAdapter(getConfig())
  }

  function resetOnProviderChange() {
    baseUrl.value = ''
    availableModels.value = []
    model.value = ''
  }

  return {
    providerId, apiKey, baseUrl, model, temperature,
    availableModels, currentProvider, isConfigured, PROVIDERS,
    load, save, fetchModels, createChatAdapter, resetOnProviderChange
  }
})
