<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TaskAbnormal } from '@/api/governance-task'
import type { MapServiceItem } from '@/api/map-service'
import {
  createMapServiceLayer,
  MAP_SERVICE_IMAGERY_PANE,
  MAP_SERVICE_VECTOR_PANE,
  type MapServiceLayerHandle,
} from '@/utils/map-service-layer'

export type SpotDrawingMode = 'off' | 'available' | 'active' | 'preview' | 'blocked'

export interface ComparisonPeriod {
  number: number
  label: string
  kind: 'image' | 'map-service' | 'empty'
  imageUrl?: string
  mapService?: MapServiceItem
}

export interface SynchronizedMapView {
  center: [number, number]
  zoom: number
  source: symbol
}

const props = withDefaults(defineProps<{
  /** 地理影像窗口使用当前图斑的空间范围。 */
  spot?: TaskAbnormal
  period: ComparisonPeriod
  /** 用于期次栏缩略图时隐藏说明和期次浮标。 */
  thumbnail?: boolean
  /** 仅地理影像窗口使用；普通图片查看器不参与视图联动。 */
  synchronizedView?: SynchronizedMapView
  /** 新增图斑时复用当前地理影像窗口进行圈画。 */
  drawingMode?: SpotDrawingMode
  draftCoordinates?: Array<[number, number]>
}>(), { drawingMode: 'off', draftCoordinates: () => [] })

const emit = defineEmits<{
  select: [id: string]
  'view-change': [view: SynchronizedMapView]
  'draw-point': [period: number, coordinate: [number, number], mapServiceId?: string | number]
  'finish-drawing': []
}>()
const container = ref<HTMLElement>()
const imageError = ref(false)
const referenceImageryError = ref('')
let map: L.Map | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame: number | undefined
let synchronizationFrame: number | undefined
let referenceImagery: MapServiceLayerHandle | undefined
let spotBoundaryLayer: L.Layer | undefined
let draftShapeLayer: L.Layer | undefined
let draftVertexLayer: L.LayerGroup | undefined
let draftHoverLayer: L.Layer | undefined
let applyingSynchronizedView = false
const synchronizationSource = Symbol('spot-map')
const drawingCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M18.8 2.7l6.5 6.5-12.8 12.8-7.4 1.7 1.7-7.4z' fill='%23ffffff' stroke='%23073550' stroke-width='1.7' stroke-linejoin='round'/%3E%3Cpath d='M6.8 16.3l6.5 6.5-8.2 1.9z' fill='%2319a5c7' stroke='%23073550' stroke-width='1.7' stroke-linejoin='round'/%3E%3Cpath d='M17.1 4.4l6.5 6.5' stroke='%2319a5c7' stroke-width='2'/%3E%3C/svg%3E") 4 24, crosshair`

function isSynchronizedImagery() {
  return !props.thumbnail && props.period.kind === 'map-service'
}

function sameView(view: SynchronizedMapView) {
  if (!map) return true
  const center = map.getCenter()
  return map.getZoom() === view.zoom
    && Math.abs(center.lat - view.center[0]) < 1e-9
    && Math.abs(center.lng - view.center[1]) < 1e-9
}

function applySynchronizedView(view?: SynchronizedMapView) {
  if (!map || !view || view.source === synchronizationSource || !isSynchronizedImagery() || sameView(view)) return
  applyingSynchronizedView = true
  map.setView(view.center, view.zoom, { animate: false })
  applyingSynchronizedView = false
}

function publishMapView() {
  synchronizationFrame = undefined
  if (!map || applyingSynchronizedView || !isSynchronizedImagery()) return
  const center = map.getCenter()
  emit('view-change', { center: [center.lat, center.lng], zoom: map.getZoom(), source: synchronizationSource })
}

function scheduleMapViewPublish() {
  if (applyingSynchronizedView || synchronizationFrame !== undefined) return
  synchronizationFrame = window.requestAnimationFrame(publishMapView)
}

function enableViewSynchronization() {
  if (!map || !isSynchronizedImagery()) return
  // 已有基准视图时直接采用；否则由当前（通常为第 1 期）窗口发布初始视图。
  if (props.synchronizedView) applySynchronizedView(props.synchronizedView)
  map.on('move', scheduleMapViewPublish)
  if (!props.synchronizedView) publishMapView()
}

function isArea(bounds: L.LatLngBounds) {
  return bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())
}

function isDrawingOnThisMap() {
  return !props.thumbnail && props.period.kind === 'map-service'
    && (props.drawingMode === 'available' || props.drawingMode === 'active')
}

function renderDraftBoundary() {
  draftShapeLayer?.remove()
  draftVertexLayer?.remove()
  draftShapeLayer = undefined
  draftVertexLayer = undefined
  if (!map || !['active', 'preview', 'blocked'].includes(props.drawingMode) || !props.draftCoordinates.length) return
  const latLngs = props.draftCoordinates.map(([longitude, latitude]) => L.latLng(latitude, longitude))
  draftVertexLayer = L.layerGroup().addTo(map)
  latLngs.forEach((latLng, index) => {
    L.circleMarker(latLng, {
      pane: 'spot-drawing', radius: 5, color: '#fff', weight: 2,
      fillColor: index === 0 ? '#fff1a8' : '#ffc928', fillOpacity: 1,
    }).addTo(draftVertexLayer!)
  })
  draftShapeLayer = latLngs.length >= 3
    ? L.polygon(latLngs, { pane: 'spot-drawing', color: '#ffbd00', weight: 3, fillColor: '#ffd84d', fillOpacity: .28 })
    : L.polyline(latLngs, { pane: 'spot-drawing', color: '#ffbd00', weight: 3, dashArray: '7 5' })
  draftShapeLayer?.addTo(map)
}

function clearDraftHover() {
  draftHoverLayer?.remove()
  draftHoverLayer = undefined
}

function renderDraftHover(latlng: L.LatLng) {
  clearDraftHover()
  if (!map || !isDrawingOnThisMap() || !props.draftCoordinates.length) return
  const previewPoints = [
    ...props.draftCoordinates.map(([longitude, latitude]) => L.latLng(latitude, longitude)),
    latlng,
  ]
  const pathOptions: L.PathOptions = {
    pane: 'spot-drawing', color: '#ffcf3d', weight: 3, opacity: .95,
    dashArray: '7 5', fillColor: '#ffe36c', fillOpacity: .28,
  }
  draftHoverLayer = previewPoints.length >= 3
    ? L.polygon(previewPoints, pathOptions)
    : L.polyline(previewPoints, pathOptions)
  draftHoverLayer.addTo(map)
}

function updateDrawingMode() {
  const hideOriginalBoundary = ['available', 'active', 'blocked'].includes(props.drawingMode)
  const canvas = container.value
  if (canvas) canvas.style.cursor = isDrawingOnThisMap() ? drawingCursor : ''
  if (!isDrawingOnThisMap()) clearDraftHover()
  if (spotBoundaryLayer) {
    if (hideOriginalBoundary && map?.hasLayer(spotBoundaryLayer)) spotBoundaryLayer.remove()
    else if (!hideOriginalBoundary && map && !map.hasLayer(spotBoundaryLayer)) spotBoundaryLayer.addTo(map)
  }
  renderDraftBoundary()
}

function handleMapClick(event: L.LeafletMouseEvent) {
  if (!isDrawingOnThisMap()) return
  emit('draw-point', props.period.number, [Number(event.latlng.lng.toFixed(8)), Number(event.latlng.lat.toFixed(8))], props.period.mapService?.id)
}

function handleMapContextMenu() {
  if (!isDrawingOnThisMap() || props.draftCoordinates.length < 3) return
  clearDraftHover()
  emit('finish-drawing')
}

function handleMapMouseMove(event: L.LeafletMouseEvent) {
  renderDraftHover(event.latlng)
}

function handleMapMouseOut() {
  clearDraftHover()
}

/**
 * 第 2 期及以后：以原图像素坐标创建独立查看器。
 * 这里没有天地图、图斑边界或视图同步，拖动与缩放只作用于本窗口。
 */
function createImageViewer(imageUrl: string) {
  if (!container.value) return
  map = L.map(container.value, {
    crs: L.CRS.Simple,
    minZoom: -4,
    maxZoom: 4,
    zoomControl: true,
    attributionControl: false,
    zoomSnap: .25,
  }).setView([0, 0], 0)
  const source = new Image()
  source.onload = () => {
    if (!map || !source.naturalWidth || !source.naturalHeight) return
    const bounds = L.latLngBounds([0, 0], [source.naturalHeight, source.naturalWidth])
    L.imageOverlay(imageUrl, bounds, { opacity: 1, interactive: false }).on('error', () => { imageError.value = true }).addTo(map)
    map.setMaxBounds(bounds.pad(.5))
    map.fitBounds(bounds, { padding: [12, 12], animate: false })
  }
  source.onerror = () => { imageError.value = true }
  source.src = imageUrl
}

/** 地图服务影像保留地理坐标，可与当前图斑边界在同一视图中展示。 */
async function createMapServiceViewer(service: MapServiceItem) {
  if (!container.value) return
  referenceImageryError.value = ''
  map = L.map(container.value, {
    maxZoom: 22,
    zoomControl: !props.thumbnail,
    attributionControl: false,
    dragging: !props.thumbnail,
    scrollWheelZoom: !props.thumbnail,
    doubleClickZoom: !props.thumbnail,
    boxZoom: !props.thumbnail,
    keyboard: !props.thumbnail,
  }).setView([32.4555, 119.9255], 11)
  const imageryPane = map.createPane(MAP_SERVICE_IMAGERY_PANE)
  imageryPane.style.zIndex = '225'
  imageryPane.style.pointerEvents = 'none'
  const vectorPane = map.createPane(MAP_SERVICE_VECTOR_PANE)
  vectorPane.style.zIndex = '335'
  vectorPane.style.pointerEvents = 'none'
  const drawingPane = map.createPane('spot-drawing')
  drawingPane.style.zIndex = '620'

  try {
    const handle = await createMapServiceLayer(service)
    if (!map) {
      handle.layer.remove()
      return
    }
    referenceImagery = handle
    handle.layer.addTo(map)

    let spotBounds: L.LatLngBounds | undefined
    if (props.spot?.boundaryGeoJson?.features.length) {
      try {
        const boundary = L.geoJSON(props.spot.boundaryGeoJson as GeoJSON.FeatureCollection, {
          style: { color: '#f3475b', weight: 3, opacity: 1, fillColor: '#f3475b', fillOpacity: .16, dashArray: '5 4' },
          pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
            radius: 7, color: '#fff', weight: 2, fillColor: '#f3475b', fillOpacity: 1,
          }),
        })
        const bounds = boundary.getBounds()
        if (bounds.isValid()) {
          boundary.addTo(map)
          spotBoundaryLayer = boundary
          spotBounds = bounds
        }
      } catch {
        // 历史图斑边界不规范时继续使用中心点或服务范围定位。
      }
    }
    if (spotBounds && isArea(spotBounds)) {
      map.fitBounds(spotBounds.pad(.7), { padding: props.thumbnail ? [0, 0] : [24, 24], maxZoom: 20, animate: false })
    } else if (props.spot?.latitude !== undefined && props.spot.longitude !== undefined) {
      spotBoundaryLayer = L.circleMarker([props.spot.latitude, props.spot.longitude], {
        radius: 8, color: '#fff', weight: 2, fillColor: '#f3475b', fillOpacity: 1,
      }).addTo(map)
      map.setView([props.spot.latitude, props.spot.longitude], 18, { animate: false })
    } else if (handle.bounds?.isValid()) {
      map.fitBounds(handle.bounds, { padding: [12, 12], maxZoom: 18, animate: false })
    }
  } catch (reason) {
    referenceImageryError.value = reason instanceof Error ? reason.message : '地图服务影像加载失败'
  }
}

onMounted(async () => {
  await nextTick()
  if (!container.value || props.period.kind === 'empty') return
  if (props.period.kind === 'map-service' && props.period.mapService) await createMapServiceViewer(props.period.mapService)
  else if (props.period.imageUrl) createImageViewer(props.period.imageUrl)
  if (!map) return
  map.on('click', handleMapClick)
  map.on('contextmenu', handleMapContextMenu)
  map.on('mousemove', handleMapMouseMove)
  map.on('mouseout', handleMapMouseOut)
  updateDrawingMode()
  enableViewSynchronization()
  resizeObserver = new ResizeObserver(() => {
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
    resizeFrame = window.requestAnimationFrame(() => map?.invalidateSize({ pan: false }))
  })
  resizeObserver.observe(container.value)
})

watch(() => props.synchronizedView, (view) => applySynchronizedView(view))
watch(() => props.drawingMode, updateDrawingMode)
watch(() => props.draftCoordinates, renderDraftBoundary, { deep: true })

onBeforeUnmount(() => {
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
  if (synchronizationFrame !== undefined) window.cancelAnimationFrame(synchronizationFrame)
  resizeObserver?.disconnect()
  referenceImagery?.layer.remove()
  referenceImagery = undefined
  spotBoundaryLayer?.remove()
  spotBoundaryLayer = undefined
  draftShapeLayer?.remove()
  draftVertexLayer?.remove()
  clearDraftHover()
  map?.off('move', scheduleMapViewPublish)
  map?.off('click', handleMapClick)
  map?.off('contextmenu', handleMapContextMenu)
  map?.off('mousemove', handleMapMouseMove)
  map?.off('mouseout', handleMapMouseOut)
  map?.remove()
  map = undefined
})
</script>

<template>
  <div class="spot-map" :class="{ 'spot-map--empty': period.kind === 'empty', 'spot-map--thumbnail': thumbnail, 'spot-map--drawing': drawingMode === 'available' || drawingMode === 'active', 'spot-map--drawing-active': drawingMode === 'active', 'spot-map--drawing-preview': drawingMode === 'preview' }">
    <div v-if="period.kind !== 'empty'" ref="container" class="spot-map__canvas"></div>
    <div v-if="!thumbnail" class="map-top-labels">
      <div v-if="drawingMode === 'active'" class="drawing-prompt drawing-prompt--active drawing-prompt--top">至少绘制三个点，单击鼠标右键完成绘制 · 已绘制 {{ draftCoordinates.length }} 个点</div>
      <div v-else-if="drawingMode === 'blocked'" class="drawing-prompt drawing-prompt--active drawing-prompt--top">请在已选中的影像窗口继续绘制</div>
      <span class="period-badge">第 {{ period.number }} 期 · {{ period.label }}</span>
    </div>
    <div v-if="!thumbnail && period.kind === 'map-service' && referenceImageryError" class="imagery-layer-error">{{ referenceImageryError }}</div>
    <div v-if="!thumbnail && period.kind === 'empty'" class="empty-imagery">暂无多期影像</div>
    <div v-else-if="!thumbnail && period.kind === 'image' && imageError" class="empty-imagery empty-imagery--error">关联影像加载失败</div>
    <div v-if="!thumbnail && drawingMode === 'available'" class="drawing-prompt">在此窗口点选第一个边界点</div>
    <div v-else-if="!thumbnail && drawingMode === 'preview'" class="drawing-prompt drawing-prompt--preview">新增图斑边界预览</div>
    <div v-if="!thumbnail && drawingMode === 'blocked'" class="drawing-blocked"></div>
  </div>
</template>

<style scoped>
.spot-map { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; background: #dce8ee; }
.spot-map--empty { background: #d2d9de; }
.spot-map__canvas { position: absolute; inset: 0; }
.map-top-labels { position:absolute; z-index:700; top:9px; left:9px; right:9px; display:flex; justify-content:flex-end; align-items:flex-start; gap:8px; min-width:0; pointer-events:none; }
.period-badge { flex:none; padding:5px 8px; color:#effbff; background:#08364ad9; border:1px solid #54d6e099; border-radius:4px; font-size:12px; font-weight:600; white-space:nowrap; pointer-events:none; }
.empty-imagery { position: absolute; z-index: 500; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 10px 15px; color: #526773; background: #edf1f3dd; border: 1px solid #afbdc5; border-radius: 4px; font-size: 14px; font-weight: 600; white-space: nowrap; pointer-events: none; }
.empty-imagery--error { color: #a64a4a; }
.imagery-layer-error { position: absolute; z-index: 500; right: 9px; bottom: 9px; max-width: calc(100% - 18px); padding: 5px 8px; color: #fff0f0; border: 1px solid #d98787; border-radius: 4px; background: #661f25d9; font-size: 11px; pointer-events: none; }
.spot-map--drawing { box-shadow: inset 0 0 0 3px #14a9cf; }.spot-map--drawing-active { box-shadow: inset 0 0 0 3px #ff4055; }.spot-map--drawing-preview { box-shadow:inset 0 0 0 3px #21a47a; }.drawing-prompt { position:absolute; z-index:700; left:50%; bottom:14px; transform:translateX(-50%); padding:7px 12px; color:#fff; background:#087da5e8; border:1px solid #6ae5f4; border-radius:16px; box-shadow:0 3px 10px #00263e66; font-size:12px; font-weight:700; white-space:nowrap; pointer-events:none; }.drawing-prompt--active { background:#bd3043e8; border-color:#ffc1c8; }.drawing-prompt--top { position:static; min-width:0; overflow:hidden; transform:none; text-overflow:ellipsis; }.drawing-prompt--preview { background:#147b60e8; border-color:#9ff0d4; }.drawing-blocked { position:absolute; z-index:690; inset:0; background:rgba(233,240,243,.1); pointer-events:none; }
</style>
