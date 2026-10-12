<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DashboardSymbol from '@/components/DashboardSymbol.vue'
import OrganizationSwitcher from '@/components/OrganizationSwitcher.vue'
import UserAccountMenu from '@/components/UserAccountMenu.vue'
import { getWorkflowTodos } from '@/api/task-workflow'
import { useUserStore } from '@/stores/user'
import { recognitionPermissionOrder, taskPermissionOrder, uavPermissionOrder, type AppPermissionKey } from '@/utils/access-control'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const now = ref(new Date())
const todoCount = ref<number>()
let todoRequestVersion = 0
const clock = window.setInterval(() => { now.value = new Date() }, 1000)
const todoRefreshClock = window.setInterval(() => void loadTodoCount(), 60_000)
const dateText = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(now.value))
const timeText = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))
onBeforeUnmount(() => {
  window.removeEventListener('workflow-todos-changed', refreshWorkflowTodos)
  window.clearInterval(clock)
  window.clearInterval(todoRefreshClock)
})

interface HeaderEntry { label: string; path: string; match: string[] }

function firstAllowed(items: Array<{ key: AppPermissionKey; path: string }>) {
  return items.find((item) => user.hasPermission(item.key))?.path
}
const entries = computed<HeaderEntry[]>(() => {
  const result: HeaderEntry[] = []
  const uavPath = firstAllowed(uavPermissionOrder)
  const recognitionPath = firstAllowed(recognitionPermissionOrder)
  const taskPath = firstAllowed(taskPermissionOrder)
  if (user.hasPermission('unit-overview')) result.push({ label: '单位总览', path: '/dashboard', match: ['dashboard', 'dashboard-scene'] })
  if (uavPath) result.push({ label: '飞行作业', path: uavPath, match: ['uav-tasks', 'patrol-route-plan', 'patrol-live'] })
  if (recognitionPath) result.push({ label: '智能研判', path: recognitionPath, match: ['recognition', 'algorithms', 'data-results'] })
  if (taskPath) result.push({ label: '任务中心', path: taskPath, match: ['tasks', 'task-overview', 'task-list', 'task-todo', 'task-detail', 'workspace'] })
  return result
})
const homePath = computed(() => user.hasPermission('unit-overview') ? '/dashboard' : entries.value[0]?.path || '/forbidden')

async function loadTodoCount() {
  if (!user.hasPermission('task-todo')) {
    todoCount.value = undefined
    return
  }
  const version = ++todoRequestVersion
  const currentUserId = String(user.currentUser?.id || user.currentUser?.username || '')
  if (!currentUserId) {
    todoCount.value = undefined
    return
  }
  try {
    const nodes = await getWorkflowTodos(user.activeDeptId)
    if (version !== todoRequestVersion) return
    todoCount.value = new Set(nodes.filter(node => node.status === 'PROCESSING' && node.assigneeId === String(user.currentUser?.id || '')).map(node => node.bizTaskId)).size
  } catch {
    if (version === todoRequestVersion) todoCount.value = undefined
  }
}

function openTodo() {
  if (!user.hasPermission('task-todo')) return
  void router.push({ name: 'task-todo' })
}

watch([() => user.organizationId, () => user.activeDeptId, () => user.currentUser?.id, () => user.currentUser?.username], () => void loadTodoCount())
function refreshWorkflowTodos() { void loadTodoCount() }
onMounted(() => {
  window.addEventListener('workflow-todos-changed', refreshWorkflowTodos)
  void loadTodoCount()
})
</script>

<template>
  <header class="primary-header">
    <button class="primary-brand" type="button" @click="router.push(homePath)">
      <span class="primary-logo"><DashboardSymbol name="brand" /></span>
      <div class="primary-title"><h1>海陵区自然资源综合监管平台</h1><small>COMPREHENSIVE SUPERVISION · GIS COMMAND CENTER</small></div>
    </button>
    <nav class="primary-nav" aria-label="一级导航">
      <button v-for="entry in entries" :key="entry.path" type="button" :class="{ active: entry.match.includes(String(route.name)) }" :aria-current="entry.match.includes(String(route.name)) ? 'page' : undefined" @click="router.push(entry.path)">{{ entry.label }}</button>
    </nav>
    <div class="primary-user">
      <time>{{ dateText }}　{{ timeText }}</time>
      <button v-if="user.hasPermission('task-todo')" class="notice" type="button" :aria-label="todoCount === undefined ? '进入我的待办' : `进入我的待办，当前 ${todoCount} 项`" title="我的待办" @click="openTodo"><DashboardSymbol name="notification" /><b v-if="todoCount !== undefined">{{ todoCount > 99 ? '99+' : todoCount }}</b></button>
      <OrganizationSwitcher />
      <UserAccountMenu icon-only />
    </div>
  </header>
</template>

<style scoped lang="scss">
.primary-header { position:relative;z-index:1000;box-sizing:border-box;display:grid;align-items:center;color:#d8f4ff;font-family:"Microsoft YaHei","PingFang SC",sans-serif; }
.primary-brand { min-width:0;display:flex;align-items:center;padding:0;overflow:hidden;color:#e6f9ff;text-align:left;background:transparent;border:0;cursor:pointer; }
.primary-brand h1 { margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.primary-logo { display:grid;place-items:center; }.primary-logo :deep(svg) { width:36px;height:36px; }
.primary-nav { height:100%;display:flex;align-items:center; }.primary-nav button { position:relative;color:#779daf;white-space:nowrap;background:transparent;border:0;cursor:pointer; }
.primary-nav button:hover,.primary-nav button.active { color:#d5f9ff; }.primary-nav button:hover { background:#1683b822; }.primary-nav button.active::after { position:absolute;height:2px;content:''; }
.primary-user { display:flex;justify-content:flex-end;align-items:center;color:#7199ac; }.primary-user time { white-space:nowrap;border-right:1px solid; }
.notice { position:relative;padding:0;display:grid;place-items:center;color:#9ec6d5;background:transparent;border:0;cursor:pointer; }.notice b { position:absolute;top:0;right:-2px;min-width:15px;height:15px;padding:0 3px;color:#fff;font-size:10px;line-height:15px;text-align:center;background:#f04d62;border-radius:9px;box-shadow:0 0 7px #f04d6266; }
.primary-header button:focus-visible { outline:2px solid #56d7ff;outline-offset:2px; }
.primary-header{flex-basis:68px;height:68px;grid-template-columns:minmax(350px,1fr) auto minmax(330px,1fr);gap:20px;padding-inline:22px;background:linear-gradient(120deg,#071e32f5,#083451d9 45%,#061a2be8);border-bottom:1px solid #45bfec35;box-shadow:0 4px 18px #00111e40}.primary-header::after{content:'';position:absolute;bottom:0;left:27%;right:27%;height:1px;background:linear-gradient(90deg,transparent,#36d8f07a,transparent);pointer-events:none}.primary-title{min-width:0}.primary-header .primary-brand{gap:12px}.primary-header .primary-brand h1{font-size:clamp(18px,1.25vw,25px);letter-spacing:.8px;font-weight:600;text-shadow:none}.primary-header .primary-title small{display:block;margin-top:5px;color:#69a5c0;font-size:8px;letter-spacing:2.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.primary-header .primary-logo{width:42px;height:42px;flex-basis:42px;box-shadow:none;background:transparent}.primary-header .primary-nav{gap:6px}.primary-header .primary-nav button{padding:0 20px;height:48px;font-size:16px;letter-spacing:.5px;border-radius:4px;transition:background .18s ease}.primary-header .primary-nav button+button::before{display:none}.primary-header .primary-nav button.active{background:linear-gradient(180deg,#1a8ed722,#1383c466);text-shadow:0 0 8px #54d7ff44}.primary-header .primary-nav button.active::after{left:15%;right:15%;bottom:0;background:#3ecdf5;box-shadow:0 0 6px #3ecdf577}.primary-header .primary-user{font-size:12px;gap:10px}.primary-header .primary-user time{padding:0 8px;border-left:0;border-right-color:#61b6d622;color:#96b8cc}.primary-header .primary-user :deep(.organization-switcher){font-size:13px}.primary-header .notice :deep(svg){filter:none}
.primary-header .primary-title { display:grid;grid-template-rows:auto 12px;row-gap:3px; }
.primary-header .primary-title h1 { line-height:28px; }
.primary-header .primary-title small { margin:0;line-height:12px; }
.primary-header .primary-logo svg { display:block; }
.primary-header .primary-nav button { display:grid;place-items:center;line-height:24px; }
.primary-header .primary-user { align-items:center; }
.primary-header .primary-user time { display:flex;align-items:center;height:34px;line-height:20px; }
.primary-header .notice { width:34px;height:34px; }
.primary-header .notice :deep(svg) { display:block;width:24px;height:24px; }
.primary-header :deep(.switch-trigger) { display:inline-flex;align-items:center;justify-content:center;gap:8px;height:34px;box-sizing:border-box;font-size:13px!important;line-height:20px;border-color:#79bfd636!important;border-radius:7px!important;background:linear-gradient(120deg,#12475b66,#07283e66)!important; }
.primary-header :deep(.account-trigger--icon) { width:34px;height:34px; }
.primary-header :deep(.account-trigger--icon svg) { display:block;filter:none; }
@media(max-width:1550px){.primary-header{gap:12px;padding-inline:18px;grid-template-columns:minmax(300px,1fr) auto minmax(270px,.8fr)}.primary-header .primary-nav button{padding-inline:12px;font-size:14px}.primary-header .primary-user time{font-size:10px;padding:0 3px}.primary-header .primary-title small{font-size:7px;letter-spacing:1.5px}}
@media(max-width:1250px){.primary-header{grid-template-columns:minmax(260px,1fr) auto auto;gap:8px}.primary-header .primary-user time{display:none}.primary-header .primary-nav button{padding-inline:9px;font-size:13px}}
</style>
