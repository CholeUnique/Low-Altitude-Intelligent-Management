<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getUserDetail, getUserPage } from '@/api/account-management'
import {
  getPermissionMenuTree,
  getUserDepartmentPermissions,
  grantUserDepartmentPermissions,
  revokeUserDepartmentPermissions,
  saveUserDepartmentPermissions,
  type PermissionMenuNode,
  type UserDepartmentPermission,
} from '@/api/permission-management'
import type { CurrentUser } from '@/types'
import { useUserStore } from '@/stores/user'
import { canDepartmentAdminManageUser, hasDepartmentAdminRole, isDepartmentAdmin as isDepartmentAdminInDept, mergeUserDepartmentIdentity, needsDepartmentRoleLookup, userRoleLabel } from '@/utils/user-role'

const userStore = useUserStore()
const isSystemAdmin = computed(() => userStore.currentUser?.role === 'ADMIN')
const isDepartmentAdmin = computed(() => userStore.isActiveDepartmentAdmin)

const users = ref<CurrentUser[]>([])
const userKeyword = ref('')
const userLoading = ref(false)
const selectedUserId = ref('')
const menuTree = ref<PermissionMenuNode[]>([])
const permissions = ref<UserDepartmentPermission[]>([])
const selectedDeptId = ref('')
const baselineMenuIds = ref<Set<string>>(new Set())
const checkedMenuIds = ref<Set<string>>(new Set())
const permissionLoading = ref(false)
const submitting = ref(false)
const notice = ref('')
const errorMessage = ref('')
let userLoadVersion = 0
let permissionLoadVersion = 0

const selectedUser = computed(() => users.value.find((item) => String(item.id) === selectedUserId.value))
const selectedDepartment = computed(() => permissions.value.find((item) => item.deptId === selectedDeptId.value))

const modules = computed(() => {
  const enabled = menuTree.value.filter((item) => item.status !== 0)
  const firstLevel = enabled.filter((item) => item.level === 1 || item.parentId === '0')
  return firstLevel
    .map((module) => ({
      ...module,
      children: (module.children?.length ? module.children : enabled.filter((item) => item.parentId === module.id))
        .filter((item) => item.status !== 0)
        .sort((a, b) => a.sort - b.sort),
    }))
    .sort((a, b) => a.sort - b.sort)
})

// 后端权限接口仅接受“启用状态的二级菜单”。一级模块只负责界面分组和批量选择，不能提交。
const assignableIds = computed(() => new Set(modules.value.flatMap((module) => module.children.map((item) => item.id))))
const selectedPermissionCount = computed(() => [...checkedMenuIds.value].filter((id) => assignableIds.value.has(id)).length)
const addedMenuIds = computed(() => [...checkedMenuIds.value].filter((id) => !baselineMenuIds.value.has(id)))
const removedMenuIds = computed(() => [...baselineMenuIds.value].filter((id) => !checkedMenuIds.value.has(id)))
const hasChanges = computed(() => addedMenuIds.value.length > 0 || removedMenuIds.value.length > 0)

function describeError(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function showNotice(message: string) {
  notice.value = message
  errorMessage.value = ''
  window.setTimeout(() => {
    if (notice.value === message) notice.value = ''
  }, 2600)
}

function showError(error: unknown) {
  errorMessage.value = describeError(error)
  notice.value = ''
}

function normalizeUser(value: CurrentUser): CurrentUser {
  return {
    ...value,
    id: String(value.id),
    deptId: value.deptId == null ? undefined : String(value.deptId),
    defaultDeptId: value.defaultDeptId == null ? undefined : String(value.defaultDeptId),
    deptList: (value.deptList || []).map((item) => ({ ...item, deptId: String(item.deptId) })),
  }
}

function canAssignPermissions(user: CurrentUser | undefined) {
  if (!user || user.role === 'ADMIN') return false
  if (isSystemAdmin.value) return true
  if (!isDepartmentAdmin.value || user.role !== 'USER' || hasDepartmentAdminRole(user)) return false
  const deptId = String(userStore.activeDeptId || '')
  return Boolean(deptId) && canDepartmentAdminManageUser(user, String(userStore.currentUser?.id || ''), [deptId])
}

async function loadUsers() {
  const version = ++userLoadVersion
  ++permissionLoadVersion
  permissionLoading.value = false
  userLoading.value = true
  try {
    const deptId = isDepartmentAdmin.value ? userStore.activeDeptId : undefined
    const result = await getUserPage({ pageNum: 1, pageSize: 100, keyword: userKeyword.value.trim(), role: isSystemAdmin.value ? '' : 'USER', deptId })
    // 与用户管理页使用同一身份来源：role=USER 还可能是部门管理员。
    const resolved = await Promise.all((result.records || []).map(async (record) => {
      const row = normalizeUser(record)
      if (!needsDepartmentRoleLookup(row, isDepartmentAdmin.value)) return row
      try {
        const detail = normalizeUser(await getUserDetail(row.id, deptId))
        return mergeUserDepartmentIdentity(row, detail)
      } catch {
        return row
      }
    }))
    if (version !== userLoadVersion) return
    users.value = resolved.filter(canAssignPermissions)
    if (!users.value.some((item) => String(item.id) === selectedUserId.value)) {
      selectedUserId.value = users.value[0] ? String(users.value[0].id) : ''
    }
    if (selectedUserId.value) await loadPermissions()
    else clearPermissionState()
  } catch (error) {
    if (version === userLoadVersion) showError(error)
  } finally {
    if (version === userLoadVersion) userLoading.value = false
  }
}

function clearPermissionState() {
  ++permissionLoadVersion
  permissionLoading.value = false
  permissions.value = []
  selectedDeptId.value = ''
  baselineMenuIds.value = new Set()
  checkedMenuIds.value = new Set()
}

function mergeUserDepartments(result: UserDepartmentPermission[]) {
  const merged = new Map(result.map((item) => [item.deptId, item]))
  for (const dept of selectedUser.value?.deptList || []) {
    if (isDepartmentAdmin.value && String(dept.deptId) !== String(userStore.activeDeptId)) continue
    const deptId = String(dept.deptId)
    if (!merged.has(deptId)) {
      merged.set(deptId, { deptId, deptName: dept.deptName, menuIds: [], menus: [] })
    }
  }
  return [...merged.values()]
}

async function loadPermissions(preferredDeptId = selectedDeptId.value) {
  if (!selectedUserId.value) return clearPermissionState()
  const version = ++permissionLoadVersion
  const userId = selectedUserId.value
  permissionLoading.value = true
  try {
    const result = await getUserDepartmentPermissions(userId, isDepartmentAdmin.value ? userStore.activeDeptId : undefined)
    if (version !== permissionLoadVersion || userId !== selectedUserId.value) return
    permissions.value = mergeUserDepartments(isDepartmentAdmin.value ? result.filter((item) => item.deptId === String(userStore.activeDeptId)) : result)
    const defaultDeptId = String(selectedUser.value?.defaultDeptId || selectedUser.value?.deptId || '')
    selectedDeptId.value = permissions.value.some((item) => item.deptId === preferredDeptId)
      ? preferredDeptId
      : permissions.value.some((item) => item.deptId === defaultDeptId)
        ? defaultDeptId
        : permissions.value[0]?.deptId || ''
    resetDraft()
  } catch (error) {
    if (version === permissionLoadVersion) {
      clearPermissionState()
      showError(error)
    }
  } finally {
    if (version === permissionLoadVersion) permissionLoading.value = false
  }
}

async function selectUser(user: CurrentUser) {
  if (!canAssignPermissions(user)) return
  if (String(user.id) === selectedUserId.value) return
  selectedUserId.value = String(user.id)
  selectedDeptId.value = ''
  await loadPermissions('')
}

function selectDepartment(deptId: string) {
  if (isDepartmentAdmin.value && deptId !== String(userStore.activeDeptId)) return
  if (deptId === selectedDeptId.value) return
  selectedDeptId.value = deptId
  resetDraft()
}

function resetDraft() {
  const source = (selectedDepartment.value?.menuIds || []).filter((id) => assignableIds.value.has(String(id)))
  baselineMenuIds.value = new Set(source.map(String))
  checkedMenuIds.value = new Set(source.map(String))
}

function moduleState(module: PermissionMenuNode) {
  const ids = module.children.map((item) => item.id)
  if (!ids.length) return 'empty'
  const count = ids.filter((id) => checkedMenuIds.value.has(id)).length
  if (!count) return 'empty'
  return count === ids.length ? 'checked' : 'partial'
}

function toggleModule(module: PermissionMenuNode) {
  if (!module.children.length) return
  const next = new Set(checkedMenuIds.value)
  const childIds = module.children.map((item) => item.id)
  const shouldCheck = moduleState(module) !== 'checked'
  if (shouldCheck) {
    childIds.forEach((id) => next.add(id))
  } else {
    childIds.forEach((id) => next.delete(id))
  }
  checkedMenuIds.value = next
}

function togglePermission(menuId: string) {
  if (!assignableIds.value.has(menuId)) return
  const next = new Set(checkedMenuIds.value)
  if (next.has(menuId)) next.delete(menuId)
  else next.add(menuId)
  checkedMenuIds.value = next
}

function mutationPayload(menuIds: string[]) {
  if (!canAssignPermissions(selectedUser.value) || !selectedDeptId.value || (isDepartmentAdmin.value && selectedDeptId.value !== String(userStore.activeDeptId))) {
    throw new Error('无权为该用户配置所属部门权限')
  }
  return {
    userId: selectedUserId.value,
    deptId: selectedDeptId.value,
    menuIds: [...new Set(menuIds.filter((id) => assignableIds.value.has(String(id))).map(String))],
  }
}

async function submitSave() {
  if (!selectedUserId.value || !selectedDeptId.value) return
  submitting.value = true
  try {
    await saveUserDepartmentPermissions(mutationPayload([...checkedMenuIds.value]))
    showNotice('部门权限已保存')
    await loadPermissions(selectedDeptId.value)
  } catch (error) {
    showError(error)
  } finally {
    submitting.value = false
  }
}

async function submitGrant() {
  if (!addedMenuIds.value.length) return
  submitting.value = true
  try {
    await grantUserDepartmentPermissions(mutationPayload(addedMenuIds.value))
    showNotice(`已授予 ${addedMenuIds.value.length} 项权限`)
    await loadPermissions(selectedDeptId.value)
  } catch (error) {
    showError(error)
  } finally {
    submitting.value = false
  }
}

async function submitRevoke() {
  if (!removedMenuIds.value.length) return
  submitting.value = true
  try {
    await revokeUserDepartmentPermissions(mutationPayload(removedMenuIds.value))
    showNotice(`已回收 ${removedMenuIds.value.length} 项权限`)
    await loadPermissions(selectedDeptId.value)
  } catch (error) {
    showError(error)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    menuTree.value = await getPermissionMenuTree()
  } catch (error) {
    showError(error)
  }
  await loadUsers()
})
</script>

<template>
  <div class="permission-panel">
    <div v-if="notice" class="permission-message permission-message--success">{{ notice }}</div>
    <div v-if="errorMessage" class="permission-message permission-message--error">{{ errorMessage }}<button type="button" @click="errorMessage = ''">×</button></div>

    <div class="permission-heading">
      <div><h2>权限管理</h2><p>按所属部门配置功能访问权限；部门管理员只能管理本部门普通用户，不能管理同级管理员</p></div>
      <button class="button button--ghost" type="button" :disabled="permissionLoading" @click="loadPermissions()">刷新权限</button>
    </div>

    <div class="permission-layout">
      <section class="user-card">
        <header><div><h3>{{ isSystemAdmin ? '选择用户' : '选择普通用户' }}</h3><span>{{ users.length }} 人</span></div></header>
        <form class="user-search" @submit.prevent="loadUsers"><input v-model.trim="userKeyword" placeholder="搜索账号、姓名或手机号"><button type="submit">查询</button></form>
        <div class="user-list">
          <div v-if="userLoading" class="permission-empty">正在加载用户…</div>
          <div v-else-if="!users.length" class="permission-empty">暂无符合条件的用户</div>
          <button v-for="user in users" v-else :key="user.id" type="button" :class="{ active: String(user.id) === selectedUserId }" @click="selectUser(user)">
            <span class="user-avatar">{{ (user.realName || user.nickname || user.username || '用').slice(0, 1) }}</span>
            <span class="user-info"><strong>{{ user.realName || user.nickname || user.username }}</strong><small>@{{ user.username }}</small></span>
            <span class="user-role">{{ userRoleLabel(user) }}</span>
          </button>
        </div>
      </section>

      <section class="permission-card">
        <header class="selected-user-header">
          <div v-if="selectedUser"><span class="selected-avatar">{{ (selectedUser.realName || selectedUser.nickname || selectedUser.username).slice(0, 1) }}</span><div><h3>{{ selectedUser.realName || selectedUser.nickname || selectedUser.username }}</h3><p>@{{ selectedUser.username }} · {{ userRoleLabel(selectedUser) }}</p></div></div>
          <div v-else><div><h3>请选择用户</h3><p>选择用户后可查询和配置部门权限</p></div></div>
          <span v-if="selectedUser" class="department-count">{{ permissions.length }} 个所属部门</span>
        </header>

        <div v-if="permissionLoading" class="permission-empty permission-empty--large">正在查询用户权限…</div>
        <div v-else-if="!selectedUser" class="permission-empty permission-empty--large"><b>尚未选择用户</b><span>请从左侧用户列表中选择需要配置权限的账号</span></div>
        <div v-else-if="!permissions.length" class="permission-empty permission-empty--large"><b>该用户未归属任何部门</b><span>请先在用户管理中为该用户设置所属部门</span></div>
        <template v-else>
          <div class="department-tabs" role="tablist" aria-label="所属部门">
            <button v-for="dept in permissions" :key="dept.deptId" type="button" :class="{ active: dept.deptId === selectedDeptId }" :disabled="isDepartmentAdmin" @click="selectDepartment(dept.deptId)">
              <span>{{ dept.deptName || `部门 ${dept.deptId}` }}</span><small>{{ isDepartmentAdminInDept(selectedUser, dept.deptId) ? '部门管理员' : '普通用户' }}</small>
            </button>
          </div>

          <div class="scope-note"><span>当前配置范围</span><strong>{{ selectedDepartment?.deptName || '-' }}</strong><p>勾选表示拥有权限；不同部门身份的权限相互独立。</p></div>

          <div class="matrix-toolbar">
            <div><h3>功能权限</h3><span>已选 {{ selectedPermissionCount }} 项<span v-if="hasChanges" class="change-summary">＋{{ addedMenuIds.length }} / －{{ removedMenuIds.length }}</span></span></div>
            <div class="permission-actions">
              <button type="button" :disabled="submitting || !hasChanges" @click="resetDraft">撤销修改</button>
              <button type="button" :disabled="submitting || !addedMenuIds.length" @click="submitGrant">授予新增项</button>
              <button class="danger" type="button" :disabled="submitting || !removedMenuIds.length" @click="submitRevoke">回收取消项</button>
              <button class="primary" type="button" :disabled="submitting || !hasChanges" @click="submitSave">{{ submitting ? '提交中…' : '保存全部' }}</button>
            </div>
          </div>

          <div class="permission-matrix">
            <div class="matrix-head"><strong>功能模块</strong><strong>功能项</strong></div>
            <div v-if="!modules.length" class="permission-empty">暂无可分配的权限菜单</div>
            <div v-for="module in modules" v-else :key="module.id" class="module-row">
              <label class="module-check">
                <input type="checkbox" :checked="moduleState(module) === 'checked'" :indeterminate.prop="moduleState(module) === 'partial'" :disabled="!module.children.length" @change="toggleModule(module)">
                <span><strong>{{ module.name }}</strong><small>{{ module.code }}</small></span>
              </label>
              <div class="menu-checks">
                <span v-if="!module.children.length" class="no-menu-item">暂无启用的二级权限项</span>
                <label v-for="menu in module.children" v-else :key="menu.id" :class="{ default: menu.defaultFlag === 1 }">
                  <input type="checkbox" :checked="checkedMenuIds.has(menu.id)" @change="togglePermission(menu.id)"><span>{{ menu.name }}</span><em v-if="menu.defaultFlag === 1">默认</em>
                </label>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.permission-panel{color:var(--ui-body)}
.permission-heading{min-height:54px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between}
.permission-heading h2,.permission-heading p,.permission-card h3,.user-card h3{margin:0}
.permission-heading h2{font-size:25px;color:var(--ui-text)}
.permission-heading p{margin-top:6px;color:var(--ui-muted);font-size:14px}
.button{min-height:40px;padding:0 17px;color:var(--ui-text);background:var(--ui-input);border:1px solid var(--ui-border);border-radius:var(--ui-control-radius);cursor:pointer;transition:background var(--ui-motion),border-color var(--ui-motion)}
.button:hover:not(:disabled){background:var(--ui-hover);border-color:var(--ui-accent)}
.button:disabled{opacity:.45;cursor:not-allowed}
.permission-layout{display:grid;grid-template-columns:310px minmax(0,1fr);gap:18px}
.user-card,.permission-card{min-height:680px;display:flex;flex-direction:column;overflow:hidden;background:var(--ui-panel-background);border:1px solid var(--ui-border);border-radius:var(--ui-radius);box-shadow:var(--ui-shadow)}
.user-card>header,.selected-user-header{flex:none;min-height:68px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:transparent;border-bottom:1px solid var(--ui-divider)}
.user-card>header>div{display:flex;align-items:center;gap:9px}
.user-card h3,.permission-card h3{font-size:18px;color:var(--ui-text)}
.user-card header span{padding:3px 9px;color:var(--ui-link);background:var(--ui-selected);border-radius:10px;font-size:11px}
.user-search{flex:none;padding:12px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;background:transparent;border-bottom:1px solid var(--ui-divider)}
.user-search input{min-width:0;min-height:40px;padding:0 10px;color:var(--ui-body);background:var(--ui-input);border:1px solid var(--ui-border);border-radius:var(--ui-control-radius)}
.user-search input:focus{outline:none;border-color:var(--ui-accent)}
.user-search button{padding:0 13px;color:var(--ui-link);background:var(--ui-selected);border:1px solid var(--ui-border);border-radius:var(--ui-control-radius);cursor:pointer}
.user-search button:hover{background:var(--ui-hover);border-color:var(--ui-accent);color:var(--ui-text)}
.user-list{flex:1;min-height:0;overflow:auto;padding:8px}
.user-list>button{width:100%;min-height:65px;margin-bottom:6px;padding:9px 10px;display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:9px;align-items:center;color:var(--ui-body);background:transparent;border:1px solid transparent;border-radius:8px;text-align:left;cursor:pointer;transition:background var(--ui-motion),border-color var(--ui-motion)}
.user-list>button:hover{background:var(--ui-hover)}
.user-list>button.active{background:var(--ui-selected);border-color:var(--ui-accent)}
.user-list>button.active{box-shadow:inset 3px 0 var(--ui-accent)}
.user-avatar,.selected-avatar{display:grid;place-items:center;color:#eafcff;background:linear-gradient(145deg,#12708c,#1fabc9);border-radius:50%;font-weight:700}
.user-avatar{width:36px;height:36px}
.user-info strong,.user-info small{display:block}
.user-info strong{overflow:hidden;color:var(--ui-text);font-size:14px;text-overflow:ellipsis;white-space:nowrap}
.user-info small{margin-top:4px;color:var(--ui-muted)}
.user-role{padding:3px 6px;color:var(--ui-link);background:var(--ui-selected);border-radius:4px;font-size:10px}
.selected-user-header>div{display:flex;align-items:center;gap:11px}
.selected-avatar{width:42px;height:42px;font-size:18px}
.selected-user-header h3{font-size:18px}
.selected-user-header p{margin:4px 0 0;color:var(--ui-muted);font-size:12px}
.department-count{padding:3px 9px;color:var(--ui-link);background:var(--ui-selected);border-radius:10px;font-size:11px}
.department-tabs{flex:none;padding:12px 14px;display:flex;gap:8px;overflow-x:auto;background:transparent;border-bottom:1px solid var(--ui-divider)}
.department-tabs button{min-width:145px;padding:9px 13px;color:var(--ui-body);background:var(--ui-input);border:1px solid var(--ui-border);border-radius:var(--ui-control-radius);text-align:left;cursor:pointer;transition:background var(--ui-motion),border-color var(--ui-motion)}
.department-tabs button:hover:not(:disabled){background:var(--ui-hover)}
.department-tabs button span,.department-tabs button small{display:block}
.department-tabs button span{color:var(--ui-body);font-size:13px}
.department-tabs button small{margin-top:4px;color:var(--ui-muted);font-size:10px}
.department-tabs button.active{background:var(--ui-selected);border-color:var(--ui-accent)}
.department-tabs button.active span{color:var(--ui-text)}
.scope-note{margin:14px 16px 0;padding:11px 14px;display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:8px;align-items:center;background:var(--ui-input);border:1px solid var(--ui-border);border-radius:var(--ui-control-radius)}
.scope-note span{color:var(--ui-muted);font-size:12px}
.scope-note strong{color:var(--ui-accent)}
.scope-note p{margin:0;color:var(--ui-muted);font-size:11px;text-align:right}
.matrix-toolbar{flex:none;min-height:65px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ui-divider)}
.matrix-toolbar>div:first-child{display:flex;align-items:baseline;gap:10px}
.matrix-toolbar h3{font-size:16px;color:var(--ui-text)}
.matrix-toolbar span{color:var(--ui-muted);font-size:11px}
.change-summary{margin-left:6px;color:var(--ui-warning)!important}
.permission-actions{display:flex;gap:7px}
.permission-actions button{min-height:34px;padding:0 11px;color:var(--ui-body);background:var(--ui-input);border:1px solid var(--ui-border);border-radius:var(--ui-control-radius);font-size:12px;cursor:pointer;transition:background var(--ui-motion),border-color var(--ui-motion)}
.permission-actions button:hover:not(:disabled){background:var(--ui-hover);border-color:var(--ui-accent);color:var(--ui-text)}
.permission-actions button.primary{color:#fff;background:var(--ui-action);border-color:var(--ui-action)}
.permission-actions button.primary:hover:not(:disabled){background:var(--ui-action-hover);border-color:var(--ui-action-hover);color:#fff}
.permission-actions button.danger{color:var(--ui-danger);border-color:rgb(245 108 108 / 42%)}
.permission-actions button.danger:hover:not(:disabled){background:rgb(245 108 108 / 12%);border-color:var(--ui-danger);color:var(--ui-danger)}
.permission-actions button:disabled{opacity:.4;cursor:not-allowed}
.permission-matrix{flex:1;min-height:0;overflow:auto;padding:0 16px 16px}
.matrix-head,.module-row{display:grid;grid-template-columns:220px minmax(0,1fr)}
.matrix-head{position:sticky;top:0;z-index:2;min-height:42px;align-items:center;color:var(--ui-muted);background:var(--ui-input);border-bottom:1px solid var(--ui-divider);font-size:12px;margin:0 -16px;padding:0 16px}
.matrix-head strong:last-child{padding-left:18px}
.module-row{min-height:78px;border-bottom:1px solid var(--ui-divider)}
.module-check{padding:14px 12px 14px 2px;display:flex;align-items:flex-start;gap:9px;border-right:1px solid var(--ui-divider);cursor:pointer}
.module-check input,.menu-checks input{accent-color:var(--ui-accent)}
.module-check span strong,.module-check span small{display:block}
.module-check span strong{color:var(--ui-text);font-size:14px}
.module-check span small{margin-top:5px;color:var(--ui-muted);font-family:monospace;font-size:10px}
.menu-checks{padding:13px 18px;display:flex;align-content:center;align-items:center;flex-wrap:wrap;gap:9px 20px}
.menu-checks label{display:flex;align-items:center;gap:6px;color:var(--ui-body);font-size:13px;cursor:pointer}
.menu-checks label:has(input:checked){color:var(--ui-text)}
.menu-checks label.default em{padding:1px 6px;color:var(--ui-link);background:var(--ui-selected);border-radius:4px;font-size:9px;font-style:normal}
.permission-empty{min-height:180px;display:flex;align-items:center;justify-content:center;color:var(--ui-muted);font-size:13px}
.permission-empty--large{min-height:500px;flex-direction:column;gap:8px}
.permission-empty--large b{color:var(--ui-text);font-size:16px}
.permission-empty--large span{color:var(--ui-muted)}
.permission-message{position:fixed;top:82px;left:50%;z-index:120;max-width:560px;padding:11px 40px 11px 16px;transform:translateX(-50%);color:#fff;border-radius:var(--ui-control-radius);box-shadow:0 10px 30px #00131faa;font-size:13px}
.permission-message--success{background:rgb(32 201 151 / 92%);border:1px solid var(--ui-success)}
.permission-message--error{background:rgb(245 108 108 / 92%);border:1px solid var(--ui-danger)}
.permission-message button{position:absolute;top:4px;right:7px;color:#fff;background:transparent;border:0;font-size:20px;cursor:pointer}
.no-menu-item{color:var(--ui-muted);font-size:12px}
.module-check input:disabled{opacity:.35;cursor:not-allowed}
@media(max-width:1150px){
.permission-layout{grid-template-columns:260px minmax(0,1fr)}
.matrix-head,.module-row{grid-template-columns:175px minmax(0,1fr)}
.matrix-toolbar{padding:10px 14px;align-items:flex-start;gap:10px;flex-direction:column}
.permission-matrix{max-height:520px}
}
@media(max-width:780px){
.permission-layout{grid-template-columns:1fr}
.user-card{min-height:320px}
.user-list{max-height:260px}
.permission-card{min-height:600px}
.scope-note{grid-template-columns:auto 1fr}
.scope-note p{grid-column:1/-1;text-align:left}
.matrix-head,.module-row{grid-template-columns:1fr}
.matrix-head strong:first-child{display:none}
.matrix-head strong:last-child{padding-left:0}
.module-check{border-right:0}
.permission-actions{flex-wrap:wrap}
}
</style>
