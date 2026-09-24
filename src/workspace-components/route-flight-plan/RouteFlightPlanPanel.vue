<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Component } from 'vue'
import { Connection, EditPen, Promotion, RefreshRight, VideoCamera } from '@element-plus/icons-vue'
import type { PortalTask } from '@/types'
import { ApiBusinessError, isMockMode } from '@/api/client'
import {
  getFlightPlanDetail,
  getFlightPlans,
  getRouteDetail,
  getRoutes,
  getUavComponentUrl,
  getUavDeviceOptions,
  getUavFlightTaskOptions,
  getUavProjectOptions,
} from '@/api/patrol'
import type { PatrolProjectOption, UavDeviceOption, UavFlightTaskOption, UavOpenComponentType } from '@/api/patrol'
import {
  buildRouteMetrics,
  createFlightPlans,
  createHistoryRoutes,
  createRoutesForTask,
  planningAlerts,
  type FlightPlanItem,
  type FlightRoute,
} from '@/mocks/route-planning'
import NewRouteDialog from './NewRouteDialog.vue'
import RouteWorkspaceMap from './RouteWorkspaceMap.vue'

const props = withDefaults(defineProps<{
  task?: PortalTask
  taskLoading?: boolean
  taskError?: string
  /** 是否显示编辑、座舱、回放等航线组件工具栏。 */
  showComponentNav?: boolean
}>(), {
  showComponentNav: true,
})

const routes = ref<FlightRoute[]>(createRoutesForTask(props.task))
const historyRoutes = ref<FlightRoute[]>(createHistoryRoutes(props.task))
const plans = ref<FlightPlanItem[]>(createFlightPlans(routes.value))
const activeRouteId = ref(routes.value[0]?.id || '')
const activePlanId = ref('')
const routeLoading = ref(false)
const routeError = ref('')
const deviceOptions = ref<UavDeviceOption[]>([])
const deviceLoading = ref(false)
const projects = ref<PatrolProjectOption[]>([])
const selectedProjectId = ref('')
const planLoading = ref(false)
const routeKeyword = ref('')
const statusFilter = ref('')
const newRouteVisible = ref(false)
const selectedDate = ref('2026-09-09')
/**
 * 真实模式通过我方后端动态换取低空大师组件 URL，避免将已过期的分享码写入前端包。
 */
const useDasFlyEmbed = computed(() => !isMockMode() && import.meta.env.VITE_DAS_FLY_EMBED !== 'false')
const openComponentItems: Array<{ type: UavOpenComponentType; label: string; icon: Component }> = [
  { type: 'WAYLINE_CREATE', label: '创建航线', icon: Connection },
  { type: 'WAYLINE_EDIT', label: '编辑航线', icon: EditPen },
  { type: 'FLIGHT_CREATE', label: '创建飞行计划', icon: Promotion },
  { type: 'COCKPIT', label: '进入虚拟座舱', icon: VideoCamera },
  { type: 'TRAJECTORY_PLAYBACK', label: '轨迹回放', icon: RefreshRight },
]
/** 创建飞行计划由飞行作业主导航承载，避免在两级菜单重复出现。 */
const openComponentNavItems = computed(() => openComponentItems.filter((item) => item.type !== 'FLIGHT_CREATE'))
const activeOpenComponentType = ref<UavOpenComponentType>('WAYLINE_CREATE')
const activeOpenComponent = computed(() =>
  openComponentItems.find((item) => item.type === activeOpenComponentType.value) || openComponentItems[0],
)
const dasFlyComponentUrl = ref('')
/**
 * fly-api.get3d.cn 只负责签发开放组件 URL，浏览器会拒绝将该 API 域嵌入 iframe。
 * 将后端签发的 path/query/hash 原样保留，仅替换为供应商可展示的 fly.get3d.cn 域名。
 */
const dasFlyComponentEmbedUrl = computed(() => {
  if (!dasFlyComponentUrl.value) return ''
  try {
    const source = new URL(dasFlyComponentUrl.value)
    if (source.hostname !== 'fly-api.get3d.cn') return source.toString()
    const componentPage = new URL('https://fly.get3d.cn')
    componentPage.pathname = source.pathname
    componentPage.search = source.search
    componentPage.hash = source.hash
    return componentPage.toString()
  } catch {
    return dasFlyComponentUrl.value
  }
})
const dasFlyEmbedLoading = ref(false)
const dasFlyEmbedError = ref('')
let dasFlyEmbedRequestVersion = 0
type OpenComponentSelection = {
  id: string
  title: string
  detail: string
  state: string
  waylineId?: string
  flightTaskId?: string
}
const componentSelectorVisible = ref(false)
const componentSelectorLoading = ref(false)
const componentSelectorError = ref('')
const componentSelectorKeyword = ref('')
const componentSelectorItems = ref<OpenComponentSelection[]>([])
const selectedComponentSelectionId = ref('')
let componentSelectorRequestVersion = 0
const taskReferenceType = computed(() => String(props.task?.refType || 'NONE').toUpperCase())
const taskReferenceId = computed(() => props.task?.refId || '')
const isTaskPlanBound = computed(() => Boolean(props.task && taskReferenceType.value === 'PLAN' && taskReferenceId.value))
const componentRequiresSelection = (type: UavOpenComponentType) =>
  type === 'WAYLINE_EDIT' || type === 'COCKPIT' || type === 'TRAJECTORY_PLAYBACK'
const componentSelectorTitle = computed(() => activeOpenComponentType.value === 'WAYLINE_EDIT' ? '选择待编辑航线' : '选择关联飞行任务')
const componentSelectorHint = computed(() => activeOpenComponentType.value === 'WAYLINE_EDIT'
  ? '请选择具有有效航线 ID 的航线，确认后将进入对应航线的编辑界面。'
  : '请选择具有有效飞行任务 ID 的任务，确认后将进入对应的开放组件。')
const filteredComponentSelectorItems = computed(() => {
  const keyword = componentSelectorKeyword.value.trim().toLowerCase()
  if (!keyword) return componentSelectorItems.value
  return componentSelectorItems.value.filter((item) => `${item.title}${item.detail}${item.id}`.toLowerCase().includes(keyword))
})

async function loadDasFlyComponentUrl(target: { waylineId?: string; flightTaskId?: string } = {}) {
  const requestVersion = ++dasFlyEmbedRequestVersion
  if (!useDasFlyEmbed.value) {
    dasFlyComponentUrl.value = ''
    dasFlyEmbedError.value = ''
    return
  }
  dasFlyEmbedLoading.value = true
  dasFlyEmbedError.value = ''
  try {
    const url = await getUavComponentUrl(activeOpenComponentType.value, target)
    if (requestVersion === dasFlyEmbedRequestVersion) dasFlyComponentUrl.value = url
  } catch (error) {
    if (requestVersion === dasFlyEmbedRequestVersion) {
      dasFlyComponentUrl.value = ''
      dasFlyEmbedError.value = error instanceof ApiBusinessError
        ? `后端生成${activeOpenComponent.value?.label || '开放组件'}授权地址失败（错误码 ${error.code}）：${error.message}`
        : error instanceof Error ? `${activeOpenComponent.value?.label || '开放组件'}地址获取失败：${error.message}` : '开放组件地址获取失败。'
    }
  } finally {
    if (requestVersion === dasFlyEmbedRequestVersion) dasFlyEmbedLoading.value = false
  }
}

function routeSelections(source: FlightRoute[]): OpenComponentSelection[] {
  return source.filter((route) => Boolean(route.id)).map((route) => ({
    id: `wayline:${route.id}`,
    title: route.name,
    detail: `${route.routeTypeLabel} · ${route.area || '未填写区域'} · 航线 ID：${route.id}`,
    state: route.status,
    waylineId: route.id,
  }))
}

function flightTaskSelections(source: UavFlightTaskOption[]): OpenComponentSelection[] {
  return source.filter((task) => Boolean(task.id)).map((task) => ({
    id: `flight:${task.id}`,
    title: task.name,
    detail: `${task.waylineName} · ${task.deviceName} · 飞行任务 ID：${task.id}`,
    state: task.status,
    flightTaskId: task.id,
    waylineId: task.waylineId || undefined,
  }))
}

async function openComponentSelector(type: UavOpenComponentType) {
  activeOpenComponentType.value = type
  dasFlyComponentUrl.value = ''
  dasFlyEmbedError.value = ''
  componentSelectorVisible.value = true
  componentSelectorLoading.value = true
  componentSelectorError.value = ''
  componentSelectorKeyword.value = ''
  componentSelectorItems.value = []
  selectedComponentSelectionId.value = ''
  const requestVersion = ++componentSelectorRequestVersion
  try {
    if (type === 'WAYLINE_EDIT') {
      let source = routes.value
      if (!source.length && !isMockMode()) source = (await getRoutes({ pageNum: 1, pageSize: 200, projectId: selectedProjectId.value || undefined })).list
      const items = routeSelections(source)
      if (!items.length) throw new Error('未查询到可编辑的航线，请先创建或同步航线。')
      if (requestVersion === componentSelectorRequestVersion) componentSelectorItems.value = items
    } else {
      const result = await getUavFlightTaskOptions({ pageNum: 1, pageSize: 200, projectId: selectedProjectId.value || undefined })
      const items = flightTaskSelections(result.list)
      if (!items.length) throw new Error('未查询到可用飞行任务，请先创建飞行计划并生成飞行任务。')
      if (requestVersion === componentSelectorRequestVersion) componentSelectorItems.value = items
    }
  } catch (error) {
    if (requestVersion === componentSelectorRequestVersion) componentSelectorError.value = error instanceof Error ? error.message : '选择数据加载失败，请重试。'
  } finally {
    if (requestVersion === componentSelectorRequestVersion) componentSelectorLoading.value = false
  }
}

/** 切换开放组件时关闭选择层，并废弃尚未返回的选项请求。 */
function dismissComponentSelector() {
  componentSelectorRequestVersion += 1
  componentSelectorVisible.value = false
  componentSelectorLoading.value = false
  componentSelectorError.value = ''
  componentSelectorKeyword.value = ''
  componentSelectorItems.value = []
  selectedComponentSelectionId.value = ''
}

function selectOpenComponent(type: UavOpenComponentType) {
  if (componentRequiresSelection(type)) {
    void openComponentSelector(type)
    return
  }
  dismissComponentSelector()
  if (activeOpenComponentType.value === type && dasFlyComponentUrl.value) return
  activeOpenComponentType.value = type
  dasFlyComponentUrl.value = ''
  void loadDasFlyComponentUrl()
}

function openFlightPlanCreate() {
  selectOpenComponent('FLIGHT_CREATE')
}

function openWaylineCreate() {
  selectOpenComponent('WAYLINE_CREATE')
}

function openWaylineEdit() {
  selectOpenComponent('WAYLINE_EDIT')
}

function openCockpit() {
  selectOpenComponent('COCKPIT')
}

function openTrajectoryPlayback() {
  selectOpenComponent('TRAJECTORY_PLAYBACK')
}

defineExpose({ openFlightPlanCreate, openWaylineCreate, openWaylineEdit, openCockpit, openTrajectoryPlayback })

function confirmComponentSelection() {
  const selected = componentSelectorItems.value.find((item) => item.id === selectedComponentSelectionId.value)
  if (!selected) {
    componentSelectorError.value = '请先选择一条记录。'
    return
  }
  dismissComponentSelector()
  void loadDasFlyComponentUrl({ waylineId: selected.waylineId, flightTaskId: selected.flightTaskId })
}

function retryActiveOpenComponent() {
  if (componentRequiresSelection(activeOpenComponentType.value)) void openComponentSelector(activeOpenComponentType.value)
  else void loadDasFlyComponentUrl()
}

function clearScopedData() {
  routes.value = []
  historyRoutes.value = []
  plans.value = []
  activeRouteId.value = ''
  activePlanId.value = ''
  selectedProjectId.value = ''
}

function resetMockData() {
    routes.value = createRoutesForTask(props.task)
    historyRoutes.value = createHistoryRoutes(props.task)
    plans.value = createFlightPlans(routes.value)
    activeRouteId.value = routes.value[0]?.id || ''
    activePlanId.value = plans.value[0]?.id || ''
}

async function loadPatrolData() {
  routeError.value = ''
  if (isMockMode()) {
    resetMockData()
    return
  }

  deviceLoading.value = true
  const [projectResult, deviceResult] = await Promise.allSettled([
    getUavProjectOptions(),
    getUavDeviceOptions(),
  ])
  if (projectResult.status === 'fulfilled') {
    projects.value = projectResult.value
  } else {
    projects.value = []
    routeError.value = projectResult.reason instanceof Error ? projectResult.reason.message : '项目下拉选项加载失败。'
  }
  deviceOptions.value = deviceResult.status === 'fulfilled' ? deviceResult.value : []
  deviceLoading.value = false

  if (props.task) {
    if (isTaskPlanBound.value) {
      await loadTaskLinkedPlan(taskReferenceId.value)
      return
    }
    clearScopedData()
    routeError.value = taskReferenceType.value === 'NONE'
      ? '该任务尚未关联飞行计划或航线。'
      : `任务关联类型为 ${taskReferenceType.value}，当前接口无法解析到飞行计划和航线。`
    return
  }

  selectedProjectId.value = projectResult.status === 'fulfilled' && projectResult.value.some((item) => item.id === selectedProjectId.value)
    ? selectedProjectId.value
    : (projectResult.status === 'fulfilled' ? projectResult.value[0]?.id || '' : '')
  await loadScopedPatrolData()
}

/**
 * 业务任务仅能展示其 refId 指向的飞行计划，以及该计划指向的唯一航线。
 * 不用项目分页接口作回退，以避免不同任务看到同一批公共航线。
 */
async function loadTaskLinkedPlan(planId: string) {
  routeLoading.value = true
  routeError.value = ''
  clearScopedData()
  try {
    const plan = await getFlightPlanDetail(planId)
    if (!plan) throw new Error('未找到任务关联的飞行计划。')

    plans.value = [plan]
    activePlanId.value = plan.id
    if (plan.date) selectedDate.value = plan.date
    selectedProjectId.value = plan.projectId || ''
    if (plan.projectId && !projects.value.some((item) => item.id === plan.projectId)) {
      projects.value = [{ id: plan.projectId, name: `关联项目 #${plan.projectId}` }, ...projects.value]
    }
    if (!plan.routeId) throw new Error('关联飞行计划未返回 waylineId，无法读取任务航线。')

    const route = await getRouteDetail(plan.routeId)
    if (!route) throw new Error('未找到关联飞行计划对应的航线。')
    routes.value = [route]
    historyRoutes.value = [route]
    activeRouteId.value = route.id
  } catch (error) {
    clearScopedData()
    routeError.value = error instanceof Error ? error.message : '任务关联航线加载失败。'
  } finally {
    routeLoading.value = false
  }
}

async function loadScopedPatrolData() {
  if (isMockMode()) return
  routeLoading.value = true
  routeError.value = ''
  const query = { pageNum: 1, pageSize: 200, projectId: selectedProjectId.value || undefined }
  const [routeResult, planResult] = await Promise.allSettled([
    getRoutes(query),
    getFlightPlans(query),
  ])
  if (routeResult.status === 'fulfilled') {
    routes.value = routeResult.value.list
    // 当前接口没有业务任务 ID 条件，展示当前项目下、当前账号可见的航线。
    historyRoutes.value = routeResult.value.list
    activeRouteId.value = routeResult.value.list[0]?.id || ''
    if (activeRouteId.value) void loadRouteDetail(activeRouteId.value)
  } else {
    routes.value = []
    historyRoutes.value = []
    routeError.value = routeResult.reason instanceof Error ? routeResult.reason.message : '真实航线列表加载失败。'
  }
  if (planResult.status === 'fulfilled') {
    plans.value = planResult.value.list
    activePlanId.value = plans.value[0]?.id || ''
    if (plans.value[0]?.date) selectedDate.value = plans.value[0].date
  } else {
    plans.value = []
    if (!routeError.value) routeError.value = planResult.reason instanceof Error ? planResult.reason.message : '真实飞行计划加载失败。'
  }
  routeLoading.value = false
}

watch(() => props.task?.id, () => void loadPatrolData(), { immediate: true })
watch(useDasFlyEmbed, () => void loadDasFlyComponentUrl(), { immediate: true })

const activeRoute = computed(() => routes.value.find((item) => item.id === activeRouteId.value) || routes.value[0])
const filteredRoutes = computed(() =>
  routes.value.filter((route) =>
    (!routeKeyword.value || `${route.name}${route.id}${route.area}`.includes(routeKeyword.value))
    && (!statusFilter.value || route.status === statusFilter.value),
  ),
)
const dayPlans = computed(() => plans.value.filter((item) => item.date === selectedDate.value))
const calendarDays = computed(() => {
  const anchor = new Date(`${selectedDate.value || plans.value[0]?.date || new Date().toISOString().slice(0, 10)}T00:00:00`)
  const year = Number.isNaN(anchor.getTime()) ? new Date().getFullYear() : anchor.getFullYear()
  const month = Number.isNaN(anchor.getTime()) ? new Date().getMonth() : anchor.getMonth()
  const first = new Date(year, month, 1).getDay()
  const total = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - first + 1
    if (day < 1 || day > total) return { label: '', value: '' }
    const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return { label: String(day), value }
  })
})
const calendarTitle = computed(() => {
  const value = selectedDate.value || plans.value[0]?.date
  const date = value ? new Date(`${value}T00:00:00`) : new Date()
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
})
const metrics = computed(() => {
  const route = activeRoute.value
  if (!route) return { waypoints: 0, lengthKm: 0, durationMin: 0, coverageKm2: 0, photoEstimate: 0 }
  const built = buildRouteMetrics(route.waypoints, route.speed)
  return {
    waypoints: route.waypoints.length,
    lengthKm: route.lengthKm || built.lengthKm,
    durationMin: route.durationMin || built.durationMin,
    coverageKm2: built.coverageKm2,
    photoEstimate: route.photoEstimate || built.photoEstimate,
  }
})

async function selectRoute(id: string) {
  activeRouteId.value = id
  if (!isMockMode()) await loadRouteDetail(id)
}

async function loadRouteDetail(id: string) {
  try {
    const detail = await getRouteDetail(id)
    if (!detail) return
    const index = routes.value.findIndex((item) => item.id === id)
    if (index >= 0) routes.value[index] = { ...routes.value[index]!, ...detail }
  } catch (error) {
    routeError.value = error instanceof Error ? error.message : '航线详情加载失败。'
  }
}

async function selectPlan(id: string) {
  activePlanId.value = id
  if (isMockMode()) {
    const plan = plans.value.find((item) => item.id === id)
    if (plan?.routeId) selectRoute(plan.routeId)
    return
  }
  planLoading.value = true
  try {
    const detail = await getFlightPlanDetail(id)
    if (!detail) return
    const index = plans.value.findIndex((item) => item.id === id)
    if (index >= 0) plans.value[index] = { ...plans.value[index]!, ...detail }
    if (detail.routeId) await selectRoute(detail.routeId)
  } catch (error) {
    routeError.value = error instanceof Error ? error.message : '飞行计划详情加载失败。'
  } finally {
    planLoading.value = false
  }
}

function onRouteCreated(route: FlightRoute) {
  if (!isMockMode()) return
  routes.value.unshift(route)
  activeRouteId.value = route.id
}

function reuseHistory(route: FlightRoute) {
  if (!isMockMode()) return
  const cloned: FlightRoute = {
    ...route,
    id: `RT-REUSE-${Date.now().toString().slice(-5)}`,
    name: `${route.name}-复用`,
    status: '草稿',
    createdAt: new Date().toISOString().slice(0, 10),
  }
  routes.value.unshift(cloned)
  activeRouteId.value = cloned.id
}

function addPlan() {
  if (!isMockMode()) return
  if (!activeRoute.value) return
  plans.value.push({
    id: `FP-${Date.now()}`,
    date: selectedDate.value,
    start: '15:00',
    end: '16:00',
    title: `${activeRoute.value.name}补充计划`,
    area: activeRoute.value.area,
    routeId: activeRoute.value.id,
  })
}
</script>

<template>
  <div class="route-flight-plan" :class="{ 'route-flight-plan--embed': useDasFlyEmbed, 'route-flight-plan--without-component-nav': useDasFlyEmbed && !props.showComponentNav }">
    <section v-if="useDasFlyEmbed" class="das-fly-wayline-embed">
      <nav v-if="props.showComponentNav" class="das-fly-component-nav" aria-label="低空云开放组件">
        <button
          v-for="item in openComponentNavItems"
          :key="item.type"
          class="das-fly-component-nav__item"
          :class="{ active: item.type === activeOpenComponentType }"
          :title="item.label"
          @click="selectOpenComponent(item.type)"
        >
          <i><component :is="item.icon" /></i><span>{{ item.label }}</span>
        </button>
      </nav>
      <div class="das-fly-component-main">
        <section v-if="componentSelectorVisible" class="component-selector" aria-live="polite">
          <header>
            <div><h2>{{ componentSelectorTitle }}</h2><p>{{ componentSelectorHint }}</p></div>
            <button type="button" aria-label="关闭选择面板" @click="dismissComponentSelector">×</button>
          </header>
          <input v-model="componentSelectorKeyword" class="component-selector__search" placeholder="搜索名称、区域、设备或 ID" />
          <div v-if="componentSelectorLoading" class="component-selector__state">正在读取可选择记录…</div>
          <div v-else-if="componentSelectorError" class="component-selector__state is-error">
            <span>{{ componentSelectorError }}</span>
            <button type="button" @click="openComponentSelector(activeOpenComponentType)">重新加载</button>
          </div>
          <div v-else class="component-selector__list">
            <button
              v-for="item in filteredComponentSelectorItems"
              :key="item.id"
              type="button"
              :class="{ active: item.id === selectedComponentSelectionId }"
              @click="selectedComponentSelectionId = item.id"
            >
              <span><b>{{ item.title }}</b><small>{{ item.detail }}</small></span>
              <em>{{ item.state }}</em>
            </button>
            <div v-if="!filteredComponentSelectorItems.length" class="component-selector__state">没有匹配的记录。</div>
          </div>
          <footer>
            <button type="button" class="component-selector__cancel" @click="dismissComponentSelector">取消</button>
            <button type="button" class="component-selector__confirm" :disabled="!selectedComponentSelectionId" @click="confirmComponentSelection">确认进入{{ activeOpenComponent?.label }}</button>
          </footer>
        </section>
        <div v-else-if="dasFlyEmbedLoading" class="das-fly-wayline-state">正在获取{{ activeOpenComponent?.label }}授权…</div>
        <div v-else-if="dasFlyEmbedError" class="das-fly-wayline-state is-error"><span>{{ dasFlyEmbedError }}</span><button @click="retryActiveOpenComponent">重新选择并获取</button></div>
        <iframe
          v-else-if="dasFlyComponentEmbedUrl"
          :key="activeOpenComponentType"
          :src="dasFlyComponentEmbedUrl"
          :title="`低空云${activeOpenComponent?.label || '开放组件'}`"
          allow="fullscreen; clipboard-read; clipboard-write; geolocation"
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>
    </section>
    <template v-else>
    <section class="map-stage">
      <aside class="route-tool-float">
        <div class="panel">
          <div class="panel-title">航线规划工具</div>
          <div v-if="!isMockMode()" class="route-data-selects">
            <label>所属项目
              <select v-model="selectedProjectId" :disabled="routeLoading || Boolean(task)" @change="loadScopedPatrolData">
                <option value="">全部可见项目</option>
                <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
              </select>
            </label>
            <label>飞行计划
              <select v-model="activePlanId" :disabled="routeLoading || planLoading || !plans.length" @change="selectPlan(activePlanId)">
                <option value="">请选择飞行计划</option>
                <option v-for="plan in plans" :key="plan.id" :value="plan.id">{{ plan.title }}</option>
              </select>
            </label>
          </div>
          <div class="tool-grid">
            <button @click="newRouteVisible = true">＋ 新建航线</button>
            <button @click="newRouteVisible = true">⇧ 导入航线</button>
          </div>
          <div class="route-filter">
            <input v-model="routeKeyword" placeholder="筛选当前航线…" />
            <select v-model="statusFilter">
              <option value="">全部状态</option>
              <option>草稿</option>
              <option>已规划</option>
              <option>已下发</option>
              <option>已完成</option>
            </select>
          </div>
          <div class="route-list">
            <button
              v-for="route in filteredRoutes"
              :key="route.id"
              :class="{ active: route.id === activeRouteId }"
              @click="selectRoute(route.id)"
            >
              <b>{{ route.name }}</b>
              <small>{{ route.routeTypeLabel }} · {{ route.status }}</small>
            </button>
          </div>
          <p v-if="routeLoading" class="panel-note">正在读取真实航线与飞行计划…</p>
          <p v-else-if="routeError" class="panel-note error">{{ routeError }}</p>
          <p v-else-if="isTaskPlanBound" class="panel-note">当前仅展示该任务关联飞行计划及其航线。</p>
          <p v-else-if="task" class="panel-note">该任务尚未建立可用的飞行计划/航线关联。</p>
          <p v-else-if="!isMockMode()" class="panel-note">当前展示账号可见航线。</p>
        </div>
      </aside>

      <RouteWorkspaceMap :routes="routes" :active-route-id="activeRouteId" />

      <aside class="right-panel">
        <div class="panel">
          <div class="panel-title">任务与航线信息</div>
          <dl>
            <dt>任务名称</dt><dd>{{ taskLoading ? '正在读取任务…' : task?.name || '未绑定任务' }}</dd>
            <dt v-if="!isMockMode()">所属项目</dt><dd v-if="!isMockMode()">{{ projects.find((item) => item.id === selectedProjectId)?.name || '全部可见项目' }}</dd>
            <dt v-if="task">任务关联</dt><dd v-if="task">{{ task.refType || 'NONE' }}{{ task.refId ? ` · ${task.refId}` : '' }}</dd>
            <dt>作业区域</dt><dd>{{ activeRoute?.area || '-' }}</dd>
            <dt>飞行器</dt><dd>{{ activeRoute?.aircraft || '-' }}</dd>
            <dt>飞手</dt><dd>{{ task?.assignee || '-' }}</dd>
            <dt>计划时间</dt><dd>{{ task?.plannedStart?.slice(0, 16) || '-' }}</dd>
          </dl>
        </div>
        <div class="panel">
          <div class="panel-title">航线参数</div>
          <dl v-if="activeRoute">
            <dt>飞行高度</dt><dd><input v-model.number="activeRoute.height" :disabled="!isMockMode()" type="number" /> m</dd>
            <dt>飞行速度</dt><dd><input v-model.number="activeRoute.speed" :disabled="!isMockMode()" type="number" /> m/s</dd>
            <dt>航向重叠</dt><dd><input v-model.number="activeRoute.overlapFront" :disabled="!isMockMode()" type="number" /> %</dd>
            <dt>旁向重叠</dt><dd><input v-model.number="activeRoute.overlapSide" :disabled="!isMockMode()" type="number" /> %</dd>
            <dt>航线类型</dt><dd>{{ activeRoute.routeTypeLabel }}</dd>
            <dt>返航点</dt><dd>起降点 H</dd>
          </dl>
        </div>
        <div class="panel">
          <div class="panel-title">规划结果</div>
          <div class="metrics">
            <div><b>{{ metrics.waypoints }}</b><span>航点</span></div>
            <div><b>{{ metrics.lengthKm }}</b><span>公里</span></div>
            <div><b>{{ metrics.durationMin }}</b><span>分钟</span></div>
            <div><b>{{ metrics.coverageKm2 }}</b><span>km²</span></div>
            <div><b>{{ metrics.photoEstimate }}</b><span>预计照片</span></div>
          </div>
        </div>
        <div class="actions">
          <button class="ghost" :disabled="!isMockMode()" title="当前后端未提供航线保存接口">保存草稿</button>
          <button class="primary" :disabled="!isMockMode()" title="当前后端未提供航线下发接口">下发任务</button>
        </div>
      </aside>
    </section>

    <section class="bottom-grid">
      <div class="panel">
        <div class="panel-title">历史航线 / 任务</div>
        <table>
          <thead>
            <tr><th>#</th><th>航线名称</th><th>区域</th><th>日期</th><th>航点</th><th>长度</th><th>状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="(route, index) in historyRoutes" :key="route.id">
              <td>{{ index + 1 }}</td>
              <td>{{ route.name }}</td>
              <td>{{ route.area }}</td>
              <td>{{ route.createdAt }}</td>
              <td>{{ route.waypoints.length }}</td>
              <td>{{ route.lengthKm }} km</td>
              <td><em class="done">● 已完成</em></td>
              <td>
                <button class="link" :disabled="!isMockMode()" @click="reuseHistory(route)">复用</button>
                <button class="link" @click="selectRoute(route.id)">查看</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-title">规划说明 / 告警</div>
        <div v-for="item in planningAlerts" :key="item.text" class="alert-row" :class="item.level">
          <i>{{ item.level === 'success' ? '✓' : item.level === 'warning' ? '!' : 'i' }}</i>
          <span>{{ item.text }}</span>
        </div>
      </div>
      <div class="panel calendar-panel">
        <div class="panel-title">飞行计划日历</div>
        <div class="calendar-layout">
          <div class="calendar">
            <div class="cal-head">{{ calendarTitle }}</div>
            <div class="cal-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
            <div class="cal-grid">
              <button
                v-for="(day, index) in calendarDays"
                :key="index"
                :disabled="!day.value"
                :class="{ active: day.value === selectedDate, has: plans.some((p) => p.date === day.value) }"
                @click="day.value && (selectedDate = day.value)"
              >
                {{ day.label }}
              </button>
            </div>
          </div>
          <div class="plan-list">
            <button v-for="item in dayPlans" :key="item.id" class="plan-item" :class="{ active: item.id === activePlanId }" @click="selectPlan(item.id)">
              <b>{{ item.start }}-{{ item.end }}</b>
              <span>{{ item.title }}</span>
              <small>{{ item.area }}</small>
            </button>
            <button class="add-plan" @click="addPlan">＋ 新增计划</button>
          </div>
        </div>
      </div>
    </section>

    <NewRouteDialog
      v-model="newRouteVisible"
      :devices="deviceOptions"
      :devices-loading="deviceLoading"
      :real-mode="!isMockMode()"
      @created="onRouteCreated"
    />
    </template>
  </div>
</template>

<style scoped lang="scss">
.route-flight-plan {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(360px, 1.45fr) minmax(210px, 0.9fr);
  gap: 8px;
  padding: 8px;
  background: #e8eef3;
}
.route-flight-plan--embed { display: block; padding: 0; background: #031a31; }
.das-fly-wayline-embed { width: 100%; height: 100%; min-height: 0; display: grid; grid-template-columns: 154px minmax(0, 1fr); overflow: hidden; background: #031a31; }
.route-flight-plan--without-component-nav .das-fly-wayline-embed { grid-template-columns: minmax(0, 1fr); }
.das-fly-component-nav { z-index: 2; display: grid; align-content: start; gap: 4px; padding: 16px 9px; color: #aeadb5; background: #302f37; border-right: 1px solid #403f48; box-shadow: 3px 0 14px #00000035; }
.das-fly-component-nav__item { width: 100%; min-height: 38px; display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: center; gap: 8px; padding: 6px 9px; color: #bebcc4; background: transparent; border: 1px solid transparent; border-radius: 6px; cursor: pointer; text-align: left; transition: .18s ease; }
.das-fly-component-nav__item:hover { color: #fff; background: #ffffff12; }
.das-fly-component-nav__item.active { color: #fff; background: #3978ee; box-shadow: 0 3px 10px #142c714d; }
.das-fly-component-nav__item i { width: 22px; height: 22px; display: grid; place-items: center; color: currentColor; font-style: normal; line-height: 1; }
.das-fly-component-nav__item i :deep(svg) { width: 20px; height: 20px; stroke-width: 1.7; }
.das-fly-component-nav__item span { overflow: hidden; font-size: 14px; font-weight: 600; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.das-fly-component-main { position: relative; min-width: 0; min-height: 0; background: #031a31; }
.das-fly-component-main iframe { width: 100%; height: 100%; display: block; border: 0; background: #031a31; }
.das-fly-wayline-state { width: 100%; height: 100%; display: grid; place-content: center; gap: 14px; justify-items: center; padding: 28px; box-sizing: border-box; color: #a9eaf4; font-size: 16px; text-align: center; background: #031a31; }.das-fly-wayline-state.is-error { color: #ffb5bb; }.das-fly-wayline-state button { padding: 9px 16px; color: #d7f8ff; background: #075477; border: 1px solid #24cbe3; cursor: pointer; font-size: 15px; }
.component-selector { width: min(720px, calc(100% - 48px)); max-height: min(700px, calc(100% - 48px)); display: grid; grid-template-rows: auto auto minmax(120px, 1fr) auto; gap: 14px; padding: 24px; box-sizing: border-box; color: #cceaf6; background: linear-gradient(145deg, #073253, #03182f 70%); border: 1px solid #1d8fbc; border-radius: 10px; box-shadow: 0 18px 45px #000b, 0 0 22px #0ac6e333; position: absolute; z-index: 4; inset: 50% auto auto 50%; transform: translate(-50%, -50%); }.component-selector header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }.component-selector h2 { margin: 0; color: #e3fbff; font-size: 21px; }.component-selector p { margin: 8px 0 0; color: #81abbc; font-size: 14px; line-height: 1.5; }.component-selector header>button { width: 30px; height: 30px; color: #82aec0; background: transparent; border: 0; cursor: pointer; font-size: 26px; line-height: 1; }.component-selector header>button:hover { color: #fff; }.component-selector__search { width: 100%; height: 38px; padding: 0 12px; box-sizing: border-box; color: #d8f7ff; background: #02192e; border: 1px solid #176a8d; border-radius: 5px; outline: none; font-size: 14px; }.component-selector__search:focus { border-color: #2ad8ee; box-shadow: 0 0 0 2px #1bd4ea22; }.component-selector__list { min-height: 0; overflow: auto; border: 1px solid #0b5277; background: #031d35; }.component-selector__list>button { width: 100%; min-height: 62px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 10px 14px; color: #bfdeea; background: transparent; border: 0; border-bottom: 1px solid #0b415f; cursor: pointer; text-align: left; }.component-selector__list>button:last-child { border-bottom: 0; }.component-selector__list>button:hover,.component-selector__list>button.active { background: #08628470; }.component-selector__list>button.active { box-shadow: inset 3px 0 #2ce2ef; }.component-selector__list span,.component-selector__list b,.component-selector__list small { min-width: 0; display: block; }.component-selector__list b { overflow: hidden; color: #e2f8fc; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }.component-selector__list small { margin-top: 5px; overflow: hidden; color: #77a7ba; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.component-selector__list em { padding: 4px 7px; color: #6de5cf; background: #075f4a66; border: 1px solid #12725e; font-size: 12px; font-style: normal; white-space: nowrap; }.component-selector__state { min-height: 120px; display: grid; place-content: center; gap: 12px; justify-items: center; color: #89b8c8; text-align: center; }.component-selector__state.is-error { color: #ffb6bc; }.component-selector__state button { padding: 7px 13px; color: #d7f8ff; background: #075477; border: 1px solid #24cbe3; cursor: pointer; }.component-selector footer { display: flex; justify-content: flex-end; gap: 10px; }.component-selector footer button { min-height: 36px; padding: 0 15px; border-radius: 4px; cursor: pointer; font-size: 14px; }.component-selector__cancel { color: #9fc7d6; background: transparent; border: 1px solid #28617b; }.component-selector__confirm { color: #021625; background: #34dce9; border: 1px solid #79f5fc; }.component-selector__confirm:disabled { color: #69899a; background: #17445a; border-color: #255a70; cursor: not-allowed; }
.map-stage {
  position: relative;
  isolation: isolate;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 8px;
}
.route-tool-float {
  position: absolute;
  z-index: 20;
  top: 10px;
  left: 10px;
  width: 174px;
  display: grid;
  gap: 8px;
  pointer-events: auto;
}
.right-panel {
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 8px;
}
.panel {
  overflow: hidden;
  background: #fff;
  border: 1px solid #d5e0e8;
  border-radius: 6px;
  box-shadow: 0 2px 8px #1c3b5210;
}
.panel-title {
  height: 34px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-bottom: 1px solid #e6eef3;
  color: #1f3d52;
  font-size: 16px;
  font-weight: 700;
}
.route-data-selects {
  display: grid;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid #e2edf2;
  background: #f7fafc;
}
.route-data-selects label {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 5px;
  color: #5d7889;
  font-size: 12px;
}
.route-data-selects select {
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  color: #24455a;
  background: #fff;
  border: 1px solid #cbdde7;
  border-radius: 3px;
  outline: 0;
  font-size: 12px;
}
.route-data-selects select:focus { border-color: #1f8fff; box-shadow: 0 0 0 2px #1f8fff18; }
.tool-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 8px;
}
.tool-grid button {
  padding: 7px 4px;
  color: #2d5368;
  background: #f3f8fb;
  border: 1px solid #d3e2eb;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}
.tool-grid button:hover { background: #e7f4fb; border-color: #8fc5de; }
.tool-grid button:disabled,
.actions button:disabled,
.link:disabled { opacity: .46; cursor: not-allowed; }
.route-filter {
  display: grid;
  gap: 6px;
  padding: 0 8px 8px;
}
.route-filter input,
.route-filter select {
  height: 28px;
  padding: 0 8px;
  border: 1px solid #d3e2eb;
  border-radius: 4px;
  font-size: 15px;
}
.route-list {
  max-height: 120px;
  overflow: auto;
  border-top: 1px solid #e6eef3;
}
.route-list button {
  width: 100%;
  padding: 8px;
  border: 0;
  border-bottom: 1px solid #eef3f6;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.route-list button.active { background: #eaf6fc; }
.route-list b,
.route-list small { display: block; }
.route-list b { color: #1f3d52; font-size: 15px; }
.route-list small { margin-top: 3px; color: #7a8f9e; font-size: 14px; }
.panel-note { margin: 0; padding: 7px 8px; color: #5d7b8c; background: #f2f7fa; border-top: 1px solid #e2edf2; font-size: 12px; line-height: 1.45; }
.panel-note.error { color: #b84c4c; background: #fff5f5; }
.right-panel dl {
  display: grid;
  grid-template-columns: 72px 1fr;
  margin: 0;
  padding: 6px 10px 10px;
}
.right-panel dt,
.right-panel dd {
  margin: 0;
  padding: 6px 0;
  border-bottom: 1px solid #eef3f6;
  font-size: 15px;
}
.right-panel dt { color: #7a8f9e; }
.right-panel dd { color: #1f3d52; text-align: right; }
.right-panel input {
  width: 54px;
  height: 22px;
  margin-right: 4px;
  border: 1px solid #d3e2eb;
  border-radius: 3px;
  text-align: right;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 8px 10px 12px;
}
.metrics > div {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: #f4f8fb;
  border-radius: 4px;
}
.metrics b { color: #0b6f9a; font-size: 16px; }
.metrics span { color: #7a8f9e; font-size: 14px; }
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.actions button {
  height: 36px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}
.actions .ghost {
  color: #2d5368;
  background: #fff;
  border: 1px solid #c5d6e1;
}
.actions .primary {
  color: #fff;
  background: #1f7fe0;
  border: 1px solid #3d95ef;
}
.bottom-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 1.35fr 0.85fr 1.1fr;
  gap: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
}
th, td {
  padding: 7px 8px;
  border-bottom: 1px solid #eef3f6;
  text-align: left;
  color: #445868;
}
th { color: #6f8393; background: #f7fafc; }
.done { color: #1fbf6a; font-style: normal; }
.link {
  margin-right: 6px;
  padding: 0;
  color: #1f7fe0;
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 15px;
}
.alert-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border-bottom: 1px solid #eef3f6;
  color: #445868;
  font-size: 15px;
}
.alert-row i {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-style: normal;
  font-size: 14px;
}
.alert-row.success i { color: #fff; background: #1fbf6a; }
.alert-row.info i { color: #fff; background: #1f7fe0; }
.alert-row.warning i { color: #fff; background: #e2a12b; }
.calendar-layout {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  min-height: 0;
  height: calc(100% - 34px);
}
.calendar { padding: 8px; border-right: 1px solid #eef3f6; }
.cal-head { margin-bottom: 6px; color: #1f3d52; font-size: 16px; font-weight: 700; text-align: center; }
.cal-week, .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-week span, .cal-grid button {
  height: 22px;
  display: grid;
  place-items: center;
  color: #6f8393;
  font-size: 14px;
}
.cal-grid button {
  border: 0;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
}
.cal-grid button.active { color: #fff; background: #1f7fe0; }
.cal-grid button.has:not(.active) { background: #e8f3fb; color: #1f7fe0; }
.plan-list {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 8px;
}
.plan-item {
  width: 100%;
  padding: 7px 8px;
  background: #f4f8fb;
  border: 1px solid transparent;
  border-radius: 4px;
  text-align: left;
  cursor: pointer;
}
.plan-item:hover,.plan-item.active { border-color: #77bce8; background: #eaf6ff; }
.plan-item b, .plan-item span, .plan-item small { display: block; }
.plan-item b { color: #1f7fe0; font-size: 15px; }
.plan-item span { margin-top: 3px; color: #1f3d52; font-size: 15px; }
.plan-item small { margin-top: 2px; color: #7a8f9e; font-size: 14px; }
.add-plan {
  height: 32px;
  color: #1f7fe0;
  background: #fff;
  border: 1px dashed #8fc5de;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}
@media (max-width: 1450px) {
  .map-stage { grid-template-columns: 1fr 250px; }
  .route-tool-float { width: 160px; }
}
@media (max-width: 850px) {
  .das-fly-wayline-embed { grid-template-columns: 56px minmax(0, 1fr); }
  .das-fly-component-nav { padding: 9px 6px; }
  .das-fly-component-nav__item { grid-template-columns: 1fr; justify-items: center; min-height: 44px; padding: 6px; }
  .das-fly-component-nav__item span { display: none; }
}
</style>
