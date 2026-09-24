import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '总览首页' } },
    { path: '/dashboard/:sceneId', name: 'dashboard-scene', component: () => import('@/views/DashboardView.vue'), meta: { title: '场景总览' } },
    { path: '/uav-tasks', redirect: '/uav-tasks/fleet' },
    { path: '/uav-tasks/:tab(fleet|route|live|plan)', name: 'uav-tasks', component: () => import('@/views/UavTasksView.vue'), meta: { title: '飞行作业' } },
    { path: '/recognition', redirect: '/recognition/algorithms' },
    { path: '/recognition/:tab(algorithms|spots|data)', name: 'recognition', component: () => import('@/views/RecognitionCenterView.vue'), meta: { title: '智能研判' } },
    { path: '/data-results', name: 'data-results', component: () => import('@/views/DataResultsView.vue'), meta: { title: '数据管理' } },
    { path: '/tasks', name: 'tasks', component: () => import('@/views/TaskListsView.vue'), meta: { title: '任务总览页' } },
    { path: '/taskLists', redirect: '/tasks' },
    { path: '/tasks/:taskId', name: 'task-detail', component: () => import('@/views/TaskDetailView.vue'), meta: { title: '任务详情页' } },
    { path: '/patrol/route-plan', name: 'patrol-route-plan', component: () => import('@/views/PatrolRoutePlanView.vue'), meta: { title: '低空巡查发现模块 · 航线规划' } },
    { path: '/patrol/live', name: 'patrol-live', component: () => import('@/views/PatrolLiveView.vue'), meta: { title: '低空巡查发现模块 · 实时巡航' } },
    { path: '/workspace/:sceneId/:taskId?', name: 'workspace', component: () => import('@/views/WorkspaceView.vue'), meta: { title: '场景作业工作台' } },
    { path: '/algorithms', name: 'algorithms', component: () => import('@/views/AlgorithmRepositoryView.vue'), meta: { title: '算法能力仓库' } },
    { path: '/account-management', redirect: (to) => ({ name: 'account-management', params: { section: 'profile' }, query: to.query }) },
    { path: '/account-management/:section(profile|users|departments|permissions|metadata)', name: 'account-management', component: () => import('@/views/AccountManagementView.vue'), meta: { title: '后台管理' } },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

router.beforeEach((to) => {
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
