<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import L from 'leaflet'
import { ElTooltip } from 'element-plus'
import 'leaflet/dist/leaflet.css'
import { getFlightReviewSrtFile, getFlightReviewVideoSrtFile, type FlightReviewMedia } from '@/api/flight-review'
import { getTiandituAddress } from '@/api/geocoding'
import { createTelemetryLocationResolver, type TelemetryLocationState } from '@/utils/telemetry-location'
import { bindVideoTelemetryClock, decodeVideoSrt, formatTelemetryCoordinates, interpolatedTelemetryAtTime, parseVideoSrt, type VideoTelemetryPoint } from '@/utils/video-telemetry'
import { containedVideoBounds, fitTelemetryPanelSize, placeTelemetryPanel, resizeTelemetryPanel, type TelemetryPanelBounds, type TelemetryPanelSize } from '@/utils/telemetry-panel'

const props = defineProps<{ media: FlightReviewMedia; mediaList: FlightReviewMedia[]; video?: HTMLVideoElement; playbackStarted?: boolean; fullscreen?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const container = ref<HTMLElement>()
const panel = ref<HTMLElement>()
const currentTime = ref(0)
const panelPosition = ref<{ left: number; top: number }>()
const panelSize = ref<TelemetryPanelSize>()
const videoBounds = shallowRef<TelemetryPanelBounds>()
const dragging = ref(false)
const resizing = ref(false)
const navigationNoticePending = ref(false)
let navigationNoticeTimer: ReturnType<typeof setTimeout> | undefined
const panelStyle = computed(() => ({
  ...(panelPosition.value ? { left: `${panelPosition.value.left}px`, top: `${panelPosition.value.top}px`, right: 'auto', bottom: 'auto' } : {}),
  ...(panelSize.value ? { width: `${panelSize.value.width}px`, height: `${panelSize.value.height}px` } : {}),
}))
const points = shallowRef<VideoTelemetryPoint[]>([])
const position = computed(() => interpolatedTelemetryAtTime(points.value, currentTime.value))
const sourceName = ref('')
const busy = ref(false)
const error = ref('')
const mapError = ref('')
const mapMode = ref<'vector' | 'image'>('image')
const follow = ref(true)
const manualSource = ref(false)
const candidates = computed(() => props.mediaList.filter(item => item.taskId === props.media.taskId && /\.srt$/i.test(item.fileName)))
const token = import.meta.env.VITE_TIANDITU_TOKEN
const location = ref<TelemetryLocationState>({ status: 'idle', text: '当前时刻无有效定位' })
const locationPaused = ref(false)
const locationSource = ref<'pause' | 'playback'>('pause')
const locationLabel = computed(() => locationPaused.value ? '当前位置：' : location.value.status === 'ready'
  ? locationSource.value === 'playback' ? '首次播放位置：' : '上次暂停位置：' : '位置：')
const locationResolver = createTelemetryLocationResolver(
  (point, signal) => getTiandituAddress(token || '', point.longitude, point.latitude, signal),
  state => { location.value = state },
)
let map: L.Map | undefined
let baseLayer: L.TileLayer | undefined
let labelLayer: L.TileLayer | undefined
let marker: L.Marker | undefined
let track: L.Polyline | undefined
let resizeObserver: ResizeObserver | undefined
let controller: AbortController | undefined
let version = 0
let timer: ReturnType<typeof setTimeout> | undefined
let releaseVideoClock: (() => void) | undefined
let drag: { pointerId: number; x: number; y: number; left: number; top: number; handle: HTMLElement } | undefined
let resize: { pointerId: number; x: number; y: number; origin: TelemetryPanelBounds; edge: 'left' | 'right'; handle: HTMLElement } | undefined
let preferredSize: TelemetryPanelSize | undefined
let anchored = true
let cameraMoving = false
let lastRenderedTime: number | undefined
let playbackActive = false
let playbackLocationTime: number | undefined
let trackReturnZoom: number | undefined

/** 仅首次点击播放时查询一次；SRT 尚未就绪时保留首次播放的媒体时刻。 */
function queryPlaybackLocation() {
  if (playbackLocationTime === undefined || !points.value.length) return
  const time = playbackLocationTime
  playbackLocationTime = undefined
  const point = interpolatedTelemetryAtTime(points.value, time)
  if (!point) locationResolver.update()
  else if (!token) location.value = { status: 'error', text: '未配置位置查询密钥' }
  else locationResolver.update(point)
}

function updatePanelLayout(resetAnchor = false) {
  const element = panel.value, parent = element?.offsetParent as HTMLElement | null
  if (!element || !parent) return
  let box: TelemetryPanelBounds = { left: 0, top: 0, width: parent.clientWidth, height: parent.clientHeight }
  const parentRect = parent.getBoundingClientRect?.(), videoRect = props.video?.getBoundingClientRect?.()
  if (parentRect?.width && parentRect.height && videoRect?.width && videoRect.height) {
    const scaleX = parentRect.width / (parent.offsetWidth || parent.clientWidth), scaleY = parentRect.height / (parent.offsetHeight || parent.clientHeight)
    box = { left: (videoRect.left - parentRect.left) / scaleX - parent.clientLeft,
      top: (videoRect.top - parentRect.top) / scaleY - parent.clientTop,
      width: videoRect.width / scaleX, height: videoRect.height / scaleY }
  }
  const bounds = containedVideoBounds(box, props.video?.videoWidth || 0, props.video?.videoHeight || 0)
  const changed = !videoBounds.value || Object.keys(bounds).some(key => Math.abs(bounds[key as keyof TelemetryPanelBounds] - videoBounds.value![key as keyof TelemetryPanelBounds]) > .5)
  if (resetAnchor || changed) { endDrag(); endResize() }
  videoBounds.value = bounds
  if (resetAnchor) anchored = true
  const size = fitTelemetryPanelSize(preferredSize || (props.fullscreen ? { width: 420, height: 350 } : { width: 340, height: 300 }), bounds)
  panelSize.value = size
  const desired = anchored || !panelPosition.value ? { left: bounds.left + bounds.width - size.width - 8, top: bounds.top + 8 } : panelPosition.value
  panelPosition.value = placeTelemetryPanel(desired.left, desired.top, size, bounds)
}

function movePanel(left: number, top: number) {
  if (!videoBounds.value || !panelSize.value) updatePanelLayout()
  if (!videoBounds.value || !panelSize.value) return
  anchored = false
  panelPosition.value = placeTelemetryPanel(left, top, panelSize.value, videoBounds.value)
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary || (event.target as HTMLElement).closest('button')) return
  const element = panel.value
  if (!element) return
  updatePanelLayout()
  endResize()
  const handle = event.currentTarget as HTMLElement
  event.preventDefault()
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: element.offsetLeft, top: element.offsetTop, handle }
  handle.setPointerCapture(event.pointerId)
  dragging.value = true
}

function startResize(event: PointerEvent, edge: 'left' | 'right') {
  if (event.button !== 0 || !event.isPrimary) return
  updatePanelLayout()
  if (!panelPosition.value || !panelSize.value) return
  endDrag()
  endResize()
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  resize = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: { ...panelPosition.value, ...panelSize.value }, edge, handle }
  handle.setPointerCapture(event.pointerId)
  resizing.value = true
  anchored = false
}

function moveResize(event: PointerEvent) {
  if (!resize || resize.pointerId !== event.pointerId || !videoBounds.value) return
  const layout = resizeTelemetryPanel(resize.origin, event.clientX - resize.x, event.clientY - resize.y, resize.edge, videoBounds.value)
  preferredSize = { width: layout.width, height: layout.height }
  panelSize.value = preferredSize
  panelPosition.value = { left: layout.left, top: layout.top }
}

function endResize(event?: PointerEvent) {
  if (!resize || (event && event.pointerId !== resize.pointerId)) return
  const previous = resize
  resize = undefined
  resizing.value = false
  if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId)
}

function scalePanel(factor: number) {
  updatePanelLayout()
  if (!panelSize.value || !panelPosition.value || !videoBounds.value) return
  const right = panelPosition.value.left + panelSize.value.width
  preferredSize = fitTelemetryPanelSize({ width: panelSize.value.width * factor, height: panelSize.value.height * factor }, videoBounds.value)
  panelSize.value = preferredSize
  panelPosition.value = placeTelemetryPanel(right - preferredSize.width, panelPosition.value.top, preferredSize, videoBounds.value)
}

function resizeWithKey(event: KeyboardEvent) {
  const factors: Record<string, number> = { ArrowRight: 1.1, ArrowDown: 1.1, ArrowLeft: 1 / 1.1, ArrowUp: 1 / 1.1 }
  if (!factors[event.key]) return
  event.preventDefault()
  scalePanel(factors[event.key]!)
}

function moveDrag(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  movePanel(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y)
}

function endDrag(event?: PointerEvent) {
  if (!drag || (event && event.pointerId !== drag.pointerId)) return
  const previous = drag
  drag = undefined
  dragging.value = false
  if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId)
}

function movePanelWithKey(event: KeyboardEvent) {
  if (event.target !== event.currentTarget || !panel.value) return
  const delta: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }
  const step = delta[event.key]
  if (!step) return
  event.preventDefault()
  movePanel(panel.value.offsetLeft + step[0], panel.value.offsetTop + step[1])
}

function resetRequest() {
  ++version
  controller?.abort()
  controller = undefined
  if (timer) clearTimeout(timer)
  timer = undefined
}

async function loadSrt(source: FlightReviewMedia | File, fromVideo = false) {
  resetRequest()
  const request = version
  points.value = []
  error.value = ''
  busy.value = true
  sourceName.value = source instanceof File ? source.name : fromVideo ? `${source.fileName} · 配套 SRT` : source.fileName
  controller = new AbortController()
  const signal = controller.signal
  timer = setTimeout(() => controller?.abort(), 20_000)
  try {
    const file = source instanceof File ? source : fromVideo
      ? await getFlightReviewVideoSrtFile(source.id, signal)
      : await getFlightReviewSrtFile(source, signal)
    const result = parseVideoSrt(await decodeVideoSrt(file))
    if (request !== version) return
    points.value = result.points
  } catch (reason) {
    if (request !== version) return
    error.value = signal.aborted ? 'SRT 读取超时，请重试或选择本地文件。'
      : reason instanceof TypeError ? 'SRT 无法读取，请检查跨域权限，或选择本地文件。'
        : reason instanceof Error ? reason.message : 'SRT 读取失败。'
  } finally {
    if (request === version) { busy.value = false; if (timer) clearTimeout(timer); timer = undefined }
  }
}

function readVideoSrt() {
  manualSource.value = false
  void loadSrt(props.media, true)
}

function chooseLocal(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/\.srt$/i.test(file.name)) { error.value = '请选择 .srt 文件。'; return }
  manualSource.value = true
  void loadSrt(file)
}

function chooseServer(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  const source = candidates.value.find(item => item.id === id)
  if (source) { manualSource.value = true; void loadSrt(source) }
}

function tileUrl(layer: 'vec' | 'img' | 'cva' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function addBaseLayers() {
  if (!map || !token) return
  baseLayer?.remove()
  labelLayer?.remove()
  mapError.value = ''
  const base = mapMode.value === 'vector' ? 'vec' : 'img'
  const label = mapMode.value === 'vector' ? 'cva' : 'cia'
  const options = { subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'], maxNativeZoom: 18, maxZoom: 20, attribution: '天地图' }
  baseLayer = L.tileLayer(tileUrl(base), options).on('tileerror', () => { mapError.value = '底图加载失败，定位与轨迹仍可查看' }).addTo(map)
  labelLayer = L.tileLayer(tileUrl(label), options).on('tileerror', () => { mapError.value = '底图加载失败，定位与轨迹仍可查看' }).addTo(map)
}

function switchBaseMap() {
  mapMode.value = mapMode.value === 'image' ? 'vector' : 'image'
  addBaseLayers()
}

function renderPosition(forceFollow = false) {
  if (!map) return
  if (!position.value) { marker?.remove(); marker = undefined; lastRenderedTime = undefined; if (cameraMoving) map.stop(); cameraMoving = false; return }
  const jumped = lastRenderedTime === undefined || currentTime.value < lastRenderedTime || currentTime.value - lastRenderedTime > 1
  lastRenderedTime = currentTime.value
  const coordinate: L.LatLngTuple = [position.value.latitude, position.value.longitude]
  if (!marker) {
    marker = L.marker(coordinate, { icon: L.divIcon({ className: 'video-drone-marker',
      html: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10 13h12l3 4-4 3H11l-4-3zM10 14 5 8m17 6 5-6M10 19l-5 6m17-6 5 6"/><circle cx="5" cy="7" r="4"/><circle cx="27" cy="7" r="4"/><circle cx="5" cy="25" r="4"/><circle cx="27" cy="25" r="4"/></svg>',
      iconSize: [32, 32], iconAnchor: [16, 16] }) }).addTo(map)
  } else marker.setLatLng(coordinate)
  if (follow.value) {
    const pixel = map.latLngToContainerPoint(coordinate), size = map.getSize()
    const outside = pixel.x < 0 || pixel.y < 0 || pixel.x > size.x || pixel.y > size.y
    // 标记每帧更新；相机仅在离开中央区域时平滑跟进，避免每帧触发瓦片重排。
    if (forceFollow || jumped || outside) {
      map.stop()
      cameraMoving = false
      map.panTo(coordinate, { animate: false })
    } else if (!cameraMoving && (Math.abs(pixel.x - size.x / 2) > size.x * .2 || Math.abs(pixel.y - size.y / 2) > size.y * .2)) {
      cameraMoving = true
      map.panTo(coordinate, { animate: true, duration: .35, noMoveStart: true })
    }
  }
}

function showTrack() {
  if (!map || !track) return
  if (trackReturnZoom === undefined) trackReturnZoom = map.getZoom()
  follow.value = false
  map.stop()
  map.fitBounds(track.getBounds(), { padding: [22, 22], maxZoom: 18, animate: false })
}

function toggleFollow() {
  if (follow.value) {
    follow.value = false
    return
  }
  const point = position.value || points.value[0]
  const returnZoom = trackReturnZoom
  trackReturnZoom = undefined
  follow.value = true
  if (!map || !point) return
  map.stop()
  cameraMoving = false
  map.setView([point.latitude, point.longitude], returnZoom ?? Math.max(map.getZoom(), 17), { animate: false })
}

function showNavigationNotice() {
  if (navigationNoticeTimer) clearTimeout(navigationNoticeTimer)
  navigationNoticePending.value = true
  navigationNoticeTimer = setTimeout(() => {
    navigationNoticePending.value = false
    navigationNoticeTimer = undefined
  }, 3000)
}

function renderTrack() {
  track?.remove()
  track = undefined
  trackReturnZoom = undefined
  if (!map) return
  if (!points.value.length) { renderPosition(); return }
  // 限制小窗路线绘制量；同步定位仍使用全部原始记录，不跨越缺失区间连线。
  const step = Math.max(1, Math.ceil(points.value.length / 3000))
  const segments: L.LatLngTuple[][] = []
  let segment: L.LatLngTuple[] = []
  points.value.forEach((point, index) => {
    const previous = points.value[index - 1], next = points.value[index + 1]
    if (previous && point.start - previous.end > .05) { if (segment.length) segments.push(segment); segment = [] }
    if (index % step === 0 || !segment.length || !next || next.start - point.end > .05) segment.push([point.latitude, point.longitude])
  })
  if (segment.length) segments.push(segment)
  track = L.polyline(segments, { color: '#1ce4dd', weight: 3, opacity: .8, interactive: false }).addTo(map)
  const initial = position.value || points.value[0]!
  map.setView([initial.latitude, initial.longitude], 17, { animate: false })
  renderPosition()
}

onMounted(() => {
  if (!container.value) return
  map = L.map(container.value, { zoomControl: false, attributionControl: false, maxZoom: 20 })
  map.setView([32.4555, 119.9255], 10)
  map.on('moveend', () => { cameraMoving = false })
  map.on('dragstart', () => { follow.value = false })
  if (token) addBaseLayers()
  else mapError.value = '未配置底图，定位与轨迹仍可查看'
  resizeObserver = new ResizeObserver((entries) => {
    map?.invalidateSize({ pan: false })
    if (!entries?.length || entries.some(entry => entry.target === panel.value?.offsetParent || entry.target === props.video)) updatePanelLayout()
  })
  resizeObserver.observe(container.value)
  const parent = panel.value?.offsetParent
  if (parent) resizeObserver.observe(parent)
  if (props.video) resizeObserver.observe(props.video)
  updatePanelLayout(true)
  renderTrack()
  readVideoSrt()
})

watch(points, () => {
  renderTrack()
  if (!points.value.length && playbackActive) {
    locationResolver.suspend()
    // 只补办已收到的首次播放事件，不因打开面板或更换字幕新增播放中查询。
    location.value = { status: 'idle', text: playbackLocationTime !== undefined ? '正在等待字幕定位信息' : '播放中，暂停后获取具体位置' }
  }
  queryPlaybackLocation()
})
watch(position, () => renderPosition())
watch([position, locationPaused], ([point, paused]) => {
  if (!paused) return
  if (!point) locationResolver.update()
  else if (!token) location.value = { status: 'error', text: '未配置位置查询密钥' }
  else locationResolver.update(point)
}, { immediate: true })
watch(follow, () => renderPosition(true))
watch(() => props.video, video => {
  releaseVideoClock?.()
  releaseVideoClock = undefined
  locationResolver.suspend()
  playbackActive = false
  playbackLocationTime = undefined
  locationPaused.value = false
  locationSource.value = 'pause'
  location.value = { status: 'idle', text: '开始播放或暂停后获取具体位置' }
  currentTime.value = video?.currentTime || 0
  if (video) {
    let initialPlaybackSeen = props.playbackStarted || !video.paused || (video.played?.length || 0) > 0
    const syncLocationState = (event?: Event) => {
      const firstPlay = event?.type === 'play' && !initialPlaybackSeen
      if (event?.type === 'play') initialPlaybackSeen = true
      currentTime.value = video.currentTime
      const paused = video.paused || video.ended
      if (video.seeking || event?.type === 'emptied') {
        locationPaused.value = false
        playbackLocationTime = undefined
        locationResolver.suspend()
        if (event?.type === 'emptied') playbackActive = false
        if (location.value.status !== 'ready') location.value = { status: 'idle', text: '拖动结束或暂停后获取具体位置' }
        return
      }
      if (paused) {
        if (playbackActive) locationResolver.suspend()
        playbackActive = false
        playbackLocationTime = undefined
        locationSource.value = 'pause'
        locationPaused.value = true
        return
      }
      locationPaused.value = false
      if (!playbackActive) {
        playbackActive = true
        locationResolver.suspend()
        if (firstPlay) {
          locationSource.value = 'playback'
          location.value = { status: 'idle', text: '正在等待字幕定位信息' }
          playbackLocationTime = video.currentTime
          queryPlaybackLocation()
        } else if (location.value.status !== 'ready') {
          location.value = { status: 'idle', text: '播放中，暂停后获取具体位置' }
        }
      }
    }
    const events = ['play', 'playing', 'pause', 'seeking', 'seeked', 'ended', 'loadedmetadata', 'emptied']
    const releaseClock = bindVideoTelemetryClock(video, time => { currentTime.value = time })
    const updateVideoLayout = () => updatePanelLayout(true)
    for (const event of events) video.addEventListener(event, syncLocationState)
    video.addEventListener('loadedmetadata', updateVideoLayout)
    video.addEventListener('resize', updateVideoLayout)
    syncLocationState()
    releaseVideoClock = () => {
      releaseClock()
      for (const event of events) video.removeEventListener(event, syncLocationState)
      video.removeEventListener('loadedmetadata', updateVideoLayout)
      video.removeEventListener('resize', updateVideoLayout)
    }
  }
}, { immediate: true, flush: 'post' })
watch(() => props.fullscreen, async () => { await nextTick(); updatePanelLayout(true) }, { flush: 'post' })
onBeforeUnmount(() => { if (navigationNoticeTimer) clearTimeout(navigationNoticeTimer); endDrag(); endResize(); releaseVideoClock?.(); locationResolver.dispose(); resetRequest(); resizeObserver?.disconnect(); map?.remove() })
</script>

<template>
  <section ref="panel" class="video-telemetry" :class="{ 'is-dragging': dragging, 'is-resizing': resizing }" :style="panelStyle" aria-label="视频协同定位" @click.stop @keydown.stop>
    <header class="telemetry-header" tabindex="0" aria-label="拖动协同展示窗口，或使用方向键移动" title="按住标题栏拖动" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag" @keydown="movePanelWithKey"><div><strong>协同展示 <span class="drag-grip" aria-hidden="true">⠿</span></strong><small title="使用相邻有效定位采样插值，非设备当前实时遥测">SRT 回放位置 · 平滑插值</small></div><div class="telemetry-window-actions"><button type="button" aria-label="关闭协同展示" title="关闭协同展示" @click="emit('close')">×</button></div></header>
    <div class="telemetry-map-wrap">
      <div ref="container" class="telemetry-map" />
      <div v-if="!points.length" class="telemetry-state" role="status">{{ busy ? '正在读取当前视频的配套 SRT…' : error || '当前视频暂无可用 SRT，请重试或手动选择对应文件' }}</div>
      <span v-else-if="!position" class="telemetry-gap" role="status">当前视频时刻无有效定位</span>
    </div>
    <div class="telemetry-controls"><div class="telemetry-info">
      <span>{{ currentTime.toFixed(1) }} s</span>
      <span>{{ formatTelemetryCoordinates(position) }}</span>
      <span>相对高度 {{ position?.relativeAltitude !== undefined ? `${position.relativeAltitude.toFixed(1)} m` : '—' }}</span>
    </div>
    <div class="telemetry-location" :class="{ 'is-unavailable': location.status === 'error' }" aria-live="polite"><span>{{ locationLabel }}</span><span :title="location.text">{{ location.text }}</span><ElTooltip popper-class="navigation-pending-tooltip" :visible="navigationNoticePending" :teleported="false" :popper-style="{ padding: '0', border: '1px solid #c4dde8', borderRadius: '8px', boxShadow: '0 10px 28px #123b5240' }" placement="top" effect="light"><template #content><div class="navigation-tooltip-card" role="status"><strong>该功能暂未接入</strong></div></template><button type="button" class="navigation-button" aria-label="导航" @click="showNavigationNotice">导航</button></ElTooltip></div>
    <div class="telemetry-actions">
      <button type="button" :disabled="!points.length" :aria-pressed="follow" @click="toggleFollow">{{ follow ? '跟随中' : '跟随无人机' }}</button>
      <button type="button" :disabled="!points.length" @click="showTrack">全程轨迹</button>
      <button type="button" :aria-label="`切换底图，当前为${mapMode === 'image' ? '影像地图' : '电子地图'}`" :title="`当前：${mapMode === 'image' ? '影像地图' : '电子地图'}；点击切换`" @click="switchBaseMap">切换底图</button>
    </div>
    <button v-if="error || manualSource" class="backend-srt-retry" type="button" :disabled="busy" @click="readVideoSrt">{{ manualSource ? '读取当前视频配套 SRT' : '重试读取配套 SRT' }}</button>
    <label v-if="!points.length && !busy" class="backend-srt-retry local-srt-picker" :title="sourceName">选择本地 SRT<input type="file" accept=".srt" aria-label="选择本地 SRT 文件" @change="chooseLocal" /></label>
    <select v-if="candidates.length" class="server-srt" aria-label="选择任务中的 SRT" @change="chooseServer"><option value="">选择任务中的 SRT</option><option v-for="item in candidates" :key="item.id" :value="item.id">{{ item.fileName }}</option></select>
    <p v-if="mapError && points.length" class="telemetry-warning">{{ mapError }}</p>
    <p v-if="manualSource" class="telemetry-warning">请确认 SRT 与当前视频匹配；本地文件仅在浏览器中读取。</p>
    </div>
    <button v-for="edge in (['left', 'right'] as const)" :key="edge" type="button" class="telemetry-resize-handle" :class="`at-${edge}`" :aria-label="edge === 'left' ? '从左下角调整窗口大小' : '从右下角调整窗口大小'" title="拖动调整窗口大小，或用方向键缩放" @pointerdown.stop="startResize($event, edge)" @pointermove="moveResize" @pointerup="endResize" @pointercancel="endResize" @lostpointercapture="endResize" @keydown="resizeWithKey" />
  </section>
</template>

<style scoped>
.video-telemetry{position:absolute;z-index:6;top:8px;right:8px;display:flex;flex-direction:column;width:min(340px,calc(100% - 16px));height:300px;max-height:calc(100% - 16px);overflow:hidden;box-sizing:border-box;border:1px solid #5a9aaf;border-radius:8px;color:#dff4fc;background:#102d40f5;box-shadow:0 8px 25px #00152366;font-size:11px;container-type:inline-size}
.telemetry-header{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:1px solid #345464;cursor:grab;touch-action:none;user-select:none}.is-dragging .telemetry-header{cursor:grabbing}.telemetry-header:focus-visible{outline:2px solid #4fe2f4;outline-offset:-2px}.telemetry-header strong{font-size:13px}.drag-grip{margin-left:5px;color:#91b5c4}.telemetry-header small{display:block;margin-top:3px;color:#9ec2d2;font-size:10px}.telemetry-header button{border:0;color:#c7e6f1;background:transparent;font-size:23px;cursor:pointer}
.telemetry-map-wrap{position:relative;flex:1;min-height:64px}.telemetry-map{height:100%;background:#263e4a}.telemetry-state{position:absolute;inset:0;z-index:500;display:grid;place-items:center;padding:20px;text-align:center;background:#102d40e8;line-height:1.8}.telemetry-gap{position:absolute;top:8px;left:8px;right:8px;z-index:500;padding:5px;background:#102d40e8;text-align:center}
.telemetry-info{display:flex;flex-wrap:wrap;gap:5px 12px;padding:8px 10px;color:#b8dfeb;font-variant-numeric:tabular-nums}.telemetry-actions{display:flex;gap:6px;padding:0 10px 8px}.telemetry-actions button{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:1;padding:5px;border:1px solid #4d7e92;border-radius:4px;color:#d3f1fc;background:#1d4356;font:inherit;cursor:pointer}.telemetry-actions button[aria-pressed=true]{border-color:#2ad3e5;color:#46dfec}.telemetry-actions button:disabled{opacity:.4;cursor:default}.server-srt{display:block;box-sizing:border-box;width:calc(100% - 20px);margin:0 10px 8px;padding:4px;color:#d3f1fc;background:#1d4356;border:1px solid #4d7e92;border-radius:4px;font:inherit}.telemetry-source,.telemetry-warning{margin:0 10px 8px;color:#91b5c4;font-size:10px;overflow-wrap:anywhere}.telemetry-warning{color:#edcc8c}.telemetry-map :deep(.video-drone-marker){color:#fff;filter:drop-shadow(0 1px 4px #001f38)}.telemetry-map :deep(.video-drone-marker svg){width:32px;height:32px;fill:#118eb5;stroke:currentColor;stroke-width:1.7}
.backend-srt-retry{display:block;width:calc(100% - 20px);margin:0 10px 8px;padding:5px;border:1px solid #4d7e92;border-radius:4px;color:#d3f1fc;background:#1d4356;font:inherit;cursor:pointer}.backend-srt-retry:disabled{opacity:.4;cursor:default}
.local-srt-picker{position:relative;box-sizing:border-box;text-align:center}.local-srt-picker input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.local-srt-picker:focus-within{outline:2px solid #4fe2f4}
.telemetry-info{display:grid;grid-template-columns:max-content minmax(0,1fr) max-content;align-items:center;gap:6px;padding:9px 10px 6px;font-size:clamp(8px,2.6cqw,11px);white-space:nowrap}.telemetry-info>span:nth-child(2){text-align:center}.telemetry-info>span:last-child{text-align:right}.telemetry-location{display:flex;align-items:baseline;gap:3px;padding:0 10px 9px;color:#b8dfeb;font-size:11px;line-height:1.6}.telemetry-location>span:first-child{flex:none;color:#91b5c4}.telemetry-location>span:nth-child(2){flex:1;min-width:0;overflow-wrap:anywhere}.telemetry-location.is-unavailable{color:#edcc8c}.navigation-button{flex:none;margin-left:6px;padding:3px 8px;border:1px solid #4d7e92;border-radius:4px;color:#d3f1fc;background:#1d4356;font:inherit;cursor:pointer}.navigation-button:hover{border-color:#39bdd1;color:#55e0ed;background:#245066}.telemetry-actions{padding-bottom:10px}
.telemetry-header{flex:none;gap:8px}.telemetry-window-actions{display:flex;align-items:center;gap:3px;flex:none}.telemetry-window-actions button{width:25px;height:28px;padding:0;font-size:19px}.telemetry-window-actions button:hover{color:#51e2f0;background:#245066;border-radius:4px}.telemetry-controls{flex:0 1 auto;min-height:0;max-height:calc(100% - 120px);overflow:auto;padding-bottom:5px;scrollbar-width:thin}.telemetry-resize-handle{position:absolute;z-index:4;bottom:0;width:19px;height:19px;padding:0;border:0;background:transparent;touch-action:none}.telemetry-resize-handle.at-left{left:0;cursor:nesw-resize}.telemetry-resize-handle.at-right{right:0;cursor:nwse-resize}.telemetry-resize-handle::after{content:'';position:absolute;bottom:3px;right:3px;width:7px;height:7px;border-bottom:2px solid #86c4d5;border-right:2px solid #86c4d5}.telemetry-resize-handle.at-left::after{right:auto;left:3px;transform:rotate(90deg)}.telemetry-resize-handle:focus-visible{outline:2px solid #4fe2f4;outline-offset:-2px}
.telemetry-header>div:first-child{flex:1;min-width:0}.telemetry-header small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.navigation-tooltip-card{padding:9px 12px;border-radius:7px;background:linear-gradient(135deg,#fff,#fff5f6);font-family:"Microsoft YaHei",sans-serif}.navigation-tooltip-card strong{display:block;color:#c43b4d;font-size:12px;line-height:1.4;white-space:nowrap}
</style>
