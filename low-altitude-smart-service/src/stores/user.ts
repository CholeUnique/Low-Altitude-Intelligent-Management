import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getOrganization, getRole } from '@/mocks/portal'
import type { OrganizationId, RoleId } from '@/types'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('access_token') || '')
  const organizationId = ref<OrganizationId>((localStorage.getItem('organization_id') as OrganizationId) || 'natural-resources')
  const roleId = ref<RoleId>((localStorage.getItem('role_id') as RoleId) || 'admin')
  const isLoggedIn = computed(() => Boolean(token.value))
  const organization = computed(() => getOrganization(organizationId.value))
  const role = computed(() => getRole(roleId.value))
  const name = computed(() => `${organization.value.shortName}${role.value.name}`)
  const permissions = computed(() => role.value.permissions)

  function login(nextOrganizationId: OrganizationId, nextRoleId: RoleId) {
    token.value = `mock-token-${Date.now()}`
    organizationId.value = nextOrganizationId
    roleId.value = nextRoleId
    localStorage.setItem('access_token', token.value)
    localStorage.setItem('organization_id', organizationId.value)
    localStorage.setItem('role_id', roleId.value)
  }

  function logout() {
    token.value = ''
    localStorage.removeItem('access_token')
  }

  function hasPermission(code: string) {
    return permissions.value.includes(code)
  }

  return {
    token,
    organizationId,
    roleId,
    organization,
    role,
    name,
    permissions,
    isLoggedIn,
    login,
    logout,
    hasPermission,
  }
})
