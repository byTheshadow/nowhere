import { db, uid, now } from '../db/schema'

const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR']
const MAX_LOGS = 500

class Logger {
  constructor() {
    this.buffer = []
    this.installed = false
  }

  /**
   * 安装全局错误捕获
   */
  install(app) {
    if (this.installed) return
    this.installed = true

    // 未捕获的错误
    window.addEventListener('error', (e) => {
      this.error(e.message || 'Uncaught error', {
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        stack: e.error?.stack
      })
    })

    // 未捕获的 Promise rejection
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason
      this.error(
        reason?.message || String(reason) || 'Unhandled promise rejection',
        {
          stack: reason?.stack
        }
      )
    })

    // Vue 内部错误
    if (app) {
      app.config.errorHandler = (err, instance, info) => {
        this.error(err?.message || String(err), {
          info,
          stack: err?.stack,
          component: instance?.$options?.__name
        })
      }
    }

    this.info('Logger installed')
  }

  async _write(level, message, meta = {}) {
    const entry = {
      id: uid('log'),
      level,
      message: String(message).slice(0, 500),
      meta: this._safeStringify(meta),
      timestamp: now()
    }

    // 控制台镜像
    const consoleMethod =
      level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'
    // eslint-disable-next-line no-console
    console[consoleMethod](`[${level}]`, message, meta)

    try {
      await db.logs.add(entry)
      await this._trim()
    } catch (e) {
      // 数据库写入失败时兜底放到内存 buffer，避免死循环
      this.buffer.push(entry)
    }
  }

  /**
   * 循环缓冲，保持最多 MAX_LOGS 条
   */
  async _trim() {
    const count = await db.logs.count()
    if (count > MAX_LOGS) {
      const overflow = count - MAX_LOGS
      const oldest = await db.logs
        .orderBy('timestamp')
        .limit(overflow)
        .primaryKeys()
      await db.logs.bulkDelete(oldest)
    }
  }

  _safeStringify(obj) {
    try {
      return JSON.parse(
        JSON.stringify(obj, (k, v) => {
          if (v instanceof Error) {
            return { name: v.name, message: v.message, stack: v.stack }
          }
          return v
        })
      )
    } catch {
      return { _unserializable: true }
    }
  }

  debug(msg, meta) {
    return this._write('DEBUG', msg, meta)
  }
  info(msg, meta) {
    return this._write('INFO', msg, meta)
  }
  warn(msg, meta) {
    return this._write('WARN', msg, meta)
  }
  error(msg, meta) {
    return this._write('ERROR', msg, meta)
  }

  /**
   * 读取日志（最新的在前）
   */
  async list({ level, limit = 100 } = {}) {
    let query = db.logs.orderBy('timestamp').reverse()
    if (level) query = query.filter((l) => l.level === level)
    return query.limit(limit).toArray()
  }

  async clear() {
    await db.logs.clear()
    this.info('Logs cleared')
  }
}

export const logger = new Logger()
export { LEVELS }
