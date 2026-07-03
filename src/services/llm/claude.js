import { LLMAdapter } from './base'

export class ClaudeAdapter extends LLMAdapter {
  get baseUrl() {
    return (this.config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  }

  get headers() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    }
  }

  async listModels() {
    const res = await fetch(`${this.baseUrl}/v1/models`, { headers: this.headers })
    if (!res.ok) {
      throw new Error(`获取模型失败 (${res.status}): ${await res.text()}`)
    }
    const data = await res.json()
    return (data.data || [])
      .map((m) => ({ id: m.id, name: m.display_name || m.id }))
      .sort((a, b) => b.id.localeCompare(a.id))
  }

  async *chatStream(messages, options = {}) {
    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content)
    const others = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))

    const body = {
      model: this.config.model,
      messages: others,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      stream: true
    }
    if (systemParts.length) body.system = systemParts.join('\n\n')

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      throw new Error(`对话失败 (${res.status}): ${await res.text()}`)
    }

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
        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield parsed.delta.text
          }
        } catch {
          // skip
        }
      }
    }
  }
}
