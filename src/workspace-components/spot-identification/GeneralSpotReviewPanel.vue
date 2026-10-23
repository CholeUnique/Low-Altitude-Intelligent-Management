<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createTasksFromAbnormals,
  getGovernanceTaskPage,
  getTaskAbnormalPage,
  updateGovernanceTask,
  type GovernanceTask,
  type TaskAbnormal,
} from '@/api/governance-task'
import {
  getRecognitionSpotPage,
  ignoreRecognitionSpots,
  revokeRecognitionSpots,
  type RecognitionAbnormalType,
  type RecognitionSpotItem,
} from '@/api/recognition-spot'
import { ApiBusinessError } from '@/api/client'
import { getDepartmentOptions, type DepartmentOption } from '@/api/auth'
import { getSceneDictionary, type SceneDictionaryItem } from '@/api/scene'
import { assignNonGrainReview, getNonGrainReviewerId, isNonGrainScene } from '@/api/non-grain-assignment'
import type { MapServiceItem } from '@/api/map-service'
import { useUserStore } from '@/stores/user'
import SpotDistributionMap from './SpotDistributionMap.vue'
import type { ComparisonPeriod, SynchronizedMapView } from './SpotDistributionMap.vue'

const user = useUserStore()
interface ReviewSpot extends RecognitionSpotItem {
  fromRecognitionApi?: boolean
  sourceTaskId?: string
  sourceTaskName?: string
  sourceDeptName?: string
  sourceSceneName?: string
  derivedTaskId?: string
}

const loading = ref(false)
const loadError = ref('')
const mapFullscreen = ref(false)
const records = ref<ReviewSpot[]>([])
const keyword = ref('')
const typeFilter = ref('')
const statusFilter = ref<number | ''>(0)

function toggleMapFullscreen() {
  mapFullscreen.value = !mapFullscreen.value
}

function handleMapFullscreenKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (mapFullscreen.value) mapFullscreen.value = false
}
const activeId = ref('')
const selectedIds = ref<string[]>([])
const creatingTasks = ref(false)
const taskCreateVisible = ref(false)
const taskPriority = ref(1)
const taskNames = ref<Record<string, string>>({})
const taskCreateError = ref('')
const departmentOptions = ref<DepartmentOption[]>([])
const departmentOptionsLoading = ref(false)
const departmentOptionsError = ref(false)
const operationMessage = ref('')
const operationError = ref('')
watch(operationMessage, (message, _previous, onCleanup) => {
  if (!message) return
  const timer = window.setTimeout(() => { operationMessage.value = '' }, 4500)
  onCleanup(() => window.clearTimeout(timer))
})
type SpotAction = 'ignore' | 'revoke'
type PendingSpotAction = { kind: SpotAction; id: string; spotNo: string; title: string; deptId: string; handleStatus: number }
const pendingSpotAction = ref<PendingSpotAction>()
const spotActionBusy = ref(false)
const spotActionError = ref('')
const revokeAcknowledged = ref(false)
const scenes = ref<SceneDictionaryItem[]>([])
const synchronizedMapView = ref<SynchronizedMapView>()
const periods = ref(2)
const activeImageIndex = ref(0)

const abnormalTypes: Array<{ value: RecognitionAbnormalType; label: string }> = [
  { value: 'ILLEGAL_OCCUPY', label: '违法占用' },
  { value: 'FOREST_DAMAGE', label: '林地破坏' },
  { value: 'NON_GRAIN', label: '耕地非粮化' },
  { value: 'ABANDONED', label: '土地撂荒' },
  { value: 'ILLEGAL_BUILD', label: '违法建设' },
  { value: 'OTHER', label: '其他' },
]
const statuses = [
  { value: 0, label: '待核查' },
  { value: 1, label: '核查中' },
  { value: 2, label: '已处置' },
  { value: 3, label: '已销号' },
  { value: 4, label: '已忽略' },
]

const spotActionCopy: Record<SpotAction, { title: string; description: string; confirm: string }> = {
  ignore: { title: '忽略图斑', description: '忽略后图斑记录仍可查询，但不再参与派单，也不能用于创建核查任务。', confirm: '确认忽略' },
  revoke: { title: '撤销图斑', description: '撤销后图斑将从列表中移除，业务边界及参考影像关联会被清理；此操作不可恢复。', confirm: '确认撤销' },
}
const pendingSpotActionCopy = computed(() => pendingSpotAction.value ? spotActionCopy[pendingSpotAction.value.kind] : undefined)

const visibleRecords = computed(() => records.value.filter((item) => item.handleStatus !== -1))
const filtered = computed(() => visibleRecords.value.filter((item) => {
  const text = `${item.spotNo} ${item.title} ${item.description} ${item.abnormalTypeDesc}`.toLowerCase()
  return (!keyword.value.trim() || text.includes(keyword.value.trim().toLowerCase()))
    && (!typeFilter.value || item.abnormalType === typeFilter.value)
    && (statusFilter.value === '' || item.handleStatus === statusFilter.value)
}))
const active = computed(() => filtered.value.find((item) => item.id === activeId.value) || filtered.value[0])
const statusCounts = computed(() => statuses.map((status) => ({
  ...status, count: visibleRecords.value.filter((item) => item.handleStatus === status.value).length,
})))
const selected = computed(() => records.value.filter((item) => selectedIds.value.includes(item.id)))
const activeSceneName = computed(() => {
  const item = active.value
  if (!item) return '-'
  return item.sourceSceneName || scenes.value.find((scene) => scene.code === item.sceneCode)?.name || item.sceneCode || '-'
})
const selectedSceneName = computed(() => {
  const item = selected.value[0]
  if (!item) return '-'
  return item.sourceSceneName || scenes.value.find((scene) => scene.code === item.sceneCode)?.name || item.sceneCode || '-'
})
const selectedDeptName = computed(() => {
  const item = selected.value[0]
  if (!item) return '-'
  const deptId = String(item.deptId || user.activeDeptId || '')
  return departmentOptions.value.find((department) => department.deptId === deptId)?.deptName
    || (item.sourceDeptName && !/^\d+$/.test(item.sourceDeptName) ? item.sourceDeptName : undefined)
    || user.currentUser?.deptList?.find((department) => String(department.deptId) === deptId)?.deptName
    || (deptId === user.activeDeptId ? user.currentUser?.deptName : undefined)
    || (departmentOptionsLoading.value ? '正在查询部门…' : departmentOptionsError.value ? '部门名称获取失败' : '未找到对应部门')
})
const activeAsTaskAbnormal = computed<TaskAbnormal | undefined>(() => active.value ? ({
  id: active.value.id,
  spotNo: active.value.spotNo,
  spotSource: active.value.spotSource,
  bizTaskId: active.value.sourceTaskId || active.value.derivedTaskId || '',
  sceneCode: active.value.sceneCode,
  abnormalType: active.value.abnormalType,
  abnormalTypeDesc: active.value.abnormalTypeDesc,
  abnormalLevel: 1,
  title: active.value.title,
  description: active.value.description,
  area: active.value.area,
  longitude: active.value.longitude,
  latitude: active.value.latitude,
  boundaryGeoJson: active.value.boundaryGeoJson,
  handleStatus: active.value.handleStatus,
  foundTime: active.value.foundTime,
}) : undefined)
const displayableImagery = computed(() => active.value?.mapServices || [])
const comparisonPeriods = computed<ComparisonPeriod[]>(() => {
  const services = displayableImagery.value
  return Array.from({ length: periods.value }, (_, offset) => {
    const index = activeImageIndex.value + offset
    return services[index]
      ? { number: index + 1, label: services[index]!.name, kind: 'map-service', mapService: services[index]! }
      : { number: index + 1, label: '暂无影像', kind: 'empty' }
  })
})

function statusLabel(value: number) {
  return statuses.find((item) => item.value === value)?.label || '未知状态'
}
function formatTime(value?: string) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-'
}
function selectSpot(id: string) {
  activeId.value = id
  activeImageIndex.value = 0
  synchronizedMapView.value = undefined
}
function selectPeriods(count: number) {
  if (count > displayableImagery.value.length) return
  periods.value = count
  activeImageIndex.value = Math.min(activeImageIndex.value, Math.max(0, displayableImagery.value.length - 1))
}
function selectImage(index: number) {
  activeImageIndex.value = index
  synchronizedMapView.value = undefined
}
function isImageDisplayed(index: number) {
  return index >= activeImageIndex.value && index < activeImageIndex.value + periods.value
}
function imageryThumbnailPeriod(service: MapServiceItem, index: number): ComparisonPeriod {
  return { number: index + 1, label: service.name, kind: 'map-service', mapService: service }
}
function canSelect(item: ReviewSpot) {
  if (item.derivedTaskId || item.handleStatus !== 0) return false
  const first = selected.value[0]
  return !first || selectedIds.value.includes(item.id)
    || (first.sceneCode === item.sceneCode && first.deptId === item.deptId)
}
function canOperateSpot(item: ReviewSpot | undefined, kind: SpotAction) {
  if (!item?.fromRecognitionApi || item.derivedTaskId) return false
  return (kind === 'ignore' || kind === 'revoke') && item.handleStatus === 0
}
function openSpotAction(kind: SpotAction) {
  const spot = active.value
  if (!spot || !canOperateSpot(spot, kind)) return
  const deptId = spot.deptId || user.activeDeptId
  if (!deptId) {
    operationError.value = '当前图斑没有处理部门，无法提交操作。'
    return
  }
  operationError.value = ''
  operationMessage.value = ''
  spotActionError.value = ''
  revokeAcknowledged.value = false
  pendingSpotAction.value = { kind, id: spot.id, spotNo: spot.spotNo, title: spot.title, deptId, handleStatus: spot.handleStatus }
}
function closeSpotAction() {
  if (spotActionBusy.value) return
  pendingSpotAction.value = undefined
  spotActionError.value = ''
}

async function submitSpotAction() {
  const pending = pendingSpotAction.value
  if (!pending || spotActionBusy.value || (pending.kind === 'revoke' && !revokeAcknowledged.value)) return
  const current = records.value.find((item) => item.id === pending.id)
  if (!current || (current.deptId || user.activeDeptId) !== pending.deptId || current.handleStatus !== pending.handleStatus || !canOperateSpot(current, pending.kind)) {
    spotActionError.value = '图斑信息已变化，请关闭弹窗后重新选择。'
    return
  }
  spotActionBusy.value = true
  spotActionError.value = ''
  const submittingDeptId = user.activeDeptId
  try {
    const input = { deptId: pending.deptId, ids: [pending.id] }
    const result = pending.kind === 'ignore'
      ? await ignoreRecognitionSpots(input)
      : await revokeRecognitionSpots(input)
    if (user.activeDeptId !== submittingDeptId) return
    pendingSpotAction.value = undefined
    await loadSpots(pending.spotNo)
    if (Number(result.count) > 0) operationMessage.value = `图斑“${pending.title}”已${spotActionCopy[pending.kind].title}。`
    else operationError.value = '后台未处理该图斑，列表已刷新，请确认最新状态。'
  } catch (error) {
    if (user.activeDeptId !== submittingDeptId) return
    if (error instanceof ApiBusinessError && ['10220', '10201'].includes(error.code)) {
      pendingSpotAction.value = undefined
      await loadSpots(pending.spotNo)
      operationError.value = error.code === '10220' ? '图斑状态已变化，列表已刷新，请按最新状态操作。' : '图斑已不存在，列表已刷新。'
    } else {
      spotActionError.value = error instanceof ApiBusinessError && error.code === '10107'
        ? '当前账号无权处理该图斑，请联系管理员。'
        : error instanceof Error ? error.message : '图斑处理失败，请稍后重试。'
    }
  } finally {
    spotActionBusy.value = false
  }
}
function toggleSelection(item: ReviewSpot) {
  operationError.value = ''
  if (selectedIds.value.includes(item.id)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== item.id)
    return
  }
  if (!canSelect(item)) {
    operationError.value = '批量创建任务要求所选图斑属于同一场景、同一部门。'
    return
  }
  selectedIds.value = [...selectedIds.value, item.id]
}

function mergeMapServices(...groups: MapServiceItem[][]) {
  const services = new Map<string, MapServiceItem>()
  groups.flat().forEach((service) => services.set(String(service.id || service.serviceUrl), service))
  return [...services.values()]
}

function taskMapServices(task: GovernanceTask) {
  return mergeMapServices((task.comparisonImages || []).flatMap((image) => image.mapService ? [image.mapService] : []))
}

async function loadAllRecognitionSpots(deptId?: string) {
  const first = await getRecognitionSpotPage({ deptId, pageNum: 1, pageSize: 200 })
  const all = [...first.records]
  const pageCount = Math.ceil(first.total / Math.max(first.records.length || first.pageSize || 200, 1))
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
    const page = await getRecognitionSpotPage({ deptId, pageNum, pageSize: 200 })
    all.push(...page.records)
  }
  return all
}

async function loadAllTasks(deptId?: string) {
  const first = await getGovernanceTaskPage({ deptId, pageNum: 1, pageSize: 100 })
  const all = [...first.records]
  const pageCount = Math.ceil(first.total / Math.max(first.pageSize || 100, 1))
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
    const page = await getGovernanceTaskPage({ deptId, pageNum, pageSize: 100 })
    all.push(...page.records)
  }
  return all
}

async function loadTaskSpots(task: GovernanceTask): Promise<ReviewSpot[]> {
  const first = await getTaskAbnormalPage({ bizTaskId: task.id, pageNum: 1, pageSize: 200 })
  const all = [...first.records]
  const pageCount = Math.ceil(first.total / Math.max(first.pageSize || 200, 1))
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
    const page = await getTaskAbnormalPage({ bizTaskId: task.id, pageNum, pageSize: 200 })
    all.push(...page.records)
  }
  const services = taskMapServices(task)
  return all.map((item) => ({
    id: item.id,
    spotNo: item.spotNo || String(item.id),
    spotSource: item.spotSource || 'TASK_ABNORMAL',
    mapServices: services,
    sceneCode: item.sceneCode || task.sceneCode,
    deptId: task.deptId,
    abnormalType: item.abnormalType,
    abnormalTypeDesc: item.abnormalTypeDesc,
    title: item.title,
    description: item.description,
    area: item.area,
    longitude: item.longitude,
    latitude: item.latitude,
    handleStatus: item.handleStatus,
    boundaryGeoJson: item.boundaryGeoJson,
    foundTime: item.foundTime,
    createTime: item.createTime,
    updateTime: item.updateTime,
    sourceTaskId: task.id,
    sourceTaskName: task.name,
    sourceDeptName: task.deptName,
    sourceSceneName: task.sceneName,
  }))
}

let spotLoadVersion = 0
async function loadSpots(preferredSpotNo?: string) {
  const version = ++spotLoadVersion
  const deptId = user.activeDeptId
  loading.value = true
  loadError.value = ''
  try {
    const [recognitionSpots, tasks, sceneList] = await Promise.all([
      loadAllRecognitionSpots(deptId),
      loadAllTasks(deptId),
      getSceneDictionary(user.organization.scenes, deptId),
    ])
    if (version !== spotLoadVersion) return
    scenes.value = sceneList.filter((scene) => scene.enabled)
    const taskSpotResults = await Promise.allSettled(tasks.map(loadTaskSpots))
    if (version !== spotLoadVersion) return
    const taskSpots = taskSpotResults.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    const recognitionById = new Map(recognitionSpots.map((item) => [item.id, item]))
    const merged = new Map<string, ReviewSpot>()
    taskSpots.forEach((item) => {
      const existing = merged.get(item.id)
      const derivedTaskId = recognitionById.get(item.id)?.taskId
      if (!existing || item.sourceTaskId === derivedTaskId || existing.sourceTaskId !== derivedTaskId) merged.set(item.id, item)
    })
    recognitionSpots.forEach((item) => {
      const existing = merged.get(item.id)
      merged.set(item.id, {
        ...existing,
        ...item,
        fromRecognitionApi: true,
        mapServices: mergeMapServices(existing?.mapServices || [], item.mapServices),
        sourceTaskId: existing?.sourceTaskId,
        sourceTaskName: existing?.sourceTaskName,
        sourceDeptName: existing?.sourceDeptName,
        sourceSceneName: existing?.sourceSceneName,
        derivedTaskId: item.taskId,
      })
    })
    const all = [...merged.values()].sort((left, right) => (right.foundTime || right.createTime || '').localeCompare(left.foundTime || left.createTime || ''))
    records.value = all
    activeId.value = all.find((item) => item.spotNo === preferredSpotNo)?.id
      || (all.some((item) => item.id === activeId.value) ? activeId.value : all[0]?.id || '')
    selectedIds.value = selectedIds.value.filter((id) => all.some((item) => item.id === id && item.handleStatus === 0 && !item.derivedTaskId))
  } catch (error) {
    if (version !== spotLoadVersion) return
    records.value = []
    loadError.value = error instanceof Error ? error.message : '疑似异常图斑加载失败。'
  } finally {
    if (version === spotLoadVersion) loading.value = false
  }
}

function openTaskCreateDialog() {
  if (user.currentUser?.role !== 'ADMIN') {
    operationError.value = '只有管理员可以创建任务。'
    return
  }
  if (!selected.value.length) return
  taskPriority.value = 1
  taskNames.value = Object.fromEntries(selected.value.map((spot) => [spot.id, defaultTaskName(spot)]))
  taskCreateError.value = ''
  taskCreateVisible.value = true
  departmentOptionsLoading.value = true
  departmentOptionsError.value = false
  void getDepartmentOptions()
    .then((options) => { departmentOptions.value = options })
    .catch(() => { departmentOptionsError.value = true })
    .finally(() => { departmentOptionsLoading.value = false })
}

function defaultTaskName(spot: ReviewSpot) {
  const subject = spot.title.trim() || spot.abnormalTypeDesc.trim() || '异常图斑'
  return (subject.endsWith('核查') ? subject : `${subject}核查`).slice(0, 200)
}

async function matchCreatedTasksToSpots(tasks: GovernanceTask[], spotIds: string[]) {
  if (tasks.length !== spotIds.length) throw new Error(`后端返回 ${tasks.length} 个任务，与所选 ${spotIds.length} 处图斑数量不一致`)
  const selectedIdSet = new Set(spotIds)
  const taskBySpotId = new Map<string, GovernanceTask>()
  for (const task of tasks) {
    let spotId = task.sourceAbnormalId
    if (!spotId || !selectedIdSet.has(spotId)) {
      const page = await getTaskAbnormalPage({
        deptId: task.deptId || user.activeDeptId,
        bizTaskId: task.id,
        pageNum: 1,
        pageSize: 200,
      })
      const linkedIds = page.records.filter((spot) => selectedIdSet.has(spot.id)).map((spot) => spot.id)
      if (linkedIds.length !== 1) throw new Error(`任务 ${task.id} 未能唯一匹配来源图斑`)
      spotId = linkedIds[0]
    }
    if (!spotId || taskBySpotId.has(spotId)) throw new Error(`任务 ${task.id} 的来源图斑关联重复或缺失`)
    taskBySpotId.set(spotId, task)
  }
  if (spotIds.some((id) => !taskBySpotId.has(id))) throw new Error('部分图斑未找到对应的新任务')
  return taskBySpotId
}

async function createSelectedTasks() {
  if (user.currentUser?.role !== 'ADMIN') {
    taskCreateError.value = '只有管理员可以创建任务。'
    return
  }
  if (!selected.value.length || creatingTasks.value) return
  const selectedSpots = [...selected.value]
  const requestedNames = new Map(selectedSpots.map((spot) => [spot.id, (taskNames.value[spot.id] || '').trim()]))
  const invalidSpot = selectedSpots.find((spot) => !requestedNames.get(spot.id) || requestedNames.get(spot.id)!.length > 200)
  if (invalidSpot) {
    taskCreateError.value = `请为图斑“${invalidSpot.title}”填写不超过 200 字的任务名称。`
    return
  }
  creatingTasks.value = true
  operationError.value = ''
  operationMessage.value = ''
  taskCreateError.value = ''
  const createdIds = selectedSpots.map((spot) => spot.id)
  let createdTasks: GovernanceTask[] = []
  let createAcknowledged = false
  try {
    const reviewerId = selectedSpots.some(spot => isNonGrainScene(spot.sceneCode)) ? await getNonGrainReviewerId(selectedSpots[0]?.deptId || user.activeDeptId) : undefined
    const tasks = await createTasksFromAbnormals({
      deptId: selectedSpots[0]?.deptId || user.activeDeptId,
      abnormalIds: createdIds,
      merge: false,
      priority: taskPriority.value,
      startFlow: false,
    })
    createAcknowledged = true
    createdTasks = tasks
    const issues: string[] = []
    try {
      const taskBySpotId = await matchCreatedTasksToSpots(tasks, createdIds)
      for (const spot of selectedSpots) {
        const task = taskBySpotId.get(spot.id)!
        const name = requestedNames.get(spot.id)!
        if (task.name === name) continue
        try { await updateGovernanceTask({ id: task.id, deptId: task.deptId || user.activeDeptId, name }) }
        catch (error) {
          const reason = error instanceof Error ? error.message : '接口更新失败'
          issues.push(`图斑“${spot.title}”的任务 ${task.id} 改名失败：${reason}`)
        }
      }
    } catch (error) {
      issues.push(`任务名称未能安全匹配图斑：${error instanceof Error ? error.message : '关联信息读取失败'}`)
    }
    if (reviewerId) {
      for (const task of tasks.filter(task => isNonGrainScene(task.sceneCode))) {
        const deptId = task.deptId || user.activeDeptId
        if (!deptId) { issues.push(`任务 ${task.id} 未返回处理部门，无法启动工作流`); continue }
        try { await assignNonGrainReview(task.id, deptId, reviewerId) }
        catch (error) { issues.push(`任务 ${task.id} 工作流分派失败：${error instanceof Error ? error.message : '接口分派失败'}`) }
      }
    }
    if (issues.length) operationError.value = `已创建 ${tasks.length} 个核查任务，但${issues.join('；')}。请到任务列表核对，勿重复创建。`
    else operationMessage.value = `已创建 ${tasks.length} 个核查任务并保存名称，图斑已从原任务移出。`
  } catch (error) {
    const message = error instanceof Error ? error.message : '核查任务创建失败。'
    if (createAcknowledged) operationError.value = `任务已创建（ID：${createdTasks.map(task => task.id).join('、') || '接口未返回'}），但后续处理未完成：${message}。请到任务列表核对，勿重复创建。`
    else taskCreateError.value = message
  } finally {
    if (createAcknowledged) {
      // 创建请求已成功后无论改名或分派结果如何，都不能再次提交同一批图斑。
      records.value = records.value.filter((item) => !createdIds.includes(item.id))
      selectedIds.value = []
      taskCreateVisible.value = false
      taskNames.value = {}
      window.dispatchEvent(new CustomEvent('abnormal-tasks-created', { detail: { abnormalIds: createdIds } }))
      await loadSpots()
    }
    creatingTasks.value = false
  }
}

watch(filtered, (items) => {
  if (!items.some((item) => item.id === activeId.value)) activeId.value = items[0]?.id || ''
})
watch(activeId, () => {
  activeImageIndex.value = 0
  periods.value = displayableImagery.value.length >= 2 ? 2 : 1
})
watch(() => displayableImagery.value.length, (count) => {
  periods.value = count >= 2 ? 2 : 1
  activeImageIndex.value = Math.min(activeImageIndex.value, Math.max(0, count - 1))
}, { immediate: true })
onMounted(() => {
  window.addEventListener('keydown', handleMapFullscreenKeydown)
})
watch(() => user.activeDeptId, () => {
  selectedIds.value = []
  pendingSpotAction.value = undefined
  operationMessage.value = ''
  operationError.value = ''
  void loadSpots()
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', handleMapFullscreenKeydown))
</script>

<template>
  <div class="general-review">
    <section class="stat-grid">
      <article><span>疑似图斑总数</span><b>{{ visibleRecords.length }}</b><small>不区分场景与来源任务</small></article>
      <article><span>待核查</span><b>{{ statusCounts[0]?.count || 0 }}</b><small>等待派生核查任务</small></article>
      <article><span>核查中</span><b>{{ statusCounts[1]?.count || 0 }}</b><small>已进入核查流程</small></article>
      <article><span>已完成处置</span><b>{{ (statusCounts[2]?.count || 0) + (statusCounts[3]?.count || 0) }}</b><small>已处置及已销号</small></article>
      <div class="heading-actions"><button :disabled="!selectedIds.length || creatingTasks" @click="openTaskCreateDialog">{{ `勾选图斑创建任务（${selectedIds.length}）` }}</button></div>
    </section>

    <div v-if="operationMessage" class="operation-message success" role="status">{{ operationMessage }}</div>
    <div v-if="operationError" class="operation-message error" role="alert">{{ operationError }}<button type="button" aria-label="关闭提示" @click="operationError = ''">×</button></div>

    <section class="review-layout">
      <aside class="spot-list panel">
        <header><b>问题图斑列表</b><span>{{ filtered.length }} / {{ visibleRecords.length }} 处</span></header>
        <div class="filters"><input v-model="keyword" placeholder="搜索图斑编号、名称或类型" /><div><select v-model="typeFilter"><option value="">全部类型</option><option v-for="item in abnormalTypes" :key="item.value" :value="item.value">{{ item.label }}</option></select><select v-model="statusFilter"><option value="">全部状态</option><option v-for="item in statuses" :key="item.value" :value="item.value">{{ item.label }}</option></select></div></div>
        <div class="spot-scroll">
          <button v-for="(item,index) in filtered" :key="item.id" class="spot-row" :class="{ active: active?.id === item.id, checked: selectedIds.includes(item.id) }" @click="selectSpot(item.id)">
            <input type="checkbox" :checked="selectedIds.includes(item.id)" :disabled="!canSelect(item)" @click.stop="toggleSelection(item)" />
            <i>{{ index + 1 }}</i><span><b>{{ item.title }}</b><small>图斑 {{ item.spotNo }} · {{ item.abnormalTypeDesc }}</small><small v-if="item.sourceTaskName" class="source-task">来源任务：{{ item.sourceTaskName }}</small></span><em :class="`status-${item.handleStatus}`">{{ statusLabel(item.handleStatus) }}</em>
          </button>
          <div v-if="loading" class="empty">正在读取疑似图斑…</div><div v-else-if="loadError" class="empty error-text">{{ loadError }}</div><div v-else-if="!filtered.length" class="empty">暂无符合条件的疑似图斑</div>
        </div>
      </aside>

      <div class="center-column">
        <main class="comparison panel" :class="{ 'map-panel--fullscreen': mapFullscreen }">
          <header><b>问题图斑分布</b><div class="map-header-actions"><span v-if="active">当前：{{ active.title }}</span><button type="button" :aria-label="mapFullscreen ? '退出问题图斑分布全屏' : '全屏展示问题图斑分布'" @click="toggleMapFullscreen">{{ mapFullscreen ? '退出全屏' : '全屏展示' }}</button></div></header>
          <div class="map-grid" :class="`compare-${periods}`">
            <SpotDistributionMap v-for="period in comparisonPeriods" :key="`${active?.id}-${periods}-${period.number}-${period.mapService?.id || 'empty'}`" :spot="activeAsTaskAbnormal" :period="period" :synchronized-view="synchronizedMapView" @view-change="synchronizedMapView = $event" />
          </div>
        </main>

        <section class="analysis panel">
          <header><b>多期影像 / 变化分析 <small class="analysis-title-hint">（点选下方影像可切换当前显示的起始期次）</small></b></header>
          <div class="period-bar">
            <div><button v-for="count in [1, 2, 3, 4]" :key="count" :class="{ active: periods === count }" :disabled="count > displayableImagery.length" :title="count > displayableImagery.length ? `当前图斑仅有 ${displayableImagery.length} 期影像` : `显示 ${count} 期影像`" @click="selectPeriods(count)">{{ count }} 期影像</button></div>
            <span>当前对比：{{ active?.title || '未选择图斑' }}</span>
          </div>
          <div class="imagery-list">
            <button v-for="(service, index) in displayableImagery" :key="service.id" class="image-card" :class="{ active: activeImageIndex === index, displayed: isImageDisplayed(index) }" @click="selectImage(index)">
              <SpotDistributionMap v-if="activeAsTaskAbnormal" class="image-card-map" :spot="activeAsTaskAbnormal" :period="imageryThumbnailPeriod(service, index)" thumbnail />
              <b>第 {{ index + 1 }} 期影像</b><small>{{ service.name }}</small>
            </button>
            <div v-if="!displayableImagery.length" class="imagery-empty">该图斑暂未关联多期影像服务</div>
          </div>
        </section>
      </div>

      <aside class="right-column">
        <section class="spot-action-card panel" aria-label="图斑审核与处置">
          <header><b>图斑操作</b><span v-if="active">{{ statusLabel(active.handleStatus) }}</span></header>
          <div class="spot-action-card__body">
            <div v-if="active && canOperateSpot(active, 'ignore')" class="spot-action-card__buttons">
              <button class="spot-action-button spot-action-button--ignore" type="button" @click="openSpotAction('ignore')">忽略图斑</button>
              <button class="spot-action-button spot-action-button--revoke" type="button" @click="openSpotAction('revoke')">撤销图斑</button>
            </div>
            <p v-else-if="active?.derivedTaskId" class="spot-action-card__hint">已关联核查任务，请在任务流程中处理</p>
            <p v-else-if="active?.handleStatus === 4" class="spot-action-card__hint">已忽略 · 记录保留，不再派单</p>
            <p v-else-if="active && !active.fromRecognitionApi" class="spot-action-card__hint">该图斑未纳入识别图斑审核流程</p>
            <p v-else-if="active" class="spot-action-card__hint">当前状态无需审核或处置</p>
            <p v-else class="spot-action-card__hint">请选择左侧图斑</p>
          </div>
        </section>
        <section class="spot-detail panel">
          <header><b>异常图斑详细信息</b></header>
          <template v-if="active"><dl><div><dt>图斑编号</dt><dd>{{ active.spotNo }}</dd></div><div><dt>异常类型</dt><dd>{{ active.abnormalTypeDesc }}</dd></div><div><dt>处置状态</dt><dd>{{ statusLabel(active.handleStatus) }}</dd></div><div><dt>所属场景</dt><dd>{{ activeSceneName }}</dd></div><div><dt>面积</dt><dd>{{ active.area === undefined ? '-' : `${active.area} ㎡` }}</dd></div><div><dt>发现时间</dt><dd>{{ formatTime(active.foundTime) }}</dd></div><div><dt>关联影像</dt><dd>{{ displayableImagery.length }} 期</dd></div><div><dt>来源任务</dt><dd>{{ active.sourceTaskName || '通用识别图斑' }}</dd></div></dl><p>{{ active.description || '暂无异常图斑描述。' }}</p></template>
          <div v-else class="empty">请选择问题图斑</div>
        </section>
      </aside>
    </section>

    <div v-if="taskCreateVisible" class="dialog-mask" @click.self="!creatingTasks && (taskCreateVisible = false)">
      <section class="task-create-dialog">
        <header>
          <div><b>创建核查任务</b><small>系统将按“一图斑一任务”生成 {{ selected.length }} 个核查任务</small></div>
          <button :disabled="creatingTasks" aria-label="关闭" @click="taskCreateVisible = false">×</button>
        </header>
        <div class="task-dialog-body">
          <div class="create-summary">
            <article><span>已选图斑</span><strong>{{ selected.length }}</strong><small>处</small></article>
            <article><span>所属场景 · 由图斑确定</span><strong class="text-value" :title="selectedSceneName">{{ selectedSceneName }}</strong></article>
            <article><span>执行部门 · 由图斑确定</span><strong class="text-value" :title="selectedDeptName">{{ selectedDeptName }}</strong></article>
          </div>
          <section class="selected-spot-box">
            <div class="section-title"><b>任务来源图斑</b><span>每处图斑可单独设置任务名称</span></div>
            <div class="selected-spot-list">
              <article v-for="(item, index) in selected" :key="item.id">
                <i>{{ index + 1 }}</i><div><b>{{ item.title }}</b><small>{{ item.spotNo }} · {{ item.abnormalTypeDesc }}<template v-if="item.sourceTaskName"> · 原任务：{{ item.sourceTaskName }}</template></small><label class="task-name-field">任务名称<input v-model="taskNames[item.id]" type="text" :aria-label="`图斑 ${item.spotNo} 的任务名称`" maxlength="200" placeholder="请输入核查任务名称" :disabled="creatingTasks" /></label></div><em>{{ statusLabel(item.handleStatus) }}</em>
              </article>
            </div>
          </section>
          <section class="priority-section">
            <div><b>任务优先级</b><small>将应用到本次创建的全部任务</small></div>
            <div class="priority-options"><button v-for="item in [{ value: 0, label: '低' }, { value: 1, label: '中' }, { value: 2, label: '高' }]" :key="item.value" :class="{ active: taskPriority === item.value }" @click="taskPriority = item.value">{{ item.label }}</button></div>
          </section>
          <div class="create-tip"><b>创建规则</b><span>当前后端固定按“一图斑一任务”创建；场景与执行部门继承所选图斑。任务生成后将按来源图斑保存上方填写的名称。</span></div>
          <p v-if="taskCreateError" class="dialog-error">{{ taskCreateError }}</p>
        </div>
        <footer><button class="cancel" :disabled="creatingTasks" @click="taskCreateVisible = false">取消</button><button :disabled="creatingTasks" @click="createSelectedTasks">{{ creatingTasks ? '正在创建任务…' : `确认创建 ${selected.length} 个任务` }}</button></footer>
      </section>
    </div>

    <div v-if="pendingSpotAction && pendingSpotActionCopy" class="dialog-mask" @click.self="closeSpotAction">
      <section class="spot-action-dialog" :class="`spot-action-dialog--${pendingSpotAction.kind}`" role="alertdialog" aria-modal="true" aria-labelledby="spot-action-title">
        <header>
          <span class="spot-action-dialog__marker">{{ pendingSpotAction.kind === 'ignore' ? '–' : '!' }}</span>
          <div><small>图斑审核与处置</small><h2 id="spot-action-title">{{ pendingSpotActionCopy.title }}</h2></div>
          <button type="button" aria-label="关闭" :disabled="spotActionBusy" @click="closeSpotAction">×</button>
        </header>
        <div class="spot-action-dialog__body">
          <p>{{ pendingSpotActionCopy.description }}</p>
          <dl>
            <div><dt>图斑</dt><dd>{{ pendingSpotAction.title }}</dd></div>
            <div><dt>编号</dt><dd>{{ pendingSpotAction.spotNo }}</dd></div>
            <div><dt>当前状态</dt><dd>{{ statusLabel(pendingSpotAction.handleStatus) }}</dd></div>
          </dl>
          <label v-if="pendingSpotAction.kind === 'revoke'" class="spot-action-dialog__acknowledge"><input v-model="revokeAcknowledged" type="checkbox" :disabled="spotActionBusy" /><span>我已了解：撤销会清理图斑边界与影像关联，且不可恢复。</span></label>
          <p v-if="spotActionError" class="spot-action-dialog__error" role="alert">{{ spotActionError }}</p>
        </div>
        <footer><button type="button" class="spot-action-dialog__cancel" :disabled="spotActionBusy" @click="closeSpotAction">返回</button><button type="button" class="spot-action-dialog__confirm" :disabled="spotActionBusy || (pendingSpotAction.kind === 'revoke' && !revokeAcknowledged)" @click="submitSpotAction">{{ spotActionBusy ? '正在处理…' : pendingSpotActionCopy.confirm }}</button></footer>
      </section>
    </div>

  </div>
</template>

<style scoped lang="scss">
.general-review{height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:16px;background:#edf3f7;color:#183d53}.page-heading{display:flex;align-items:center;justify-content:space-between}.page-heading h1{margin:0;font-size:25px}.page-heading p{margin:4px 0 0;color:#77909d;font-size:12px}.heading-actions{display:flex;gap:10px}.heading-actions button,.upload-dialog footer button,.task-create-dialog footer button{height:38px;padding:0 16px;border:1px solid #168aa9;border-radius:4px;color:#fff;background:#168eae;font-weight:700;cursor:pointer}.heading-actions button.secondary{color:#467080;background:#fff;border-color:#bfd5df}.heading-actions button:disabled,.upload-dialog footer button:disabled,.task-create-dialog button:disabled{opacity:.45;cursor:not-allowed}.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat-grid article{min-height:76px;padding:13px 16px;background:#fff;border:1px solid #d3e0e7;border-radius:6px;box-shadow:0 2px 7px #153c5010}.stat-grid span,.stat-grid small{display:block;color:#718a97;font-size:11px}.stat-grid b{display:inline-block;margin:5px 0 2px;color:#183e56;font-size:25px}.operation-message{padding:8px 12px;border-radius:4px;font-size:12px}.operation-message.success{color:#147254;background:#def4eb}.operation-message.error{color:#b63d4b;background:#ffecef}.review-layout{flex:1;min-height:0;display:grid;grid-template-columns:350px minmax(500px,1fr) 300px;gap:12px}.panel{min-height:0;background:#fff;border:1px solid #ccdce4;border-radius:6px;overflow:hidden}.panel>header{height:48px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #d6e3e9}.panel>header b{font-size:16px}.panel>header span{color:#718997;font-size:11px}.spot-list{display:flex;flex-direction:column}.filters{display:grid;gap:8px;padding:12px}.filters input,.filters select,.upload-form input,.upload-form select,.upload-form textarea{width:100%;box-sizing:border-box;border:1px solid #c4d7e0;border-radius:4px;color:#365768;background:#fff;outline:none}.filters input{height:36px;padding:0 10px}.filters>div{display:grid;grid-template-columns:1fr 1fr;gap:8px}.filters select{height:34px;padding:0 8px}.classification{display:flex;gap:5px;overflow:auto;padding:0 12px 10px}.classification button,.comparison footer button{flex:none;padding:5px 8px;color:#557381;background:#f4f8fa;border:1px solid #d1e0e7;border-radius:4px;font-size:10px;cursor:pointer}.classification button.active,.comparison footer button.active{color:#fff;background:#168dab;border-color:#168dab}.spot-scroll{flex:1;min-height:0;overflow:auto}.spot-row{width:100%;min-height:70px;display:grid;grid-template-columns:18px 34px minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px 11px;color:#244b60;background:#fff;border:0;border-top:1px solid #e3ebef;text-align:left;cursor:pointer}.spot-row:hover,.spot-row.active{background:#e5f4f8}.spot-row.active{box-shadow:inset 4px 0 #1598bb}.spot-row.checked{background:#e9f8f2}.spot-row>i{width:32px;height:32px;display:grid;place-items:center;color:#fff;background:#3596b4;border-radius:50%;font-style:normal;font-weight:700}.spot-row span,.spot-row b,.spot-row small{display:block;min-width:0}.spot-row b,.spot-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.spot-row b{font-size:13px}.spot-row small{margin-top:5px;color:#718b98;font-size:10px}.spot-row small.source-task{margin-top:2px;color:#3790a8}.spot-row em{padding:4px 7px;color:#99680c;background:#fff2cf;border-radius:4px;font-size:10px;font-style:normal}.spot-row em.status-1{color:#19718b;background:#dcf2f8}.spot-row em.status-2,.spot-row em.status-3{color:#177054;background:#dcf3e9}.comparison{display:grid;grid-template-rows:48px minmax(0,1fr) 66px}.map-grid{min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:5px;background:#dbe5ea}.comparison footer{display:flex;align-items:center;justify-content:space-between;padding:0 13px;border-top:1px solid #d7e4ea}.comparison footer>div{display:flex;gap:5px}.spot-detail{display:flex;flex-direction:column}.spot-detail dl{margin:0;padding:0 14px}.spot-detail dl div{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #e5ecef;font-size:12px}.spot-detail dt{color:#78909c}.spot-detail dd{max-width:65%;margin:0;color:#294d60;font-weight:700;text-align:right;word-break:break-all}.spot-detail>p{margin:14px;padding:11px;color:#647d89;background:#f2f6f8;font-size:12px;line-height:1.6}.empty{min-height:100px;display:grid;place-items:center;color:#8297a2;font-size:12px}.error-text{color:#b84450}.dialog-mask{position:fixed;z-index:3000;inset:0;display:grid;place-items:center;background:#071b2cb8;backdrop-filter:blur(3px)}.upload-dialog{width:min(720px,calc(100vw - 36px));max-height:calc(100vh - 50px);overflow:auto;background:#fff;border-radius:8px;box-shadow:0 20px 60px #001d2e66}.upload-dialog>header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #d7e4ea}.upload-dialog>header b,.upload-dialog>header small{display:block}.upload-dialog>header b{font-size:19px}.upload-dialog>header small{margin-top:4px;color:#7d929d;font-size:11px}.upload-dialog>header button{border:0;background:transparent;color:#627c89;font-size:25px;cursor:pointer}.upload-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px 20px}.upload-form>label{display:flex;flex-direction:column;gap:6px}.upload-form span,.upload-form legend{color:#536f7d;font-size:12px;font-weight:700}.upload-form input,.upload-form select{height:36px;padding:0 9px}.upload-form input[type=file]{padding:6px}.upload-form textarea{height:70px;padding:9px;resize:vertical}.upload-form .wide,.dialog-error{grid-column:1/-1}.upload-form small{color:#7a929e;font-size:10px}.upload-form fieldset{display:flex;flex-wrap:wrap;gap:8px 16px;margin:0;padding:10px 12px;border:1px solid #cbdde5;border-radius:5px}.upload-form fieldset label{display:flex;align-items:center;gap:5px;font-size:12px}.upload-form fieldset input{width:auto;height:auto}.dialog-error{margin:0;padding:8px;color:#b63f4d;background:#ffedf0;font-size:12px}.upload-dialog>footer{display:flex;justify-content:flex-end;gap:9px;padding:13px 20px;border-top:1px solid #d7e4ea}.upload-dialog footer button.cancel,.task-create-dialog footer button.cancel{color:#587786;background:#fff;border-color:#bfd4de}.task-create-dialog{width:min(760px,calc(100vw - 36px));overflow:hidden;background:#f7fafb;border:1px solid #b7d2dd;border-radius:12px;box-shadow:0 24px 80px #001d2e80}.task-create-dialog>header{display:grid;grid-template-columns:46px minmax(0,1fr) 32px;align-items:center;gap:13px;padding:20px 24px;color:#fff;background:linear-gradient(125deg,#0f718f,#159db3)}.task-create-dialog>header b,.task-create-dialog>header small{display:block}.task-create-dialog>header b{font-size:20px}.task-create-dialog>header small{margin-top:5px;color:#d7f5fb;font-size:12px}.task-create-dialog>header>button{border:0;color:#dff7fa;background:transparent;font-size:28px;cursor:pointer}.task-dialog-icon{width:44px;height:44px;display:grid;place-items:center;border:1px solid #ffffff66;border-radius:12px;background:#ffffff20;font-size:20px;font-weight:800}.task-dialog-body{display:grid;gap:14px;padding:20px 24px}.create-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.create-summary article{min-width:0;padding:12px 14px;background:#fff;border:1px solid #d4e3e9;border-radius:7px}.create-summary span,.create-summary small{color:#748d99;font-size:11px}.create-summary strong{margin:0 4px;color:#168aa7;font-size:24px}.create-summary strong.text-value{display:block;overflow:hidden;margin:5px 0 0;color:#264e62;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.selected-spot-box{overflow:hidden;background:#fff;border:1px solid #d4e3e9;border-radius:7px}.section-title{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #e2ebef}.section-title b{font-size:13px}.section-title span{color:#6d8794;font-size:11px}.selected-spot-list{max-height:210px;overflow:auto}.selected-spot-list article{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #edf2f4}.selected-spot-list article:last-child{border-bottom:0}.selected-spot-list i{width:28px;height:28px;display:grid;place-items:center;color:#fff;background:#3298b2;border-radius:50%;font-size:11px;font-style:normal;font-weight:700}.selected-spot-list b,.selected-spot-list small{display:block}.selected-spot-list b{font-size:12px}.selected-spot-list small{overflow:hidden;margin-top:3px;color:#7a919c;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.selected-spot-list em{padding:4px 8px;color:#9a6a0c;background:#fff2cf;border-radius:4px;font-size:10px;font-style:normal}.priority-section{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;background:#fff;border:1px solid #d4e3e9;border-radius:7px}.priority-section b,.priority-section small{display:block}.priority-section b{font-size:13px}.priority-section small{margin-top:3px;color:#7b919b;font-size:10px}.priority-options{display:flex;gap:6px}.priority-options button{width:58px;height:32px;color:#53717f;background:#f6f9fa;border:1px solid #c9dae1;border-radius:5px;cursor:pointer}.priority-options button.active{color:#fff;background:#168fab;border-color:#168fab;box-shadow:0 4px 10px #168fab2e}.create-tip{display:flex;gap:10px;padding:10px 12px;color:#527181;background:#eaf5f8;border-left:3px solid #20a1bd;border-radius:4px;font-size:11px}.create-tip b{flex:none;color:#1d7187}.task-create-dialog>footer{display:flex;justify-content:flex-end;gap:9px;padding:14px 24px;background:#fff;border-top:1px solid #d7e4ea}@media(max-width:1350px){.review-layout{grid-template-columns:310px minmax(430px,1fr) 260px}.general-review{padding:10px}.spot-detail dl div{padding:9px 0}}@media(max-width:1050px){.review-layout{grid-template-columns:300px 1fr}.spot-detail{display:none}.stat-grid{grid-template-columns:repeat(2,1fr)}}
.spot-row em.status--1 { color: #9a6a0c; background: #fff2cf; }
.operation-message {
  position: fixed;
  top: 82px;
  left: 50%;
  z-index: 3200;
  width: max-content;
  min-width: 220px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 11px 40px;
  transform: translateX(-50%);
  border: 1px solid;
  border-radius: 4px;
  box-shadow: 0 10px 30px #00131faa;
  color: #fff;
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  overflow-wrap: anywhere;
}
.operation-message.success { background: #167b6a; border-color: #42c9a8; color: #fff; }
.operation-message.error { background: #8e3544; border-color: #e26d7b; color: #fff; }
.operation-message button {
  position: absolute;
  top: 4px;
  right: 7px;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
}
</style>

<style scoped lang="scss">
/* The detail ends with the map; the imagery strip fills both columns beneath them. */
.review-layout {
  grid-template-columns: 350px minmax(500px, 1fr) 300px;
  grid-template-rows: minmax(310px, 1fr) 230px;
}

.spot-list {
  grid-column: 1;
  grid-row: 1 / 3;
}

.comparison {
  grid-column: 2;
  grid-row: 1;
}

.analysis {
  grid-column: 2 / 4;
  grid-row: 2;
}

.right-column {
  grid-column: 3;
  grid-row: 1;
}

.center-column {
  min-width: 0;
  min-height: 0;
  display: contents;
}

@media (max-width: 1350px) {
  .review-layout {
    grid-template-columns: 310px minmax(430px, 1fr) 260px;
    grid-template-rows: minmax(280px, 1fr) 215px;
  }
}

@media (max-width: 1050px) {
  .review-layout {
    grid-template-columns: 300px minmax(0, 1fr);
    grid-template-rows: minmax(280px, 1fr) 215px auto;
  }

  .analysis {
    grid-column: 2;
  }

  .right-column {
    grid-column: 1 / -1;
    grid-row: 3;
  }

  .right-column .spot-detail {
    display: none;
  }
}

.general-review {
  gap: 6px;
  padding-top: 10px;
}

.stat-grid {
  grid-template-columns: repeat(4, minmax(135px, 1fr)) auto;
  gap: 9px;
}

.stat-grid article {
  min-height: 72px;
  box-sizing: border-box;
  padding: 10px 14px;
}

.stat-grid b {
  margin: 4px 0 2px;
  font-size: 25px;
  line-height: 1.05;
}

.stat-grid span,
.stat-grid small {
  font-size: 12px;
  line-height: 1.3;
}

.stat-grid .heading-actions {
  align-self: stretch;
  display: flex;
  align-items: stretch;
  padding-left: 4px;
}

.stat-grid .heading-actions button {
  min-height: 72px;
  height: auto;
  box-sizing: border-box;
  padding-inline: 13px;
  white-space: nowrap;
}

.right-column {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.right-column > .panel {
  min-height: 0;
}

.right-column .spot-detail {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.comparison {
  min-height: 0;
  grid-template-rows: 48px minmax(0, 1fr);
}

.map-header-actions {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.map-header-actions > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-header-actions > button {
  flex: none;
  height: 30px;
  padding: 0 11px;
  color: #167895;
  background: #f3fafc;
  border: 1px solid #8fc8d8;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.map-header-actions > button:hover,
.map-header-actions > button:focus-visible {
  color: #fff;
  background: #137f9e;
  border-color: #137f9e;
  outline: none;
}

.comparison.map-panel--fullscreen {
  position: fixed;
  z-index: 4000;
  inset: 0;
  grid-template-rows: 54px minmax(0, 1fr);
  border: 0;
  border-radius: 0;
  background: #dbe5ea;
  box-shadow: none;
}

.comparison.map-panel--fullscreen > header {
  height: 54px;
  padding-inline: 18px;
  color: #eafaff;
  background: #07344f;
  border-color: #1e6684;
}

.comparison.map-panel--fullscreen > header b {
  color: #fff;
  font-size: 18px;
}

.comparison.map-panel--fullscreen .map-header-actions > span {
  color: #b4d7e5;
  font-size: 13px;
}

.comparison.map-panel--fullscreen .map-header-actions > button {
  color: #fff;
  background: #126f91;
  border-color: #6ed8eb;
}

.map-grid.compare-1 {
  grid-template-columns: 1fr;
}

.map-grid.compare-3,
.map-grid.compare-4 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.analysis {
  display: grid;
  grid-template-rows: 48px 42px minmax(0, 1fr);
}

.analysis > header {
  height: 48px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid #d6e3e9;
}

.analysis > header b {
  font-size: 16px;
}

.analysis > header span {
  color: #718997;
  font-size: 11px;
}

.period-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 12px;
  border-bottom: 1px solid #e2eaee;
}

.period-bar > div {
  display: flex;
  align-items: center;
  gap: 6px;
}

.period-bar button {
  height: 28px;
  padding: 0 10px;
  color: #527280;
  background: #f4f8fa;
  border: 1px solid #cedee5;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.period-bar button.active {
  color: #fff;
  background: #168dab;
  border-color: #168dab;
}

.period-bar button:disabled {
  color: #9eacb3;
  background: #eef2f4;
  border-color: #dce4e8;
  box-shadow: none;
  cursor: not-allowed;
  opacity: .72;
}

.analysis-title-hint {
  margin-left: 4px;
  color: #718997;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.period-bar > span {
  overflow: hidden;
  color: #718997;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.imagery-list {
  min-width: 0;
  min-height: 0;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 11px 11px;
}

.image-card {
  position: relative;
  flex: 0 0 180px;
  height: 112px;
  min-width: 0;
  overflow: hidden;
  padding: 9px;
  color: #f4fcff;
  background: linear-gradient(135deg, #276c80, #17445b);
  border: 1px solid transparent;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
  transition: border-color .18s, box-shadow .18s;
}

.image-card:hover,
.image-card.active {
  border-color: #13a9d3;
  box-shadow: 0 0 0 2px #13a9d325;
}

.image-card.displayed {
  border-color: #ff4054;
  box-shadow: 0 0 4px #ff4054b8, inset 0 0 2px #ff8a9699;
}

.image-card-map {
  position: absolute;
  inset: 0;
  display: block;
  opacity: .82;
  pointer-events: none;
}

.image-card b,
.image-card small {
  position: relative;
  z-index: 1;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px #002030;
}

.image-card b {
  margin-top: 48px;
  font-size: 14px;
}

.image-card small {
  margin-top: 4px;
  font-size: 12px;
}

.imagery-empty {
  flex: 1;
  min-width: 220px;
  display: grid;
  place-items: center;
  color: #7c929d;
  background: #f4f8fa;
  border: 1px dashed #bfd3dc;
  border-radius: 6px;
  font-size: 12px;
}

@media (max-width: 1350px) {
  .stat-grid {
    grid-template-columns: repeat(4, minmax(110px, 1fr));
  }

  .stat-grid .heading-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
    padding: 0;
  }

}

@media (max-height: 900px) {
  .general-review {
    padding-block: 8px;
  }

  .right-column {
    min-height: 0;
  }

  .right-column .spot-detail dl div {
    padding-block: 8px;
  }

  .right-column .spot-detail > p {
    margin-block: 8px;
  }
}
.filters select:hover,.filters select:focus{color:#fff;background:#075273;border-color:#1599c1}.filters select option{color:#365768;background:#fff}
.filters input:focus::placeholder{color:transparent}
.upload-form select:hover,.upload-form select:focus{color:#fff;background-color:#075273;border-color:#1599c1}.upload-form select option{color:#365768;background:#fff}
.upload-file-field{min-width:0;display:flex;flex-direction:column;gap:6px}.upload-file-field>span{color:#536f7d;font-size:12px;font-weight:700}.file-picker{height:46px;box-sizing:border-box;display:grid;grid-template-columns:30px auto minmax(0,1fr);align-items:center;gap:9px;padding:0 12px;border:1px dashed #9ec7d7;border-radius:6px;background:#f5fbfd;cursor:pointer;transition:border-color .18s,background .18s,box-shadow .18s}.file-picker:hover,.file-picker:focus-within{border-color:#168ead;background:#eaf7fb;box-shadow:0 0 0 2px #168ead16}.file-picker.selected{border-style:solid;border-color:#74b9cb;background:#eff9f7}.file-picker__input{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0!important}.file-picker i{width:28px;height:28px;display:grid;place-items:center;color:#fff;background:#168fac;border-radius:50%;font-size:17px;font-style:normal;font-weight:800}.file-picker b{color:#176f89;font-size:13px;white-space:nowrap}.file-picker em{min-width:0;overflow:hidden;color:#78909c;font-size:12px;font-style:normal;text-align:right;text-overflow:ellipsis;white-space:nowrap}.file-picker.selected em{color:#24725f}.upload-form .file-picker__names{overflow:hidden;padding:5px 8px;color:#3f7485;background:#f2f7f9;border-radius:4px;font-size:10px;text-overflow:ellipsis;white-space:nowrap}

/* 核查任务弹窗：放大关键信息，正文保持舒适的阅读层级。 */
.task-create-dialog {
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
}
.task-create-dialog > header {
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 12px;
  padding: 19px 24px;
}
.task-create-dialog > header b { font-size: 22px; }
.task-create-dialog > header small { font-size: 14px; line-height: 1.4; }
.task-dialog-body {
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
}
.create-summary article { padding: 14px 15px; }
.create-summary span,
.create-summary small { font-size: 13px; }
.create-summary strong.text-value { font-size: 15px; line-height: 1.4; }
.section-title b,
.priority-section b { font-size: 15px; }
.section-title span,
.priority-section small { font-size: 13px; }
.selected-spot-list b { font-size: 14px; }
.selected-spot-list small { font-size: 12px; line-height: 1.4; }
.selected-spot-list em { font-size: 12px; }
.selected-spot-list i { font-size: 13px; }
.selected-spot-list { max-height: 280px; }
.selected-spot-list article { align-items: start; }
.selected-spot-list article > div { min-width: 0; }
.selected-spot-list article > i,
.selected-spot-list article > em { margin-top: 2px; }
.task-name-field { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; color: #536f7d; font-size: 12px; font-weight: 700; }
.task-name-field input { box-sizing: border-box; width: 100%; height: 37px; padding: 0 10px; border: 1px solid #c9dbe4; border-radius: 5px; outline: none; color: #294f63; background: #fafdfe; font-size: 13px; font-weight: 400; }
.task-name-field input:focus { border-color: #1696b7; box-shadow: 0 0 0 3px #159ac01a; }
.priority-options button { height: 36px; font-size: 14px; }
.create-tip { align-items: baseline; font-size: 13px; line-height: 1.55; }
.task-create-dialog > footer { flex: 0 0 auto; }
.task-create-dialog footer button { height: 40px; font-size: 14px; }
.task-create-dialog .dialog-error { font-size: 13px; line-height: 1.5; }

.spot-action-card {
  flex: 0 0 auto;
  min-width: 0;
  border-color: #c8e1e9;
  background: linear-gradient(130deg, #f6fcfe 0%, #fff 72%);
}
.spot-action-card > header {
  height: 37px;
  padding-inline: 11px;
  border-bottom-color: #e2edf1;
}
.spot-action-card > header b { color: #31566a; font-size: 13px; }
.spot-action-card > header span {
  padding: 3px 7px;
  border-radius: 999px;
  color: #8c651b;
  background: #fff2d3;
  font-size: 12px;
  white-space: nowrap;
}
.spot-action-card__body { padding: 9px 10px; }
.spot-action-card__buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(68px, 1fr));
  gap: 6px;
}
.spot-action-card__hint { margin: 2px 0; color: #758c99; font-size: 11px; line-height: 1.45; }
.spot-action-button {
  min-width: 0;
  height: 33px;
  padding: 0 5px;
  border: 1px solid #b9d2dc;
  border-radius: 5px;
  background: #fff;
  color: #3b6779;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: background .18s, border-color .18s, box-shadow .18s, transform .18s;
}
.spot-action-button:hover { transform: translateY(-1px); box-shadow: 0 3px 9px #18465b1c; }
.spot-action-button:focus-visible { outline: 2px solid #63c4db; outline-offset: 2px; }
.spot-action-button--review { color: #fff; background: #168dad; border-color: #168dad; }
.spot-action-button--review:hover { background: #0f7899; border-color: #0f7899; }
.spot-action-button--ignore:hover { color: #176f87; background: #edf8fa; border-color: #85bfce; }
.spot-action-button--revoke { color: #b06052; border-color: #ebc9c1; }
.spot-action-button--revoke:hover { color: #9d4239; background: #fff3f0; border-color: #d99a8f; }
.spot-row em.status-4 { color: #657d88; background: #eaf0f3; }

.spot-action-dialog {
  width: min(460px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid #c4dce5;
  border-radius: 11px;
  color: #25495c;
  background: #fff;
  box-shadow: 0 24px 70px #071c2b66;
}
.spot-action-dialog > header { display: flex; align-items: center; gap: 12px; padding: 18px 20px; background: linear-gradient(115deg, #f0f9fc, #fff); border-bottom: 1px solid #e0edf1; }
.spot-action-dialog__marker { width: 36px; height: 36px; display: grid; flex: none; place-items: center; border-radius: 9px; color: #fff; background: #168dad; font-size: 20px; font-weight: 800; }
.spot-action-dialog--ignore .spot-action-dialog__marker { background: #718d9a; }
.spot-action-dialog--revoke .spot-action-dialog__marker { background: #be6a55; }
.spot-action-dialog > header > div { flex: 1; min-width: 0; }
.spot-action-dialog > header small { color: #6f93a2; font-size: 11px; }
.spot-action-dialog h2 { margin: 2px 0 0; color: #21485a; font-size: 18px; }
.spot-action-dialog > header button { width: 30px; height: 30px; flex: none; border: 0; border-radius: 5px; color: #7892a0; background: #eaf2f5; font-size: 21px; cursor: pointer; }
.spot-action-dialog__body { padding: 18px 20px 20px; }
.spot-action-dialog__body > p:first-child { margin: 0 0 16px; color: #5b7684; font-size: 13px; line-height: 1.65; }
.spot-action-dialog dl { display: grid; gap: 8px; margin: 0; padding: 12px 14px; border: 1px solid #e3edf1; border-radius: 7px; background: #f8fbfc; }
.spot-action-dialog dl div { display: flex; justify-content: space-between; gap: 14px; font-size: 12px; }
.spot-action-dialog dt { flex: none; color: #8199a5; }
.spot-action-dialog dd { min-width: 0; overflow-wrap: anywhere; margin: 0; color: #335568; font-weight: 700; text-align: right; }
.spot-action-dialog__acknowledge { display: flex; align-items: flex-start; gap: 8px; margin-top: 16px; color: #9c5449; font-size: 12px; line-height: 1.5; cursor: pointer; }
.spot-action-dialog__acknowledge input { margin: 2px 0 0; accent-color: #b96555; }
.spot-action-dialog__error { margin: 13px 0 0; padding: 9px 10px; border-radius: 5px; color: #a84545; background: #fff0ef; font-size: 12px; line-height: 1.5; }
.spot-action-dialog > footer { display: flex; justify-content: flex-end; gap: 8px; padding: 13px 20px; border-top: 1px solid #e1ecf0; background: #fbfdfe; }
.spot-action-dialog > footer button { min-width: 84px; height: 35px; padding: 0 13px; border: 1px solid #bdd3dc; border-radius: 5px; font-size: 12px; font-weight: 700; cursor: pointer; }
.spot-action-dialog__cancel { color: #527485; background: #fff; }
.spot-action-dialog > footer .spot-action-dialog__confirm { color: #fff; border-color: #168dad; background: #168dad; }
.spot-action-dialog--ignore > footer .spot-action-dialog__confirm { border-color: #607e8b; background: #607e8b; }
.spot-action-dialog--revoke > footer .spot-action-dialog__confirm { border-color: #b96051; background: #b96051; }
.spot-action-dialog > footer button:disabled { opacity: .48; cursor: not-allowed; }

</style>
