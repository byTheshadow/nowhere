/**
 * 极简日期工具，接口类似 dayjs
 * 只实现我们用到的方法，避免引入额外依赖
 */
class D {
  constructor(input) {
    this.d = input instanceof Date ? new Date(input) :
             typeof input === 'number' ? new Date(input) :
             input === undefined ? new Date() : new Date(input)
  }
  clone() { return new D(this.d) }
  valueOf() { return this.d.getTime() }

  startOf(unit) {
    const n = this.clone()
    if (unit === 'day') {
      n.d.setHours(0, 0, 0, 0)
    } else if (unit === 'year') {
      n.d = new Date(n.d.getFullYear(), 0, 1)
    }
    return n
  }

  subtract(n, unit) {
    const c = this.clone()
    if (unit === 'day') c.d.setDate(c.d.getDate() - n)
    else if (unit === 'hour') c.d.setHours(c.d.getHours() - n)
    else if (unit === 'minute') c.d.setMinutes(c.d.getMinutes() - n)
    return c
  }

  isAfter(other) { return this.valueOf() > other.valueOf() }
  isSame(other, unit) {
    if (unit === 'day') {
      return this.d.getFullYear() === other.d.getFullYear() &&
             this.d.getMonth() === other.d.getMonth() &&
             this.d.getDate() === other.d.getDate()
    }
    if (unit === 'year') return this.d.getFullYear() === other.d.getFullYear()
    return this.valueOf() === other.valueOf()
  }

  format(fmt) {
    const pad = (n) => String(n).padStart(2, '0')
    const map = {
      YYYY: this.d.getFullYear(),
      MM: pad(this.d.getMonth() + 1),
      DD: pad(this.d.getDate()),
      HH: pad(this.d.getHours()),
      mm: pad(this.d.getMinutes()),
      ss: pad(this.d.getSeconds())
    }
    return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k])
  }
}

export default function dayjs(input) {
  return new D(input)
}
