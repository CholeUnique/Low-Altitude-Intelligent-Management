<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FlightReviewMedia } from '@/api/flight-review'
import { getTiandituAddress } from '@/api/geocoding'
import { openAmapNavigation } from '@/utils/amap-navigation'
import { containedVideoBounds, fitTelemetryPanelSize, placeTelemetryPanel, resizeTelemetryPanel, type TelemetryPanelBounds, type TelemetryPanelSize } from '@/utils/telemetry-panel'

const props = defineProps<{ media: FlightReviewMedia; fullscreen?: boolean }>()
const panel = ref<HTMLElement>()
const mapElement = ref<HTMLElement>()
const mapMode = ref<'vector' | 'image'>('image')
const mapError = ref('')
const address = ref('正在获取具体位置…')
const panelPosition = ref<{ left: number; top: number }>()
const panelSize = ref<TelemetryPanelSize>()
const imageBounds = shallowRef<TelemetryPanelBounds>()
const dragging = ref(false)
const resizing = ref(false)
const placementReady = ref(false)
const panelStyle = computed(() => ({
  ...(panelPosition.value ? { left: `${panelPosition.value.left}px`, top: `${panelPosition.value.top}px`, right: 'auto' } : {}),
  ...(panelSize.value ? { width: `${panelSize.value.width}px`, height: `${panelSize.value.height}px` } : {}),
}))
const token = import.meta.env.VITE_TIANDITU_TOKEN
let map: L.Map | undefined
let baseLayer: L.TileLayer | undefined
let labelLayer: L.TileLayer | undefined
let marker: L.Marker | undefined
let resizeObserver: ResizeObserver | undefined
let addressController: AbortController | undefined
let placementImage: HTMLImageElement | undefined
let drag: { pointerId: number; x: number; y: number; left: number; top: number; handle: HTMLElement } | undefined
let resize: { pointerId: number; x: number; y: number; origin: TelemetryPanelBounds; edge: 'left' | 'right'; handle: HTMLElement } | undefined
let preferredSize: TelemetryPanelSize | undefined
let anchored = true

function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(6)}°${value >= 0 ? positive : negative}`
}

function updatePlacement(resetAnchor = false) {
  const parent = panel.value?.parentElement
  const image = parent?.querySelector(':scope > img') as HTMLImageElement | null
  if (!parent || !image?.naturalWidth || !image.naturalHeight) return
  if (!image.clientWidth || !image.clientHeight) return
  // 图片的缩放、平移只改变内容；面板始终约束在未变换的可视图片区域内。
  const bounds = containedVideoBounds({
    left: image.offsetLeft,
    top: image.offsetTop,
    width: image.clientWidth,
    height: image.clientHeight,
  }, image.naturalWidth, image.naturalHeight)
  const changed = !imageBounds.value || Object.keys(bounds).some(key => Math.abs(bounds[key as keyof TelemetryPanelBounds] - imageBounds.value![key as keyof TelemetryPanelBounds]) > .5)
  if (resetAnchor || changed) { endDrag(); endResize() }
  imageBounds.value = bounds
  if (resetAnchor) anchored = true
  const size = fitTelemetryPanelSize(preferredSize || { width: 340, height: 300 }, bounds)
  panelSize.value = size
  const desired = anchored || !panelPosition.value
    ? { left: bounds.left + bounds.width - size.width - 10, top: bounds.top + 10 }
    : panelPosition.value
  panelPosition.value = placeTelemetryPanel(desired.left, desired.top, size, bounds)
  placementReady.value = true
}

function handlePlacementImageLoad() {
  updatePlacement(true)
}

function movePanel(left: number, top: number) {
  if (!imageBounds.value || !panelSize.value) updatePlacement()
  if (!imageBounds.value || !panelSize.value) return
  anchored = false
  panelPosition.value = placeTelemetryPanel(left, top, panelSize.value, imageBounds.value)
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary || (event.target as HTMLElement).closest('button')) return
  const element = panel.value
  if (!element) return
  updatePlacement()
  endResize()
  const handle = event.currentTarget as HTMLElement
  event.preventDefault()
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: element.offsetLeft, top: element.offsetTop, handle }
  handle.setPointerCapture(event.pointerId)
  dragging.value = true
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

function startResize(event: PointerEvent, edge: 'left' | 'right') {
  if (event.button !== 0 || !event.isPrimary) return
  updatePlacement()
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
  if (!resize || resize.pointerId !== event.pointerId || !imageBounds.value) return
  const layout = resizeTelemetryPanel(resize.origin, event.clientX - resize.x, event.clientY - resize.y, resize.edge, imageBounds.value)
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

function movePanelWithKey(event: KeyboardEvent) {
  if (event.target !== event.currentTarget || !panel.value) return
  const delta: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }
  const step = delta[event.key]
  if (!step) return
  event.preventDefault()
  movePanel(panel.value.offsetLeft + step[0], panel.value.offsetTop + step[1])
}

function resizeWithKey(event: KeyboardEvent) {
  const factors: Record<string, number> = { ArrowRight: 1.1, ArrowDown: 1.1, ArrowLeft: 1 / 1.1, ArrowUp: 1 / 1.1 }
  const factor = factors[event.key]
  if (!factor || !panelSize.value || !panelPosition.value || !imageBounds.value) return
  event.preventDefault()
  const right = panelPosition.value.left + panelSize.value.width
  preferredSize = fitTelemetryPanelSize({ width: panelSize.value.width * factor, height: panelSize.value.height * factor }, imageBounds.value)
  panelSize.value = preferredSize
  panelPosition.value = placeTelemetryPanel(right - preferredSize.width, panelPosition.value.top, preferredSize, imageBounds.value)
}

function navigateToLocation() {
  openAmapNavigation(props.media.longitude, props.media.latitude, address.value.startsWith('正在') || address.value.includes('失败') ? '' : address.value)
}

async function loadAddress() {
  addressController?.abort()
  if (props.media.longitude === undefined || props.media.latitude === undefined) {
    address.value = '暂无位置信息'
    return
  }
  if (!token) {
    address.value = '未配置地址查询服务'
    return
  }
  const controller = new AbortController()
  addressController = controller
  address.value = '正在获取具体位置…'
  try {
    address.value = await getTiandituAddress(token, props.media.longitude, props.media.latitude, controller.signal)
  } catch (reason) {
    if (!controller.signal.aborted) address.value = reason instanceof Error ? reason.message : '具体位置暂时无法获取'
  }
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
  const handleError = () => { mapError.value = '底图加载失败' }
  baseLayer = L.tileLayer(tileUrl(base), options).on('tileerror', handleError).addTo(map)
  labelLayer = L.tileLayer(tileUrl(label), options).on('tileerror', handleError).addTo(map)
}

function renderLocation() {
  if (!map || props.media.longitude === undefined || props.media.latitude === undefined) return
  const coordinate: L.LatLngTuple = [props.media.latitude, props.media.longitude]
  if (!marker) {
    marker = L.marker(coordinate, {
      icon: L.divIcon({
        className: 'photo-drone-marker',
        html: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10 13h12l3 4-4 3H11l-4-3zM10 14 5 8m17 6 5-6M10 19l-5 6m17-6 5 6"/><circle cx="5" cy="7" r="4"/><circle cx="27" cy="7" r="4"/><circle cx="5" cy="25" r="4"/><circle cx="27" cy="25" r="4"/></svg>',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    }).addTo(map)
  } else marker.setLatLng(coordinate)
  map.setView(coordinate, 14, { animate: false })
  nextTick(() => map?.invalidateSize({ pan: false }))
}

function switchBaseMap() {
  mapMode.value = mapMode.value === 'image' ? 'vector' : 'image'
  addBaseLayers()
}

onMounted(() => {
  if (!mapElement.value) return
  map = L.map(mapElement.value, { zoomControl: false, attributionControl: false, maxZoom: 20, dragging: true })
  if (token) addBaseLayers()
  else mapError.value = '未配置底图'
  renderLocation()
  void loadAddress()
  updatePlacement(true)
  resizeObserver = new ResizeObserver(() => {
    map?.invalidateSize({ pan: false })
    updatePlacement()
  })
  resizeObserver.observe(mapElement.value)
  if (panel.value?.parentElement) resizeObserver.observe(panel.value.parentElement)
  placementImage = panel.value?.parentElement?.querySelector(':scope > img') as HTMLImageElement | undefined
  if (placementImage) {
    resizeObserver.observe(placementImage)
    placementImage.addEventListener('load', handlePlacementImageLoad)
  }
})

watch(() => [props.media.id, props.media.longitude, props.media.latitude], () => {
  renderLocation()
  void loadAddress()
  nextTick(() => updatePlacement(true))
})
watch(() => props.fullscreen, async () => {
  endDrag()
  endResize()
  preferredSize = undefined
  anchored = true
  panelPosition.value = undefined
  panelSize.value = undefined
  placementReady.value = false
  await nextTick()
  updatePlacement(true)
}, { flush: 'post' })

onBeforeUnmount(() => {
  endDrag()
  endResize()
  addressController?.abort()
  placementImage?.removeEventListener('load', handlePlacementImageLoad)
  resizeObserver?.disconnect()
  map?.remove()
  map = undefined
})
</script>

<template>
  <section ref="panel" class="photo-location" :class="{ 'is-dragging': dragging, 'is-resizing': resizing, 'is-positioned': placementReady }" :style="panelStyle" aria-label="拍摄位置" @pointerdown.stop @wheel.stop @dblclick.stop @click.stop @keydown.stop>
    <header tabindex="0" aria-label="拖动拍摄位置窗口，或使用方向键移动" title="按住标题栏拖动" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag" @keydown="movePanelWithKey"><strong>拍摄位置 <span class="drag-grip" aria-hidden="true">⠿</span></strong></header>
    <div class="photo-location__map-wrap">
      <div ref="mapElement" class="photo-location__map" />
      <p v-if="mapError" class="photo-location__state">{{ mapError }}</p>
    </div>
    <dl class="photo-location__details">
      <div class="coordinate-row"><dt>经纬度</dt><dd>{{ formatCoordinate(media.longitude!, 'E', 'W') }}，{{ formatCoordinate(media.latitude!, 'N', 'S') }}</dd><button type="button" class="navigation-button" aria-label="导航" @click.stop="navigateToLocation">导航</button></div>
      <div><dt>地址</dt><dd :title="address">{{ address }}</dd></div>
    </dl>
    <button type="button" :aria-label="`切换底图，当前为${mapMode === 'image' ? '影像地图' : '电子地图'}`" :title="`当前：${mapMode === 'image' ? '影像地图' : '电子地图'}；点击切换`" @click.stop="switchBaseMap">切换底图</button>
    <button v-for="edge in (['left', 'right'] as const)" :key="edge" type="button" class="photo-location__resize-handle" :class="`at-${edge}`" :aria-label="edge === 'left' ? '从左下角调整窗口大小' : '从右下角调整窗口大小'" title="拖动调整窗口大小，或用方向键缩放" @pointerdown.stop="startResize($event, edge)" @pointermove="moveResize" @pointerup="endResize" @pointercancel="endResize" @lostpointercapture="endResize" @keydown="resizeWithKey" />
  </section>
</template>

<style scoped>
.photo-location{position:absolute;z-index:7;top:12px;right:12px;display:flex;width:min(340px,calc(100% - 24px));height:300px;overflow:hidden;visibility:hidden;box-sizing:border-box;flex-direction:column;border:1px solid #5a9aaf;border-radius:8px;color:#dff4fc;background:#102d40f5;box-shadow:0 8px 25px #00152366;font-size:11px;pointer-events:auto}.photo-location.is-positioned{visibility:visible}
.photo-location header{display:flex;flex:none;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #345464;cursor:grab;touch-action:none;user-select:none}.photo-location.is-dragging header{cursor:grabbing}.photo-location header:focus-visible{outline:2px solid #4fe2f4;outline-offset:-2px}
.photo-location header strong{display:block;font-size:13px}
.drag-grip{margin-left:5px;color:#91b5c4}
.photo-location__map-wrap{position:relative;flex:1;min-height:0}.photo-location__map{height:100%;background:#263e4a}
.photo-location__state{position:absolute;inset:0;z-index:500;display:grid;margin:0;place-items:center;color:#edcc8c;background:#102d40d9}
.photo-location__details{display:grid;flex:none;gap:5px;margin:0;padding:8px 10px 0;border-top:1px solid #345464;color:#b8dfeb;line-height:1.45}.photo-location__details>div{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;gap:5px}.photo-location__details>div.coordinate-row{grid-template-columns:44px minmax(0,1fr) auto}.photo-location__details dt{color:#91b5c4}.photo-location__details dd{min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.photo-location>button:not(.photo-location__resize-handle){display:flex;flex:none;align-items:center;justify-content:center;margin:8px 10px;padding:6px;border:1px solid #4d7e92;border-radius:4px;color:#d3f1fc;background:#1d4356;font:inherit;cursor:pointer}
.photo-location>button:not(.photo-location__resize-handle):hover{border-color:#39bdd1;color:#55e0ed;background:#245066}
.photo-location__details .navigation-button{flex:none;margin-left:3px;padding:2px 7px;border:1px solid #4d7e92;border-radius:4px;color:#d3f1fc;background:#1d4356;font:inherit;line-height:1.4;cursor:pointer}.photo-location__details .navigation-button:hover{border-color:#39bdd1;color:#55e0ed;background:#245066}.navigation-tooltip-card{padding:9px 12px;border-radius:7px;background:linear-gradient(135deg,#fff,#fff5f6);font-family:"Microsoft YaHei",sans-serif}.navigation-tooltip-card strong{display:block;color:#c43b4d;font-size:12px;line-height:1.4;white-space:nowrap}
.photo-location>.photo-location__resize-handle{position:absolute;z-index:550;bottom:0;width:19px;height:19px;margin:0;padding:0;border:0;background:transparent;touch-action:none}.photo-location__resize-handle.at-left{left:0;cursor:nesw-resize}.photo-location__resize-handle.at-right{right:0;cursor:nwse-resize}.photo-location__resize-handle::after{position:absolute;right:3px;bottom:3px;width:7px;height:7px;border-right:2px solid #86c4d5;border-bottom:2px solid #86c4d5;content:''}.photo-location__resize-handle.at-left::after{right:auto;left:3px;transform:rotate(90deg)}.photo-location__resize-handle:focus-visible{outline:2px solid #4fe2f4;outline-offset:-2px}
.photo-location__map :deep(.photo-drone-marker){color:#fff;filter:drop-shadow(0 1px 4px #001f38)}
.photo-location__map :deep(.photo-drone-marker svg){width:34px;height:34px;fill:#118eb5;stroke:currentColor;stroke-width:1.7}
@media(max-width:800px){.photo-location{width:min(270px,calc(100% - 20px));height:250px}}
</style>
