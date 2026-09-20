import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getOrganization, getRole, portalData } from '@/mocks/portal'
import type { CurrentUser, OrganizationId, RoleId } from '@/types'

export const useUserStore = defineStore('user', () => {
  // 用户不再可选择 Mock 身份。升级前遗留的 Mock 会话一律清理，避免它绕过真实登录。
  if (localStorage.getItem('auth_mode') === 'mock') {
    ;['access_token', 'current_user', 'active_dept_id', 'token_expires_at'].forEach((key) => localStorage.removeItem(key))
    localStorage.setItem('auth_mode', 'real')
  }
  const token = ref(localStorage.getItem('access_token') || '')
  const storedUser = localStorage.getItem('current_user')
  let restoredUser: CurrentUser | null = null
  try {
    restoredUser = storedUser ? JSON.parse(storedUser) as CurrentUser : null
  } catch {
    // 本地缓存损坏不能阻止进入登录页；下次真实登录会重新写入用户信息。
    localStorage.removeItem('current_user')
  }
  const currentUser = ref<CurrentUser | null>(restoredUser)
  const activeDeptId = ref<string | undefined>(localStorage.getItem('active_dept_id') || undefined)
  const expiresAt = ref(Number(localStorage.getItem('token_expires_at') || 0))
  const authMode = ref<'real'>('real')
  const organizationId = ref<OrganizationId>((localStorage.getItem('organization_id') as OrganizationId) || 'natural-resources')
  const roleId = ref<RoleId>((localStorage.getItem('role_id') as RoleId) || 'admin')
  const isLoggedIn = computed(() => Boolean(token.value))
  const organization = computed(() => getOrganization(organizationId.value))
  // 当前演示账号被授予两套业务单位的查看与切换能力；后端部门权限不在此处改写。
  const availableOrganizations = computed(() => portalData.organizations)
  const role = computed(() => getRole(roleId.value))
  const name = computed(() => currentUser.value?.realName || currentUser.value?.nickname || currentUser.value?.username || `${organization.value.shortName}${role.value.name}`)
  const permissions = computed(() => role.value.permissions)

  function organizationFromDepartmentName(deptName?: string): OrganizationId | undefined {
    if (!deptName) return undefined
    if (deptName.includes('农业农村')) return 'agriculture-rural'
    if (deptName.includes('自然资源')) return 'natural-resources'
    return undefined
  }

  function setRealSession(accessToken: string, userInfo: CurrentUser, expiresIn: number, deptId?: string) {
    token.value = accessToken
    currentUser.value = userInfo
    activeDeptId.value = deptId
    expiresAt.value = Date.now() + expiresIn * 1000
    authMode.value = 'real'
    roleId.value = userInfo.role === 'ADMIN' ? 'admin' : 'staff'
    const initialOrganization = organizationFromDepartmentName(
      userInfo.deptName || userInfo.deptList?.find((department) => department.deptId === deptId)?.deptName,
    )
    if (initialOrganization) organizationId.value = initialOrganization
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('current_user', JSON.stringify(userInfo))
    localStorage.setItem('token_expires_at', String(expiresAt.value))
    localStorage.setItem('auth_mode', 'real')
    localStorage.setItem('role_id', roleId.value)
    if (initialOrganization) localStorage.setItem('organization_id', initialOrganization)
    if (deptId) localStorage.setItem('active_dept_id', deptId)
    else localStorage.removeItem('active_dept_id')
  }

  /** 部门切换接口会重新签发 token，但不会重复返回用户资料。 */
  function setDepartmentSession(accessToken: string, expiresIn: number, deptId?: string) {
    token.value = accessToken
    activeDeptId.value = deptId
    expiresAt.value = Date.now() + expiresIn * 1000
    authMode.value = 'real'
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('token_expires_at', String(expiresAt.value))
    localStorage.setItem('auth_mode', 'real')
    if (deptId) localStorage.setItem('active_dept_id', deptId)
    else localStorage.removeItem('active_dept_id')
  }

  function switchOrganization(nextOrganizationId: OrganizationId) {
    organizationId.value = nextOrganizationId
    localStorage.setItem('organization_id', nextOrganizationId)
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
    availableOrganizations,
    role,
    name,
    permissions,
    isLoggedIn,
    setRealSession,
    setDepartmentSession,
    switchOrganization,
    logout,
    hasPermission,
  }
})
