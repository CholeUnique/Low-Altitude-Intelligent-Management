import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { useUserStore } from '@/stores/user'
import {
  recognitionPermissionOrder,
  recognitionTabPermission,
  taskPermissionOrder,
  taskRoutePermission,
  uavPermissionOrder,
  uavTabPermission,
  firstAccessiblePath,
  type AppPermissionKey,
} from '@/utils/access-control'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/forbidden', name: 'forbidden', component: () => import('@/views/ForbiddenView.vue'), meta: { title: '无权限访问' } },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '总览首页' } },
    { path: '/dashboard/:sceneId', name: 'dashboard-scene', component: () => import('@/views/DashboardView.vue'), meta: { title: '场景总览' } },
    { path: '/uav-tasks', redirect: '/uav-tasks/fleet' },
    { path: '/uav-tasks/:tab(fleet|live|ticket|route|plan|schedule)', name: 'uav-tasks', component: () => import('@/views/UavTasksView.vue'), meta: { title: '飞行作业' } },
    { path: '/recognition', redirect: '/recognition/spots' },
    { path: '/recognition/:tab(algorithms|spots|data)', name: 'recognition', component: () => import('@/views/RecognitionCenterView.vue'), meta: { title: '智能研判' } },
    { path: '/data-results', name: 'data-results', component: () => import('@/views/DataResultsView.vue'), meta: { title: '数据管理' } },
    { path: '/tasks', name: 'tasks', redirect: '/tasks/overview' },
    { path: '/tasks/overview', name: 'task-overview', component: () => import('@/views/TaskOverviewView.vue'), meta: { title: '任务总览' } },
    { path: '/tasks/list', name: 'task-list', component: () => import('@/views/TaskListsView.vue'), meta: { title: '任务列表' } },
    { path: '/tasks/todo', name: 'task-todo', component: () => import('@/views/TaskTodoView.vue'), meta: { title: '我的待办' } },
    { path: '/taskLists', redirect: '/tasks/list' },
    { path: '/tasks/:taskId', name: 'task-detail', component: () => import('@/views/TaskDetailView.vue'), meta: { title: '任务详情页' } },
    { path: '/patrol/route-plan', name: 'patrol-route-plan', component: () => import('@/views/PatrolRoutePlanView.vue'), meta: { title: '低空巡查发现模块 · 航线规划' } },
    { path: '/patrol/live', name: 'patrol-live', component: () => import('@/views/PatrolLiveView.vue'), meta: { title: '低空巡查发现模块 · 实时巡航' } },
    { path: '/workspace/:sceneId/:taskId?', name: 'workspace', component: () => import('@/views/WorkspaceView.vue'), meta: { title: '场景作业工作台' } },
    { path: '/algorithms', name: 'algorithms', component: () => import('@/views/AlgorithmRepositoryView.vue'), meta: { title: '算法能力仓库' } },
    { path: '/account-management', redirect: (to) => ({ name: 'account-management', params: { section: 'profile' }, query: to.query }) },
    { path: '/account-management/:section(profile|users|departments|permissions|metadata|map-services)', name: 'account-management', component: () => import('@/views/AccountManagementView.vue'), meta: { title: '后台管理' } },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

function requiredPermission(to: RouteLocationNormalized): AppPermissionKey | undefined {
  if (to.name === 'dashboard' || to.name === 'dashboard-scene') return 'unit-overview'
  if (to.name === 'uav-tasks') return uavTabPermission[String(to.params.tab || '')]
  if (to.name === 'recognition') return recognitionTabPermission[String(to.params.tab || '')]
  if (to.name === 'algorithms') return 'algorithm-analysis'
  if (to.name === 'data-results') return 'data-management'
  if (to.name === 'patrol-route-plan') return 'route-planning'
  if (to.name === 'patrol-live') return 'live-monitoring'
  return taskRoutePermission[String(to.name || '')]
}

function firstAllowedPath(items: Array<{ key: AppPermissionKey; path: string }>, hasPermission: (key: AppPermissionKey) => boolean) {
  return items.find((item) => hasPermission(item.key))?.path
}

router.beforeEach(async (to) => {
  // 旧版本可通过 Mock 身份进入。升级后禁止继续复用此类本地 token。
  if (localStorage.getItem('auth_mode') === 'mock') {
    ;['access_token', 'current_user', 'active_dept_id', 'token_expires_at'].forEach((key) => localStorage.removeItem(key))
    localStorage.setItem('auth_mode', 'real')
  }
  const loggedIn = Boolean(localStorage.getItem('access_token'))
  if (!to.meta.public && !loggedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (!loggedIn || to.name === 'forbidden') return

  const user = useUserStore()
  await user.ensureMenuPermissions()
  if (to.name === 'login') return firstAccessiblePath(user.hasPermission)
  const redirectedSection = to.redirectedFrom?.path
  if (redirectedSection === '/uav-tasks') {
    const path = firstAllowedPath(uavPermissionOrder, user.hasPermission)
    if (path && path !== to.path) return path
  }
  if (redirectedSection === '/recognition') {
    const path = firstAllowedPath(recognitionPermissionOrder, user.hasPermission)
    if (path && path !== to.path) return path
  }
  if (redirectedSection === '/tasks') {
    const path = firstAllowedPath(taskPermissionOrder, user.hasPermission)
    if (path && path !== to.path) return path
  }
  if (to.name === 'account-management' && to.params.section !== 'profile' && user.currentUser?.role !== 'ADMIN') {
    return { name: 'forbidden', query: { from: to.fullPath } }
  }
  const permission = requiredPermission(to)
  if (permission && !user.hasPermission(permission)) {
    return { name: 'forbidden', query: { from: to.fullPath } }
  }
})

export default router
