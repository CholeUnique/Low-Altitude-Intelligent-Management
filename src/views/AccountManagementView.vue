<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getCurrentUser } from '@/api/auth'
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
import PermissionManagementPanel from '@/components/PermissionManagementPanel.vue'
import type { CurrentUser } from '@/types'

type Section = 'profile' | 'users' | 'departments' | 'permissions' | 'metadata'
type EditorMode = 'add' | 'edit' | 'view'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const activeSection = ref<Section>('profile')
const isAdmin = computed(() => userStore.currentUser?.role === 'ADMIN')
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
  if (passwordForm.newPassword.length < 6) return showError(new Error('新密码至少需要 6 位'))
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
  if (!isAdmin.value) return
  departmentLoading.value = true
  try {
    departments.value = await getDepartmentList({ ...departmentFilters, deptId: userStore.activeDeptId })
  } catch (error) {
    if (!silent) showError(error)
  } finally {
    departmentLoading.value = false
  }
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
const totalPages = computed(() => Math.max(1, Math.ceil(userTotal.value / userPageSize.value)))

async function loadUsers() {
  if (!isAdmin.value) return
  userLoading.value = true
  try {
    const result = await getUserPage({
      ...userFilters,
      deptId: userStore.activeDeptId,
      pageNum: userPageNum.value,
      pageSize: userPageSize.value,
    })
    users.value = (result.records || []).map(normalizeUser)
    userTotal.value = Number(result.total || 0)
    userPageNum.value = Number(result.pageNum || userPageNum.value)
  } catch (error) {
    showError(error)
  } finally {
    userLoading.value = false
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
  role: 'USER' as 'ADMIN' | 'USER',
  status: 1,
  deptIdList: [] as string[],
  defaultDeptId: '',
  remark: '',
})

function resetUserForm() {
  Object.assign(userForm, {
    id: '', username: '', password: '', realName: '', nickname: '', gender: 0, avatar: '', phone: '', email: '',
    unit: '', department: '', position: '', role: 'USER', status: 1, deptIdList: [], defaultDeptId: '', remark: '',
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
    role: value.role === 'ADMIN' ? 'ADMIN' : 'USER',
    status: value.status ?? 1,
    deptIdList,
    // 只回填真正属于该用户的默认部门，并统一为字符串，避免 Long/字符串比较失败。
    defaultDeptId: deptIdList.includes(normalizedDefaultDeptId) ? normalizedDefaultDeptId : '',
    remark: value.remark || '',
  })
}

async function openUserEditor(mode: EditorMode, row?: CurrentUser) {
  userEditorMode.value = mode
  resetUserForm()
  if (!departments.value.length) await loadDepartments(true)
  if (row) {
    busy.value = true
    try {
      fillUserForm(normalizeUser(await getUserDetail(String(row.id), userStore.activeDeptId)))
    } catch (error) {
      showError(error)
      return
    } finally {
      busy.value = false
    }
  }
  userEditorOpen.value = true
}

async function submitUser() {
  if (!userForm.username.trim()) return showError(new Error('请输入登录账号'))
  if (userEditorMode.value === 'add' && userForm.password.length < 6) return showError(new Error('初始密码至少需要 6 位'))
  const normalizedDeptIdList = userForm.deptIdList.map((deptId) => String(deptId))
  const normalizedDefaultDeptId = userForm.defaultDeptId ? String(userForm.defaultDeptId) : ''
  if (normalizedDefaultDeptId && !normalizedDeptIdList.includes(normalizedDefaultDeptId)) {
    return showError(new Error('默认部门必须包含在所属部门中'))
  }
  busy.value = true
  try {
    const common = {
      deptId: userStore.activeDeptId,
      realName: userForm.realName,
      nickname: userForm.nickname,
      gender: userForm.gender,
      avatar: userForm.avatar,
      phone: userForm.phone,
      email: userForm.email,
      unit: userForm.unit,
      department: userForm.department,
      position: userForm.position,
      role: userForm.role,
      status: userForm.status,
      deptIdList: normalizedDeptIdList.map((deptId) => ({
        deptId,
        deptRole: '',
      })),
      defaultDeptId: normalizedDefaultDeptId || undefined,
      remark: userForm.remark,
    }
    if (userEditorMode.value === 'add') {
      await addUser({ ...common, username: userForm.username.trim(), password: userForm.password } satisfies UserCreateInput)
      showResult('用户已新增')
    } else {
      await updateUser({ ...common, id: userForm.id })
      showResult('用户信息已更新')
    }
    userEditorOpen.value = false
    await loadUsers()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

async function toggleUser(row: CurrentUser) {
  const nextStatus = row.status === 0 ? 1 : 0
  if (!window.confirm(`确认${nextStatus === 1 ? '启用' : '禁用'}用户“${row.username}”吗？`)) return
  try {
    await updateUserStatus(String(row.id), nextStatus, userStore.activeDeptId)
    showResult(`用户已${nextStatus === 1 ? '启用' : '禁用'}`)
    await loadUsers()
  } catch (error) {
    showError(error)
  }
}

const passwordResetOpen = ref(false)
const passwordResetTarget = ref<CurrentUser | null>(null)
const passwordResetForm = reactive({ newPassword: '', confirmPassword: '' })

function openPasswordReset(row: CurrentUser) {
  passwordResetTarget.value = row
  passwordResetForm.newPassword = ''
  passwordResetForm.confirmPassword = ''
  errorMessage.value = ''
  passwordResetOpen.value = true
}

async function submitPasswordReset() {
  const row = passwordResetTarget.value
  if (!row) return
  if (passwordResetForm.newPassword.length < 6 || passwordResetForm.newPassword.length > 64) {
    return showError(new Error('新密码长度需要为 6–64 位'))
  }
  if (passwordResetForm.newPassword !== passwordResetForm.confirmPassword) {
    return showError(new Error('两次输入的新密码不一致'))
  }
  busy.value = true
  try {
    await resetUserPassword(String(row.id), passwordResetForm.newPassword, userStore.activeDeptId)
    passwordResetOpen.value = false
    passwordResetTarget.value = null
    showResult('用户密码已重置')
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

async function removeUser(row: CurrentUser) {
  if (!window.confirm(`确认删除用户“${row.username}”吗？该操作不可撤销。`)) return
  try {
    await deleteUser(String(row.id), userStore.activeDeptId)
    showResult('用户已删除')
    await loadUsers()
  } catch (error) {
    showError(error)
  }
}

const departmentEditorOpen = ref(false)
const departmentEditorMode = ref<EditorMode>('add')
const departmentEditorTitle = computed(() => ({ add: '新增部门', edit: '编辑部门', view: '部门详情' })[departmentEditorMode.value])
const departmentForm = reactive({ id: '', name: '', code: '', sort: 0, leader: '', phone: '', status: 1, remark: '' })

function fillDepartmentForm(value?: DepartmentInfo) {
  Object.assign(departmentForm, value ? {
    id: String(value.id), name: value.name || '', code: value.code || '', sort: value.sort ?? 0,
    leader: value.leader || '', phone: value.phone || '', status: value.status ?? 1, remark: value.remark || '',
  } : { id: '', name: '', code: '', sort: 0, leader: '', phone: '', status: 1, remark: '' })
}

async function openDepartmentEditor(mode: EditorMode, row?: DepartmentInfo) {
  departmentEditorMode.value = mode
  fillDepartmentForm()
  if (row) {
    busy.value = true
    try {
      fillDepartmentForm(await getDepartmentDetail(String(row.id), userStore.activeDeptId))
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
  if (!departmentForm.name.trim()) return showError(new Error('请输入部门名称'))
  busy.value = true
  try {
    const payload = {
      deptId: userStore.activeDeptId,
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

async function toggleDepartment(row: DepartmentInfo) {
  const nextStatus = row.status === 0 ? 1 : 0
  if (!window.confirm(`确认${nextStatus === 1 ? '启用' : '停用'}部门“${row.name}”吗？`)) return
  try {
    await updateDepartmentStatus(String(row.id), nextStatus, userStore.activeDeptId)
    showResult(`部门已${nextStatus === 1 ? '启用' : '停用'}`)
    await loadDepartments()
  } catch (error) {
    showError(error)
  }
}

async function removeDepartment(row: DepartmentInfo) {
  if (!window.confirm(`确认删除部门“${row.name}”吗？该操作不可撤销。`)) return
  try {
    await deleteDepartment(String(row.id), userStore.activeDeptId)
    showResult('部门已删除')
    await loadDepartments()
  } catch (error) {
    showError(error)
  }
}

async function selectSection(section: Section) {
  if (!isAdmin.value && section !== 'profile') return
  await router.push({
    name: 'account-management',
    params: { section },
    query: route.query,
  })
}

const validSections = new Set<Section>(['profile', 'users', 'departments', 'permissions', 'metadata'])

async function syncSectionFromRoute() {
  const routeSection = String(route.params.section || 'profile') as Section
  const nextSection = validSections.has(routeSection) ? routeSection : 'profile'
  if (!isAdmin.value && nextSection !== 'profile') {
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
    await Promise.all([loadUsers(), loadDepartments(true)])
  } else if (nextSection === 'departments') {
    await loadDepartments()
  }
}

watch([() => route.params.section, isAdmin], () => void syncSectionFromRoute(), { immediate: true })

onMounted(loadProfile)
</script>

<template>
  <main class="management-shell">
    <header class="management-header">
      <button class="back-button" type="button" @click="returnToSystem">← 返回系统</button>
      <div class="management-title">
        <h1>后台管理</h1>
      </div>
      <div class="account-summary">
        <span class="account-summary__avatar">{{ (userStore.name || '用').slice(0, 1) }}</span>
        <span>{{ userStore.name }}</span>
        <b>{{ isAdmin ? '管理员' : '普通用户' }}</b>
      </div>
    </header>

    <div class="management-body">
      <aside class="management-sidebar">
        <p class="sidebar-caption">账户与组织</p>
        <button type="button" :class="{ active: activeSection === 'profile' }" @click="selectSection('profile')">
          <span>◎</span><i>个人资料</i>
        </button>
        <button v-if="isAdmin" type="button" :class="{ active: activeSection === 'users' }" @click="selectSection('users')">
          <span>♙</span><i>用户管理</i>
        </button>
        <button v-if="isAdmin" type="button" :class="{ active: activeSection === 'departments' }" @click="selectSection('departments')">
          <span>◇</span><i>部门管理</i>
        </button>
        <button v-if="isAdmin" type="button" :class="{ active: activeSection === 'permissions' }" @click="selectSection('permissions')">
          <span>▣</span><i>权限管理</i>
        </button>
        <button v-if="isAdmin" type="button" :class="{ active: activeSection === 'metadata' }" @click="selectSection('metadata')">
          <span>▦</span><i>元数据管理</i>
        </button>
        <div class="sidebar-user">
          <small>当前账号</small>
          <strong>{{ userStore.currentUser?.username }}</strong>
          <span>{{ userStore.currentUser?.deptName || '未设置当前部门' }}</span>
        </div>
      </aside>

      <section class="management-content">
        <div v-if="notice" class="message message--success">{{ notice }}</div>
        <div v-if="errorMessage" class="message message--error">{{ errorMessage }}<button type="button" @click="errorMessage = ''">×</button></div>

        <template v-if="activeSection === 'profile'">
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
                <div><dt>账号角色</dt><dd>{{ isAdmin ? '管理员' : '普通用户' }}</dd></div>
                <div><dt>当前部门</dt><dd>{{ userStore.currentUser?.deptName || '-' }}</dd></div>
                <div><dt>职位</dt><dd>{{ userStore.currentUser?.position || '-' }}</dd></div>
                <div><dt>最近登录</dt><dd>{{ userStore.currentUser?.lastLoginTime || '-' }}</dd></div>
              </dl>
            </section>

            <section class="panel form-panel">
              <h3>基本资料</h3>
              <form class="form-grid" @submit.prevent="saveProfile">
                <label><span>登录账号</span><input :value="userStore.currentUser?.username" disabled></label>
                <label><span>真实姓名</span><input v-model.trim="profileForm.realName" placeholder="请输入真实姓名"></label>
                <label><span>昵称</span><input v-model.trim="profileForm.nickname" placeholder="请输入昵称"></label>
                <label><span>性别</span><select v-model.number="profileForm.gender"><option :value="0">未知</option><option :value="1">男</option><option :value="2">女</option></select></label>
                <label><span>手机号</span><input v-model.trim="profileForm.phone" placeholder="请输入手机号"></label>
                <label><span>电子邮箱</span><input v-model.trim="profileForm.email" type="email" placeholder="请输入电子邮箱"></label>
                <label class="form-grid__wide"><span>头像地址</span><input v-model.trim="profileForm.avatar" placeholder="请输入头像图片地址"></label>
                <div class="form-actions form-grid__wide"><button class="button button--primary" type="submit" :disabled="busy">{{ busy ? '保存中…' : '保存资料' }}</button></div>
              </form>
            </section>

            <section class="panel form-panel password-panel">
              <h3>修改密码</h3>
              <p class="panel-hint">密码修改成功后，出于安全考虑需要重新登录。</p>
              <form class="form-grid password-form" @submit.prevent="savePassword">
                <label><span>当前密码</span><input v-model="passwordForm.oldPassword" type="password" autocomplete="current-password" required></label>
                <label><span>新密码</span><input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" required></label>
                <label><span>确认新密码</span><input v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" required></label>
                <div class="form-actions"><button class="button button--primary" type="submit" :disabled="busy">修改密码</button></div>
              </form>
            </section>
          </div>
        </template>

        <template v-else-if="activeSection === 'users' && isAdmin">
          <div class="page-heading">
            <div><h2>用户管理</h2><p>查询、创建并维护平台用户及其所属部门</p></div>
            <button class="button button--primary" type="button" @click="openUserEditor('add')">＋ 新增用户</button>
          </div>
          <section class="panel table-panel">
            <form class="filter-bar" @submit.prevent="searchUsers">
              <input v-model.trim="userFilters.keyword" placeholder="搜索账号、姓名或手机号">
              <select v-model="userFilters.role"><option value="">全部角色</option><option value="ADMIN">管理员</option><option value="USER">普通用户</option></select>
              <select v-model="userFilters.status"><option value="">全部状态</option><option :value="1">启用</option><option :value="0">禁用</option></select>
              <select v-model="userFilters.defaultDeptId"><option value="">全部部门</option><option v-for="dept in departments" :key="dept.id" :value="dept.id">{{ dept.name }}</option></select>
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
                    <td><span class="tag">{{ row.role === 'ADMIN' ? '管理员' : '普通用户' }}</span></td>
                    <td>{{ row.deptName || row.department || '-' }}</td>
                    <td>{{ row.phone || row.email || '-' }}</td>
                    <td><span class="status" :class="row.status === 0 ? 'status--off' : 'status--on'">{{ row.status === 0 ? '禁用' : '启用' }}</span></td>
                    <td>{{ row.lastLoginTime || '-' }}</td>
                    <td class="row-actions"><button type="button" @click="openUserEditor('view', row)">详情</button><button type="button" @click="openUserEditor('edit', row)">编辑</button><button type="button" @click="toggleUser(row)">{{ row.status === 0 ? '启用' : '禁用' }}</button><button type="button" @click="openPasswordReset(row)">重置密码</button><button class="danger-link" type="button" @click="removeUser(row)">删除</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <footer class="pagination"><span>共 {{ userTotal }} 条</span><button type="button" :disabled="userPageNum <= 1" @click="changeUserPage(userPageNum - 1)">上一页</button><b>{{ userPageNum }} / {{ totalPages }}</b><button type="button" :disabled="userPageNum >= totalPages" @click="changeUserPage(userPageNum + 1)">下一页</button></footer>
          </section>
        </template>

        <template v-else-if="activeSection === 'departments' && isAdmin">
          <div class="page-heading">
            <div><h2>部门管理</h2><p>维护平台单层部门、负责人和启停状态</p></div>
            <button class="button button--primary" type="button" @click="openDepartmentEditor('add')">＋ 新增部门</button>
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
                <thead><tr><th>部门名称</th><th>部门编码</th><th>负责人</th><th>联系电话</th><th>排序</th><th>状态</th><th>更新时间</th><th class="actions-column">操作</th></tr></thead>
                <tbody>
                  <tr v-if="departmentLoading"><td colspan="8" class="empty-cell">正在加载部门数据…</td></tr>
                  <tr v-else-if="!departments.length"><td colspan="8" class="empty-cell">暂无符合条件的部门</td></tr>
                  <tr v-for="row in departments" v-else :key="row.id">
                    <td><strong>{{ row.name }}</strong><small>ID：{{ row.id }}</small></td><td>{{ row.code || '-' }}</td><td>{{ row.leader || '-' }}</td><td>{{ row.phone || '-' }}</td><td>{{ row.sort ?? 0 }}</td>
                    <td><span class="status" :class="row.status === 0 ? 'status--off' : 'status--on'">{{ row.status === 0 ? '停用' : '启用' }}</span></td><td>{{ row.updateTime || row.createTime || '-' }}</td>
                    <td class="row-actions"><button type="button" @click="openDepartmentEditor('view', row)">详情</button><button type="button" @click="openDepartmentEditor('edit', row)">编辑</button><button type="button" @click="toggleDepartment(row)">{{ row.status === 0 ? '启用' : '停用' }}</button><button class="danger-link" type="button" @click="removeDepartment(row)">删除</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>

        <PermissionManagementPanel v-else-if="activeSection === 'permissions' && isAdmin" />
        <MetadataManagementPanel v-else-if="activeSection === 'metadata' && isAdmin" />
      </section>
    </div>

    <div v-if="userEditorOpen" class="modal-mask" @mousedown.self="userEditorOpen = false">
      <section class="modal-card modal-card--wide" role="dialog" aria-modal="true">
        <header><div><h2>{{ userEditorTitle }}</h2><p>账号、角色与部门关系</p></div><button type="button" @click="userEditorOpen = false">×</button></header>
        <form class="form-grid modal-form" @submit.prevent="submitUser">
          <label><span>登录账号 *</span><input v-model.trim="userForm.username" :disabled="userEditorMode !== 'add'" required></label>
          <label v-if="userEditorMode === 'add'"><span>初始密码 *</span><input v-model="userForm.password" type="password" required></label>
          <label><span>真实姓名</span><input v-model.trim="userForm.realName" :disabled="userEditorMode === 'view'"></label>
          <label><span>昵称</span><input v-model.trim="userForm.nickname" :disabled="userEditorMode === 'view'"></label>
          <label><span>角色</span><select v-model="userForm.role" :disabled="userEditorMode === 'view'"><option value="USER">普通用户</option><option value="ADMIN">管理员</option></select></label>
          <label><span>状态</span><select v-model.number="userForm.status" :disabled="userEditorMode === 'view'"><option :value="1">启用</option><option :value="0">禁用</option></select></label>
          <label><span>性别</span><select v-model.number="userForm.gender" :disabled="userEditorMode === 'view'"><option :value="0">未知</option><option :value="1">男</option><option :value="2">女</option></select></label>
          <label><span>手机号</span><input v-model.trim="userForm.phone" :disabled="userEditorMode === 'view'"></label>
          <label><span>电子邮箱</span><input v-model.trim="userForm.email" type="email" :disabled="userEditorMode === 'view'"></label>
          <label><span>单位</span><input v-model.trim="userForm.unit" :disabled="userEditorMode === 'view'"></label>
          <label><span>部门文本</span><input v-model.trim="userForm.department" :disabled="userEditorMode === 'view'"></label>
          <label><span>职位</span><input v-model.trim="userForm.position" :disabled="userEditorMode === 'view'"></label>
          <label class="form-grid__wide"><span>所属部门（可多选）</span><select v-model="userForm.deptIdList" multiple :disabled="userEditorMode === 'view'"><option v-for="dept in departments" :key="dept.id" :value="String(dept.id)">{{ dept.name }}{{ dept.code ? `（${dept.code}）` : '' }}</option></select></label>
          <label><span>默认部门</span><select v-model="userForm.defaultDeptId" :disabled="userEditorMode === 'view'"><option value="">未设置</option><option v-for="dept in departments.filter((item) => userForm.deptIdList.includes(String(item.id)))" :key="dept.id" :value="String(dept.id)">{{ dept.name }}</option></select></label>
          <label><span>头像地址</span><input v-model.trim="userForm.avatar" :disabled="userEditorMode === 'view'"></label>
          <label class="form-grid__wide"><span>备注</span><textarea v-model.trim="userForm.remark" :disabled="userEditorMode === 'view'"></textarea></label>
          <div class="form-actions form-grid__wide"><button class="button button--ghost" type="button" @click="userEditorOpen = false">{{ userEditorMode === 'view' ? '关闭' : '取消' }}</button><button v-if="userEditorMode !== 'view'" class="button button--primary" type="submit" :disabled="busy">保存</button></div>
        </form>
      </section>
    </div>

    <div v-if="departmentEditorOpen" class="modal-mask" @mousedown.self="departmentEditorOpen = false">
      <section class="modal-card" role="dialog" aria-modal="true">
        <header><div><h2>{{ departmentEditorTitle }}</h2><p>维护部门基本信息</p></div><button type="button" @click="departmentEditorOpen = false">×</button></header>
        <form class="form-grid modal-form" @submit.prevent="submitDepartment">
          <label><span>部门名称 *</span><input v-model.trim="departmentForm.name" :disabled="departmentEditorMode === 'view'" required></label>
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
  </main>
</template>

<style scoped>
.management-shell { min-height: 100vh; color: #dceef5; background: radial-gradient(circle at 18% 0, #12394d 0, transparent 32%), #071a28; font-family: "Microsoft YaHei", sans-serif; }
.management-header { position: relative; height: 70px; padding: 0 24px; display: grid; grid-template-columns: 220px 1fr auto; align-items: center; border-bottom: 1px solid #1d6886; background: #08263aee; box-shadow: 0 3px 18px #00131e88; }
.management-header h1,.management-header p,.page-heading h2,.page-heading p,.panel h3,.modal-card h2,.modal-card p { margin: 0; }.management-header h1 { color: #f4fbff; font-size: 21px; letter-spacing: 2px; }.management-header p { margin-top: 3px; color: #6fa7bb; font-size: 12px; }
.management-title { position: absolute; left: 50%; transform: translateX(-50%); text-align: center; }
.back-button { justify-self: start; min-height: 38px; padding: 0 16px; color: #bdefff; background: #0b4665; border: 1px solid #2587a8; border-radius: 4px; cursor: pointer; }.back-button:hover { color: #fff; background: #0f668b; }
.account-summary { position: absolute; right: 24px; display: flex; align-items: center; gap: 9px; color: #d7edf5; font-size: 13px; }.account-summary__avatar { width: 32px; height: 32px; display: grid; place-items: center; color: #eafdff; background: linear-gradient(135deg,#1783aa,#13b8c9); border-radius: 50%; }.account-summary b { padding: 3px 7px; color: #67d4f5; background: #0b4b68; border-radius: 3px; font-size: 11px; }
.management-body { min-height: calc(100vh - 70px); display: grid; grid-template-columns: 220px minmax(0,1fr); }.management-sidebar { position: relative; padding: 23px 13px; background: #0a202f; border-right: 1px solid #174b62; }.sidebar-caption { margin: 0 12px 14px; color: #5f93a7; font-size: 12px; }.management-sidebar > button { width: 100%; min-height: 48px; padding: 0 14px; display: flex; align-items: center; gap: 12px; color: #a9c8d4; background: transparent; border: 0; border-left: 3px solid transparent; border-radius: 3px; cursor: pointer; }.management-sidebar > button:hover { color: #eafaff; background: #0c3045; }.management-sidebar > button.active { color: #fff; background: linear-gradient(90deg,#165b7a,#0d364b); border-left-color: #41d1ff; }.management-sidebar > button span { width: 22px; color: #4ed6ff; font-style: normal; font-size: 19px; }.management-sidebar > button i { font-style: normal; font-size: 15px; }.sidebar-user { position: absolute; right: 18px; bottom: 25px; left: 18px; padding: 15px; background: #071925; border: 1px solid #17445a; border-radius: 5px; }.sidebar-user small,.sidebar-user strong,.sidebar-user span { display: block; }.sidebar-user small { color: #668fa1; }.sidebar-user strong { margin: 7px 0 4px; color: #e9f9ff; font-size: 14px; }.sidebar-user span { overflow: hidden; color: #799fad; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.management-content { min-width: 0; padding: 27px 30px 40px; }.page-heading { min-height: 54px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }.page-heading h2 { color: #fff; font-size: 22px; }.page-heading p { margin-top: 6px; color: #75a2b4; font-size: 13px; }.panel { background: #0b2638e8; border: 1px solid #1b536b; border-radius: 6px; box-shadow: 0 12px 30px #00121d44; }.panel h3 { margin-bottom: 19px; color: #eaf9ff; font-size: 16px; }.profile-grid { display: grid; grid-template-columns: 270px minmax(420px,1fr); gap: 18px; align-items: start; }.profile-card { grid-row: span 2; padding: 30px 24px; text-align: center; }.profile-avatar { width: 88px; height: 88px; margin: 0 auto 16px; overflow: hidden; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg,#1685a9,#17b6c8); border: 3px solid #2d8baa; border-radius: 50%; font-size: 32px; box-shadow: 0 0 20px #1ec7ef44; }.profile-avatar img { width: 100%; height: 100%; object-fit: cover; }.profile-card > h3 { margin: 0; font-size: 19px; }.profile-card > p { margin: 6px 0 26px; color: #6f9bae; font-size: 13px; }.profile-card dl { margin: 0; text-align: left; }.profile-card dl div { padding: 13px 0; display: flex; justify-content: space-between; gap: 15px; border-top: 1px solid #174257; }.profile-card dt { color: #7299a9; font-size: 12px; }.profile-card dd { margin: 0; overflow: hidden; color: #dcecf3; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.form-panel { padding: 24px; }.panel-hint { margin: -10px 0 18px; color: #7299a9; font-size: 12px; }
.form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }.form-grid label { min-width: 0; }.form-grid label > span { margin-bottom: 7px; display: block; color: #85aab8; font-size: 12px; }.form-grid input,.form-grid select,.form-grid textarea,.filter-bar input,.filter-bar select { width: 100%; min-height: 38px; padding: 0 11px; color: #e9f8fc; background: #071d2b; border: 1px solid #20546a; border-radius: 3px; outline: none; box-sizing: border-box; }.form-grid textarea { min-height: 72px; padding-top: 9px; resize: vertical; }.form-grid select[multiple] { min-height: 92px; padding: 6px; }.form-grid input:focus,.form-grid select:focus,.form-grid textarea:focus,.filter-bar input:focus,.filter-bar select:focus { border-color: #37b7df; box-shadow: 0 0 0 2px #1683aa22; }.form-grid input:disabled,.form-grid select:disabled,.form-grid textarea:disabled { color: #7995a1; background: #102530; cursor: not-allowed; }.form-grid__wide { grid-column: 1/-1; }.form-actions { display: flex; justify-content: flex-end; align-items: end; gap: 10px; }
.password-form { grid-template-columns: 1fr; }
.button { min-height: 38px; padding: 0 17px; border-radius: 3px; font-size: 13px; cursor: pointer; }.button:disabled { cursor: wait; opacity: .6; }.button--primary { color: #fff; background: linear-gradient(135deg,#1488b5,#16a9c6); border: 1px solid #42cbe9; }.button--primary:hover { filter: brightness(1.12); }.button--ghost { color: #a8d8e8; background: #0a2738; border: 1px solid #276781; }.button--ghost:hover { color: #fff; border-color: #3aa9d0; }
.message { position: fixed; top: 82px; left: 50%; z-index: 100; max-width: 560px; padding: 11px 40px 11px 16px; transform: translateX(-50%); color: #fff; border-radius: 4px; box-shadow: 0 10px 30px #00131faa; font-size: 13px; }.message--success { background: #167b6a; border: 1px solid #42c9a8; }.message--error { background: #8e3544; border: 1px solid #e26d7b; }.message button { position: absolute; top: 4px; right: 7px; color: #fff; background: transparent; border: 0; font-size: 20px; cursor: pointer; }
.table-panel { overflow: hidden; }.filter-bar { padding: 15px; display: grid; grid-template-columns: minmax(210px,1fr) repeat(3,minmax(130px,180px)) auto auto; gap: 10px; background: #0d2d41; border-bottom: 1px solid #1b536b; }.table-wrap { overflow: auto; }.table-wrap table { width: 100%; min-width: 980px; border-collapse: collapse; font-size: 12px; }.table-wrap th { height: 42px; padding: 0 12px; color: #78a7b8; background: #081f2e; text-align: left; font-weight: 500; white-space: nowrap; }.table-wrap td { height: 55px; padding: 8px 12px; color: #c4dae3; border-top: 1px solid #153d50; }.table-wrap tbody tr:hover { background: #0f3043; }.table-wrap td strong,.table-wrap td small { display: block; }.table-wrap td strong { color: #edfaff; font-weight: 500; }.table-wrap td small { margin-top: 4px; color: #668d9d; font-size: 10px; }.tag,.status { padding: 3px 7px; border-radius: 3px; white-space: nowrap; }.tag { color: #7adcf6; background: #0b4c65; }.status--on { color: #79e5c4; background: #174a43; }.status--off { color: #e9a4ad; background: #512b34; }.actions-column { min-width: 260px; }.row-actions { white-space: nowrap; }.row-actions button { padding: 3px 5px; color: #68c7e6; background: transparent; border: 0; font-size: 11px; cursor: pointer; }.row-actions button:hover { color: #fff; text-decoration: underline; }.row-actions .danger-link { color: #ef8794; }.empty-cell { height: 220px!important; color: #6f98a8!important; text-align: center; }.pagination { padding: 13px 16px; display: flex; justify-content: flex-end; align-items: center; gap: 10px; color: #779bab; border-top: 1px solid #1b536b; font-size: 12px; }.pagination button { min-height: 30px; padding: 0 11px; color: #bce5f2; background: #0b3349; border: 1px solid #24627c; border-radius: 3px; cursor: pointer; }.pagination button:disabled { opacity: .35; cursor: not-allowed; }.pagination b { color: #e1f3f8; font-weight: 500; }
.modal-mask { position: fixed; inset: 0; z-index: 90; padding: 30px; display: grid; place-items: center; background: #00111ccc; backdrop-filter: blur(3px); }.modal-card { width: min(720px,95vw); max-height: 92vh; overflow: auto; color: #dceef5; background: #0b2638; border: 1px solid #2583a5; border-radius: 7px; box-shadow: 0 22px 70px #000b; }.modal-card--wide { width: min(900px,95vw); }.modal-card > header { position: sticky; top: 0; z-index: 2; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; background: #0d3045; border-bottom: 1px solid #205f78; }.modal-card > header h2 { color: #fff; font-size: 18px; }.modal-card > header p { margin-top: 4px; color: #6f9bab; font-size: 11px; }.modal-card > header > button { width: 32px; height: 32px; color: #9fc5d2; background: transparent; border: 0; font-size: 24px; cursor: pointer; }.modal-form { padding: 22px; }
.reset-password-card { width: min(480px, 95vw); overflow: hidden; }.reset-target { margin: 22px 22px 0; padding: 14px 16px; display: flex; align-items: center; gap: 13px; background: linear-gradient(135deg,#0e3449,#0a293b); border: 1px solid #20576e; border-radius: 6px; }.reset-target__icon { width: 42px; height: 42px; flex: 0 0 42px; display: grid; place-items: center; color: #e9fbff; background: linear-gradient(135deg,#1689b2,#17b8c7); border-radius: 50%; font-size: 15px; box-shadow: 0 0 16px #24c9e744; }.reset-target div { min-width: 0; }.reset-target small,.reset-target strong,.reset-target em { display: block; }.reset-target small { color: #719baa; font-size: 12px; }.reset-target strong { margin-top: 3px; color: #f0fbff; font-size: 15px; }.reset-target em { margin-top: 2px; color: #69bad2; font-size: 12px; font-style: normal; }.reset-password-form { grid-template-columns: 1fr; gap: 15px; }.reset-notice { margin: 0; padding: 11px 13px; color: #d6b77b; background: #46391f55; border: 1px solid #786032; border-radius: 4px; font-size: 12px; line-height: 1.6; }.reset-password-form .form-actions { margin-top: 2px; padding-top: 15px; border-top: 1px solid #17475d; }

/* 大屏后台页的基础字号与表单密度。 */
.management-shell { font-size: 15px; }
.management-header h1 { font-size: 24px; }
.back-button { min-height: 40px; font-size: 14px; }
.account-summary { font-size: 14px; }
.sidebar-caption { font-size: 13px; }
.management-sidebar > button i { font-size: 16px; }
.sidebar-user small,.sidebar-user span { font-size: 12px; }.sidebar-user strong { font-size: 15px; }
.page-heading h2 { font-size: 25px; }.page-heading p { font-size: 14px; }
.panel h3 { font-size: 18px; }.panel-hint { font-size: 13px; }
.profile-card > h3 { font-size: 20px; }.profile-card > p { font-size: 14px; }.profile-card dt,.profile-card dd { font-size: 13px; }
.form-grid label > span { font-size: 13px; }.form-grid input,.form-grid select,.form-grid textarea,.filter-bar input,.filter-bar select { min-height: 42px; font-size: 14px; }
.button { min-height: 40px; font-size: 14px; }
.password-panel { width: min(680px, 100%); }.password-form { width: min(520px, 100%); }
.table-wrap table { font-size: 13px; }.table-wrap th { font-size: 13px; }.table-wrap td small { font-size: 11px; }.row-actions button { font-size: 12px; }
.modal-card > header h2 { font-size: 20px; }.modal-card > header p { font-size: 13px; }
@media (max-width: 1100px) { .management-header { grid-template-columns: 180px 1fr auto; }.management-body { grid-template-columns: 180px minmax(0,1fr); }.profile-grid { grid-template-columns: 1fr; }.profile-card { grid-row: auto; }.filter-bar { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 720px) { .management-header { height: auto; min-height: 70px; padding: 12px; grid-template-columns: auto 1fr; gap: 12px; }.management-title { font-size: 18px; }.account-summary { right: 12px; }.account-summary > span:not(.account-summary__avatar),.account-summary b { display: none; }.management-body { display: block; }.management-sidebar { position: static; padding: 8px; display: flex; gap: 5px; border-right: 0; border-bottom: 1px solid #174b62; }.sidebar-caption,.sidebar-user { display: none; }.management-sidebar > button { min-height: 40px; justify-content: center; }.management-sidebar > button span { width: auto; }.management-content { padding: 18px 12px; }.profile-grid,.form-grid,.filter-bar { grid-template-columns: 1fr; }.form-grid__wide { grid-column: auto; }.modal-mask { padding: 10px; } }
</style>
