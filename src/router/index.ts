import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '总览首页' } },
    { path: '/dashboard/:sceneId', name: 'dashboard-scene', component: () => import('@/views/DashboardView.vue'), meta: { title: '场景总览' } },
    { path: '/flight/fleet', name: 'fleet-overview', component: () => import('@/views/FleetOverviewView.vue'), meta: { title: '飞行作业 · 机队总览' } },
    { path: '/flight/plans', name: 'flight-plans', component: () => import('@/views/FlightPlanView.vue'), meta: { title: '飞行作业 · 飞行计划' } },
    { path: '/recognition/intelligent', name: 'intelligent-recognition', component: () => import('@/views/RecognitionWorkbenchView.vue'), meta: { title: '识别研判 · 智能识别' } },
    { path: '/recognition/flight-results', name: 'flight-results', component: () => import('@/views/FlightResultsView.vue'), meta: { title: '识别研判 · 飞行结果' } },
    { path: '/task-center/overview', name: 'task-overview', component: () => import('@/views/TaskHubView.vue'), meta: { title: '任务中心 · 任务总览', mode: 'overview' } },
    { path: '/task-center/scenes', name: 'scene-tasks', component: () => import('@/views/TaskHubView.vue'), meta: { title: '任务中心 · 场景任务', mode: 'scenes' } },
    { path: '/task-center/todo', name: 'my-todo', component: () => import('@/views/TaskHubView.vue'), meta: { title: '任务中心 · 我的待办', mode: 'todo' } },
    { path: '/task-center/work-orders', name: 'demand-work-orders', component: () => import('@/views/DemandWorkOrderView.vue'), meta: { title: '任务中心 · 需求工单' } },
    { path: '/assets/:kind', name: 'asset-hub', component: () => import('@/views/AssetHubView.vue'), meta: { title: '成果资产' } },
    { path: '/tasks', name: 'tasks', component: () => import('@/views/TaskListsView.vue'), meta: { title: '任务中心 · 任务列表' } },
    { path: '/taskLists', redirect: '/tasks' },
    { path: '/tasks/:taskId', name: 'task-detail', component: () => import('@/views/TaskDetailView.vue'), meta: { title: '任务详情页' } },
    { path: '/patrol/route-plan', name: 'patrol-route-plan', component: () => import('@/views/PatrolRoutePlanView.vue'), meta: { title: '低空巡查发现模块 · 航线规划' } },
    { path: '/patrol/live', name: 'patrol-live', component: () => import('@/views/PatrolLiveView.vue'), meta: { title: '低空巡查发现模块 · 实时巡航' } },
    { path: '/workspace/:sceneId/:taskId?', name: 'workspace', component: () => import('@/views/WorkspaceView.vue'), meta: { title: '场景作业工作台' } },
    { path: '/algorithms', name: 'algorithms', component: () => import('@/views/AlgorithmRepositoryView.vue'), meta: { title: '算法能力仓库' } },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

router.beforeEach((to) => {
  // 本地设计验收可直接访问各效果图路由；生产构建不会启用该入口。
  if (import.meta.env.DEV && to.query.preview === '1') return
  // 旧版本可通过 Mock 身份进入。升级后禁止继续复用此类本地 token。
  if (localStorage.getItem('auth_mode') === 'mock') {
    ;['access_token', 'current_user', 'active_dept_id', 'token_expires_at'].forEach((key) => localStorage.removeItem(key))
    localStorage.setItem('auth_mode', 'real')
  }
  const loggedIn = Boolean(localStorage.getItem('access_token'))
  if (!to.meta.public && !loggedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && loggedIn) return { name: 'dashboard' }
})

export default router
