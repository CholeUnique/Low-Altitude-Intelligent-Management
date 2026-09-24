<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getDepartmentOptions, getMyDepartments, switchDepartment, type DepartmentOption } from '@/api/auth'
import { useUserStore } from '@/stores/user'
import type { OrganizationId } from '@/types'

const user = useUserStore()
const router = useRouter()
const open = ref(false)
const loadingDepartments = ref(false)
const switchingOrganizationId = ref<OrganizationId | ''>('')
const switchError = ref('')
const departmentOptions = ref<DepartmentOption[]>([])
const organizations = computed(() => user.availableOrganizations)
const canSwitchDepartment = computed(() => user.canSwitchDepartment)

const departmentNameMatchers: Record<OrganizationId, RegExp> = {
  'natural-resources': /自然资源.*规划|自然资源/,
  'agriculture-rural': /农业农村/,
}

function findDepartment(organizationId: OrganizationId) {
  return departmentOptions.value.find((department) => departmentNameMatchers[organizationId].test(department.deptName))
}

function cachedMemberships(): DepartmentOption[] {
  return (user.currentUser?.deptList || []).map((department) => ({
    deptId: String(department.deptId),
    deptName: department.deptName,
    deptCode: department.deptCode,
  }))
}

async function loadSwitchableDepartments() {
  if (user.currentUser?.role === 'ADMIN') return getDepartmentOptions()
  return getMyDepartments()
}

async function openMenu() {
  if (!canSwitchDepartment.value) return
  open.value = !open.value
  switchError.value = ''
  if (!open.value || user.authMode !== 'real' || loadingDepartments.value) return

  departmentOptions.value = user.currentUser?.role === 'ADMIN' ? [] : cachedMemberships()
  if (departmentOptions.value.length) return

  loadingDepartments.value = true
  try {
    // 管理员读取全部可用部门，普通用户只读取自己的所属部门。
    departmentOptions.value = (await loadSwitchableDepartments()).map((department) => ({
      deptId: String(department.deptId),
      deptName: department.deptName,
      deptCode: department.deptCode,
    }))
  } catch (error) {
    switchError.value = error instanceof Error ? `部门列表加载失败：${error.message}` : '部门列表加载失败，请稍后重试。'
  } finally {
    loadingDepartments.value = false
  }
}

async function selectOrganization(organizationId: OrganizationId) {
  if (!canSwitchDepartment.value) return
  if (organizationId === user.organizationId || switchingOrganizationId.value) {
    open.value = false
    return
  }

  switchError.value = ''
  switchingOrganizationId.value = organizationId
  try {
    if (user.authMode === 'real') {
      if (!departmentOptions.value.length) {
        departmentOptions.value = (await loadSwitchableDepartments()).map((department) => ({
          deptId: String(department.deptId),
          deptName: department.deptName,
          deptCode: department.deptCode,
        }))
      }
      const department = findDepartment(organizationId)
      if (!department) {
        throw new Error(`未在后端部门列表中找到“${organizationId === 'agriculture-rural' ? '农业农村局' : '自然资源和规划局'}”，无法切换数据视角。`)
      }

      // 后端以 targetDeptId 确认当前部门数据视角，并返回必须替换的新 token。
      const result = await switchDepartment(department.deptId)
      user.setDepartmentSession(result.accessToken, result.expiresIn, result.activeDeptId || department.deptId)
    }

    user.switchOrganization(organizationId)
    open.value = false
    await router.push('/dashboard')
  } catch (error) {
    switchError.value = error instanceof Error ? error.message : '单位切换失败，请稍后重试。'
  } finally {
    switchingOrganizationId.value = ''
  }
}
</script>

<template>
  <div class="organization-switcher">
    <button v-if="canSwitchDepartment" class="switch-trigger" type="button" title="切换单位" aria-label="切换单位" @click="openMenu">
      {{ user.organization.shortName }}　⌄
    </button>
    <span v-else class="switch-trigger switch-trigger--readonly" title="当前单位">
      {{ user.organization.shortName }}
    </span>
    <div v-if="open" class="switch-menu">
      <p>{{ loadingDepartments ? '正在读取后端部门…' : '可切换单位' }}</p>
      <button
        v-for="organization in organizations"
        :key="organization.id"
        type="button"
        :class="{ active: organization.id === user.organizationId }"
        :disabled="Boolean(switchingOrganizationId) || loadingDepartments"
        @click="selectOrganization(organization.id)"
      >
        <b>{{ organization.shortName }}</b><small>{{ organization.name }}</small><em>{{ organization.id === user.organizationId ? '当前' : switchingOrganizationId === organization.id ? '切换中…' : '切换' }}</em>
      </button>
      <small v-if="switchError" class="switch-error">{{ switchError }}</small>
    </div>
  </div>
</template>

<style scoped>
.organization-switcher { position: relative; z-index: 30; }
.switch-trigger { min-height: 34px; padding: 0 12px!important; border: 1px solid #1b6686!important; border-radius: 4px!important; color: #d1f0f8!important; background: #063957cc!important; font-size: 16px!important; font-weight: 600; }
.switch-trigger--readonly { display: inline-flex; align-items: center; cursor: default; }
.switch-menu { position: absolute; z-index: 50; top: calc(100% + 8px); right: 0; width: 250px; padding: 8px; border: 1px solid #177fa9; border-radius: 5px; background: #042941f5; box-shadow: 0 8px 22px #001524aa; }
.switch-menu p { margin: 2px 7px 6px; color: #78acbf; font-size: 12px; }.switch-menu button { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 9px 8px; border: 0!important; border-top: 1px solid #0e4d6a!important; border-radius: 0!important; color: #c5e8f0!important; background: transparent!important; text-align: left; }.switch-menu button:hover,.switch-menu button.active { background: #0877a534!important; }.switch-menu button:disabled { cursor: wait; opacity: .65; }.switch-menu b { font-size: 14px; }.switch-menu small { grid-column: 1; color: #6d9bad; font-size: 12px; }.switch-menu em { grid-column: 2; grid-row: 1 / 3; align-self: center; color: #52ddcd; font-size: 12px; font-style: normal; }.switch-error { display: block; margin: 8px 5px 2px; color: #ffaeae; font-size: 12px; line-height: 1.45; }
</style>
