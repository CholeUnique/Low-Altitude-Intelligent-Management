<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DashboardMap from '@/components/DashboardMap.vue'
import BusinessTrendChart from '@/components/BusinessTrendChart.vue'
import DashboardSymbol from '@/components/DashboardSymbol.vue'
import { Bell, Camera, CircleCheck, Collection, DataAnalysis, MapLocation, Monitor, Position, Timer, VideoCamera, WarningFilled } from '@element-plus/icons-vue'
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
const designPreview = computed(() => route.query.preview === '1')
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
    { label: '业务场景', value: overview?.sceneCount ?? organization.value.scenes.length, unit: '个', primary: `任务总数 ${taskSummary?.total ?? 26} 个`, secondary: currentUnitStatisticsLabel.value, icon: 'drone' as const, tone: 'cyan' },
    { label: '执行中任务', value: taskSummary?.executing ?? 6, unit: '个', primary: `待执行 ${taskSummary?.pending ?? 8} · 待核查 ${taskSummary?.pendingVerify ?? 5}`, secondary: '当前单位任务状态', icon: 'task' as const, tone: 'blue' },
    { label: '异常图斑', value: abnormalSummary?.total ?? 86, unit: '个', primary: `待核查 ${overview?.abnormalPendingCount ?? 12} 个`, secondary: `累计异常面积 ${typeof abnormalSummary?.areaTotal === 'number' ? formatNumber(abnormalSummary.areaTotal) : '18,640'} ㎡`, icon: 'pending' as const, tone: 'indigo' },
    { label: '成果批次', value: overview?.resultCount ?? 142, unit: '批', primary: `已解析要素 ${overview?.geometryCount ?? '2,846'} 个`, secondary: statisticsLoading.value ? '当前单位统计加载中…' : statisticsError.value ? '演示数据 · 接口待同步' : '当前单位成果汇总', icon: 'rate' as const, tone: 'green' },
  ]
})
const overviewTasks = [
  { name: '林业重点区域智能巡查', meta: '戴南镇 · 09:20 起飞', state: '执行中', tone: 'running' },
  { name: '河道蓝藻与排口巡检', meta: '凤城河 · 10:30 计划', state: '待执行', tone: 'pending' },
  { name: '违建变化图斑复核', meta: '医药高新区 · 12 个图斑', state: '待核查', tone: 'review' },
  { name: '耕地非粮化季度监测', meta: '姜堰区 · 已完成采集', state: '已完成', tone: 'done' },
]
const overviewAlerts = [
  { level: '高', name: '林地疑似新增违建', area: '戴南镇 · 1,286㎡', time: '10:42' },
  { level: '中', name: '河道漂浮物聚集', area: '凤城河东段 · 3处', time: '10:18' },
  { level: '中', name: '机场 03 风速预警', area: '阵风 11.2m/s', time: '09:56' },
]
const mapHotspots = [
  { x: 19, y: 36, label: '林业图斑 12' }, { x: 31, y: 62, label: '机场 01' }, { x: 46, y: 28, label: '执行中任务' },
  { x: 58, y: 55, label: '河道异常 3' }, { x: 70, y: 33, label: 'M350 RTK' }, { x: 78, y: 68, label: '违建图斑 8' },
  { x: 39, y: 45, label: '巡查航线 5' }, { x: 64, y: 73, label: '机场 02' },
]
const taskStatusChart = computed(() => {
  const summary = unitTaskSummary.value
  const items = [
    { label: '执行中', value: summary?.executing ?? 6, color: '#39dbe6', icon: Position },
    { label: '待执行', value: summary?.pending ?? 8, color: '#f5bd56', icon: Timer },
    { label: '待核查', value: summary?.pendingVerify ?? 5, color: '#a996ff', icon: DataAnalysis },
    { label: '已完成', value: summary?.finished ?? 7, color: '#46dfac', icon: CircleCheck },
  ]
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1
  let angle = 0
  const stops = items.map((item) => {
    const next = angle + item.value / total * 360
    const stop = `${item.color} ${angle}deg ${next}deg`
    angle = next
    return stop
  })
  return { items, total, gradient: `conic-gradient(${stops.join(',')})` }
})
const deviceStatus = [
  { label: '飞行中', value: 3, color: '#36dce7', icon: Position },
  { label: '待命', value: 5, color: '#4bdca7', icon: Monitor },
  { label: '充电中', value: 1, color: '#f4ba59', icon: Timer },
  { label: '离线', value: 1, color: '#8a9aae', icon: WarningFilled },
]
const sceneChart = computed(() => organization.value.scenes.slice(0, 5).map((scene, index) => ({
  id: scene.id, label: scene.shortName || scene.name, value: [12, 9, 7, 5, 3][index] ?? 3,
  color: ['#3bd9e6', '#5aaeff', '#45d4ab', '#f3ba56', '#a898f1'][index] ?? '#3bd9e6',
})))
const sceneChartMax = computed(() => Math.max(1, ...sceneChart.value.map((scene) => scene.value)))
const recognitionTypes = computed(() => {
  const values = statistics.value?.abnormalSummary.typeCounts?.length
    ? statistics.value.abnormalSummary.typeCounts.slice(0, 3).map((item) => ({ label: item.name, value: item.count }))
    : [{ label: '疑似违法占地', value: 34 }, { label: '林地破坏', value: 28 }, { label: '用途变化', value: 24 }]
  const max = Math.max(1, ...values.map((item) => item.value))
  return values.map((item, index) => ({ ...item, width: `${item.value / max * 100}%`, color: ['#4edee9', '#f6ba5c', '#9c9afb'][index] }))
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

  const entries = [
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
  ].slice(0, 4)
  const visibleEntries = entries.length ? entries : organization.value.scenes.slice(0, 4).map((scene, index) => ({
    id: scene.id, code: scene.id, name: scene.name, description: `任务 ${[8, 5, 7, 6][index] ?? 3} · 异常 ${[12, 4, 9, 3][index] ?? 2}`, visual: organization.value.id === 'agriculture-rural' ? 'field' : 'forest',
  }))
  return visibleEntries.map((item, index) => ({ ...item, icon: ['林', '河', '建', '农'][index]! }))
})
const aiMetrics = computed(() => [
  { label: '任务总数', value: String(unitTaskSummary.value?.total ?? 26), unit: '个' },
  { label: '异常面积', value: typeof statistics.value?.abnormalSummary.areaTotal === 'number' ? formatNumber(statistics.value.abnormalSummary.areaTotal) : '18,640', unit: '㎡' },
  { label: '成果批次', value: String(statistics.value?.overview.resultCount ?? 142), unit: '批' },
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
  const source = statistics.value?.trend.items?.length ? statistics.value.trend.items : [
    { date: '2026-09-15', taskCount: 12, abnormalCount: 6 }, { date: '2026-09-16', taskCount: 18, abnormalCount: 9 },
    { date: '2026-09-17', taskCount: 15, abnormalCount: 7 }, { date: '2026-09-18', taskCount: 23, abnormalCount: 14 },
    { date: '2026-09-19', taskCount: 19, abnormalCount: 11 }, { date: '2026-09-20', taskCount: 16, abnormalCount: 8 },
    { date: '2026-09-21', taskCount: 26, abnormalCount: 12 },
  ]
  return source.map((item) => ({
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
  const entries = organization.value.scenes.filter((scene) => realSceneIds.has(scene.id))
  return entries.length ? entries : organization.value.scenes
})
const livePreviewSlots = computed<(LiveStream | undefined)[]>(() => [livePreviews.value[0], livePreviews.value[1]])

function livePreviewLabel(preview?: LiveStream) {
  return preview?.aircraftName || preview?.aircraftId || '在线设备'
}

function formatNumber(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '—'
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

// 领导汇报版：任务与图斑优先使用现有统计接口；飞行量及覆盖面积待接入飞行记录服务。
const executiveFlight = computed(() => designPreview.value ? {
  sorties: 148, hours: '186.4', coverage: '38.4', aircraft: 12, online: 9,
  daily: [12, 18, 15, 23, 19, 16, 26],
} : undefined)
const executiveTask = computed(() => {
  const current = statistics.value?.taskSummary
  if (current) return { total: current.total, pending: current.pending, executing: current.executing, finished: current.finished, pendingVerify: current.pendingVerify }
  return designPreview.value ? { total: 130, pending: 12, executing: 37, finished: 81, pendingVerify: 12 } : undefined
})
const executiveRecognition = computed(() => {
  const current = statistics.value?.abnormalSummary
  if (current) return { total: current.total, pending: statistics.value?.overview.abnormalPendingCount ?? 0, area: current.areaTotal, high: current.levelCounts.find(item => item.name.includes('高'))?.count ?? 0 }
  return designPreview.value ? { total: 86, pending: 12, area: 18640, high: 18 } : undefined
})
const executiveScenes = computed(() => statistics.value?.sceneStats?.length
  ? statistics.value.sceneStats.slice(0, 5).map(item => ({ name: item.sceneName, tasks: item.taskCount, abnormal: item.abnormalCount }))
  : designPreview.value ? [
    { name: '林业执法监管', tasks: 36, abnormal: 28 },
    { name: '新增用地预警', tasks: 29, abnormal: 21 },
    { name: '存量用地整改', tasks: 25, abnormal: 16 },
    { name: '土地复垦', tasks: 18, abnormal: 9 },
    { name: '供后巡查', tasks: 15, abnormal: 7 },
  ] : [])
const executiveSceneMax = computed(() => Math.max(1, ...executiveScenes.value.map(item => item.tasks)))
const executiveRecognitionTypes = computed(() => statistics.value?.abnormalSummary.typeCounts?.length
  ? statistics.value.abnormalSummary.typeCounts.slice(0, 3).map(item => ({ name: item.name, count: item.count }))
  : designPreview.value ? [{ name: '疑似违法占地', count: 34 }, { name: '林地破坏', count: 28 }, { name: '用途变化', count: 24 }] : [])
const executiveRecognitionMax = computed(() => Math.max(1, ...executiveRecognitionTypes.value.map(item => item.count)))
const executiveCloseRate = computed(() => executiveTask.value?.total ? Math.round(executiveTask.value.finished / executiveTask.value.total * 100) : undefined)
const executiveDeviceStatus = computed(() => designPreview.value
  ? [{ name: '飞行中', count: 3, color: '#40dcf0' }, { name: '待命', count: 6, color: '#42d5a2' }, { name: '充电中', count: 2, color: '#f2bb5c' }, { name: '离线', count: 1, color: '#899dad' }]
  : [{ name: '飞行中', count: undefined, color: '#40dcf0' }, { name: '待命', count: undefined, color: '#42d5a2' }, { name: '充电中', count: undefined, color: '#f2bb5c' }, { name: '离线', count: undefined, color: '#899dad' }])
const executiveFlightMax = computed(() => Math.max(1, ...(executiveFlight.value?.daily ?? [1])))
const executiveFlightDates = ['09/16', '09/17', '09/18', '09/19', '09/20', '09/21', '09/22']

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
        <h1>海陵区自然资源综合监管平台</h1>
      </div>
      <nav class="cockpit-nav">
        <button class="active" @click="router.push('/dashboard')">单位总览</button><i></i>
        <button @click="router.push('/flight/fleet')">飞行作业</button><i></i>
        <button @click="router.push('/recognition/intelligent')">识别研判</button><i></i>
        <button @click="router.push('/task-center/overview')">任务中心</button><i></i>
        <button @click="router.push('/assets/map-services')">成果资产</button>
      </nav>
      <div class="cockpit-user">
        <time>{{ dateText }}　{{ timeText }}</time>
        <button class="notice" aria-label="消息通知"><DashboardSymbol name="notification" /><b>3</b></button>
        <OrganizationSwitcher />
        <UserAccountMenu icon-only />
      </div>
    </header>

    <main v-if="!sceneId" class="executive-overview">
      <aside class="executive-rail executive-left">
        <section class="executive-panel executive-flight-summary">
          <header><h2>飞行投入总览</h2><span>{{ designPreview ? '本月 · 演示数据' : '本月 · 待接入飞行记录' }}</span></header>
          <div class="executive-flight-lead"><span>累计巡查飞行</span><strong>{{ executiveFlight?.sorties ?? '—' }}<small>架次</small></strong><em>▲ 近 7 日持续巡查</em></div>
          <div class="executive-flight-pair"><div><small>累计飞行时长</small><b>{{ executiveFlight?.hours ?? '—' }}<em>小时</em></b></div><div><small>巡查覆盖面积</small><b>{{ executiveFlight?.coverage ?? '—' }}<em>km²</em></b></div></div>
          <p>覆盖林地、建设用地、河道等重点监管区域</p>
        </section>

        <section class="executive-panel executive-flight-trend">
          <header><h2>近 7 日飞行趋势</h2><span>架次 / 日</span></header>
          <div v-if="executiveFlight" class="executive-bars"><div v-for="(value,index) in executiveFlight.daily" :key="index"><b>{{ value }}</b><i :style="{ height: `${Math.max(15, value / executiveFlightMax * 100)}%` }"></i><small>{{ executiveFlightDates[index] }}</small></div></div>
          <div v-else class="executive-awaiting">飞行趋势待接入飞行记录服务</div>
          <div class="executive-panel-foot"><span>统计口径：已结束飞行计划</span><button @click="router.push('/recognition/flight-results')">查看飞行结果 ›</button></div>
        </section>

        <section class="executive-panel executive-fleet-summary">
          <header><h2>无人机机组资源</h2><span>{{ executiveFlight?.aircraft ?? '—' }} 架设备</span></header>
          <div class="executive-fleet-main"><div class="executive-fleet-ring"><strong>{{ executiveFlight?.online ?? '—' }}</strong><small>在线机组</small></div><div class="executive-fleet-copy"><b>机组可用态势</b><span>在线设备覆盖常态巡检与应急复飞</span><em>{{ designPreview ? '数据示意 · 设备接口待接入' : '设备实时接口待接入' }}</em></div></div>
          <div class="executive-device-grid"><div v-for="item in executiveDeviceStatus" :key="item.name"><i :style="{background:item.color}"></i><span>{{ item.name }}</span><b>{{ item.count ?? '—' }}</b></div></div>
          <div class="executive-fleet-bottom"><span>重点设备：海陵站 M4D · 城东组 M350 RTK</span><button @click="router.push('/flight/fleet')">机队总览 ›</button></div>
        </section>
      </aside>

      <section class="executive-map">
        <DashboardMap :key="organization.id" :layers="mapLayers" :routes="patrolRoutes" highlight-district="海陵区" />
        <div class="executive-map-title"><small>HAILING DISTRICT · EXECUTIVE OVERVIEW</small><h2>海陵区自然资源全域监管态势</h2><p>飞行巡查 · 智能识别 · 任务处置 · 成果沉淀</p></div>
        <div class="executive-map-tag">{{ designPreview ? '效果图演示数据' : statisticsError ? '统计暂不可用' : '当前单位数据' }}</div>
        <div v-if="designPreview" class="executive-map-markers"><span class="drone" style="left:31%;top:38%">✦ <b>巡查机组 01</b></span><span class="risk" style="left:62%;top:31%">● <b>林地疑似变化</b></span><span class="task" style="left:67%;top:62%">▣ <b>用地复核任务</b></span><span class="drone" style="left:42%;top:70%">✦ <b>海陵站 M4D</b></span></div>
        <div class="executive-map-kpis"><div><small>执行中任务</small><b>{{ executiveTask?.executing ?? '—' }}</b></div><div><small>待核查图斑</small><b>{{ executiveRecognition?.pending ?? '—' }}</b></div><div><small>已完成任务</small><b>{{ executiveTask?.finished ?? '—' }}</b></div></div>
        <div class="executive-map-legend"><span><i class="flight"></i>无人机机组</span><span><i class="task"></i>任务区域</span><span><i class="risk"></i>异常图斑</span><em>点击地图可查看区域详情</em></div>
      </section>

      <aside class="executive-rail executive-right">
        <section class="executive-panel executive-scene-tasks">
          <header><h2>各场景任务数</h2><span>{{ executiveScenes.length }} 类场景</span></header>
          <div class="executive-scene-list"><button v-for="(item,index) in executiveScenes" :key="item.name" @click="router.push('/task-center/scenes')"><i>{{ ['林','地','改','复','巡'][index] }}</i><span><b>{{ item.name }}</b><em><u :style="{ width: `${item.tasks / executiveSceneMax * 100}%` }"></u></em></span><strong>{{ item.tasks }}</strong></button><div v-if="!executiveScenes.length" class="executive-awaiting">场景统计暂不可用</div></div>
          <div class="executive-panel-foot"><span>按当前单位任务量排序</span><button @click="router.push('/task-center/overview')">任务总览 ›</button></div>
        </section>

        <section class="executive-panel executive-recognition">
          <header><h2>智能识别结果</h2><span>疑似图斑</span></header>
          <div class="executive-recognition-head"><div class="executive-recognition-ring"><strong>{{ executiveRecognition?.total ?? '—' }}</strong><small>识别图斑</small></div><div><span>高风险图斑 <b>{{ executiveRecognition?.high ?? '—' }}</b></span><span>待核查图斑 <b>{{ executiveRecognition?.pending ?? '—' }}</b></span><span>涉及面积 <b>{{ executiveRecognition?.area != null ? formatNumber(executiveRecognition.area) : '—' }}<small>㎡</small></b></span></div></div>
          <div class="executive-recognition-types"><div v-for="(item,index) in executiveRecognitionTypes" :key="item.name"><span>{{ item.name }}</span><em><u :style="{ width: `${item.count / executiveRecognitionMax * 100}%`, background: ['#40dfe9','#ffbf64','#a994ef'][index] }"></u></em><b>{{ item.count }}</b></div><div v-if="!executiveRecognitionTypes.length" class="executive-awaiting">识别分类暂不可用</div></div>
        </section>

        <section class="executive-panel executive-closure">
          <header><h2>治理闭环成效</h2><span>任务办理进展</span></header>
          <div class="executive-closure-main"><div class="executive-closure-ring" :style="{ background: `radial-gradient(circle,#06243a 59%,transparent 61%),conic-gradient(#43dfb7 0 ${executiveCloseRate ?? 0}%,#114665 ${executiveCloseRate ?? 0}% 100%)` }"><strong>{{ executiveCloseRate ?? '—' }}<small>%</small></strong><span>任务完成率</span></div><div class="executive-closure-numbers"><div><span>任务总数</span><b>{{ executiveTask?.total ?? '—' }}</b></div><div><span>已完成</span><b>{{ executiveTask?.finished ?? '—' }}</b></div><div><span>执行中</span><b>{{ executiveTask?.executing ?? '—' }}</b></div><div><span>待执行</span><b>{{ executiveTask?.pending ?? '—' }}</b></div></div></div>
          <div class="executive-closure-flow"><span>发现</span><i></i><span>核查</span><i></i><span>整改</span><i></i><span>复核</span><i></i><span>归档</span></div>
          <p>从疑似图斑发现到任务归档，形成可追溯的处置闭环</p>
        </section>
      </aside>
    </main>

    <main v-else class="cockpit-body overview-v2">
      <section class="cockpit-stats">
        <article v-for="stat in dashboardStats" :key="stat.label" class="cockpit-stat" :class="`is-${stat.tone}`">
          <div class="stat-icon"><DashboardSymbol :name="stat.icon" /></div>
          <div class="stat-copy"><label>{{ stat.label }}</label><strong>{{ stat.value }}<small>{{ stat.unit }}</small></strong><p>{{ stat.primary }}</p></div>
          <div class="stat-gauge" :class="`gauge-${stat.tone}`"><span>{{ stat.label === '业务场景' ? 'ALL' : stat.label === '执行中任务' ? 'LIVE' : stat.label === '异常图斑' ? 'AI' : 'DATA' }}</span></div>
        </article>
      </section>

      <section class="cockpit-primary">
        <aside class="overview-left-rail">
          <article class="cockpit-panel task-distribution-panel">
            <div class="cockpit-panel__title"><h2><DataAnalysis /> 任务状态分布</h2><span>共 {{ taskStatusChart.total }} 项</span></div>
            <div class="task-distribution-body">
              <div class="task-donut" :style="{ background: taskStatusChart.gradient }"><div><b>{{ taskStatusChart.total }}</b><small>全部任务</small></div></div>
              <div class="task-distribution-legend"><div v-for="item in taskStatusChart.items" :key="item.label"><i :style="{ color: item.color, background: `${item.color}20` }"><component :is="item.icon" /></i><span>{{ item.label }}</span><b :style="{ color: item.color }">{{ item.value }}</b></div></div>
            </div>
          </article>
          <article class="cockpit-panel task-activity-panel">
            <div class="cockpit-panel__title"><h2><Collection /> 重点任务</h2><button @click="router.push('/tasks')">任务列表 ›</button></div>
            <button v-for="(item,index) in overviewTasks" :key="item.name" class="activity-row" @click="router.push('/tasks')"><span class="activity-index">0{{ index+1 }}</span><span class="activity-info"><b>{{ item.name }}</b><small>{{ item.meta }}</small></span><em :class="item.tone">{{ item.state }}</em></button>
          </article>
          <article class="cockpit-panel fleet-status-panel">
            <div class="cockpit-panel__title"><h2><Monitor /> 机队状态</h2><span>在线 8 / 10</span></div>
            <div class="fleet-status-grid"><div v-for="item in deviceStatus" :key="item.label"><i :style="{color:item.color}"><component :is="item.icon" /></i><b>{{ item.value }}</b><small>{{ item.label }}</small></div></div>
          </article>
        </aside>
        <article class="cockpit-panel map-overview">
          <div class="cockpit-panel__title"><h2><MapLocation /> {{ scopeTitle }} · 全域态势</h2><span>任务 / 设备 / 图斑一张图</span></div>
          <DashboardMap :key="activeScene?.id || organization.id" :layers="mapLayers" :routes="patrolRoutes" :focus-layer-id="activeScene?.id" />
          <div class="map-intelligence-layer">
            <button v-for="(point,index) in mapHotspots" :key="point.label" :style="{ left: `${point.x}%`, top: `${point.y}%` }" :class="{ alert: index===0 || index===5 }"><i>{{ index===1 ? '场' : index===4 ? '机' : '斑' }}</i><span>{{ point.label }}</span></button>
          </div>
          <div class="map-hud-top"><span><Position /> 当前执行 <b>6</b></span><span><VideoCamera /> 在线设备 <b>8</b></span><span><WarningFilled /> 待处置 <b>12</b></span></div>
          <div class="map-hud-bottom"><span><i class="map-key task"></i>任务区域</span><span><i class="map-key drone"></i>飞行器</span><span><i class="map-key airport"></i>机场</span><span><i class="map-key alert"></i>异常图斑</span><em>效果图演示数据 · 地图标记仅示意</em></div>
        </article>
        <aside class="overview-right-rail">
          <article class="cockpit-panel scene-chart-panel">
            <div class="cockpit-panel__title"><h2><DataAnalysis /> 场景任务对比</h2><span>{{ activeSceneEntries.length }} 类业务</span></div>
            <div class="scene-chart-body"><button v-for="(scene,index) in sceneChart" :key="scene.id" @click="enterScene(scene.id)"><i>{{ ['林','河','建','农','巡'][index] }}</i><span><b>{{ scene.label }}</b><em><u :style="{ width: `${scene.value/sceneChartMax*100}%`, background: scene.color }"></u></em></span><strong>{{ scene.value }}</strong></button></div>
          </article>
          <article class="cockpit-panel resource-chart-panel">
            <div class="cockpit-panel__title"><h2><VideoCamera /> 设备资源</h2><span>10 台设备</span></div>
            <div class="resource-gauges"><div><span class="mini-gauge"><b>80%</b></span><small>设备在线率</small></div><div><span class="mini-gauge airport-gauge"><b>75%</b></span><small>机场可用率</small></div></div>
            <div class="resource-bars"><div v-for="item in deviceStatus" :key="item.label"><span>{{ item.label }}</span><em><u :style="{width:`${item.value*12}%`,background:item.color}"></u></em><b>{{ item.value }}</b></div></div>
          </article>
          <article class="cockpit-panel alert-command-panel">
            <div class="cockpit-panel__title"><h2><Bell /> 实时预警</h2><span>3 条待处置</span></div>
            <div v-for="item in overviewAlerts" :key="item.name" class="overview-alert"><i :class="{high:item.level==='高'}">{{ item.level }}</i><span><b>{{ item.name }}</b><small>{{ item.area }}</small></span><time>{{ item.time }}</time></div>
          </article>
        </aside>
      </section>

      <section class="cockpit-secondary">
        <article class="cockpit-panel feed-panel live-entry" role="button" tabindex="0" @click="openPatrolLiveFullscreen" @keydown.enter="openPatrolLiveFullscreen" @keydown.space.prevent="openPatrolLiveFullscreen">
          <div class="cockpit-panel__title"><h2><Camera /> 无人机直播</h2><button type="button" class="linkish" @click.stop="openPatrolLiveOverview">全部直播 ›</button></div>
          <div class="feed-grid feed-grid--two">
            <template v-for="(livePreview, index) in livePreviewSlots" :key="livePreview?.id || `live-empty-${index}`">
              <div v-if="livePreviewLoading" class="feed-card feed-unavailable"><span>正在获取直播画面…</span></div>
              <div v-else-if="livePreview" class="feed-card live-preview">
              <video v-if="livePreview.playUrl && !designPreview" :src="livePreview.playUrl" muted autoplay playsinline></video>
              <iframe v-else-if="livePreview.embedUrl && !designPreview" :src="livePreview.embedUrl" :title="`${livePreviewLabel(livePreview)} 直播预览`" allow="autoplay; fullscreen; picture-in-picture" tabindex="-1"></iframe>
              <div v-else class="live-preview-empty dashboard-demo-feed"><i></i><span>● LIVE　{{ livePreviewLabel(livePreview) }}</span></div>
                <div class="feed-info"><b>{{ livePreviewLabel(livePreview) }}</b><span>{{ livePreview.aircraftId || '设备编号待同步' }}　·　{{ livePreview.protocol }}</span></div>
              </div>
              <div v-else class="feed-card feed-unavailable dashboard-demo-feed"><i></i><span>● LIVE　机场巡查云台</span></div>
            </template>
          </div>
        </article>

        <article class="cockpit-panel ai-panel recognition-chart-panel">
          <div class="cockpit-panel__title"><h2><Collection /> 智能识别概况</h2><span>疑似问题分类</span></div>
          <div class="recognition-chart-body">
            <div class="recognition-ring"><div><b>{{ statistics?.abnormalSummary.total ?? 86 }}</b><small>识别图斑</small></div></div>
            <div class="recognition-type-bars"><div v-for="item in recognitionTypes" :key="item.label"><span><b>{{ item.label }}</b><strong>{{ item.value }}</strong></span><em><u :style="{ width:item.width, background:item.color }"></u></em></div></div>
          </div>
          <div class="ai-metric-row">
            <div v-for="metric in aiMetrics" :key="metric.label"><span>{{ metric.label }}</span><b>{{ metric.value }}<small>{{ metric.unit }}</small></b></div>
          </div>
        </article>

        <article class="cockpit-panel chart-panel">
          <div class="cockpit-panel__title"><h2><DataAnalysis /> 近 7 日业务趋势</h2><span>任务 / 异常图斑</span></div>
          <BusinessTrendChart :data="businessTrend" />
        </article>
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
