<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PrimaryHeader from '@/components/PrimaryHeader.vue'
import { getFlightTaskMedia, getUavFlightTaskOptions, type UavFlightTaskOption } from '@/api/patrol'
import type { LiveMediaItem } from '@/mocks/patrol-live'

type DataTab = 'collection' | 'recognition'
interface TaskMediaState { list: LiveMediaItem[]; all: LiveMediaItem[]; total: number; loading: boolean; error: string }

const props = withDefaults(defineProps<{ embedded?: boolean; activeTab?: DataTab }>(), { embedded: false, activeTab: 'collection' })
const keyword = ref('')
const mediaTypeFilter = ref('')
const taskFilter = ref('')
const timeFilter = ref('')
const deviceFilter = ref('')
const statusFilter = ref('')
const loading = ref(false)
const mediaScanLoading = ref(false)
const mediaLoadErrors = ref(0)
const error = ref('')
const tasks = ref<UavFlightTaskOption[]>([])
const total = ref(0)
const mediaSummaryTotal = ref<number>()
const mediaByTask = ref<Record<string, TaskMediaState>>({})
const currentPage = ref(1)
const pageSize = ref(40)
const previewMedia = ref<LiveMediaItem>()
const previewItems = ref<LiveMediaItem[]>([])
const previewIndex = ref(-1)
const previewScale = ref(1)
const previewOffsetX = ref(0)
const previewOffsetY = ref(0)
const previewDragging = ref(false)
const videoPlaybackReady = ref(false)
const videoPlaybackFailed = ref(false)
const videoFailureReason = ref<'timeout' | 'unsupported' | ''>('')
let previewPointerId: number | undefined
let previewDragStartX = 0
let previewDragStartY = 0
let previewDragOriginX = 0
let previewDragOriginY = 0
let videoLoadTimer: number | undefined
let loadVersion = 0

const deviceOptions = computed(() => [...new Set(tasks.value.map((item) => item.deviceName).filter(Boolean))])
const taskOptions = computed(() => [...new Map(tasks.value.map((item) => [item.id, item.name])).entries()]
  .sort(([leftId], [rightId]) => {
    const left = mediaByTask.value[leftId]
    const right = mediaByTask.value[rightId]
    const leftEmpty = Boolean(left && !left.loading && !left.error && left.total === 0)
    const rightEmpty = Boolean(right && !right.loading && !right.error && right.total === 0)
    return Number(leftEmpty) - Number(rightEmpty)
  }))
const filteredMedia = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  const cutoff = timeFilter.value ? Date.now() - Number(timeFilter.value) * 86400000 : 0
  return tasks.value.flatMap((task) => {
    if ((taskFilter.value && task.id !== taskFilter.value) || (deviceFilter.value && task.deviceName !== deviceFilter.value)) return []
    const taskMatches = `${task.name}${task.waylineName}${task.deviceName}${task.id}`.toLowerCase().includes(query)
    return (mediaByTask.value[task.id]?.list || [])
      .filter((media) => {
        if (mediaTypeFilter.value && (isVideoMedia(media) ? 'video' : 'image') !== mediaTypeFilter.value) return false
        if (query && !taskMatches && !media.name.toLowerCase().includes(query)) return false
        if (!cutoff) return true
        const timestamp = mediaTimestamp(media, task)
        return Number.isFinite(timestamp) && timestamp >= cutoff
      })
      .map((media) => ({ media, task }))
  }).sort((left, right) => mediaTimestamp(right.media, right.task) - mediaTimestamp(left.media, left.task))
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredMedia.value.length / pageSize.value)))
const pageMedia = computed(() => filteredMedia.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const visiblePages = computed(() => {
  const start = Math.max(1, Math.min(currentPage.value - 2, pageCount.value - 4))
  return Array.from({ length: Math.min(5, pageCount.value) }, (_, index) => start + index)
})
const deviceCount = computed(() => deviceOptions.value.length)
const previewImageStyle = computed(() => ({
  transform: `translate3d(${previewOffsetX.value}px, ${previewOffsetY.value}px, 0) scale(${previewScale.value})`,
}))

function mediaExtension(media: LiveMediaItem) {
  const name = media.name.split(/[?#]/)[0]?.trim() || ''
  return name.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || ''
}
function isVideoMedia(media: LiveMediaItem) {
  const declaredType = String(media.mediaType || '').toUpperCase()
  return ['MP4', 'MOV', 'M4V', 'AVI', 'MKV', 'WEBM'].includes(mediaExtension(media)) || declaredType.includes('VIDEO')
}
function isAerialMedia(media: LiveMediaItem) {
  const name = media.name.split(/[?#]/)[0]?.trim() || ''
  const type = String(media.mediaType || '').trim().toUpperCase()
  return !/\.(OBS|NAV|MRK|RTK)$/i.test(name) && !['OBS', 'NAV', 'MRK', 'RTK'].includes(type)
}
async function refreshEligibleMediaTotal(taskList: UavFlightTaskOption[], version: number) {
  mediaSummaryTotal.value = undefined
  mediaScanLoading.value = true
  mediaLoadErrors.value = 0
  let eligibleCount = 0
  let nextTaskIndex = 0
  // Publish each page as soon as it arrives. A large task must not hold back the other tasks.
  async function scanTask(task: UavFlightTaskOption) {
    const eligible: LiveMediaItem[] = []
    let received = 0
    let expectedTotal = Number.POSITIVE_INFINITY
    let pageNum = 1
    try {
      while (received < expectedTotal) {
        const result = await getFlightTaskMedia({ taskId: task.id, pageNum, pageSize: 200 })
        if (version !== loadVersion) return
        received += result.list.length
        expectedTotal = result.total
        const batch = result.list.filter(isAerialMedia)
        eligible.push(...batch)
        eligibleCount += batch.length
        mediaSummaryTotal.value = eligibleCount
        const hasMore = result.list.length > 0 && received < expectedTotal
        mediaByTask.value = {
          ...mediaByTask.value,
          [task.id]: { list: [...eligible], all: [...eligible], total: eligible.length, loading: hasMore, error: '' },
        }
        if (!hasMore) break
        pageNum += 1
      }
    } catch (reason) {
      if (version !== loadVersion) return
      mediaLoadErrors.value += 1
      mediaByTask.value = {
        ...mediaByTask.value,
        [task.id]: { list: [...eligible], all: [...eligible], total: eligible.length, loading: false, error: reason instanceof Error ? reason.message : '素材读取失败' },
      }
    }
  }
  async function worker() {
    while (nextTaskIndex < taskList.length && version === loadVersion) {
      const task = taskList[nextTaskIndex++]
      if (task) await scanTask(task)
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(5, taskList.length) }, () => worker()))
    if (version === loadVersion) mediaSummaryTotal.value = eligibleCount
  } finally {
    if (version === loadVersion) mediaScanLoading.value = false
  }
}
function setPage(page: number) { currentPage.value = Number.isFinite(page) ? Math.min(Math.max(1, Math.trunc(page)), pageCount.value) : 1 }
function mediaSource(media: LiveMediaItem) { return media.thumbnail || media.originalUrl || '' }
function mediaTimestamp(media: LiveMediaItem, task: UavFlightTaskOption) {
  const captured = Date.parse((media.capturedAt || '').replace(' ', 'T'))
  if (Number.isFinite(captured)) return captured
  const created = Date.parse(task.createTime.replace(' ', 'T'))
  return Number.isFinite(created) ? created : 0
}
function resetPreviewTransform() {
  previewScale.value = 1
  previewOffsetX.value = 0
  previewOffsetY.value = 0
  previewDragging.value = false
  previewPointerId = undefined
}
function resetVideoPlayback() {
  window.clearTimeout(videoLoadTimer)
  videoPlaybackReady.value = false
  videoPlaybackFailed.value = false
  videoFailureReason.value = ''
}
function beginVideoPlaybackCheck() {
  window.clearTimeout(videoLoadTimer)
  videoLoadTimer = window.setTimeout(() => {
    if (videoPlaybackReady.value) return
    videoFailureReason.value = 'timeout'
    videoPlaybackFailed.value = true
  }, 20_000)
}
function openMedia(media: LiveMediaItem, items: LiveMediaItem[]) {
  if (!media.originalUrl && !media.thumbnail) return
  previewItems.value = items.filter((item) => item.originalUrl || item.thumbnail)
  previewIndex.value = previewItems.value.findIndex((item) => item === media)
  previewMedia.value = previewItems.value[previewIndex.value] || media
  resetPreviewTransform()
  resetVideoPlayback()
  if (isVideoMedia(previewMedia.value)) beginVideoPlaybackCheck()
}
function closePreview() {
  previewMedia.value = undefined
  previewItems.value = []
  previewIndex.value = -1
  resetPreviewTransform()
  resetVideoPlayback()
}
function switchPreview(step: number) {
  if (!previewItems.value.length) return
  previewIndex.value = (previewIndex.value + step + previewItems.value.length) % previewItems.value.length
  const nextMedia = previewItems.value[previewIndex.value]
  if (!nextMedia) return
  previewMedia.value = nextMedia
  resetPreviewTransform()
  resetVideoPlayback()
  if (isVideoMedia(nextMedia)) beginVideoPlaybackCheck()
}
function markVideoReady() {
  window.clearTimeout(videoLoadTimer)
  videoPlaybackReady.value = true
  videoPlaybackFailed.value = false
  videoFailureReason.value = ''
}
function markVideoFailed() {
  window.clearTimeout(videoLoadTimer)
  videoPlaybackReady.value = false
  videoPlaybackFailed.value = true
  videoFailureReason.value = 'unsupported'
}
function retryVideoPlayback() {
  resetVideoPlayback()
  beginVideoPlaybackCheck()
}
function zoomPreview(event: WheelEvent) {
  if (!previewMedia.value || isVideoMedia(previewMedia.value)) return
  event.preventDefault()
  const oldScale = previewScale.value
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
  const nextScale = Math.min(8, Math.max(1, oldScale * factor))
  if (nextScale === oldScale) return
  const relativeX = event.clientX - window.innerWidth / 2
  const relativeY = event.clientY - window.innerHeight / 2
  previewOffsetX.value = relativeX - (relativeX - previewOffsetX.value) * (nextScale / oldScale)
  previewOffsetY.value = relativeY - (relativeY - previewOffsetY.value) * (nextScale / oldScale)
  previewScale.value = nextScale
  if (nextScale === 1) resetPreviewTransform()
}
function startPreviewDrag(event: PointerEvent) {
  if (previewScale.value <= 1 || event.button !== 0) return
  previewPointerId = event.pointerId
  previewDragging.value = true
  previewDragStartX = event.clientX
  previewDragStartY = event.clientY
  previewDragOriginX = previewOffsetX.value
  previewDragOriginY = previewOffsetY.value
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function movePreviewDrag(event: PointerEvent) {
  if (!previewDragging.value || previewPointerId !== event.pointerId) return
  previewOffsetX.value = previewDragOriginX + event.clientX - previewDragStartX
  previewOffsetY.value = previewDragOriginY + event.clientY - previewDragStartY
}
function endPreviewDrag(event: PointerEvent) {
  if (previewPointerId !== event.pointerId) return
  previewDragging.value = false
  previewPointerId = undefined
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
}
function handlePreviewKey(event: KeyboardEvent) {
  if (!previewMedia.value) return
  if (event.key === 'Escape') closePreview()
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') switchPreview(-1)
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') switchPreview(1)
  else return
  event.preventDefault()
}
async function loadTasks() {
  const version = ++loadVersion
  loading.value = true
  mediaScanLoading.value = false
  mediaByTask.value = {}
  mediaSummaryTotal.value = undefined
  error.value = ''
  try {
    const result = await getUavFlightTaskOptions({ pageNum: 1, pageSize: 200 })
    if (version !== loadVersion) return
    tasks.value = result.list
    total.value = result.total
    void refreshEligibleMediaTotal(result.list, version)
    currentPage.value = 1
  } catch (reason) {
    if (version !== loadVersion) return
    tasks.value = []
    total.value = 0
    error.value = reason instanceof Error ? reason.message : '采集任务读取失败'
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

watch([keyword, mediaTypeFilter, taskFilter, timeFilter, deviceFilter, statusFilter, pageSize], () => { currentPage.value = 1 })
watch(pageCount, () => setPage(currentPage.value))
watch(() => props.activeTab, (tab) => {
  if (tab !== 'collection') return
  if (!tasks.value.length && !loading.value) void loadTasks()
})
onMounted(() => {
  window.addEventListener('keydown', handlePreviewKey)
  void loadTasks()
})
onBeforeUnmount(() => {
  loadVersion += 1
  window.clearTimeout(videoLoadTimer)
  window.removeEventListener('keydown', handlePreviewKey)
})
</script>

<template>
  <div class="results-page" :class="{ embedded: props.embedded }">
    <PrimaryHeader v-if="!props.embedded" />
    <main>
      <section v-if="props.activeTab === 'collection'" class="collection-page">
        <header class="collection-heading">
          <div class="summary-strip">
            <div class="summary-card total-card"><i>▣</i><span><small>采集任务总数</small><strong><b>{{ total || tasks.length }}</b><em>个</em></strong><p>当前已接入的飞行采集任务</p></span></div>
            <div class="summary-card image-card"><i>▦</i><span><small>素材总数</small><strong><b>{{ mediaSummaryTotal ?? '—' }}</b><em v-if="mediaSummaryTotal !== undefined">项</em></strong><p>{{ mediaScanLoading ? '已读取素材，持续更新中' : '已读取的图片与视频素材' }}</p></span></div>
            <div class="summary-card device-card"><i>◇</i><span><small>采集设备</small><strong><b>{{ deviceCount }}</b><em>台</em></strong><p>参与数据采集的设备数量</p></span></div>
            <div class="summary-card complete-card"><i>≡</i><span><small>当前页数据</small><strong><b>{{ pageMedia.length }}</b><em>项</em></strong><p>当前分页展示的图片与视频</p></span></div>
          </div>
        </header>
        <header class="collection-toolbar">
          <label class="search-control"><i>⌕</i><input v-model="keyword" placeholder="搜索任务或数据名称..." /></label>
          <label class="select-control"><select v-model="mediaTypeFilter" aria-label="数据类型"><option value="">数据类型</option><option value="video">视频</option><option value="image">图片</option></select></label>
          <label class="select-control"><select v-model="taskFilter"><option value="">任务名称</option><option v-for="[id, name] in taskOptions" :key="id" :value="id">{{ name }}</option></select></label>
          <label class="select-control"><select v-model="timeFilter"><option value="">采集时间</option><option value="1">最近 1 天</option><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select></label>
          <label class="select-control"><select v-model="deviceFilter"><option value="">设备类型</option><option v-for="item in deviceOptions" :key="item">{{ item }}</option></select></label>
          <label class="select-control status-select" title="等待后端提供状态码枚举"><select v-model="statusFilter" disabled><option value="">状态（待后端枚举）</option></select></label>
        </header>

        <div v-if="loading || (mediaScanLoading && !pageMedia.length)" class="page-state">正在读取图片与视频数据…</div>
        <div v-else-if="error" class="page-state error-state"><span>{{ error }}</span><button @click="loadTasks">重新加载</button></div>
        <div v-else-if="!pageMedia.length" class="page-state">{{ mediaLoadErrors ? '部分数据读取失败，当前没有符合筛选条件的素材' : '没有符合筛选条件的图片或视频' }}</div>
        <section v-else class="collection-media-grid media-grid" aria-label="采集数据列表">
          <button v-for="{ media, task } in pageMedia" :key="`${task.id}-${media.id}`" class="media-card" @click="openMedia(media, filteredMedia.map((entry) => entry.media))">
            <div class="media-preview" :class="{ 'video-preview':isVideoMedia(media), 'has-thumbnail':isVideoMedia(media) && Boolean(media.thumbnail) }"><template v-if="isVideoMedia(media)"><img v-if="media.thumbnail" :src="media.thumbnail" :alt="`${media.name} 视频缩略图`" loading="lazy" /><span class="video-preview__play"><i>▶</i><em>视频</em></span></template><img v-else-if="mediaSource(media)" :src="mediaSource(media)" :alt="media.name" loading="lazy" /><span v-else>暂无缩略图</span></div>
            <div class="media-card__info"><strong :title="media.name">{{ media.name }}</strong><small>{{ isVideoMedia(media) ? '视频' : '图片' }} · {{ media.capturedAt || task.createTime }}</small><small class="media-card__task" :title="task.name">来源任务：{{ task.name }}</small></div>
          </button>
        </section>

        <footer class="collection-pagination">
          <span>共 {{ filteredMedia.length }} 条数据{{ mediaScanLoading ? ' · 正在读取更多素材…' : '' }}{{ mediaLoadErrors ? ` · ${mediaLoadErrors} 个任务素材读取失败` : '' }}</span>
          <nav><select v-model="pageSize"><option :value="20">20 条/页</option><option :value="40">40 条/页</option><option :value="60">60 条/页</option></select><button :disabled="currentPage === 1" @click="setPage(currentPage - 1)">‹</button><button v-for="page in visiblePages" :key="page" :class="{ active:currentPage === page }" @click="setPage(page)">{{ page }}</button><button :disabled="currentPage === pageCount" @click="setPage(currentPage + 1)">›</button><label>前往 <input :value="currentPage" inputmode="numeric" @change="setPage(Number(($event.target as HTMLInputElement).value))" /> 页</label></nav>
        </footer>
      </section>
      <div v-else class="page-state">识别成果暂不可用</div>
    </main>

    <div v-if="previewMedia" class="preview-mask" role="dialog" aria-modal="true" @click.self="closePreview">
      <button class="preview-close" title="退出全屏（Esc）" aria-label="退出全屏" @click="closePreview"><span>×</span><em>退出全屏</em></button>
      <button class="preview-nav preview-prev" title="上一张（← / ↑）" aria-label="上一张" @click.stop="switchPreview(-1)">‹</button>
      <section v-if="isVideoMedia(previewMedia)" class="preview-video-stage" @click.stop>
        <video v-if="previewMedia.originalUrl && !videoPlaybackFailed" :key="`${previewMedia.id}-${videoFailureReason}`" :src="previewMedia.originalUrl" controls autoplay playsinline preload="auto" @loadeddata="markVideoReady" @canplay="markVideoReady" @playing="markVideoReady" @error="markVideoFailed" />
        <div v-if="previewMedia.originalUrl && !videoPlaybackReady && !videoPlaybackFailed" class="video-loading"><i></i><span>正在读取原视频…</span></div>
        <section v-if="videoPlaybackFailed || !previewMedia.originalUrl" class="hevc-notice">
          <i>!</i>
          <h2>{{ !previewMedia.originalUrl ? '后端未返回视频播放地址' : videoFailureReason === 'timeout' ? '视频分段读取超时' : '当前浏览器无法播放该视频' }}</h2>
          <p>{{ !previewMedia.originalUrl ? '当前仅有视频缩略图，需后端提供原视频或网页兼容预览地址。' : videoFailureReason === 'timeout' ? '浏览器已尝试边缓冲边播放，但未能在 20 秒内取得可播放数据。请检查视频服务是否支持 HTTP Range、Content-Length 及 MP4 Fast Start。' : '可能由 HEVC/H.265 编码、视频地址跨域或服务端响应格式异常导致，可下载原视频后使用本地播放器打开。' }}</p>
          <button v-if="previewMedia.originalUrl" type="button" @click="retryVideoPlayback">重新尝试</button>
        </section>
        <a v-if="previewMedia.originalUrl" class="preview-video-download" :href="previewMedia.originalUrl" target="_blank" rel="noopener" download>下载原视频</a>
      </section>
      <div
        v-else
        class="preview-image-stage"
        :class="{ dragging: previewDragging, zoomed: previewScale > 1 }"
        @click.stop
        @wheel="zoomPreview"
        @pointerdown="startPreviewDrag"
        @pointermove="movePreviewDrag"
        @pointerup="endPreviewDrag"
        @pointercancel="endPreviewDrag"
        @dblclick="resetPreviewTransform"
      >
        <img :src="previewMedia.originalUrl || previewMedia.thumbnail" :alt="previewMedia.name" :style="previewImageStyle" draggable="false" />
      </div>
      <button class="preview-nav preview-next" title="下一张（→ / ↓）" aria-label="下一张" @click.stop="switchPreview(1)">›</button>
      <footer class="preview-caption"><strong>{{ previewMedia.name }}</strong><span>{{ previewIndex + 1 }} / {{ previewItems.length }}</span><small>{{ isVideoMedia(previewMedia) ? '方向键切换　Esc 退出' : `滚轮缩放　拖拽平移　双击复位　${Math.round(previewScale * 100)}%` }}</small></footer>
    </div>
  </div>
</template>

<style scoped lang="scss">
.results-page{width:100%;height:100dvh;min-height:0;display:flex;flex-direction:column;color:#243550;background:#f2f6fb;font-family:"Microsoft YaHei","PingFang SC",sans-serif}.results-page.embedded{height:100%}.results-page>main{min-height:0;flex:1;overflow:hidden}.collection-page{height:100%;min-height:0;display:flex;flex-direction:column;padding:16px 20px 12px;overflow:hidden}.collection-toolbar{display:grid;grid-template-columns:minmax(340px,4fr) repeat(4,minmax(0,1fr));align-items:center;gap:14px;margin-bottom:16px}.search-control,.select-control{height:44px;display:flex;align-items:center;overflow:hidden;border:1px solid #dbe3ed;border-radius:7px;background:#fff;box-shadow:0 1px 2px #24405d0a}.search-control i,.select-control i{width:42px;flex:0 0 42px;color:#647590;font-size:21px;font-style:normal;text-align:center}.search-control input,.select-control select{min-width:0;height:100%;flex:1;border:0;outline:0;color:#34445e;background:#fff;font-size:14px}.search-control input::placeholder{color:#8996a9}.select-control select{padding:0 28px 0 3px;cursor:pointer}.toolbar-actions{display:flex;justify-content:flex-end;gap:12px}.toolbar-actions button{height:46px;padding:0 18px;border:1px solid #477bf3;border-radius:6px;color:#3470eb;background:#fff;font-size:14px;font-weight:600;white-space:nowrap;cursor:pointer}.toolbar-actions button.primary{color:#fff;background:linear-gradient(135deg,#435ff3,#2f7bf5);box-shadow:0 5px 14px #3868ef2e}.toolbar-actions b{margin-right:7px;font-size:20px;font-weight:400;vertical-align:-1px}.task-groups{min-height:0;flex:1;display:flex;flex-direction:column;gap:12px;overflow-y:auto;padding-right:2px}.task-group{flex:0 0 auto;overflow:hidden;border:1px solid #e0e7ef;border-radius:9px;background:#fff;box-shadow:0 2px 8px #263f6410}.task-group__header{width:100%;height:56px;display:grid;grid-template-columns:19px 25px minmax(220px,1fr) auto auto 6px auto 6px minmax(130px,auto) 24px;align-items:center;gap:8px;padding:0 14px;border:0;color:#53627a;background:#fff;text-align:left;cursor:pointer}.task-group__header .chevron{color:#31425c;font-size:27px;font-style:normal;transform:rotate(0);transition:.18s}.task-group.expanded .chevron{transform:rotate(90deg)}.task-group__header .folder{color:#477ff3;font-size:20px;font-style:normal}.task-group__header strong{overflow:hidden;color:#243550;font-size:16px;text-overflow:ellipsis;white-space:nowrap}.task-group__header em{padding:5px 9px;border-radius:4px;color:#3475e8;background:#eaf2ff;font-size:12px;font-style:normal}.task-group__header em.complete{color:#2a9874;background:#e4f7ef}.task-group__header em.running{color:#3282e6;background:#e5f1ff}.task-group__header span{white-space:nowrap}.task-group__header small{color:#c6cfdb}.task-group__header>b{border:0;color:#4c5c75;background:transparent;font-size:20px;text-align:center}.task-group__body{padding:10px 16px 16px;border-top:1px solid #edf1f5}.media-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px}.media-card{min-width:0;overflow:hidden;padding:0;border:1px solid #dfe6ee;border-radius:6px;color:#283950;background:#fff;box-shadow:0 3px 10px #263e5b17;text-align:left;cursor:pointer;transition:.18s}.media-card:hover{border-color:#79a6ff;box-shadow:0 6px 16px #376cb62b;transform:translateY(-2px)}.media-preview{height:130px;display:grid;place-items:center;overflow:hidden;color:#8291a5;background:linear-gradient(135deg,#dfe8ef,#cbd9e4)}.media-preview img{width:100%;height:100%;object-fit:cover}.media-card>div:last-child{position:relative;padding:10px 12px}.media-card strong{display:block;padding-right:30px;overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.media-card b{position:absolute;top:6px;right:9px;color:#53627a;font-size:15px}.media-card small{display:block;margin-top:6px;color:#8895a7;font-size:12px}.group-state,.page-state{min-height:120px;display:grid;place-items:center;color:#7b899b}.page-state{height:100%}.error-state{color:#c4515b}.error-state button{margin-left:10px;padding:6px 10px;border:1px solid #d58087;border-radius:4px;color:#b9434d;background:#fff;cursor:pointer}.collection-pagination{height:52px;flex:0 0 52px;display:flex;align-items:end;justify-content:space-between;color:#718096;font-size:13px}.collection-pagination nav{display:flex;align-items:center;gap:7px}.collection-pagination select,.collection-pagination button,.collection-pagination input{height:34px;border:1px solid #d5deea;border-radius:5px;color:#53627a;background:#fff}.collection-pagination select{padding:0 25px 0 10px}.collection-pagination button{min-width:34px;padding:0 9px;cursor:pointer}.collection-pagination button.active{color:#fff;border-color:#3678ef;background:#3678ef}.collection-pagination button:disabled{opacity:.45;cursor:not-allowed}.collection-pagination label{margin-left:10px}.collection-pagination input{width:43px;margin:0 5px;text-align:center}.data-notice{position:fixed;z-index:60;top:92px;left:50%;padding:10px 18px;border-radius:5px;color:#fff;background:#243853e8;box-shadow:0 6px 20px #1c2d4866;transform:translateX(-50%)}.notice-enter-active,.notice-leave-active{transition:.2s}.notice-enter-from,.notice-leave-to{opacity:0;transform:translate(-50%,-8px)}.preview-mask{position:fixed;z-index:80;inset:0;display:grid;grid-template-rows:minmax(0,1fr) auto;place-items:center;padding:48px;background:#07111de8}.preview-mask img{max-width:92vw;max-height:82vh;object-fit:contain}.preview-mask strong{padding-top:12px;color:#fff}.preview-close{position:absolute;top:22px;right:28px;border:0;color:#fff;background:transparent;font-size:38px;cursor:pointer}
@media(max-width:1500px){.collection-toolbar{grid-template-columns:minmax(240px,2fr) repeat(4,minmax(0,1fr));gap:9px}.toolbar-actions button{padding:0 12px}.media-grid{gap:11px}.media-preview{height:112px}.task-group__header{grid-template-columns:17px 23px minmax(180px,1fr) auto auto 4px auto 4px minmax(110px,auto) 22px}}
@media(max-width:1180px){.collection-toolbar{grid-template-columns:repeat(4,minmax(0,1fr))}.collection-toolbar .search-control{grid-column:1/-1}.media-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.task-group__header small,.task-group__header span:nth-of-type(2){display:none}}
</style>

<style scoped lang="scss">
.results-page { background:#eef3f9; }
.collection-page { position:relative; padding:18px 22px 12px; background:radial-gradient(circle at 84% 0,#dceaff 0,transparent 30%),linear-gradient(180deg,#f7faff,#eef3f9 44%); }
.collection-heading { margin-bottom:14px; }
.summary-strip { width:100%; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
.summary-card { min-width:0; min-height:76px; display:flex; align-items:center; gap:13px; padding:11px 17px; border:1px solid #d9e3ee; border-radius:9px; background:#fff; box-shadow:0 3px 12px #294a6e12; }
.summary-card i { width:39px; height:39px; flex:0 0 39px; display:grid; place-items:center; border-radius:8px; color:#25a3bd; background:#e5f7fa; font-size:20px; font-style:normal; }
.summary-card span,.summary-card small,.summary-card strong,.summary-card b,.summary-card em,.summary-card p { display:block; }
.summary-card span { min-width:0; }
.summary-card small { color:#6f8097; font-size:12px; }
.summary-card strong { display:flex; align-items:baseline; gap:4px; margin-top:1px; line-height:1; }
.summary-card b { color:#17324f; font-size:23px; font-weight:700; }
.summary-card em { color:#3c506a; font-size:11px; font-style:normal; font-weight:600; }
.summary-card p { margin:5px 0 0; overflow:hidden; color:#9aa6b5; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
.summary-card.image-card i { color:#d99a25; background:#fff4d9; }
.summary-card.device-card i { color:#3a83e8; background:#e8f1ff; }
.summary-card.complete-card i { color:#20ae87; background:#e3f8f1; }
.collection-toolbar { grid-template-columns:minmax(260px,2fr) repeat(5,minmax(0,1fr)); gap:12px; margin-bottom:14px; padding:11px; border:1px solid #dfe7f0; border-radius:10px; background:#ffffffd6; box-shadow:0 4px 16px #263e5d12; }
.search-control,.select-control { border-color:#d7e1ec; box-shadow:0 1px 3px #294b710d; transition:border-color .18s,box-shadow .18s; }
.select-control select { width:100%; padding-left:15px; color:#3f526d; font-weight:500; }
.select-control:hover:not(.status-select) { background:#315f91; border-color:#315f91; }
.select-control:hover select { color:#fff; background:transparent; }
.select-control:hover select option { color:#3f526d; background:#fff; }
.status-select { opacity:.62; background:#eef2f7; cursor:not-allowed; }
.status-select select:disabled { color:#7e8b9d; background:#eef2f7; cursor:not-allowed; }
.status-select:hover select:disabled { color:#7e8b9d; background:#eef2f7; }
.search-control:focus-within,.select-control:focus-within { border-color:#6b9cf6; box-shadow:0 0 0 3px #4d84ee18; }
.toolbar-actions button { border-radius:7px; transition:transform .18s,box-shadow .18s,background .18s; }
.toolbar-actions button:hover { box-shadow:0 6px 15px #315fae21; transform:translateY(-1px); }
.task-groups { gap:10px; padding:2px 3px 8px; scrollbar-color:#b7c5d7 transparent; }
.task-group { position:relative; border-color:#dae4ee; border-radius:10px; box-shadow:0 4px 14px #294a6e12; transition:border-color .18s,box-shadow .18s,transform .18s; }
.task-group::before { position:absolute; z-index:2; top:0; bottom:0; left:0; width:4px; border-radius:10px 0 0 10px; background:#94add0; content:""; transition:background .18s; }
.task-group:hover { border-color:#bdcee2; box-shadow:0 7px 20px #294a6e1b; transform:translateY(-1px); }
.task-group.expanded { border-color:#b9cff0; box-shadow:0 9px 24px #24549020; }
.task-group.expanded::before { background:linear-gradient(#337cf0,#42b8ee); }
.task-group__header { min-height:64px; height:auto; grid-template-columns:20px 30px minmax(240px,1fr) auto 6px auto 6px minmax(150px,auto) 28px; padding:8px 15px 8px 18px; background:linear-gradient(90deg,#fff,#fbfdff); }
.task-group.expanded .task-group__header { background:linear-gradient(90deg,#f8fbff,#fff); }
.task-group__header .chevron { color:#5d7190; font-size:24px; }
.task-group__header .folder { position:relative; width:24px; height:18px; border-radius:3px; background:linear-gradient(135deg,#4e8bf6,#326ddb); box-shadow:0 3px 7px #3971d435; }
.task-group__header .folder::before { position:absolute; top:-4px; left:2px; width:10px; height:6px; border-radius:3px 3px 0 0; background:#70a2f8; content:""; }
.task-title { min-width:0; display:block; }
.task-title strong,.task-title small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.task-title strong { color:#203754; font-size:15px; letter-spacing:.1px; }
.task-title small { margin-top:4px; color:#8a98aa; font-size:10px; }
.task-group__header em { min-width:55px; text-align:center; font-weight:600; }
.task-group__header span:not(.task-title) { color:#6f7f94; font-size:12px; }
.task-group__body { padding:14px 16px 17px; background:linear-gradient(180deg,#f7faff,#fff 55px); }
.media-grid { max-height:362px; grid-auto-rows:174px; align-content:start; gap:14px; overflow-y:auto; padding-right:6px; scrollbar-color:#b4c5d8 transparent; scrollbar-width:thin; }
.media-grid::-webkit-scrollbar { width:7px; }
.media-grid::-webkit-scrollbar-thumb { border-radius:5px; background:#b4c5d8; }
.media-grid::-webkit-scrollbar-track { background:transparent; }
.media-card { height:174px; display:grid; grid-template-rows:122px 52px; border-radius:8px; box-shadow:0 4px 13px #263e5b16; }
.collection-media-grid { min-height:0; max-height:none; flex:1; grid-auto-rows:214px; align-content:start; gap:14px; overflow-y:auto; padding:3px 5px 10px 3px; }
.collection-media-grid .media-card { height:214px; grid-template-rows:140px 74px; }
.collection-media-grid .media-preview { height:140px; }
.collection-media-grid .media-card__info { overflow:hidden; }
.collection-media-grid .media-card strong { padding-right:0; }
.collection-media-grid .media-card__info small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.collection-media-grid .media-card__task { color:#6a809b; }
.media-preview { position:relative; height:122px; background:linear-gradient(135deg,#d8e4ed,#c5d5e0); }
.media-preview::after { position:absolute; inset:0; background:linear-gradient(180deg,transparent 65%,#0a1c2f42); content:""; pointer-events:none; }
.media-preview.video-preview { color:#c8d7e4; background:linear-gradient(145deg,#172a3a,#09131d); text-align:center; }
.media-preview.video-preview>img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.video-preview__play { position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; gap:6px; color:#fff; font-size:11px; line-height:1.2; text-shadow:0 1px 5px #000; }
.video-preview__play i { width:38px; height:38px; display:grid; place-items:center; padding-left:2px; border:1px solid #ffffffc4; border-radius:50%; color:#fff; background:#07192ba8; box-shadow:0 4px 13px #0007; font-size:15px; font-style:normal; }
.video-preview__play em { padding:2px 7px; border-radius:8px; background:#07192b99; font-style:normal; }
.media-card>div:last-child { padding:10px 12px 11px; }
.media-card strong { color:#263a56; }
.media-card small { color:#8795a8; }
.collection-pagination { min-height:50px; padding:0 4px; }
.collection-pagination>span { color:#64758c; font-weight:500; }
.collection-pagination button.active { box-shadow:0 4px 10px #3678ef40; }
.collection-pagination select:hover { color:#fff; background:#315f91; }
.collection-pagination select:hover option { color:#53627a; background:#fff; }
.preview-mask { z-index:1000; display:flex; align-items:center; justify-content:center; padding:76px 110px 86px; background:rgba(3,11,22,.94); backdrop-filter:blur(5px); }
.preview-image-stage { width:calc(100vw - 220px); height:calc(100vh - 162px); display:flex; align-items:center; justify-content:center; overflow:hidden; cursor:zoom-in; touch-action:none; user-select:none; }
.preview-image-stage.zoomed { cursor:grab; }
.preview-image-stage.dragging { cursor:grabbing; }
.preview-image-stage img { width:auto; height:auto; max-width:100%; max-height:100%; border-radius:3px; object-fit:contain; box-shadow:0 16px 55px #000b; transform-origin:center; transition:transform .08s ease-out; will-change:transform; pointer-events:none; }
.preview-image-stage.dragging img { transition:none; }
.preview-video-stage { position:relative; width:calc(100vw - 220px); height:calc(100vh - 162px); display:flex; align-items:center; justify-content:center; overflow:hidden; background:#02060a; box-shadow:0 16px 55px #000b; }
.preview-video-stage video { width:100%; height:100%; display:block; background:#000; object-fit:contain; }
.video-loading { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#b9c8d5; background:#07111ddd; font-size:13px; pointer-events:none; }
.video-loading i { width:32px; height:32px; border:3px solid #648399; border-top-color:#58c7ff; border-radius:50%; animation:video-loading-spin .8s linear infinite; }
.preview-video-download { position:absolute; z-index:3; top:16px; right:16px; display:inline-flex; align-items:center; justify-content:center; height:36px; padding:0 14px; color:#fff; border:1px solid #72c9f7; border-radius:5px; background:#126eaaeb; box-shadow:0 5px 15px #0005; font-size:12px; font-weight:600; text-decoration:none; }
.preview-video-download:hover { background:#1887cb; }
@keyframes video-loading-spin { to { transform:rotate(360deg); } }
.preview-close { top:24px; right:30px; height:42px; display:flex; align-items:center; gap:8px; padding:0 16px; border:1px solid #ffffff55; border-radius:22px; color:#fff; background:#172538cc; font-size:14px; transition:.18s; }
.preview-close:hover { border-color:#7fc9ff; background:#24669a; }
.preview-close span { font-size:27px; font-weight:300; line-height:1; }
.preview-close em { font-style:normal; }
.preview-nav { position:absolute; z-index:2; top:50%; width:54px; height:78px; border:1px solid #ffffff40; border-radius:9px; color:#fff; background:#102238b8; box-shadow:0 8px 24px #0005; font-size:52px; font-weight:200; line-height:60px; cursor:pointer; transform:translateY(-50%); transition:.18s; }
.preview-nav:hover { border-color:#7fc9ff; background:#2677b5; transform:translateY(-50%) scale(1.05); }
.preview-prev { left:28px; }
.preview-next { right:28px; }
.preview-caption { position:absolute; right:100px; bottom:24px; left:100px; display:flex; align-items:center; justify-content:center; gap:18px; color:#fff; text-shadow:0 2px 6px #000; }
.preview-caption strong { min-width:0; max-width:56vw; overflow:hidden; padding:0; font-size:15px; text-overflow:ellipsis; white-space:nowrap; }
.preview-caption span { padding:4px 10px; border-radius:12px; background:#ffffff1d; font-size:12px; }
.preview-caption small { color:#aebdcd; font-size:12px; }
.hevc-notice { width:min(620px,72vw); padding:52px 48px; border:1px solid #47657d; border-radius:12px; color:#fff; background:linear-gradient(145deg,#172a3bea,#0b1722f2); box-shadow:0 20px 70px #000a; text-align:center; }
.hevc-notice>i { width:68px; height:68px; display:grid; place-items:center; margin:0 auto 22px; border:1px solid #72b9e7; border-radius:50%; color:#9fd8ff; background:#2b77a735; font-size:28px; font-style:normal; }
.hevc-notice h2 { margin:0; font-size:22px; }
.hevc-notice p { margin:14px 0 25px; color:#aebfcd; font-size:13px; }
.hevc-notice button { height:42px; margin-right:10px; padding:0 20px; color:#d9f3ff; border:1px solid #5f8fab; border-radius:6px; background:#17364b; font-size:14px; font-weight:600; cursor:pointer; transition:.18s; }
.hevc-notice button:hover { border-color:#72c9f7; background:#20506f; }
.hevc-notice a { display:inline-flex; align-items:center; justify-content:center; min-width:132px; height:42px; padding:0 20px; border:1px solid #55bfff; border-radius:6px; color:#fff; background:#167dbb; font-size:14px; font-weight:600; text-decoration:none; transition:.18s; }
.hevc-notice a:hover { background:#2296d7; box-shadow:0 7px 20px #0d80c34d; transform:translateY(-1px); }
@media(max-width:1500px){
  .collection-heading { margin-bottom:10px; }
  .summary-strip { gap:9px; }
  .summary-card { min-height:68px; padding:8px 11px; }
  .summary-card i { width:34px; height:34px; flex-basis:34px; }
  .summary-card p { display:none; }
  .collection-toolbar { grid-template-columns:minmax(230px,1.8fr) repeat(5,minmax(0,1fr)); gap:8px; padding:8px; }
  .collection-media-grid { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .toolbar-actions { gap:8px; }
  .toolbar-actions button { padding:0 11px; }
  .task-group__header { grid-template-columns:18px 27px minmax(180px,1fr) auto 4px auto 4px minmax(110px,auto) 24px; }
}
@media(max-width:1180px){
  .summary-strip { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .task-title small { display:none; }
  .collection-toolbar { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .collection-toolbar .search-control { grid-column:auto; }
  .collection-media-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
}
@media(max-width:760px){.collection-media-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.collection-pagination{height:auto;min-height:68px;align-items:flex-start;flex-direction:column;gap:8px}.collection-pagination nav{max-width:100%;overflow-x:auto}}
</style>
