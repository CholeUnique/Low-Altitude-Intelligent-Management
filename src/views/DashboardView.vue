<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DashboardRing from '@/components/DashboardRing.vue'
import DashboardSymbol from '@/components/DashboardSymbol.vue'
import { Timer, Position } from '@element-plus/icons-vue'
import DashboardMap from '@/components/DashboardMap.vue'
import { useUserStore } from '@/stores/user'
import { getGovernanceTaskGeometry, getGovernanceTaskPage, type GovernanceTask, type TaskGeometryFeatureCollection } from '@/api/governance-task'
import { getScene } from '@/mocks/portal'
import { getBusinessAbnormalSummary, getBusinessDashboardStatistics, type BusinessDashboardStatistics, type BusinessSceneStat } from '@/api/business-statistics'
import { createDashboardGeometryLoader, loadDashboardSceneCounts } from '@/utils/dashboard-loading'
import { getDepartmentOptions, getMyDepartments, switchDepartment } from '@/api/auth'
import {
  getLiveStreams,
  getUavDeviceSummary,
  getUavFlightSummary,
  getUavMediaSummary,
  type UavDeviceSummary,
  type UavFlightSummary,
  type UavMediaSummary,
} from '@/api/patrol'
import type { LiveStream } from '@/adapters/dasFly'
import { findOrganizationScene, isTaskVisibleForOrganization } from '@/utils/scene-visibility'
import { resolveWorkspaceSceneId } from '@/workspace/config/registry'
import type { DashboardMapLayer } from '@/types'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const statistics = ref<BusinessDashboardStatistics>()
const statisticsLoading = ref(false)
const statisticsError = ref('')
const currentUnitTasks = ref<GovernanceTask[]>([])
const currentUnitTasksLoaded = ref(false)
/** 当前部门的场景级完整汇总，不再扫描任务异常分页。 */
const sceneAbnormalCounts = ref<Record<string, number>>({})
const taskRanges = ref<Record<string, TaskGeometryFeatureCollection>>({})
const taskRangesLoading = ref(false)
const geometryLoader = createDashboardGeometryLoader(taskId => getGovernanceTaskGeometry(taskId, undefined, false, user.activeDeptId))
const livePreviews = ref<LiveStream[]>([])
const livePreviewLoading = ref(true)
const livePreviewLoaded = ref(false)
const onlineUavCount = ref<number>()
const uavDeviceSummary = ref<UavDeviceSummary>()
const uavFlightSummary = ref<UavFlightSummary>()
/** 素材数量与容量统一读取后端汇总，不在首页扫描任务素材明细。 */
const uavMediaSummary = ref<UavMediaSummary>()
const isMapClearScreen = ref(false)
let statisticsRequestVersion = 0
let geometryRequestVersion = 0
let abnormalCountRequestVersion = 0
let livePreviewRequestVersion = 0
const sceneId = computed(() => typeof route.params.sceneId === 'string' ? route.params.sceneId : '')
const organization = computed(() => user.organization)
const activeScene = computed(() => getScene(organization.value, sceneId.value))
const sceneGeometryPending = computed(() => Boolean(activeScene.value) && (taskRangesLoading.value || (!currentUnitTasksLoaded.value && statisticsLoading.value)))
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
// 汇总接口可能包含归属其他单位场景的历史任务；首页任务统计统一基于完成
// 部门与场景归属过滤后的任务明细计算，确保总数与场景圆环、任务列表一致。
const unitTaskSummary = computed(() => currentUnitTasks.value.reduce((summary, task) => {
  summary.total += 1
  if (task.taskStatus === 0) summary.pending += 1
  else if (task.taskStatus === 1) summary.executing += 1
  else if (task.taskStatus === 2) summary.pendingVerify += 1
  else if (task.taskStatus === 3) summary.failed += 1
  else if (task.taskStatus === 4) summary.canceled += 1
  else if (task.taskStatus === 5) summary.finished += 1
  return summary
}, { total: 0, pending: 0, executing: 0, pendingVerify: 0, failed: 0, canceled: 0, finished: 0 }))
/**
 * 直接按当前部门任务接口返回的全部真实任务归并场景。
 * 已明确属于其他单位的场景会在任务可见性规则中排除；后端新增且尚未写入
 * 静态配置的场景仍按接口编码保留，避免合法新业务在首页被漏计。
 */
const sceneBusinessStats = computed(() => {
  const groupedScenes = new Map<string, {
    id: string
    code: string
    name: string
    taskCount: number
    abnormalCount: number | undefined
    description: string
    visual: string
  }>()

  currentUnitTasks.value.forEach((task) => {
    const scene = findOrganizationScene(organization.value, task.sceneCode, task.sceneName)
    const resolvedSceneId = resolveWorkspaceSceneId(task.sceneCode, task.sceneName)
    const id = scene?.id || resolvedSceneId || task.sceneCode || task.sceneName || 'uncategorized'
    const name = scene?.name || task.sceneName || task.sceneCode || '未分类场景'
    const current = groupedScenes.get(id)
    const taskCount = (current?.taskCount || 0) + 1
    const abnormalCount = sceneAbnormalCounts.value[id]
    groupedScenes.set(id, {
      id,
      code: current?.code || task.sceneCode,
      name,
      taskCount,
      abnormalCount,
      description: `任务 ${taskCount} · 异常 ${formatCount(abnormalCount)}`,
      visual: organization.value.id === 'agriculture-rural' ? 'field' : 'forest',
    })
  })

  return [...groupedScenes.values()]
})
function percentage(numerator: number | undefined, denominator: number | undefined) {
  if (typeof numerator !== 'number' || typeof denominator !== 'number' || denominator <= 0) return undefined
  return Math.round(Math.min(Math.max(numerator / denominator * 100, 0), 100))
}

const taskStatusLegend = computed(() => [
  { name: '执行中', count: unitTaskSummary.value.executing, color: '#35c8f2' },
  { name: '已完成', count: unitTaskSummary.value.finished, color: '#55e5cf' },
  { name: '待执行', count: unitTaskSummary.value.pending, color: '#7389ef' },
  { name: '待核查', count: unitTaskSummary.value.pendingVerify, color: '#e8be6c' },
  { name: '已失败', count: unitTaskSummary.value.failed, color: '#ec8298' },
  { name: '已取消', count: unitTaskSummary.value.canceled, color: '#64879b' },
].filter((item, index) => index < 3 || item.count > 0))
const mediaPhotoRate = computed(() => percentage(uavMediaSummary.value?.photoCount, uavMediaSummary.value?.totalCount))
const fleetAvailabilityRate = computed(() => percentage(
  uavDeviceSummary.value?.onlineCount,
  uavDeviceSummary.value?.totalCount,
))
const governanceCompletionRate = computed(() => percentage(
  unitTaskSummary.value?.finished,
  unitTaskSummary.value?.total,
))
const recognitionHandledRate = computed(() => {
  const total = statistics.value?.abnormalSummary.total
  const pending = statistics.value?.overview.abnormalPendingCount
  if (typeof total !== 'number' || typeof pending !== 'number') return undefined
  return percentage(Math.max(total - pending, 0), total)
})
const abnormalTypeLabels: Record<string, string> = {
  OTHER: '其他',
  ILLEGAL_OCCUPY: '违法占用',
  ABANDONED: '撂荒',
  FOREST_DAMAGE: '林地破坏',
  NON_GRAIN: '非粮化',
  ILLEGAL_BUILD: '违法建设',
}
const recognitionItems = computed(() => (statistics.value?.abnormalSummary.typeCounts || [])
  .map((item) => ({ ...item, name: abnormalTypeLabels[item.key] || abnormalTypeLabels[item.name] || item.name }))
  .sort((a, b) => b.count - a.count))
const sceneTaskRingColors = ['#37ead7', '#45a8ff', '#a17cff', '#ffbd4a', '#ff738d', '#57d68d']
const sceneTaskTotal = computed(() => sceneBusinessStats.value.reduce((total, item) => total + Math.max(item.taskCount, 0), 0))
const hoveredSceneTaskId = ref('')
const sceneTaskChartItems = computed(() => {
  let accumulatedPercentage = 0
  return sceneBusinessStats.value.map((item, index) => {
    const percentage = sceneTaskTotal.value > 0 ? Math.max(item.taskCount, 0) / sceneTaskTotal.value * 100 : 0
    const chartItem = {
      ...item,
      color: sceneTaskRingColors[index % sceneTaskRingColors.length]!,
      percentage,
      dashArray: `${percentage} ${100 - percentage}`,
      dashOffset: -accumulatedPercentage,
    }
    accumulatedPercentage += percentage
    return chartItem
  })
})
const hoveredSceneTask = computed(() => sceneTaskChartItems.value.find((item) => item.id === hoveredSceneTaskId.value))
function openSceneTaskList(sceneId: string) {
  if (!user.hasPermission('task-list')) return
  router.push({ name: 'task-list', query: { sceneId } })
}

function openFleetOverview() {
  router.push({ name: 'uav-tasks', params: { tab: 'fleet' } })
}

function openLiveOperations() {
  router.push({ name: 'uav-tasks', params: { tab: 'live' } })
}

function openTaskOverview() {
  router.push({ name: 'task-overview' })
}

function openDataManagement() {
  router.push({ name: 'recognition', params: { tab: 'data' } })
}

function openRecognition() {
  router.push({ name: 'recognition', params: { tab: 'spots' } })
}

function openTaskList() {
  router.push({ name: 'task-list' })
}

function formatNumber(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '—'
}

function formatCount(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '—'
}

function formatFlightTime(seconds: number | undefined) {
  if (typeof seconds !== 'number') return '—'
  const hours = seconds / 3600
  return `${hours.toLocaleString('zh-CN', { maximumFractionDigits: hours < 10 ? 1 : 0 })} 小时`
}

function formatDistance(meters: number | undefined) {
  if (typeof meters !== 'number') return '—'
  if (Math.abs(meters) >= 1000) {
    return `${(meters / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} km`
  }
  return `${meters.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} m`
}

function formatFileSize(bytes: number | undefined) {
  if (typeof bytes !== 'number') return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), units.length - 1)
  const amount = bytes / 1024 ** Math.max(unitIndex, 0)
  return `${amount.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} ${units[Math.max(unitIndex, 0)]}`
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

async function loadTaskRanges() {
  const currentGeometryRequest = ++geometryRequestVersion
  const scene = activeScene.value
  // 首页没有任务范围定位需求时，连 GeoJSON 请求都不发送。
  if (!scene || !currentUnitTasksLoaded.value) {
    taskRanges.value = {}
    taskRangesLoading.value = false
    return
  }
  const tasks = currentUnitTasks.value.filter(task => findOrganizationScene(organization.value, task.sceneCode, task.sceneName)?.id === scene.id)
  taskRangesLoading.value = true
  const isCurrent = () => currentGeometryRequest === geometryRequestVersion
  try {
    const ranges = await geometryLoader.load(tasks, isCurrent)
    if (isCurrent()) taskRanges.value = ranges
  } finally {
    if (isCurrent()) taskRangesLoading.value = false
  }
}

/** 优先复用 scene-stat；缺失场景按 sceneCode 补一次完整汇总，不按任务累加。 */
async function loadSceneAbnormalCounts(tasks: GovernanceTask[], requestVersion: number, deptId: string | undefined, sceneStats: BusinessSceneStat[]) {
  const currentAbnormalRequest = ++abnormalCountRequestVersion
  const isCurrent = () => requestVersion === statisticsRequestVersion && currentAbnormalRequest === abnormalCountRequestVersion
  const byCode = await loadDashboardSceneCounts(tasks.map(task => task.sceneCode), sceneStats,
    sceneCode => getBusinessAbnormalSummary({ deptId, sceneCode }), isCurrent)
  if (!isCurrent()) return
  const counts: Record<string, number> = {}
  tasks.forEach(task => {
    const scene = findOrganizationScene(organization.value, task.sceneCode, task.sceneName)
    const id = scene?.id || resolveWorkspaceSceneId(task.sceneCode, task.sceneName) || task.sceneCode || task.sceneName || 'uncategorized'
    const count = byCode[task.sceneCode]
    if (count !== undefined) counts[id] = count
  })
  sceneAbnormalCounts.value = counts
}

const departmentNameMatchers = {
  'natural-resources': /自然资源.*规划|自然资源/,
  'agriculture-rural': /农业农村/,
} as const

/**
 * 修复旧会话或管理员无默认部门时缺失的数据权限上下文。
 * 必须通过部门切换接口换签 Token，不能只在前端补写 activeDeptId。
 */
async function establishDepartmentContext() {
  const rawDepartments = user.currentUser?.role === 'ADMIN'
    ? await getDepartmentOptions()
    : await getMyDepartments()
  const departments = rawDepartments.map((department) => ({
    deptId: String(department.deptId),
    deptName: department.deptName,
    isDefault: 'isDefault' in department && Boolean(department.isDefault),
  }))
  const matcher = departmentNameMatchers[user.organizationId]
  const department = departments.find((item) => matcher.test(item.deptName))
    || departments.find((item) => item.isDefault)
    || (departments.length === 1 ? departments[0] : undefined)
  if (!department) {
    throw new Error(`当前账号未配置“${user.organization.name}”部门身份，无法加载该单位数据。`)
  }

  const scopedSession = await switchDepartment(department.deptId)
  const activeDeptId = scopedSession.activeDeptId || department.deptId
  user.setDepartmentSession(scopedSession.accessToken, scopedSession.expiresIn, activeDeptId)
  return activeDeptId
}

async function loadBusinessStatistics(resetExisting = false) {
  // 身份、部门和单位可在登录/切换时连续变更。每次都递增版本号，令旧请求的
  // 返回值失效；不能以 statisticsLoading 拦截新请求，否则首个请求会使用旧 token
  // 或旧部门，后续正确上下文的加载又被忽略，最终首页只会显示空数据。
  const requestVersion = ++statisticsRequestVersion
  let deptId = user.activeDeptId
  const organizationId = user.organizationId
  // 首次进入或切换认证上下文时显示前台加载状态；定时轮询只在后台静默更新，
  // 不能先清空现有数据，否则地图图层会被销毁重建，用户的勾选和视野也会重置。
  const foregroundLoad = resetExisting || !currentUnitTasksLoaded.value || !statistics.value
  if (foregroundLoad) statisticsLoading.value = true
  if (resetExisting) {
    statisticsError.value = ''
    // 切换身份期间不可继续展示上一单位数据；待本次请求完成后再呈现新单位结果。
    statistics.value = undefined
    currentUnitTasksLoaded.value = false
    geometryRequestVersion += 1
    geometryLoader.clear()
    currentUnitTasks.value = []
    taskRanges.value = {}
    taskRangesLoading.value = false
    sceneAbnormalCounts.value = {}
  }

  if (user.authMode === 'real' && !deptId) {
    try {
      deptId = await establishDepartmentContext()
      // setDepartmentSession 会触发新的、携带正确 Token 的加载；旧请求立即失效。
      if (requestVersion !== statisticsRequestVersion) return
    } catch (error) {
      if (requestVersion !== statisticsRequestVersion) return
      statisticsError.value = error instanceof Error
        ? `部门身份初始化失败：${error.message}`
        : '部门身份初始化失败，请重新登录后重试。'
      statisticsLoading.value = false
      return
    }
  }

  // 立即绑定拒绝处理，避免任务接口较慢时统计接口的失败成为未处理的 Promise。
  const statisticsPromise = Promise.allSettled([getBusinessDashboardStatistics({ deptId })])
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
    } else if (!currentUnitTasksLoaded.value) {
      // 首次加载失败时保持明确的空状态；后台刷新失败则保留最后一次成功数据。
      currentUnitTasks.value = []
      currentUnitTasksLoaded.value = false
      taskRanges.value = {}
      sceneAbnormalCounts.value = {}
    }

    const statisticsResult = await statisticsPromise
    if (requestVersion !== statisticsRequestVersion) return
    const statisticsPage = statisticsResult[0]
    if (statisticsPage?.status === 'fulfilled') {
      statistics.value = statisticsPage.value
      statisticsError.value = ''
    } else {
      // 后台轮询失败不能把当前统计卡片清空，只更新错误提示供用户主动重试。
      if (!statistics.value) statistics.value = undefined
      statisticsError.value = statisticsPage?.status === 'rejected' && statisticsPage.reason instanceof Error
        ? statisticsPage.reason.message
        : '统计接口请求失败'
    }
    void loadSceneAbnormalCounts(currentUnitTasks.value, requestVersion, deptId,
      statisticsPage?.status === 'fulfilled' ? statisticsPage.value.sceneStats || [] : [])
  } catch (error) {
    // 防御性兜底：无论任何解析/渲染异常，均不可让首页永久处于加载状态。
    statisticsError.value = error instanceof Error ? error.message : '首页数据加载失败'
  } finally {
    if (requestVersion === statisticsRequestVersion && foregroundLoad) statisticsLoading.value = false
  }
}

async function loadLivePreview(resetMediaSummary = false) {
  const requestVersion = ++livePreviewRequestVersion
  if (resetMediaSummary) uavMediaSummary.value = undefined
  const initialLoad = !livePreviewLoaded.value
  if (initialLoad) livePreviewLoading.value = true
  try {
    const [streamsResult, deviceSummaryResult, flightSummaryResult] = await Promise.allSettled([
      getLiveStreams(),
      getUavDeviceSummary(),
      getUavFlightSummary(),
      // 素材卡片独立提交结果，不等待直播分享地址等较慢请求完成。
      getUavMediaSummary().then((summary) => {
        if (requestVersion === livePreviewRequestVersion) uavMediaSummary.value = summary
      }, () => {
        if (requestVersion === livePreviewRequestVersion) uavMediaSummary.value = undefined
      }),
    ])
    if (requestVersion !== livePreviewRequestVersion) return
    if (deviceSummaryResult.status === 'fulfilled') {
      uavDeviceSummary.value = deviceSummaryResult.value
      onlineUavCount.value = deviceSummaryResult.value.onlineCount
    } else if (initialLoad) {
      uavDeviceSummary.value = undefined
    }
    if (flightSummaryResult.status === 'fulfilled') {
      uavFlightSummary.value = flightSummaryResult.value
    } else if (initialLoad) {
      uavFlightSummary.value = undefined
    }
    if (streamsResult.status === 'fulfilled') {
      const result = streamsResult.value
      if (onlineUavCount.value === undefined) onlineUavCount.value = result.onlineDeviceCount
      const previousById = new Map(livePreviews.value.map((preview) => [preview.id, preview]))
      livePreviews.value = result.list.slice(0, 2).map((preview) => {
        const previous = previousById.get(preview.id)
        // 分享码通常可复用一段时间。后台轮询仅用于确认设备在线状态，保留既有
        // 播放地址可避免 video / iframe 在每轮刷新时被销毁并出现黑屏闪烁。
        return previous?.playUrl || previous?.embedUrl
          ? { ...preview, playUrl: previous.playUrl, embedUrl: previous.embedUrl, protocol: previous.protocol, shareCode: previous.shareCode, expiresAt: previous.expiresAt }
          : preview
      })
    } else if (initialLoad) {
      livePreviews.value = []
    }
  } catch {
    if (requestVersion === livePreviewRequestVersion && initialLoad) livePreviews.value = []
  } finally {
    if (requestVersion === livePreviewRequestVersion) {
      livePreviewLoading.value = false
      livePreviewLoaded.value = true
    }
  }
}

// 统计请求本身最多等待 15 秒，刷新周期必须明显大于该时长，避免请求彼此覆盖。
const dashboardRefreshTimer = window.setInterval(() => {
  void loadBusinessStatistics()
  void loadLivePreview()
}, 60_000)
onBeforeUnmount(() => {
  window.clearInterval(dashboardRefreshTimer)
  statisticsRequestVersion += 1
  abnormalCountRequestVersion += 1
  geometryRequestVersion += 1
  livePreviewRequestVersion += 1
  geometryLoader.clear()
})
// 只在进入场景或该场景任务更新时读取几何；普通首页及定时统计刷新不扫描范围。
watch([() => activeScene.value?.id, currentUnitTasks, currentUnitTasksLoaded], () => {
  void loadTaskRanges()
}, { immediate: true, flush: 'sync' })
// 登录完成、部门切换或单位切换时，始终按最终的认证上下文重新拉取。flush: 'post'
// 会把 setRealSession 内的多项同步状态更新合并后再执行，避免中间态请求。
watch([() => user.token, () => user.authMode, () => user.activeDeptId, () => user.organizationId], () => {
  void loadBusinessStatistics(true)
  void loadLivePreview(true)
}, { immediate: true, flush: 'post' })
</script>

<template>
  <div class="cockpit cockpit--glass" :class="{ 'cockpit--clear-screen': isMapClearScreen }">

    <main class="cockpit-body cockpit-body--map-only">
      <section class="cockpit-primary">
        <div class="overview-layout">
          <aside class="overview-side overview-side--left" :inert="isMapClearScreen" :aria-hidden="isMapClearScreen">
            <section class="overview-float-panel resource-panel">
              <header>
                <h2>无人机机组资源</h2>
                <button v-if="user.hasPermission('live-monitoring')" class="overview-header-link" type="button" aria-label="进入实时作业" @click="openLiveOperations">实时作业 <span aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m6 4 4 4-4 4" /></svg></span></button>
              </header>
              <div class="resource-summary">
                <DashboardRing :value="onlineUavCount ?? '—'" label="在线机组" :rate="fleetAvailabilityRate" :title="fleetAvailabilityRate === undefined ? '暂无机组总数' : `机组可用率 ${fleetAvailabilityRate}%`"><DashboardSymbol name="drone" /></DashboardRing>
                <div class="resource-states"><span><i class="online"></i>直播中 <b>{{ livePreviews.filter(item => item.status === 'ONLINE').length }}</b></span><span><i class="starting"></i>连接中 <b>{{ livePreviews.filter(item => item.status === 'STARTING').length }}</b></span><span><i class="offline"></i>离线 <b>{{ formatCount(uavDeviceSummary?.offlineCount) }}</b></span></div>
              </div>
              <p class="summary-foot">{{ livePreviewLoading ? '正在获取设备状态…' : '设备状态实时刷新' }}<span>已接入 {{ livePreviews.length }} 路直播画面</span></p>
            </section>

            <section class="overview-float-panel operation-panel">
              <header>
                <h2>飞行作业统计</h2>
                <button v-if="user.hasPermission('fleet-overview')" class="overview-header-link" type="button" aria-label="进入机队总览" @click="openFleetOverview">机队总览 <span aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m6 4 4 4-4 4" /></svg></span></button>
              </header>
              <p class="panel-context">累计作业数据</p>
              <div class="flight-kpis"><div><i><Timer /></i><span>累计飞行时长</span><b><span class="kpi-value">{{ formatFlightTime(uavFlightSummary?.flightTime).split(' ')[0] }}</span><small>{{ formatFlightTime(uavFlightSummary?.flightTime).split(' ').slice(1).join(' ') }}</small></b></div><div><i><Position /></i><span>飞行里程</span><b><span class="kpi-value">{{ formatDistance(uavFlightSummary?.flightDistance).split(' ')[0] }}</span><small>{{ formatDistance(uavFlightSummary?.flightDistance).split(' ').slice(1).join(' ') }}</small></b></div></div>
              <div class="flight-metrics"><div><span>飞行架次</span><b>{{ formatCount(uavFlightSummary?.flightCount) }}</b></div><div><span>已完成任务</span><b>{{ formatCount(uavFlightSummary?.completedTaskCount) }}</b></div><div><span>未执行任务</span><b>{{ formatCount(uavFlightSummary?.notStartedTaskCount) }}</b></div></div>
            </section>

            <section class="overview-float-panel media-panel">
              <header>
                <h2>航拍素材成果</h2>
                <button v-if="user.hasPermission('data-management')" class="overview-header-link" type="button" aria-label="进入采集数据" @click="openDataManagement">采集数据 <span aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m6 4 4 4-4 4" /></svg></span></button>
              </header>
              <div class="media-summary">
                <DashboardRing :value="formatCount(uavMediaSummary?.totalCount)" label="素材总数" tone="blue" :rate="mediaPhotoRate" title="圆环展示照片在素材总数中的占比" />
                <dl class="metric-legend">
                  <div><dt><i class="legend-blue"></i>照片</dt><dd>{{ formatCount(uavMediaSummary?.photoCount) }}</dd></div>
                  <div><dt><i class="legend-mint"></i>视频</dt><dd>{{ formatCount(uavMediaSummary?.videoCount) }}</dd></div>
                  <div><dt><i class="legend-violet"></i>其他素材</dt><dd>{{ formatCount(uavMediaSummary?.otherCount) }}</dd></div>
                  <div><dt><i class="legend-muted"></i>素材容量</dt><dd>{{ formatFileSize(uavMediaSummary?.totalFileSize) }}</dd></div>
                </dl>
              </div>
            </section>
          </aside>

          <article class="cockpit-panel map-overview">
            <DashboardMap :key="activeScene?.id || organization.id" :layers="mapLayers" :routes="patrolRoutes" :focus-layer-id="activeScene?.id" :focus-geometry-pending="sceneGeometryPending" :screen-cleared="isMapClearScreen" floating-controls @toggle-clear-screen="isMapClearScreen = !isMapClearScreen" />
          </article>

          <aside class="overview-side overview-side--right" :inert="isMapClearScreen" :aria-hidden="isMapClearScreen">
            <section class="overview-float-panel scene-count-panel">
              <header>
                <h2>各场景任务数</h2>
                <button v-if="user.hasPermission('task-overview')" class="overview-header-link" type="button" aria-label="进入任务总览" @click="openTaskOverview">任务总览 <span aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m6 4 4 4-4 4" /></svg></span></button>
              </header>
              <div v-if="sceneTaskChartItems.length" class="scene-task-chart">
                <div class="scene-task-hover-card" :class="{ 'is-visible': hoveredSceneTask }" role="status">
                  <i v-if="hoveredSceneTask" :style="{ backgroundColor: hoveredSceneTask.color, boxShadow: `0 0 8px ${hoveredSceneTask.color}` }"></i>
                  <span>{{ hoveredSceneTask?.name }}</span>
                  <strong v-if="hoveredSceneTask">{{ hoveredSceneTask.taskCount }} 项</strong>
                </div>
                <div class="scene-task-main"><div class="scene-task-ring" :aria-label="`各场景共 ${sceneTaskTotal} 项任务`" role="img">
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <circle class="scene-task-ring__track" cx="50" cy="50" r="42" pathLength="100" />
                    <circle
                      v-for="item in sceneTaskChartItems"
                      :key="item.id"
                      class="scene-task-ring__segment"
                      cx="50"
                      cy="50"
                      r="42"
                      pathLength="100"
                      :stroke="item.color"
                      :style="{ '--scene-ring-color': item.color }"
                      :stroke-dasharray="item.dashArray"
                      :stroke-dashoffset="item.dashOffset"
                      :class="{ 'is-hovered': hoveredSceneTaskId === item.id }"
                      @mouseenter="hoveredSceneTaskId = item.id"
                      @mouseleave="hoveredSceneTaskId = ''"
                    />
                  </svg>
                  <div class="scene-task-ring__center"><b>{{ sceneTaskTotal }}</b><span>任务总数</span></div>
                </div>
                <dl class="metric-legend task-state-legend"><div v-for="item in taskStatusLegend" :key="item.name"><dt><i :style="{ backgroundColor: item.color }"></i>{{ item.name }}</dt><dd>{{ item.count }}</dd></div></dl></div>
                <div class="scene-task-legend" aria-label="场景任务数图例">
                  <button
                    v-if="user.hasPermission('task-list')"
                    v-for="item in sceneTaskChartItems"
                    :key="item.id"
                    type="button"
                    :title="`${item.name}：${item.taskCount} 项任务`"
                    @click="openSceneTaskList(item.id)"
                  >
                    <i :style="{ backgroundColor: item.color, boxShadow: `0 0 7px ${item.color}` }"></i>
                    <span>{{ item.name }}</span>
                    <strong>{{ item.taskCount }}</strong>
                  </button>
                  <div v-for="item in sceneTaskChartItems" v-else :key="item.id" class="scene-task-legend__static">
                    <i :style="{ backgroundColor: item.color, boxShadow: `0 0 7px ${item.color}` }"></i>
                    <span>{{ item.name }}</span>
                    <strong>{{ item.taskCount }}</strong>
                  </div>
                </div>
              </div>
              <div v-else class="float-empty">暂无场景任务数据</div>
            </section>

            <section class="overview-float-panel governance-panel">
              <header>
                <h2>治理闭环成效</h2>
                <button v-if="user.hasPermission('task-list')" class="overview-header-link" type="button" aria-label="进入任务列表" @click="openTaskList">任务列表 <span aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m6 4 4 4-4 4" /></svg></span></button>
              </header>
              <div class="governance-summary"><DashboardRing :value="governanceCompletionRate === undefined ? '—' : `${governanceCompletionRate}%`" label="完成率" tone="mint" :rate="governanceCompletionRate" /><dl><div><dt>任务总数</dt><dd>{{ unitTaskSummary?.total ?? '—' }}</dd></div><div><dt>已完成</dt><dd>{{ unitTaskSummary?.finished ?? '—' }}</dd></div><div><dt>执行中</dt><dd>{{ unitTaskSummary?.executing ?? '—' }}</dd></div><div><dt>待核查</dt><dd>{{ unitTaskSummary?.pendingVerify ?? '—' }}</dd></div></dl></div>
              <div class="governance-flow" role="img" aria-label="治理流程说明：发现、核查、整改、复核、归档"><span v-for="step in ['发现','核查','整改','复核','归档']" :key="step"><i></i><b>{{ step }}</b></span></div>
            </section>

            <section class="overview-float-panel recognition-panel">
              <header>
                <h2>智能识别成果</h2>
                <button v-if="user.hasPermission('smart-recognition')" class="overview-header-link" type="button" aria-label="进入智能识别" @click="openRecognition">智能识别 <span aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m6 4 4 4-4 4" /></svg></span></button>
              </header>
              <div class="recognition-summary"><DashboardRing :value="statistics?.abnormalSummary.total ?? '—'" label="识别图斑" :rate="recognitionHandledRate" :title="recognitionHandledRate === undefined ? '暂无图斑处置率' : `图斑处置率 ${recognitionHandledRate}%`" /><dl><div><dt>待核查图斑</dt><dd>{{ statistics?.overview.abnormalPendingCount ?? '—' }}</dd></div><div><dt>涉及面积</dt><dd>{{ formatNumber(statistics?.abnormalSummary.areaTotal) }}㎡</dd></div><div><dt>成果批次</dt><dd>{{ statistics?.overview.resultCount ?? '—' }}</dd></div></dl></div>
              <div class="recognition-types"><div v-for="item in recognitionItems" :key="item.key"><span>{{ item.name }}</span><i><u :style="{ width: `${item.count / Math.max(statistics?.abnormalSummary.total || 1, 1) * 100}%` }"></u></i><b>{{ item.count }}</b></div><div v-if="!recognitionItems.length" class="float-empty">暂无识别分类数据</div></div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped src="@/styles/dashboard.scss" lang="scss"></style>
<style scoped src="@/styles/dashboard-cockpit.scss" lang="scss"></style>
