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

export async function switchDepartment(targetDeptId?: string) {
  return apiClient.post<never, Omit<LoginResult, 'userInfo'>>('/v1/user/dept/switch', {
    targetDeptId,
  })
}
