import axios from 'axios'
import type { ApiResponse } from '@/types'

export const useMock = import.meta.env.VITE_USE_MOCK !== 'false'

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
      localStorage.removeItem('access_token')
      const current = `${window.location.pathname}${window.location.search}`
      if (window.location.pathname !== '/login') {
        window.location.assign(`/login?redirect=${encodeURIComponent(current)}`)
      }
    }
    return Promise.reject(error)
  },
)
