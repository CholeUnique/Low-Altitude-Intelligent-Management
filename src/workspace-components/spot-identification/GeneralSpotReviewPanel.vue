<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  createTasksFromAbnormals,
  getGovernanceTaskPage,
  getTaskAbnormalPage,
  type GovernanceTask,
  type TaskAbnormal,
} from '@/api/governance-task'
import {
  getRecognitionSpotPage,
  uploadRecognitionSpots,
  type RecognitionAbnormalType,
  type RecognitionSpotCreateResult,
  type RecognitionSpotItem,
} from '@/api/recognition-spot'
import { getSceneDictionary, type SceneDictionaryItem } from '@/api/scene'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import { inspectMapService } from '@/utils/map-service-layer'
import { useUserStore } from '@/stores/user'
import SpotDistributionMap from './SpotDistributionMap.vue'
import ManualSpotCreatePanel from './ManualSpotCreatePanel.vue'
import SpotDateTimePicker from './SpotDateTimePicker.vue'
import type { ComparisonPeriod, SpotDrawingMode, SynchronizedMapView } from './SpotDistributionMap.vue'

const user = useUserStore()
interface ReviewSpot extends RecognitionSpotItem {
  sourceTaskId?: string
  sourceTaskName?: string
  sourceDeptName?: string
  sourceSceneName?: string
  derivedTaskId?: string
}

const loading = ref(false)
const loadError = ref('')
const records = ref<ReviewSpot[]>([])
const keyword = ref('')
const typeFilter = ref('')
const statusFilter = ref<number | ''>('')
const activeId = ref('')
const selectedIds = ref<string[]>([])
const creatingTasks = ref(false)
const taskCreateVisible = ref(false)
const taskPriority = ref(1)
const taskCreateError = ref('')
const operationMessage = ref('')
const operationError = ref('')
const uploadVisible = ref(false)
const uploading = ref(false)
const uploadError = ref('')
const uploadFiles = ref<File[]>([])
const uploadFileNames = computed(() => uploadFiles.value.map((file) => file.name).join('、'))
const uploadFileSummary = computed(() => uploadFiles.value.length ? `已选择 ${uploadFiles.value.length} 个文件` : '尚未选择文件')
const scenes = ref<SceneDictionaryItem[]>([])
const imageryMapServices = ref<MapServiceItem[]>([])
const synchronizedMapView = ref<SynchronizedMapView>()
const periods = ref(2)
const activeImageIndex = ref(0)
const spotDrawing = ref(false)
const drawingPeriod = ref<number>()
const drawingMapServiceId = ref<string | number>()
const draftCoordinates = ref<Array<[number, number]>>([])
const drawingBackup = ref<Array<[number, number]>>([])
const drawingBackupPeriod = ref<number>()
const drawingBackupMapServiceId = ref<string | number>()

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
]
const uploadForm = reactive({
  sceneCode: '', abnormalType: 'OTHER' as RecognitionAbnormalType,
  mapServiceIds: [] as Array<string | number>, title: '', description: '', foundTime: '',
})

const filtered = computed(() => records.value.filter((item) => {
  const text = `${item.spotNo} ${item.title} ${item.description} ${item.abnormalTypeDesc}`.toLowerCase()
  return (!keyword.value.trim() || text.includes(keyword.value.trim().toLowerCase()))
    && (!typeFilter.value || item.abnormalType === typeFilter.value)
    && (statusFilter.value === '' || item.handleStatus === statusFilter.value)
}))
const active = computed(() => filtered.value.find((item) => item.id === activeId.value) || filtered.value[0])
const typeCounts = computed(() => abnormalTypes.map((type) => ({
  ...type, count: records.value.filter((item) => item.abnormalType === type.value).length,
})).filter((item) => item.count))
const statusCounts = computed(() => statuses.map((status) => ({
  ...status, count: records.value.filter((item) => item.handleStatus === status.value).length,
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
  return item.sourceDeptName
    || user.currentUser?.deptList?.find((department) => department.deptId === item.deptId)?.deptName
    || (item.deptId === user.activeDeptId ? user.currentUser?.deptName : undefined)
    || item.deptId
    || '-'
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
const activeMapServiceIds = computed<Array<string | number>>(() => displayableImagery.value.map((service) => service.id))
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
function drawingMode(period: ComparisonPeriod): SpotDrawingMode {
  if (!spotDrawing.value) return draftCoordinates.value.length >= 3 && drawingPeriod.value === period.number ? 'preview' : 'off'
  if (period.kind !== 'map-service') return 'blocked'
  if (drawingPeriod.value === undefined) return 'available'
  return drawingPeriod.value === period.number ? 'active' : 'blocked'
}
function startSpotDrawing() {
  drawingBackup.value = draftCoordinates.value.map((point) => [...point] as [number, number])
  drawingBackupPeriod.value = drawingPeriod.value
  drawingBackupMapServiceId.value = drawingMapServiceId.value
  draftCoordinates.value = []
  drawingPeriod.value = undefined
  drawingMapServiceId.value = undefined
  spotDrawing.value = true
}
function cancelSpotDrawing() {
  draftCoordinates.value = drawingBackup.value.map((point) => [...point] as [number, number])
  drawingPeriod.value = drawingBackupPeriod.value
  drawingMapServiceId.value = drawingBackupMapServiceId.value
  spotDrawing.value = false
}
function finishSpotDrawing() {
  if (draftCoordinates.value.length >= 3) spotDrawing.value = false
}
function addSpotDrawingPoint(period: number, coordinate: [number, number], mapServiceId?: string | number) {
  if (!spotDrawing.value || (drawingPeriod.value !== undefined && drawingPeriod.value !== period)) return
  if (drawingPeriod.value === undefined) {
    drawingPeriod.value = period
    drawingMapServiceId.value = mapServiceId
  }
  draftCoordinates.value = [...draftCoordinates.value, coordinate]
}
function undoSpotDrawingPoint() {
  draftCoordinates.value = draftCoordinates.value.slice(0, -1)
  if (!draftCoordinates.value.length) {
    drawingPeriod.value = undefined
    drawingMapServiceId.value = undefined
  }
}
function clearSpotDrawing() {
  draftCoordinates.value = []
  drawingPeriod.value = undefined
  drawingMapServiceId.value = undefined
}
async function handleSpotCreated(result: RecognitionSpotCreateResult) {
  const preferredSpotNo = result.spotNos?.[0]
  spotDrawing.value = false
  keyword.value = ''
  typeFilter.value = ''
  statusFilter.value = ''
  await loadSpots(preferredSpotNo)
  clearSpotDrawing()
  drawingBackup.value = []
  drawingBackupPeriod.value = undefined
  drawingBackupMapServiceId.value = undefined
}
function canSelect(item: ReviewSpot) {
  if (item.derivedTaskId || item.handleStatus !== 0) return false
  const first = selected.value[0]
  return !first || selectedIds.value.includes(item.id)
    || (first.sceneCode === item.sceneCode && first.deptId === item.deptId)
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

async function loadImageryMapServices() {
  const services = await listEnabledMapServices()
  const inspections = await Promise.allSettled(services.map((service) => inspectMapService(service)))
  imageryMapServices.value = services.filter((service, index) => {
    const inspection = inspections[index]
    if (inspection?.status === 'fulfilled') return inspection.value.isImagery
    const type = String(service.type || '').toUpperCase()
    return /IMAGE_SERVER|IMAGESERVER|WMTS|WMS|XYZ|TMS/.test(type)
  })
}

async function loadAllRecognitionSpots() {
  const first = await getRecognitionSpotPage({ deptId: user.activeDeptId, pageNum: 1, pageSize: 200 })
  const all = [...first.records]
  const pageCount = Math.ceil(first.total / Math.max(first.pageSize || 200, 1))
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
    const page = await getRecognitionSpotPage({ deptId: user.activeDeptId, pageNum, pageSize: 200 })
    all.push(...page.records)
  }
  return all
}

async function loadAllTasks() {
  const first = await getGovernanceTaskPage({ deptId: user.activeDeptId, pageNum: 1, pageSize: 100 })
  const all = [...first.records]
  const pageCount = Math.ceil(first.total / Math.max(first.pageSize || 100, 1))
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
    const page = await getGovernanceTaskPage({ deptId: user.activeDeptId, pageNum, pageSize: 100 })
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

async function loadSpots(preferredSpotNo?: string) {
  loading.value = true
  loadError.value = ''
  try {
    const [recognitionSpots, tasks, sceneList] = await Promise.all([
      loadAllRecognitionSpots(),
      loadAllTasks(),
      getSceneDictionary(user.organization.scenes, user.activeDeptId),
    ])
    scenes.value = sceneList.filter((scene) => scene.enabled)
    const taskSpotResults = await Promise.allSettled(tasks.map(loadTaskSpots))
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
    selectedIds.value = selectedIds.value.filter((id) => all.some((item) => item.id === id))
  } catch (error) {
    records.value = []
    loadError.value = error instanceof Error ? error.message : '疑似异常图斑加载失败。'
  } finally {
    loading.value = false
  }
}

function openTaskCreateDialog() {
  if (!selected.value.length) return
  taskPriority.value = 1
  taskCreateError.value = ''
  taskCreateVisible.value = true
}

async function createSelectedTasks() {
  if (!selected.value.length || creatingTasks.value) return
  creatingTasks.value = true
  operationError.value = ''
  operationMessage.value = ''
  taskCreateError.value = ''
  const createdIds = [...selectedIds.value]
  try {
    const tasks = await createTasksFromAbnormals({
      deptId: selected.value[0]?.deptId || user.activeDeptId,
      abnormalIds: createdIds,
      merge: false,
      priority: taskPriority.value,
      startFlow: false,
    })
    operationMessage.value = `已成功创建 ${tasks.length || createdIds.length} 个核查任务，图斑已从原任务移出。`
    records.value = records.value.filter((item) => !createdIds.includes(item.id))
    selectedIds.value = []
    taskCreateVisible.value = false
    window.dispatchEvent(new CustomEvent('abnormal-tasks-created', { detail: { abnormalIds: createdIds } }))
    await loadSpots()
  } catch (error) {
    taskCreateError.value = error instanceof Error ? error.message : '核查任务创建失败。'
  } finally {
    creatingTasks.value = false
  }
}

async function prepareUpload() {
  uploadError.value = ''
  uploadFiles.value = []
  uploadVisible.value = true
  try {
    const [sceneList] = await Promise.all([
      getSceneDictionary(user.organization.scenes, user.activeDeptId),
      loadImageryMapServices(),
    ])
    scenes.value = sceneList.filter((scene) => scene.enabled)
    uploadForm.sceneCode = scenes.value[0]?.code || ''
    uploadForm.mapServiceIds = []
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : '上传所需字典读取失败。'
  }
}
function chooseFiles(event: Event) {
  uploadFiles.value = Array.from((event.target as HTMLInputElement).files || [])
  uploadError.value = ''
}
function validateUpload() {
  const suffixes = new Set(uploadFiles.value.map((file) => file.name.split('.').pop()?.toLowerCase()))
  if (!uploadFiles.value.length) return '请选择 Shapefile 文件组。'
  if (!suffixes.has('shp') || !suffixes.has('dbf')) return '文件组必须至少包含 .shp 和 .dbf 文件。'
  if (!uploadForm.sceneCode) return '请选择所属场景。'
  if (!uploadForm.mapServiceIds.length) return '请至少选择一个参考影像地图服务。'
  return ''
}
async function submitUpload() {
  uploadError.value = validateUpload()
  if (uploadError.value || uploading.value) return
  uploading.value = true
  try {
    const result = await uploadRecognitionSpots({
      files: uploadFiles.value,
      deptId: user.activeDeptId,
      sceneCode: uploadForm.sceneCode,
      abnormalType: uploadForm.abnormalType,
      mapServiceIds: uploadForm.mapServiceIds,
      title: uploadForm.title,
      description: uploadForm.description,
      foundTime: uploadForm.foundTime,
    })
    uploadVisible.value = false
    operationMessage.value = `成功导入 ${result.count || result.spotNos?.length || 0} 个疑似图斑。`
    await loadSpots(result.spotNos?.[0])
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : '疑似图斑上传导入失败。'
  } finally {
    uploading.value = false
  }
}

watch(filtered, (items) => {
  if (!items.some((item) => item.id === activeId.value)) activeId.value = items[0]?.id || ''
})
watch(activeId, () => { activeImageIndex.value = 0 })
onMounted(() => {
  void loadSpots()
  void loadImageryMapServices().catch((error) => {
    operationError.value = error instanceof Error ? error.message : '参考影像地图服务加载失败。'
  })
})
</script>

<template>
  <div class="general-review">
    <section class="stat-grid">
      <article><span>疑似图斑总数</span><b>{{ records.length }}</b><small>不区分场景与来源任务</small></article>
      <article><span>待核查</span><b>{{ statusCounts[0]?.count || 0 }}</b><small>等待派生核查任务</small></article>
      <article><span>核查中</span><b>{{ statusCounts[1]?.count || 0 }}</b><small>已进入核查流程</small></article>
      <article><span>已完成处置</span><b>{{ (statusCounts[2]?.count || 0) + (statusCounts[3]?.count || 0) }}</b><small>已处置及已销号</small></article>
      <div class="heading-actions"><button class="secondary" @click="prepareUpload">上传疑似图斑</button><button :disabled="!selectedIds.length || creatingTasks" @click="openTaskCreateDialog">{{ `选中图斑创建任务（${selectedIds.length}）` }}</button></div>
    </section>

    <div v-if="operationMessage" class="operation-message success">{{ operationMessage }}</div>
    <div v-if="operationError" class="operation-message error">{{ operationError }}</div>

    <section class="review-layout">
      <aside class="spot-list panel">
        <header><b>问题图斑列表</b><span>{{ filtered.length }} / {{ records.length }} 处</span></header>
        <div class="filters"><input v-model="keyword" placeholder="搜索图斑编号、名称或类型" /><div><select v-model="typeFilter"><option value="">全部类型</option><option v-for="item in abnormalTypes" :key="item.value" :value="item.value">{{ item.label }}</option></select><select v-model="statusFilter"><option value="">全部状态</option><option v-for="item in statuses" :key="item.value" :value="item.value">{{ item.label }}</option></select></div></div>
        <div class="classification"><button :class="{ active: !typeFilter }" @click="typeFilter = ''">全部 {{ records.length }}</button><button v-for="item in typeCounts" :key="item.value" :class="{ active: typeFilter === item.value }" @click="typeFilter = item.value">{{ item.label }} {{ item.count }}</button></div>
        <div class="spot-scroll">
          <button v-for="(item,index) in filtered" :key="item.id" class="spot-row" :class="{ active: active?.id === item.id, checked: selectedIds.includes(item.id) }" @click="selectSpot(item.id)">
            <input type="checkbox" :checked="selectedIds.includes(item.id)" :disabled="!canSelect(item)" @click.stop="toggleSelection(item)" />
            <i>{{ index + 1 }}</i><span><b>{{ item.title }}</b><small>图斑 {{ item.spotNo }} · {{ item.abnormalTypeDesc }}</small><small v-if="item.sourceTaskName" class="source-task">来源任务：{{ item.sourceTaskName }}</small></span><em :class="`status-${item.handleStatus}`">{{ item.derivedTaskId ? '已生成任务' : statusLabel(item.handleStatus) }}</em>
          </button>
          <div v-if="loading" class="empty">正在读取疑似图斑…</div><div v-else-if="loadError" class="empty error-text">{{ loadError }}</div><div v-else-if="!filtered.length" class="empty">暂无符合条件的疑似图斑</div>
        </div>
      </aside>

      <div class="center-column">
        <main class="comparison panel">
          <header><b>问题图斑分布</b><span v-if="active">当前：{{ active.title }}</span></header>
          <div class="map-grid" :class="`compare-${periods}`">
            <SpotDistributionMap v-for="period in comparisonPeriods" :key="`${active?.id}-${periods}-${period.number}-${period.mapService?.id || 'empty'}`" :spot="activeAsTaskAbnormal" :period="period" :synchronized-view="synchronizedMapView" :drawing-mode="drawingMode(period)" :draft-coordinates="draftCoordinates" @view-change="synchronizedMapView = $event" @draw-point="addSpotDrawingPoint" />
          </div>
        </main>

        <section class="analysis panel">
          <header><b>多期影像 / 变化分析</b><span>点选影像可切换当前显示的起始期次</span></header>
          <div class="period-bar">
            <div><button v-for="count in [1, 2, 3, 4]" :key="count" :class="{ active: periods === count }" @click="selectPeriods(count)">{{ count }} 期影像</button></div>
            <span>当前对比：{{ active?.title || '未选择图斑' }}</span>
          </div>
          <div class="imagery-list">
            <button v-for="(service, index) in displayableImagery" :key="service.id" class="image-card" :class="{ active: activeImageIndex === index, displayed: isImageDisplayed(index) }" @click="selectImage(index)">
              <SpotDistributionMap v-if="activeAsTaskAbnormal" class="image-card-map" :spot="activeAsTaskAbnormal" :period="imageryThumbnailPeriod(service, index)" thumbnail />
              <div class="image-card-caption"><b>第 {{ index + 1 }} 期影像</b><small>{{ service.name }}</small></div>
            </button>
            <div v-if="!displayableImagery.length" class="imagery-empty">该图斑暂未关联多期影像服务</div>
          </div>
        </section>
      </div>

      <aside class="right-column">
        <section class="spot-detail panel">
          <header><b>异常图斑详细信息</b></header>
          <template v-if="active"><dl><div><dt>图斑编号</dt><dd>{{ active.spotNo }}</dd></div><div><dt>异常类型</dt><dd>{{ active.abnormalTypeDesc }}</dd></div><div><dt>处置状态</dt><dd>{{ statusLabel(active.handleStatus) }}</dd></div><div><dt>所属场景</dt><dd>{{ activeSceneName }}</dd></div><div><dt>面积</dt><dd>{{ active.area === undefined ? '-' : `${active.area} ㎡` }}</dd></div><div><dt>发现时间</dt><dd>{{ formatTime(active.foundTime) }}</dd></div><div><dt>关联影像</dt><dd>{{ active.mapServices.length }} 期</dd></div><div><dt>来源任务</dt><dd>{{ active.sourceTaskName || '通用识别图斑' }}</dd></div></dl><p>{{ active.description || '暂无异常图斑描述。' }}</p></template>
          <div v-else class="empty">请选择问题图斑</div>
        </section>
        <ManualSpotCreatePanel
          :scene-code="active?.sceneCode"
          :scenes="scenes"
          :dept-id="active?.deptId || user.activeDeptId"
          :map-services="imageryMapServices"
          :initial-map-service-ids="activeMapServiceIds"
          :drawing-available="displayableImagery.length > 0"
          :drawing="spotDrawing"
          :drawing-period="drawingPeriod"
          :coordinates="draftCoordinates"
          @start-drawing="startSpotDrawing"
          @cancel-drawing="cancelSpotDrawing"
          @finish-drawing="finishSpotDrawing"
          @undo-point="undoSpotDrawingPoint"
          @clear-drawing="clearSpotDrawing"
          @created="handleSpotCreated"
        />
      </aside>
    </section>

    <div v-if="taskCreateVisible" class="dialog-mask" @click.self="!creatingTasks && (taskCreateVisible = false)">
      <section class="task-create-dialog">
        <header>
          <div class="task-dialog-icon">任</div>
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
            <div class="section-title"><b>任务来源图斑</b><span>创建后将从原任务移出并关联至新任务</span></div>
            <div class="selected-spot-list">
              <article v-for="(item, index) in selected" :key="item.id">
                <i>{{ index + 1 }}</i><div><b>{{ item.title }}</b><small>{{ item.spotNo }} · {{ item.abnormalTypeDesc }}<template v-if="item.sourceTaskName"> · 原任务：{{ item.sourceTaskName }}</template></small></div><em>{{ statusLabel(item.handleStatus) }}</em>
              </article>
            </div>
          </section>
          <section class="priority-section">
            <div><b>任务优先级</b><small>将应用到本次创建的全部任务</small></div>
            <div class="priority-options"><button v-for="item in [{ value: 0, label: '低' }, { value: 1, label: '中' }, { value: 2, label: '高' }]" :key="item.value" :class="{ active: taskPriority === item.value }" @click="taskPriority = item.value">{{ item.label }}</button></div>
          </section>
          <div class="create-tip"><b>创建规则</b><span>当前后端固定按“一图斑一任务”创建；场景与执行部门继承所选图斑，且仅允许选择同场景、同部门的待核查图斑。</span></div>
          <p v-if="taskCreateError" class="dialog-error">{{ taskCreateError }}</p>
        </div>
        <footer><button class="cancel" :disabled="creatingTasks" @click="taskCreateVisible = false">取消</button><button :disabled="creatingTasks" @click="createSelectedTasks">{{ creatingTasks ? '正在创建任务…' : `确认创建 ${selected.length} 个任务` }}</button></footer>
      </section>
    </div>

    <div v-if="uploadVisible" class="dialog-mask" @click.self="uploadVisible = false">
      <section class="upload-dialog"><header><div><b>上传疑似图斑</b><small>上传 Shapefile 文件组并调用后端导入接口</small></div><button @click="uploadVisible = false">×</button></header><div class="upload-form">
        <div class="wide upload-file-field">
          <span>图斑文件组 *</span>
          <label class="file-picker" :class="{ selected: uploadFiles.length }">
            <input class="file-picker__input" type="file" multiple accept=".shp,.dbf,.shx,.prj,.cpg" @change="chooseFiles" />
            <i aria-hidden="true">⇧</i><b>选择图斑文件</b><em>{{ uploadFileSummary }}</em>
          </label>
          <small v-if="uploadFiles.length" class="file-picker__names" :title="uploadFileNames">{{ uploadFileNames }}</small>
          <small>请同时选择 .shp、.dbf、.shx、.prj、.cpg 文件，至少包含 .shp 和 .dbf。</small>
        </div>
        <label><span>所属场景 *</span><select v-model="uploadForm.sceneCode"><option value="" disabled>请选择场景</option><option v-for="scene in scenes" :key="scene.id" :value="scene.code">{{ scene.name }}</option></select></label>
        <label><span>异常类型 *</span><select v-model="uploadForm.abnormalType"><option v-for="item in abnormalTypes" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
        <label><span>图斑标题</span><input v-model="uploadForm.title" placeholder="不填则使用默认标题" /></label>
        <label><span>发现时间</span><SpotDateTimePicker v-model="uploadForm.foundTime" /></label>
        <fieldset class="wide"><legend>参考影像地图服务 *</legend><label v-for="service in imageryMapServices" :key="service.id"><input v-model="uploadForm.mapServiceIds" type="checkbox" :value="service.id" />{{ service.name }}</label><small v-if="!imageryMapServices.length">暂无已启用的影像地图服务</small></fieldset>
        <label class="wide"><span>图斑描述</span><textarea v-model="uploadForm.description" placeholder="请输入图斑情况或判定依据"></textarea></label>
        <p v-if="uploadError" class="dialog-error wide">{{ uploadError }}</p>
      </div><footer><button class="cancel" @click="uploadVisible = false">取消</button><button :disabled="uploading" @click="submitUpload">{{ uploading ? '正在导入…' : '上传并导入图斑' }}</button></footer></section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.general-review{height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:16px;background:#edf3f7;color:#183d53}.page-heading{display:flex;align-items:center;justify-content:space-between}.page-heading h1{margin:0;font-size:25px}.page-heading p{margin:4px 0 0;color:#77909d;font-size:12px}.heading-actions{display:flex;gap:10px}.heading-actions button,.upload-dialog footer button,.task-create-dialog footer button{height:38px;padding:0 16px;border:1px solid #168aa9;border-radius:4px;color:#fff;background:#168eae;font-weight:700;cursor:pointer}.heading-actions button.secondary{color:#467080;background:#fff;border-color:#bfd5df}.heading-actions button:disabled,.upload-dialog footer button:disabled,.task-create-dialog button:disabled{opacity:.45;cursor:not-allowed}.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat-grid article{min-height:76px;padding:13px 16px;background:#fff;border:1px solid #d3e0e7;border-radius:6px;box-shadow:0 2px 7px #153c5010}.stat-grid span,.stat-grid small{display:block;color:#718a97;font-size:11px}.stat-grid b{display:inline-block;margin:5px 0 2px;color:#183e56;font-size:25px}.operation-message{padding:8px 12px;border-radius:4px;font-size:12px}.operation-message.success{color:#147254;background:#def4eb}.operation-message.error{color:#b63d4b;background:#ffecef}.review-layout{flex:1;min-height:0;display:grid;grid-template-columns:350px minmax(500px,1fr) 300px;gap:12px}.panel{min-height:0;background:#fff;border:1px solid #ccdce4;border-radius:6px;overflow:hidden}.panel>header{height:48px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #d6e3e9}.panel>header b{font-size:16px}.panel>header span{color:#718997;font-size:11px}.spot-list{display:flex;flex-direction:column}.filters{display:grid;gap:8px;padding:12px}.filters input,.filters select,.upload-form input,.upload-form select,.upload-form textarea{width:100%;box-sizing:border-box;border:1px solid #c4d7e0;border-radius:4px;color:#365768;background:#fff;outline:none}.filters input{height:36px;padding:0 10px}.filters>div{display:grid;grid-template-columns:1fr 1fr;gap:8px}.filters select{height:34px;padding:0 8px}.classification{display:flex;gap:5px;overflow:auto;padding:0 12px 10px}.classification button,.comparison footer button{flex:none;padding:5px 8px;color:#557381;background:#f4f8fa;border:1px solid #d1e0e7;border-radius:4px;font-size:10px;cursor:pointer}.classification button.active,.comparison footer button.active{color:#fff;background:#168dab;border-color:#168dab}.spot-scroll{flex:1;min-height:0;overflow:auto}.spot-row{width:100%;min-height:70px;display:grid;grid-template-columns:18px 34px minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px 11px;color:#244b60;background:#fff;border:0;border-top:1px solid #e3ebef;text-align:left;cursor:pointer}.spot-row:hover,.spot-row.active{background:#e5f4f8}.spot-row.active{box-shadow:inset 4px 0 #1598bb}.spot-row.checked{background:#e9f8f2}.spot-row>i{width:32px;height:32px;display:grid;place-items:center;color:#fff;background:#3596b4;border-radius:50%;font-style:normal;font-weight:700}.spot-row span,.spot-row b,.spot-row small{display:block;min-width:0}.spot-row b,.spot-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.spot-row b{font-size:13px}.spot-row small{margin-top:5px;color:#718b98;font-size:10px}.spot-row small.source-task{margin-top:2px;color:#3790a8}.spot-row em{padding:4px 7px;color:#99680c;background:#fff2cf;border-radius:4px;font-size:10px;font-style:normal}.spot-row em.status-1{color:#19718b;background:#dcf2f8}.spot-row em.status-2,.spot-row em.status-3{color:#177054;background:#dcf3e9}.comparison{display:grid;grid-template-rows:48px minmax(0,1fr) 66px}.map-grid{min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:5px;background:#dbe5ea}.comparison footer{display:flex;align-items:center;justify-content:space-between;padding:0 13px;border-top:1px solid #d7e4ea}.comparison footer>div{display:flex;gap:5px}.spot-detail{display:flex;flex-direction:column}.spot-detail dl{margin:0;padding:0 14px}.spot-detail dl div{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #e5ecef;font-size:12px}.spot-detail dt{color:#78909c}.spot-detail dd{max-width:65%;margin:0;color:#294d60;font-weight:700;text-align:right;word-break:break-all}.spot-detail>p{margin:14px;padding:11px;color:#647d89;background:#f2f6f8;font-size:12px;line-height:1.6}.empty{min-height:100px;display:grid;place-items:center;color:#8297a2;font-size:12px}.error-text{color:#b84450}.dialog-mask{position:fixed;z-index:3000;inset:0;display:grid;place-items:center;background:#071b2cb8;backdrop-filter:blur(3px)}.upload-dialog{width:min(720px,calc(100vw - 36px));max-height:calc(100vh - 50px);overflow:auto;background:#fff;border-radius:8px;box-shadow:0 20px 60px #001d2e66}.upload-dialog>header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #d7e4ea}.upload-dialog>header b,.upload-dialog>header small{display:block}.upload-dialog>header b{font-size:19px}.upload-dialog>header small{margin-top:4px;color:#7d929d;font-size:11px}.upload-dialog>header button{border:0;background:transparent;color:#627c89;font-size:25px;cursor:pointer}.upload-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px 20px}.upload-form>label{display:flex;flex-direction:column;gap:6px}.upload-form span,.upload-form legend{color:#536f7d;font-size:12px;font-weight:700}.upload-form input,.upload-form select{height:36px;padding:0 9px}.upload-form input[type=file]{padding:6px}.upload-form textarea{height:70px;padding:9px;resize:vertical}.upload-form .wide,.dialog-error{grid-column:1/-1}.upload-form small{color:#7a929e;font-size:10px}.upload-form fieldset{display:flex;flex-wrap:wrap;gap:8px 16px;margin:0;padding:10px 12px;border:1px solid #cbdde5;border-radius:5px}.upload-form fieldset label{display:flex;align-items:center;gap:5px;font-size:12px}.upload-form fieldset input{width:auto;height:auto}.dialog-error{margin:0;padding:8px;color:#b63f4d;background:#ffedf0;font-size:12px}.upload-dialog>footer{display:flex;justify-content:flex-end;gap:9px;padding:13px 20px;border-top:1px solid #d7e4ea}.upload-dialog footer button.cancel,.task-create-dialog footer button.cancel{color:#587786;background:#fff;border-color:#bfd4de}.task-create-dialog{width:min(760px,calc(100vw - 36px));overflow:hidden;background:#f7fafb;border:1px solid #b7d2dd;border-radius:12px;box-shadow:0 24px 80px #001d2e80}.task-create-dialog>header{display:grid;grid-template-columns:46px minmax(0,1fr) 32px;align-items:center;gap:13px;padding:20px 24px;color:#fff;background:linear-gradient(125deg,#0f718f,#159db3)}.task-create-dialog>header b,.task-create-dialog>header small{display:block}.task-create-dialog>header b{font-size:20px}.task-create-dialog>header small{margin-top:5px;color:#d7f5fb;font-size:12px}.task-create-dialog>header>button{border:0;color:#dff7fa;background:transparent;font-size:28px;cursor:pointer}.task-dialog-icon{width:44px;height:44px;display:grid;place-items:center;border:1px solid #ffffff66;border-radius:12px;background:#ffffff20;font-size:20px;font-weight:800}.task-dialog-body{display:grid;gap:14px;padding:20px 24px}.create-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.create-summary article{min-width:0;padding:12px 14px;background:#fff;border:1px solid #d4e3e9;border-radius:7px}.create-summary span,.create-summary small{color:#748d99;font-size:11px}.create-summary strong{margin:0 4px;color:#168aa7;font-size:24px}.create-summary strong.text-value{display:block;overflow:hidden;margin:5px 0 0;color:#264e62;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.selected-spot-box{overflow:hidden;background:#fff;border:1px solid #d4e3e9;border-radius:7px}.section-title{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #e2ebef}.section-title b{font-size:13px}.section-title span{color:#6d8794;font-size:11px}.selected-spot-list{max-height:210px;overflow:auto}.selected-spot-list article{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #edf2f4}.selected-spot-list article:last-child{border-bottom:0}.selected-spot-list i{width:28px;height:28px;display:grid;place-items:center;color:#fff;background:#3298b2;border-radius:50%;font-size:11px;font-style:normal;font-weight:700}.selected-spot-list b,.selected-spot-list small{display:block}.selected-spot-list b{font-size:12px}.selected-spot-list small{overflow:hidden;margin-top:3px;color:#7a919c;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.selected-spot-list em{padding:4px 8px;color:#9a6a0c;background:#fff2cf;border-radius:4px;font-size:10px;font-style:normal}.priority-section{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;background:#fff;border:1px solid #d4e3e9;border-radius:7px}.priority-section b,.priority-section small{display:block}.priority-section b{font-size:13px}.priority-section small{margin-top:3px;color:#7b919b;font-size:10px}.priority-options{display:flex;gap:6px}.priority-options button{width:58px;height:32px;color:#53717f;background:#f6f9fa;border:1px solid #c9dae1;border-radius:5px;cursor:pointer}.priority-options button.active{color:#fff;background:#168fab;border-color:#168fab;box-shadow:0 4px 10px #168fab2e}.create-tip{display:flex;gap:10px;padding:10px 12px;color:#527181;background:#eaf5f8;border-left:3px solid #20a1bd;border-radius:4px;font-size:11px}.create-tip b{flex:none;color:#1d7187}.task-create-dialog>footer{display:flex;justify-content:flex-end;gap:9px;padding:14px 24px;background:#fff;border-top:1px solid #d7e4ea}@media(max-width:1350px){.review-layout{grid-template-columns:310px minmax(430px,1fr) 260px}.general-review{padding:10px}.spot-detail dl div{padding:9px 0}}@media(max-width:1050px){.review-layout{grid-template-columns:300px 1fr}.spot-detail{display:none}.stat-grid{grid-template-columns:repeat(2,1fr)}}
</style>

<style scoped lang="scss">
.center-column {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(310px, 1fr) 230px;
  gap: 12px;
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
  align-items: center;
  padding-left: 4px;
}

.stat-grid .heading-actions button {
  height: 36px;
  padding-inline: 13px;
  white-space: nowrap;
}

.right-column {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(390px, .95fr) minmax(340px, 1.05fr);
  gap: 12px;
}

.right-column .spot-detail {
  min-height: 0;
  overflow-y: auto;
}

.comparison {
  min-height: 0;
  grid-template-rows: 48px minmax(0, 1fr);
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
  padding: 9px 12px 11px;
}

.image-card {
  position: relative;
  flex: 0 0 174px;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  color: #294d60;
  background: #eef4f6;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}

.image-card:hover,
.image-card.displayed {
  border-color: #8ccbd9;
}

.image-card.active {
  border-color: #1297b7;
  box-shadow: 0 0 0 2px #1297b71f;
}

.image-card-map {
  width: 100%;
  height: 78px;
  pointer-events: none;
}

.image-card-caption {
  padding: 7px 9px;
  background: #fff;
}

.image-card-caption b,
.image-card-caption small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-card-caption b {
  font-size: 11px;
}

.image-card-caption small {
  margin-top: 3px;
  color: #718997;
  font-size: 9px;
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

  .center-column {
    gap: 10px;
    grid-template-rows: minmax(280px, 1fr) 215px;
  }

  .image-card {
    flex-basis: 154px;
  }
}
.filters select:hover,.filters select:focus{color:#fff;background:#075273;border-color:#1599c1}.filters select option{color:#365768;background:#fff}
.upload-file-field{min-width:0;display:flex;flex-direction:column;gap:6px}.upload-file-field>span{color:#536f7d;font-size:12px;font-weight:700}.file-picker{height:46px;box-sizing:border-box;display:grid;grid-template-columns:30px auto minmax(0,1fr);align-items:center;gap:9px;padding:0 12px;border:1px dashed #9ec7d7;border-radius:6px;background:#f5fbfd;cursor:pointer;transition:border-color .18s,background .18s,box-shadow .18s}.file-picker:hover,.file-picker:focus-within{border-color:#168ead;background:#eaf7fb;box-shadow:0 0 0 2px #168ead16}.file-picker.selected{border-style:solid;border-color:#74b9cb;background:#eff9f7}.file-picker__input{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0!important}.file-picker i{width:28px;height:28px;display:grid;place-items:center;color:#fff;background:#168fac;border-radius:50%;font-size:17px;font-style:normal;font-weight:800}.file-picker b{color:#176f89;font-size:13px;white-space:nowrap}.file-picker em{min-width:0;overflow:hidden;color:#78909c;font-size:12px;font-style:normal;text-align:right;text-overflow:ellipsis;white-space:nowrap}.file-picker.selected em{color:#24725f}.upload-form .file-picker__names{overflow:hidden;padding:5px 8px;color:#3f7485;background:#f2f7f9;border-radius:4px;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
</style>
