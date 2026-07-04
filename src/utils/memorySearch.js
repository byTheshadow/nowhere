// src/utils/memorySearch.js
// Phase 7.2：向量记忆检索（v1 关键词版）
//
// 设计约定：
// - 纯函数，不依赖 store / db
// - 未来升级 embedding 时，保持 searchMemories 签名不变
// - 打分为 0-1，越高越相关

/**
 * 中英混合切词
 * 策略：
 *   - 英文按空格 / 标点切
 *   - 中文按 2-gram（"我最近失眠" → 我最, 最近, 近失, 失眠）
 *   - 短于 1 字的丢弃
 *   - 去重、小写化
 */
export function tokenize(text) {
  const s = String(text || '').toLowerCase().trim()
  if (!s) return []

  const tokens = new Set()

  // 1. 英文/数字：按非字母数字切
  const enParts = s.split(/[^a-z0-9]+/i).filter((w) => w && w.length >= 2)
  for (const w of enParts) tokens.add(w)

  // 2. 中文：抽出连续中文串后做 2-gram
  const cnRuns = s.match(/[\u4e00-\u9fa5]+/g) || []
  for (const run of cnRuns) {
    if (run.length === 1) {
      tokens.add(run)
    } else {
      for (let i = 0; i < run.length - 1; i++) {
        tokens.add(run.slice(i, i + 2))
      }
    }
  }

  return [...tokens]
}

/**
 * 单条记忆的关键词命中率
 * @param {string[]} queryTokens
 * @param {object} memory
 * @returns {number} 0-1
 */
function keywordScore(queryTokens, memory) {
  if (!queryTokens.length) return 0

  const haystack = [
    memory.content || '',
    ...(Array.isArray(memory.tags) ? memory.tags : [])
  ].join(' ')
  const memTokens = new Set(tokenize(haystack))
  if (!memTokens.size) return 0

  let hits = 0
  for (const q of queryTokens) {
    if (memTokens.has(q)) hits++
  }
  return hits / queryTokens.length
}

/**
 * 重要度归一化：1→0.33 / 2→0.66 / 3→1.0
 */
function importanceScore(importance) {
  const n = Number(importance) || 1
  return Math.max(0, Math.min(1, n / 3))
}

/**
 * 时间新鲜度：30 天半衰的指数衰减
 * 刚创建 → 1.0；30 天前 → 0.5；60 天前 → 0.25
 */
function freshnessScore(createdAt, nowTs) {
  const t = Number(createdAt) || 0
  if (!t) return 0
  const ageDays = (nowTs - t) / (1000 * 60 * 60 * 24)
  if (ageDays <= 0) return 1
  const halfLifeDays = 30
  return Math.pow(0.5, ageDays / halfLifeDays)
}

/**
 * 主入口：检索相关记忆
 *
 * @param {string} query        用户当前消息
 * @param {object[]} memories   全量记忆数组
 * @param {object} [opts]
 * @param {number} [opts.topK=5]         最多返回几条
 * @param {number} [opts.threshold=0.15] 低于此分丢弃
 * @param {number} [opts.now=Date.now()] 当前时间戳（便于测试）
 * @param {object} [opts.weights]        自定义权重
 * @returns {Array<{ memory: object, score: number, breakdown: object }>}
 */
export function searchMemories(query, memories, opts = {}) {
  const {
    topK = 5,
    threshold = 0.15,
    now: nowTs = Date.now(),
    weights = { keyword: 0.6, importance: 0.25, freshness: 0.15 }
  } = opts

  if (!Array.isArray(memories) || memories.length === 0) return []

  const q = String(query || '').trim()
  const qTokens = tokenize(q)

  // 无 query 时：直接按 importance + freshness 排序，取 topK
  // （用于"上下文无关"的默认注入，例如新会话开头）
  if (!qTokens.length) {
    return memories
      .map((m) => {
        const imp = importanceScore(m.importance)
        const fresh = freshnessScore(m.createdAt, nowTs)
        const score = imp * 0.7 + fresh * 0.3
        return { memory: m, score, breakdown: { keyword: 0, importance: imp, freshness: fresh } }
      })
      .filter((r) => r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  const scored = []
  for (const m of memories) {
    const kw = keywordScore(qTokens, m)
    const imp = importanceScore(m.importance)
    const fresh = freshnessScore(m.createdAt, nowTs)

    const score =
      kw * weights.keyword +
      imp * weights.importance +
      fresh * weights.freshness

    if (score >= threshold) {
      scored.push({
        memory: m,
        score,
        breakdown: { keyword: kw, importance: imp, freshness: fresh }
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

/**
 * 便捷函数：只要 memory 对象数组，不要打分细节
 * （contextBuilder 用这个）
 */
export function searchMemoriesFlat(query, memories, opts = {}) {
  return searchMemories(query, memories, opts).map((r) => r.memory)
}
