import { apiClient } from './client'
import { encryptLoginPassword } from '@/utils/authCrypto'
import type { CurrentUser, UserDepartment } from '@/types'

export interface LoginPublicKey {
  keyId: string
  publicKey: string
  algorithm: string
}

export interface LoginResult {
  accessToken: string
  tokenType: string
  expiresIn: number
  activeDeptId?: string
  userInfo: CurrentUser
}

/** 后端部门下拉接口的最小返回模型。 */
export interface DepartmentOption {
  deptId: string
  deptName: string
  deptCode?: string
}

export async function getLoginPublicKey() {
  return apiClient.post<never, LoginPublicKey>('/v1/user/login/public-key', {})
}

export async function loginWithPassword(username: string, password: string, deptId?: string) {
  const key = await getLoginPublicKey()
  const encryptedPassword = encryptLoginPassword(password, key.publicKey)
  return apiClient.post<never, LoginResult>('/v1/user/login', {
    username,
    password: encryptedPassword,
    keyId: key.keyId,
    loginType: 'PASSWORD',
    deptId,
  })
}

export async function getCurrentUser() {
  return apiClient.post<never, CurrentUser>('/v1/user/info', {})
}

export async function logoutFromServer() {
  return apiClient.post('/v1/user/logout', {})
}

export async function getMyDepartments() {
  return apiClient.post<never, UserDepartment[]>('/v1/user/dept/list', {})
}

/**
 * ADMIN 可读取全部已启用部门，用于把前端的两个业务入口映射到真实部门 ID。
 * 不在前端写死部门 ID，避免测试、生产环境的主键不一致。
 */
export async function getDepartmentOptions(): Promise<DepartmentOption[]> {
  const options = await apiClient.post<never, Array<{ id: string | number; name: string; code?: string }>>('/v1/dept/options', {})
  return options.map((item) => ({
    deptId: String(item.id),
    deptName: item.name,
    deptCode: item.code,
  }))
}

export async function switchDepartment(targetDeptId?: string) {
  return apiClient.post<never, Omit<LoginResult, 'userInfo'>>('/v1/user/dept/switch', {
    targetDeptId,
  })
}
