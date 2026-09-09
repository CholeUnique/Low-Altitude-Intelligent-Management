import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '总览首页' } },
    { path: '/dashboard/:sceneId', name: 'dashboard-scene', component: () => import('@/views/DashboardView.vue'), meta: { title: '场景总览' } },
    { path: '/tasks', name: 'tasks', component: () => import('@/views/TaskListsView.vue'), meta: { title: '任务总览页' } },
    { path: '/taskLists', redirect: '/tasks' },
    { path: '/tasks/:taskId', name: 'task-detail', component: () => import('@/views/TaskDetailView.vue'), meta: { title: '任务详情页' } },
    { path: '/workspace/:sceneId/:taskId?', name: 'workspace', component: () => import('@/views/WorkspaceView.vue'), meta: { title: '场景作业工作台' } },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
    { path: '/algorithms', name: 'algorithms', component: () => import('@/views/AlgorithmRepositoryView.vue'), meta: { title: '算法能力仓库' } },
    { path: '/taskLists', name: 'tasks', component: () => import('@/views/TaskListsView.vue') },
    { path: '/workspace/:field/:taskId?', name: 'workspace', component: () => import('@/views/WorkspaceView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

router.beforeEach((to) => {
  const loggedIn = Boolean(localStorage.getItem('access_token'))
  if (!to.meta.public && !loggedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && loggedIn) return { name: 'dashboard' }
})

export default router
