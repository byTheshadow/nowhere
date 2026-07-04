// src/utils/contextBuilder.js
// Phase 6.5 + 7.3 + 8.5 + Knowledge：
// 把用户档案 + 关系库 + 记忆 + 情绪日记 + 知识库拼成 system prompt 片段
//
// 纯函数工具：只依赖传入数据，不引用 store，方便单测和复用。

import { searchMemories } from './memorySearch'
import { searchKnowledge, mergeKnowledge } from './knowledgeSearch'

// ============ 枚举中文映射 ============
const GENDER_LABEL = {
  male: '男',
  female: '女',
  other: '其他'
}

const SENTIMENT_LABEL = {
  warm: '亲近',
  normal: '一般',
  tense: '紧张 / 有摩擦'
}

const RELATION_LABEL = {
  family: '家人',
  friend: '朋友',
  colleague: '同事',
  partner: '恋人 / 伴侣',
  pet: '宠物',
  other: '其他'
}

const MEMORY_TYPE_LABEL = {
  preference: '偏好',
  fact: '事实',
  event: '事件',
  feeling: '心情',
  goal: '目标'
}

const IMPORTANCE_LABEL = {
  3: '核心',
  2: '重要',
  1: '一般'
}

const EMOTION_LABEL = {
  happy: '开心',
  calm: '平静',
  sad: '难过',
  anxious: '焦虑',
  angry: '生气',
  tired: '疲惫',
  stressed: '压力大',
  lonely: '孤独',
  confused: '困惑',
  neutral: '普通'
}

const KNOWLEDGE_TYPE_LABEL = {
  diet: '食疗',
  tcm: '中医养生',
  mental: '心理疏解',
  therapy: '心理疗法',
  seasonal: '节气时令',
  breathing: '呼吸放松',
  sleep: '睡眠调节',
  emergency: '紧急安抚',
  custom: '自定义'
}

// ============ 内部工具 ============

/** 值是否"有内容"（非空串 / 非空数组 / 非 null） */
function isMeaningful(v) {
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'number') return true
  return false
}

/**
 * 结构化用药/保健品渲染成一行
 * { name, dosage, frequency, note } → "阿莫西林（500mg 每日一次）—— 饭后服用"
 */
function formatMedication(item) {
  if (!item?.name) return ''
  const spec = []
  if (item.dosage) spec.push(item.dosage)
  if (item.frequency) spec.push(item.frequency)
  let s = item.name
  if (spec.length) s += `（${spec.join(' ')}）`
  if (item.note) s += ` —— ${item.note}`
  return s
}

/** 单条关系渲染成一行 Markdown */
function formatRelation(r) {
  const type = RELATION_LABEL[r.relation] || '其他'
  const sentiment = SENTIMENT_LABEL[r.sentiment]
  let head = `- **${r.name}**（${type}`
  if (sentiment) head += `，关系${sentiment}`
  head += '）'

  const extras = []
  if (r.note) extras.push(r.note)
  if (r.tags && r.tags.length) extras.push(`标签：${r.tags.join('、')}`)
  return extras.length ? `${head}：${extras.join('；')}` : head
}

/** 单条记忆渲染成一行 Markdown */
function formatMemory(m) {
  const impLabel = IMPORTANCE_LABEL[m.importance] || '一般'
  const typeLabel = MEMORY_TYPE_LABEL[m.type] || '事实'
  let line = `- [${impLabel}·${typeLabel}] ${m.content}`
  if (m.tags && m.tags.length) {
    line += `（${m.tags.join('、')}）`
  }
  return line
}

/** 单条情绪记录渲染成一行 Markdown */
function formatEmotion(item) {
  if (!item) return ''
  const label = EMOTION_LABEL[item.dominantEmotion] || item.dominantEmotion || '普通'
  const intensity = Number.isFinite(Number(item.intensity)) ? Number(item.intensity) : 0
  let line = `- ${item.date}：${label}，强度 ${intensity}/5`
  if (item.note) {
    line += `，备注：${item.note}`
  }
  if (item.source) {
    line += `（来源：${item.source === 'chat' ? '聊天' : '手动'}）`
  }
  return line
}

/** 单条知识渲染成 Markdown */
function formatKnowledge(item) {
  if (!item) return ''

  const typeLabel = KNOWLEDGE_TYPE_LABEL[item.type] || item.type || '知识'
  const sourceLabel = item.source === 'user' ? '用户自定义' : '内置'
  const title = item.title || '未命名知识'
  const content = item.content || ''

  let line = `- [${sourceLabel}·${typeLabel}] ${title}：${content}`

  if (item.tags && item.tags.length) {
    line += `（标签：${item.tags.join('、')}）`
  }

  if (item.contraindications && item.contraindications.length) {
    line += `；注意：${item.contraindications.join('、')}`
  }

  if (item.promptHint) {
    line += `；使用提示：${item.promptHint}`
  }

  return line
}

// ============ 对外 API ============

/**
 * 把用户档案渲染成 Markdown
 * @param {Object} profile - profileStore.profile 的值
 * @returns {string} Markdown 片段（不含末尾换行）；空档案返回空串
 */
export function buildProfileContext(profile) {
  if (!profile || !profile.createdAt) return ''

  const lines = []

  const basics = []
  if (isMeaningful(profile.gender)) {
    basics.push(`性别 ${GENDER_LABEL[profile.gender] || profile.gender}`)
  }
  if (isMeaningful(profile.age)) basics.push(`${profile.age} 岁`)
  if (isMeaningful(profile.city)) basics.push(`所在城市 ${profile.city}`)
  if (isMeaningful(profile.constitution)) {
    basics.push(`中医体质 ${profile.constitution}质`)
  }
  if (basics.length) lines.push(`- 基本信息：${basics.join('，')}`)

  if (isMeaningful(profile.medications)) {
    const meds = profile.medications.map(formatMedication).filter(Boolean)
    if (meds.length) lines.push(`- 长期用药：${meds.join('；')}`)
  }

  if (isMeaningful(profile.supplements)) {
    const supps = profile.supplements.map(formatMedication).filter(Boolean)
    if (supps.length) lines.push(`- 保健品：${supps.join('；')}`)
  }

  if (isMeaningful(profile.allergies)) {
    lines.push(`- 过敏项：${profile.allergies.join('、')}`)
  }
  if (isMeaningful(profile.dietaryRestrictions)) {
    lines.push(`- 忌口：${profile.dietaryRestrictions.join('、')}`)
  }
  if (isMeaningful(profile.goals)) {
    lines.push(`- 想改善的方向：${profile.goals}`)
  }

  if (!lines.length) return ''
  return `## 关于用户\n${lines.join('\n')}`
}

/**
 * 检测消息文本里提到的关系
 * - 简单 substring 匹配（中文没有明显词边界）
 * - 长名字优先匹配，避免"小明明"里匹到"小明"后就漏掉"小明明"本身
 * @param {string} text
 * @param {Array} relations
 * @returns {Array} 命中的关系条目
 */
export function detectMentionedRelations(text, relations) {
  if (!text || !Array.isArray(relations) || relations.length === 0) return []

  // 按名字长度倒序，长的优先
  const sorted = [...relations]
    .filter((r) => r.name && r.name.trim())
    .sort((a, b) => b.name.length - a.name.length)

  const matched = []
  for (const r of sorted) {
    if (text.includes(r.name)) matched.push(r)
  }
  return matched
}

/**
 * 把关系库渲染成 Markdown
 * @param {Array} relations
 * @param {Object} [opts]
 * @param {Array} [opts.mentioned] - 若提供且非空，只输出这些
 * @param {number} [opts.maxItems=10] - 无 mentioned 时最多输出多少条
 * @returns {string}
 */
export function buildRelationsContext(relations, opts = {}) {
  if (!Array.isArray(relations) || relations.length === 0) return ''

  const { mentioned, maxItems = 10 } = opts
  const isFocused = Array.isArray(mentioned) && mentioned.length > 0

  let list = isFocused ? mentioned : relations
  let truncated = 0
  if (list.length > maxItems) {
    truncated = list.length - maxItems
    list = list.slice(0, maxItems)
  }

  const title = isFocused
    ? '## 用户提到的人 / 事'
    : '## 用户的关系网'

  let output = `${title}\n${list.map(formatRelation).join('\n')}`
  if (truncated > 0) {
    output += `\n（还有 ${truncated} 条未列出，用户提到具体名字时会补充）`
  }
  return output
}

/**
 * 把已检索出的 Top K 记忆渲染成 Markdown
 * @param {Array} searched - searchMemories 返回的原始记忆数组（不含 score）
 *                            或 { memory, score } 结构（内部会自动兼容）
 * @returns {string}
 */
export function buildMemoriesContext(searched) {
  if (!Array.isArray(searched) || searched.length === 0) return ''

  // 兼容两种输入：纯 memory 数组 或 { memory, score } 数组
  const items = searched.map((x) => (x && x.memory ? x.memory : x)).filter(Boolean)
  if (!items.length) return ''

  return `## 关于用户的长期记忆\n${items.map(formatMemory).join('\n')}\n（这些是用户手动标记为需要长期记住的信息，请自然融入对话，不要机械引用。）`
}

/**
 * 把近期情绪记录渲染成 Markdown
 * @param {Array} emotions
 * @param {Object} [opts]
 * @param {number} [opts.maxItems=7]
 * @returns {string}
 */
export function buildEmotionsContext(emotions, opts = {}) {
  if (!Array.isArray(emotions) || emotions.length === 0) return ''

  const { maxItems = 7 } = opts
  let list = emotions.filter(Boolean)

  if (list.length > maxItems) {
    list = list.slice(-maxItems)
  }

  const validItems = list.filter((item) => item.date || item.dominantEmotion)
  if (!validItems.length) return ''

  const latest = validItems[validItems.length - 1]
  const latestLabel = EMOTION_LABEL[latest.dominantEmotion] || latest.dominantEmotion || '普通'

  const recentLabels = [...new Set(
    validItems
      .map((item) => EMOTION_LABEL[item.dominantEmotion] || item.dominantEmotion || '普通')
      .filter(Boolean)
  )]

  const lines = [
    `- 今天 / 最近一次：${formatEmotion(latest)}`,
  ]

  if (recentLabels.length > 1) {
    lines.push(`- 最近几次主要情绪：${recentLabels.join('、')}`)
  }

  return `## 近期情绪记录\n${lines.join('\n')}\n（请参考这些记录，回应时尽量贴近用户最近的状态，不要机械重复。）`
}

/**
 * 把已检索出的 Top K 知识渲染成 Markdown
 * @param {Array} searched - searchKnowledge 返回的 { knowledge, score } 数组
 *                            或纯 knowledge 数组
 * @returns {string}
 */
export function buildKnowledgeContext(searched) {
  if (!Array.isArray(searched) || searched.length === 0) return ''

  const items = searched
    .map((x) => (x && x.knowledge ? x.knowledge : x))
    .filter(Boolean)

  if (!items.length) return ''

  return [
    '## 可参考的知识库内容',
    items.map(formatKnowledge).join('\n'),
    '（请把这些内容作为参考资料自然融入回复；不要机械照搬；不要把知识库内容说成诊断结论；涉及疾病、用药、严重症状或自伤风险时，应提醒用户寻求专业帮助。）'
  ].join('\n')
}

/**
 * 一站式拼接完整上下文
 * @param {Object} params
 * @param {Object} [params.profile] - 用户档案
 * @param {Array}  [params.relations] - 全部关系
 * @param {Array}  [params.memories] - 全部记忆（内部会做检索）
 * @param {Array}  [params.emotions] - 情绪日记列表（通常传最近 7~30 条）
 * @param {Array}  [params.knowledge] - 全部知识库，已合并时可直接传这个
 * @param {Array}  [params.builtinKnowledge] - 内置知识库
 * @param {Array}  [params.userKnowledge] - 用户自定义知识库
 * @param {string} [params.userMessage] - 当前用户消息（用于智能匹配关系 / 检索记忆 / 检索知识）
 * @param {number} [params.maxRelations=10]
 * @param {number} [params.maxMemories=5]
 * @param {number} [params.maxEmotions=7]
 * @param {number} [params.maxKnowledge=5]
 * @returns {string} 完整 Markdown（可能为空串）
 */
export function buildFullContext(params = {}) {
  const {
    profile,
    relations,
    memories,
    emotions,
    knowledge,
    builtinKnowledge,
    userKnowledge,
    userMessage,
    maxRelations = 10,
    maxMemories = 5,
    maxEmotions = 7,
    maxKnowledge = 5
  } = params

  const sections = []

  const profileSection = buildProfileContext(profile)
  if (profileSection) sections.push(profileSection)

  if (Array.isArray(relations) && relations.length > 0) {
    const mentioned = userMessage
      ? detectMentionedRelations(userMessage, relations)
      : []
    const rel = buildRelationsContext(relations, {
      mentioned,
      maxItems: maxRelations
    })
    if (rel) sections.push(rel)
  }

  if (Array.isArray(memories) && memories.length > 0) {
    const searched = searchMemories(userMessage || '', memories, {
      topK: maxMemories
    })
    const memSection = buildMemoriesContext(searched)
    if (memSection) sections.push(memSection)
  }

  const allKnowledge = Array.isArray(knowledge)
    ? knowledge
    : mergeKnowledge(builtinKnowledge, userKnowledge)

  if (Array.isArray(allKnowledge) && allKnowledge.length > 0) {
    const searchedKnowledge = searchKnowledge(userMessage || '', allKnowledge, {
      topK: maxKnowledge
    })
    const knowledgeSection = buildKnowledgeContext(searchedKnowledge)
    if (knowledgeSection) sections.push(knowledgeSection)
  }

  if (Array.isArray(emotions) && emotions.length > 0) {
    const emoSection = buildEmotionsContext(emotions, {
      maxItems: maxEmotions
    })
    if (emoSection) sections.push(emoSection)
  }

  return sections.join('\n\n')
}


