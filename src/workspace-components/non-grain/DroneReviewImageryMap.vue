<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import demoImageryUrl from '@/assets/non-grain-demo-grid.png'

type Point = [number, number]

const props = withDefaults(defineProps<{
  mode?: 'reference' | 'draw' | 'swipe'
  sourceIndex?: number
  imageUrl?: string
  swipePosition?: number
  readonly?: boolean
  label?: string
  coordinates?: Point[]
}>(), {
  mode: 'draw',
  sourceIndex: 7,
  imageUrl: '',
  swipePosition: 50,
  readonly: false,
  label: '',
  coordinates: () => [],
})

const emit = defineEmits<{
  'update:coordinates': [value: Point[]]
  complete: [value: Point[]]
}>()

const mapElement = ref<HTMLElement>()
const points = ref<Point[]>([...props.coordinates])
const drawing = ref(false)
const finished = ref(points.value.length >= 3)
const area = computed(() => {
  if (points.value.length < 3) return 0
  let total = 0
  points.value.forEach((point, index) => {
    const next = points.value[(index + 1) % points.value.length]!
    total += point[0] * next[1] - next[0] * point[1]
  })
  return Math.abs(total / 2) / 10000 * 15.6
})

let map: L.Map | undefined
let resizeObserver: ResizeObserver | undefined
let referenceOverlay: L.ImageOverlay | undefined
let reviewOverlay: L.ImageOverlay | undefined
let referencePolygon: L.Polygon | undefined
let reviewShape: L.Polygon | L.Polyline | undefined
let vertexLayer: L.LayerGroup | undefined
let renderVersion = 0

const bounds = L.latLngBounds([0, 0], [100, 100])
const issueBoundary: Point[] = [[21, 68], [34, 83], [62, 80], [79, 58], [70, 30], [43, 22], [24, 39]]
const cropCache = new Map<number, Promise<string>>()

function spriteCrop(index: number) {
  const normalizedIndex = Math.max(0, Math.min(11, index))
  const cached = cropCache.get(normalizedIndex)
  if (cached) return cached
  const task = new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const cellWidth = Math.floor(image.naturalWidth / 4)
      const cellHeight = Math.floor(image.naturalHeight / 3)
      const canvas = document.createElement('canvas')
      canvas.width = cellWidth
      canvas.height = cellHeight
      const context = canvas.getContext('2d')
      if (!context) return reject(new Error('无法创建影像画布'))
      const column = normalizedIndex % 4
      const row = Math.floor(normalizedIndex / 4)
      context.drawImage(image, column * cellWidth, row * cellHeight, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight)
      resolve(canvas.toDataURL('image/jpeg', .9))
    }
    image.onerror = () => reject(new Error('复核演示影像加载失败'))
    image.src = demoImageryUrl
  })
  cropCache.set(normalizedIndex, task)
  return task
}

function removeImagery() {
  referenceOverlay?.remove()
  reviewOverlay?.remove()
  referenceOverlay = undefined
  reviewOverlay = undefined
}

function applySwipeClip() {
  const element = reviewOverlay?.getElement()
  if (!element) return
  element.style.clipPath = props.mode === 'swipe'
    ? `inset(0 ${100 - props.swipePosition}% 0 0)`
    : 'none'
}

async function renderImagery() {
  if (!map) return
  const version = ++renderVersion
  const referenceUrl = await spriteCrop(2)
  const reviewUrl = props.imageUrl || await spriteCrop(props.sourceIndex)
  if (!map || version !== renderVersion) return
  removeImagery()
  if (props.mode === 'reference') {
    referenceOverlay = L.imageOverlay(referenceUrl, bounds, { className: 'drone-review-image' }).addTo(map)
  } else if (props.mode === 'swipe') {
    referenceOverlay = L.imageOverlay(referenceUrl, bounds, { className: 'drone-review-image' }).addTo(map)
    reviewOverlay = L.imageOverlay(reviewUrl, bounds, { className: 'drone-review-image drone-review-current' }).addTo(map)
    applySwipeClip()
  } else {
    reviewOverlay = L.imageOverlay(reviewUrl, bounds, { className: 'drone-review-image' }).addTo(map)
  }
  renderShapes()
}

function renderShapes() {
  if (!map) return
  referencePolygon?.remove()
  reviewShape?.remove()
  vertexLayer?.remove()
  referencePolygon = undefined
  reviewShape = undefined
  vertexLayer = undefined

  if (props.mode !== 'draw') {
    referencePolygon = L.polygon(issueBoundary.map(([x, y]) => [y, x] as L.LatLngTuple), {
      color: '#ff3849',
      fillColor: '#ff3849',
      fillOpacity: .14,
      weight: 3,
      dashArray: '8 6',
    }).addTo(map)
  }

  if (!points.value.length || props.mode === 'reference') return
  const latLngs = points.value.map(([x, y]) => [y, x] as L.LatLngTuple)
  reviewShape = (points.value.length >= 3
    ? L.polygon(latLngs, { color: '#16d68e', fillColor: '#1ce39b', fillOpacity: .24, weight: 3 })
    : L.polyline(latLngs, { color: '#16d68e', weight: 3, dashArray: '6 5' })).addTo(map)
  vertexLayer = L.layerGroup(points.value.map(([x, y], index) => L.circleMarker([y, x], {
    radius: 5,
    color: '#fff',
    fillColor: '#0ebd7b',
    fillOpacity: 1,
    weight: 2,
  }).bindTooltip(String(index + 1), { permanent: true, direction: 'center', className: 'review-vertex-label' }))).addTo(map)
}

function updatePoints(next: Point[]) {
  points.value = next
  emit('update:coordinates', [...next])
  renderShapes()
}

function startDrawing() {
  if (props.readonly || props.mode === 'reference') return
  if (finished.value && points.value.length) updatePoints([])
  finished.value = false
  drawing.value = true
}

function undoPoint() {
  if (props.readonly || !points.value.length) return
  finished.value = false
  drawing.value = true
  updatePoints(points.value.slice(0, -1))
}

function clearDrawing() {
  if (props.readonly) return
  finished.value = false
  drawing.value = true
  updatePoints([])
}

function finishDrawing() {
  if (props.readonly || points.value.length < 3) return
  finished.value = true
  drawing.value = false
  emit('complete', [...points.value])
  renderShapes()
}

function addPoint(event: L.LeafletMouseEvent) {
  if (props.readonly || props.mode === 'reference' || !drawing.value) return
  const point: Point = [Number(event.latlng.lng.toFixed(2)), Number(event.latlng.lat.toFixed(2))]
  const last = points.value.at(-1)
  if (last && Math.hypot(last[0] - point[0], last[1] - point[1]) < .7) return
  updatePoints([...points.value, point])
}

onMounted(async () => {
  await nextTick()
  if (!mapElement.value) return
  map = L.map(mapElement.value, {
    crs: L.CRS.Simple,
    minZoom: -1,
    maxZoom: 2,
    zoomControl: true,
    attributionControl: false,
    doubleClickZoom: false,
    maxBounds: L.latLngBounds([-18, -18], [118, 118]),
  })
  map.fitBounds(bounds, { padding: [0, 0] })
  map.on('click', addPoint)
  map.on('dblclick', finishDrawing)
  resizeObserver = new ResizeObserver(() => map?.invalidateSize({ pan: false }))
  resizeObserver.observe(mapElement.value)
  await renderImagery()
})

watch(() => [props.imageUrl, props.sourceIndex, props.mode], () => void renderImagery())
watch(() => props.swipePosition, applySwipeClip)
watch(() => props.coordinates, (value) => {
  if (JSON.stringify(value) === JSON.stringify(points.value)) return
  points.value = [...value]
  finished.value = value.length >= 3
  renderShapes()
}, { deep: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  renderVersion += 1
  map?.remove()
  map = undefined
})
</script>

<template>
  <div class="review-imagery-map" :class="{ 'is-drawing': drawing }">
    <div ref="mapElement" class="review-imagery-map__canvas" />
    <div class="review-map-label">{{ label }}</div>
    <div v-if="mode !== 'reference' && !readonly" class="review-draw-toolbar">
      <button type="button" :class="{ active: drawing }" @click="startDrawing">{{ finished ? '重新勾画' : drawing ? '勾画中' : '开始勾画' }}</button>
      <button type="button" :disabled="!points.length" @click="undoPoint">撤销</button>
      <button type="button" :disabled="!points.length" @click="clearDrawing">清空</button>
      <button type="button" class="finish" :disabled="points.length < 3" @click="finishDrawing">完成绘制</button>
    </div>
    <div v-if="mode !== 'reference'" class="review-area-status" :class="{ complete: finished }">
      <b>{{ finished ? '已完成勾画' : drawing ? '请在地图上依次落点' : '尚未勾画整改区域' }}</b>
      <span>{{ points.length }} 个顶点<span v-if="area"> · 约 {{ area.toFixed(2) }} 亩</span></span>
    </div>
  </div>
</template>

<style scoped>
.review-imagery-map { position: relative; width: 100%; height: 100%; min-height: 210px; overflow: hidden; background: #173745; border: 1px solid #bfd1dc; border-radius: 6px; }
.review-imagery-map__canvas { position: absolute; inset: 0; }
.review-imagery-map.is-drawing :deep(.leaflet-container) { cursor: crosshair; }
.review-imagery-map :deep(.leaflet-container) { width: 100%; height: 100%; background: #294b55; font-family: inherit; }
.review-imagery-map :deep(.leaflet-control-zoom) { margin: 9px 0 0 9px; border: 0; box-shadow: 0 3px 10px #0a263b66; }
.review-imagery-map :deep(.leaflet-control-zoom a) { width: 27px; height: 27px; color: #fff; background: #0a334de8; border-bottom-color: #ffffff30; line-height: 27px; }
.review-imagery-map :deep(.review-vertex-label) { width: 16px; height: 16px; margin: 0 !important; padding: 0; display: grid; place-items: center; color: #075c3d; background: #fff; border: 0; border-radius: 50%; box-shadow: 0 1px 4px #053c2b66; font-size: 9px; font-weight: 800; transform: translate(-8px, -8px); }
.review-imagery-map :deep(.review-vertex-label::before) { display: none; }
.review-map-label { position: absolute; z-index: 500; top: 9px; right: 9px; max-width: calc(100% - 90px); padding: 5px 8px; overflow: hidden; color: #fff; background: #092f48df; border: 1px solid #ffffff38; border-radius: 4px; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; }
.review-draw-toolbar { position: absolute; z-index: 510; left: 9px; bottom: 9px; display: flex; gap: 4px; padding: 4px; background: #092f48e8; border: 1px solid #ffffff35; border-radius: 5px; box-shadow: 0 3px 10px #06263b55; }
.review-draw-toolbar button { height: 27px; padding: 0 8px; color: #d9effb; background: #164660; border: 1px solid #ffffff25; border-radius: 3px; font-size: 10px; cursor: pointer; }
.review-draw-toolbar button:hover,.review-draw-toolbar button.active { color: #fff; background: #1687ef; }
.review-draw-toolbar button.finish { background: #119d6b; }
.review-draw-toolbar button:disabled { color: #7892a1; background: #254757; cursor: not-allowed; }
.review-area-status { position: absolute; z-index: 505; right: 9px; bottom: 9px; min-width: 120px; padding: 5px 8px; color: #f4fbff; background: #153f56e8; border-left: 3px solid #80a8bb; border-radius: 4px; text-align: right; pointer-events: none; }
.review-area-status.complete { border-left-color: #18d08b; }
.review-area-status b,.review-area-status span { display: block; }
.review-area-status b { font-size: 10px; }.review-area-status span { margin-top: 2px; color: #b9d3df; font-size: 9px; }
@media (max-width: 1100px) {
  .review-draw-toolbar button { padding-inline: 5px; }
  .review-area-status { display: none; }
}
</style>
