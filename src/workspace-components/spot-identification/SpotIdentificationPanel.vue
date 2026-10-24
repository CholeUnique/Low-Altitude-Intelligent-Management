<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PortalTask, WorkspaceNodeConfig } from '@/types'
import { getTaskAbnormalPage } from '@/api/governance-task'
import type { GovernanceTask, TaskAbnormal } from '@/api/governance-task'
import { getRecognitionSpotPage, ignoreRecognitionSpots, reviewRecognitionSpots, revokeRecognitionSpots, type RecognitionSpotCreateResult } from '@/api/recognition-spot'
import { ApiBusinessError } from '@/api/client'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import { getSceneDictionary, type SceneDictionaryItem } from '@/api/scene'
import { inspectMapService } from '@/utils/map-service-layer'
import { useUserStore } from '@/stores/user'
import SpotDistributionMap from './SpotDistributionMap.vue'
import ManualSpotCreatePanel from './ManualSpotCreatePanel.vue'
import type { ComparisonPeriod, SpotDrawingMode, SynchronizedMapView } from './SpotDistributionMap.vue'

const user = useUserStore()
const props = withDefaults(defineProps<{
  task?: PortalTask
  tasks?: GovernanceTask[]
  selectedTaskId?: string
  taskLoading?: boolean
  taskError?: string
  sceneName?: string
  node?: WorkspaceNodeConfig
}>(), { tasks: () => [], selectedTaskId: '', taskLoading: false, taskError: '' })
type SceneSpot = TaskAbnormal & {
  deptId?: string
  taskId?: string
  sourceTaskName?: string
  mapServices: MapServiceItem[]
  fromRecognitionApi?: boolean
}
const sceneFilter = ref('')
const keyword = ref('')
const handleStatus = ref<number | ''>(-1)
const activeId = ref('')
const periods = ref(1)
const periodsManuallySelected = ref(false)
const synchronizedMapView = ref<SynchronizedMapView>()
const mapFullscreen = ref(false)
const loading = ref(false)
const loadError = ref('')
const records = ref<SceneSpot[]>([])
const activeImageIndex = ref(0)
const hiddenImageIdsBySpot = ref<Record<string, string[]>>({})
const pendingDeleteImage = ref<RelatedImagery>()
const servicePickerVisible = ref(false)
const servicePickerLoading = ref(false)
const servicePickerError = ref('')
const imageryMapServices = ref<MapServiceItem[]>([])
let imageryServiceRequestVersion = 0
const selectedMapServiceIds = ref<string[]>([])
const scenes = ref<SceneDictionaryItem[]>([])
let sceneRequestVersion = 0
const spotDrawing = ref(false)
const drawingPeriod = ref<number>()
const draftCoordinates = ref<Array<[number, number]>>([])
const pendingReview = ref<{ id: string; spotNo: string; title: string; deptId: string }>()
const reviewBusy = ref(false)
const reviewError = ref('')
const reviewMessage = ref('')
type SpotAction = 'ignore' | 'revoke'
type PendingSpotAction = { kind: SpotAction; id: string; spotNo: string; title: string; deptId: string; handleStatus: number }
const pendingSpotAction = ref<PendingSpotAction>()
const spotActionBusy = ref(false)
const spotActionError = ref('')
const revokeAcknowledged = ref(false)
let requestVersion = 0
const statusOptions = [
  { value: -1, label: '待人工审核' },
  { value: 0, label: '待核查' },
  { value: 1, label: '核查中' },
  { value: 2, label: '已处置' },
  { value: 3, label: '已销号' },
  { value: 4, label: '已忽略' },
]
const sceneOptions = computed(() => [...new Map(records.value.filter((item) => item.sceneCode).map((item) => [item.sceneCode,
  scenes.value.find((scene) => scene.code === item.sceneCode)?.name
    || props.tasks.find((task) => task.sceneCode === item.sceneCode)?.sceneName
    || item.sceneCode,
])).entries()])
const filtered = computed(() => records.value.filter((item) => {
  const matchKeyword = !keyword.value.trim() || `${item.id} ${item.spotNo} ${item.title} ${item.description} ${item.abnormalTypeDesc}`.toLowerCase().includes(keyword.value.trim().toLowerCase())
  return matchKeyword
    && (!sceneFilter.value || item.sceneCode === sceneFilter.value)
    && (handleStatus.value === '' || item.handleStatus === handleStatus.value)
}))
const active = computed(() => filtered.value.find((item) => item.id === activeId.value) || filtered.value[0])
const activeSceneName = computed(() => {
  const sceneCode = active.value?.sceneCode || selectedGovernanceTask.value?.sceneCode
  return scenes.value.find((scene) => scene.code === sceneCode)?.name
    || (selectedGovernanceTask.value?.sceneCode === sceneCode ? selectedGovernanceTask.value?.sceneName : '')
    || sceneCode
})

type RelatedImagery = { id: string; label: string; url?: string; date?: string; local?: boolean; mapService?: MapServiceItem }
const manualImageryBySpot = ref<Record<string, RelatedImagery[]>>({})
const currentSpotId = computed(() => active.value?.id || '')
const currentManualImagery = computed(() => currentSpotId.value ? (manualImageryBySpot.value[currentSpotId.value] || []) : [])
const currentHiddenImageIds = computed(() => currentSpotId.value ? (hiddenImageIdsBySpot.value[currentSpotId.value] || []) : [])

function hiddenImageryStorageKey(taskId?: string) {
  return taskId ? `spot-imagery-exclusions:${taskId}` : ''
}
function loadHiddenImagery(taskId?: string) {
  hiddenImageIdsBySpot.value = {}
  const key = hiddenImageryStorageKey(taskId)
  if (!key) return
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '{}') as Record<string, unknown>
    hiddenImageIdsBySpot.value = Object.fromEntries(Object.entries(parsed)
      .filter(([, value]) => Array.isArray(value))
      .map(([spotId, value]) => [spotId, [...new Set((value as unknown[]).filter((id): id is string => typeof id === 'string'))]]))
  } catch {
    hiddenImageIdsBySpot.value = {}
  }
}
function persistHiddenImagery() {
  const key = hiddenImageryStorageKey(active.value?.bizTaskId || `recognition-${user.activeDeptId}`)
  if (!key) return
  try {
    window.localStorage.setItem(key, JSON.stringify(hiddenImageIdsBySpot.value))
  } catch {
    // 存储不可用时仍保留当前会话内的图斑级排除状态。
  }
}
const selectedGovernanceTask = computed(() => props.tasks.find((task) => task.id === active.value?.bizTaskId))
const taskComparisonImagery = computed<RelatedImagery[]>(() => {
  const taskImages = (selectedGovernanceTask.value?.comparisonImages || []).map((image) => ({
    id: `task-comparison-${selectedGovernanceTask.value?.id}-${image.id}`,
    label: image.label,
    url: image.imageUrl,
    date: image.captureTime,
    mapService: image.mapService,
  }))
  const taskServiceIds = new Set(taskImages.flatMap((image) => image.mapService ? [String(image.mapService.id)] : []))
  const spotServices = (active.value?.mapServices || []).filter((service) => !taskServiceIds.has(String(service.id)))
  return [...taskImages, ...spotServices.map((service) => ({ id: `spot-service-${service.id}`, label: service.name, mapService: service }))]
})
const displayableImagery = computed(() => [...taskComparisonImagery.value, ...currentManualImagery.value]
  .filter((item) => Boolean(item.url || item.mapService) && !currentHiddenImageIds.value.includes(item.id)))
const activeMapServiceIds = computed<Array<string | number>>(() => [...new Set(displayableImagery.value.flatMap((image) => image.mapService ? [String(image.mapService.id)] : []))])
const formMapServices = computed(() => {
  const services = new Map<string, MapServiceItem>()
  for (const service of imageryMapServices.value) services.set(String(service.id), service)
  for (const image of [...taskComparisonImagery.value, ...currentManualImagery.value]) {
    if (image.mapService) services.set(String(image.mapService.id), image.mapService)
  }
  return [...services.values()]
})
const comparisonPeriods = computed<ComparisonPeriod[]>(() => {
  const images = displayableImagery.value
  return Array.from({ length: periods.value }, (_, index) => {
    const image = images[activeImageIndex.value + index]
    const periodNumber = activeImageIndex.value + index + 1
    if (!image) return { number: periodNumber, label: '暂无多期影像', kind: 'empty' }
    if (image.mapService) return { number: periodNumber, label: image.label, kind: 'map-service', mapService: image.mapService }
    return { number: periodNumber, label: image.label, kind: 'image', imageUrl: image.url }
  })
})
function imageryThumbnailPeriod(image: RelatedImagery, index: number): ComparisonPeriod {
  return image.mapService
    ? { number: index + 1, label: image.label, kind: 'map-service', mapService: image.mapService }
    : { number: index + 1, label: image.label, kind: image.url ? 'image' : 'empty', imageUrl: image.url }
}

function statusLabel(value: number) {
  return statusOptions.find((status) => status.value === value)?.label || '未知状态'
}
function levelLabel(value: number) {
  return ({ 1: '一般', 2: '较重', 3: '严重' } as Record<number, string>)[value] || `等级 ${value}`
}
function formatTime(value?: string) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-'
}
function spotSourceLabel(value: string) {
  return ({ MANUAL_UPLOAD: '文件上传', MANUAL_DRAW: '手工绘制', API_IMPORT: '接口导入', TASK_ABNORMAL: '任务识别' } as Record<string, string>)[value] || value
}
function selectSpot(id: string) {
  activeId.value = id
  activeImageIndex.value = 0
}
function selectImage(index: number) {
  if (spotDrawing.value || draftCoordinates.value.length) cancelSpotDrawing()
  activeImageIndex.value = index
}
function isImageDisplayed(index: number) {
  return index >= activeImageIndex.value
    && index < activeImageIndex.value + periods.value
}
function selectPeriods(value: number) {
  if (value > displayableImagery.value.length) return
  if (spotDrawing.value || draftCoordinates.value.length) cancelSpotDrawing()
  periods.value = value
  periodsManuallySelected.value = true
}
function drawingMode(period: ComparisonPeriod): SpotDrawingMode {
  if (!spotDrawing.value) {
    return draftCoordinates.value.length >= 3 && (period.kind === 'map-service' || Boolean(period.bounds)) ? 'preview' : 'off'
  }
  if (period.kind !== 'map-service') return 'blocked'
  if (drawingPeriod.value === undefined) return 'available'
  return drawingPeriod.value === period.number ? 'active' : 'blocked'
}
function startSpotDrawing() {
  clearSpotDrawing()
  spotDrawing.value = true
}
function cancelSpotDrawing() {
  clearSpotDrawing()
  spotDrawing.value = false
}
function finishSpotDrawing() {
  if (draftCoordinates.value.length >= 3) spotDrawing.value = false
}
function addSpotDrawingPoint(period: number, coordinate: [number, number]) {
  if (!spotDrawing.value || (drawingPeriod.value !== undefined && drawingPeriod.value !== period)) return
  if (drawingPeriod.value === undefined) drawingPeriod.value = period
  draftCoordinates.value = [...draftCoordinates.value, coordinate]
}
function undoSpotDrawingPoint() {
  draftCoordinates.value = draftCoordinates.value.slice(0, -1)
  if (!draftCoordinates.value.length) drawingPeriod.value = undefined
}
function clearSpotDrawing() {
  draftCoordinates.value = []
  drawingPeriod.value = undefined
}
function handleSpotCreated(result: RecognitionSpotCreateResult) {
  cancelSpotDrawing()
  void loadSpots(result.spotNos?.[0])
}
function synchronizeMapView(view: SynchronizedMapView) {
  synchronizedMapView.value = view
}
function toggleMapFullscreen() {
  mapFullscreen.value = !mapFullscreen.value
}
function handleMapFullscreenKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (servicePickerVisible.value) servicePickerVisible.value = false
  else if (mapFullscreen.value) mapFullscreen.value = false
}
async function loadImageryMapServices() {
  const requestVersion = ++imageryServiceRequestVersion
  const services = await listEnabledMapServices(user.activeDeptId)
  const inspections = await Promise.allSettled(services.map((service) => inspectMapService(service)))
  if (requestVersion !== imageryServiceRequestVersion) return
  imageryMapServices.value = services.filter((service, index) => {
    const inspection = inspections[index]
    if (inspection?.status === 'fulfilled') return inspection.value.isImagery
    const type = String(service.type || '').toUpperCase()
    return /IMAGE_SERVER|IMAGESERVER|WMTS|WMS|XYZ|TMS/.test(type)
  })
}
async function loadSceneOptions() {
  const requestVersion = ++sceneRequestVersion
  try {
    const items = await getSceneDictionary(user.organization.scenes, user.activeDeptId)
    if (requestVersion === sceneRequestVersion) scenes.value = items.filter((scene) => scene.enabled)
  } catch {
    if (requestVersion === sceneRequestVersion) scenes.value = []
  }
}
function clearManualImagery() {
  manualImageryBySpot.value = {}
}
function isMapServiceAdded(service: MapServiceItem) {
  return displayableImagery.value.some((image) => String(image.mapService?.id) === String(service.id))
}
function synchronizeMapServiceSelection(ids: Array<string | number>) {
  const spotId = currentSpotId.value
  if (!spotId) return
  const selectedIds = new Set(ids.map(String))
  const visibleIds = new Set(activeMapServiceIds.value.map(String))
  const hiddenIds = new Set(currentHiddenImageIds.value)
  const manualImages = [...currentManualImagery.value]

  for (const image of displayableImagery.value) {
    if (image.mapService && !selectedIds.has(String(image.mapService.id))) hiddenIds.add(image.id)
  }
  for (const serviceId of selectedIds) {
    if (visibleIds.has(serviceId)) continue
    const hiddenImage = [...taskComparisonImagery.value, ...manualImages].find((image) =>
      image.mapService && String(image.mapService.id) === serviceId && hiddenIds.has(image.id))
    if (hiddenImage) {
      hiddenIds.delete(hiddenImage.id)
      continue
    }
    const service = formMapServices.value.find((item) => String(item.id) === serviceId)
    if (service) manualImages.push({ id: `selected-service-${spotId}-${service.id}`, label: service.name, mapService: service })
  }

  manualImageryBySpot.value = { ...manualImageryBySpot.value, [spotId]: manualImages }
  if (hiddenIds.size !== currentHiddenImageIds.value.length || [...hiddenIds].some((id) => !currentHiddenImageIds.value.includes(id))) {
    hiddenImageIdsBySpot.value = { ...hiddenImageIdsBySpot.value, [spotId]: [...hiddenIds] }
    persistHiddenImagery()
  }
  activeImageIndex.value = 0
}
async function openImageServicePicker() {
  if (!active.value) return
  servicePickerVisible.value = true
  servicePickerError.value = ''
  selectedMapServiceIds.value = []
  if (imageryMapServices.value.length) return
  servicePickerLoading.value = true
  try {
    await loadImageryMapServices()
  } catch (error) {
    servicePickerError.value = error instanceof Error ? error.message : '参考影像地图服务加载失败。'
  } finally {
    servicePickerLoading.value = false
  }
}
function addSelectedMapServices() {
  if (!currentSpotId.value || !selectedMapServiceIds.value.length) return
  synchronizeMapServiceSelection([...activeMapServiceIds.value, ...selectedMapServiceIds.value])
  servicePickerVisible.value = false
  selectedMapServiceIds.value = []
}
function requestImageDelete(image: RelatedImagery) {
  pendingDeleteImage.value = image
}
function confirmImageDelete() {
  const image = pendingDeleteImage.value
  const spotId = currentSpotId.value
  if (!image || !spotId) return
  if (currentManualImagery.value.some((item) => item.id === image.id)) {
    manualImageryBySpot.value = {
      ...manualImageryBySpot.value,
      [spotId]: currentManualImagery.value.filter((item) => item.id !== image.id),
    }
  } else if (!currentHiddenImageIds.value.includes(image.id)) {
    hiddenImageIdsBySpot.value = {
      ...hiddenImageIdsBySpot.value,
      [spotId]: [...currentHiddenImageIds.value, image.id],
    }
    persistHiddenImagery()
  }
  pendingDeleteImage.value = undefined
  activeImageIndex.value = 0
}

async function loadAllRecognitionSpots(deptId?: string) {
  const first = await getRecognitionSpotPage({ deptId, pageNum: 1, pageSize: 200 })
  const all = [...first.records]
  const pageSize = Math.max(1, first.records.length || first.pageSize || 200)
  for (let pageNum = 2; pageNum <= Math.ceil(first.total / pageSize); pageNum += 1) {
    const page = await getRecognitionSpotPage({ deptId, pageNum, pageSize: 200 })
    all.push(...page.records)
  }
  return all
}

async function loadAllTaskSpots(task: GovernanceTask): Promise<SceneSpot[]> {
  const first = await getTaskAbnormalPage({ bizTaskId: task.id, pageNum: 1, pageSize: 200 })
  const all = [...first.records]
  const pageSize = Math.max(1, first.records.length || first.pageSize || 200)
  for (let pageNum = 2; pageNum <= Math.ceil(first.total / pageSize); pageNum += 1) {
    const page = await getTaskAbnormalPage({ bizTaskId: task.id, pageNum, pageSize: 200 })
    all.push(...page.records)
  }
  const mapServices = (task.comparisonImages || []).flatMap((image) => image.mapService ? [image.mapService] : [])
  return all.map((item) => ({ ...item, bizTaskId: task.id, sceneCode: item.sceneCode || task.sceneCode,
    deptId: task.deptId, sourceTaskName: task.name, mapServices }))
}

async function loadSpots(preferredSpotNo?: string) {
  const version = ++requestVersion
  const deptId = user.activeDeptId
  loadError.value = ''
  loading.value = true
  try {
    const recognitionSpots = await loadAllRecognitionSpots(deptId)
    const taskResults = await Promise.allSettled(props.tasks.map(loadAllTaskSpots))
    if (version !== requestVersion || deptId !== user.activeDeptId) return
    const merged = new Map<string, SceneSpot>()
    const recognitionById = new Map(recognitionSpots.map((item) => [item.id, item]))
    taskResults.forEach((result) => {
      if (result.status !== 'fulfilled') return
      result.value.forEach((item) => {
        const existing = merged.get(item.id)
        const derivedTaskId = recognitionById.get(item.id)?.taskId
        if (!existing || item.bizTaskId === derivedTaskId || existing.bizTaskId !== derivedTaskId) merged.set(item.id, item)
      })
    })
    recognitionSpots.forEach((item) => {
      const existing = merged.get(item.id)
      const services = new Map<string, MapServiceItem>()
      ;[...(existing?.mapServices || []), ...item.mapServices].forEach((service) => services.set(String(service.id || service.serviceUrl), service))
      merged.set(item.id, {
        ...existing,
        ...item,
        fromRecognitionApi: true,
        bizTaskId: existing?.bizTaskId || item.taskId || '',
        abnormalLevel: existing?.abnormalLevel || 1,
        imageMediaId: existing?.imageMediaId,
        imageUrl: existing?.imageUrl,
        mapServices: [...services.values()],
      })
    })
    records.value = [...merged.values()].sort((left, right) =>
      (right.foundTime || right.createTime || '').localeCompare(left.foundTime || left.createTime || ''))
    activeId.value = records.value.find((item) => item.spotNo === preferredSpotNo)?.id
      || (records.value.some((item) => item.id === activeId.value) ? activeId.value : records.value[0]?.id || '')
  } catch (error) {
    if (version !== requestVersion) return
    records.value = []
    activeId.value = ''
    loadError.value = error instanceof Error ? error.message : '异常图斑加载失败。'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

function openReview() {
  const spot = active.value
  if (!spot || spot.handleStatus !== -1 || reviewBusy.value) return
  const deptId = spot.deptId || user.activeDeptId
  if (!deptId) {
    reviewError.value = '当前图斑缺少处理部门，无法审核。'
    return
  }
  reviewError.value = ''
  reviewMessage.value = ''
  pendingReview.value = { id: spot.id, spotNo: spot.spotNo || spot.id, title: spot.title, deptId }
}

async function confirmReview() {
  const pending = pendingReview.value
  if (!pending || reviewBusy.value) return
  const current = records.value.find((item) => item.id === pending.id)
  if (!current || current.handleStatus !== -1 || (current.deptId || user.activeDeptId) !== pending.deptId) {
    reviewError.value = '图斑状态已变化，请重新选择后再试。'
    return
  }
  reviewBusy.value = true
  reviewError.value = ''
  const submittingDeptId = user.activeDeptId
  try {
    const result = await reviewRecognitionSpots({ deptId: pending.deptId, ids: [pending.id] })
    if (submittingDeptId !== user.activeDeptId) return
    if (Number(result.count) > 0) {
      pendingReview.value = undefined
      await loadSpots(pending.spotNo)
      reviewMessage.value = `图斑“${pending.title}”已审核通过，转为待核查。`
    } else {
      pendingReview.value = undefined
      await loadSpots(pending.spotNo)
      reviewError.value = '后台未处理该图斑，列表已刷新，请确认最新状态。'
    }
  } catch (error) {
    if (submittingDeptId !== user.activeDeptId) return
    if (error instanceof ApiBusinessError && ['10220', '10201'].includes(error.code)) {
      pendingReview.value = undefined
      await loadSpots(pending.spotNo)
      reviewError.value = '图斑状态已变化或记录不存在，列表已刷新。'
    } else {
      reviewError.value = error instanceof ApiBusinessError && error.code === '10107'
        ? '当前账号无权审核该图斑，请联系管理员。'
        : error instanceof Error ? error.message : '审核失败，请稍后再试。'
    }
  } finally {
    reviewBusy.value = false
  }
}

function canOperateSpot(spot: SceneSpot | undefined) {
  return Boolean(spot?.fromRecognitionApi && !spot.taskId && (spot.handleStatus === -1 || spot.handleStatus === 0))
}

function openSpotAction(kind: SpotAction) {
  const spot = active.value
  if (!spot || !canOperateSpot(spot) || spotActionBusy.value) return
  const deptId = spot.deptId || user.activeDeptId
  if (!deptId) {
    reviewError.value = '当前图斑缺少处理部门，无法提交操作。'
    return
  }
  reviewError.value = ''
  reviewMessage.value = ''
  spotActionError.value = ''
  revokeAcknowledged.value = false
  pendingSpotAction.value = { kind, id: spot.id, spotNo: spot.spotNo || spot.id, title: spot.title, deptId, handleStatus: spot.handleStatus }
}

function closeSpotAction() {
  if (spotActionBusy.value) return
  pendingSpotAction.value = undefined
  spotActionError.value = ''
}

async function confirmSpotAction() {
  const pending = pendingSpotAction.value
  if (!pending || spotActionBusy.value || (pending.kind === 'revoke' && !revokeAcknowledged.value)) return
  const current = records.value.find((item) => item.id === pending.id)
  if (!current || !canOperateSpot(current) || current.handleStatus !== pending.handleStatus || (current.deptId || user.activeDeptId) !== pending.deptId) {
    spotActionError.value = '图斑信息已变化，请关闭弹窗后重新选择。'
    return
  }
  spotActionBusy.value = true
  spotActionError.value = ''
  const submittingDeptId = user.activeDeptId
  try {
    const input = { deptId: pending.deptId, ids: [pending.id] }
    const result = pending.kind === 'ignore' ? await ignoreRecognitionSpots(input) : await revokeRecognitionSpots(input)
    if (submittingDeptId !== user.activeDeptId) return
    pendingSpotAction.value = undefined
    await loadSpots(pending.spotNo)
    if (Number(result.count) > 0) reviewMessage.value = `图斑“${pending.title}”已${pending.kind === 'ignore' ? '忽略' : '撤销'}。`
    else reviewError.value = '后台未处理该图斑，列表已刷新，请确认最新状态。'
  } catch (error) {
    if (submittingDeptId !== user.activeDeptId) return
    if (error instanceof ApiBusinessError && ['10220', '10201'].includes(error.code)) {
      pendingSpotAction.value = undefined
      await loadSpots(pending.spotNo)
      reviewError.value = '图斑状态已变化或记录不存在，列表已刷新。'
    } else {
      spotActionError.value = error instanceof ApiBusinessError && error.code === '10107'
        ? '当前账号无权处理该图斑，请联系管理员。'
        : error instanceof Error ? error.message : '图斑处理失败，请稍后再试。'
    }
  } finally {
    spotActionBusy.value = false
  }
}

watch([() => props.tasks.map((task) => task.id).join(','), () => user.activeDeptId], () => {
  records.value = []
  activeId.value = ''
  pendingReview.value = undefined
  pendingSpotAction.value = undefined
  reviewError.value = ''
  reviewMessage.value = ''
  clearManualImagery()
  void loadSpots()
}, { immediate: true })
watch(() => active.value?.bizTaskId, (taskId) => {
  cancelSpotDrawing()
  loadHiddenImagery(taskId || `recognition-${user.activeDeptId}`)
  pendingDeleteImage.value = undefined
})
watch(filtered, (items) => {
  if (!items.some((item) => item.id === activeId.value)) {
    activeId.value = items[0]?.id || ''
    activeImageIndex.value = 0
  }
})
watch(() => active.value?.id, () => {
  cancelSpotDrawing()
  synchronizedMapView.value = undefined
  periodsManuallySelected.value = false
  periods.value = displayableImagery.value.length >= 2 ? 2 : 1
}, { flush: 'post', immediate: true })
watch(periods, () => {
  // 切换期数时各窗口会重新创建，初始联动视图重新以第 1 期图斑范围为准。
  synchronizedMapView.value = undefined
}, { flush: 'sync' })
watch(() => displayableImagery.value.length, (imageCount) => {
  const availablePeriods = Math.max(1, imageCount)
  periods.value = periodsManuallySelected.value
    ? Math.min(periods.value, availablePeriods)
    : Math.min(2, availablePeriods)
  activeImageIndex.value = Math.min(activeImageIndex.value, Math.max(0, imageCount - 1))
})
onMounted(() => {
  window.addEventListener('keydown', handleMapFullscreenKeydown)
  void loadImageryMapServices().catch((error) => {
    servicePickerError.value = error instanceof Error ? error.message : '参考影像地图服务加载失败。'
  })
  void loadSceneOptions()
})
watch(() => user.activeDeptId, () => {
  imageryServiceRequestVersion += 1
  imageryMapServices.value = []
  scenes.value = []
  selectedMapServiceIds.value = []
  servicePickerVisible.value = false
  clearManualImagery()
  void loadImageryMapServices().catch((error) => {
    servicePickerError.value = error instanceof Error ? error.message : '参考影像地图服务加载失败。'
  })
  void loadSceneOptions()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleMapFullscreenKeydown)
})
</script>

<template>
  <div class="governance-page spot-page">
    <aside class="left-column">
      <section class="panel spot-list">
        <div class="panel-title"><span>问题图斑列表</span><small>{{ filtered.length }} / {{ records.length }} 处</small></div>
        <div class="filters">
          <input v-model="keyword" placeholder="搜索图斑编号、名称或类型" />
          <select v-model="sceneFilter"><option value="">全部场景类型</option><option v-for="[value, label] in sceneOptions" :key="value" :value="value">{{ label }}</option></select>
          <select v-model="handleStatus"><option value="">全部处置状态</option><option v-for="item in statusOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select>
        </div>
        <div class="spot-scroll">
          <button
            v-for="(item, index) in filtered"
            :key="item.id"
            class="spot-item"
            :class="{ active: item.id === active?.id }"
            :title="'图斑名称：' + (item.title || '-') + '\n图斑编号：' + (item.spotNo || '#' + item.id)"
            @click="selectSpot(item.id)"
          >
            <i>{{ index + 1 }}</i>
            <span><b>{{ item.title }}</b><small>图斑 {{ item.spotNo || `#${item.id}` }} · {{ item.abnormalTypeDesc }}</small><small v-if="item.sourceTaskName" class="source-task">来源任务：{{ item.sourceTaskName }}</small></span>
            <em :class="`status-${item.handleStatus}`">{{ statusLabel(item.handleStatus) }}</em>
          </button>
          <div v-if="loading" class="list-empty">正在加载场景异常图斑…</div>
          <div v-else-if="loadError" class="list-empty list-empty--error">{{ loadError }}</div>
          <div v-else-if="!filtered.length" class="list-empty">当前筛选条件下暂无异常图斑</div>
        </div>
      </section>
    </aside>

    <section class="center-column">
      <div class="panel map-panel" :class="{ 'map-panel--fullscreen': mapFullscreen }">
        <div class="panel-title"><span>问题图斑分布</span><div class="map-header-actions"><small v-if="active">当前：{{ active.title }}</small><button type="button" :aria-label="mapFullscreen ? '退出问题图斑分布全屏' : '全屏展示问题图斑分布'" @click="toggleMapFullscreen">{{ mapFullscreen ? '退出全屏' : '全屏展示' }}</button></div></div>
        <div v-if="active" class="map-compare" :class="`compare-${periods}`">
          <SpotDistributionMap
            v-for="period in comparisonPeriods"
            :key="`${active.id}-${periods}-${period.number}-${period.imageUrl || period.mapService?.id || period.kind}`"
            :spot="active"
            :period="period"
            :synchronized-view="synchronizedMapView"
            :drawing-mode="drawingMode(period)"
            :draft-coordinates="draftCoordinates"
            @select="selectSpot"
            @view-change="synchronizeMapView"
            @draw-point="addSpotDrawingPoint"
            @finish-drawing="finishSpotDrawing"
          />
        </div>
        <div v-else class="map-empty">{{ loading ? '正在加载图斑地图…' : '请选择当前任务中的异常图斑' }}</div>
      </div>

      <div class="panel analysis">
        <div class="panel-title"><span>多期影像 / 变化分析 <small class="analysis-title-hint">（点选下方影像可切换当前显示的起始期次）</small></span></div>
        <div class="periods">
          <button v-for="n in [1, 2, 3, 4]" :key="n" :class="{ active: periods === n }" :disabled="n > displayableImagery.length" :title="n > displayableImagery.length ? `当前图斑仅有 ${displayableImagery.length} 期影像` : `显示 ${n} 期影像`" @click="selectPeriods(n)">{{ n }} 期影像</button>
          <span>当前对比：{{ active?.title || '未选择图斑' }}</span>
        </div>
        <div class="imagery">
          <button v-for="(image, index) in displayableImagery" :key="image.id" class="image-card" :class="{ active: activeImageIndex === index, displayed: isImageDisplayed(index) }" @click="selectImage(index)">
            <SpotDistributionMap v-if="image.mapService && active" class="image-card__map-thumbnail" :spot="active" :period="imageryThumbnailPeriod(image, index)" thumbnail />
            <img v-else-if="image.url" :src="image.url" :alt="image.label" />
            <b>第 {{ index + 1 }} 期影像</b><small>{{ image.label }}{{ image.date ? ` · ${formatTime(image.date)}` : '' }}</small>
            <span class="image-card__delete" role="button" tabindex="0" aria-label="从当前图斑移除影像" title="从当前图斑移除" @click.stop="requestImageDelete(image)" @keydown.enter.stop="requestImageDelete(image)">×</span>
          </button>
          <div v-if="!displayableImagery.length" class="imagery-empty">当前任务暂未关联可用的参考影像，可从地图服务中添加</div>
          <button class="image-card image-card--add" type="button" :disabled="!active" @click="openImageServicePicker"><i>＋</i><b>添加影像</b><small>从后端影像地图服务中选择</small></button>
        </div>
      </div>
    </section>

    <aside class="right-column">
      <ManualSpotCreatePanel
        :key="user.activeDeptId || 'no-dept'"
        :scene-code="active?.sceneCode"
        :scenes="scenes"
        :dept-id="active?.deptId || user.activeDeptId"
        :map-services="formMapServices"
        :initial-map-service-ids="activeMapServiceIds"
        :drawing-available="displayableImagery.some((image) => Boolean(image.mapService))"
        :drawing="spotDrawing"
        :drawing-period="drawingPeriod"
        :coordinates="draftCoordinates"
        @start-drawing="startSpotDrawing"
        @cancel-drawing="cancelSpotDrawing"
        @finish-drawing="finishSpotDrawing"
        @undo-point="undoSpotDrawingPoint"
        @clear-drawing="clearSpotDrawing"
        @map-service-selection-change="synchronizeMapServiceSelection"
        @created="handleSpotCreated"
      />
      <section class="panel detail">
        <div class="panel-title"><span>异常图斑详细信息</span><button class="review-button" type="button" :disabled="!active || active.handleStatus !== -1 || reviewBusy" @click="openReview">审核通过</button></div>
        <div class="detail-actions">
          <button class="detail-action detail-action--ignore" type="button" :disabled="!canOperateSpot(active) || spotActionBusy" @click="openSpotAction('ignore')">忽略图斑</button>
          <button class="detail-action detail-action--revoke" type="button" :disabled="!canOperateSpot(active) || spotActionBusy" @click="openSpotAction('revoke')">撤销图斑</button>
        </div>
        <p v-if="reviewMessage" class="review-feedback review-feedback--success" role="status">{{ reviewMessage }}</p>
        <p v-if="reviewError && !pendingReview" class="review-feedback review-feedback--error" role="alert">{{ reviewError }}</p>
        <template v-if="active">
          <dl>
            <dt>图斑编号</dt><dd>{{ active.spotNo || `#${active.id}` }}</dd>
            <dt>图斑名称</dt><dd>{{ active.title }}</dd>
            <dt>所属场景</dt><dd>{{ activeSceneName || '未返回' }}</dd>
            <template v-if="active.spotSource"><dt>图斑来源</dt><dd>{{ spotSourceLabel(active.spotSource) }}</dd></template>
            <dt>关联任务</dt><dd>{{ active.sourceTaskName || selectedGovernanceTask?.name || active.bizTaskId || '-' }}</dd>
            <dt>异常类型</dt><dd>{{ active.abnormalTypeDesc }}</dd>
            <dt>异常等级</dt><dd :class="`text-level-${active.abnormalLevel}`">{{ levelLabel(active.abnormalLevel) }}</dd>
            <dt>面积</dt><dd>{{ active.area == null ? '-' : `${active.area} ㎡` }}</dd>
            <template v-if="active.longitude !== undefined && active.latitude !== undefined"><dt>中心坐标</dt><dd>{{ active.longitude.toFixed(6) }}，{{ active.latitude.toFixed(6) }}</dd></template>
            <dt>处置状态</dt><dd>{{ statusLabel(active.handleStatus) }}</dd>
            <dt>发现时间</dt><dd>{{ formatTime(active.foundTime) }}</dd>
            <template v-if="active.createTime"><dt>创建时间</dt><dd>{{ formatTime(active.createTime) }}</dd></template>
            <template v-if="active.updateTime"><dt>更新时间</dt><dd>{{ formatTime(active.updateTime) }}</dd></template>
            <dt>关联影像</dt><dd>{{ displayableImagery.length ? `${displayableImagery.length} 项` : '未关联' }}</dd>
          </dl>
          <p>{{ active.description || '暂无异常图斑描述。' }}</p>
        </template>
        <div v-else class="detail-empty">暂无图斑信息</div>
      </section>
    </aside>
    <div v-if="pendingReview" class="review-mask" @click.self="!reviewBusy && (pendingReview = undefined)">
      <section class="review-dialog" role="alertdialog" aria-modal="true" aria-labelledby="spot-review-title">
        <h3 id="spot-review-title">确认审核通过</h3>
        <p>图斑“{{ pendingReview.title }}”（{{ pendingReview.spotNo }}）审核通过后将转为待核查，可继续创建核查任务。</p>
        <p v-if="reviewError" class="review-dialog-error" role="alert">{{ reviewError }}</p>
        <footer><button type="button" :disabled="reviewBusy" @click="pendingReview = undefined">取消</button><button type="button" class="primary" :disabled="reviewBusy" @click="confirmReview">{{ reviewBusy ? '正在审核…' : '确认通过' }}</button></footer>
      </section>
    </div>
    <div v-if="pendingSpotAction" class="review-mask" @click.self="closeSpotAction">
      <section class="review-dialog spot-action-dialog" :class="`spot-action-dialog--${pendingSpotAction.kind}`" role="alertdialog" aria-modal="true" aria-labelledby="spot-action-title">
        <h3 id="spot-action-title">{{ pendingSpotAction.kind === 'ignore' ? '忽略图斑' : '撤销图斑' }}</h3>
        <p>{{ pendingSpotAction.kind === 'ignore' ? '忽略后图斑仍可查询，但不再参与派单，也不能用于创建核查任务。' : '撤销后图斑将从列表中移除，业务边界和参考影像关联会被清理；此操作不可恢复。' }}</p>
        <dl><div><dt>图斑</dt><dd>{{ pendingSpotAction.title }}</dd></div><div><dt>编号</dt><dd>{{ pendingSpotAction.spotNo }}</dd></div><div><dt>当前状态</dt><dd>{{ statusLabel(pendingSpotAction.handleStatus) }}</dd></div></dl>
        <label v-if="pendingSpotAction.kind === 'revoke'" class="spot-action-acknowledge"><input v-model="revokeAcknowledged" type="checkbox" :disabled="spotActionBusy" /><span>我已了解：撤销会清理图斑边界与影像关联，且不可恢复。</span></label>
        <p v-if="spotActionError" class="spot-action-error" role="alert">{{ spotActionError }}</p>
        <footer><button type="button" :disabled="spotActionBusy" @click="closeSpotAction">返回</button><button type="button" class="primary" :disabled="spotActionBusy || (pendingSpotAction.kind === 'revoke' && !revokeAcknowledged)" @click="confirmSpotAction">{{ spotActionBusy ? '正在处理…' : pendingSpotAction.kind === 'ignore' ? '确认忽略' : '确认撤销' }}</button></footer>
      </section>
    </div>
    <div v-if="pendingDeleteImage" class="image-delete-mask" @click.self="pendingDeleteImage = undefined">
      <section class="image-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="image-delete-title">
        <h3 id="image-delete-title">确认从当前图斑移除</h3>
        <p>确定移除“{{ pendingDeleteImage.label }}”吗？该操作仅影响当前图斑，不会删除原始影像或影响其他图斑。</p>
        <footer><button @click="pendingDeleteImage = undefined">取消</button><button class="danger" @click="confirmImageDelete">确认移除</button></footer>
      </section>
    </div>
    <div v-if="servicePickerVisible" class="service-picker-mask" @click.self="servicePickerVisible = false">
      <section class="service-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="service-picker-title">
        <header>
          <div><h3 id="service-picker-title">添加参考影像</h3><p>从后端已启用的非矢量地图服务中选择影像</p></div>
          <button type="button" aria-label="关闭" @click="servicePickerVisible = false">×</button>
        </header>
        <div class="service-picker-body">
          <div v-if="servicePickerLoading" class="service-picker-state">正在读取参考影像地图服务…</div>
          <div v-else-if="servicePickerError" class="service-picker-state service-picker-state--error">{{ servicePickerError }}</div>
          <div v-else-if="!imageryMapServices.length" class="service-picker-state">暂无已启用的非矢量影像地图服务</div>
          <fieldset v-else>
            <legend>参考影像地图服务 <em>*</em></legend>
            <label v-for="service in imageryMapServices" :key="service.id" :class="{ added: isMapServiceAdded(service) }">
              <input v-model="selectedMapServiceIds" type="checkbox" :value="String(service.id)" :disabled="isMapServiceAdded(service)" />
              <span><b>{{ service.name }}</b><small>{{ isMapServiceAdded(service) ? '已关联到当前图斑' : service.type }}</small></span>
            </label>
          </fieldset>
          <p class="service-picker-tip">只展示已启用且通过影像类型检查的地图服务，矢量、图斑和边界服务不会出现在此列表中。</p>
        </div>
        <footer><button type="button" class="cancel" @click="servicePickerVisible = false">取消</button><button type="button" class="primary" :disabled="servicePickerLoading || !selectedMapServiceIds.length" @click="addSelectedMapServices">确认添加（{{ selectedMapServiceIds.length }}）</button></footer>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.governance-page { height: 100%; min-height: 0; display: grid; grid-template-columns: 300px minmax(0, 1fr) 330px; grid-template-rows:minmax(360px,1fr) 250px; gap: 10px; padding: 10px; background: #e8eef3; color: #29475a; }
.panel { min-height: 0; overflow: hidden; background: #fff; border: 1px solid #cbdbe5; border-radius: 7px; box-shadow: 0 2px 9px #1c3b5214; }
.panel-title { height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 13px; border-bottom: 1px solid #e1ebf1; color: #173c54; font-size: 15px; font-weight: 700; }.panel-title small { color: #6c8595; font-size: 12px; font-weight: 500; }
.analysis-title-hint { margin-left:4px; color:#6c8595; font-size:12px; font-weight:500; white-space:nowrap; }
.left-column { min-height: 0; grid-column:1; grid-row:1 / 3; display: grid; grid-template-rows: 338px minmax(0, 1fr); gap: 10px; }
.task-selector { display: flex; flex-direction: column; }.task-filters { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 7px; padding: 9px; border-bottom: 1px solid #e8eff3; }.task-filters select { min-width: 0; height: 33px; padding: 0 7px; color: #38586a; background: #fbfdfe; border: 1px solid #c9dce7; border-radius: 4px; font-size: 11px; outline: none; }.task-filters select:hover,.task-filters select:focus { color:#fff; background:#075273; border-color:#1599c1; }.task-filters select option { color:#38586a; background:#fff; }.task-scroll { min-height:0; flex:1; overflow-y:auto; }.recognition-task-item { width:100%; display:block; padding:8px 10px; color:#29475a; border:0; border-bottom:1px solid #e8eef2; background:#fff; text-align:left; cursor:pointer; }.recognition-task-item:hover { background:#f2f9fc; }.recognition-task-item.active { padding-left:6px; border-left:4px solid #129bc3; background:#e5f5fb; }.recognition-task-item span,.recognition-task-item b,.recognition-task-item small { display:block; min-width:0; }.recognition-task-item b,.recognition-task-item small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.recognition-task-item b { color:#1d435b; font-size:12px; }.recognition-task-item small { margin-top:3px; color:#708897; font-size:10px; }.task-empty { display:grid; min-height:70px; place-items:center; padding:12px; color:#6f8796; font-size:12px; text-align:center; }
.spot-list { display: flex; flex-direction: column; }.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; border-bottom: 1px solid #e8eff3; }.filters input { grid-column: 1 / -1; }.filters input,.filters select { min-width: 0; height: 34px; padding: 0 9px; color: #38586a; background: #fbfdfe; border: 1px solid #c9dce7; border-radius: 4px; font-size: 12px; outline: none; }.filters input:focus,.filters select:focus { border-color: #1a9ac0; box-shadow: 0 0 0 2px #1a9ac01c; }
.filters select:hover,.filters select:focus { color:#fff; background:#075273; border-color:#1599c1; }.filters select option { color:#38586a; background:#fff; }
.filters input:focus::placeholder { color: transparent; }
.spot-scroll { min-height: 0; overflow: auto; }.spot-item { width: 100%; display: grid; grid-template-columns: 31px minmax(0,1fr) auto; gap: 9px; align-items: center; padding: 11px 10px; border: 0; border-bottom: 1px solid #e8eef2; background: #fff; color: #29475a; text-align: left; cursor: pointer; transition: background .15s; }.spot-item:hover { background: #f2f9fc; }.spot-item.active { background: #e5f5fb; border-left: 4px solid #129bc3; padding-left: 6px; }.spot-item>i { display: grid; width: 28px; height: 28px; place-items: center; color: #ffffff; background: #3e91b1; border-radius: 50%; font-style: normal; font-size: 13px; font-weight: 700; }.spot-item>i.level-2 { background: #d79228; }.spot-item>i.level-3 { background: #d55762; }.spot-item b,.spot-item small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.spot-item b { color:#1d435b; font-size:14px; }.spot-item small { margin-top:4px;color:#6f8796;font-size:11px; }.spot-item em { padding:4px 6px;border-radius:3px;font-style:normal;font-size:11px;white-space:nowrap; }.status-0 { color:#9a680f;background:#fff3d9; }.status-1 { color:#1b79a2;background:#e2f3fa; }.status-2 { color:#21875e;background:#e3f6ed; }.status-3 { color:#667986;background:#ecf0f2; }.list-empty { display:grid; min-height:150px; place-items:center; padding:16px; color:#6f8796; font-size:13px; text-align:center; }.list-empty--error { color:#c7535e; }
.center-column { display:contents; }.map-panel { grid-column:2; grid-row:1; display:flex; flex-direction:column; }.map-header-actions{min-width:0;display:flex;align-items:center;justify-content:flex-end;gap:10px}.map-header-actions small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.map-header-actions button{flex:none;height:30px;padding:0 11px;color:#167895;background:#f3fafc;border:1px solid #8fc8d8;border-radius:4px;font-size:12px;font-weight:700;cursor:pointer}.map-header-actions button:hover,.map-header-actions button:focus-visible{color:#fff;background:#137f9e;border-color:#137f9e;outline:none}.map-panel.map-panel--fullscreen{position:fixed;z-index:4000;inset:0;grid-column:auto;grid-row:auto;border:0;border-radius:0;background:#c9d8df;box-shadow:none}.map-panel.map-panel--fullscreen>.panel-title{height:54px;flex:0 0 54px;padding-inline:18px;color:#fff;background:#07344f;border-color:#1e6684;font-size:18px}.map-panel.map-panel--fullscreen .map-header-actions small{color:#b4d7e5;font-size:13px}.map-panel.map-panel--fullscreen .map-header-actions button{color:#fff;background:#126f91;border-color:#6ed8eb}.map-compare { flex:1; min-height:0; display:grid; gap:4px; padding:4px; background:#c9d8df; }.map-compare.compare-2,.map-compare.compare-3 { grid-template-columns:repeat(var(--period-count),minmax(0,1fr)); }.map-compare.compare-2 { --period-count:2; }.map-compare.compare-3 { --period-count:3; }.map-compare.compare-4 { grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:repeat(2,minmax(0,1fr)); }.map-compare :deep(.spot-map) { min-width:0; min-height:0; border:1px solid #adc6d2; }.map-empty { display:grid; flex:1; place-items:center; color:#6b8493; background:#eef3f5; font-size:14px; }
.analysis { grid-column:2; grid-row:2; display:flex; flex-direction:column; }.periods { display:flex; align-items:center; gap:7px; padding:9px 11px 7px; }.periods button { padding:7px 11px; color:#426478; background:#f5f9fb; border:1px solid #cbdde7; border-radius:4px; font-size:12px; cursor:pointer; }.periods button.active { color:#fff; background:#168db5; border-color:#168db5; box-shadow:0 2px 5px #168db544; }.periods button:disabled { color:#9eacb3; background:#eef2f4; border-color:#dce4e8; box-shadow:none; cursor:not-allowed; opacity:.72; }.periods span { margin-left:auto; overflow:hidden; color:#6f8796; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }.imagery { flex:1; min-height:0; display:flex; gap:8px; padding:0 11px 11px; overflow-x:auto; }.image-card { position:relative; flex:0 0 180px; height:112px; overflow:hidden; padding:9px; color:#f4fcff; background:linear-gradient(135deg,#276c80,#17445b); border:1px solid transparent; border-radius:5px; text-align:left; cursor:pointer; transition:border-color .18s,box-shadow .18s; }.image-card:hover,.image-card.active { border-color:#13a9d3; box-shadow:0 0 0 2px #13a9d325; }.image-card.displayed { border-color:#ff4054; box-shadow:0 0 4px #ff4054b8,inset 0 0 2px #ff8a9699; }.image-card__map-thumbnail { position:absolute; inset:0; display:block; pointer-events:none; }.image-card>img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }.image-card>span { display:grid; height:100%; place-items:center; color:#d5e1e6; background:#53616a; font-size:12px; }.image-card b,.image-card small { position:relative; z-index:1; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-shadow:0 1px 2px #002030; }.image-card b { margin-top:48px; font-size:13px; }.image-card small { margin-top:4px; font-size:11px; }.image-card.unavailable { cursor:not-allowed; }.imagery-empty { display:grid; min-width:260px; place-items:center; padding:0 16px; color:#728796; background:#f3f6f8; border:1px dashed #c4d3db; border-radius:5px; font-size:12px; line-height:1.6; }.imagery-empty--error { color:#b24e58; border-color:#e2aeb4; background:#fff5f6; }
.image-card--add { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; color:#377b95; background:#f4fafc; border:1px dashed #69aec4; text-align:center; }.image-card--add:hover:not(:disabled) { color:#0b86ae; background:#e9f7fb; border-color:#159bc4; }.image-card--add:disabled { cursor:not-allowed; opacity:.55; }.image-card--add i { width:30px; height:30px; display:grid; place-items:center; border:1px solid currentColor; border-radius:50%; font-size:22px; font-style:normal; line-height:1; }.image-card--add b { margin:4px 0 0; color:currentColor; text-shadow:none; }.image-card--add small { color:#6d92a2; text-shadow:none; }
.image-card > .image-card__delete { position:absolute; z-index:3; top:5px; right:5px; width:14px; height:14px; min-height:14px; padding:0; display:grid; place-items:center; color:#fff; background:#d64755; border:1px solid #fff8; border-radius:50%; box-shadow:0 1px 3px #3e1420aa; font-size:12px; font-weight:400; line-height:1; text-shadow:none; }.image-card > .image-card__delete:hover,.image-card > .image-card__delete:focus-visible { background:#b92739; outline:2px solid #ffd2d7; outline-offset:1px; }
.image-delete-mask { position:fixed; z-index:3100; inset:0; display:grid; place-items:center; padding:20px; background:#10243180; }.image-delete-dialog { width:min(390px,calc(100vw - 40px)); overflow:hidden; color:#29475a; background:#fff; border:1px solid #b9d1dc; border-radius:7px; box-shadow:0 12px 32px #102a3d66; }.image-delete-dialog h3 { margin:0; padding:15px 18px; color:#203f53; border-bottom:1px solid #e0eaef; font-size:17px; }.image-delete-dialog p { margin:0; padding:18px; color:#5c7481; font-size:14px; line-height:1.7; }.image-delete-dialog footer { display:flex; justify-content:flex-end; gap:8px; padding:11px 18px; background:#f5f8fa; border-top:1px solid #e1ebef; }.image-delete-dialog button { min-width:76px; padding:7px 12px; color:#466877; background:#fff; border:1px solid #bfd4df; border-radius:4px; cursor:pointer; }.image-delete-dialog button.danger { color:#fff; background:#cf4655; border-color:#cf4655; }.image-delete-dialog button.danger:hover { background:#b92e40; }
.service-picker-mask { position:fixed; z-index:4200; inset:0; display:grid; place-items:center; padding:24px; background:#102431b8; backdrop-filter:blur(3px); }.service-picker-dialog { width:min(720px,calc(100vw - 40px)); max-height:calc(100vh - 48px); display:flex; flex-direction:column; overflow:hidden; color:#29475a; background:#fff; border:1px solid #b9d1dc; border-radius:9px; box-shadow:0 20px 60px #001d2e66; }.service-picker-dialog>header { flex:none; display:flex; align-items:center; justify-content:space-between; padding:17px 20px; border-bottom:1px solid #d7e4ea; }.service-picker-dialog h3,.service-picker-dialog p { margin:0; }.service-picker-dialog h3 { color:#173c54; font-size:20px; }.service-picker-dialog header p { margin-top:4px; color:#7d929d; font-size:12px; }.service-picker-dialog header button { width:34px; height:34px; border:0; color:#627c89; background:transparent; font-size:26px; cursor:pointer; }.service-picker-body { min-height:0; overflow:auto; padding:18px 20px; }.service-picker-body fieldset { margin:0; padding:12px; border:1px solid #cbdde5; border-radius:6px; }.service-picker-body legend { padding:0 5px; color:#536f7d; font-size:13px; font-weight:700; }.service-picker-body legend em { color:#d14b58; font-style:normal; }.service-picker-body label { min-height:50px; display:flex; align-items:center; gap:10px; padding:7px 10px; border-bottom:1px solid #e6eef2; cursor:pointer; }.service-picker-body label:last-child { border-bottom:0; }.service-picker-body label:hover { background:#f2f9fc; }.service-picker-body label.added { color:#94a4ac; background:#f7f9fa; cursor:not-allowed; }.service-picker-body label input { flex:none; width:16px; height:16px; accent-color:#168eae; }.service-picker-body label span,.service-picker-body label b,.service-picker-body label small { display:block; min-width:0; }.service-picker-body label b { overflow:hidden; color:#294d60; font-size:14px; text-overflow:ellipsis; white-space:nowrap; }.service-picker-body label small { margin-top:4px; color:#718b98; font-size:11px; }.service-picker-body label.added b { color:#8d9ca4; }.service-picker-state { min-height:160px; display:grid; place-items:center; color:#718894; border:1px dashed #c8d9e1; border-radius:6px; font-size:14px; }.service-picker-state--error { color:#b84450; background:#fff4f5; }.service-picker-tip { margin:12px 0 0!important; padding:9px 11px; color:#587786; background:#edf7fa; border-left:3px solid #1b9cba; border-radius:4px; font-size:12px; line-height:1.6; }.service-picker-dialog>footer { flex:none; display:flex; justify-content:flex-end; gap:9px; padding:13px 20px; border-top:1px solid #d7e4ea; background:#fff; }.service-picker-dialog footer button { min-width:92px; height:38px; padding:0 15px; border:1px solid #168aa9; border-radius:4px; font-weight:700; cursor:pointer; }.service-picker-dialog footer button.cancel { color:#587786; background:#fff; border-color:#bfd4de; }.service-picker-dialog footer button.primary { color:#fff; background:#168eae; }.service-picker-dialog footer button:disabled { opacity:.45; cursor:not-allowed; }
.right-column { min-width:0; min-height:0; grid-column:3; grid-row:1 / 3; display:grid; grid-template-rows:minmax(0, 1.2fr) minmax(0, .8fr); gap:10px; }.detail { min-height:0; display:flex; flex-direction:column; overflow-y:auto; }.detail>.panel-title { flex:0 0 42px; }.detail dl { flex:0 0 auto; display:grid; grid-template-columns:94px 1fr; margin:0; padding:9px 13px; }.detail dt,.detail dd { margin:0; padding:8px 0; border-bottom:1px solid #edf2f5; font-size:12px; }.detail dt { color:#718895; }.detail dd { color:#29485a; font-weight:700; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.text-level-2 { color:#bd7a18!important; }.text-level-3 { color:#c94856!important; }.detail>p { flex:0 0 auto; margin:0 13px 11px; padding:10px; color:#607987; background:#f3f7f9; font-size:12px; line-height:1.7; }.detail-empty { display:grid; min-height:120px; place-items:center; color:#728796; font-size:13px; }

/* 场景任务研判在大屏上仍保持清晰可读，统一放大各面板标题与正文层级。 */
.panel-title {
  height: 46px;
  flex: 0 0 46px;
  padding-inline: 14px;
  font-size: 17px;
}
.panel-title > span { color: inherit; font-size: inherit; font-weight: inherit; }
.panel-title small { font-size: 13px; }
.task-filters select,
.filters input,
.filters select {
  height: 38px;
  font-size: 13px;
}
.recognition-task-item { padding-block: 10px; }
.recognition-task-item b { font-size: 14px; }
.recognition-task-item small { margin-top: 4px; font-size: 12px; }
.task-empty,
.list-empty { font-size: 14px; }
.spot-item { min-height: 66px; padding-block: 12px; }
.spot-item.active { padding-left: 6px; }
.spot-item > i {
  width: 30px;
  height: 30px;
  font-size: 14px;
}
.spot-item b { font-size: 15px; }
.spot-item small { font-size: 12px; }
.spot-item em { padding: 5px 7px; font-size: 12px; }
.left-column { display: block; }
.left-column > .spot-list { height: 100%; box-sizing: border-box; }
.spot-item { min-height: 70px; grid-template-columns: 34px minmax(0, 1fr) auto; border-top: 1px solid #e3ebef; border-bottom: 0; }
.spot-item small.source-task { margin-top: 2px; color: #3790a8; }
.spot-item em.status--1 { color: #9a6a0c; background: #fff2cf; }
.spot-item em.status-4 { color: #667986; background: #ecf0f2; }
.map-header-actions small,
.map-header-actions button,
.analysis-title-hint,
.periods button,
.periods span { font-size: 13px; }
.periods button { min-height: 32px; }
.image-card b { font-size: 14px; }
.image-card small { font-size: 12px; }
.image-card--add i { font-size: 23px; }
.detail > .panel-title { flex-basis: 46px; }
.detail dl {
  grid-template-columns: 100px minmax(0, 1fr);
  padding: 10px 14px;
}
.detail dt,
.detail dd {
  padding-block: 10px;
  font-size: 14px;
}
.detail dd {
  overflow: visible;
  overflow-wrap: anywhere;
  white-space: normal;
}
.detail > p {
  margin-inline: 14px;
  padding: 12px;
  font-size: 13px;
}
.detail-empty { font-size: 14px; }
.detail {
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: #8aa9b7 #edf4f7;
}
.detail::-webkit-scrollbar { width: 8px; }
.detail::-webkit-scrollbar-track { background: #edf4f7; }
.detail::-webkit-scrollbar-thumb { background: #8aa9b7; border: 2px solid #edf4f7; border-radius: 8px; }
.detail::-webkit-scrollbar-thumb:hover { background: #668b9c; }
/* 新增表单可内部滚动，两个右侧面板均分可用高度。 */
.right-column { grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
.review-button { flex: none; padding: 6px 10px; color: #08799d; background: #e8f6fa; border: 1px solid #9ed4e3; border-radius: 5px; font-size: 12px; font-weight: 700; line-height: 1.2; cursor: pointer; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease; }
.review-button:hover:not(:disabled) { color: #fff; background: #168eb3; border-color: #168eb3; box-shadow: 0 2px 8px #08779c32; }
.review-button:focus-visible { outline: 2px solid #08799d; outline-offset: 2px; }
.review-button:disabled { color: #91a7b2; background: #edf3f5; border-color: #d6e2e8; cursor: not-allowed; }
.detail-actions { flex: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; padding: 9px 12px; border-bottom: 1px solid #e1ebf1; background: #f8fbfc; }
.detail-action { min-height: 30px; padding: 5px 7px; border: 1px solid; border-radius: 5px; background: #fff; font-size: 12px; font-weight: 700; cursor: pointer; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease; }
.detail-action--ignore { color: #567481; border-color: #afc7d2; }
.detail-action--ignore:hover:not(:disabled) { color: #fff; background: #607e8b; border-color: #607e8b; box-shadow: 0 2px 8px #607e8b32; }
.detail-action--revoke { color: #ae5a51; border-color: #e0b9b2; }
.detail-action--revoke:hover:not(:disabled) { color: #fff; background: #b96051; border-color: #b96051; box-shadow: 0 2px 8px #b9605132; }
.detail-action:focus-visible { outline: 2px solid #08799d; outline-offset: 2px; }
.detail-action:disabled { color: #91a7b2; background: #edf3f5; border-color: #d6e2e8; cursor: not-allowed; }
.detail > p.review-feedback { margin: 9px 14px 0; padding: 8px 10px; font-size: 12px; }
.detail > p.review-feedback--success { color: #147254; background: #e4f6ef; }
.detail > p.review-feedback--error { color: #b63f4d; background: #ffedf0; }
.review-mask { position: fixed; z-index: 4300; inset: 0; display: grid; place-items: center; padding: 20px; background: #10243199; backdrop-filter: blur(2px); }
.review-dialog { width: min(420px, calc(100vw - 40px)); overflow: hidden; color: #29475a; background: #fff; border: 1px solid #b9d1dc; border-radius: 8px; box-shadow: 0 18px 46px #102a3d66; }
.review-dialog h3 { margin: 0; padding: 16px 18px; color: #173c54; border-bottom: 1px solid #e0eaef; font-size: 17px; }
.review-dialog p { margin: 0; padding: 17px 18px; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.review-dialog p.review-dialog-error { padding-top: 0; color: #b63f4d; }
.review-dialog footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; background: #f6f9fa; border-top: 1px solid #e0eaef; }
.review-dialog footer button { min-width: 76px; min-height: 34px; padding: 0 12px; color: #466877; background: #fff; border: 1px solid #bfd4df; border-radius: 4px; cursor: pointer; }
.review-dialog footer button.primary { color: #fff; background: #168eae; border-color: #168eae; }
.review-dialog footer button:disabled { opacity: .5; cursor: not-allowed; }
.spot-action-dialog dl { display: grid; gap: 8px; margin: 0 18px 16px; padding: 11px 13px; border: 1px solid #e3edf1; border-radius: 6px; background: #f8fbfc; }
.spot-action-dialog dl div { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.spot-action-dialog dt { flex: none; color: #8199a5; }
.spot-action-dialog dd { min-width: 0; margin: 0; color: #335568; font-weight: 700; overflow-wrap: anywhere; text-align: right; }
.spot-action-acknowledge { display: flex; align-items: flex-start; gap: 8px; margin: 0 18px 16px; color: #9c5449; font-size: 12px; line-height: 1.5; cursor: pointer; }
.spot-action-acknowledge input { margin: 2px 0 0; accent-color: #b96555; }
.review-dialog p.spot-action-error { padding: 0 18px 15px; color: #a84545; }
.spot-action-dialog--ignore footer button.primary { background: #607e8b; border-color: #607e8b; }
.spot-action-dialog--revoke footer button.primary { background: #b96051; border-color: #b96051; }
.map-compare :deep(.period-badge) { font-size: 13px; }
.map-compare :deep(.empty-imagery) { font-size: 15px; }
@media (max-width: 1180px) {
  .governance-page { grid-template-columns: clamp(215px, 23vw, 270px) minmax(400px, 1fr) clamp(235px, 24vw, 280px); gap: 7px; padding: 7px; }
  .governance-page { grid-template-rows:minmax(300px,1fr) 230px; }.left-column { grid-template-rows: 375px minmax(0,1fr); gap:7px; }.filters { padding: 7px; }.task-filters { grid-template-columns:minmax(0,1fr); padding:7px; }
}
</style>
