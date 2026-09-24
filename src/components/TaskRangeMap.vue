<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TaskAbnormal, TaskGeometryFeatureCollection } from '@/api/governance-task'

type TaskMapView = { center: [number, number]; zoom: number }

const props = withDefaults(defineProps<{
  coordinates?: [number, number][]
  geoJson?: TaskGeometryFeatureCollection
  /** 编辑任务范围时使用：保留异常图斑作为只读红色参考图层。 */
  overlayGeoJson?: TaskGeometryFeatureCollection
  abnormalPoints?: TaskAbnormal[]
  activeAbnormalId?: string
  /** 对比窗口可只显示异常图斑，不叠加任务范围。 */
  showTaskRange?: boolean
  showAbnormal?: boolean
  /** 异常图斑面填充透明度；用于对比窗口只保留边界线。 */
  abnormalFillOpacity?: number
  /** 仅用于对比窗口：在任务范围底图上叠加 DOM 正射影像。 */
  showDomImagery?: boolean
  fitAbnormalPoints?: boolean
  /** 由主图负责初始范围适配；从图仅跟随共享视野，避免覆盖联合范围。 */
  autoFit?: boolean
  /** 父页面在异步要素全部到达后递增，用于强制按当前可见图层重新计算范围。 */
  fitRequest?: number
  view?: TaskMapView
  editable?: boolean
  /** 编辑既有范围时，默认完成绘制，支持拖动顶点；清空后再进入重新绘制模式。 */
  initialDrawingComplete?: boolean
}>(), { coordinates: () => [], abnormalPoints: () => [], showTaskRange: true, showAbnormal: true, abnormalFillOpacity: .2, fitAbnormalPoints: false, autoFit: true, editable: false, initialDrawingComplete: false })
const emit = defineEmits<{
  'update:coordinates': [value: [number, number][]]
  'view-change': [value: TaskMapView]
}>()

const container = ref<HTMLElement>()
const error = ref('')
const drawingFinished = ref(false)
const isDrawing = computed(() => props.editable && !drawingFinished.value)
const hasAreaGeometry = computed(() => props.geoJson?.features.some((feature) => {
  const geometryType = feature.geometry?.type.toUpperCase()
  return geometryType === 'POLYGON' || geometryType === 'MULTIPOLYGON'
}) ?? false)
let map: L.Map | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame: number | undefined
let polygon: L.Polygon | L.Polyline | undefined
let preview: L.Polygon | L.Polyline | undefined
let vertexLayer: L.LayerGroup | undefined
let geoJsonLayer: L.GeoJSON | undefined
let taskRangeLayer: L.GeoJSON | undefined
let abnormalLayer: L.FeatureGroup | undefined
let domImageryLayer: L.TileLayer | undefined
let taskRangeBounds: L.LatLngBounds | undefined
let applyingExternalView = false
let releaseExternalViewTimer: number | undefined
let autoFitFrame: number | undefined
const token = import.meta.env.VITE_TIANDITU_TOKEN
const domXyzTileUrl = import.meta.env.VITE_DOM_XYZ_TILE_URL?.trim()
const domBounds = L.latLngBounds(
  [32.48574015140688, 119.8412888155381],
  [32.49689672806349, 119.85940753661878],
)
const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']

function tileUrl(layer: 'img' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function fitRange(bounds: L.LatLngBounds) {
  if (map && bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] })
}

function renderDomImagery() {
  domImageryLayer?.remove()
  domImageryLayer = undefined
  if (!map || !props.showDomImagery || !domXyzTileUrl) return
  domImageryLayer = L.tileLayer(domXyzTileUrl, {
    bounds: domBounds,
    minNativeZoom: 16,
    maxNativeZoom: 22,
    maxZoom: 22,
    tms: true,
    opacity: .9,
    noWrap: true,
    attribution: 'DOM 正射影像',
  }).addTo(map)
}

/** 以 WGS84 球面近似计算多边形面积，单位：平方米。 */
function polygonAreaSquareMeters(points: [number, number][]) {
  if (points.length < 3) return 0
  const radius = 6378137
  const toRadians = (value: number) => value * Math.PI / 180
  let sum = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    sum += (toRadians(next[0]) - toRadians(current[0])) * (2 + Math.sin(toRadians(current[1])) + Math.sin(toRadians(next[1])))
  }
  return Math.abs(sum * radius * radius / 2)
}

function fitTaskAndAbnormalBounds() {
  if (!map) return
  const bounds = taskRangeBounds?.isValid()
    ? L.latLngBounds(taskRangeBounds.getSouthWest(), taskRangeBounds.getNorthEast())
    : L.latLngBounds([])
  if (props.fitAbnormalPoints) {
    // 优先使用地图上已经渲染的异常 GeoJSON。它既兼容只有中心点的旧数据，
    // 也兼容后端后续返回的面边界，不能只依赖异常列表中的经纬度字段。
    const abnormalGeometryBounds = geoJsonLayer?.getBounds()
    if (abnormalGeometryBounds?.isValid()) bounds.extend(abnormalGeometryBounds)
    // 以已渲染的红色异常点图层为准。即使接口字段名发生变化，只要点已成功显示，
    // 也一定会参与进入/返回任务时的联合缩放。
    const abnormalPointBounds = abnormalLayer?.getBounds()
    if (abnormalPointBounds?.isValid()) bounds.extend(abnormalPointBounds)
    props.abnormalPoints.forEach((item) => {
      if (item.longitude !== undefined && item.latitude !== undefined) bounds.extend([item.latitude, item.longitude])
    })
  }
  if (bounds.isValid()) fitRange(bounds)
  else if (geoJsonLayer?.getBounds().isValid()) fitRange(geoJsonLayer.getBounds())
}

/** 地图与容器尺寸稳定后再计算联合边界。 */
function scheduleAutoFit() {
  if (!props.autoFit) return
  scheduleFitOnce()
}

/** 父页面确认任务范围和异常图斑均已到达后调用；每次请求仅执行一次缩放。 */
function scheduleFitOnce() {
  if (autoFitFrame !== undefined) window.cancelAnimationFrame(autoFitFrame)
  autoFitFrame = window.requestAnimationFrame(() => {
    map?.invalidateSize({ pan: false })
    fitTaskAndAbnormalBounds()
  })
}

function emitMapView() {
  if (!map || applyingExternalView) return
  const center = map.getCenter()
  emit('view-change', { center: [center.lng, center.lat], zoom: map.getZoom() })
}

function applyExternalView(view?: TaskMapView) {
  if (!map || !view) return
  const center = map.getCenter()
  if (Math.abs(center.lng - view.center[0]) < 1e-7 && Math.abs(center.lat - view.center[1]) < 1e-7 && map.getZoom() === view.zoom) return
  applyingExternalView = true
  map.setView([view.center[1], view.center[0]], view.zoom, { animate: false })
  window.clearTimeout(releaseExternalViewTimer)
  releaseExternalViewTimer = window.setTimeout(() => { applyingExternalView = false }, 0)
}

function isTaskRangeFeature(feature: TaskGeometryFeatureCollection['features'][number]) {
  const geometryType = feature.geometry?.type.toUpperCase()
  const abnormalId = feature.properties?.abnormalId
  const resultId = feature.properties?.resultId
  // 不同后端版本对空关联字段可能返回 null、空字符串或字符串 "null"。
  // 这些都表示该面是任务本身的范围，而非成果或异常图斑。
  const isEmptyReference = (value: unknown) => value === undefined || value === null
    || value === '' || value === 'null' || value === 'undefined'
  return (geometryType === 'POLYGON' || geometryType === 'MULTIPOLYGON')
    && isEmptyReference(abnormalId)
    && isEmptyReference(resultId)
}

function renderPolygon(points = props.coordinates) {
  if (!map) return
  polygon?.remove()
  vertexLayer?.remove()
  geoJsonLayer?.remove()
  geoJsonLayer = undefined
  if (points.length < 2) {
    renderOverlayAbnormals()
    return
  }
  const latLngs = points.map((point) => [point[1], point[0]] as L.LatLngTuple)
  const style = {
    color: '#2aa8ff',
    weight: 2,
    fillColor: '#168ce6',
    fillOpacity: .1,
    dashArray: '6 5',
  }
  polygon = (points.length >= 3 ? L.polygon(latLngs, style) : L.polyline(latLngs, style)).addTo(map)
  vertexLayer = L.layerGroup(latLngs.map((point, index) => {
    if (props.editable) {
      const marker = L.marker(point, {
        draggable: true,
        icon: L.divIcon({ className: 'task-range-vertex', iconSize: [12, 12], iconAnchor: [6, 6] }),
      })
      marker.on('dragend', () => {
        const moved = marker.getLatLng()
        const next = props.coordinates.map((coordinate) => [...coordinate] as [number, number])
        next[index] = [moved.lng, moved.lat]
        emit('update:coordinates', next)
      })
      marker.on('drag', () => {
        // 拖动过程中只更新轮廓，不重建顶点图层，保证鼠标未松开时也能实时预览形状变化。
        const moved = marker.getLatLng()
        const next = props.coordinates.map((coordinate) => [...coordinate] as [number, number])
        next[index] = [moved.lng, moved.lat]
        polygon?.setLatLngs(next.map((coordinate) => [coordinate[1], coordinate[0]] as L.LatLngTuple))
      })
      marker.on('contextmenu', (event) => {
        L.DomEvent.stopPropagation(event)
        if (props.coordinates.length <= 3) return
        emit('update:coordinates', props.coordinates.filter((_, vertexIndex) => vertexIndex !== index))
      })
      return marker
    }
    return L.circleMarker(point, {
      radius: 4,
      color: '#dffbff',
      weight: 1.5,
      fillColor: '#1db6ed',
      fillOpacity: 1,
    })
  })).addTo(map)
  renderOverlayAbnormals()
  // 新增任务绘制完成后保留用户当前地图视野；详情页的 GeoJSON 会在 renderGeoJson 中自动定位。
  if (drawingFinished.value && !props.editable) fitRange(polygon.getBounds())
}

/** 任务范围与异常图斑分层：异常必须始终位于任务范围之上。 */
function ensureMapPanes() {
  if (!map) return
  if (!map.getPane('task-range-pane')) {
    const pane = map.createPane('task-range-pane')
    pane.style.zIndex = '650'
    pane.style.pointerEvents = 'none'
  }
  if (!map.getPane('abnormal-geometry-pane')) {
    const pane = map.createPane('abnormal-geometry-pane')
    pane.style.zIndex = '660'
  }
}

/** 在编辑态叠加后端异常图斑，但任务范围本身仍使用可拖动顶点的绘制图层。 */
function renderOverlayAbnormals() {
  if (!map || !props.overlayGeoJson?.features.length) return
  ensureMapPanes()
  const overlayFeatures = props.overlayGeoJson.features.filter((feature) => !isTaskRangeFeature(feature))
  if (!overlayFeatures.length) return
  geoJsonLayer = L.geoJSON({ type: 'FeatureCollection', features: overlayFeatures } as GeoJSON.FeatureCollection, {
    pane: 'abnormal-geometry-pane',
    style: { color: '#ff4656', weight: 2, opacity: .95, fillColor: '#ff4656', fillOpacity: props.abnormalFillOpacity, dashArray: '4 5' },
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
      pane: 'abnormal-geometry-pane',
      radius: 6,
      color: '#fff1f2',
      weight: 2,
      fillColor: '#ff4656',
      fillOpacity: .95,
    }),
  }).addTo(map)
}

function clearPreview() {
  preview?.remove()
  preview = undefined
}

function renderPreview(latlng: L.LatLng) {
  if (!map || !isDrawing.value || !props.coordinates.length) return clearPreview()
  clearPreview()
  const points = [...props.coordinates, [latlng.lng, latlng.lat] as [number, number]]
  const latLngs = points.map((point) => [point[1], point[0]] as L.LatLngTuple)
  const style = {
    color: '#6ee8ff',
    weight: 2,
    fillColor: '#42cbed',
    fillOpacity: .1,
    dashArray: '4 6',
  }
  preview = (points.length >= 3 ? L.polygon(latLngs, style) : L.polyline(latLngs, style)).addTo(map)
}

function renderGeoJson() {
  if (!map) return
  polygon?.remove()
  polygon = undefined
  geoJsonLayer?.remove()
  geoJsonLayer = undefined
  taskRangeLayer?.remove()
  taskRangeLayer = undefined
  taskRangeBounds = undefined
  if (!props.geoJson?.features.length) return
  const areaFeatures = props.geoJson.features.filter((feature) => {
    const geometryType = feature.geometry?.type.toUpperCase()
    return geometryType === 'POLYGON' || geometryType === 'MULTIPOLYGON'
  })
  const declaredTaskRangeFeatures = props.geoJson.features.filter(isTaskRangeFeature)
  // 主页已能以首个面要素正确绘制该任务范围。若某个后端版本未按约定返回关联字段，
  // 详情页采用同一回退规则，避免把任务范围完全漏掉。
  const taskRangeFeatures = declaredTaskRangeFeatures.length ? declaredTaskRangeFeatures : areaFeatures.slice(0, 1)
  const taskRangeSet = new Set(taskRangeFeatures)
  const abnormalGeometryFeatures = props.showAbnormal
    ? props.geoJson.features.filter((feature) => !taskRangeSet.has(feature))
    : []
  // 任务范围与异常图斑分图层渲染，异常图斑 pane 层级高于任务范围。
  ensureMapPanes()
  if (props.showTaskRange) {
    taskRangeLayer = L.geoJSON({ type: 'FeatureCollection', features: taskRangeFeatures } as GeoJSON.FeatureCollection, {
      pane: 'task-range-pane',
      style: {
        color: '#3aefff',
        weight: 4,
        opacity: 1,
        fillColor: '#17cdec',
        fillOpacity: .1,
        dashArray: '10 6',
      },
      onEachFeature: (_feature, layer) => {
        layer.bindTooltip('任务范围', { sticky: true, className: 'task-range-label', pane: 'task-range-pane' })
      },
    })
    taskRangeLayer.addTo(map)
    taskRangeBounds = taskRangeLayer.getBounds()
  }

  // 图斑的历史几何里可能存在不完整的 MultiPolygon。逐条容错加入，不能让一条坏图斑
  // 阻断任务范围面的渲染与定位。
  geoJsonLayer = L.geoJSON({ type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection, {
    pane: 'abnormal-geometry-pane',
    // 异常图斑统一采用红色，与任务范围的青色虚线明确区分。
    style: { color: '#ff4656', weight: 2, opacity: .95, fillColor: '#ff4656', fillOpacity: .2, dashArray: '4 5' },
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
      pane: 'abnormal-geometry-pane',
      radius: 6,
      color: '#fff1f2',
      weight: 2,
      fillColor: '#ff4656',
      fillOpacity: .95,
    }),
  })
  abnormalGeometryFeatures.forEach((feature) => {
    try {
      geoJsonLayer?.addData(feature as GeoJSON.Feature)
    } catch {
      // 该异常图斑仍会通过下方列表及点位显示，不影响任务范围。
    }
  })
  geoJsonLayer.addTo(map)

}

function renderRange() {
  if (props.geoJson) renderGeoJson()
  else renderPolygon()
  renderAbnormalPoints(true)
  scheduleAutoFit()
}

/** 仅在初次加载或异常数据变更时适配全量范围；选中单条时不可重置视野。 */
function renderAbnormalPoints(fitAll = false) {
  if (!map) return
  ensureMapPanes()
  abnormalLayer?.remove()
  if (!props.showAbnormal) return
  abnormalLayer = L.featureGroup().addTo(map)
  props.abnormalPoints.forEach((item) => {
    const active = item.id === props.activeAbnormalId
    const color = '#ff4656'
    let renderedBoundary = false
    if (item.boundaryGeoJson?.features.length) {
      try {
        const boundaryLayer = L.geoJSON(item.boundaryGeoJson as GeoJSON.FeatureCollection, {
          pane: 'abnormal-geometry-pane',
          style: { color: active ? '#ffffff' : color, weight: active ? 3 : 2, opacity: 1, fillColor: color, fillOpacity: props.abnormalFillOpacity, dashArray: '4 5' },
          pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
            pane: 'abnormal-geometry-pane',
            radius: active ? 10 : 7,
            color: active ? '#ffffff' : color,
            weight: active ? 3 : 2,
            fillColor: color,
            fillOpacity: .95,
          }),
          onEachFeature: (_feature, layer) => {
            layer.bindTooltip(`${item.abnormalTypeDesc} · ${item.title}`, { sticky: true })
            layer.on('dblclick', (event) => {
              L.DomEvent.stopPropagation(event.originalEvent)
              focusAbnormal(item)
            })
          },
        })
        if (boundaryLayer.getBounds().isValid()) {
          boundaryLayer.addTo(abnormalLayer!)
          renderedBoundary = true
        }
      } catch {
        // 边界无法解析时降级为中心点，确保旧数据仍可见。
      }
    }
    if (!renderedBoundary && item.longitude !== undefined && item.latitude !== undefined) {
      const marker = L.circleMarker([item.latitude, item.longitude], {
        pane: 'abnormal-geometry-pane',
        radius: active ? 10 : 7,
        color: active ? '#ffffff' : color,
        weight: active ? 3 : 2,
        fillColor: color,
        fillOpacity: .95,
      }).bindTooltip(`${item.abnormalTypeDesc} · ${item.title}`, { direction: 'top', offset: [0, -8] })
      marker.on('dblclick', (event) => {
        L.DomEvent.stopPropagation(event.originalEvent)
        focusAbnormal(item)
      })
      marker.addTo(abnormalLayer!)
    }
    if (active) focusAbnormal(item)
  })
  if (fitAll && props.fitAbnormalPoints) scheduleAutoFit()
}

function hasMatchingAbnormalId(feature: TaskGeometryFeatureCollection['features'][number], abnormalId: string) {
  const properties = feature.properties || {}
  const candidates = [
    properties.abnormalId,
    properties.abnormal_id,
    properties.abnormalID,
    properties.id,
    (feature as { id?: unknown }).id,
  ]
  return candidates.some((value) => value !== undefined && String(value) === abnormalId)
}

/** 点击异常列表后，优先依据后端返回的图斑几何边界定位；仅有中心点时则放大至该点。 */
function focusAbnormal(item: TaskAbnormal) {
  if (!map) return
  if (item.boundaryGeoJson?.features.length) {
    try {
      const bounds = L.geoJSON(item.boundaryGeoJson as GeoJSON.FeatureCollection).getBounds()
      if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
        map.fitBounds(bounds, { padding: [55, 55], animate: true })
        return
      }
    } catch {
      // 格式异常时继续尝试任务范围接口里的关联几何或中心点。
    }
  }
  const feature = props.geoJson?.features.find((candidate) => hasMatchingAbnormalId(candidate, item.id))
  if (feature?.geometry) {
    try {
      const bounds = L.geoJSON(feature as GeoJSON.Feature).getBounds()
      if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
        map.fitBounds(bounds, { padding: [55, 55], animate: true })
        return
      }
    } catch {
      // 某些历史 MultiPolygon 坐标不完整，降级为按中心点定位。
    }
  }
  if (item.longitude !== undefined && item.latitude !== undefined) {
    map.setView([item.latitude, item.longitude], Math.max(map.getZoom(), 16), { animate: true })
  }
}

function clearRange() {
  polygon?.remove()
  polygon = undefined
  vertexLayer?.remove()
  vertexLayer = undefined
  clearPreview()
  drawingFinished.value = false
  emit('update:coordinates', [])
}

onMounted(async () => {
  if (!container.value || !token) {
    error.value = '天地图配置不可用'
    return
  }
  await nextTick()
  map = L.map(container.value, { center: [32.455, 119.923], zoom: 10, maxZoom: 22, zoomControl: false, attributionControl: false })
  // 地图本身不限制放大级别；18 级以上复用最高级底图瓦片进行放大。
  const base = L.tileLayer(tileUrl('img'), { subdomains, maxNativeZoom: 18, maxZoom: 22 }).addTo(map)
  const labelsPane = map.createPane('labels')
  labelsPane.style.zIndex = '450'
  labelsPane.style.pointerEvents = 'none'
  L.tileLayer(tileUrl('cia'), { subdomains, maxNativeZoom: 18, maxZoom: 22, pane: 'labels' }).addTo(map)
  renderDomImagery()
  base.once('tileerror', () => { error.value = '天地图加载失败' })
  // move / zoom 会在拖拽、滚轮缩放过程中持续触发，两个窗口无需等鼠标松开便能同步。
  map.on('move zoom', emitMapView)
  if (props.initialDrawingComplete && props.coordinates.length >= 3) drawingFinished.value = true
  renderRange()
  applyExternalView(props.view)
  resizeObserver = new ResizeObserver(() => {
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
    resizeFrame = window.requestAnimationFrame(() => map?.invalidateSize({ pan: false }))
  })
  resizeObserver.observe(container.value)
  if (props.editable) {
    map.on('click', (event) => {
      if (drawingFinished.value) return
      const points = [...props.coordinates, [event.latlng.lng, event.latlng.lat] as [number, number]]
      emit('update:coordinates', points)
      renderPolygon(points)
      renderPreview(event.latlng)
    })
    map.on('mousemove', (event) => renderPreview(event.latlng))
    map.on('contextmenu', (event) => {
      event.originalEvent.preventDefault()
      if (props.coordinates.length < 3) return
      drawingFinished.value = true
      clearPreview()
      renderPolygon()
    })
  }
})

onBeforeUnmount(() => {
  clearPreview()
  if (autoFitFrame !== undefined) window.cancelAnimationFrame(autoFitFrame)
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  window.clearTimeout(releaseExternalViewTimer)
  domImageryLayer?.remove()
  map?.remove()
})

watch(() => props.coordinates, () => {
  if (!props.geoJson) {
    // initialDrawingComplete 仅用于组件首次载入既有范围。清空后重新绘制时，
    // 即使已落下三个顶点也必须继续处于绘制状态，直至用户右键完成。
    if (!props.coordinates.length) drawingFinished.value = false
    renderPolygon()
  }
}, { deep: true })
watch(() => props.geoJson, renderRange, { deep: true })
watch(() => props.overlayGeoJson, renderRange, { deep: true })
watch(() => props.abnormalPoints, () => renderAbnormalPoints(true), { deep: true })
watch(() => props.activeAbnormalId, () => renderAbnormalPoints())
watch(() => props.fitRequest, () => scheduleFitOnce())
watch(() => props.showDomImagery, renderDomImagery)
watch(() => props.view, applyExternalView, { deep: true })
</script>

<template>
  <div class="task-range-map" :class="{ 'task-range-map--drawing': isDrawing }">
    <div ref="container" class="task-range-map__canvas"></div>
    <div v-if="error" class="map-error">{{ error }}</div>
    <div v-if="editable" class="draw-tip">ⓘ {{ isDrawing ? '点击地图依次绘制作业范围，至少选择3个点，单击鼠标右键完成绘制' : '拖动顶点调整范围，右键顶点可删除；清空后可重新绘制' }}</div>
    <div class="range-tools">
      <button v-if="editable" @click="clearRange">♲ 清空</button>
      <button @click="map?.zoomIn()">＋</button><button @click="map?.zoomOut()">－</button>
    </div>
    <div v-if="geoJson && !geoJson.features.length" class="map-empty">暂无任务范围数据</div>
    <div v-else-if="geoJson && !hasAreaGeometry" class="map-empty map-empty--notice">后端当前仅返回图斑点位，尚未提供任务范围面</div>
    <div v-if="!geoJson" class="range-area">所选区域面积<br><b>约 {{ Math.round(polygonAreaSquareMeters(coordinates)).toLocaleString() }} 平方米</b></div>
  </div>
</template>

<style scoped lang="scss">
.task-range-map { position: relative; width: 100%; height: 100%; min-height: 220px; overflow: hidden; background: #031a31; }.task-range-map__canvas { position: absolute; inset: 0; }.task-range-map--drawing :deep(.leaflet-container) { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 30 30'%3E%3Cpath fill='%2337dff3' stroke='%23042b44' stroke-width='2' d='m5 22 3-7L20 3l7 7L15 22l-7 3z'/%3E%3Cpath fill='%23fff' d='m18 5 7 7-2 2-7-7z'/%3E%3C/svg%3E") 4 26, crosshair; }
.draw-tip { position: absolute; z-index: 500; top: 10px; left: 50%; transform: translateX(-50%); padding: 7px 12px; color: #bceeff; background: #05253ee8; border: 1px solid #186e94; font-size: 15px; white-space: nowrap; }
.range-tools { position: absolute; z-index: 500; right: 10px; top: 45px; display: grid; gap: 5px; }.range-tools button { padding: 7px 10px; color: #b7eafa; background: #05213be8; border: 1px solid #17729b; font-size: 14px; cursor: pointer; }.range-tools button:hover { background: #0877a5; }
.range-area { position: absolute; z-index: 500; left: 10px; bottom: 10px; padding: 8px 11px; color: #85b1c2; background: #031b31e8; border: 1px solid #155c7d; font-size: 14px; }.range-area b { color: #8cecff; font-size: 16px; }
.map-empty { position: absolute; z-index: 500; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 10px 14px; color: #8bb8c8; background: #031b31e8; border: 1px solid #155c7d; font-size: 14px; }.map-empty--notice { top: 14px; transform: translateX(-50%); color: #b8eaf7; border-color: #2784a8; }
.map-error { position: absolute; z-index: 700; inset: 0; display: grid; place-items: center; color: #ff8c95; background: #04182eea; }
:deep(.task-range-label) { color: #dffcff; background: #043657e8; border: 1px solid #36e5f4; border-radius: 2px; box-shadow: 0 0 10px #19cde666; font: 13px "Microsoft YaHei"; }
:deep(.task-range-vertex) { width: 12px!important; height: 12px!important; box-sizing: border-box; background: #dffcff; border: 2px solid #087db3; border-radius: 50%; box-shadow: 0 0 0 2px #031b31, 0 0 8px #18d8ee; cursor: move!important; }
</style>
