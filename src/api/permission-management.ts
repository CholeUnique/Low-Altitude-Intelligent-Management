import { apiClient } from './client'

export interface PermissionMenuNode {
  id: string
  parentId: string
  name: string
  code: string
  level: number
  defaultFlag: number
  sort: number
  status: number
  children: PermissionMenuNode[]
}

export interface PermissionMenuItem {
  menuId: string
  code: string
  name: string
  moduleId: string
  moduleCode: string
  moduleName: string
}

export interface UserDepartmentPermission {
  deptId: string
  deptName: string
  deptRole?: string
  menuIds: string[]
  menus: PermissionMenuItem[]
}

export interface UserPermissionMutation {
  userId: string
  deptId: string
  menuIds: string[]
}

function normalizeMenuNode(value: Partial<PermissionMenuNode>): PermissionMenuNode {
  return {
    id: String(value.id ?? ''),
    parentId: String(value.parentId ?? '0'),
    name: value.name || '',
    code: value.code || '',
    level: Number(value.level || 0),
    defaultFlag: Number(value.defaultFlag || 0),
    sort: Number(value.sort || 0),
    status: Number(value.status ?? 1),
    children: (value.children || []).map(normalizeMenuNode),
  }
}

function normalizePermission(value: Partial<UserDepartmentPermission>): UserDepartmentPermission {
  return {
    deptId: String(value.deptId ?? ''),
    deptName: value.deptName || '',
    deptRole: value.deptRole,
    menuIds: (value.menuIds || []).map(String),
    menus: (value.menus || []).map((item) => ({
      menuId: String(item.menuId ?? ''),
      code: item.code || '',
      name: item.name || '',
      moduleId: String(item.moduleId ?? ''),
      moduleCode: item.moduleCode || '',
      moduleName: item.moduleName || '',
    })),
  }
}

export async function getPermissionMenuTree() {
  const result = await apiClient.post<never, PermissionMenuNode[]>('/v1/perm/menu/list')
  return (result || []).map(normalizeMenuNode)
}

export async function getUserDepartmentPermissions(userId: string, deptId?: string) {
  const result = await apiClient.post<never, UserDepartmentPermission[]>('/v1/perm/user/perm/list', {
    userId,
    ...(deptId ? { deptId } : {}),
  })
  return (result || []).map(normalizePermission)
}

export function saveUserDepartmentPermissions(input: UserPermissionMutation) {
  return apiClient.post<never, void>('/v1/perm/user/perm/save', input)
}

export function grantUserDepartmentPermissions(input: UserPermissionMutation) {
  return apiClient.post<never, void>('/v1/perm/user/perm/grant', input)
}

export function revokeUserDepartmentPermissions(input: UserPermissionMutation) {
  return apiClient.post<never, void>('/v1/perm/user/perm/revoke', input)
}
