// src/utils/contextBuilder.js
// Phase 6.5：把用户档案 + 关系库拼成 system prompt 片段
//
// 纯函数工具：只依赖传入数据，不引用 store，方便单测和复用。

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
 * 一站式拼接完整上下文
 * @param {Object} params
 * @param {Object} [params.profile] - 用户档案
 * @param {Array}  [params.relations] - 全部关系
 * @param {string} [params.userMessage] - 当前用户消息（用于智能匹配关系）
 * @param {number} [params.maxRelations=10] - 无 mention 时最多列出多少条
 * @returns {string} 完整 Markdown（可能为空串）
 */
export function buildFullContext(params = {}) {
  const {
    profile,
    relations,
    userMessage,
    maxRelations = 10
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

  return sections.join('\n\n')
}
