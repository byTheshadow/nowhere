/**
 * 剥离 Vue 响应式代理，返回可被 IndexedDB 序列化的纯对象
 * 顺便过滤掉 undefined / 函数
 */
export function toPlain(obj) {
  return JSON.parse(JSON.stringify(obj))
}
