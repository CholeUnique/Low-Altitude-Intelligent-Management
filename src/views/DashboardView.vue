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
import { getLiveStreams, getUavDeviceSummary, type UavDeviceSummary } from '@/api/patrol'
import type { LiveStream } from '@/adapters/dasFly'
import { findOrganizationScene, isTaskVisibleForOrganization } from '@/utils/scene-visibility'
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
let statisticsRequestVersion = 0
let geometryRequestVersion = 0
let abnormalCountRequestVersion = 0
let livePreviewRequestVersion = 0
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
const unitTaskSummary = computed(() => {
  // 首页的任务状态统计仅采信后端 /v1/biz/statistics/task-summary，
  // 任务列表只用于展示，不再由前端自行计数生成统计值。
  return statistics.value?.taskSummary
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
      taskCount: taskCounts.get(scene.id) ?? statistic.taskCount,
      abnormalCount: sceneAbnormalCounts.value[scene.id] ?? statistic.abnormalCount,
      description: `任务 ${taskCounts.get(scene.id) ?? statistic.taskCount} · ${abnormalLabel(scene.id, statistic.abnormalCount)}`,
      visual: organization.value.id === 'agriculture-rural' ? 'field' : 'forest',
    })),
    ...[...fallbackTasks.entries()].map(([sceneId, taskSummary]) => {
      const scene = organization.value.scenes.find((item) => item.id === sceneId)!
      return {
        id: scene.id,
        code: taskSummary.code,
        name: scene.name,
        taskCount: taskSummary.count,
        abnormalCount: sceneAbnormalCounts.value[sceneId] ?? 0,
        description: `任务 ${taskSummary.count} · ${abnormalLabel(scene.id, 0)}`,
        visual: organization.value.id === 'agriculture-rural' ? 'field' : 'forest',
      }
    }),
  ].slice(0, 4).map((item, index) => ({ ...item, icon: ['林', '警', '巡', '复'][index]! }))
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
const maxSceneTaskCount = computed(() => Math.max(...sceneBusinessStats.value.map((item) => item.taskCount), 1))
function openSceneTaskList(sceneId: string) {
  router.push({ name: 'tasks', query: { sceneId } })
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

async function loadLivePreview() {
  const requestVersion = ++livePreviewRequestVersion
  const initialLoad = !livePreviewLoaded.value
  if (initialLoad) livePreviewLoading.value = true
  try {
    const [streamsResult, deviceSummaryResult] = await Promise.allSettled([
      getLiveStreams(),
      getUavDeviceSummary(),
    ])
    if (requestVersion !== livePreviewRequestVersion) return
    if (deviceSummaryResult.status === 'fulfilled') {
      uavDeviceSummary.value = deviceSummaryResult.value
      onlineUavCount.value = deviceSummaryResult.value.onlineCount
    } else if (initialLoad) {
      uavDeviceSummary.value = undefined
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
              <header><h2>无人机机组资源</h2><span>{{ onlineUavCount ?? '—' }} 架在线</span></header>
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

            <section class="overview-float-panel governance-panel">
              <header><h2>治理闭环成效</h2><span>任务办理进展</span></header>
              <div class="governance-summary"><div class="metric-ring" :class="{ 'is-empty': governanceCompletionRate === undefined }" :style="ringStyle(governanceCompletionRate)" :title="governanceCompletionRate === undefined ? '暂无任务总数，无法计算完成率' : `任务完成率 ${governanceCompletionRate}%`"><b>{{ governanceCompletionRate === undefined ? '—' : `${governanceCompletionRate}%` }}</b><span>完成率</span></div><dl><div><dt>任务总数</dt><dd>{{ unitTaskSummary?.total ?? '—' }}</dd></div><div><dt>已完成</dt><dd>{{ unitTaskSummary?.finished ?? '—' }}</dd></div><div><dt>执行中</dt><dd>{{ unitTaskSummary?.executing ?? '—' }}</dd></div><div><dt>待核查</dt><dd>{{ unitTaskSummary?.pendingVerify ?? '—' }}</dd></div></dl></div>
              <p class="governance-flow-copy">发现 → 核查 → 整改 → 复核 → 归档</p>
            </section>
          </aside>

          <article class="cockpit-panel map-overview">
            <div class="cockpit-panel__title"><h2>{{ scopeTitle }}综合监管一张图</h2></div>
            <DashboardMap :key="activeScene?.id || organization.id" :layers="mapLayers" :routes="patrolRoutes" :focus-layer-id="activeScene?.id" />
          </article>

          <aside class="overview-side overview-side--right">
            <section class="overview-float-panel scene-count-panel">
              <header><h2>各场景任务数</h2><span>{{ sceneBusinessStats.length }} 个场景</span></header>
              <button v-for="item in sceneBusinessStats" :key="item.id" type="button" @click="openSceneTaskList(item.id)"><i>{{ item.icon }}</i><span><b>{{ item.name }}</b><em><u :style="{ width: `${item.taskCount / maxSceneTaskCount * 100}%` }"></u></em></span><strong>{{ item.taskCount }}</strong></button>
              <div v-if="!sceneBusinessStats.length" class="float-empty">暂无场景任务数据</div>
            </section>

            <section class="overview-float-panel recognition-panel">
              <header><h2>智能识别成果</h2><span>疑似图斑</span></header>
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
.scene-count-panel > button { width: 100%; display: grid; grid-template-columns: 30px minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 10px 0; color: #cbeef6; border: 0; border-bottom: 1px solid #15506d; background: transparent; text-align: left; cursor: pointer; }
.scene-count-panel > button:hover { background: #0a46656e; }
.scene-count-panel > button > i { width: 28px; height: 28px; display: grid; place-items: center; color: #5fe4ef; border: 1px solid #168ab0; border-radius: 3px; background: #0b4f6b; font-style: normal; }
.scene-count-panel button span,.scene-count-panel button b,.scene-count-panel button em { display: block; min-width: 0; }
.scene-count-panel button b { overflow: hidden; color: #e8fbff; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.scene-count-panel button em { height: 5px; margin-top: 7px; overflow: hidden; border-radius: 3px; background: #15425c; }
.scene-count-panel button u { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #26a9df, #58e8e1); }
.scene-count-panel button strong { color: #6beaf1; font-size: 18px; }
.recognition-types { margin-top: 15px; }
.recognition-types > div:not(.float-empty) { display: grid; grid-template-columns: minmax(0,1fr) 1.3fr 28px; align-items: center; gap: 8px; margin: 9px 0; color: #91bdca; font-size: 10px; }
.recognition-types i { height: 5px; overflow: hidden; border-radius: 3px; background: #15425c; }
.recognition-types u { display: block; height: 100%; background: linear-gradient(90deg, #7d7bff, #42dae5); }
.recognition-types b { color: #e8fbff; text-align: right; }
.float-empty { flex: 1; display: grid; place-content: center; color: #6f9aab; text-align: center; font-size: 12px; }
@media (max-width: 1280px) {
  .overview-layout { grid-template-columns: 220px minmax(0,1fr) 220px; }
  .overview-float-panel { padding: 10px; }
  .overview-float-panel > header { margin: -10px -10px 10px; }
  .metric-ring { width: 74px; height: 74px; flex-basis: 74px; }
  .metric-ring b { font-size: 21px; }
}
</style>
