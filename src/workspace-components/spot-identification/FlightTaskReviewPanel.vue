<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElTooltip } from 'element-plus'
import { Calendar, FolderOpened, Picture, VideoCamera } from '@element-plus/icons-vue'
import { isMockMode } from '@/api/client'
import type { RecognitionSpotCreateResult } from '@/api/recognition-spot'
import {
  getFlightReviewMedia,
  getFlightReviewPlans,
  getFlightReviewTasks,
  type FlightReviewMedia,
  type FlightReviewPlan,
  type FlightReviewTask,
  type FlightReviewPage,
} from '@/api/flight-review'
import { useUserStore } from '@/stores/user'
import SpotUploadDialog from './SpotUploadDialog.vue'

interface PlanRow {
  plan: FlightReviewPlan
  tasks: FlightReviewTask[]
  media: FlightReviewMedia[]
  routeType: string
  taskType: string
  device: string
  completedAt: string
  durationMinutes?: number
  imageCount: number
  videoCount: number
  otherCount: number
  mediaFailed: boolean
  mediaPending: boolean
}

const user = useUserStore()
const plans = ref<FlightReviewPlan[]>([])
const tasks = ref<FlightReviewTask[]>([])
const mediaByTask = ref<Record<string, FlightReviewMedia[]>>({})
const failedMediaTasks = ref<string[]>([])
const completedMediaTaskIds = ref<string[]>([])
const loading = ref(false)
const mediaLoading = ref(false)
const error = ref('')
const planKeyword = ref('')
const routeTypeFilter = ref('')
const taskTypeFilter = ref('')
const deviceFilter = ref('')
const startDate = ref('')
const endDate = ref('')
const resultTypeFilter = ref('')
const currentPage = ref(1)
const pageSize = ref(16)
const detailPlanId = ref('')
const previewMediaId = ref('')
const mediaFullscreen = ref(false)
const previewState = ref<'loading' | 'ready' | 'error'>('loading')
const previewFailure = ref<'missing' | 'unsupported' | 'timeout' | 'image' | 'video'>('missing')
const previewImageUrl = ref('')
const imageFallbackUsed = ref(false)
const mediaPreviewStatus = ref<Record<string, 'ready' | 'error'>>({})
const uploadVisible = ref(false)
const uploadMessage = ref('')
const aiNoticePlanId = ref('')
let aiNoticeTimer: ReturnType<typeof setTimeout> | undefined
let videoLoadTimer: ReturnType<typeof setTimeout> | undefined
let loadVersion = 0

function showAiPendingNotice(planId: string) {
  if (aiNoticeTimer) clearTimeout(aiNoticeTimer)
  aiNoticePlanId.value = planId
  aiNoticeTimer = setTimeout(() => {
    aiNoticePlanId.value = ''
    aiNoticeTimer = undefined
  }, 3000)
}
function handleSpotUploaded(result: RecognitionSpotCreateResult) {
  uploadVisible.value = false
  uploadMessage.value = `成功导入 ${result.count || result.spotNos?.length || 0} 个疑似图斑，当前为待人工审核状态。可前往核查任务研判查看。`
}

function mediaKind(media: FlightReviewMedia): 'image' | 'video' | 'other' {
  const type = media.type.toLowerCase()
  const extension = media.fileName.split(/[?#]/)[0]?.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || ''
  if (type.includes('video') || ['mp4', 'mov', 'avi', 'm4v', 'mkv', 'webm'].includes(extension)) return 'video'
  if (type.includes('photo') || type.includes('image') || ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'webp', 'bmp'].includes(extension)) return 'image'
  return 'other'
}

function mediaKey(media: FlightReviewMedia) { return `${media.taskId}:${media.id}` }
function mediaRank(media: FlightReviewMedia) {
  if (mediaKind(media) === 'other' || !(media.originalUrl || (mediaKind(media) === 'image' && media.thumbnailUrl))) return 3
  const status = mediaPreviewStatus.value[mediaKey(media)]
  return status === 'ready' ? 0 : status === 'error' ? 2 : 1
}
function clearVideoTimer() {
  if (videoLoadTimer) clearTimeout(videoLoadTimer)
  videoLoadTimer = undefined
}
function markPreviewReady() {
  clearVideoTimer()
  const media = previewMedia.value
  if (!media) return
  previewState.value = 'ready'
  mediaPreviewStatus.value = { ...mediaPreviewStatus.value, [mediaKey(media)]: 'ready' }
}
function markPreviewFailed(reason: 'missing' | 'unsupported' | 'timeout' | 'image' | 'video') {
  clearVideoTimer()
  previewState.value = 'error'
  previewFailure.value = reason
  const media = previewMedia.value
  if (media) mediaPreviewStatus.value = { ...mediaPreviewStatus.value, [mediaKey(media)]: 'error' }
}
function handlePreviewImageError() {
  const media = previewMedia.value
  if (media && !imageFallbackUsed.value && media.thumbnailUrl && previewImageUrl.value !== media.thumbnailUrl) {
    imageFallbackUsed.value = true
    previewImageUrl.value = media.thumbnailUrl
    return
  }
  markPreviewFailed('image')
}
function initializePreview() {
  clearVideoTimer()
  const media = previewMedia.value
  previewState.value = 'loading'
  previewFailure.value = 'missing'
  previewImageUrl.value = ''
  imageFallbackUsed.value = false
  if (!media) return
  const kind = mediaKind(media)
  if (kind === 'other') { markPreviewFailed('unsupported'); return }
  if (kind === 'image') {
    previewImageUrl.value = media.originalUrl || media.thumbnailUrl
    imageFallbackUsed.value = !media.originalUrl && Boolean(media.thumbnailUrl)
    if (!previewImageUrl.value) markPreviewFailed('missing')
    return
  }
  if (!media.originalUrl) { markPreviewFailed('missing'); return }
  videoLoadTimer = setTimeout(() => {
    if (previewState.value === 'loading') markPreviewFailed('timeout')
  }, 20_000)
}
function previewErrorTitle() {
  if (previewFailure.value === 'missing') return '后端未返回可预览地址'
  if (previewFailure.value === 'unsupported') return '当前文件格式不支持在线预览'
  if (previewFailure.value === 'timeout') return '视频读取超时'
  return mediaKind(previewMedia.value!) === 'video' ? '当前浏览器无法播放该视频' : '图片加载失败'
}
function previewErrorDescription() {
  if (previewFailure.value === 'missing') return '当前文件缺少预览地址；若有原文件地址，可下载后在本地打开。'
  if (previewFailure.value === 'unsupported') return '该文件不是浏览器可直接显示的图片或视频格式，请下载原文件查看。'
  if (previewFailure.value === 'timeout') return '浏览器在 20 秒内未取得可播放数据，可能与视频分段读取、服务响应或编码有关。'
  if (previewFailure.value === 'video') return '可能由 HEVC/H.265 编码、跨域限制或服务端响应格式异常导致，可下载原视频后使用本地播放器打开。'
  return '原图及可用缩略图均未能读取，可能是文件地址失效、跨域限制或图片格式不受浏览器支持。'
}
function enterMediaFullscreen() {
  if (previewState.value === 'ready') mediaFullscreen.value = true
}
function switchDetailMedia(step: number) {
  const items = detailMedia.value
  const index = items.findIndex((item) => mediaKey(item) === previewMediaId.value)
  if (items.length < 2 || index < 0) return
  previewMediaId.value = mediaKey(items[(index + step + items.length) % items.length]!)
}
function handleDetailKeydown(event: KeyboardEvent) {
  if (!mediaFullscreen.value) return
  if (event.key === 'Escape') mediaFullscreen.value = false
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') switchDetailMedia(-1)
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') switchDetailMedia(1)
  else return
  event.preventDefault()
}
function closeDetail() {
  mediaFullscreen.value = false
  detailPlanId.value = ''
  previewMediaId.value = ''
  clearVideoTimer()
}

function display(value: string | undefined) { return value?.trim() || '--' }
function dateTime(value: string) { return value ? value.replace('T', ' ').slice(0, 16) : '--' }
function timeValue(value: string) {
  const result = Date.parse(value.replace(' ', 'T'))
  return Number.isFinite(result) ? result : undefined
}
function durationOf(task: FlightReviewTask) {
  const start = timeValue(task.startTime)
  const end = timeValue(task.endTime)
  return start === undefined || end === undefined || end < start ? undefined : (end - start) / 60000
}
function routeTypeLabel(value: string) {
  const normalized = value.toUpperCase()
  if (!normalized) return '--'
  if (normalized.includes('MAPPING2D') || normalized.includes('ORTHO')) return '正射航线'
  if (normalized.includes('MAPPING3D') || normalized.includes('OBLIQUE')) return '倾斜航线'
  if (normalized.includes('STRIP') || normalized.includes('LINEAR')) return '带状航线'
  if (normalized.includes('GRID')) return '网格航线'
  if (normalized.includes('WAYPOINT')) return '航点航线'
  return value
}
function taskTypeLabel(value: string) {
  // 后端暂未提供 type 枚举说明；按当前任务数据中 type 与计划名称的对应关系展示。
  if (value === '0') return '计划飞行'
  if (value === '1') return '一键起飞'
  return display(value)
}

async function readAll<T>(request: (pageNum: number) => Promise<FlightReviewPage<T>>): Promise<T[]> {
  const first = await request(1)
  const all = [...first.records]
  const pageCount = Math.ceil(first.total / first.pageSize)
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 4) {
    const pages = await Promise.all(Array.from({ length: Math.min(4, pageCount - pageNum + 1) }, (_, offset) => request(pageNum + offset)))
    pages.forEach((next) => all.push(...next.records))
  }
  return all
}

function publishTaskMedia(taskId: string, media: FlightReviewMedia[], version: number) {
  if (version !== loadVersion) return
  mediaByTask.value = { ...mediaByTask.value, [taskId]: media }
}

async function loadTaskMedia(taskId: string, version: number) {
  try {
    const first = await getFlightReviewMedia(taskId, 1)
    if (version !== loadVersion) return
    publishTaskMedia(taskId, first.records, version)
    const pageCount = Math.ceil(first.total / first.pageSize)
    if (pageCount > 1) {
      const remaining: FlightReviewMedia[][] = new Array(pageCount - 1)
      let nextPage = 2
      let pageFailed = false
      async function readNextPages() {
        while (nextPage <= pageCount && version === loadVersion && !pageFailed) {
          const pageNum = nextPage++
          try {
            const result = await getFlightReviewMedia(taskId, pageNum)
            remaining[pageNum - 2] = result.records
          } catch (error) {
            pageFailed = true
            throw error
          }
        }
      }
      const pageResults = await Promise.allSettled(Array.from({ length: Math.min(2, pageCount - 1) }, () => readNextPages()))
      if (pageResults.some((result) => result.status === 'rejected')) throw new Error('部分成果分页读取失败')
      if (version !== loadVersion) return
      publishTaskMedia(taskId, [...first.records, ...remaining.flat()], version)
    }
  } catch {
    if (version !== loadVersion) return
    failedMediaTasks.value = [...failedMediaTasks.value, taskId]
  } finally {
    if (version === loadVersion) completedMediaTaskIds.value = [...completedMediaTaskIds.value, taskId]
  }
}

async function loadData() {
  const version = ++loadVersion
  closeDetail()
  currentPage.value = 1
  plans.value = []
  tasks.value = []
  mediaByTask.value = {}
  failedMediaTasks.value = []
  completedMediaTaskIds.value = []
  mediaPreviewStatus.value = {}
  loading.value = true
  mediaLoading.value = false
  error.value = ''
  if (isMockMode()) {
    error.value = 'AI线索发现仅展示真实后端数据，请切换到真实接口模式。'
    loading.value = false
    return
  }
  try {
    const deptId = user.activeDeptId
    const [planList, taskList] = await Promise.all([
      readAll((pageNum) => getFlightReviewPlans(deptId, pageNum)),
      readAll((pageNum) => getFlightReviewTasks(deptId, pageNum)),
    ])
    if (version !== loadVersion) return
    plans.value = planList.filter((plan) => plan.id)
    const planIds = new Set(plans.value.map((plan) => plan.id))
    tasks.value = taskList.filter((task) => task.id && planIds.has(task.planId))
    loading.value = false
    mediaLoading.value = true
    const latestTaskTime = new Map<string, string>()
    tasks.value.forEach((task) => {
      if (task.endTime > (latestTaskTime.get(task.planId) || '')) latestTaskTime.set(task.planId, task.endTime)
    })
    const prioritizedPlans = [...plans.value].sort((left, right) =>
      (latestTaskTime.get(right.id) || '').localeCompare(latestTaskTime.get(left.id) || '') || left.name.localeCompare(right.name))
    const planRank = new Map(prioritizedPlans.map((plan, index) => [plan.id, index]))
    const taskQueue = [...tasks.value].sort((left, right) =>
      (planRank.get(left.planId) ?? Infinity) - (planRank.get(right.planId) ?? Infinity))
    let nextTask = 0
    async function scanTasks() {
      while (nextTask < taskQueue.length && version === loadVersion) {
        const task = taskQueue[nextTask++]
        if (task) await loadTaskMedia(task.id, version)
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, taskQueue.length) }, () => scanTasks()))
  } catch (reason) {
    if (version !== loadVersion) return
    plans.value = []
    tasks.value = []
    error.value = reason instanceof Error ? reason.message : '飞行成果读取失败。'
  } finally {
    if (version === loadVersion) {
      loading.value = false
      mediaLoading.value = false
    }
  }
}

const rows = computed<PlanRow[]>(() => plans.value.map((plan) => {
  const linkedTasks = tasks.value.filter((task) => task.planId === plan.id)
  const media = linkedTasks.flatMap((task) => mediaByTask.value[task.id] || [])
  const completedTimes = linkedTasks.map((task) => task.endTime).filter(Boolean).sort()
  const completedAt = completedTimes[completedTimes.length - 1] || ''
  const durations = linkedTasks.map(durationOf).filter((value): value is number => value !== undefined)
  const counts = { image: 0, video: 0, other: 0 }
  media.forEach((item) => { counts[mediaKind(item)] += 1 })
  return {
    plan,
    tasks: linkedTasks,
    media,
    routeType: plan.waylineType || linkedTasks.find((task) => task.waylineType)?.waylineType || '',
    taskType: linkedTasks.find((task) => task.type)?.type || '',
    device: plan.sn || linkedTasks.find((task) => task.sn)?.sn || '',
    completedAt,
    durationMinutes: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0)) : undefined,
    imageCount: counts.image,
    videoCount: counts.video,
    otherCount: counts.other,
    mediaFailed: linkedTasks.some((task) => failedMediaTasks.value.includes(task.id)),
    mediaPending: linkedTasks.some((task) => !completedMediaTaskIds.value.includes(task.id)),
  }
}).sort((left, right) => {
  if (!mediaLoading.value) {
    const mediaRank = (row: PlanRow) => row.media.length ? 2 : row.mediaFailed ? 1 : 0
    const resultOrder = mediaRank(right) - mediaRank(left)
    if (resultOrder) return resultOrder
  }
  return right.completedAt.localeCompare(left.completedAt) || left.plan.name.localeCompare(right.plan.name)
}))
const routeTypes = computed(() => [...new Set(rows.value.map((row) => row.routeType).filter(Boolean))])
const taskTypes = computed(() => [...new Set(rows.value.map((row) => row.taskType).filter(Boolean))])
const devices = computed(() => [...new Set(rows.value.map((row) => row.device).filter(Boolean))])
const filteredRows = computed(() => rows.value.filter((row) => {
  const query = planKeyword.value.trim().toLowerCase()
  if (query && !`${row.plan.name} ${row.plan.id} ${row.plan.waylineName}`.toLowerCase().includes(query)) return false
  if (routeTypeFilter.value && row.routeType !== routeTypeFilter.value) return false
  if (taskTypeFilter.value && row.taskType !== taskTypeFilter.value) return false
  if (deviceFilter.value && row.device !== deviceFilter.value) return false
  const completedDate = row.completedAt.slice(0, 10)
  if (startDate.value && (!completedDate || completedDate < startDate.value)) return false
  if (endDate.value && (!completedDate || completedDate > endDate.value)) return false
  if (resultTypeFilter.value === 'image' && !row.imageCount) return false
  if (resultTypeFilter.value === 'video' && !row.videoCount) return false
  if (resultTypeFilter.value === 'other' && !row.otherCount) return false
  return true
}))
const totalImages = computed(() => filteredRows.value.reduce((sum, row) => sum + row.imageCount, 0))
const totalVideos = computed(() => filteredRows.value.reduce((sum, row) => sum + row.videoCount, 0))
const totalMedia = computed(() => filteredRows.value.reduce((sum, row) => sum + row.media.length, 0))
const mediaComplete = computed(() => !mediaLoading.value && failedMediaTasks.value.length === 0)
const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)))
const pageRows = computed(() => filteredRows.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const detailRow = computed(() => rows.value.find((row) => row.plan.id === detailPlanId.value))
const detailMedia = computed(() => [...(detailRow.value?.media || [])].sort((left, right) => mediaRank(left) - mediaRank(right)))
const previewMedia = computed(() => detailMedia.value.find((item) => mediaKey(item) === previewMediaId.value) || detailMedia.value[0])
const previewOrdinal = computed(() => previewMedia.value ? detailMedia.value.findIndex((item) => mediaKey(item) === mediaKey(previewMedia.value!)) + 1 : 0)
watch(() => previewMedia.value ? `${mediaKey(previewMedia.value)}|${previewMedia.value.originalUrl}|${previewMedia.value.thumbnailUrl}` : '', initializePreview)
watch([planKeyword, routeTypeFilter, taskTypeFilter, deviceFilter, startDate, endDate, resultTypeFilter, pageSize], () => { currentPage.value = 1 })
watch(() => user.activeDeptId, () => { void loadData() }, { immediate: true })
onMounted(() => window.addEventListener('keydown', handleDetailKeydown))
onBeforeUnmount(() => {
  loadVersion += 1
  if (aiNoticeTimer) clearTimeout(aiNoticeTimer)
  clearVideoTimer()
  window.removeEventListener('keydown', handleDetailKeydown)
})

function resetFilters() {
  planKeyword.value = ''
  routeTypeFilter.value = ''
  taskTypeFilter.value = ''
  deviceFilter.value = ''
  startDate.value = ''
  endDate.value = ''
  resultTypeFilter.value = ''
}
function openDetail(row: PlanRow) {
  detailPlanId.value = row.plan.id
  previewMediaId.value = detailMedia.value[0] ? mediaKey(detailMedia.value[0]) : ''
}
function csvCell(value: string | number) {
  const safe = String(value).replace(/^[\s]*[=+@-]/, (prefix) => `'${prefix}`)
  return `"${safe.replace(/"/g, '""')}"`
}
function exportList() {
  if (!filteredRows.value.length || !mediaComplete.value) return
  const headers = ['飞行计划', '计划ID', '关联需求工单', '航线类型', '任务类型', '执行设备SN', '完成时间', '时长(分钟)', '图片', '视频', '其他文件']
  const content = [headers, ...filteredRows.value.map((row) => [
    row.plan.name, row.plan.id, '--', routeTypeLabel(row.routeType), taskTypeLabel(row.taskType), display(row.device),
    dateTime(row.completedAt), row.durationMinutes ?? '--', row.imageCount, row.videoCount, row.otherCount,
  ])].map((line) => line.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'AI线索发现清单.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="flight-review">
    <section class="filter-panel panel">
      <header><div><h2>成果筛选</h2><span>按计划、航线、任务与文件类型检索真实飞行成果</span></div><button class="text-button" type="button" @click="resetFilters">重置条件</button></header>
      <div class="filter-grid">
        <label>飞行计划<input v-model="planKeyword" class="plan-keyword-input" placeholder="计划名称 / 编号" /></label>
        <label>需求工单号<input placeholder="待关联接口接入" disabled title="后端暂未提供飞行计划与需求工单的关联关系" /></label>
        <label>航线类型<select v-model="routeTypeFilter"><option value="">全部航线</option><option v-for="item in routeTypes" :key="item" :value="item">{{ routeTypeLabel(item) }}</option></select></label>
        <label>任务类型<select v-model="taskTypeFilter"><option value="">全部类型</option><option v-for="item in taskTypes" :key="item" :value="item">{{ taskTypeLabel(item) }}</option></select></label>
        <label>飞行设备<select v-model="deviceFilter"><option value="">全部设备</option><option v-for="item in devices" :key="item" :value="item">{{ item }}</option></select></label>
        <label>完成日期 · 起<input v-model="startDate" type="date" /></label>
        <label>完成日期 · 止<input v-model="endDate" type="date" :min="startDate || undefined" /></label>
        <label>成果类型<select v-model="resultTypeFilter"><option value="">全部文件</option><option value="image">图片</option><option value="video">视频</option><option value="other">其他文件</option></select></label>
      </div>
    </section>

    <section class="summary-grid">
      <article class="summary-card panel"><i class="summary-icon" aria-hidden="true"><Calendar /></i><div><span>飞行计划</span><strong>{{ loading ? '—' : filteredRows.length }}</strong><small>当前筛选结果</small></div></article>
      <article class="summary-card panel"><i class="summary-icon" aria-hidden="true"><Picture /></i><div><span>图片文件</span><strong>{{ completedMediaTaskIds.length ? totalImages.toLocaleString() : '—' }}</strong><small>{{ mediaLoading ? '已读取部分，持续更新' : failedMediaTasks.length ? '部分任务读取失败' : '来自关联飞行任务' }}</small></div></article>
      <article class="summary-card panel"><i class="summary-icon" aria-hidden="true"><VideoCamera /></i><div><span>视频文件</span><strong>{{ completedMediaTaskIds.length ? totalVideos.toLocaleString() : '—' }}</strong><small>{{ mediaLoading ? '已读取部分，持续更新' : failedMediaTasks.length ? '部分任务读取失败' : '来自关联飞行任务' }}</small></div></article>
      <article class="summary-card panel"><i class="summary-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" focusable="false"><rect x="2.75" y="2.75" width="18.5" height="18.5" rx="2" /><path d="M12 2.75v18.5M2.75 12h18.5" opacity=".55" /><path d="m4.5 9 3-3 3.2 2.2m3.2 9.4 2.2-2.1 3.2 1" opacity=".8" /><path d="m4.5 19.5 3.2-4.2 2.8-1.6 3.2-3.5 5.8-5.7" stroke-width="2" /></svg></i><div><span>正射成果</span><strong>--</strong><small>待后端提供成果关联</small></div></article>
      <div class="summary-actions">
        <button type="button" class="summary-upload-button" @click="uploadVisible = true">线下AI识别结果上传</button>
      </div>
    </section>
    <p v-if="uploadMessage" class="upload-success" role="status">{{ uploadMessage }}</p>

    <section class="result-panel panel">
      <header><div><h2>全部飞行结果</h2><span>已载入计划 · {{ filteredRows.length }} 条</span><span v-if="mediaLoading" class="loading-note">正在读取成果文件 · {{ completedMediaTaskIds.length }}/{{ tasks.length }} 个任务</span></div><button type="button" class="outline-button" :disabled="!filteredRows.length || !mediaComplete" @click="exportList">导出清单</button></header>
      <div v-if="error" class="state error"><strong>成果读取失败</strong><span>{{ error }}</span><button type="button" @click="loadData">重新加载</button></div>
      <div v-else-if="loading" class="state">正在读取飞行计划与任务…</div>
      <div v-else-if="!filteredRows.length" class="state">{{ mediaLoading && resultTypeFilter ? '正在读取符合条件的成果…' : '当前条件下暂无飞行计划' }}</div>
      <template v-else>
        <div v-if="failedMediaTasks.length" class="warning">{{ failedMediaTasks.length }} 个飞行任务的素材未能读取；相关数量可能不完整，可重新加载。</div>
        <div class="table-scroll"><table><thead><tr><th>飞行计划 / 结果目录</th><th>关联需求工单</th><th>航线类型</th><th>任务类型</th><th>执行设备</th><th>完成时间</th><th>时长</th><th>成果文件</th><th>操作</th></tr></thead><tbody>
          <tr v-for="row in pageRows" :key="row.plan.id">
            <td><div class="plan-cell"><span class="folder-icon" aria-hidden="true"><FolderOpened /></span><div><b :title="row.plan.name">{{ display(row.plan.name) }}</b><small>计划 ID：{{ row.plan.id }}</small><small v-if="row.tasks.length">{{ row.tasks.length }} 个关联飞行任务</small></div></div></td>
            <td class="muted">--</td><td><span class="soft-tag">{{ routeTypeLabel(row.routeType) }}</span></td><td>{{ taskTypeLabel(row.taskType) }}</td><td>{{ display(row.device) }}<small v-if="row.plan.deviceType" class="cell-sub">{{ row.plan.deviceType }}</small></td><td>{{ dateTime(row.completedAt) }}</td><td>{{ row.durationMinutes === undefined ? '--' : `${row.durationMinutes} min` }}</td>
            <td><div v-if="row.mediaFailed && !row.media.length" class="media-count failed">素材读取失败</div><div v-else-if="!row.media.length" class="muted">{{ row.mediaPending ? '读取中…' : '--' }}</div><div v-else class="media-count"><span v-if="row.imageCount">图 {{ row.imageCount }}</span><span v-if="row.videoCount">视 {{ row.videoCount }}</span><span v-if="row.otherCount">其他 {{ row.otherCount }}</span><span v-if="row.mediaPending">统计中…</span><span v-else-if="row.mediaFailed" class="failed">部分读取失败</span></div></td>
            <td><div class="row-actions">
              <button class="view-button" type="button" :disabled="!row.media.length" @click="openDetail(row)">查看成果</button>
              <ElTooltip
                :popper-style="{ padding: '0', border: '1px solid #c4dde8', borderRadius: '8px', boxShadow: '0 10px 28px #123b5240' }"
                placement="top-end"
                effect="light"
                trigger="click"
                :visible="aiNoticePlanId === String(row.plan.id)"
                :disabled="!row.media.length"
              >
                <template #content><div class="ai-upload-tooltip is-pending" role="status"><strong>AI模型暂未在线接入</strong></div></template>
                <button class="view-button" type="button" :disabled="!row.media.length" :aria-label="`${display(row.plan.name)}：AI识别`" @click="showAiPendingNotice(String(row.plan.id))">AI识别</button>
              </ElTooltip>
            </div></td>
          </tr>
        </tbody></table></div>
        <footer><span>共 {{ filteredRows.length }} 条计划 · {{ mediaLoading ? `已读取 ${completedMediaTaskIds.length}/${tasks.length} 个任务成果` : failedMediaTasks.length ? '部分素材读取失败' : `已读取 ${totalMedia.toLocaleString()} 个文件` }}</span><div><button type="button" :disabled="currentPage <= 1" @click="currentPage--">‹</button><b>{{ currentPage }} / {{ pageCount }}</b><button type="button" :disabled="currentPage >= pageCount" @click="currentPage++">›</button><select v-model.number="pageSize" aria-label="每页条数"><option :value="8">8 条/页</option><option :value="16">16 条/页</option><option :value="32">32 条/页</option></select></div></footer>
      </template>
    </section>

    <div v-if="detailRow" class="detail-backdrop" :class="{ 'is-fullscreen': mediaFullscreen }" @click.self="closeDetail">
      <section class="detail-dialog" :class="{ 'is-fullscreen': mediaFullscreen }" role="dialog" aria-modal="true" aria-label="飞行成果详情">
        <header><div><span>飞行成果</span><h2>{{ display(detailRow.plan.name) }}</h2><small>计划 ID：{{ detailRow.plan.id }} · {{ detailRow.tasks.length }} 个飞行任务 · {{ detailRow.media.length }} 个文件</small></div><button type="button" aria-label="关闭" @click="closeDetail">×</button></header>
        <button v-if="mediaFullscreen" class="fullscreen-exit" type="button" aria-label="退出全屏" title="退出全屏（Esc）" @click="mediaFullscreen = false">× <span>退出全屏</span></button>
        <div class="detail-body">
          <aside aria-label="成果文件列表">
            <button v-for="item in detailMedia" :key="mediaKey(item)" type="button" :class="{ selected: previewMedia && mediaKey(previewMedia) === mediaKey(item), unavailable: mediaRank(item) >= 2 }" @click="previewMediaId = mediaKey(item)">
              <span>{{ mediaKind(item) === 'video' ? '▶' : mediaKind(item) === 'image' ? '▧' : '□' }}</span>
              <div><b :title="item.fileName">{{ display(item.fileName) }}</b><small>{{ dateTime(item.shootTime) }}<em v-if="mediaRank(item) >= 2"> · 无法预览</em></small></div>
            </button>
          </aside>
          <main>
            <template v-if="previewMedia">
              <div class="media-stage" :class="{ 'can-expand': previewState === 'ready' && mediaKind(previewMedia) === 'image' }">
                <video v-if="mediaKind(previewMedia) === 'video' && previewState !== 'error'" :key="mediaKey(previewMedia)" :src="previewMedia.originalUrl" controls playsinline preload="auto" @loadeddata="markPreviewReady" @canplay="markPreviewReady" @playing="markPreviewReady" @error="markPreviewFailed('video')" @click="enterMediaFullscreen" />
                <img v-else-if="mediaKind(previewMedia) === 'image' && previewState !== 'error'" :key="`${mediaKey(previewMedia)}:${previewImageUrl}`" :src="previewImageUrl" :alt="previewMedia.fileName" @load="markPreviewReady" @error="handlePreviewImageError" @click="enterMediaFullscreen" />
                <div v-if="previewState === 'loading'" class="preview-loading" role="status">正在读取{{ mediaKind(previewMedia) === 'video' ? '视频' : '图片' }}…</div>
                <section v-if="previewState === 'error'" class="preview-unavailable" role="status">
                  <span class="preview-unavailable__icon">!</span>
                  <h3>{{ previewErrorTitle() }}</h3><p>{{ previewErrorDescription() }}</p>
                  <div><button type="button" @click="initializePreview">重新尝试</button><a v-if="previewMedia.originalUrl" :href="previewMedia.originalUrl" :download="previewMedia.fileName" target="_blank" rel="noopener noreferrer">下载原{{ mediaKind(previewMedia) === 'video' ? '视频' : mediaKind(previewMedia) === 'image' ? '图片' : '文件' }}</a></div>
                  <small v-if="!previewMedia.originalUrl">后端未提供原文件地址，暂无法下载。</small>
                </section>
                <button v-if="previewState === 'ready' && !mediaFullscreen" type="button" class="expand-preview" @click="enterMediaFullscreen">⛶ 全屏查看</button>
                <button v-if="mediaFullscreen && detailMedia.length > 1" type="button" class="fullscreen-nav previous" aria-label="上一个文件" title="上一项（← / ↑）" @click="switchDetailMedia(-1)">‹</button>
                <button v-if="mediaFullscreen && detailMedia.length > 1" type="button" class="fullscreen-nav next" aria-label="下一个文件" title="下一项（→ / ↓）" @click="switchDetailMedia(1)">›</button>
              </div>
              <footer><span :title="previewMedia.fileName">{{ display(previewMedia.fileName) }}<small v-if="mediaFullscreen">　{{ previewOrdinal }} / {{ detailMedia.length }} · 方向键切换 · Esc 退出</small><small v-else-if="imageFallbackUsed && previewState === 'ready'">　未提供原图或原图无法加载，当前显示缩略图</small></span><a v-if="previewMedia.originalUrl" :href="previewMedia.originalUrl" :download="previewMedia.fileName" target="_blank" rel="noopener noreferrer">下载原{{ mediaKind(previewMedia) === 'video' ? '视频' : mediaKind(previewMedia) === 'image' ? '图片' : '文件' }}</a></footer>
            </template>
            <div v-else class="preview-empty">该飞行计划暂无可浏览成果</div>
          </main>
        </div>
      </section>
    </div>
    <SpotUploadDialog v-if="uploadVisible" @close="uploadVisible = false" @uploaded="handleSpotUploaded" />
  </div>
</template>

<style scoped lang="scss">
.plan-keyword-input:focus::placeholder { opacity: 0; }
.summary-card>.summary-icon { width:40px; height:40px; flex:0 0 40px; color:#168bab; border:1px solid #d3edf3; border-radius:10px; background:linear-gradient(145deg,#f4fcfe,#e3f5f9); box-shadow:inset 0 1px #fff; }
.summary-card>.summary-icon svg { width:21px; height:21px; }
.summary-card:nth-child(2)>.summary-icon { color:#2786b0; border-color:#d8ebf3; background:linear-gradient(145deg,#f5fbfe,#e8f4fa); }
.summary-card:nth-child(3)>.summary-icon { color:#3b82b4; border-color:#dbe9f5; background:linear-gradient(145deg,#f7fbff,#eaf2fa); }
.summary-card:nth-child(4)>.summary-icon { color:#299584; border-color:#d5ede7; background:linear-gradient(145deg,#f6fdfb,#e7f8f2); }
.folder-icon { border:1px solid #d4ecf2; background:#edf9fc; }
.folder-icon svg { width:17px; height:17px; }
.flight-review{height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:14px;background:#edf3f7;color:#24495d;overflow:auto}.panel{background:#fff;border:1px solid #d6e5ec;border-radius:7px;box-shadow:0 2px 10px #173c500a}.filter-panel{padding:14px 16px 16px}.filter-panel>header,.result-panel>header{display:flex;justify-content:space-between;align-items:center;gap:15px}.filter-panel h2,.result-panel h2{display:inline;margin:0;font-size:16px;color:#24495c}.filter-panel header span,.result-panel header span{margin-left:10px;color:#8aa0ab;font-size:11px}.text-button{border:0;background:none;color:#1593b2;font-size:12px;font-weight:700;cursor:pointer}.text-button:hover{text-decoration:underline}.filter-grid{display:grid;grid-template-columns:1.15fr 1.05fr repeat(6,minmax(105px,1fr));gap:10px;margin-top:16px}.filter-grid label{min-width:0;display:grid;gap:6px;color:#758e9c;font-size:11px;font-weight:700}.filter-grid input,.filter-grid select{width:100%;height:37px;box-sizing:border-box;padding:0 10px;color:#315568;background:#f9fcfd;border:1px solid #c9dce6;border-radius:4px;outline:none;font:inherit;font-size:12px}.filter-grid input:focus,.filter-grid select:focus{border-color:#1696b7;box-shadow:0 0 0 3px #159ac01a}.filter-grid input:disabled{color:#a7b9c1;background:#f3f6f7;cursor:not-allowed}.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) minmax(240px,1.32fr);gap:10px}.summary-card{min-height:86px;box-sizing:border-box;display:flex;align-items:center;gap:13px;padding:13px 16px}.summary-card>i{width:38px;height:38px;display:grid;place-items:center;flex:none;color:#198faf;background:#e6f6fa;border-radius:50%;font-size:17px;font-style:normal}.summary-card span,.summary-card small{display:block;color:#8ba1ac;font-size:11px}.summary-card strong{display:block;margin:2px 0;color:#1d6580;font-size:24px;line-height:1}.summary-tip{padding:13px 15px;background:linear-gradient(125deg,#f7fdff,#edf8fb);border-color:#b8dce9}.summary-tip b{color:#207d9c;font-size:13px}.summary-tip p{margin:7px 0 0;color:#648393;font-size:11px;line-height:1.55}.summary-tip code{font-family:inherit;color:#207d9c}.result-panel{flex:1;min-height:300px;display:flex;flex-direction:column;overflow:hidden}.result-panel>header{min-height:54px;box-sizing:border-box;padding:0 16px;border-bottom:1px solid #dce9ee}.result-panel .loading-note{color:#238aa5}.outline-button,.view-button{border:1px solid #9acddd;border-radius:4px;background:#edf9fc;color:#137e9f;font-size:12px;font-weight:700;cursor:pointer}.outline-button{height:32px;padding:0 12px}.view-button{height:31px;padding:0 11px;white-space:nowrap}.outline-button:hover:not(:disabled),.view-button:hover:not(:disabled){background:#d7f2f9;border-color:#4aaec7}.outline-button:disabled,.view-button:disabled{opacity:.55;cursor:not-allowed}.warning{padding:7px 16px;color:#9a6727;background:#fff7e7;border-bottom:1px solid #f4dfbd;font-size:11px}.table-scroll{flex:1;min-height:0;overflow:auto}table{width:100%;min-width:1210px;border-collapse:collapse;table-layout:fixed}th{height:45px;padding:0 12px;color:#728c9c;background:#eef6fa;text-align:left;font-size:11px;font-weight:700}th:nth-child(1){width:22%}th:nth-child(2){width:11%}th:nth-child(3){width:8%}th:nth-child(4){width:10%}th:nth-child(5){width:11%}th:nth-child(6){width:12%}th:nth-child(7){width:7%}th:nth-child(8){width:11%}th:nth-child(9){width:8%}td{height:69px;box-sizing:border-box;padding:9px 12px;border-bottom:1px solid #e5eef2;font-size:12px;color:#48677a}tbody tr:hover{background:#f8fcfd}.plan-cell{display:flex;align-items:center;gap:10px;min-width:0}.folder-icon{width:29px;height:29px;display:grid;place-items:center;flex:none;color:#1696b7;background:#e8f6fa;border-radius:5px}.plan-cell>div{min-width:0}.plan-cell b,.plan-cell small,.cell-sub{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plan-cell b{color:#315b70;font-size:13px}.plan-cell small,.cell-sub{margin-top:3px;color:#91a6b0;font-size:10px}.muted{color:#9aadb7}.soft-tag{display:inline-block;max-width:100%;overflow:hidden;padding:5px 7px;color:#28849f;background:#e9f6fa;border-radius:3px;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.media-count{display:flex;flex-wrap:wrap;gap:4px}.media-count span{padding:3px 5px;color:#2189a8;background:#e8f7fb;border-radius:3px;font-size:10px}.media-count.failed{color:#b26942}.result-panel>footer{min-height:48px;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0 15px;color:#8ca3af;border-top:1px solid #e0eaef;font-size:11px}.result-panel>footer>div{display:flex;align-items:center;gap:7px}.result-panel footer button,.result-panel footer select{height:29px;padding:0 8px;border:1px solid #d6e4ea;border-radius:4px;color:#547285;background:#fff;cursor:pointer}.result-panel footer button:disabled{opacity:.4;cursor:not-allowed}.result-panel footer b{min-width:44px;text-align:center}.state{flex:1;min-height:200px;display:grid;align-content:center;justify-items:center;gap:9px;color:#8ba1ac;font-size:13px}.state.error{color:#a24d52}.state button{padding:7px 12px;border:0;border-radius:4px;color:#fff;background:#168ead;cursor:pointer}.detail-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:28px;background:#091c2da8}.detail-dialog{width:min(1100px,100%);height:min(720px,100%);display:flex;flex-direction:column;overflow:hidden;background:#fff;border-radius:9px;box-shadow:0 25px 80px #06172766}.detail-dialog>header{min-height:76px;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;padding:13px 22px;border-bottom:1px solid #dce8ed}.detail-dialog>header span{color:#1994b3;font-size:11px;font-weight:700}.detail-dialog h2{margin:3px 0;color:#24495c;font-size:18px}.detail-dialog>header small{color:#8fa3ac;font-size:11px}.detail-dialog>header button{width:31px;height:31px;border:0;border-radius:4px;color:#688494;background:#f0f5f7;font-size:22px;cursor:pointer}.detail-body{flex:1;min-height:0;display:grid;grid-template-columns:280px minmax(0,1fr)}.detail-body aside{overflow:auto;background:#f7fafb;border-right:1px solid #dce8ed}.detail-body aside button{width:100%;display:flex;align-items:center;gap:9px;padding:11px 13px;border:0;border-bottom:1px solid #e2ebef;color:#496779;background:transparent;text-align:left;cursor:pointer}.detail-body aside button.selected,.detail-body aside button:hover{background:#e6f5f9}.detail-body aside button>span{width:30px;height:30px;display:grid;place-items:center;flex:none;color:#198eac;background:#d6eef5;border-radius:4px}.detail-body aside button>div{min-width:0}.detail-body aside b,.detail-body aside small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.detail-body aside b{font-size:11px}.detail-body aside small{margin-top:4px;color:#90a5af;font-size:10px}.detail-body main{min-width:0;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#e9f0f4}.detail-body main img,.detail-body main video{max-width:100%;max-height:calc(100% - 55px);object-fit:contain}.preview-empty{color:#8ca4b1;font-size:13px}.detail-body main footer{width:100%;min-height:50px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:15px;margin-top:auto;padding:0 17px;background:#fff;border-top:1px solid #dce8ed;color:#546f7e;font-size:12px}.detail-body main footer span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.detail-body main footer a{flex:none;color:#168eae;text-decoration:none}@media(max-width:1500px){.filter-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.summary-tip{grid-column:1/-1}}@media(max-width:800px){.filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-body{grid-template-columns:190px minmax(0,1fr)}}
.flight-review > .filter-panel {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
}
.flight-review .filter-grid label {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
  white-space: nowrap;
}
.flight-review .filter-grid input,
.flight-review .filter-grid select {
  min-width: 0;
  font-weight: 400;
}
.flight-review .filter-grid select:hover,
.flight-review .filter-grid select:focus,
.flight-review .filter-grid input[type="date"]:hover,
.flight-review .filter-grid input[type="date"]:focus,
.flight-review .result-panel > footer select:hover,
.flight-review .result-panel > footer select:focus {
  color: #fff;
  background: #075273;
  border-color: #1599c1;
}
.flight-review .filter-grid select option,
.flight-review .result-panel > footer select option {
  color: #315568;
  background: #fff;
}
.flight-review .filter-grid input[type="date"]:hover::-webkit-calendar-picker-indicator,
.flight-review .filter-grid input[type="date"]:focus::-webkit-calendar-picker-indicator {
  filter: brightness(0) invert(1);
}
.flight-review .summary-grid { grid-template-columns: repeat(4,minmax(0,1fr)) 240px; }
.summary-actions { min-height: 86px; box-sizing: border-box; display: flex; align-items: stretch; justify-content: center; flex-direction: column; padding: 0; }
.summary-upload-button { display: grid; flex: 1; place-items: center; width: 100%; min-height: 86px; box-sizing: border-box; padding: 12px 16px; color: #187e9d; background: #edf8fb; border: 1px solid #9acddd; border-radius: 7px; box-shadow: 0 2px 10px #173c500a; font-size: 16px; font-weight: 700; letter-spacing: .3px; cursor: pointer; transition: color .18s,background .18s,border-color .18s,box-shadow .18s; }
.summary-upload-button:hover,.summary-upload-button:focus-visible { color: #fff; background: #168eae; border-color: #168eae; box-shadow: 0 2px 8px #08779c32; outline: none; }
.row-actions { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.row-actions .view-button { padding: 0 8px; }
.flight-review th:nth-child(1) { width: 20%; }
.flight-review th:nth-child(2) { width: 10%; }
.flight-review th:nth-child(4) { width: 9%; }
.flight-review th:nth-child(5) { width: 10%; }
.flight-review th:nth-child(8) { width: 10%; }
.flight-review th:nth-child(9) { width: 14%; }
.ai-upload-tooltip { padding: 9px 12px; border-radius: 7px; background: linear-gradient(135deg,#fff,#f3fafc); font-family: "Microsoft YaHei",sans-serif; }
.ai-upload-tooltip strong { display: block; color: #173f57; font-size: 12px; line-height: 1.4; white-space: nowrap; }
.ai-upload-tooltip.is-pending { background: linear-gradient(135deg,#fff,#fff5f6); }
.ai-upload-tooltip.is-pending strong { color: #c43b4d; }
.upload-success { margin: 0; padding: 8px 12px; color: #147254; background: #def4eb; border-radius: 5px; font-size: 12px; }
@media(max-width:1500px) { .flight-review .summary-grid { grid-template-columns: repeat(4,minmax(0,1fr)) 220px; } .flight-review .summary-actions { grid-column: auto; } }
@media(max-width:1050px) { .flight-review .summary-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .flight-review .summary-actions { grid-column: 1/-1; flex-direction: row; } }
.detail-dialog { position: relative; width: min(1280px,100%); height: min(800px,100%); }
.detail-body aside button.unavailable { opacity: .7; }
.detail-body aside button small em { color: #b77352; font-style: normal; }
.detail-body main { align-items: stretch; justify-content: stretch; background: #132836; }
.media-stage { position: relative; flex: 1; width: 100%; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #142936; }
.detail-body main .media-stage img,
.detail-body main .media-stage video { display: block; width: 100%; height: 100%; max-width: none; max-height: none; object-fit: contain; }
.media-stage.can-expand img { cursor: zoom-in; }
.preview-loading { position: absolute; inset: 0; display: grid; place-items: center; color: #d7e8ee; background: #152b35aa; font-size: 13px; pointer-events: none; }
.preview-unavailable { max-width: 430px; margin: 20px; padding: 26px 30px; border: 1px solid #d2e3e8; border-radius: 10px; color: #345568; background: #f7fbfc; box-shadow: 0 12px 32px #071d2a55; text-align: center; }
.preview-unavailable__icon { width: 36px; height: 36px; display: grid; place-items: center; margin: 0 auto 12px; border-radius: 50%; color: #b26c36; background: #fff0d9; font-size: 21px; font-weight: 700; }
.preview-unavailable h3 { margin: 0; color: #244d63; font-size: 16px; }
.preview-unavailable p { margin: 10px 0 16px; color: #65808e; font-size: 12px; line-height: 1.7; }
.preview-unavailable div { display: flex; justify-content: center; flex-wrap: wrap; gap: 9px; }
.preview-unavailable button,.preview-unavailable a { min-height: 34px; box-sizing: border-box; display: inline-grid; place-items: center; padding: 0 13px; border: 1px solid #9bcbd9; border-radius: 5px; color: #157d9c; background: #ecf8fb; font-size: 12px; font-weight: 700; text-decoration: none; cursor: pointer; }
.preview-unavailable a { border-color: #168eae; color: #fff; background: #168eae; }
.preview-unavailable small { display: block; margin-top: 12px; color: #8499a4; font-size: 11px; }
.expand-preview { position: absolute; z-index: 2; top: 14px; right: 14px; padding: 8px 12px; border: 1px solid #e6f4f9aa; border-radius: 5px; color: #fff; background: #0c344bc7; font-size: 12px; font-weight: 700; cursor: pointer; }
.expand-preview:hover { background: #147c9d; }
.detail-body main footer { margin-top: 0; }
.detail-body main footer small { color: #8199a5; font-size: 11px; }
.detail-body main footer a { font-weight: 700; white-space: nowrap; }
.detail-backdrop.is-fullscreen { padding: 0; background: #07131deb; }
.detail-dialog.is-fullscreen { width: 100vw; height: 100dvh; max-width: none; border-radius: 0; background: #081822; }
.detail-dialog.is-fullscreen > header,.detail-dialog.is-fullscreen .detail-body aside { display: none; }
.detail-dialog.is-fullscreen .detail-body { grid-template-columns: minmax(0,1fr); }
.detail-dialog.is-fullscreen .detail-body main { background: #081822; }
.detail-dialog.is-fullscreen .media-stage { background: #081822; }
.detail-dialog.is-fullscreen .media-stage img { cursor: default; }
.detail-dialog.is-fullscreen .detail-body main footer { border-color: #203949; color: #e6f4f8; background: #102735; }
.detail-dialog.is-fullscreen .detail-body main footer small { color: #a8c0cb; }
.fullscreen-exit { position: absolute; z-index: 5; top: 16px; right: 20px; display: flex; align-items: center; gap: 7px; padding: 7px 12px; border: 1px solid #ffffff65; border-radius: 6px; color: #fff; background: #0b3449cc; font-size: 24px; line-height: 1; cursor: pointer; }
.fullscreen-exit span { font-size: 13px; font-weight: 700; }
.fullscreen-exit:hover { background: #187f9f; }
.fullscreen-nav { position: absolute; z-index: 4; top: 50%; width: 44px; height: 52px; border: 1px solid #ffffff66; border-radius: 7px; color: #fff; background: #0b3449b8; font-size: 35px; line-height: 1; transform: translateY(-50%); cursor: pointer; }
.fullscreen-nav:hover { background: #187f9f; }
.fullscreen-nav.previous { left: 24px; }.fullscreen-nav.next { right: 24px; }
@media(max-width:800px) { .detail-backdrop:not(.is-fullscreen) { padding: 8px; } .detail-body { grid-template-columns: 180px minmax(0,1fr); } .preview-unavailable { margin: 12px; padding: 18px; } .fullscreen-nav.previous { left: 8px; } .fullscreen-nav.next { right: 8px; } }
</style>
