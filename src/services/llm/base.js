export class LLMAdapter {
  constructor(config) {
    this.config = config
  }

  async listModels() {
    throw new Error('listModels not implemented')
  }

  async *chatStream(messages, options = {}) {
    throw new Error('chatStream not implemented')
  }
}
