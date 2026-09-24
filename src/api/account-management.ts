import { apiClient } from './client'
import type { CurrentUser } from '@/types'

export interface UserPageQuery {
  deptId?: string
  pageNum?: number
  pageSize?: number
  keyword?: string
  role?: 'ADMIN' | 'USER' | ''
  status?: number | ''
  unit?: string
  department?: string
  defaultDeptId?: string
}

export interface UserPage {
  records: CurrentUser[]
  total: number
  pageNum: number
  pageSize: number
}

export interface UpdateMyInfoInput {
  deptId?: string
  realName?: string
  nickname?: string
  gender?: number
  avatar?: string
  phone?: string
  email?: string
}

/**
 * 后端 UserDeptItemReq。ID 使用字符串保存，避免 19 位 Long 在浏览器中丢失精度；
 * Spring/Jackson 会按 Long 接收该十进制字符串。
 */
export interface UserDepartmentInput {
  deptId: string
  deptRole?: string
}

export interface UserCreateInput extends UpdateMyInfoInput {
  username: string
  password: string
  unit?: string
  department?: string
  deptIdList: UserDepartmentInput[]
  defaultDeptId?: string
  position?: string
  role?: 'ADMIN' | 'USER'
  status?: number
  remark?: string
}

export interface UserUpdateInput extends Omit<UserCreateInput, 'username' | 'password'> {
  id: string
}

export interface DepartmentInfo {
  id: string
  parentId?: string
  name: string
  code?: string
  sort?: number
  leader?: string
  phone?: string
  status: number
  remark?: string
  createTime?: string
  updateTime?: string
}

export interface DepartmentInput {
  deptId?: string
  name: string
  code?: string
  sort?: number
  leader?: string
  phone?: string
  status?: number
  remark?: string
}

export interface DepartmentUpdateInput extends Partial<DepartmentInput> {
  id: string
}

export interface DepartmentQuery {
  deptId?: string
  keyword?: string
  status?: number | ''
}

function withoutEmptyFilter<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== '')) as T
}

export function updateMyInfo(input: UpdateMyInfoInput) {
  return apiClient.post<never, void>('/v1/user/info/update', input)
}

export function changeMyPassword(input: { deptId?: string; oldPassword: string; newPassword: string }) {
  return apiClient.post<never, void>('/v1/user/password', input)
}

export function getUserPage(query: UserPageQuery) {
  return apiClient.post<never, UserPage>('/v1/user/page', withoutEmptyFilter(query as Record<string, unknown>))
}

export function getUserDetail(id: string, deptId?: string) {
  return apiClient.post<never, CurrentUser>('/v1/user/detail', { id, deptId })
}

export function addUser(input: UserCreateInput) {
  return apiClient.post<never, void>('/v1/user/add', input)
}

export function updateUser(input: UserUpdateInput) {
  return apiClient.post<never, void>('/v1/user/update', input)
}

export function updateUserStatus(id: string, status: number, deptId?: string) {
  return apiClient.post<never, void>('/v1/user/status', { id, status, deptId })
}

export function resetUserPassword(id: string, newPassword: string, deptId?: string) {
  return apiClient.post<never, void>('/v1/user/password/reset', { id, newPassword, deptId })
}

export function deleteUser(id: string, deptId?: string) {
  return apiClient.post<never, void>('/v1/user/delete', { id, deptId })
}

export function getDepartmentList(query: DepartmentQuery = {}) {
  return apiClient.post<never, DepartmentInfo[]>('/v1/dept/list', withoutEmptyFilter(query as Record<string, unknown>))
}

export function getDepartmentDetail(id: string, deptId?: string) {
  return apiClient.post<never, DepartmentInfo>('/v1/dept/detail', { id, deptId })
}

export function addDepartment(input: DepartmentInput) {
  return apiClient.post<never, void>('/v1/dept/add', input)
}

export function updateDepartment(input: DepartmentUpdateInput) {
  return apiClient.post<never, void>('/v1/dept/update', input)
}

export function updateDepartmentStatus(id: string, status: number, deptId?: string) {
  return apiClient.post<never, void>('/v1/dept/status', { id, status, deptId })
}

export function deleteDepartment(id: string, deptId?: string) {
  return apiClient.post<never, void>('/v1/dept/delete', { id, deptId })
}
