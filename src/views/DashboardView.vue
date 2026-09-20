<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DashboardMap from '@/components/DashboardMap.vue'
import BusinessTrendChart from '@/components/BusinessTrendChart.vue'
import DashboardSymbol from '@/components/DashboardSymbol.vue'
import OrganizationSwitcher from '@/components/OrganizationSwitcher.vue'
import UserAccountMenu from '@/components/UserAccountMenu.vue'
import { useUserStore } from '@/stores/user'
import { getGovernanceTaskGeometry, getGovernanceTaskPage, getTaskAbnormalPage, type GovernanceTask, type TaskGeometryFeatureCollection } from '@/api/governance-task'
import { getScene } from '@/mocks/portal'
import { getBusinessDashboardStatistics, type BusinessDashboardStatistics } from '@/api/business-statistics'
import { getLiveStreams } from '@/api/patrol'
import type { LiveStream } from '@/adapters/dasFly'
import { findOrganizationScene, isTaskVisibleForOrganization } from '@/utils/scene-visibility'
import type { DashboardMapLayer } from '@/types'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const now = ref(new Date())
const timer = window.setInterval(() => { now.value = new Date() }, 1000)
const statistics = ref<BusinessDashboardStatistics>()
const statisticsLoading = ref(false)
const statisticsError = ref('')
const currentUnitTasks = ref<GovernanceTask[]>([])
const currentUnitTasksLoaded = ref(false)
/** 按当前单位场景汇总的真实异常图斑数，取自每个任务的异常图斑分页接口 total。 */
const sceneAbnormalCounts = ref<Record<string, number>>({})
const sceneAbnormalCountsLoading = ref(false)
const taskRanges = ref<Record<string, TaskGeometryFeatureCollection>>({})
const livePreviews = ref<LiveStream[]>([])
const livePreviewLoading = ref(true)
const livePreviewLoaded = ref(false)
let statisticsRequestVersion = 0
let geometryRequestVersion = 0
let abnormalCountRequestVersion = 0
let livePreviewRequestVersion = 0
const dateText = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(now.value))
const timeText = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))
const sceneId = computed(() => typeof route.params.sceneId === 'string' ? route.params.sceneId : '')
const organization = computed(() => user.organization)
const currentUnitStatisticsLabel = computed(() => `当前单位：${organization.value.name}`)
const activeScene = computed(() => getScene(organization.value, sceneId.value))
const mapLayerColors = ['#23d7f0', '#ffb43c', '#8e7dff', '#38e0a8', '#ff6f86', '#4d9dff']
const mapLayers = computed<DashboardMapLayer[]>(() => {
  if (!currentUnitTasksLoaded.value) return []
  const sceneTasks = new Map<string, GovernanceTask[]>()
  currentUnitTasks.value.forEach((task) => {
    const scene = findOrganizationScene(organization.value, task.sceneCode, task.sceneName)
    if (!scene || (activeScene.value && scene.id !== activeScene.value.id)) return
    sceneTasks.set(scene.id, [...(sceneTasks.get(scene.id) || []), task])
  })

  return [...sceneTasks.entries()].map(([sceneId, tasks]) => {
    const scene = organization.value.scenes.find((item) => item.id === sceneId)!
    const sceneIndex = organization.value.scenes.findIndex((item) => item.id === sceneId)
    return {
      id: scene.id,
      name: scene.shortName,
      color: mapLayerColors[sceneIndex % mapLayerColors.length]!,
      count: tasks.length,
      tasks: tasks.flatMap((task) => {
        const polygons = geometryPolygons(taskRanges.value[task.id])
        if (!polygons.length) return []
        return [{
          taskId: task.id,
          name: task.name,
          area: task.area || task.deptName || '任务范围',
          status: task.taskStatusDesc,
          center: polygonCenter(polygons),
          polygon: polygons[0]!,
          polygons,
        }]
      }),
    }
  })
})
// 无人机航线尚未接入真实后端接口，图层保留但当前不展示伪造航线。
const patrolRoutes = computed(() => [])
const scopeTitle = computed(() => activeScene.value?.name ?? `${organization.value.shortName}全部场景`)
const unitTaskSummary = computed(() => {
  // 首页的任务状态统计仅采信后端 /v1/biz/statistics/task-summary，
  // 任务列表只用于展示，不再由前端自行计数生成统计值。
  return statistics.value?.taskSummary
})
const dashboardStats = computed(() => {
  const overview = statistics.value?.overview
  const taskSummary = unitTaskSummary.value
  const abnormalSummary = statistics.value?.abnormalSummary
  return [
    { label: '业务场景', value: overview?.sceneCount ?? '—', unit: '个', primary: `任务总数 ${taskSummary?.total ?? '—'} 个`, secondary: currentUnitStatisticsLabel.value, icon: 'drone' as const, tone: 'cyan' },
    { label: '执行中任务', value: taskSummary?.executing ?? '—', unit: '个', primary: `待执行 ${taskSummary?.pending ?? '—'} · 待核查 ${taskSummary?.pendingVerify ?? '—'}`, secondary: '当前单位任务状态', icon: 'task' as const, tone: 'blue' },
    { label: '异常图斑', value: abnormalSummary?.total ?? '—', unit: '个', primary: `待核查 ${overview?.abnormalPendingCount ?? '—'} 个`, secondary: `当前单位面积 ${formatNumber(abnormalSummary?.areaTotal)} ㎡`, icon: 'pending' as const, tone: 'indigo' },
    { label: '成果批次', value: overview?.resultCount ?? '—', unit: '批', primary: `已解析要素 ${overview?.geometryCount ?? '—'} 个`, secondary: statisticsLoading.value ? '当前单位统计加载中…' : statisticsError.value ? '当前单位统计加载异常' : '当前单位成果汇总', icon: 'rate' as const, tone: 'green' },
  ]
})
/**
 * 统计编码可能是旧编码、场景全称或当前编码。归并到当前单位的场景配置后展示，
 * 并在统计接口暂无明细时以当前单位任务生成最小可用的统计卡片。
 */
const sceneBusinessStats = computed(() => {
  const taskCounts = new Map<string, number>()
  currentUnitTasks.value.forEach((task) => {
    const scene = findOrganizationScene(organization.value, task.sceneCode, task.sceneName)
    if (scene) taskCounts.set(scene.id, (taskCounts.get(scene.id) || 0) + 1)
  })
  const matchedStatistics = (statistics.value?.sceneStats ?? []).flatMap((statistic) => {
    const scene = findOrganizationScene(organization.value, statistic.sceneCode, statistic.sceneName)
    return scene ? [{ statistic, scene }] : []
  })
  const listedSceneIds = new Set(matchedStatistics.map(({ scene }) => scene.id))
  const fallbackTasks = new Map<string, { code: string; count: number }>()
  const abnormalLabel = (sceneId: string, fallbackCount: number) => {
    const count = sceneAbnormalCounts.value[sceneId]
    return `异常 ${count ?? (sceneAbnormalCountsLoading.value ? '—' : fallbackCount)}`
  }

  currentUnitTasks.value.forEach((task) => {
    const scene = findOrganizationScene(organization.value, task.sceneCode, task.sceneName)
    if (!scene || listedSceneIds.has(scene.id)) return
    const current = fallbackTasks.get(scene.id)
    fallbackTasks.set(scene.id, { code: current?.code || task.sceneCode, count: (current?.count || 0) + 1 })
  })

  return [
    ...matchedStatistics.map(({ statistic, scene }) => ({
      id: scene.id,
      code: statistic.sceneCode,
      name: scene.name,
      description: `任务 ${taskCounts.get(scene.id) ?? statistic.taskCount} · ${abnormalLabel(scene.id, statistic.abnormalCount)}`,
      visual: organization.value.id === 'agriculture-rural' ? 'field' : 'forest',
    })),
    ...[...fallbackTasks.entries()].map(([sceneId, taskSummary]) => {
      const scene = organization.value.scenes.find((item) => item.id === sceneId)!
      return {
        id: scene.id,
        code: taskSummary.code,
        name: scene.name,
        description: `任务 ${taskSummary.count} · ${abnormalLabel(scene.id, 0)}`,
        visual: organization.value.id === 'agriculture-rural' ? 'field' : 'forest',
      }
    }),
  ].slice(0, 4).map((item, index) => ({ ...item, icon: ['林', '警', '巡', '复'][index]! }))
})
const aiMetrics = computed(() => [
  { label: '任务总数', value: String(unitTaskSummary.value?.total ?? '—'), unit: '个' },
  { label: '异常面积', value: formatNumber(statistics.value?.abnormalSummary.areaTotal), unit: '㎡' },
  { label: '成果批次', value: String(statistics.value?.overview.resultCount ?? '—'), unit: '批' },
])
/** 与任务总览“创建时间”列保持相同口径：优先使用计划开始时间，缺失时使用创建时间。 */
function taskTrendDate(task: GovernanceTask) {
  return (task.planStartTime || task.createTime || '').slice(0, 10)
}

const businessTrend = computed(() => {
  const taskCounts = new Map<string, number>()
  currentUnitTasks.value.forEach((task) => {
    const date = taskTrendDate(task)
    if (date) taskCounts.set(date, (taskCounts.get(date) || 0) + 1)
  })

  // 横轴和异常数由后端趋势接口决定；任务数改由当前单位的后端任务清单逐日汇总，
  // 防止统计接口的任务口径与任务总览不一致。
  return (statistics.value?.trend.items || []).map((item) => ({
    ...item,
    taskCount: currentUnitTasksLoaded.value ? (taskCounts.get(item.date.slice(0, 10)) || 0) : item.taskCount,
  }))
})
const activeSceneEntries = computed(() => {
  const realSceneIds = new Set(sceneBusinessStats.value.map((item) => item.id))
  currentUnitTasks.value.forEach((task) => {
    const scene = findOrganizationScene(organization.value, task.sceneCode, task.sceneName)
    if (scene) realSceneIds.add(scene.id)
  })
  return organization.value.scenes.filter((scene) => realSceneIds.has(scene.id))
})
const dashboardTaskList = computed(() => currentUnitTasks.value.slice(0, 6))
const livePreviewSlots = computed<(LiveStream | undefined)[]>(() => [livePreviews.value[0], livePreviews.value[1]])

function livePreviewLabel(preview?: LiveStream) {
  return preview?.aircraftName || preview?.aircraftId || '在线设备'
}

function openTaskList() {
  router.push({ name: 'tasks', query: activeScene.value ? { sceneId: activeScene.value.id } : {} })
}

function openSceneTaskList(sceneId: string) {
  router.push({ name: 'tasks', query: { sceneId } })
}

function formatNumber(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '—'
}

function formatTaskListDate(value?: string) {
  return value ? value.slice(5, 16).replace('T', ' ') : '暂无时间'
}

function geometryPolygons(collection?: TaskGeometryFeatureCollection): [number, number][][] {
  if (!collection) return []
  const asRing = (value: unknown): [number, number][] | undefined => {
    if (!Array.isArray(value)) return undefined
    const ring = value.flatMap((point) => Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number'
      ? [[point[0], point[1]] as [number, number]]
      : [])
    return ring.length >= 3 ? ring : undefined
  }
  return collection.features.flatMap((feature) => {
    const geometry = feature.geometry
    if (!geometry || !Array.isArray(geometry.coordinates)) return []
    const geometryType = geometry.type.toUpperCase()
    if (geometryType === 'POLYGON') {
      const ring = asRing(geometry.coordinates[0])
      return ring ? [ring] : []
    }
    if (geometryType === 'MULTIPOLYGON') {
      return geometry.coordinates.flatMap((polygon) => {
        const ring = Array.isArray(polygon) ? asRing(polygon[0]) : undefined
        return ring ? [ring] : []
      })
    }
    return []
  })
}

function polygonCenter(polygons: [number, number][][]): [number, number] {
  const points = polygons.flat()
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ]
}

async function loadTaskRanges(tasks: GovernanceTask[], requestVersion: number) {
  const currentGeometryRequest = ++geometryRequestVersion
  const results = await Promise.allSettled(tasks.map(async (task) => [
    task.id,
    await getGovernanceTaskGeometry(task.id, undefined, false),
  ] as const))
  if (requestVersion !== statisticsRequestVersion || currentGeometryRequest !== geometryRequestVersion) return
  taskRanges.value = Object.fromEntries(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []))
}

/**
 * 场景统计接口可能漏掉部分场景；不能将缺失场景直接当作“异常 0”。
 * 这里按任务调用异常图斑分页接口，只读取 total，再归并到场景，确保首页卡片展示真实数量。
 */
async function loadSceneAbnormalCounts(tasks: GovernanceTask[], requestVersion: number) {
  const currentAbnormalRequest = ++abnormalCountRequestVersion
  sceneAbnormalCountsLoading.value = true
  const failedSceneIds = new Set<string>()
  try {
    const results = await Promise.allSettled(tasks.map(async (task) => [
      task.id,
      await getTaskAbnormalPage({ bizTaskId: task.id, pageNum: 1, pageSize: 1 }),
    ] as const))
    if (requestVersion !== statisticsRequestVersion || currentAbnormalRequest !== abnormalCountRequestVersion) return

    const counts: Record<string, number> = {}
    results.forEach((result, index) => {
      const task = tasks[index]
      if (!task) return
      const scene = findOrganizationScene(organization.value, task.sceneCode, task.sceneName)
      if (!scene) return
      if (result.status !== 'fulfilled') {
        failedSceneIds.add(scene.id)
        return
      }
      counts[scene.id] = (counts[scene.id] || 0) + result.value[1].total
    })
    // 同一场景中只要有一个任务异常数无法获取，就保留统计接口值，避免展示不完整的小计。
    failedSceneIds.forEach((sceneId) => { delete counts[sceneId] })
    sceneAbnormalCounts.value = counts
  } finally {
    if (requestVersion === statisticsRequestVersion && currentAbnormalRequest === abnormalCountRequestVersion) {
      sceneAbnormalCountsLoading.value = false
    }
  }
}

async function loadBusinessStatistics() {
  // 身份、部门和单位可在登录/切换时连续变更。每次都递增版本号，令旧请求的
  // 返回值失效；不能以 statisticsLoading 拦截新请求，否则首个请求会使用旧 token
  // 或旧部门，后续正确上下文的加载又被忽略，最终首页只会显示空数据。
  const requestVersion = ++statisticsRequestVersion
  const deptId = user.activeDeptId
  const organizationId = user.organizationId
  if (user.authMode === 'real' && !deptId) {
    // 不将未带部门条件的统计作为“当前单位”数据展示。
    statistics.value = undefined
    currentUnitTasks.value = []
    currentUnitTasksLoaded.value = false
    taskRanges.value = {}
    sceneAbnormalCounts.value = {}
    sceneAbnormalCountsLoading.value = false
    statisticsError.value = '未获取到当前单位标识，无法加载单位统计数据。'
    return
  }
  statisticsLoading.value = true
  statisticsError.value = ''
  // 切换身份期间不可继续展示上一单位数据；待本次请求完成后再呈现新单位结果。
  statistics.value = undefined
  currentUnitTasks.value = []
  currentUnitTasksLoaded.value = false
  taskRanges.value = {}
  sceneAbnormalCounts.value = {}
  sceneAbnormalCountsLoading.value = false
  const statisticsPromise = getBusinessDashboardStatistics({ deptId })
  const taskPromise = getGovernanceTaskPage({ pageNum: 1, pageSize: 100, deptId, organizationId })

  try {
    // 任务列表是首页最基础的数据，必须先独立提交；统计接口不可用或响应慢时，
    // 不能连带让任务、场景和地图图层都显示为空。
    const taskResult = await Promise.allSettled([taskPromise])
    if (requestVersion !== statisticsRequestVersion) return
    const pageResult = taskResult[0]
    if (pageResult?.status === 'fulfilled') {
      currentUnitTasks.value = pageResult.value.records
        .filter((task) => isTaskVisibleForOrganization(organization.value, task, deptId))
      currentUnitTasksLoaded.value = true
      void loadTaskRanges(currentUnitTasks.value, requestVersion)
      void loadSceneAbnormalCounts(currentUnitTasks.value, requestVersion)
    } else {
      currentUnitTasks.value = []
      currentUnitTasksLoaded.value = false
      taskRanges.value = {}
      sceneAbnormalCounts.value = {}
      sceneAbnormalCountsLoading.value = false
    }

    const statisticsResult = await Promise.allSettled([statisticsPromise])
    if (requestVersion !== statisticsRequestVersion) return
    const statisticsPage = statisticsResult[0]
    if (statisticsPage?.status === 'fulfilled') {
      statistics.value = statisticsPage.value
    } else {
      statistics.value = undefined
      statisticsError.value = statisticsPage?.status === 'rejected' && statisticsPage.reason instanceof Error
        ? statisticsPage.reason.message
        : '统计接口请求失败'
    }
  } catch (error) {
    // 防御性兜底：无论任何解析/渲染异常，均不可让首页永久处于加载状态。
    statisticsError.value = error instanceof Error ? error.message : '首页数据加载失败'
  } finally {
    if (requestVersion === statisticsRequestVersion) statisticsLoading.value = false
  }
}

async function loadLivePreview() {
  const requestVersion = ++livePreviewRequestVersion
  const initialLoad = !livePreviewLoaded.value
  if (initialLoad) livePreviewLoading.value = true
  try {
    const result = await getLiveStreams()
    if (requestVersion !== livePreviewRequestVersion) return
    const previousById = new Map(livePreviews.value.map((preview) => [preview.id, preview]))
    livePreviews.value = result.list.slice(0, 2).map((preview) => {
      const previous = previousById.get(preview.id)
      // 分享码通常可复用一段时间。后台轮询仅用于确认设备在线状态，保留既有
      // 播放地址可避免 video / iframe 在每轮刷新时被销毁并出现黑屏闪烁。
      return previous?.playUrl || previous?.embedUrl
        ? { ...preview, playUrl: previous.playUrl, embedUrl: previous.embedUrl, protocol: previous.protocol, shareCode: previous.shareCode, expiresAt: previous.expiresAt }
        : preview
    })
  } catch {
    if (requestVersion === livePreviewRequestVersion && initialLoad) livePreviews.value = []
  } finally {
    if (requestVersion === livePreviewRequestVersion) {
      livePreviewLoading.value = false
      livePreviewLoaded.value = true
    }
  }
}

function openPatrolLiveFullscreen() {
  router.push({ path: '/patrol/live', query: { returnTo: route.fullPath, fullscreen: 'first' } })
}

function openPatrolLiveOverview() {
  router.push({ path: '/patrol/live', query: { returnTo: route.fullPath } })
}

function enterScene(nextSceneId: string) {
  router.push({ name: 'dashboard-scene', params: { sceneId: nextSceneId } })
}

// 统计请求本身最多等待 15 秒，刷新周期必须明显大于该时长，避免请求彼此覆盖。
const dashboardRefreshTimer = window.setInterval(() => {
  void loadBusinessStatistics()
  void loadLivePreview()
}, 60_000)
onBeforeUnmount(() => {
  window.clearInterval(timer)
  window.clearInterval(dashboardRefreshTimer)
})
// 登录完成、部门切换或单位切换时，始终按最终的认证上下文重新拉取。flush: 'post'
// 会把 setRealSession 内的多项同步状态更新合并后再执行，避免中间态请求。
watch([() => user.token, () => user.authMode, () => user.activeDeptId, () => user.organizationId], () => {
  void loadBusinessStatistics()
  void loadLivePreview()
}, { immediate: true, flush: 'post' })
</script>

<template>
  <div class="cockpit">
    <header class="cockpit-header">
      <div class="cockpit-brand" @click="router.push('/dashboard')">
        <span class="cockpit-logo"><DashboardSymbol name="brand" /></span>
        <h1>{{ organization.shortName }}低空智慧服务运行中枢</h1>
      </div>
      <nav class="cockpit-nav">
        <button class="active" @click="router.push('/dashboard')">单位总览</button><i></i>
        <button @click="openTaskList">任务总览</button><i></i>
        <button>{{ scopeTitle }}</button>
      </nav>
      <div class="cockpit-user">
        <time>{{ dateText }}　{{ timeText }}</time>
        <button class="notice" aria-label="消息通知"><DashboardSymbol name="notification" /><b>3</b></button>
        <OrganizationSwitcher />
        <UserAccountMenu icon-only />
      </div>
    </header>

    <main class="cockpit-body">
      <section class="cockpit-stats">
        <article v-for="stat in dashboardStats" :key="stat.label" class="cockpit-stat" :class="`is-${stat.tone}`">
          <div class="stat-icon"><DashboardSymbol :name="stat.icon" /></div>
          <div class="stat-copy"><label>{{ stat.label }}</label><strong>{{ stat.value }}<small>{{ stat.unit }}</small></strong><p>{{ stat.primary }} <em v-if="stat.secondary">｜ {{ stat.secondary }}</em><button v-if="statisticsError && stat.label === '成果批次'" class="statistics-retry" :title="statisticsError" @click="loadBusinessStatistics">重试</button></p></div>
          <div class="spark-bars"><i v-for="n in 12" :key="n" :style="{ height: `${22 + ((n * 13) % 38)}%` }"></i></div>
        </article>
      </section>

      <section class="cockpit-primary">
        <article class="cockpit-panel map-overview">
          <div class="cockpit-panel__title"><h2>{{ scopeTitle }}综合监管一张图</h2></div>
          <DashboardMap :key="activeScene?.id || organization.id" :layers="mapLayers" :routes="patrolRoutes" :focus-layer-id="activeScene?.id" />
        </article>

        <aside class="cockpit-side">
          <article class="cockpit-panel task-list-panel">
            <div class="cockpit-panel__title"><h2>任务列表</h2><button type="button" class="linkish" @click="openTaskList">全部任务 〉</button></div>
            <div class="compact-list">
              <button v-for="task in dashboardTaskList" :key="task.id" class="task-list-item" @click="router.push(`/tasks/${task.id}`)">
                <span class="item-icon">{{ findOrganizationScene(organization, task.sceneCode, task.sceneName)?.icon }}</span>
                <span class="item-main"><b>{{ task.name }}</b><small>⌖ {{ task.area || task.deptName }}　·　{{ formatTaskListDate(task.updateTime || task.createTime) }}</small></span>
                <em :class="task.taskStatus === 5 ? 'tag-done' : task.taskStatus === 0 || task.taskStatus === 2 ? 'tag-pending' : 'tag-running'">{{ task.taskStatusDesc }}</em>
              </button>
              <div v-if="!dashboardTaskList.length && !statisticsLoading" class="dashboard-empty">暂无真实任务</div>
            </div>
          </article>
        </aside>
      </section>

      <section class="cockpit-secondary">
        <article class="cockpit-panel feed-panel live-entry" role="button" tabindex="0" @click="openPatrolLiveFullscreen" @keydown.enter="openPatrolLiveFullscreen" @keydown.space.prevent="openPatrolLiveFullscreen">
          <div class="cockpit-panel__title"><h2>无人机直播</h2><button type="button" class="linkish" @click.stop="openPatrolLiveOverview">全部直播 〉</button></div>
          <div class="feed-grid feed-grid--two">
            <template v-for="(livePreview, index) in livePreviewSlots" :key="livePreview?.id || `live-empty-${index}`">
              <div v-if="livePreviewLoading" class="feed-card feed-unavailable"><span>正在获取直播画面…</span></div>
              <div v-else-if="livePreview" class="feed-card live-preview">
              <video v-if="livePreview.playUrl" :src="livePreview.playUrl" muted autoplay playsinline></video>
              <iframe v-else-if="livePreview.embedUrl" :src="livePreview.embedUrl" :title="`${livePreviewLabel(livePreview)} 直播预览`" allow="autoplay; fullscreen; picture-in-picture" tabindex="-1"></iframe>
              <div v-else class="live-preview-empty">暂无可播放直播画面</div>
                <div class="feed-info"><b>{{ livePreviewLabel(livePreview) }}</b><span>{{ livePreview.aircraftId || '设备编号待同步' }}　·　{{ livePreview.protocol }}</span></div>
              </div>
              <div v-else class="feed-card feed-unavailable"><span>暂无直播画面</span></div>
            </template>
          </div>
        </article>

        <article class="cockpit-panel ai-panel">
          <div class="cockpit-panel__title"><h2>场景业务统计</h2><span>{{ currentUnitStatisticsLabel }} · 真实数据</span></div>
          <div class="ai-capability-grid">
            <button v-for="item in sceneBusinessStats" :key="item.id" class="ai-capability" :class="`capability-${item.visual}`" @click="openSceneTaskList(item.id)"><i>{{ item.icon }}</i><b>{{ item.name }}</b><small>{{ item.description }}</small></button>
            <div v-if="!sceneBusinessStats.length && !statisticsLoading" class="dashboard-empty">暂无场景统计数据</div>
          </div>
          <div class="ai-metric-row">
            <div v-for="metric in aiMetrics" :key="metric.label"><span>{{ metric.label }}</span><b>{{ metric.value }}<small>{{ metric.unit }}</small></b></div>
          </div>
        </article>

        <article class="cockpit-panel chart-panel">
          <div class="cockpit-panel__title"><h2>近 7 日业务趋势</h2><span>{{ currentUnitStatisticsLabel }} · 任务 / 异常图斑</span></div>
          <BusinessTrendChart :data="businessTrend" />
        </article>
      </section>

      <section class="governance-flow scene-entries">
        <div class="flow-caption"><b>{{ organization.shortName }}场景入口</b><span>{{ activeSceneEntries.length }} 个真实业务场景 · 点击进入场景总览</span></div>
        <button v-for="item in activeSceneEntries" :key="item.id" class="scene-entry" :class="{ active: activeScene?.id === item.id }" @click="enterScene(item.id)">
          <i>{{ item.icon }}</i><span><b>{{ item.shortName }}</b><em>{{ item.description }}</em></span>
        </button>
      </section>
    </main>
  </div>
</template>

<style scoped src="@/styles/dashboard.scss" lang="scss"></style>
<style scoped lang="scss">
.linkish { padding: 0; border: 0; color: inherit; background: transparent; font: inherit; cursor: pointer; }
.linkish:hover { color: #5eeaff; }
.linkish:focus-visible { outline: 1px solid #42dff1; outline-offset: 3px; }
.live-entry { cursor: pointer; }
.live-entry:focus-visible { outline: 2px solid #33d4e8; outline-offset: 2px; }
</style>
