<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DashboardMap from '@/components/DashboardMap.vue'
import PrimaryHeader from '@/components/PrimaryHeader.vue'
import { useUserStore } from '@/stores/user'
import { getGovernanceTaskGeometry, getGovernanceTaskPage, getTaskAbnormalPage, type GovernanceTask, type TaskGeometryFeatureCollection } from '@/api/governance-task'
import { getScene } from '@/mocks/portal'
import { getBusinessDashboardStatistics, type BusinessDashboardStatistics } from '@/api/business-statistics'
import { getDepartmentOptions, getMyDepartments, switchDepartment } from '@/api/auth'
import {
  getLiveStreams,
  getFlightTaskMedia,
  getUavDeviceSummary,
  getUavFlightTaskOptions,
  getUavFlightSummary,
  getUavMediaSummary,
  type UavDeviceSummary,
  type UavFlightSummary,
  type UavMediaSummary,
} from '@/api/patrol'
import type { LiveStream } from '@/adapters/dasFly'
import type { LiveMediaItem } from '@/mocks/patrol-live'
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
/** 按当前单位场景汇总的真实异常图斑数，取自每个任务的异常图斑分页接口 total。 */
const sceneAbnormalCounts = ref<Record<string, number>>({})
const sceneAbnormalCountsLoading = ref(false)
const taskRanges = ref<Record<string, TaskGeometryFeatureCollection>>({})
const livePreviews = ref<LiveStream[]>([])
const livePreviewLoading = ref(true)
const livePreviewLoaded = ref(false)
const onlineUavCount = ref<number>()
const uavDeviceSummary = ref<UavDeviceSummary>()
const uavFlightSummary = ref<UavFlightSummary>()
const uavMediaSummary = ref<UavMediaSummary>()
const classifiedMediaCounts = ref<{ totalCount: number; photoCount: number; videoCount: number }>()
let statisticsRequestVersion = 0
let geometryRequestVersion = 0
let abnormalCountRequestVersion = 0
let livePreviewRequestVersion = 0
let mediaCountRequestVersion = 0
let mediaCountsLoadedKey = ''
let mediaCountsLoadingKey = ''
const sceneId = computed(() => typeof route.params.sceneId === 'string' ? route.params.sceneId : '')
const organization = computed(() => user.organization)
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
    abnormalCount: number
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
    const abnormalCount = sceneAbnormalCounts.value[id] ?? current?.abnormalCount ?? 0
    groupedScenes.set(id, {
      id,
      code: current?.code || task.sceneCode,
      name,
      taskCount,
      abnormalCount,
      description: `任务 ${taskCount} · 异常 ${sceneAbnormalCountsLoading.value && sceneAbnormalCounts.value[id] === undefined ? '—' : abnormalCount}`,
      visual: organization.value.id === 'agriculture-rural' ? 'field' : 'forest',
    })
  })

  return [...groupedScenes.values()]
})
function percentage(numerator: number | undefined, denominator: number | undefined) {
  if (typeof numerator !== 'number' || typeof denominator !== 'number' || denominator <= 0) return undefined
  return Math.round(Math.min(Math.max(numerator / denominator * 100, 0), 100))
}

function ringStyle(rate: number | undefined): Record<string, string> {
  return { '--ring-progress': `${rate ?? 0}%` }
}

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
const recognitionItems = computed(() => statistics.value?.abnormalSummary.typeCounts.slice(0, 4) || [])
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
  router.push({ name: 'tasks', query: { sceneId } })
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
    currentUnitTasks.value = []
    currentUnitTasksLoaded.value = false
    taskRanges.value = {}
    sceneAbnormalCounts.value = {}
    sceneAbnormalCountsLoading.value = false
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
    } else if (!currentUnitTasksLoaded.value) {
      // 首次加载失败时保持明确的空状态；后台刷新失败则保留最后一次成功数据。
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
      statisticsError.value = ''
    } else {
      // 后台轮询失败不能把当前统计卡片清空，只更新错误提示供用户主动重试。
      if (!statistics.value) statistics.value = undefined
      statisticsError.value = statisticsPage?.status === 'rejected' && statisticsPage.reason instanceof Error
        ? statisticsPage.reason.message
        : '统计接口请求失败'
    }
  } catch (error) {
    // 防御性兜底：无论任何解析/渲染异常，均不可让首页永久处于加载状态。
    statisticsError.value = error instanceof Error ? error.message : '首页数据加载失败'
  } finally {
    if (requestVersion === statisticsRequestVersion && foregroundLoad) statisticsLoading.value = false
  }
}

function mediaExtension(fileName: string) {
  const cleanName = fileName.split(/[?#]/)[0]?.trim() || ''
  const match = cleanName.match(/\.([^.]+)$/)
  return match?.[1]?.toUpperCase() || ''
}

async function loadAllTaskMedia(taskId: string) {
  const records: LiveMediaItem[] = []
  let pageNum = 1
  let total = Number.POSITIVE_INFINITY
  while (records.length < total) {
    const result = await getFlightTaskMedia({ taskId, pageNum, pageSize: 200 })
    records.push(...result.list)
    total = result.total
    if (!result.list.length || records.length >= total) break
    pageNum += 1
  }
  return records
}

async function loadClassifiedMediaCounts() {
  const contextKey = `${user.organizationId}:${user.activeDeptId ?? ''}:${user.token}`
  if (mediaCountsLoadedKey === contextKey || mediaCountsLoadingKey === contextKey) return
  mediaCountsLoadingKey = contextKey
  classifiedMediaCounts.value = undefined
  const requestVersion = ++mediaCountRequestVersion
  try {
    const taskResult = await getUavFlightTaskOptions({ pageNum: 1, pageSize: 200 })
    let totalCount = 0
    let photoCount = 0
    let videoCount = 0
    const imageTypes = new Set(['JPG', 'JPEG', 'PNG', 'TIF', 'TIFF', 'DNG', 'WEBP', 'BMP'])
    const videoTypes = new Set(['MP4', 'MOV', 'M4V', 'AVI', 'MKV', 'WEBM'])
    const excludedTypes = new Set(['OBS', 'NAV', 'MRK', 'RTK'])
    for (let index = 0; index < taskResult.list.length; index += 5) {
      const groups = await Promise.all(taskResult.list.slice(index, index + 5).map((task) => loadAllTaskMedia(task.id)))
      groups.flat().forEach((media) => {
        const extension = mediaExtension(media.name)
        const declaredType = String(media.mediaType || '').toUpperCase()
        if (excludedTypes.has(extension) || excludedTypes.has(declaredType)) return
        totalCount += 1
        if (imageTypes.has(extension)) photoCount += 1
        else if (videoTypes.has(extension)) videoCount += 1
      })
    }
    if (requestVersion !== mediaCountRequestVersion) return
    classifiedMediaCounts.value = { totalCount, photoCount, videoCount }
    mediaCountsLoadedKey = contextKey
  } catch {
    if (requestVersion === mediaCountRequestVersion) classifiedMediaCounts.value = undefined
  } finally {
    if (mediaCountsLoadingKey === contextKey) mediaCountsLoadingKey = ''
  }
}

async function loadLivePreview() {
  const requestVersion = ++livePreviewRequestVersion
  const initialLoad = !livePreviewLoaded.value
  if (initialLoad) livePreviewLoading.value = true
  try {
    const [streamsResult, deviceSummaryResult, flightSummaryResult, mediaSummaryResult] = await Promise.allSettled([
      getLiveStreams(),
      getUavDeviceSummary(),
      getUavFlightSummary(),
      getUavMediaSummary(),
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
    if (mediaSummaryResult.status === 'fulfilled') {
      uavMediaSummary.value = mediaSummaryResult.value
    } else if (initialLoad) {
      uavMediaSummary.value = undefined
    }
    void loadClassifiedMediaCounts()

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
})
// 登录完成、部门切换或单位切换时，始终按最终的认证上下文重新拉取。flush: 'post'
// 会把 setRealSession 内的多项同步状态更新合并后再执行，避免中间态请求。
watch([() => user.token, () => user.authMode, () => user.activeDeptId, () => user.organizationId], () => {
  void loadBusinessStatistics(true)
  void loadLivePreview()
}, { immediate: true, flush: 'post' })
</script>

<template>
  <div class="cockpit">
    <PrimaryHeader />

    <main class="cockpit-body cockpit-body--map-only">
      <section class="cockpit-primary">
        <div class="overview-layout">
          <aside class="overview-side overview-side--left">
            <section class="overview-float-panel resource-panel">
              <header>
                <h2>无人机机组资源</h2>
                <button v-if="user.hasPermission('live-monitoring')" class="overview-header-link" type="button" aria-label="进入实时作业" @click="openLiveOperations">实时作业 <span aria-hidden="true">›</span></button>
              </header>
              <div class="resource-summary">
                <div
                  class="metric-ring"
                  :class="{ 'is-empty': fleetAvailabilityRate === undefined }"
                  :style="ringStyle(fleetAvailabilityRate)"
                  :title="fleetAvailabilityRate === undefined ? '暂无机组总数，无法计算可用率' : `机组可用率 ${fleetAvailabilityRate}%`"
                ><b>{{ onlineUavCount ?? '—' }}</b><span>在线机组</span></div>
                <div><b>机组可用态势</b><p>{{ livePreviewLoading ? '正在获取设备状态…' : '设备状态实时刷新' }}</p><small>已接入 {{ livePreviews.length }} 路直播画面</small></div>
              </div>
              <div class="resource-states"><span><i class="online"></i>直播中 <b>{{ livePreviews.filter((item) => item.status === 'ONLINE').length }}</b></span><span><i class="starting"></i>连接中 <b>{{ livePreviews.filter((item) => item.status === 'STARTING').length }}</b></span></div>
            </section>

            <section class="overview-float-panel operation-panel">
              <header>
                <h2>飞行作业统计</h2>
                <button v-if="user.hasPermission('fleet-overview')" class="overview-header-link" type="button" aria-label="进入机队总览" @click="openFleetOverview">机队总览 <span aria-hidden="true">›</span></button>
              </header>
              <div class="summary-highlight">
                <i>航</i>
                <div><span>累计飞行时长</span><b>{{ formatFlightTime(uavFlightSummary?.flightTime) }}</b></div>
              </div>
              <div class="summary-metrics">
                <div><span>飞行架次</span><b>{{ formatCount(uavFlightSummary?.flightCount) }}</b></div>
                <div><span>飞行里程</span><b>{{ formatDistance(uavFlightSummary?.flightDistance) }}</b></div>
                <div><span>已完成任务</span><b>{{ formatCount(uavFlightSummary?.completedTaskCount) }}</b></div>
                <div><span>未执行任务</span><b>{{ formatCount(uavFlightSummary?.notStartedTaskCount) }}</b></div>
              </div>
            </section>

            <section class="overview-float-panel media-panel">
              <header>
                <h2>航拍素材成果</h2>
                <button v-if="user.hasPermission('data-management')" class="overview-header-link" type="button" aria-label="进入采集数据" @click="openDataManagement">采集数据 <span aria-hidden="true">›</span></button>
              </header>
              <div class="summary-highlight">
                <i>影</i>
                <div><span>素材总数</span><b>{{ formatCount(classifiedMediaCounts?.totalCount) }}<small v-if="typeof classifiedMediaCounts?.totalCount === 'number'"> 项</small></b></div>
              </div>
              <div class="summary-metrics">
                <div><span>照片</span><b>{{ formatCount(classifiedMediaCounts?.photoCount) }}</b></div>
                <div><span>视频</span><b>{{ formatCount(classifiedMediaCounts?.videoCount) }}</b></div>
                <div><span>已下载</span><b>{{ formatCount(uavMediaSummary?.downloadedCount) }}</b></div>
                <div><span>素材容量</span><b>{{ formatFileSize(uavMediaSummary?.totalFileSize) }}</b></div>
              </div>
              <p class="summary-foot"><span>下载失败 {{ formatCount(uavMediaSummary?.downloadFailedCount) }}</span><span>已清理 {{ formatCount(uavMediaSummary?.cleanedCount) }}</span></p>
            </section>
          </aside>

          <article class="cockpit-panel map-overview">
            <div class="cockpit-panel__title"><h2>{{ scopeTitle }}综合监管一张图</h2></div>
            <DashboardMap :key="activeScene?.id || organization.id" :layers="mapLayers" :routes="patrolRoutes" :focus-layer-id="activeScene?.id" />
          </article>

          <aside class="overview-side overview-side--right">
            <section class="overview-float-panel scene-count-panel">
              <header>
                <h2>各场景任务数</h2>
                <button v-if="user.hasPermission('task-overview')" class="overview-header-link" type="button" aria-label="进入任务总览" @click="openTaskOverview">任务总览 <span aria-hidden="true">›</span></button>
              </header>
              <div v-if="sceneTaskChartItems.length" class="scene-task-chart">
                <div class="scene-task-hover-card" :class="{ 'is-visible': hoveredSceneTask }" role="status">
                  <i v-if="hoveredSceneTask" :style="{ backgroundColor: hoveredSceneTask.color, boxShadow: `0 0 8px ${hoveredSceneTask.color}` }"></i>
                  <span>{{ hoveredSceneTask?.name }}</span>
                  <strong v-if="hoveredSceneTask">{{ hoveredSceneTask.taskCount }} 项</strong>
                </div>
                <div class="scene-task-ring" :aria-label="`各场景共 ${sceneTaskTotal} 项任务`" role="img">
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
                <div class="scene-task-legend" aria-label="场景任务数图例">
                  <button
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
                </div>
              </div>
              <div v-else class="float-empty">暂无场景任务数据</div>
            </section>

            <section class="overview-float-panel governance-panel">
              <header>
                <h2>治理闭环成效</h2>
                <button v-if="user.hasPermission('task-list')" class="overview-header-link" type="button" aria-label="进入任务列表" @click="openTaskList">任务列表 <span aria-hidden="true">›</span></button>
              </header>
              <div class="governance-summary"><div class="metric-ring" :class="{ 'is-empty': governanceCompletionRate === undefined }" :style="ringStyle(governanceCompletionRate)" :title="governanceCompletionRate === undefined ? '暂无任务总数，无法计算完成率' : `任务完成率 ${governanceCompletionRate}%`"><b>{{ governanceCompletionRate === undefined ? '—' : `${governanceCompletionRate}%` }}</b><span>完成率</span></div><dl><div><dt>任务总数</dt><dd>{{ unitTaskSummary?.total ?? '—' }}</dd></div><div><dt>已完成</dt><dd>{{ unitTaskSummary?.finished ?? '—' }}</dd></div><div><dt>执行中</dt><dd>{{ unitTaskSummary?.executing ?? '—' }}</dd></div><div><dt>待核查</dt><dd>{{ unitTaskSummary?.pendingVerify ?? '—' }}</dd></div></dl></div>
              <p class="governance-flow-copy">发现 → 核查 → 整改 → 复核 → 归档</p>
            </section>

            <section class="overview-float-panel recognition-panel">
              <header>
                <h2>智能识别成果</h2>
                <button v-if="user.hasPermission('smart-recognition')" class="overview-header-link" type="button" aria-label="进入智能识别" @click="openRecognition">智能识别 <span aria-hidden="true">›</span></button>
              </header>
              <div class="recognition-summary"><div class="metric-ring" :class="{ 'is-empty': recognitionHandledRate === undefined }" :style="ringStyle(recognitionHandledRate)" :title="recognitionHandledRate === undefined ? '暂无图斑总数，无法计算处置率' : `图斑处置率 ${recognitionHandledRate}%`"><b>{{ statistics?.abnormalSummary.total ?? '—' }}</b><span>识别图斑</span></div><dl><div><dt>待核查图斑</dt><dd>{{ statistics?.overview.abnormalPendingCount ?? '—' }}</dd></div><div><dt>涉及面积</dt><dd>{{ formatNumber(statistics?.abnormalSummary.areaTotal) }}㎡</dd></div><div><dt>成果批次</dt><dd>{{ statistics?.overview.resultCount ?? '—' }}</dd></div></dl></div>
              <div class="recognition-types"><div v-for="item in recognitionItems" :key="item.key"><span>{{ item.name }}</span><i><u :style="{ width: `${item.count / Math.max(statistics?.abnormalSummary.total || 1, 1) * 100}%` }"></u></i><b>{{ item.count }}</b></div><div v-if="!recognitionItems.length" class="float-empty">暂无识别分类数据</div></div>
            </section>
          </aside>
        </div>
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
.cockpit-body--map-only { display: block; padding: 7px; }
.cockpit-body--map-only .cockpit-primary,
.map-overview { height: 100%; min-height: 0; }
.overview-layout { height: 100%; min-height: 0; display: grid; grid-template-columns: clamp(238px, 15.2vw, 292px) minmax(0, 1fr) clamp(238px, 15.2vw, 292px); gap: 7px; }
.map-overview { position: relative; grid-template-rows: minmax(0, 1fr); }
.map-overview > .cockpit-panel__title { width: min(500px, 52%); background: linear-gradient(90deg, #08273cf2 0%, #08273cdb 72%, transparent 100%); }
.map-overview > .cockpit-panel__title h2 { overflow: hidden; color: #eac100; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 6px #001722; }
.overview-side { min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); gap: 7px; }
.overview-float-panel { min-height: 0; overflow: hidden; padding: 14px; color: #c9f4ff; border: 1px solid #1789b8; border-radius: 5px; background: linear-gradient(145deg, #062b48, #031a32); box-shadow: 0 0 16px #00b9ee1f, inset 0 0 20px #0d6f9d1c; }
.overview-float-panel > header { display: flex; align-items: center; justify-content: space-between; min-height: 36px; margin: -14px -14px 13px; padding: 0 13px; border-bottom: 1px solid #1676a0; background: linear-gradient(90deg, #07537fc7, #04243cc7); }
.overview-float-panel h2 { margin: 0; color: #e9fbff; font-size: clamp(14px, .9vw, 18px); }
.overview-float-panel header span { color: #75bfd2; font-size: 11px; }
.overview-header-link { display: inline-flex; align-items: center; gap: 5px; padding: 3px 1px; border: 0; color: #57dcea; background: transparent; text-shadow: 0 0 8px #32d9ec73; font: inherit; font-size: 12px; font-weight: 600; letter-spacing: .4px; cursor: pointer; }
.overview-header-link span { color: inherit !important; font-size: 16px !important; line-height: 1; transition: transform .18s ease; }
.overview-header-link:hover { color: #e8fdff; text-shadow: 0 0 10px #5cecff; }
.overview-header-link:hover span { transform: translateX(2px); }
.overview-header-link:focus-visible { outline: 1px solid #54e8f4; outline-offset: 3px; border-radius: 2px; }
.resource-summary,.governance-summary,.recognition-summary { display: flex; align-items: center; gap: 13px; }
.metric-ring { position: relative; isolation: isolate; width: 94px; height: 94px; flex: 0 0 94px; display: grid; place-content: center; border-radius: 50%; text-align: center; background: conic-gradient(from -90deg, #42e6da var(--ring-progress), #175478 0); box-shadow: 0 0 10px #20d8e620; }
.metric-ring::before { content: ''; position: absolute; z-index: -1; inset: 7px; border-radius: 50%; background: #05233c; box-shadow: inset 0 0 15px #20d8e628; }
.metric-ring.is-empty { background: #175478; }
.metric-ring b,.metric-ring span { display: block; }
.metric-ring b { color: #56f0df; font-size: 26px; }
.metric-ring span { margin-top: 2px; color: #8ec5d5; font-size: 10px; }
.resource-summary > div:last-child { min-width: 0; }
.resource-summary > div:last-child b { display: block; color: #e8fbff; font-size: 14px; }
.resource-summary p,.resource-summary small { margin: 6px 0 0; color: #8bb7c6; font-size: 11px; line-height: 1.45; }
.resource-summary small { display: block; color: #5fa0b6; }
.resource-states { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; margin-top: 16px; }
.resource-states span { display: flex; align-items: center; gap: 6px; padding: 10px; color: #8fc5d5; border: 1px solid #145679; background: #072943a8; font-size: 11px; }
.resource-states span b { margin-left: auto; color: #e8fbff; font-size: 16px; }
.resource-states i { width: 7px; height: 7px; border-radius: 50%; background: #7f98a2; }
.resource-states i.online { background: #38e7ae; box-shadow: 0 0 7px #38e7ae; }
.resource-states i.starting { background: #ffd05b; box-shadow: 0 0 7px #ffd05b; }
.governance-summary dl,.recognition-summary dl { min-width: 0; flex: 1; margin: 0; }
.governance-summary dl > div,.recognition-summary dl > div { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid #15506d; font-size: 11px; }
.governance-summary dt,.recognition-summary dt { color: #78adbd; }
.governance-summary dd,.recognition-summary dd { margin: 0; color: #e6faff; font-weight: 700; }
.governance-flow-copy { margin: 17px 0 0; padding: 10px 6px; color: #63ddec; border: 1px solid #16789a; background: #0634519c; text-align: center; font-size: 11px; letter-spacing: 1px; }
.scene-count-panel { display: flex; flex-direction: column; }
.scene-task-chart { position: relative; min-height: 0; display: flex; flex: 1; flex-direction: column; align-items: center; }
.scene-task-hover-card { position: absolute; z-index: 3; top: 0; left: 50%; width: max-content; max-width: calc(100% - 8px); min-height: 30px; display: grid; grid-template-columns: 8px minmax(0,1fr) auto; align-items: center; gap: 7px; padding: 6px 10px; color: #bfeaf2; border: 1px solid #247897; border-radius: 4px; background: #062c46ed; box-shadow: 0 7px 18px #00131da6, inset 0 0 12px #2bdce317; opacity: 0; pointer-events: none; transform: translate(-50%, -5px); transition: opacity .16s ease, transform .16s ease; }
.scene-task-hover-card.is-visible { opacity: 1; transform: translate(-50%, 0); }
.scene-task-hover-card i { width: 7px; height: 7px; border-radius: 50%; }
.scene-task-hover-card span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.scene-task-hover-card strong { color: #effeff; white-space: nowrap; font-size: 12px; }
.scene-task-ring { position: relative; width: 126px; height: 126px; flex: 0 0 126px; margin: 38px 0 12px; filter: drop-shadow(0 0 7px #2adbe02b); }
.scene-task-ring svg { width: 100%; height: 100%; overflow: visible; transform: rotate(-90deg); }
.scene-task-ring circle { fill: none; }
.scene-task-ring__track { stroke: #164761; stroke-width: 9; }
.scene-task-ring__segment { stroke-width: 9; cursor: pointer; pointer-events: stroke; transform-box: fill-box; transform-origin: center; transition: stroke-width .18s ease, filter .18s ease, transform .18s ease; }
.scene-task-ring__segment.is-hovered { stroke-width: 12; filter: drop-shadow(0 0 5px var(--scene-ring-color)); transform: scale(1.035); }
.scene-task-ring__center { position: absolute; inset: 18px; display: grid; place-content: center; border-radius: 50%; background: radial-gradient(circle, #0a3552 0, #05243c 68%, #061f35 100%); box-shadow: inset 0 0 16px #30dfe82b; text-align: center; pointer-events: none; }
.scene-task-ring b,.scene-task-ring span { display: block; }
.scene-task-ring b { color: #69f0e5; text-shadow: 0 0 10px #39ead38f; font-size: 28px; line-height: 1; }
.scene-task-ring span { margin-top: 6px; color: #8ec6d5; font-size: 11px; }
.scene-task-legend { width: 100%; min-height: 0; overflow: auto; border-top: 1px solid #15506d; }
.scene-task-legend button { width: 100%; display: grid; grid-template-columns: 9px minmax(0,1fr) auto; align-items: center; gap: 9px; padding: 9px 5px; color: #cbeef6; border: 0; border-bottom: 1px solid #13455f; background: transparent; text-align: left; cursor: pointer; transition: background .18s ease; }
.scene-task-legend button:hover { background: #0a466581; }
.scene-task-legend button:focus-visible { outline: 1px solid #54e8f4; outline-offset: -2px; }
.scene-task-legend i { width: 8px; height: 8px; border-radius: 50%; }
.scene-task-legend span { overflow: hidden; color: #bde4ed; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.scene-task-legend strong { min-width: 24px; color: #effeff; text-align: right; font-size: 14px; }
.recognition-types { margin-top: 15px; }
.recognition-types > div:not(.float-empty) { display: grid; grid-template-columns: minmax(0,1fr) 1.3fr 28px; align-items: center; gap: 8px; margin: 9px 0; color: #91bdca; font-size: 10px; }
.recognition-types i { height: 5px; overflow: hidden; border-radius: 3px; background: #15425c; }
.recognition-types u { display: block; height: 100%; background: linear-gradient(90deg, #7d7bff, #42dae5); }
.recognition-types b { color: #e8fbff; text-align: right; }
.summary-highlight { display: grid; grid-template-columns: 48px minmax(0, 1fr); align-items: center; gap: 11px; padding: 10px; border: 1px solid #155b78; background: linear-gradient(120deg, #0a3c59c7, #062842a8); }
.summary-highlight > i { width: 44px; height: 44px; display: grid; place-items: center; color: #5ff2e5; border: 1px solid #1da4bb; border-radius: 50%; background: #0a4963; box-shadow: inset 0 0 13px #32e0e428; font-size: 16px; font-style: normal; font-weight: 700; }
.media-panel .summary-highlight > i { color: #b6aaff; border-color: #756fe0; background: #2b356b; box-shadow: inset 0 0 13px #8d82ff35; }
.summary-highlight span,.summary-highlight b { display: block; min-width: 0; }
.summary-highlight span { color: #83b8c7; font-size: 11px; }
.summary-highlight b { margin-top: 3px; overflow: hidden; color: #58eee2; text-overflow: ellipsis; white-space: nowrap; font-size: 19px; }
.media-panel .summary-highlight b { color: #aeb4ff; }
.summary-highlight small { font-size: 11px; font-weight: 500; }
.summary-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 9px; }
.summary-metrics > div { min-width: 0; padding: 7px 8px; border: 1px solid #124b67; background: #062943a8; }
.summary-metrics span,.summary-metrics b { display: block; min-width: 0; }
.summary-metrics span { color: #78adbd; font-size: 10px; }
.summary-metrics b { margin-top: 3px; overflow: hidden; color: #e6faff; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.summary-warning { margin: 7px 0 0; padding: 5px 7px; color: #ffd582; border: 1px solid #7d622d; background: #4c391f73; font-size: 10px; text-align: center; }
.summary-foot { display: flex; justify-content: space-between; gap: 8px; margin: 8px 0 0; color: #769faf; font-size: 10px; }
.float-empty { flex: 1; display: grid; place-content: center; color: #6f9aab; text-align: center; font-size: 12px; }
@media (max-width: 1280px) {
  .overview-layout { grid-template-columns: 220px minmax(0,1fr) 220px; }
  .overview-float-panel { padding: 10px; }
  .overview-float-panel > header { margin: -10px -10px 10px; }
  .metric-ring { width: 74px; height: 74px; flex-basis: 74px; }
  .metric-ring b { font-size: 21px; }
  .scene-task-ring { width: 104px; height: 104px; flex-basis: 104px; margin: 35px 0 8px; }
  .scene-task-ring b { font-size: 24px; }
  .scene-task-legend button { padding: 7px 3px; }
  .summary-highlight { grid-template-columns: 40px minmax(0, 1fr); padding: 7px; }
  .summary-highlight > i { width: 36px; height: 36px; }
  .summary-highlight b { font-size: 16px; }
}
</style>
