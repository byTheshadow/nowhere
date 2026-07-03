import Dexie from 'dexie'

/**
 * Nowhere 数据库定义
 *
 * 表设计原则：
 * - 所有表都带 createdAt / updatedAt
 * - 主键统一用字符串 id（crypto.randomUUID）
 * - 时间字段统一用 number（Date.now()）
 */
export const db = new Dexie('nowhere')

db.version(1).stores({
  // 对话（一次完整的会话）
  conversations: 'id, title, createdAt, updatedAt, personaId, isPinned, *tags',

  // 消息（会话中的每一条）
  messages: 'id, conversationId, role, timestamp, mode',

  // 用户档案（单例，id 固定为 'me'）
  profile: 'id',

  // AI 人设
  personas: 'id, name, isPreset, isActive',

  // 关系库
  relations: 'id, name, relation, sentiment, updatedAt, *tags',

  // 向量记忆
  memories: 'id, type, importance, createdAt, *tags',

  // 情绪日记（每天一条聚合）
  emotions: 'date, dominantEmotion, intensity',

  // 提醒
  reminders: 'id, type, nextTriggerAt, isActive',

  // 设置（键值对）
  settings: 'key',

  // 日志
  logs: 'id, level, timestamp'
})

/**
 * 生成 UUID
 */
export function uid(prefix = '') {
  const id = crypto.randomUUID()
  return prefix ? `${prefix}_${id}` : id
}

/**
 * 当前时间戳
 */
export function now() {
  return Date.now()
}
