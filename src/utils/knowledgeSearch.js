// src/utils/knowledgeSearch.js
// 轻量知识库检索：关键词 / 标签 / 标题 / 内容匹配
//
// 说明：
// - 不使用 embedding
// - 不依赖 store
// - 可同时检索内置知识库和用户自定义知识库
// - 返回 { knowledge, score } 数组，按相关性从高到低排序

const TYPE_KEYWORDS = {
  diet: ['吃', '饮食', '食物', '食疗', '胃', '肚子', '消化', '恶心', '反酸', '腹胀', '便秘', '腹泻'],
  tcm: ['中医', '体质', '气虚', '阳虚', '阴虚', '湿气', '上火', '养生', '经络', '脾胃'],
  mental: ['难过', '低落', '委屈', '孤独', '崩溃', '烦', '累', '撑不住', '安慰', '陪我'],
  therapy: ['焦虑', '恐惧', '害怕', '想太多', '自责', '内耗', '认知', '疗法', 'CBT', '正念'],
  seasonal: ['节气', '春', '夏', '秋', '冬', '换季', '时令', '养生'],
  breathing: ['呼吸', '放松', '紧张', '心慌', '平静', '冥想'],
  sleep: ['睡不着', '失眠', '熬夜', '困', '睡眠', '早醒'],
  emergency: ['自杀', '轻生', '自伤', '活不下去', '不想活', '伤害自己', '救命']
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function tokenize(query) {
  const text = normalizeText(query)
  if (!text) return []

  const parts = text
    .split(/[\s,，。！？!?、；;：:（）()【】[\]{}"'“”‘’/\\|]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const chars = Array.from(text)
    .filter((ch) => /[\u4e00-\u9fa5a-z0-9]/i.test(ch))

  return [...new Set([...parts, ...chars])].filter(Boolean)
}

function inferTypes(query) {
  const text = normalizeText(query)
  if (!text) return []

  const matched = []

  for (const [type, words] of Object.entries(TYPE_KEYWORDS)) {
    if (words.some((word) => text.includes(normalizeText(word)))) {
      matched.push(type)
    }
  }

  return matched
}

function scoreKnowledgeItem(item, query, tokens, inferredTypes) {
  if (!item) return 0

  const title = normalizeText(item.title)
  const content = normalizeText(item.content)
  const tags = Array.isArray(item.tags) ? item.tags.map(normalizeText) : []
  const symptoms = Array.isArray(item.relatedSymptoms) ? item.relatedSymptoms.map(normalizeText) : []
  const emotions = Array.isArray(item.relatedEmotions) ? item.relatedEmotions.map(normalizeText) : []
  const contraindications = Array.isArray(item.contraindications) ? item.contraindications.map(normalizeText) : []

  const fullText = [
    title,
    content,
    ...tags,
    ...symptoms,
    ...emotions,
    ...contraindications
  ].join(' ')

  let score = 0

  // 类型命中加权
  if (item.type && inferredTypes.includes(item.type)) {
    score += 8
  }

  // 用户自定义知识优先一点
  if (item.source === 'user') {
    score += 2
  }

  // priority 越高越容易被选中
  if (Number.isFinite(Number(item.priority))) {
    score += Number(item.priority)
  }

  // 完整 query 命中
  const q = normalizeText(query)
  if (q) {
    if (title.includes(q)) score += 12
    if (tags.some((tag) => tag.includes(q) || q.includes(tag))) score += 10
    if (content.includes(q)) score += 5
  }

  // token 命中
  for (const token of tokens) {
    if (!token) continue

    if (title.includes(token)) score += 5
    if (tags.some((tag) => tag.includes(token) || token.includes(tag))) score += 4
    if (symptoms.some((s) => s.includes(token) || token.includes(s))) score += 4
    if (emotions.some((e) => e.includes(token) || token.includes(e))) score += 4
    if (content.includes(token)) score += 1
  }

  // 如果完全没命中，不返回
  if (score <= 0) return 0

  // 安全等级微调
  if (item.safetyLevel === 'avoid') score -= 5
  if (item.safetyLevel === 'caution') score -= 1
  if (item.safetyLevel === 'safe') score += 1

  // 内容过短的条目降低一点
  if (fullText.length < 20) score -= 2

  return Math.max(0, score)
}

/**
 * 搜索知识库
 * @param {string} query - 当前用户消息
 * @param {Array} items - 知识条目数组
 * @param {Object} [opts]
 * @param {number} [opts.topK=5]
 * @param {string|string[]} [opts.type] - 可选，限定类型
 * @returns {Array<{knowledge: Object, score: number}>}
 */
export function searchKnowledge(query, items, opts = {}) {
  if (!Array.isArray(items) || items.length === 0) return []

  const { topK = 5, type } = opts
  const tokens = tokenize(query)
  const inferredTypes = inferTypes(query)

  const allowedTypes = Array.isArray(type)
    ? type
    : type
      ? [type]
      : null

  const results = []

  for (const item of items) {
    if (!item) continue
    if (allowedTypes && !allowedTypes.includes(item.type)) continue

    const score = scoreKnowledgeItem(item, query, tokens, inferredTypes)
    if (score > 0) {
      results.push({ knowledge: item, score })
    }
  }

  return results
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const ap = Number(a.knowledge?.priority || 0)
      const bp = Number(b.knowledge?.priority || 0)
      return bp - ap
    })
    .slice(0, topK)
}

/**
 * 合并内置知识库和用户知识库
 * @param {Array} builtinItems
 * @param {Array} userItems
 * @returns {Array}
 */
export function mergeKnowledge(builtinItems = [], userItems = []) {
  const merged = []

  if (Array.isArray(builtinItems)) merged.push(...builtinItems)
  if (Array.isArray(userItems)) merged.push(...userItems)

  return merged.filter(Boolean)
}
