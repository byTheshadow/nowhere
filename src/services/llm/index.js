import { OpenAICompatibleAdapter } from './openai'
import { ClaudeAdapter } from './claude'

export const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    adapter: 'openai',
    editableBaseUrl: false
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    adapter: 'openai',
    editableBaseUrl: false
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com',
    adapter: 'claude',
    editableBaseUrl: false
  },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    adapter: 'openai',
    editableBaseUrl: true
  },
  {
    id: 'custom',
    name: '自定义 (OpenAI 兼容)',
    baseUrl: '',
    adapter: 'openai',
    editableBaseUrl: true
  }
]

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id)
}

export function createAdapter(config) {
  const provider = getProvider(config.providerId)
  if (!provider) throw new Error(`未知服务商: ${config.providerId}`)

  const merged = {
    ...config,
    baseUrl: config.baseUrl || provider.baseUrl
  }

  switch (provider.adapter) {
    case 'openai':
      return new OpenAICompatibleAdapter(merged)
    case 'claude':
      return new ClaudeAdapter(merged)
    default:
      throw new Error(`未知适配器: ${provider.adapter}`)
  }
}
