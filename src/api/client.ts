import axios from 'axios'
import type { ApiResponse } from '@/types'

/** Mock 开关由构建环境优先决定；显式关闭时不可被浏览器残留状态覆盖。 */
export function isMockMode() {
  const configured = import.meta.env.VITE_USE_MOCK
  if (configured === 'true') return true
  if (configured === 'false') return false
  return localStorage.getItem('auth_mode') === 'mock'
}

const BIG_INTEGER_PATTERN = /(:\s*)(-?\d{16,})(\s*[,}])/g

export function parseJsonWithSafeIntegers(text: string) {
  return JSON.parse(text.replace(BIG_INTEGER_PATTERN, '$1"$2"$3')) as unknown
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
