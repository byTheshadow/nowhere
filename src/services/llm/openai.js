import { LLMAdapter } from './base'

export class OpenAICompatibleAdapter extends LLMAdapter {
  get baseUrl() {
    return (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  }

  get headers() {
    const h = { 'Content-Type': 'application/json' }
    if (this.config.apiKey) h['Authorization'] = `Bearer ${this.config.apiKey}`
    return h
  }

  async listModels() {
    const res = await fetch(`${this.baseUrl}/models`, { headers: this.headers })
    if (!res.ok) {
      throw new Error(`获取模型失败 (${res.status}): ${await res.text()}`)
    }
    const data = await res.json()
    const list = data.data || data.models || []
    return list
      .map((m) => ({ id: m.id || m.name, name: m.id || m.name }))
      .filter((m) => m.id)
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  async *chatStream(messages, options = {}) {
    const body = {
      model: this.config.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      throw new Error(`对话失败 (${res.status}): ${await res.text()}`)
    }

    yield* parseSSE(res, (parsed) => parsed.choices?.[0]?.delta?.content)
  }
}

async function* parseSSE(res, extract) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const data = t.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data)
        const chunk = extract(parsed)
        if (chunk) yield chunk
      } catch {
        // skip malformed
      }
    }
  }
}
