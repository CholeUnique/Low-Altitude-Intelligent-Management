<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DashboardMap from '@/components/DashboardMap.vue'
import DomainProgressChart from '@/components/DomainProgressChart.vue'
import { useUserStore } from '@/stores/user'
import { getAlerts, getCases, getDashboardMapLayers, getDronePatrolRoutes, getScene, getSceneProgress, getTasks } from '@/mocks/portal'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const now = ref(new Date())
const timer = window.setInterval(() => { now.value = new Date() }, 1000)
const dateText = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(now.value))
const timeText = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))
const sceneId = computed(() => typeof route.params.sceneId === 'string' ? route.params.sceneId : '')
const organization = computed(() => user.organization)
const activeScene = computed(() => getScene(organization.value, sceneId.value))
const visibleTasks = computed(() => getTasks(organization.value.id, activeScene.value?.id))
const visibleAlerts = computed(() => getAlerts(organization.value.id, activeScene.value?.id).slice(0, 4))
const visibleCases = computed(() => getCases(organization.value.id, activeScene.value?.id).slice(0, 4))
const sceneProgress = computed(() => activeScene.value
  ? getSceneProgress(organization.value).filter((item) => item.id === activeScene.value?.id)
  : getSceneProgress(organization.value))
const mapLayers = computed(() => getDashboardMapLayers(organization.value, activeScene.value?.id))
const patrolRoutes = computed(() => getDronePatrolRoutes(organization.value.id, activeScene.value?.id))
const scopeTitle = computed(() => activeScene.value?.name ?? `${organization.value.shortName}全部场景`)
const dashboardStats = computed(() => {
  const overview = organization.value.overview
  const scopeFactor = activeScene.value ? Math.max(visibleTasks.value.length / Math.max(getTasks(organization.value.id).length, 1), .18) : 1
  const completed = visibleTasks.value.filter((task) => task.status === '已完成').length
  const completionRate = activeScene.value && visibleTasks.value.length
    ? Math.round(visibleTasks.value.reduce((sum, task) => sum + task.progress, 0) / visibleTasks.value.length)
    : overview.completionRate
  return [
    { label: '在线无人机', value: Math.max(1, Math.round(overview.onlineDrones * scopeFactor)), unit: '台', primary: `总数 ${Math.max(1, Math.round(overview.totalDrones * scopeFactor))} 台`, secondary: '设备在线', icon: 'drone', tone: 'cyan' },
    { label: '今日任务', value: activeScene.value ? visibleTasks.value.length : overview.todayTasks, unit: '个', primary: `已完成 ${activeScene.value ? completed : Math.round(overview.todayTasks * .7)}`, secondary: `场景 ${activeScene.value ? 1 : organization.value.scenes.length}`, icon: 'task', tone: 'blue' },
    { label: '待完成任务', value: activeScene.value ? visibleTasks.value.length - completed : overview.pendingTasks, unit: '个', primary: `高优先级 ${visibleTasks.value.filter((task) => task.priority === '高').length}`, secondary: '实时统计', icon: 'pending', tone: 'indigo' },
    { label: '任务完成率', value: completionRate, unit: '%', primary: `${scopeTitle.value}`, secondary: '', icon: 'rate', tone: 'green' },
  ]
})
const aiCapabilities = computed(() => organization.value.scenes.slice(0, 4).map((scene) => ({
  name: scene.shortName,
  icon: scene.icon,
  description: scene.description.slice(0, 8),
})))
const aiMetrics = computed(() => [
  { label: '已部署算法', value: String(organization.value.overview.deployedAlgorithms), unit: '个' },
  { label: '今日识别量', value: organization.value.overview.todayIdentifications.toLocaleString(), unit: '次' },
  { label: '平均准确率', value: String(organization.value.overview.accuracyRate), unit: '%' },
])
const droneFeeds = computed(() => visibleTasks.value.slice(0, 2).map((task, index) => ({
  id: `无人机 D3-${String(index + 1).padStart(3, '0')}`,
  area: task.area,
  status: task.status,
  altitude: `${86 + index * 42}m`,
  speed: '4K · 30fps',
  image: index ? 'field' : 'river',
})))

function openTaskList() {
  router.push({ name: 'tasks', query: activeScene.value ? { sceneId: activeScene.value.id } : {} })
}

function enterScene(nextSceneId: string) {
  router.push({ name: 'dashboard-scene', params: { sceneId: nextSceneId } })
}

function logout() {
  user.logout()
  router.replace('/login')
}

function openAlgorithm(id?: string) {
  router.push({ name: 'algorithms', query: id ? { algorithm: id } : undefined })
}

onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div class="cockpit">
    <header class="cockpit-header">
      <div class="cockpit-brand" @click="router.push('/dashboard')">
        <span class="cockpit-logo">◆</span>
        <h1>{{ organization.shortName }}低空智慧服务运行中枢</h1>
      </div>
      <nav class="cockpit-nav">
        <button class="active" @click="router.push('/dashboard')">单位总览</button><i></i>
        <button @click="openTaskList">任务总览</button><i></i>
        <button>{{ scopeTitle }}</button>
      </nav>
      <div class="cockpit-user">
        <span class="online-dot"></span><span>系统运行正常</span>
        <time>{{ dateText }}　{{ timeText }}</time>
        <button class="notice">♟<b>3</b></button>
        <button class="avatar">●</button>
        <button @click="logout">{{ user.name }}　⌄</button>
      </div>
    </header>

    <main class="cockpit-body">
      <section class="cockpit-stats">
        <article v-for="stat in dashboardStats" :key="stat.label" class="cockpit-stat" :class="`is-${stat.tone}`">
          <div class="stat-icon"><span>{{ stat.icon === 'drone' ? '✦' : stat.icon === 'task' ? '▣' : stat.icon === 'pending' ? '◷' : '◉' }}</span></div>
          <div class="stat-copy"><label>{{ stat.label }}</label><strong>{{ stat.value }}<small>{{ stat.unit }}</small></strong><p>{{ stat.primary }} <em v-if="stat.secondary">｜ {{ stat.secondary }}</em></p></div>
          <div class="spark-bars"><i v-for="n in 12" :key="n" :style="{ height: `${22 + ((n * 13) % 38)}%` }"></i></div>
        </article>
      </section>

      <section class="cockpit-primary">
        <article class="cockpit-panel map-overview">
          <div class="cockpit-panel__title"><h2>{{ scopeTitle }}综合监管一张图</h2><span v-if="activeScene" @click="router.push('/dashboard')">返回单位总览 〉</span><span v-else>实时态势 · 数据每30秒更新</span></div>
          <DashboardMap :key="activeScene?.id || organization.id" :layers="mapLayers" :routes="patrolRoutes" />
        </article>

        <aside class="cockpit-side">
          <article class="cockpit-panel task-list-panel">
            <div class="cockpit-panel__title"><h2>任务列表</h2><span @click="openTaskList">全部任务 〉</span></div>
            <div class="compact-list">
              <button v-for="task in visibleTasks.slice(0, 4)" :key="task.id" class="task-list-item" @click="router.push(`/tasks/${task.id}`)">
                <span class="item-icon">{{ getScene(organization, task.sceneId)?.icon }}</span>
                <span class="item-main"><b>{{ task.name }}</b><small>⌖ {{ task.area }}　·　{{ task.updatedAt.slice(5) }}</small></span>
                <em :class="task.status === '已完成' ? 'tag-done' : task.status.includes('待') ? 'tag-pending' : 'tag-running'">{{ task.status }}</em>
              </button>
            </div>
          </article>
          <article class="cockpit-panel alert-panel">
            <div class="cockpit-panel__title"><h2>异常告警</h2><span>全部告警 〉</span></div>
            <div class="compact-list">
              <div v-for="alert in visibleAlerts" :key="alert.id" class="alert-list-item">
                <span class="alert-icon" :class="alert.level">!</span>
                <span class="item-main"><b>{{ alert.title }}</b><small>{{ alert.description }}</small></span>
                <time>{{ alert.time }}</time><em :class="alert.level">{{ alert.level === 'high' ? '高' : alert.level === 'medium' ? '中' : '低' }}</em>
              </div>
            </div>
          </article>
        </aside>
      </section>

      <section class="cockpit-secondary">
        <article class="cockpit-panel feed-panel">
          <div class="cockpit-panel__title"><h2>无人机直播</h2><span>全部直播 〉</span></div>
          <div class="feed-grid">
            <div v-for="feed in droneFeeds" :key="feed.id" class="feed-card" :class="`feed-${feed.image}`">
              <span class="feed-state">● {{ feed.status }}</span><span class="feed-expand">⌗</span>
              <div class="feed-info"><b>{{ feed.id }}</b><span>⌖ {{ feed.area }}　　高度 {{ feed.altitude }}　{{ feed.speed }}</span></div>
            </div>
          </div>
        </article>

        <article class="cockpit-panel ai-panel">
          <div class="cockpit-panel__title"><h2>智能识别能力中心</h2><router-link to="/algorithms">全部能力 〉</router-link></div>
          <div class="ai-capability-grid">
            <button v-for="item in aiCapabilities" :key="item.name" class="ai-capability" :class="`capability-${item.visual}`" @click="openAlgorithm(item.id)"><i>{{ item.icon }}</i><b>{{ item.name }}</b><small>{{ item.description }}</small></button>
          </div>
          <div class="ai-metric-row">
            <div v-for="metric in aiMetrics" :key="metric.label"><span>{{ metric.label }}</span><b>{{ metric.value }}<small>{{ metric.unit }}</small></b></div>
          </div>
        </article>

        <article class="cockpit-panel chart-panel">
          <div class="cockpit-panel__title"><h2>多场景业务完成度</h2><span>本月　⌄</span></div>
          <DomainProgressChart :key="activeScene?.id || organization.id" :data="sceneProgress" />
        </article>

        <article class="cockpit-panel archive-panel">
          <div class="cockpit-panel__title"><h2>已办结案例轮播</h2><span>更多案例 〉</span></div>
          <div class="archive-list">
            <div v-for="item in visibleCases" :key="item.id" class="archive-item" @click="router.push(`/tasks/${item.taskId}`)">
              <span class="archive-thumb" :class="`thumb-${item.image}`"></span>
              <div><b>{{ item.title }}</b><small>{{ getScene(organization, item.sceneId)?.shortName }}　{{ item.date }}</small></div><em>已办结</em>
            </div>
          </div>
        </article>
      </section>

      <section class="governance-flow scene-entries">
        <div class="flow-caption"><b>{{ organization.shortName }}场景入口</b><span>{{ organization.scenes.length }} 个业务场景 · 点击进入场景总览</span></div>
        <button v-for="item in organization.scenes" :key="item.id" class="scene-entry" :class="{ active: activeScene?.id === item.id }" @click="enterScene(item.id)">
          <i>{{ item.icon }}</i><span><b>{{ item.shortName }}</b><em>{{ item.description }}</em></span>
        </button>
      </section>
    </main>
  </div>
</template>

<style scoped src="@/styles/dashboard.scss" lang="scss"></style>
