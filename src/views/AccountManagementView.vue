<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getCurrentUser } from '@/api/auth'
import { ApiBusinessError } from '@/api/client'
import {
  addDepartment,
  addUser,
  changeMyPassword,
  deleteDepartment,
  deleteUser,
  getDepartmentDetail,
  getDepartmentList,
  getUserDetail,
  getUserPage,
  resetUserPassword,
  setUserDepartmentAdmin,
  updateDepartment,
  updateDepartmentStatus,
  updateMyInfo,
  updateUser,
  updateUserStatus,
  type DepartmentInfo,
  type UserCreateInput,
} from '@/api/account-management'
import { useUserStore } from '@/stores/user'
import MetadataManagementPanel from '@/components/MetadataManagementPanel.vue'
import MapServiceManagementPanel from '@/components/MapServiceManagementPanel.vue'
import PermissionManagementPanel from '@/components/PermissionManagementPanel.vue'
import SceneManagementPanel from '@/components/SceneManagementPanel.vue'
import ManagementNavIcon from '@/components/ManagementNavIcon.vue'
import StatusConfirmDialog from '@/components/StatusConfirmDialog.vue'
import type { CurrentUser } from '@/types'
import { formatBeijingDateTime } from '@/utils/date-time'
import { canDepartmentAdminManageUser, departmentAdminFlag, hasDepartmentAdminRole, isDepartmentAdmin as isDepartmentAdminInDept, mergeUserDepartmentIdentity, needsDepartmentRoleLookup, userRoleLabel } from '@/utils/user-role'

type Section = 'profile' | 'users' | 'departments' | 'scenes' | 'permissions' | 'metadata' | 'map-services'
type EditorMode = 'add' | 'edit' | 'view'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const activeSection = ref<Section>('profile')
const isAdmin = computed(() => userStore.currentUser?.role === 'ADMIN')
const isDepartmentAdmin = computed(() => isDepartmentAdminInDept(userStore.currentUser, userStore.activeDeptId))
const canManageDepartment = computed(() => isAdmin.value || isDepartmentAdmin.value)
const roleName = computed(() => userRoleLabel(userStore.currentUser))
const allowedSections = computed<Section[]>(() => isAdmin.value
  ? ['profile', 'users', 'departments', 'scenes', 'permissions', 'metadata', 'map-services']
  : isDepartmentAdmin.value ? ['profile', 'users', 'departments', 'scenes', 'permissions'] : ['profile'])
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

function normalizeUser(value: CurrentUser): CurrentUser {
  return { ...value, id: String(value.id), deptList: value.deptList || [] }
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function showResult(message: string) {
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

function returnToSystem() {
  const returnTo = typeof route.query.returnTo === 'string' ? route.query.returnTo : '/dashboard'
  router.push(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard')
}

const profileForm = reactive({
  realName: '',
  nickname: '',
  gender: 0,
  avatar: '',
  phone: '',
  email: '',
})
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const passwordDialogOpen = ref(false)

function openPasswordDialog() {
  Object.assign(passwordForm, { oldPassword: '', newPassword: '', confirmPassword: '' })
  errorMessage.value = ''
  passwordDialogOpen.value = true
}

function closePasswordDialog() {
  if (busy.value) return
  passwordDialogOpen.value = false
  Object.assign(passwordForm, { oldPassword: '', newPassword: '', confirmPassword: '' })
}

function fillProfile(value: CurrentUser) {
  profileForm.realName = value.realName || ''
  profileForm.nickname = value.nickname || ''
  profileForm.gender = value.gender ?? 0
  profileForm.avatar = value.avatar || ''
  profileForm.phone = value.phone || ''
  profileForm.email = value.email || ''
}

async function loadProfile() {
  busy.value = true
  try {
    const profile = normalizeUser(await getCurrentUser())
    const cachedDepartments = userStore.currentUser?.deptList || []
    profile.deptList = (profile.deptList.length ? profile.deptList : cachedDepartments).map((department) => ({
      ...department,
      isDeptAdmin: departmentAdminFlag(department.isDeptAdmin) ?? departmentAdminFlag(cachedDepartments.find((item) => String(item.deptId) === String(department.deptId))?.isDeptAdmin),
    }))
    userStore.setCurrentUser(profile)
    fillProfile(profile)
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

async function saveProfile() {
  busy.value = true
  try {
    await updateMyInfo({ ...profileForm, deptId: userStore.activeDeptId })
    await loadProfile()
    showResult('个人资料已保存')
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

async function savePassword() {
  if (passwordForm.newPassword.length < 6 || passwordForm.newPassword.length > 64) return showError(new Error('新密码长度需要为 6–64 位'))
  if (passwordForm.newPassword !== passwordForm.confirmPassword) return showError(new Error('两次输入的新密码不一致'))
  busy.value = true
  try {
    await changeMyPassword({
      deptId: userStore.activeDeptId,
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    })
    userStore.logout()
    await router.replace({ name: 'login', query: { message: '密码修改成功，请重新登录' } })
  } catch (error) {
    showError(error)
    busy.value = false
  }
}

const departments = ref<DepartmentInfo[]>([])
const departmentFilters = reactive<{ keyword: string; status: number | '' }>({ keyword: '', status: '' })
const departmentLoading = ref(false)

async function loadDepartments(silent = false) {
  if (!canManageDepartment.value) return
  departmentLoading.value = true
  try {
    const result = await getDepartmentList({ deptId: isAdmin.value ? undefined : userStore.activeDeptId })
    const activeId = String(userStore.activeDeptId || '')
    departments.value = isDepartmentAdmin.value && activeId && !result.some((dept) => String(dept.id) === activeId)
      ? [{ id: activeId, name: userStore.currentUser?.deptName || '当前部门', status: 1 }, ...result]
      : result
  } catch (error) {
    if (!silent) showError(error)
  } finally {
    departmentLoading.value = false
  }
}

const managedDepartments = computed(() => {
  if (isAdmin.value) return departments.value
  const root = String(userStore.activeDeptId || '')
  if (!root) return []
  const allowed = new Set([root])
  let changed = true
  while (changed) {
    changed = false
    for (const dept of departments.value) {
      if (dept.parentId != null && allowed.has(String(dept.parentId)) && !allowed.has(String(dept.id))) {
        allowed.add(String(dept.id))
        changed = true
      }
    }
  }
  return departments.value.filter((dept) => allowed.has(String(dept.id)))
})
function departmentPath(dept: DepartmentInfo) {
  const path: string[] = []
  const seen = new Set<string>()
  let current: DepartmentInfo | undefined = dept
  while (current && !seen.has(String(current.id))) {
    seen.add(String(current.id))
    path.unshift(`${String(current.sort ?? 0).padStart(8, '0')}-${current.name}`)
    current = departments.value.find((item) => String(item.id) === String(current?.parentId))
  }
  return path
}
function departmentParentName(dept: DepartmentInfo) {
  if (!dept.parentId || String(dept.parentId) === '0') return '顶级部门'
  return departments.value.find((item) => String(item.id) === String(dept.parentId))?.name || `部门 ${dept.parentId}`
}
const departmentRows = computed(() => (isAdmin.value ? managedDepartments.value
  : managedDepartments.value.filter((dept) => String(dept.id) !== String(userStore.activeDeptId)))
  .filter((dept) => (!departmentFilters.keyword || `${dept.name} ${dept.code || ''}`.toLowerCase().includes(departmentFilters.keyword.toLowerCase()))
    && (departmentFilters.status === '' || Number(dept.status) === departmentFilters.status))
  .sort((left, right) => departmentPath(left).join('/').localeCompare(departmentPath(right).join('/'), 'zh-CN')))
const departmentParentOptions = computed(() => isAdmin.value ? departments.value : managedDepartments.value)
function canEditDepartment(row: DepartmentInfo) {
  return isAdmin.value || (String(row.id) !== String(userStore.activeDeptId)
    && managedDepartments.value.some((dept) => String(dept.id) === String(row.id)))
}
function canEditUser(row: CurrentUser) {
  if (String(row.id) === String(userStore.currentUser?.id) || row.role === 'ADMIN') return false
  if (isAdmin.value) return true
  return isDepartmentAdmin.value && Boolean(userStore.activeDeptId)
    && canDepartmentAdminManageUser(row, String(userStore.currentUser?.id || ''), managedDepartments.value.map((dept) => String(dept.id)))
}

const userFilters = reactive<{ keyword: string; role: 'ADMIN' | 'USER' | ''; status: number | ''; defaultDeptId: string }>({
  keyword: '',
  role: '',
  status: '',
  defaultDeptId: '',
})
const users = ref<CurrentUser[]>([])
const userTotal = ref(0)
const userPageNum = ref(1)
const userPageSize = ref(10)
const userLoading = ref(false)
let userLoadId = 0
const totalPages = computed(() => Math.max(1, Math.ceil(userTotal.value / userPageSize.value)))

async function loadUsers() {
  if (!canManageDepartment.value) return
  const loadId = ++userLoadId
  userLoading.value = true
  try {
    const result = await getUserPage({
      ...userFilters,
      role: isDepartmentAdmin.value ? 'USER' : userFilters.role,
      defaultDeptId: isAdmin.value ? userFilters.defaultDeptId : '',
      deptId: isAdmin.value ? undefined : userStore.activeDeptId,
      pageNum: userPageNum.value,
      pageSize: userPageSize.value,
    })
    // 全局 role=USER 不代表普通用户；部门管理员的分页记录可能未带正确的部门标志。
    // 当前用户为部门管理员时，仅接受明确的 true，其他记录尝试用详情复核。
    const resolved = await Promise.all((result.records || []).map(async (record) => {
      const row = normalizeUser(record)
      if (!needsDepartmentRoleLookup(row, isDepartmentAdmin.value)) {
        return row
      }
      try {
        const detail = normalizeUser(await getUserDetail(row.id, isAdmin.value ? undefined : userStore.activeDeptId))
        const merged = mergeUserDepartmentIdentity(row, detail)
        return merged
      } catch {
        return row
      }
    }))
    if (loadId !== userLoadId) return
    // 后端按当前部门返回可见用户；不要在部门树尚未加载完时再次误过滤。
    users.value = resolved
    userTotal.value = Number(result.total || 0)
    userPageNum.value = Number(result.pageNum || userPageNum.value)
  } catch (error) {
    if (loadId === userLoadId) showError(error)
  } finally {
    if (loadId === userLoadId) userLoading.value = false
  }
}

async function searchUsers() {
  userPageNum.value = 1
  await loadUsers()
}

async function changeUserPage(next: number) {
  if (next < 1 || next > totalPages.value) return
  userPageNum.value = next
  await loadUsers()
}

const userEditorOpen = ref(false)
const userEditorMode = ref<EditorMode>('add')
const originalDeptAdminIds = ref<string[]>([])
const departmentSearch = ref('')
const userEditorTitle = computed(() => ({ add: '新增用户', edit: '编辑用户', view: '用户详情' })[userEditorMode.value])
const userForm = reactive({
  id: '',
  username: '',
  password: '',
  realName: '',
  nickname: '',
  gender: 0,
  avatar: '',
  phone: '',
  email: '',
  unit: '',
  department: '',
  position: '',
  role: 'USER' as 'ADMIN' | 'DEPT_ADMIN' | 'USER',
  status: 1,
  deptIdList: [] as string[],
  deptAdminIds: [] as string[],
  defaultDeptId: '',
  remark: '',
})

const selectableUserDepartments = computed(() => isAdmin.value ? departments.value : managedDepartments.value)
const filteredUserDepartments = computed(() => {
  const keyword = departmentSearch.value.trim().toLocaleLowerCase()
  return keyword ? selectableUserDepartments.value.filter((dept) => `${dept.name} ${dept.code || ''}`.toLocaleLowerCase().includes(keyword)) : selectableUserDepartments.value
})
const selectedDepartmentChips = computed(() => userForm.deptIdList.map((id) => ({
  id,
  name: departments.value.find((dept) => String(dept.id) === id)?.name || `部门 ${id}`,
})))
const manageableFirstLevelDepartments = computed(() => departments.value.filter((dept) =>
  (!dept.parentId || String(dept.parentId) === '0') && userForm.deptIdList.includes(String(dept.id))))

function toggleUserDepartment(id: string) {
  if (userEditorMode.value === 'view') return
  if (userForm.deptIdList.includes(id)) {
    userForm.deptIdList = userForm.deptIdList.filter((item) => item !== id)
    userForm.deptAdminIds = userForm.deptAdminIds.filter((item) => item !== id)
    if (userForm.defaultDeptId === id) userForm.defaultDeptId = userForm.deptIdList[0] || ''
  } else {
    userForm.deptIdList = [...userForm.deptIdList, id]
  }
}

function toggleManagedDepartment(id: string) {
  if (userEditorMode.value === 'view' || !userForm.deptIdList.includes(id)) return
  userForm.deptAdminIds = userForm.deptAdminIds.includes(id)
    ? userForm.deptAdminIds.filter((item) => item !== id)
    : [...userForm.deptAdminIds, id]
}

function resetUserForm() {
  departmentSearch.value = ''
  Object.assign(userForm, {
    id: '', username: '', password: '', realName: '', nickname: '', gender: 0, avatar: '', phone: '', email: '',
    unit: '', department: '', position: '', role: 'USER', status: 1, deptIdList: [], deptAdminIds: [], defaultDeptId: '', remark: '',
  })
}

function fillUserForm(value: CurrentUser & { remark?: string }) {
  const deptIdList = (value.deptList || []).map((item) => String(item.deptId))
  const markedDefaultDeptId = value.deptList?.find((item) => Boolean(item.isDefault))?.deptId
  const defaultDeptCandidate = value.defaultDeptId ?? markedDefaultDeptId ?? value.deptId
  const normalizedDefaultDeptId = defaultDeptCandidate == null ? '' : String(defaultDeptCandidate)

  Object.assign(userForm, {
    id: String(value.id),
    username: value.username || '',
    password: '',
    realName: value.realName || '',
    nickname: value.nickname || '',
    gender: value.gender ?? 0,
    avatar: value.avatar || '',
    phone: value.phone || '',
    email: value.email || '',
    unit: value.unit || '',
    department: value.department || '',
    position: value.position || '',
    role: value.role === 'ADMIN' ? 'ADMIN' : hasDepartmentAdminRole(value) ? 'DEPT_ADMIN' : 'USER',
    status: value.status ?? 1,
    deptIdList,
    deptAdminIds: (value.deptList || []).filter((item) => departmentAdminFlag(item.isDeptAdmin) === true).map((item) => String(item.deptId)),
    // 只回填真正属于该用户的默认部门，并统一为字符串，避免 Long/字符串比较失败。
    defaultDeptId: deptIdList.includes(normalizedDefaultDeptId) ? normalizedDefaultDeptId : '',
    remark: value.remark || '',
  })
}

async function openUserEditor(mode: EditorMode, row?: CurrentUser) {
  if (row && !canEditUser(row)) return showError(new Error('无权管理该用户'))
  userEditorMode.value = mode
  resetUserForm()
  originalDeptAdminIds.value = []
  if (isDepartmentAdmin.value && userStore.activeDeptId) {
    userForm.deptIdList = [String(userStore.activeDeptId)]
    userForm.defaultDeptId = String(userStore.activeDeptId)
  }
  if (!departments.value.length) await loadDepartments(true)
  if (row) {
    busy.value = true
    try {
      let detail: CurrentUser
      try {
        detail = normalizeUser(await getUserDetail(String(row.id), isAdmin.value ? undefined : userStore.activeDeptId))
      } catch (error) {
        if (!isDepartmentAdmin.value || !isPermissionDenied(error)) throw error
        // 部门管理员已通过 scoped /user/page 取得该用户；详情接口在部分后端版本仅开放给系统管理员。
        const fallbackDeptId = String(row.defaultDeptId || row.deptId || userStore.activeDeptId || '')
        detail = { ...row, deptList: row.deptList?.length ? row.deptList : fallbackDeptId
          ? [{ deptId: fallbackDeptId, deptName: row.deptName || '', isDefault: true }] : [] }
      }
      fillUserForm(detail)
      originalDeptAdminIds.value = [...userForm.deptAdminIds]
      if (isDepartmentAdmin.value && userForm.role !== 'USER') throw new Error('无权管理该用户')
    } catch (error) {
      showError(error)
      return
    } finally {
      busy.value = false
    }
  }
  userEditorOpen.value = true
}

function isPermissionDenied(error: unknown) {
  if (error instanceof ApiBusinessError) return error.code === '403'
  if (!error || typeof error !== 'object' || !('response' in error)) return false
  const response = (error as { response?: { status?: number; data?: { code?: string | number } } }).response
  return response?.status === 403 || String(response?.data?.code) === '403'
}

function showUserOperationError(error: unknown) {
  showError(isDepartmentAdmin.value && isPermissionDenied(error)
    ? new Error('操作被后端拒绝：部门管理员只能管理辖区内的普通用户，不能管理同级管理员或其他部门用户。')
    : error)
}

async function confirmNewDepartmentAdmin(created: CurrentUser | null | undefined, username: string, deptIds: string[]) {
  if (!deptIds.length) return
  let userId = created?.id ? String(created.id) : ''
  if (!userId) {
    const page = await getUserPage({ keyword: username, pageNum: 1, pageSize: 100 })
    userId = String(page.records.find((item) => item.username === username)?.id || '')
  }
  if (!userId) throw new Error('账号已创建，但接口未返回用户 ID，无法设置部门管理员；请刷新用户列表后编辑该账号')
  let detail = await getUserDetail(userId)
  for (const deptId of deptIds) {
    if ((detail.deptList || []).some((item) => String(item.deptId) === deptId && departmentAdminFlag(item.isDeptAdmin) === true)) continue
    await setUserDepartmentAdmin({ deptId, userId, flag: 1 })
    detail = await getUserDetail(userId)
  }
  const verified = await getUserDetail(userId)
  const missing = deptIds.filter((deptId) => !(verified.deptList || []).some((item) => String(item.deptId) === deptId && departmentAdminFlag(item.isDeptAdmin) === true))
  if (missing.length) throw new Error('账号已创建，但部门管理员标记未写入；请检查后端 /user/dept-admin/set 接口与所属部门配置')
}

async function submitUser() {
  if (!canManageDepartment.value) return
  if (isDepartmentAdmin.value && (userForm.role !== 'USER' || !userStore.activeDeptId)) return showError(new Error('部门管理员只能管理本部门普通用户'))
  if (userForm.role === 'ADMIN') return showError(new Error('系统管理员角色不可通过用户编辑设置，仅可由系统配置'))
  if (!userForm.username.trim()) return showError(new Error('请输入登录账号'))
  if (userEditorMode.value === 'add' && userForm.password.length < 6) return showError(new Error('初始密码至少需要 6 位'))
  const normalizedDeptIdList = userForm.deptIdList.map((deptId) => String(deptId))
  const normalizedDefaultDeptId = userForm.defaultDeptId ? String(userForm.defaultDeptId) : ''
  if (isDepartmentAdmin.value) {
    const managedIds = new Set(managedDepartments.value.map((dept) => String(dept.id)))
    if (normalizedDeptIdList.some((id) => !managedIds.has(id))) {
      return showError(new Error('只能为用户选择当前部门及其下级部门'))
    }
  }
  if (normalizedDefaultDeptId && !normalizedDeptIdList.includes(normalizedDefaultDeptId)) {
    return showError(new Error('默认部门必须包含在所属部门中'))
  }
  if (!normalizedDeptIdList.length) return showError(new Error('请至少选择一个所属部门'))
  const firstLevelIds = new Set(departments.value.filter((dept) => !dept.parentId || String(dept.parentId) === '0').map((dept) => String(dept.id)))
  const adminDeptIds = userForm.role === 'DEPT_ADMIN' ? userForm.deptAdminIds.map(String) : []
  if (isAdmin.value && userForm.role === 'DEPT_ADMIN' && !adminDeptIds.length) return showError(new Error('请选择要管理的一级部门'))
  if (adminDeptIds.some((id) => !firstLevelIds.has(id) || !normalizedDeptIdList.includes(id))) {
    return showError(new Error('管理部门必须是已选所属部门中的一级部门'))
  }
  busy.value = true
  let accountCreated = false
  try {
    const common = {
      deptId: isAdmin.value ? undefined : userStore.activeDeptId,
      realName: userForm.realName,
      nickname: userForm.nickname,
      gender: userForm.gender,
      avatar: userForm.avatar,
      phone: userForm.phone,
      email: userForm.email,
      unit: userForm.unit,
      department: userForm.department,
      position: userForm.position,
      status: userForm.status,
      deptIdList: normalizedDeptIdList.map((deptId) => ({
        deptId,
        deptRole: '',
      })),
      defaultDeptId: normalizedDefaultDeptId || undefined,
      remark: userForm.remark,
    }
    if (userEditorMode.value === 'add') {
      const created = await addUser({ ...common, username: userForm.username.trim(), password: userForm.password,
        role: 'USER', deptAdminIds: isAdmin.value ? adminDeptIds : [],
      } satisfies UserCreateInput)
      accountCreated = true
      if (isAdmin.value) await confirmNewDepartmentAdmin(created, userForm.username.trim(), adminDeptIds)
      showResult(adminDeptIds.length ? '用户及部门管理员权限已创建，请该用户重新登录' : '用户已新增')
    } else {
      await updateUser({ ...common, id: userForm.id })
      if (isAdmin.value) {
        for (const deptId of originalDeptAdminIds.value.filter((id) => !adminDeptIds.includes(id))) {
          await setUserDepartmentAdmin({ deptId, userId: userForm.id, flag: 0 })
        }
        for (const deptId of adminDeptIds.filter((id) => !originalDeptAdminIds.value.includes(id))) {
          await setUserDepartmentAdmin({ deptId, userId: userForm.id, flag: 1 })
        }
      }
      showResult('用户信息已更新；如调整了部门管理员权限，请该用户重新登录')
    }
    userEditorOpen.value = false
    await loadUsers()
  } catch (error) {
    if (accountCreated) {
      userEditorOpen.value = false
      await loadUsers()
    }
    if (accountCreated && adminDeptIds.length) {
      showError(new Error(`账号已创建，但管理员权限未完成：${describeError(error)}。请在用户列表中编辑该账号补设权限，无需重复新增`))
    } else {
      showUserOperationError(error)
    }
  } finally {
    busy.value = false
  }
}

type StatusTarget =
  | { kind: 'user'; row: CurrentUser; nextStatus: 0 | 1 }
  | { kind: 'department'; row: DepartmentInfo; nextStatus: 0 | 1 }

const statusTarget = ref<StatusTarget | null>(null)
const statusBusy = ref(false)
const statusSubject = computed(() => statusTarget.value?.kind === 'user' ? '用户' : '部门')
const statusDescription = computed(() => {
  const target = statusTarget.value
  if (!target) return ''
  if (target.kind === 'user') return target.nextStatus === 1
    ? '启用后，该账号可以重新登录并使用其已有权限。'
    : '停用后，该账号将无法继续登录，已有登录会话也会失效；用户资料不会被删除。'
  return target.nextStatus === 1
    ? '启用后，该部门将恢复为可用状态。'
    : '停用后，该部门将不再作为可用部门提供给相关业务；部门及成员数据不会被删除。'
})

function toggleUser(row: CurrentUser) {
  if (!canEditUser(row)) return showError(new Error('无权管理该用户'))
  statusTarget.value = { kind: 'user', row, nextStatus: row.status === 0 ? 1 : 0 }
}

async function confirmStatusChange() {
  const target = statusTarget.value
  if (!target || statusBusy.value) return
  if (target.kind === 'user' && !canEditUser(target.row)) {
    statusTarget.value = null
    return showError(new Error('无权管理该用户'))
  }
  statusBusy.value = true
  try {
    if (target.kind === 'user') {
      await updateUserStatus(String(target.row.id), target.nextStatus, isAdmin.value ? undefined : userStore.activeDeptId)
      showResult(`用户已${target.nextStatus === 1 ? '启用' : '禁用'}`)
      await loadUsers()
    } else {
      await updateDepartmentStatus(String(target.row.id), target.nextStatus, isAdmin.value ? undefined : userStore.activeDeptId)
      showResult(`部门已${target.nextStatus === 1 ? '启用' : '停用'}`)
      await loadDepartments()
    }
    statusTarget.value = null
  } catch (error) {
    statusTarget.value = null
    if (target.kind === 'user') showUserOperationError(error)
    else showError(error)
  } finally {
    statusBusy.value = false
  }
}

const passwordResetOpen = ref(false)
const passwordResetTarget = ref<CurrentUser | null>(null)
const passwordResetForm = reactive({ newPassword: '', confirmPassword: '' })

function openPasswordReset(row: CurrentUser) {
  if (!canEditUser(row)) return showError(new Error('无权管理该用户'))
  passwordResetTarget.value = row
  passwordResetForm.newPassword = ''
  passwordResetForm.confirmPassword = ''
  errorMessage.value = ''
  passwordResetOpen.value = true
}

async function submitPasswordReset() {
  const row = passwordResetTarget.value
  if (!row) return
  if (!canEditUser(row)) return showError(new Error('无权管理该用户'))
  if (passwordResetForm.newPassword.length < 6 || passwordResetForm.newPassword.length > 64) {
    return showError(new Error('新密码长度需要为 6–64 位'))
  }
  if (passwordResetForm.newPassword !== passwordResetForm.confirmPassword) {
    return showError(new Error('两次输入的新密码不一致'))
  }
  busy.value = true
  try {
    await resetUserPassword(String(row.id), passwordResetForm.newPassword, isAdmin.value ? undefined : userStore.activeDeptId)
    passwordResetOpen.value = false
    passwordResetTarget.value = null
    showResult('用户密码已重置')
  } catch (error) {
    showUserOperationError(error)
  } finally {
    busy.value = false
  }
}

async function removeUser(row: CurrentUser) {
  if (!canEditUser(row)) return showError(new Error('无权管理该用户'))
  if (!window.confirm(`确认删除用户“${row.username}”吗？该操作不可撤销。`)) return
  try {
    await deleteUser(String(row.id), isAdmin.value ? undefined : userStore.activeDeptId)
    showResult('用户已删除')
    await loadUsers()
  } catch (error) {
    showUserOperationError(error)
  }
}

const departmentEditorOpen = ref(false)
const departmentEditorMode = ref<EditorMode>('add')
const departmentEditorTitle = computed(() => ({ add: '新增部门', edit: '编辑部门', view: '部门详情' })[departmentEditorMode.value])
const departmentForm = reactive({ id: '', parentId: '', name: '', code: '', sort: 0, leader: '', phone: '', status: 1, remark: '' })

function fillDepartmentForm(value?: DepartmentInfo) {
  Object.assign(departmentForm, value ? {
    id: String(value.id), parentId: value.parentId == null ? '' : String(value.parentId), name: value.name || '', code: value.code || '', sort: value.sort ?? 0,
    leader: value.leader || '', phone: value.phone || '', status: value.status ?? 1, remark: value.remark || '',
  } : { id: '', parentId: isDepartmentAdmin.value ? String(userStore.activeDeptId || '') : '', name: '', code: '', sort: 0, leader: '', phone: '', status: 1, remark: '' })
}

async function openDepartmentEditor(mode: EditorMode, row?: DepartmentInfo) {
  if (row && !canEditDepartment(row)) return showError(new Error('只能管理本部门下级部门'))
  departmentEditorMode.value = mode
  fillDepartmentForm()
  if (row) {
    busy.value = true
    try {
      fillDepartmentForm(await getDepartmentDetail(String(row.id), isAdmin.value ? undefined : userStore.activeDeptId))
    } catch (error) {
      showError(error)
      return
    } finally {
      busy.value = false
    }
  }
  departmentEditorOpen.value = true
}

async function submitDepartment() {
  if (!canManageDepartment.value) return
  if (!departmentForm.name.trim()) return showError(new Error('请输入部门名称'))
  if (isDepartmentAdmin.value && (!departmentForm.parentId || !departmentParentOptions.value.some((dept) => String(dept.id) === departmentForm.parentId))) {
    return showError(new Error('请选择本部门或下级部门作为上级部门'))
  }
  if (departmentEditorMode.value === 'edit' && isDepartmentAdmin.value && !managedDepartments.value.some((dept) => String(dept.id) === departmentForm.id && String(dept.id) !== String(userStore.activeDeptId))) {
    return showError(new Error('不能修改本级或其他部门'))
  }
  busy.value = true
  try {
    const payload = {
      deptId: isAdmin.value ? undefined : userStore.activeDeptId,
      parentId: departmentForm.parentId || undefined,
      name: departmentForm.name.trim(),
      code: departmentForm.code,
      sort: departmentForm.sort,
      leader: departmentForm.leader,
      phone: departmentForm.phone,
      status: departmentForm.status,
      remark: departmentForm.remark,
    }
    if (departmentEditorMode.value === 'add') {
      await addDepartment(payload)
      showResult('部门已新增')
    } else {
      await updateDepartment({ ...payload, id: departmentForm.id })
      showResult('部门信息已更新')
    }
    departmentEditorOpen.value = false
    await loadDepartments()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

function toggleDepartment(row: DepartmentInfo) {
  if (!canEditDepartment(row)) return showError(new Error('只能管理本部门下级部门'))
  statusTarget.value = { kind: 'department', row, nextStatus: row.status === 0 ? 1 : 0 }
}

async function removeDepartment(row: DepartmentInfo) {
  if (!canEditDepartment(row)) return showError(new Error('只能管理本部门下级部门'))
  if (!window.confirm(`确认删除部门“${row.name}”吗？该操作不可撤销。`)) return
  try {
    await deleteDepartment(String(row.id), isAdmin.value ? undefined : userStore.activeDeptId)
    showResult('部门已删除')
    await loadDepartments()
  } catch (error) {
    showError(error)
  }
}

async function selectSection(section: Section) {
  if (!allowedSections.value.includes(section)) return
  await router.push({
    name: 'account-management',
    params: { section },
    query: route.query,
  })
}

const abnormalSceneId = computed(() => route.name === 'account-scene-abnormal-types'
  ? String(route.params.sceneId || '')
  : '')

async function openSceneAbnormalTypes(sceneId: string) {
  await router.push({
    name: 'account-scene-abnormal-types',
    params: { sceneId },
    query: route.query,
  })
}

async function closeSceneAbnormalTypes() {
  await router.push({
    name: 'account-management',
    params: { section: 'scenes' },
    query: route.query,
  })
}

const validSections = new Set<Section>(['profile', 'users', 'departments', 'scenes', 'permissions', 'metadata', 'map-services'])

async function syncSectionFromRoute() {
  const routeSection = (route.name === 'account-scene-abnormal-types' ? 'scenes' : String(route.params.section || 'profile')) as Section
  const nextSection = validSections.has(routeSection) ? routeSection : 'profile'
  if (!allowedSections.value.includes(nextSection)) {
    await router.replace({
      name: 'account-management',
      params: { section: 'profile' },
      query: route.query,
    })
    return
  }
  activeSection.value = nextSection
  errorMessage.value = ''
  if (nextSection === 'users') {
    if (isDepartmentAdmin.value) {
      await loadDepartments(true)
      await loadUsers()
    } else {
      await Promise.all([loadUsers(), loadDepartments(true)])
    }
  } else if (nextSection === 'departments') {
    await loadDepartments()
  }
}

watch([() => route.name, () => route.params.section, isAdmin, isDepartmentAdmin], () => void syncSectionFromRoute(), { immediate: true })

onMounted(loadProfile)
</script>

<template>
  <main class="management-shell">
    <section class="management-context" aria-label="后台管理操作">
      <button class="back-button" type="button" @click="returnToSystem">← 返回系统</button>
      <div class="management-title">
        <h1>后台管理</h1>
      </div>
      <div class="account-summary">
        <span class="account-summary__avatar">{{ (userStore.name || '用').slice(0, 1) }}</span>
        <span>{{ userStore.name }}</span>
        <b>{{ roleName }}</b>
      </div>
    </section>

    <div class="management-body">
      <aside class="management-sidebar">
        <p class="sidebar-caption">账户与组织</p>
        <button type="button" :class="{ active: activeSection === 'profile' }" @click="selectSection('profile')">
          <ManagementNavIcon name="profile" /><i>个人资料</i>
        </button>
        <button v-if="canManageDepartment" type="button" :class="{ active: activeSection === 'users' }" @click="selectSection('users')">
          <ManagementNavIcon name="users" /><i>用户管理</i>
        </button>
        <button v-if="canManageDepartment" type="button" :class="{ active: activeSection === 'departments' }" @click="selectSection('departments')">
          <ManagementNavIcon name="departments" /><i>部门管理</i>
        </button>
        <button v-if="canManageDepartment" type="button" :class="{ active: activeSection === 'scenes' }" @click="selectSection('scenes')">
          <ManagementNavIcon name="scenes" /><i>场景管理</i>
        </button>
        <button v-if="canManageDepartment" type="button" :class="{ active: activeSection === 'permissions' }" @click="selectSection('permissions')">
          <ManagementNavIcon name="permissions" /><i>权限管理</i>
        </button>
        <p v-if="isAdmin" class="sidebar-caption sidebar-caption--resource">资源管理</p>
        <button v-if="isAdmin" type="button" :class="{ active: activeSection === 'metadata' }" @click="selectSection('metadata')">
          <ManagementNavIcon name="metadata" /><i>元数据管理</i>
        </button>
        <button v-if="isAdmin" type="button" :class="{ active: activeSection === 'map-services' }" @click="selectSection('map-services')">
          <ManagementNavIcon name="map-services" /><i>地图服务管理</i>
        </button>
      </aside>

      <section class="management-content">
        <div v-if="notice" class="message message--success">{{ notice }}</div>
        <div v-if="errorMessage" class="message message--error">{{ errorMessage }}<button type="button" @click="errorMessage = ''">×</button></div>

        <template v-if="activeSection === 'profile'">
          <div class="profile-page">
          <div class="page-heading">
            <div><h2>个人资料</h2><p>查看并维护当前登录账号的信息</p></div>
            <button class="button button--ghost" type="button" :disabled="busy" @click="loadProfile">刷新资料</button>
          </div>
          <div class="profile-grid">
            <section class="panel profile-card">
              <div class="profile-avatar">
                <img v-if="profileForm.avatar" :src="profileForm.avatar" alt="用户头像">
                <span v-else>{{ (userStore.name || '用').slice(0, 1) }}</span>
              </div>
              <h3>{{ userStore.name }}</h3>
              <p>@{{ userStore.currentUser?.username }}</p>
              <dl>
                <div><dt>账号角色</dt><dd>{{ roleName }}</dd></div>
                <div><dt>当前部门</dt><dd>{{ userStore.currentUser?.deptName || '-' }}</dd></div>
                <div><dt>职位</dt><dd>{{ userStore.currentUser?.position || '-' }}</dd></div>
                <div><dt>最近登录</dt><dd>{{ formatBeijingDateTime(userStore.currentUser?.lastLoginTime) }}</dd></div>
              </dl>
            </section>

            <section class="panel form-panel profile-form-panel">
              <div class="profile-panel-heading"><div><h3>基本资料</h3><p>更新联系方式与展示信息，账号及组织信息由管理员维护。</p></div><span>个人信息</span></div>
              <form class="form-grid" @submit.prevent="saveProfile">
                <label><span>登录账号</span><input :value="userStore.currentUser?.username" disabled></label>
                <label><span>真实姓名</span><input v-model.trim="profileForm.realName" placeholder="请输入真实姓名"></label>
                <label><span>昵称</span><input v-model.trim="profileForm.nickname" placeholder="请输入昵称"></label>
                <label><span>性别</span><select v-model.number="profileForm.gender"><option :value="0">未知</option><option :value="1">男</option><option :value="2">女</option></select></label>
                <label><span>手机号</span><input v-model.trim="profileForm.phone" placeholder="请输入手机号"></label>
                <label><span>电子邮箱</span><input v-model.trim="profileForm.email" type="email" placeholder="请输入电子邮箱"></label>
                <label class="form-grid__wide"><span>头像地址</span><input v-model.trim="profileForm.avatar" placeholder="请输入头像图片地址"></label>
                <div class="form-actions form-grid__wide"><button class="button button--ghost" type="button" :disabled="busy" @click="openPasswordDialog">修改密码</button><button class="button button--primary" type="submit" :disabled="busy">{{ busy ? '保存中…' : '保存资料' }}</button></div>
              </form>
            </section>
          </div>
          </div>
        </template>

        <template v-else-if="activeSection === 'users' && canManageDepartment">
          <div class="page-heading">
            <div><h2>用户管理</h2><p>查询、创建并维护平台用户及其所属部门</p></div>
            <button class="button button--primary" type="button" @click="openUserEditor('add')">＋ 新增用户</button>
          </div>
          <section class="panel table-panel">
            <form class="filter-bar" @submit.prevent="searchUsers">
              <input v-model.trim="userFilters.keyword" placeholder="搜索账号、姓名或手机号">
              <select v-if="isAdmin" v-model="userFilters.role"><option value="">全部账号角色</option><option value="ADMIN">系统管理员</option><option value="USER">普通用户及部门管理员</option></select>
              <select v-model="userFilters.status"><option value="">全部状态</option><option :value="1">启用</option><option :value="0">禁用</option></select>
              <select v-if="isAdmin" v-model="userFilters.defaultDeptId"><option value="">全部部门</option><option v-for="dept in departments" :key="dept.id" :value="String(dept.id)">{{ dept.name }}</option></select>
              <button class="button button--primary" type="submit">查询</button>
              <button class="button button--ghost" type="button" @click="Object.assign(userFilters, { keyword: '', role: '', status: '', defaultDeptId: '' }); searchUsers()">重置</button>
            </form>
            <div class="table-wrap">
              <table>
                <thead><tr><th>用户</th><th>角色</th><th>所属部门</th><th>联系方式</th><th>状态</th><th>最近登录</th><th class="actions-column">操作</th></tr></thead>
                <tbody>
                  <tr v-if="userLoading"><td colspan="7" class="empty-cell">正在加载用户数据…</td></tr>
                  <tr v-else-if="!users.length"><td colspan="7" class="empty-cell">暂无符合条件的用户</td></tr>
                  <tr v-for="row in users" v-else :key="row.id">
                    <td><strong>{{ row.realName || row.nickname || row.username }}</strong><small>@{{ row.username }}</small></td>
                    <td><span class="tag">{{ String(row.id) === String(userStore.currentUser?.id) ? roleName : userRoleLabel(row) }}</span></td>
                    <td>{{ row.deptName || row.department || '-' }}</td>
                    <td>{{ row.phone || row.email || '-' }}</td>
                    <td><span class="status" :class="row.status === 0 ? 'status--off' : 'status--on'">{{ row.status === 0 ? '禁用' : '启用' }}</span></td>
                    <td>{{ formatBeijingDateTime(row.lastLoginTime) }}</td>
                    <td class="row-actions"><template v-if="canEditUser(row)"><button type="button" @click="openUserEditor('view', row)">详情</button><button type="button" @click="openUserEditor('edit', row)">编辑</button><button type="button" @click="toggleUser(row)">{{ row.status === 0 ? '启用' : '禁用' }}</button><button type="button" @click="openPasswordReset(row)">重置密码</button><button class="danger-link" type="button" @click="removeUser(row)">删除</button></template><span v-else>不可操作</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <footer class="pagination"><span>共 {{ userTotal }} 条</span><button type="button" :disabled="userPageNum <= 1" @click="changeUserPage(userPageNum - 1)">上一页</button><b>{{ userPageNum }} / {{ totalPages }}</b><button type="button" :disabled="userPageNum >= totalPages" @click="changeUserPage(userPageNum + 1)">下一页</button></footer>
          </section>
        </template>

        <template v-else-if="activeSection === 'departments' && canManageDepartment">
          <div class="page-heading">
            <div><h2>部门管理</h2><p>{{ isAdmin ? '维护多级部门、负责人和启停状态' : '管理当前部门的下级部门，不能新增顶级部门' }}</p></div>
            <button class="button button--primary" type="button" @click="openDepartmentEditor('add')">＋ {{ isAdmin ? '新增部门' : '新增下级部门' }}</button>
          </div>
          <section class="panel table-panel">
            <form class="filter-bar" @submit.prevent="loadDepartments()">
              <input v-model.trim="departmentFilters.keyword" placeholder="搜索部门名称或编码">
              <select v-model="departmentFilters.status"><option value="">全部状态</option><option :value="1">启用</option><option :value="0">停用</option></select>
              <button class="button button--primary" type="submit">查询</button>
              <button class="button button--ghost" type="button" @click="Object.assign(departmentFilters, { keyword: '', status: '' }); loadDepartments()">重置</button>
            </form>
            <div class="table-wrap">
              <table>
                <thead><tr><th>部门名称</th><th>上级部门</th><th>部门编码</th><th>负责人</th><th>联系电话</th><th>排序</th><th>状态</th><th>更新时间</th><th class="actions-column">操作</th></tr></thead>
                <tbody>
                  <tr v-if="departmentLoading"><td colspan="9" class="empty-cell">正在加载部门数据…</td></tr>
                  <tr v-else-if="!departmentRows.length"><td colspan="9" class="empty-cell">暂无符合条件的部门</td></tr>
                  <tr v-for="row in departmentRows" v-else :key="row.id">
                    <td><strong :style="{ paddingLeft: `${Math.min(departmentPath(row).length - 1, 6) * 12}px` }">{{ departmentPath(row).length > 1 ? '└ ' : '' }}{{ row.name }}</strong><small>ID：{{ row.id }}</small></td><td>{{ departmentParentName(row) }}</td><td>{{ row.code || '-' }}</td><td>{{ row.leader || '-' }}</td><td>{{ row.phone || '-' }}</td><td>{{ row.sort ?? 0 }}</td>
                    <td><span class="status" :class="row.status === 0 ? 'status--off' : 'status--on'">{{ row.status === 0 ? '停用' : '启用' }}</span></td><td>{{ formatBeijingDateTime(row.updateTime || row.createTime) }}</td>
                    <td class="row-actions"><button type="button" @click="openDepartmentEditor('view', row)">详情</button><button type="button" @click="openDepartmentEditor('edit', row)">编辑</button><button type="button" @click="toggleDepartment(row)">{{ row.status === 0 ? '启用' : '停用' }}</button><button class="danger-link" type="button" @click="removeDepartment(row)">删除</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>

        <SceneManagementPanel
          v-else-if="activeSection === 'scenes' && canManageDepartment"
          :abnormal-scene-id="abnormalSceneId"
          @open-abnormal-types="openSceneAbnormalTypes"
          @close-abnormal-types="closeSceneAbnormalTypes"
        />
        <PermissionManagementPanel v-else-if="activeSection === 'permissions' && canManageDepartment" />
        <MetadataManagementPanel v-else-if="activeSection === 'metadata' && isAdmin" />
        <MapServiceManagementPanel v-else-if="activeSection === 'map-services' && isAdmin" />
      </section>
    </div>

    <div v-if="userEditorOpen" class="modal-mask modal-mask--user-editor" @mousedown.self="userEditorOpen = false">
      <section class="modal-card modal-card--wide user-editor-card" role="dialog" aria-modal="true">
        <header><div><h2>{{ userEditorTitle }}</h2><p>账号、角色与部门关系</p></div><button type="button" @click="userEditorOpen = false">×</button></header>
        <form id="user-editor-form" class="form-grid modal-form user-editor-form" @submit.prevent="submitUser">
          <label><span>登录账号 *</span><input v-model.trim="userForm.username" :disabled="userEditorMode !== 'add'" required></label>
          <label v-if="userEditorMode === 'add'"><span>初始密码 *</span><input v-model="userForm.password" type="password" required></label>
          <label><span>真实姓名</span><input v-model.trim="userForm.realName" :disabled="userEditorMode === 'view'"></label>
          <label><span>昵称</span><input v-model.trim="userForm.nickname" :disabled="userEditorMode === 'view'"></label>
          <label><span>角色</span><select v-model="userForm.role" :disabled="userEditorMode === 'view' || isDepartmentAdmin"><option value="USER">普通用户</option><option v-if="isAdmin" value="DEPT_ADMIN">部门管理员</option></select></label>
          <label><span>状态</span><select v-model.number="userForm.status" :disabled="userEditorMode === 'view'"><option :value="1">启用</option><option :value="0">禁用</option></select></label>
          <label><span>性别</span><select v-model.number="userForm.gender" :disabled="userEditorMode === 'view'"><option :value="0">未知</option><option :value="1">男</option><option :value="2">女</option></select></label>
          <label><span>手机号</span><input v-model.trim="userForm.phone" :disabled="userEditorMode === 'view'"></label>
          <label><span>电子邮箱</span><input v-model.trim="userForm.email" type="email" :disabled="userEditorMode === 'view'"></label>
          <label><span>单位</span><input v-model.trim="userForm.unit" :disabled="userEditorMode === 'view'"></label>
          <label><span>部门文本</span><input v-model.trim="userForm.department" :disabled="userEditorMode === 'view'"></label>
          <label><span>职位</span><input v-model.trim="userForm.position" :disabled="userEditorMode === 'view'"></label>
          <section class="department-picker form-grid__wide" aria-label="所属部门">
            <div class="department-picker__heading"><div><strong>所属部门 <em>*</em></strong><p>选择用户可进入的部门，可多选</p></div><span>已选 {{ userForm.deptIdList.length }} 个</span></div>
            <input v-if="userEditorMode !== 'view'" v-model.trim="departmentSearch" class="department-picker__search" type="search" placeholder="搜索部门名称或编码" aria-label="搜索所属部门">
            <div class="department-picker__options">
              <button v-for="dept in filteredUserDepartments" :key="String(dept.id)" type="button" class="department-choice" :class="{ 'department-choice--selected': userForm.deptIdList.includes(String(dept.id)) }" :aria-pressed="userForm.deptIdList.includes(String(dept.id))" :disabled="userEditorMode === 'view'" @click="toggleUserDepartment(String(dept.id))">
                <span class="department-choice__check" aria-hidden="true">{{ userForm.deptIdList.includes(String(dept.id)) ? '✓' : '' }}</span>
                <span class="department-choice__text"><strong>{{ dept.name }}</strong><small>{{ dept.code || departmentParentName(dept) }}</small></span>
              </button>
              <p v-if="!filteredUserDepartments.length" class="department-picker__empty">{{ selectableUserDepartments.length ? '没有匹配的部门' : '暂无可选部门' }}</p>
            </div>
            <div v-if="selectedDepartmentChips.length" class="department-picker__selected"><span>已选择</span><button v-for="dept in selectedDepartmentChips" :key="dept.id" type="button" :disabled="userEditorMode === 'view'" :aria-label="`移除${dept.name}`" @click="toggleUserDepartment(dept.id)">{{ dept.name }}<i v-if="userEditorMode !== 'view'" aria-hidden="true">×</i></button></div>
          </section>
          <section v-if="isAdmin && userForm.role === 'DEPT_ADMIN'" class="department-picker department-picker--manager form-grid__wide" aria-label="管理的一级部门">
            <div class="department-picker__heading"><div><strong>管理的一级部门 <em>*</em></strong><p>仅能从上方已选的一级部门中授予管理权限</p></div><span>已授权 {{ userForm.deptAdminIds.length }} 个</span></div>
            <div class="department-picker__options">
              <button v-for="dept in manageableFirstLevelDepartments" :key="String(dept.id)" type="button" class="department-choice department-choice--manager" :class="{ 'department-choice--selected': userForm.deptAdminIds.includes(String(dept.id)) }" :aria-pressed="userForm.deptAdminIds.includes(String(dept.id))" :disabled="userEditorMode === 'view'" @click="toggleManagedDepartment(String(dept.id))">
                <span class="department-choice__check" aria-hidden="true">{{ userForm.deptAdminIds.includes(String(dept.id)) ? '✓' : '' }}</span>
                <span class="department-choice__text"><strong>{{ dept.name }}</strong><small>{{ dept.code || '一级部门' }}</small></span>
                <span class="department-choice__permission">{{ userForm.deptAdminIds.includes(String(dept.id)) ? '可管理' : '未授权' }}</span>
              </button>
              <p v-if="!manageableFirstLevelDepartments.length" class="department-picker__empty">请先在“所属部门”中选择一级部门</p>
            </div>
          </section>
          <label><span>默认部门</span><select v-model="userForm.defaultDeptId" :disabled="userEditorMode === 'view'"><option value="">未设置</option><option v-for="dept in (isAdmin ? departments : managedDepartments).filter((item) => userForm.deptIdList.includes(String(item.id)))" :key="dept.id" :value="String(dept.id)">{{ dept.name }}</option></select></label>
          <label><span>头像地址</span><input v-model.trim="userForm.avatar" :disabled="userEditorMode === 'view'"></label>
          <label class="form-grid__wide"><span>备注</span><textarea v-model.trim="userForm.remark" :disabled="userEditorMode === 'view'"></textarea></label>
        </form>
        <footer class="form-actions user-editor-actions"><button class="button button--ghost" type="button" @click="userEditorOpen = false">{{ userEditorMode === 'view' ? '关闭' : '取消' }}</button><button v-if="userEditorMode !== 'view'" class="button button--primary" type="submit" form="user-editor-form" :disabled="busy">保存</button></footer>
      </section>
    </div>

    <div v-if="departmentEditorOpen" class="modal-mask" @mousedown.self="departmentEditorOpen = false">
      <section class="modal-card" role="dialog" aria-modal="true">
        <header><div><h2>{{ departmentEditorTitle }}</h2><p>维护部门基本信息</p></div><button type="button" @click="departmentEditorOpen = false">×</button></header>
        <form class="form-grid modal-form" @submit.prevent="submitDepartment">
          <label><span>部门名称 *</span><input v-model.trim="departmentForm.name" :disabled="departmentEditorMode === 'view'" required></label>
          <label><span>上级部门{{ isDepartmentAdmin ? ' *' : '' }}</span><select v-model="departmentForm.parentId" :disabled="departmentEditorMode === 'view' || (isDepartmentAdmin && departmentEditorMode === 'edit')" :required="isDepartmentAdmin"><option value="">顶级部门</option><option v-for="dept in departmentParentOptions.filter((item) => String(item.id) !== departmentForm.id)" :key="dept.id" :value="String(dept.id)">{{ dept.name }}</option></select></label>
          <label><span>部门编码</span><input v-model.trim="departmentForm.code" :disabled="departmentEditorMode === 'view'"></label>
          <label><span>负责人</span><input v-model.trim="departmentForm.leader" :disabled="departmentEditorMode === 'view'"></label>
          <label><span>联系电话</span><input v-model.trim="departmentForm.phone" :disabled="departmentEditorMode === 'view'"></label>
          <label><span>排序</span><input v-model.number="departmentForm.sort" type="number" :disabled="departmentEditorMode === 'view'"></label>
          <label><span>状态</span><select v-model.number="departmentForm.status" :disabled="departmentEditorMode === 'view'"><option :value="1">启用</option><option :value="0">停用</option></select></label>
          <label class="form-grid__wide"><span>备注</span><textarea v-model.trim="departmentForm.remark" :disabled="departmentEditorMode === 'view'"></textarea></label>
          <div class="form-actions form-grid__wide"><button class="button button--ghost" type="button" @click="departmentEditorOpen = false">{{ departmentEditorMode === 'view' ? '关闭' : '取消' }}</button><button v-if="departmentEditorMode !== 'view'" class="button button--primary" type="submit" :disabled="busy">保存</button></div>
        </form>
      </section>
    </div>

    <div v-if="passwordResetOpen" class="modal-mask" @mousedown.self="passwordResetOpen = false">
      <section class="modal-card reset-password-card" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
        <header>
          <div><h2 id="reset-password-title">重置用户密码</h2><p>为指定账号设置新的登录密码</p></div>
          <button type="button" aria-label="关闭" @click="passwordResetOpen = false">×</button>
        </header>
        <div class="reset-target">
          <span class="reset-target__icon">钥</span>
          <div><small>当前用户</small><strong>{{ passwordResetTarget?.realName || passwordResetTarget?.nickname || passwordResetTarget?.username }}</strong><em>@{{ passwordResetTarget?.username }}</em></div>
        </div>
        <form class="form-grid modal-form reset-password-form" @submit.prevent="submitPasswordReset">
          <label><span>新密码</span><input v-model="passwordResetForm.newPassword" type="password" autocomplete="new-password" placeholder="请输入 6–64 位新密码" required></label>
          <label><span>确认新密码</span><input v-model="passwordResetForm.confirmPassword" type="password" autocomplete="new-password" placeholder="请再次输入新密码" required></label>
          <p class="reset-notice">重置成功后，该用户现有登录会话将失效，需要使用新密码重新登录。</p>
          <div class="form-actions">
            <button class="button button--ghost" type="button" @click="passwordResetOpen = false">取消</button>
            <button class="button button--primary" type="submit" :disabled="busy">{{ busy ? '重置中…' : '确认重置' }}</button>
          </div>
        </form>
      </section>
    </div>
    <StatusConfirmDialog :open="!!statusTarget" :action="statusTarget?.nextStatus === 1 ? 'enable' : 'disable'" :subject="statusSubject" :target="statusTarget?.kind === 'user' ? statusTarget.row.username : statusTarget?.row.name || ''" :description="statusDescription" :disable-label="statusTarget?.kind === 'user' ? '禁用' : '停用'" :busy="statusBusy" @cancel="statusTarget = null" @confirm="confirmStatusChange" />
    <div v-if="passwordDialogOpen" class="modal-mask" @mousedown.self="closePasswordDialog">
      <section class="modal-card change-password-card" role="dialog" aria-modal="true" aria-labelledby="change-password-title" @keydown.esc.stop="closePasswordDialog">
        <header><div><h2 id="change-password-title">修改密码</h2><p>验证当前密码后设置新的登录密码</p></div><button type="button" aria-label="关闭修改密码" :disabled="busy" @click="closePasswordDialog">×</button></header>
        <form class="form-grid modal-form change-password-form" @submit.prevent="savePassword">
          <label><span>当前密码</span><input v-model="passwordForm.oldPassword" type="password" autocomplete="current-password" required></label>
          <label><span>新密码</span><input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" minlength="6" maxlength="64" placeholder="请输入 6–64 位新密码" required></label>
          <label><span>确认新密码</span><input v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" minlength="6" maxlength="64" placeholder="请再次输入新密码" required></label>
          <p class="reset-notice">修改成功后，当前登录会话将失效，需要使用新密码重新登录。</p>
          <div class="form-actions"><button class="button button--ghost" type="button" :disabled="busy" @click="closePasswordDialog">取消</button><button class="button button--primary" type="submit" :disabled="busy">{{ busy ? '提交中…' : '确认修改' }}</button></div>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.management-shell { height:100%;min-height:0;overflow:auto;color: #dceef5; background: radial-gradient(circle at 18% 0, #12394d 0, transparent 32%), #071a28; font-family: "Microsoft YaHei", sans-serif; }
.management-context { position: relative; height: 56px; padding: 0 24px; display: grid; grid-template-columns: 220px 1fr auto; align-items: center; border-bottom: 1px solid #1d6886; background: #08263aee; box-shadow: 0 3px 18px #00131e88; }
.management-context h1,.management-context p,.page-heading h2,.page-heading p,.panel h3,.modal-card h2,.modal-card p { margin: 0; }.management-context h1 { color: #f4fbff; font-size: 21px; letter-spacing: 2px; }.management-context p { margin-top: 3px; color: #6fa7bb; font-size: 12px; }
.management-title { position: absolute; left: 50%; transform: translateX(-50%); text-align: center; }
.back-button { justify-self: start; min-height: 38px; padding: 0 16px; color: #bdefff; background: #0b4665; border: 1px solid #2587a8; border-radius: 4px; cursor: pointer; }.back-button:hover { color: #fff; background: #0f668b; }
.account-summary { position: absolute; right: 24px; display: flex; align-items: center; gap: 9px; color: #d7edf5; font-size: 13px; }.account-summary__avatar { width: 32px; height: 32px; display: grid; place-items: center; color: #eafdff; background: linear-gradient(135deg,#1783aa,#13b8c9); border-radius: 50%; }.account-summary b { padding: 3px 7px; color: #67d4f5; background: #0b4b68; border-radius: 3px; font-size: 11px; }
.management-body { min-height: calc(100% - 56px); display: grid; grid-template-columns: 220px minmax(0,1fr); }.management-sidebar { position: relative; padding: 23px 13px; background: #0a202f; border-right: 1px solid #174b62; }.sidebar-caption { margin: 0 12px 14px; color: #5f93a7; font-size: 12px; }.management-sidebar > button { width: 100%; min-height: 48px; padding: 0 14px; display: flex; align-items: center; gap: 12px; color: #a9c8d4; background: transparent; border: 0; border-left: 3px solid transparent; border-radius: 3px; cursor: pointer; }.management-sidebar > button:hover { color: #eafaff; background: #0c3045; }.management-sidebar > button.active { color: #fff; background: linear-gradient(90deg,#165b7a,#0d364b); border-left-color: #41d1ff; }.management-sidebar > button span { width: 22px; color: #4ed6ff; font-style: normal; font-size: 19px; }.management-sidebar > button i { font-style: normal; font-size: 15px; }
.sidebar-caption--resource { margin-top:18px; margin-bottom:6px; padding-top:14px; border-top:1px solid #153e50; }
.management-content { min-width: 0; padding: 27px 30px 40px; }.page-heading { min-height: 54px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }.page-heading h2 { color: #fff; font-size: 22px; }.page-heading p { margin-top: 6px; color: #75a2b4; font-size: 13px; }.panel { background: #0b2638e8; border: 1px solid #1b536b; border-radius: 6px; box-shadow: 0 12px 30px #00121d44; }.panel h3 { margin-bottom: 19px; color: #eaf9ff; font-size: 16px; }.profile-page { width: 100%; }.profile-grid { display: grid; grid-template-columns: 290px minmax(0,1fr); gap: 18px; align-items: stretch; }.profile-card { padding: 28px 24px; text-align: center; }.profile-avatar { width: 88px; height: 88px; margin: 0 auto 16px; overflow: hidden; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg,#1685a9,#17b6c8); border: 3px solid #2d8baa; border-radius: 50%; font-size: 32px; box-shadow: 0 0 20px #1ec7ef44; }.profile-avatar img { width: 100%; height: 100%; object-fit: cover; }.profile-card > h3 { margin: 0; font-size: 19px; }.profile-card > p { margin: 6px 0 24px; color: #6f9bae; font-size: 13px; }.profile-card dl { margin: 0; text-align: left; }.profile-card dl div { padding: 13px 0; display: flex; justify-content: space-between; gap: 15px; border-top: 1px solid #174257; }.profile-card dt { color: #7299a9; font-size: 12px; }.profile-card dd { margin: 0; overflow: hidden; color: #dcecf3; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.form-panel { padding: 24px; }.profile-form-panel { display: flex; flex-direction: column; }.profile-panel-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; padding-bottom: 17px; border-bottom: 1px solid #17475d; }.profile-panel-heading h3 { margin: 0 0 7px; }.profile-panel-heading p { margin: 0; color: #83a9b8; font-size: 13px; line-height: 1.5; }.profile-panel-heading > span { padding: 5px 9px; flex: none; color: #70d8ec; background: #0c4057; border: 1px solid #226985; border-radius: 4px; font-size: 12px; }.profile-form-panel .form-actions { margin-top: 8px; padding-top: 18px; border-top: 1px solid #17475d; }.panel-hint { margin: -10px 0 18px; color: #7299a9; font-size: 12px; }
.form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }.form-grid label { min-width: 0; }.form-grid label > span { margin-bottom: 7px; display: block; color: #85aab8; font-size: 12px; }.form-grid input,.form-grid select,.form-grid textarea,.filter-bar input,.filter-bar select { width: 100%; min-height: 38px; padding: 0 11px; color: #e9f8fc; background: #071d2b; border: 1px solid #20546a; border-radius: 3px; outline: none; box-sizing: border-box; }.form-grid textarea { min-height: 72px; padding-top: 9px; resize: vertical; }.form-grid select[multiple] { min-height: 92px; padding: 6px; }.form-grid input:focus,.form-grid select:focus,.form-grid textarea:focus,.filter-bar input:focus,.filter-bar select:focus { border-color: #37b7df; box-shadow: 0 0 0 2px #1683aa22; }.form-grid input:disabled,.form-grid select:disabled,.form-grid textarea:disabled { color: #7995a1; background: #102530; cursor: not-allowed; }.form-grid__wide { grid-column: 1/-1; }.form-actions { display: flex; justify-content: flex-end; align-items: end; gap: 10px; }
.department-picker { min-width: 0; padding: 16px; background: linear-gradient(145deg,#0b2b3e,#092334); border: 1px solid #20546a; border-radius: 6px; }
.department-picker--manager { margin-top: -4px; background: linear-gradient(145deg,#102e3c,#0b2735); border-color: #2c6a72; }
.department-picker__heading { margin-bottom: 13px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.department-picker__heading strong { color: #eaf8fd; font-size: 14px; font-weight: 600; }
.department-picker__heading em { color: #55cbe8; font-style: normal; }
.department-picker__heading p { margin: 4px 0 0; color: #79a2b2; font-size: 11px; line-height: 1.5; }
.department-picker__heading > span { flex: none; padding: 4px 8px; color: #78d8ec; background: #0c4056; border: 1px solid #226981; border-radius: 3px; font-size: 11px; }
.department-picker--manager .department-picker__heading > span { color: #92dfc7; background: #16413f; border-color: #2b6e63; }
.form-grid .department-picker__search { width: 100%; min-height: 36px; margin-bottom: 11px; padding: 0 11px; color: #eaf9ff; background: #071d2b; border: 1px solid #255c73; border-radius: 4px; font-size: 12px; }
.department-picker__options { max-height: 174px; min-height: 54px; overflow: auto; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); align-content: start; gap: 8px; scrollbar-color: #357189 #0a2738; }
.department-choice { min-width: 0; min-height: 52px; padding: 8px 11px; display: flex; align-items: center; gap: 10px; color: #c4dce5; background: #081f2e; border: 1px solid #1d4c61; border-radius: 5px; text-align: left; cursor: pointer; transition: background .15s,border-color .15s,box-shadow .15s; }
.department-choice:hover:not(:disabled) { background: #10374a; border-color: #3b98b7; }
.department-choice--selected { background: #0d4257; border-color: #39b5d5; box-shadow: inset 0 0 0 1px #39b5d522; }
.department-choice--manager.department-choice--selected { background: #12443f; border-color: #4dbb9e; box-shadow: inset 0 0 0 1px #4dbb9e22; }
.department-choice:focus-visible,.department-picker__selected button:focus-visible { outline: 2px solid #6bd8f2; outline-offset: 2px; }
.department-choice:disabled { cursor: default; }
.department-choice__check { width: 17px; height: 17px; flex: 0 0 17px; display: grid; place-items: center; color: #082332; background: #0b2737; border: 1px solid #54859a; border-radius: 4px; box-sizing: border-box; font-size: 12px; font-weight: 700; }
.department-choice--selected .department-choice__check { background: #54cde8; border-color: #79e9ff; }
.department-choice--manager.department-choice--selected .department-choice__check { background: #7bdfbc; border-color: #9bf1d0; }
.department-choice__text { min-width: 0; flex: 1; }
.department-choice__text strong,.department-choice__text small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.department-choice__text strong { color: #e8f6fb; font-size: 12px; font-weight: 500; }
.department-choice__text small { margin-top: 3px; color: #729dad; font-size: 10px; }
.department-choice__permission { flex: none; color: #81abb0; font-size: 10px; }
.department-choice--selected .department-choice__permission { color: #9be9cf; }
.department-picker__empty { grid-column: 1/-1; margin: 0; padding: 17px 12px; color: #779ead; background: #081f2e; border: 1px dashed #25566c; border-radius: 4px; text-align: center; font-size: 12px; }
.department-picker__selected { margin-top: 12px; padding-top: 11px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; border-top: 1px solid #1b4e62; }
.department-picker__selected > span { margin-right: 3px; color: #81a7b5; font-size: 11px; }
.department-picker__selected button { min-height: 25px; padding: 2px 7px; color: #a6e5f5; background: #10445a; border: 1px solid #287793; border-radius: 4px; font-size: 11px; cursor: pointer; }
.department-picker__selected button:hover:not(:disabled) { color: #fff; border-color: #58cae8; }
.department-picker__selected button:disabled { cursor: default; }
.department-picker__selected i { margin-left: 7px; font-size: 14px; font-style: normal; }
.change-password-form { grid-template-columns: 1fr; gap: 15px; }
.button { min-height: 38px; padding: 0 17px; border-radius: 3px; font-size: 13px; cursor: pointer; }.button:disabled { cursor: wait; opacity: .6; }.button--primary { color: #fff; background: linear-gradient(135deg,#1488b5,#16a9c6); border: 1px solid #42cbe9; }.button--primary:hover { filter: brightness(1.12); }.button--ghost { color: #a8d8e8; background: #0a2738; border: 1px solid #276781; }.button--ghost:hover { color: #fff; border-color: #3aa9d0; }
.message { position: fixed; top: 82px; left: 50%; z-index: 100; max-width: 560px; padding: 11px 40px 11px 16px; transform: translateX(-50%); color: #fff; border-radius: 4px; box-shadow: 0 10px 30px #00131faa; font-size: 13px; }.message--success { background: #167b6a; border: 1px solid #42c9a8; }.message--error { background: #8e3544; border: 1px solid #e26d7b; }.message button { position: absolute; top: 4px; right: 7px; color: #fff; background: transparent; border: 0; font-size: 20px; cursor: pointer; }
.table-panel { overflow: hidden; }.filter-bar { padding: 15px; display: grid; grid-template-columns: minmax(210px,1fr) repeat(3,minmax(130px,180px)) auto auto; gap: 10px; background: #0d2d41; border-bottom: 1px solid #1b536b; }.table-wrap { overflow: auto; }.table-wrap table { width: 100%; min-width: 980px; border-collapse: collapse; font-size: 12px; }.table-wrap th { height: 42px; padding: 0 12px; color: #78a7b8; background: #081f2e; text-align: left; font-weight: 500; white-space: nowrap; }.table-wrap td { height: 55px; padding: 8px 12px; color: #c4dae3; border-top: 1px solid #153d50; }.table-wrap tbody tr:hover { background: #0f3043; }.table-wrap td strong,.table-wrap td small { display: block; }.table-wrap td strong { color: #edfaff; font-weight: 500; }.table-wrap td small { margin-top: 4px; color: #668d9d; font-size: 10px; }.tag,.status { padding: 3px 7px; border-radius: 3px; white-space: nowrap; }.tag { color: #7adcf6; background: #0b4c65; }.status--on { color: #79e5c4; background: #174a43; }.status--off { color: #e9a4ad; background: #512b34; }.actions-column { min-width: 260px; }.row-actions { white-space: nowrap; }.row-actions button { padding: 3px 5px; color: #68c7e6; background: transparent; border: 0; font-size: 11px; cursor: pointer; }.row-actions button:hover { color: #fff; text-decoration: underline; }.row-actions .danger-link { color: #ef8794; }.empty-cell { height: 220px!important; color: #6f98a8!important; text-align: center; }.pagination { padding: 13px 16px; display: flex; justify-content: flex-end; align-items: center; gap: 10px; color: #779bab; border-top: 1px solid #1b536b; font-size: 12px; }.pagination button { min-height: 30px; padding: 0 11px; color: #bce5f2; background: #0b3349; border: 1px solid #24627c; border-radius: 3px; cursor: pointer; }.pagination button:disabled { opacity: .35; cursor: not-allowed; }.pagination b { color: #e1f3f8; font-weight: 500; }
.modal-mask { position: fixed; inset: 0; z-index: 90; padding: 30px; display: grid; place-items: center; background: #00111ccc; backdrop-filter: blur(3px); }.modal-card { width: min(720px,95vw); max-height: 92vh; overflow: auto; color: #dceef5; background: #0b2638; border: 1px solid #2583a5; border-radius: 7px; box-shadow: 0 22px 70px #000b; }.modal-card--wide { width: min(900px,95vw); }.modal-card > header { position: sticky; top: 0; z-index: 2; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; background: #0d3045; border-bottom: 1px solid #205f78; }.modal-card > header h2 { color: #fff; font-size: 18px; }.modal-card > header p { margin-top: 4px; color: #6f9bab; font-size: 11px; }.modal-card > header > button { width: 32px; height: 32px; color: #9fc5d2; background: transparent; border: 0; font-size: 24px; cursor: pointer; }.modal-form { padding: 22px; }
.modal-mask--user-editor { padding: 72px 24px 16px; box-sizing: border-box; }
.user-editor-card { height: min(1100px, calc(100dvh - 88px)); min-height: 0; max-height: none; display: flex; flex-direction: column; overflow: hidden; }
.user-editor-card > header { position: static; flex: none; }
.user-editor-form { min-height: 0; flex: 1; overflow-y: auto; align-content: start; scrollbar-color: #397c95 #0a2535; }
.user-editor-actions { min-height: 66px; padding: 12px 22px; flex: none; box-sizing: border-box; background: #0d3045; border-top: 1px solid #205f78; }
.reset-password-card { width: min(480px, 95vw); overflow: hidden; }.reset-target { margin: 22px 22px 0; padding: 14px 16px; display: flex; align-items: center; gap: 13px; background: linear-gradient(135deg,#0e3449,#0a293b); border: 1px solid #20576e; border-radius: 6px; }.reset-target__icon { width: 42px; height: 42px; flex: 0 0 42px; display: grid; place-items: center; color: #e9fbff; background: linear-gradient(135deg,#1689b2,#17b8c7); border-radius: 50%; font-size: 15px; box-shadow: 0 0 16px #24c9e744; }.reset-target div { min-width: 0; }.reset-target small,.reset-target strong,.reset-target em { display: block; }.reset-target small { color: #719baa; font-size: 12px; }.reset-target strong { margin-top: 3px; color: #f0fbff; font-size: 15px; }.reset-target em { margin-top: 2px; color: #69bad2; font-size: 12px; font-style: normal; }.reset-password-form { grid-template-columns: 1fr; gap: 15px; }.reset-notice { margin: 0; padding: 11px 13px; color: #d6b77b; background: #46391f55; border: 1px solid #786032; border-radius: 4px; font-size: 12px; line-height: 1.6; }.reset-password-form .form-actions { margin-top: 2px; padding-top: 15px; border-top: 1px solid #17475d; }
.change-password-card { width: min(500px, 95vw); }.change-password-form .form-actions { margin-top: 2px; padding-top: 15px; border-top: 1px solid #17475d; }

/* 大屏后台页的基础字号与表单密度。 */
.management-shell { font-size: 15px; }
.management-context h1 { font-size: 24px; }
.back-button { min-height: 40px; font-size: 14px; }
.account-summary { font-size: 14px; }
.sidebar-caption { font-size: 13px; }
.management-sidebar > button .management-nav-icon { width: 22px; height: 22px; flex: 0 0 22px; color: #69b9d2; transition: color .18s ease; }
.management-sidebar > button:hover .management-nav-icon,
.management-sidebar > button.active .management-nav-icon { color: #69dfff; }
.management-sidebar > button i { font-size: 16px; }
.sidebar-user small,.sidebar-user span { font-size: 12px; }.sidebar-user strong { font-size: 15px; }
.page-heading h2 { font-size: 25px; }.page-heading p { font-size: 14px; }
.panel h3 { font-size: 18px; }.panel-hint { font-size: 13px; }
.profile-card > h3 { font-size: 20px; }.profile-card > p { font-size: 14px; }.profile-card dt,.profile-card dd { font-size: 13px; }
.form-grid label > span { font-size: 13px; }.form-grid input,.form-grid select,.form-grid textarea,.filter-bar input,.filter-bar select { min-height: 42px; font-size: 14px; }
.button { min-height: 40px; font-size: 14px; }
.table-wrap table { font-size: 13px; }.table-wrap th { font-size: 13px; }.table-wrap td small { font-size: 11px; }.row-actions button { font-size: 12px; }
.modal-card > header h2 { font-size: 20px; }.modal-card > header p { font-size: 13px; }
@media (max-width: 1100px) { .management-context { grid-template-columns: 180px 1fr auto; }.management-body { grid-template-columns: 180px minmax(0,1fr); }.profile-grid { grid-template-columns: 1fr; }.filter-bar { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 720px) { .management-context { height: auto; min-height: 70px; padding: 12px; grid-template-columns: auto 1fr; gap: 12px; }.management-title { font-size: 18px; }.account-summary { right: 12px; }.account-summary > span:not(.account-summary__avatar),.account-summary b { display: none; }.management-body { display: block; }.management-sidebar { position: static; padding: 8px; display: flex; gap: 5px; border-right: 0; border-bottom: 1px solid #174b62; }.sidebar-caption { display: none; }.management-sidebar > button { min-height: 40px; justify-content: center; }.management-sidebar > button span { width: auto; }.management-content { padding: 18px 12px; }.profile-grid,.form-grid,.filter-bar { grid-template-columns: 1fr; }.form-grid__wide { grid-column: auto; }.modal-mask { padding: 10px; } }
@media (max-width: 720px) { .modal-mask--user-editor { padding: 64px 10px 10px; }.user-editor-card { width: 100%; height: calc(100dvh - 74px); }.user-editor-form { padding: 16px; }.user-editor-actions { min-height: 58px; padding: 9px 16px; } }
@media (max-width: 620px) { .department-picker { padding: 13px; }.department-picker__options { grid-template-columns: 1fr; max-height: 210px; }.department-picker__heading { align-items: flex-start; }.department-choice { min-height: 48px; } }
</style>
