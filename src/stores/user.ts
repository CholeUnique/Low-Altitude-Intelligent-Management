import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getOrganization, getRole } from '@/mocks/portal'
import type { CurrentUser, OrganizationId, RoleId } from '@/types'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('access_token') || '')
  const storedUser = localStorage.getItem('current_user')
  const currentUser = ref<CurrentUser | null>(storedUser ? JSON.parse(storedUser) : null)
  const activeDeptId = ref<string | undefined>(localStorage.getItem('active_dept_id') || undefined)
  const expiresAt = ref(Number(localStorage.getItem('token_expires_at') || 0))
  const authMode = ref<'real' | 'mock'>((localStorage.getItem('auth_mode') as 'real' | 'mock') || 'mock')
  const organizationId = ref<OrganizationId>((localStorage.getItem('organization_id') as OrganizationId) || 'natural-resources')
  const roleId = ref<RoleId>((localStorage.getItem('role_id') as RoleId) || 'admin')
  const isLoggedIn = computed(() => Boolean(token.value))
  const organization = computed(() => getOrganization(organizationId.value))
  const role = computed(() => getRole(roleId.value))
  const name = computed(() => currentUser.value?.realName || currentUser.value?.nickname || currentUser.value?.username || `${organization.value.shortName}${role.value.name}`)
  const permissions = computed(() => role.value.permissions)

  function loginMock(nextOrganizationId: OrganizationId, nextRoleId: RoleId) {
    token.value = `mock-token-${Date.now()}`
    currentUser.value = null
    authMode.value = 'mock'
    organizationId.value = nextOrganizationId
    roleId.value = nextRoleId
    localStorage.setItem('access_token', token.value)
    localStorage.setItem('auth_mode', 'mock')
    localStorage.setItem('organization_id', organizationId.value)
    localStorage.setItem('role_id', roleId.value)
  }

  function setRealSession(accessToken: string, userInfo: CurrentUser, expiresIn: number, deptId?: string) {
    token.value = accessToken
    currentUser.value = userInfo
    activeDeptId.value = deptId
    expiresAt.value = Date.now() + expiresIn * 1000
    authMode.value = 'real'
    roleId.value = userInfo.role === 'ADMIN' ? 'admin' : 'staff'
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('current_user', JSON.stringify(userInfo))
    localStorage.setItem('token_expires_at', String(expiresAt.value))
    localStorage.setItem('auth_mode', 'real')
    localStorage.setItem('role_id', roleId.value)
    if (deptId) localStorage.setItem('active_dept_id', deptId)
    else localStorage.removeItem('active_dept_id')
  }

  function logout() {
    token.value = ''
    currentUser.value = null
    activeDeptId.value = undefined
    expiresAt.value = 0
    localStorage.removeItem('access_token')
    localStorage.removeItem('current_user')
    localStorage.removeItem('active_dept_id')
    localStorage.removeItem('token_expires_at')
  }

  function hasPermission(code: string) {
    return permissions.value.includes(code)
  }

  return {
    token,
    currentUser,
    activeDeptId,
    expiresAt,
    authMode,
    organizationId,
    roleId,
    organization,
    role,
    name,
    permissions,
    isLoggedIn,
    login: loginMock,
    loginMock,
    setRealSession,
    logout,
    hasPermission,
  }
})
