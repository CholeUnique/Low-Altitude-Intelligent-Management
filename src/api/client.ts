import axios from 'axios'
import type { ApiResponse } from '@/types'

/** Mock 开关由构建环境优先决定；显式关闭时不可被浏览器残留状态覆盖。 */
export function isMockMode() {
  const configured = import.meta.env.VITE_USE_MOCK
  if (configured === 'true') return true
  if (configured === 'false') return false
  return localStorage.getItem('auth_mode') === 'mock'
}

/** 16 位以上的整数（int64 ID）在 JS 中会丢失精度，需要在 JSON.parse 前转成字符串。 */
const LONG_INTEGER_HINT = /\d{16,}/

/**
 * 只在 JSON 字符串之外给长整数加引号。
 * 之前的正则实现会命中字符串内部的 `"detailJson": "{\"userId\": 1234567890123456789}"`，
 * 把内层数字包成引号，破坏转义后导致整个响应 JSON.parse 失败（操作日志页即为此）。
 */
function quoteLongIntegers(text: string) {
  let out = ''
  let index = 0
  let inString = false
  while (index < text.length) {
    const char = text[index]!
    if (inString) {
      if (char === '\\') { out += char + (text[index + 1] ?? ''); index += 2; continue }
      out += char
      if (char === '"') inString = false
      index += 1
      continue
    }
    if (char === '"') { inString = true; out += char; index += 1; continue }
    if (char !== '-' && (char < '0' || char > '9')) { out += char; index += 1; continue }
    let end = char === '-' ? index + 1 : index
    const digitsStart = end
    while (end < text.length) {
      const code = text.charCodeAt(end)
      if (code < 48 || code > 57) break
      end += 1
    }
    if (end === digitsStart) { out += char; index += 1; continue }
    // 数字必须整体消费。不能把经纬度的小数部分当作一个独立 int64 加引号。
    let integer = true
    if (text[end] === '.') {
      integer = false; end += 1
      while (end < text.length && text[end]! >= '0' && text[end]! <= '9') end += 1
    }
    if (text[end] === 'e' || text[end] === 'E') {
      integer = false; end += 1
      if (text[end] === '+' || text[end] === '-') end += 1
      while (end < text.length && text[end]! >= '0' && text[end]! <= '9') end += 1
    }
    const raw = text.slice(index, end)
    const next = text[end] ?? ''
    const isStandalone = next === '' || next === ',' || next === '}' || next === ']' || /\s/.test(next)
    if (integer && /^-?(?:0|[1-9]\d*)$/.test(raw) && raw.replace('-', '').length >= 16 && isStandalone) {
      out += `"${raw}"`
    } else {
      out += raw
    }
    index = end
  }
  return out
}

export function parseJsonWithSafeIntegers(text: string) {
  // 无长整数时直接解析，避免对大响应逐字符扫描。
  if (!LONG_INTEGER_HINT.test(text)) return JSON.parse(text) as unknown
  return JSON.parse(quoteLongIntegers(text)) as unknown
}

export class ApiBusinessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiBusinessError'
  }
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  transformResponse: [(data: unknown) => {
    if (typeof data !== 'string' || !data) return data
    return parseJsonWithSafeIntegers(data)
  }],
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiResponse<unknown>
    if (!payload || typeof payload !== 'object' || !('code' in payload)) return payload
    if (String(payload.code) !== '0') {
      throw new ApiBusinessError(String(payload.code), payload.msg || '接口请求失败')
    }
    // Axios 的实例泛型仍按 AxiosResponse 声明，运行时统一返回业务 data。
    return payload.data as any
  },
  (error) => {
    if (error.response?.status === 401) {
      // 请求发出后可能已切换到 Mock 或换签了新的真实 token。旧请求的 401 不能
      // 清掉新会话，否则会造成演示登录后立刻被重定向回登录页的“闪退”现象。
      const requestAuthorization = String(error.config?.headers?.Authorization || '')
      const requestToken = requestAuthorization.replace(/^Bearer\s+/i, '')
      const activeToken = localStorage.getItem('access_token') || ''
      if (!isMockMode() && requestToken && requestToken === activeToken) {
        localStorage.removeItem('access_token')
        const current = `${window.location.pathname}${window.location.search}`
        if (window.location.pathname !== '/login') {
          window.location.assign(`/login?redirect=${encodeURIComponent(current)}`)
        }
      }
    }
    return Promise.reject(error)
  },
)
