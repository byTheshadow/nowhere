// src/utils/emotionParser.js
// Phase 5：AI 回复中的情绪标签解析工具
//
// 约定格式：AI 回复末尾附带 [emotion:xxx]
// 本工具做宽松解析 + 严格枚举校验 + 干净剥离 + 流式预览剥离

/** 允许的情绪值白名单 */
export const EMOTIONS = [
  'idle',
  'happy',
  'thinking',
  'listening',
  'caring',
  'worried',
  'sad',
  'excited',
  'sleepy',
  'confused'
]

const EMOTION_SET = new Set(EMOTIONS)

/**
 * 宽松匹配已完成的情绪标签
 * 支持：
 *   [emotion:happy]         标准
 *   [ emotion : Happy ]     宽松空格与大小写
 *   【emotion:happy】       中文方括号
 *   (emotion:happy)         圆括号兜底
 * 使用 g 标志以便取"最后一个"
 */
const FINISHED_TAG_RE =
  /[\[【(]\s*emotion\s*[:：]\s*([a-zA-Z]+)\s*[\]】)]/gi

/**
 * 疑似"未完成"的情绪标签（流式过程中还没吐完）
 * 只匹配字符串末尾，防止把正文内容误当作未完成标签
 * 示例：
 *   "...你好呀 [emo"
 *   "...你好呀 [emotion:hap"
 *   "...你好呀 [emotion:"
 *   "...你好呀 【emotion：hap"
 */
const UNFINISHED_TAG_RE =
  /[\[【(]\s*e(m(o(t(i(o(n(\s*[:：]\s*[a-zA-Z]*)?)?)?)?)?)?)?$/i

/**
 * 从完整文本中解析情绪标签
 * @param {string} text
 * @returns {{ emotion: string|null, cleanText: string, matched: boolean }}
 *   emotion:   合法枚举值，或 null（未匹配到 / 匹配到非法值）
 *   cleanText: 剥离所有情绪标签后的正文（trimEnd 过）
 *   matched:   是否匹配到了任何标签（哪怕枚举非法）
 */
export function parseEmotion(text) {
  if (!text || typeof text !== 'string') {
    return { emotion: null, cleanText: text || '', matched: false }
  }

  // 拿到所有匹配（用 matchAll 保序）
  const matches = [...text.matchAll(FINISHED_TAG_RE)]
  const matched = matches.length > 0

  let emotion = null
  if (matched) {
    // 取最后一个
    const last = matches[matches.length - 1]
    const raw = String(last[1] || '').toLowerCase()
    if (EMOTION_SET.has(raw)) {
      emotion = raw
    }
  }

  // 无论是否合法，都把所有标签从正文中剥掉
  const cleanText = stripEmotionTags(text)

  return { emotion, cleanText, matched }
}

/**
 * 剥离所有已完成的情绪标签，并清理尾部空白 / 多余换行
 * @param {string} text
 * @returns {string}
 */
export function stripEmotionTags(text) {
  if (!text || typeof text !== 'string') return text || ''
  return text
    .replace(FINISHED_TAG_RE, '')
    .replace(/\s+$/g, '')
}

/**
 * 流式预览剥离：剥离已完成标签 + 隐藏末尾疑似未完成的标签片段
 * 用于流式渲染时展示给用户看的中间态文本
 *
 * 例：
 *   "你好呀 [emotion:hap"     -> "你好呀"
 *   "你好呀 [emo"             -> "你好呀"
 *   "你好呀"                  -> "你好呀"
 *   "你好呀 [emotion:happy]"  -> "你好呀"
 *
 * @param {string} text
 * @returns {string}
 */
export function stripForStreaming(text) {
  if (!text || typeof text !== 'string') return text || ''
  let out = text.replace(FINISHED_TAG_RE, '')
  out = out.replace(UNFINISHED_TAG_RE, '')
  return out.replace(/\s+$/g, '')
}

/**
 * 校验一个字符串是否是合法情绪值
 */
export function isValidEmotion(value) {
  return typeof value === 'string' && EMOTION_SET.has(value.toLowerCase())
}
