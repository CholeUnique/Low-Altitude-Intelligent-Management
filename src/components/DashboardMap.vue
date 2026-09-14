<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import 'leaflet/dist/leaflet.css'
import taizhouCityBoundary from '@/assets/geo/taizhou-city.json'
import taizhouDistrictBoundaries from '@/assets/geo/taizhou-districts.json'
import type { DashboardMapLayer, DashboardMapTask, DronePatrolRoute } from '@/types'

const props = defineProps<{
  layers: DashboardMapLayer[]
  routes: DronePatrolRoute[]
}>()

const TAIZHOU_CENTER: L.LatLngTuple = [32.4555, 119.9255]
const TAIZHOU_ZOOM = 10
const token = import.meta.env.VITE_TIANDITU_TOKEN
const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']
const fillOnlySceneIds = new Set(['land-reclamation', 'land-supply-inspection', 'existing-illegal-land-rectification', 'new-illegal-land-warning', 'forestry-enforcement'])
const container = ref<HTMLElement>()
const mapReady = ref(false)
const mapError = ref('')
const mapMode = ref<'vector' | 'image'>('image')
const visibleLayerIds = ref<string[]>(props.layers.map((layer) => layer.id))
const routesVisible = ref(true)
const searchKeyword = ref('')
const toolMessage = ref('')
const measureOpen = ref(false)
const baseMapOpen = ref(false)
const activeTool = ref<'distance' | 'area' | 'marker' | null>(null)
const measureResult = ref('')
const scaleWidth = ref(96)
const scaleLabel = ref('5 km')
const searchResults = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return []
  return props.layers.flatMap((layer) => layer.tasks.map((task) => ({ ...task, layerName: layer.name })))
    .filter((task) => `${task.name}${task.taskId}${task.area}`.toLowerCase().includes(keyword))
    .slice(0, 6)
})

let map: L.Map | undefined
let baseLayer: L.TileLayer | undefined
let labelLayer: L.TileLayer | undefined
let routeGroup: L.LayerGroup | undefined
let measureGroup: L.LayerGroup | undefined
let annotationGroup: L.LayerGroup | undefined
let locationGroup: L.LayerGroup | undefined
let administrativeBoundaryGroup: L.LayerGroup | undefined
const sceneGroups = new Map<string, L.LayerGroup>()
const taskTargets = new Map<string, { marker: L.Marker; polygon: L.Polygon }>()
let measurePoints: L.LatLng[] = []

function tileUrl(layer: 'vec' | 'img' | 'cva' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function addBaseLayers(mode: 'vector' | 'image') {
  if (!map || !token) return
  baseLayer?.remove()
  labelLayer?.remove()
  const base = mode === 'vector' ? 'vec' : 'img'
  const label = mode === 'vector' ? 'cva' : 'cia'
  let loadedTiles = 0
  baseLayer = L.tileLayer(tileUrl(base), { subdomains, maxZoom: 18 })
  labelLayer = L.tileLayer(tileUrl(label), { subdomains, maxZoom: 18, pane: 'labels' })
  baseLayer.on('tileload', () => {
    loadedTiles += 1
    if (loadedTiles === 1) {
      mapReady.value = true
      mapError.value = ''
    }
  })
  baseLayer.on('tileerror', () => {
    if (!loadedTiles) mapError.value = '天地图加载失败，请检查网络或 Token 域名白名单'
  })
  baseLayer.addTo(map)
  labelLayer.addTo(map)
}

function taskIcon(color: string, status: string) {
  return L.divIcon({
    className: 'business-task-marker',
    html: `<span style="--marker-color:${color}">${status === '已完成' ? '✓' : '◆'}</span>`,
    iconSize: [25, 25],
    iconAnchor: [12, 12],
  })
}

function droneIcon(route: DronePatrolRoute) {
  return L.divIcon({
    className: 'business-drone-marker',
    html: `<span>✦</span><b>${route.droneId}</b>`,
    iconSize: [70, 26],
    iconAnchor: [13, 13],
  })
}

function taskPopup(task: DashboardMapTask, layerName: string) {
  return `<div class="business-popup"><strong>${task.name}</strong><span>${layerName} · ${task.status}</span><span>任务区域：${task.area}</span><small>${task.taskId}</small></div>`
}

function renderBusinessLayers() {
  if (!map) return
  sceneGroups.forEach((group) => group.remove())
  sceneGroups.clear()
  taskTargets.clear()
  props.layers.forEach((layer) => {
    const group = L.layerGroup()
    layer.tasks.forEach((task) => {
      const fillOnly = fillOnlySceneIds.has(layer.id)
      const polygon = L.polygon(task.polygon.map((point) => [point[1], point[0]] as L.LatLngTuple), {
        color: layer.color,
        stroke: !fillOnly,
        weight: 2,
        fillColor: layer.color,
        fillOpacity: fillOnly ? .75 : .16,
        dashArray: task.status === '已完成' ? undefined : '7 5',
      }).bindPopup(taskPopup(task, layer.name))
      const marker = L.marker([task.center[1], task.center[0]], { icon: taskIcon(layer.color, task.status) })
        .bindTooltip(task.name, { direction: 'right', className: 'business-task-label', offset: [9, 0] })
        .bindPopup(taskPopup(task, layer.name))
      polygon.addTo(group)
      marker.addTo(group)
      taskTargets.set(task.taskId, { marker, polygon })
    })
    sceneGroups.set(layer.id, group)
    if (visibleLayerIds.value.includes(layer.id)) group.addTo(map!)
  })
}

function renderRoutes() {
  if (!map) return
  routeGroup?.remove()
  routeGroup = L.layerGroup()
  props.routes.forEach((route) => {
    const points = route.coordinates.map((point) => [point[1], point[0]] as L.LatLngTuple)
    if (!points.length) return
    L.polyline(points, { color: '#ff4d5b', weight: 3, opacity: .95, dashArray: '8 6' })
      .bindPopup(`<strong>${route.name}</strong><br>${route.droneId} · ${route.status}<br>完成 ${route.progress}%`)
      .addTo(routeGroup!)
    const positionIndex = Math.min(Math.floor(points.length * route.progress / 100), points.length - 1)
    L.marker(points[positionIndex]!, { icon: droneIcon(route), zIndexOffset: 500 }).addTo(routeGroup!)
  })
  if (routesVisible.value) routeGroup.addTo(map)
}

function toggleSceneLayer(layerId: string) {
  const visible = visibleLayerIds.value.includes(layerId)
  visibleLayerIds.value = visible
    ? visibleLayerIds.value.filter((id) => id !== layerId)
    : [...visibleLayerIds.value, layerId]
  const group = sceneGroups.get(layerId)
  if (!map || !group) return
  if (visible) group.remove()
  else group.addTo(map)
}

function setAllLayers(visible: boolean) {
  visibleLayerIds.value = visible ? props.layers.map((layer) => layer.id) : []
  sceneGroups.forEach((group) => {
    if (!map) return
    if (visible) group.addTo(map)
    else group.remove()
  })
}

function toggleRoutes() {
  routesVisible.value = !routesVisible.value
  if (!map || !routeGroup) return
  if (routesVisible.value) routeGroup.addTo(map)
  else routeGroup.remove()
}

function selectSearchResult(task: DashboardMapTask) {
  const target = taskTargets.get(task.taskId)
  if (!map || !target) return
  if (!map.hasLayer(target.marker)) {
    const layer = props.layers.find((item) => item.tasks.some((entry) => entry.taskId === task.taskId))
    if (layer && !visibleLayerIds.value.includes(layer.id)) toggleSceneLayer(layer.id)
  }
  map.fitBounds(target.polygon.getBounds(), { padding: [70, 70], maxZoom: 14 })
  window.setTimeout(() => target.marker.openPopup(), 350)
  searchKeyword.value = ''
}

function locateUser() {
  if (!map) return
  if (!navigator.geolocation) {
    toolMessage.value = '当前浏览器不支持定位'
    return
  }
  toolMessage.value = '正在获取当前位置…'
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locationGroup?.clearLayers()
      const point = L.latLng(coords.latitude, coords.longitude)
      L.circle(point, { radius: Math.max(coords.accuracy, 20), color: '#33d9ff', fillOpacity: .12 }).addTo(locationGroup!)
      L.circleMarker(point, { radius: 7, color: '#fff', fillColor: '#17bce0', fillOpacity: 1, weight: 2 })
        .bindPopup(`当前位置<br>定位精度约 ${Math.round(coords.accuracy)} 米`).addTo(locationGroup!).openPopup()
      map?.setView(point, 15)
      toolMessage.value = '定位成功'
    },
    () => { toolMessage.value = '定位失败，请允许浏览器访问位置' },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}

function resetNorth() {
  map?.setView(TAIZHOU_CENTER, TAIZHOU_ZOOM)
  toolMessage.value = '已回到江苏泰州，地图保持正北向上'
}

function startTool(tool: 'distance' | 'area' | 'marker') {
  activeTool.value = activeTool.value === tool ? null : tool
  measureOpen.value = tool !== 'marker'
  baseMapOpen.value = false
  measurePoints = []
  if (tool !== 'marker') measureGroup?.clearLayers()
  measureResult.value = tool === 'distance' ? '点击地图连续选取测距点，双击结束' : tool === 'area' ? '点击地图绘制范围，双击结束' : '点击地图添加可拖动标注'
}

function geodesicArea(points: L.LatLng[]) {
  const radius = 6378137
  let area = 0
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]!
    area += (next.lng - point.lng) * Math.PI / 180 * (2 + Math.sin(point.lat * Math.PI / 180) + Math.sin(next.lat * Math.PI / 180))
  })
  return Math.abs(area * radius * radius / 2)
}

function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} 公里` : `${metres.toFixed(1)} 米`
}

function formatArea(squareMetres: number) {
  return squareMetres >= 1_000_000 ? `${(squareMetres / 1_000_000).toFixed(2)} 平方公里` : `${squareMetres.toFixed(0)} 平方米`
}

function redrawMeasurement() {
  if (!map || !measureGroup) return
  measureGroup.clearLayers()
  measurePoints.forEach((point, index) => {
    L.circleMarker(point, { radius: 4, color: '#fff', fillColor: '#21dff1', fillOpacity: 1, weight: 1 })
      .bindTooltip(String(index + 1), { permanent: true, className: 'measure-index', direction: 'top' }).addTo(measureGroup!)
  })
  if (activeTool.value === 'distance' && measurePoints.length > 1) {
    L.polyline(measurePoints, { color: '#22e5f4', weight: 3 }).addTo(measureGroup)
    const distance = measurePoints.slice(1).reduce((sum, point, index) => sum + map!.distance(measurePoints[index]!, point), 0)
    measureResult.value = `测量距离：${formatDistance(distance)}`
  }
  if (activeTool.value === 'area' && measurePoints.length > 2) {
    L.polygon(measurePoints, { color: '#38e7c0', fillColor: '#1abf9b', fillOpacity: .22, weight: 2 }).addTo(measureGroup)
    measureResult.value = `测量面积：${formatArea(geodesicArea(measurePoints))}`
  }
}

function addAnnotation(point: L.LatLng) {
  const icon = L.divIcon({ className: 'custom-annotation', html: '<span>⌖</span>', iconSize: [27, 27], iconAnchor: [13, 26] })
  L.marker(point, { icon, draggable: true })
    .bindPopup(`地图标注<br>${point.lng.toFixed(6)}, ${point.lat.toFixed(6)}`)
    .addTo(annotationGroup!).openPopup()
}

function clearMeasurements() {
  measurePoints = []
  measureGroup?.clearLayers()
  activeTool.value = null
  measureResult.value = ''
}

function clearAnnotations() {
  annotationGroup?.clearLayers()
  if (activeTool.value === 'marker') activeTool.value = null
  toolMessage.value = '已清除全部标注'
}

function switchMode(mode: 'vector' | 'image') {
  mapMode.value = mode
  addBaseLayers(mode)
  baseMapOpen.value = false
}

function renderAdministrativeBoundaries() {
  if (!map) return
  administrativeBoundaryGroup?.remove()
  administrativeBoundaryGroup = L.layerGroup()
  L.geoJSON(taizhouDistrictBoundaries as GeoJsonObject, {
    pane: 'administrative-boundaries',
    style: {
      color: '#2bd8ff',
      weight: 2.5,
      opacity: 1,
      fillColor: '#66c7ff',
      fillOpacity: .25,
    },
  }).addTo(administrativeBoundaryGroup)
  L.geoJSON(taizhouCityBoundary as GeoJsonObject, {
    pane: 'administrative-boundaries',
    style: {
      color: '#2bd8ff',
      weight: 2.5,
      opacity: 1,
      fillOpacity: 0,
      className: 'taizhou-city-boundary',
    },
  }).addTo(administrativeBoundaryGroup)
  administrativeBoundaryGroup.addTo(map)
}

function updateScale() {
  if (!map) return
  const referenceWidth = 110
  const centerY = map.getSize().y / 2
  const left = map.containerPointToLatLng([0, centerY])
  const right = map.containerPointToLatLng([referenceWidth, centerY])
  const metres = map.distance(left, right)
  const magnitude = 10 ** Math.floor(Math.log10(metres))
  const niceDistance = [1, 2, 5].reduce((best, factor) => {
    const candidate = factor * magnitude
    return candidate <= metres && candidate > best ? candidate : best
  }, magnitude / 10)
  scaleWidth.value = Math.max(34, Math.round(referenceWidth * niceDistance / metres))
  scaleLabel.value = niceDistance >= 1000 ? `${niceDistance / 1000} km` : `${niceDistance} m`
}

async function initMap() {
  if (!container.value) return
  if (!token) {
    mapError.value = '未配置天地图 Token'
    return
  }
  try {
    await nextTick()
    map = L.map(container.value, {
      center: TAIZHOU_CENTER,
      zoom: TAIZHOU_ZOOM,
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
      preferCanvas: true,
    })
    const labelsPane = map.createPane('labels')
    labelsPane.style.zIndex = '250'
    labelsPane.style.pointerEvents = 'none'
    const boundariesPane = map.createPane('administrative-boundaries')
    boundariesPane.style.zIndex = '350'
    boundariesPane.style.pointerEvents = 'none'
    measureGroup = L.layerGroup().addTo(map)
    annotationGroup = L.layerGroup().addTo(map)
    locationGroup = L.layerGroup().addTo(map)
    addBaseLayers('image')
    renderAdministrativeBoundaries()
    renderBusinessLayers()
    renderRoutes()
    updateScale()
    map.on('moveend zoomend resize', updateScale)
    map.on('click', (event) => {
      if (activeTool.value === 'marker') addAnnotation(event.latlng)
      if (activeTool.value === 'distance' || activeTool.value === 'area') {
        measurePoints.push(event.latlng)
        redrawMeasurement()
      }
    })
    map.on('dblclick', () => { activeTool.value = null })
    window.setTimeout(() => map?.invalidateSize(), 100)
  } catch {
    mapError.value = '地图初始化失败，请重新加载'
  }
}

function retryMap() {
  map?.remove()
  map = undefined
  mapError.value = ''
  initMap()
}

onMounted(initMap)
onBeforeUnmount(() => map?.remove())
</script>

<template>
  <div class="dashboard-map">
    <div ref="container" class="dashboard-map__canvas"></div>
    <div v-if="mapError" class="dashboard-map__empty"><span>{{ mapError }}</span><button @click="retryMap">重新加载</button></div>
    <div v-else-if="!mapReady" class="dashboard-map__loading">正在加载江苏泰州天地图…</div>

    <aside class="layer-manager">
      <div class="tool-title"><b>图层管理</b><span><button @click="setAllLayers(true)">显示</button></span></div>
      <button v-for="layer in layers" :key="layer.id" class="layer-row" :class="{ active: visibleLayerIds.includes(layer.id) }" @click="toggleSceneLayer(layer.id)">
        <i :style="{ background: layer.color }"></i><span><b>{{ layer.name }}</b></span><em>{{ visibleLayerIds.includes(layer.id) ? '●' : '○' }}</em>
      </button>
      <button class="layer-row" :class="{ active: routesVisible }" @click="toggleRoutes">
        <i class="route-symbol"></i><span><b>无人机航线</b></span><em>{{ routesVisible ? '●' : '○' }}</em>
      </button>
    </aside>

    <div class="map-search">
      <span>⌕</span><input v-model="searchKeyword" placeholder="搜索任务名称、编号、区域…" />
      <div v-if="searchResults.length" class="search-results">
        <button v-for="task in searchResults" :key="task.taskId" @click="selectSearchResult(task)"><b>{{ task.name }}</b><small>{{ task.layerName }} · {{ task.area }}</small></button>
      </div>
    </div>

    <aside class="map-tools">
      <div class="map-mode-switch" aria-label="底图选择">
        <button :class="{ active: mapMode === 'image' }" title="切换卫星影像" @click="switchMode('image')"><i class="mode-indicator"></i><span>卫星地图</span></button>
        <button :class="{ active: mapMode === 'vector' }" title="切换电子地图" @click="switchMode('vector')"><i class="mode-indicator"></i><span>电子地图</span></button>
      </div>
      <button title="当前位置" @click="locateUser"><i>⌖</i><span>定位</span></button>
      <button title="回到泰州并保持正北" @click="resetNorth"><i class="compass">N</i><span>指南针</span></button>
      <button :class="{ active: measureOpen }" title="测量工具" @click="measureOpen = !measureOpen"><i>╱</i><span>测量</span></button>
      <div v-if="measureOpen" class="tool-submenu right-submenu">
        <button :class="{ active: activeTool === 'distance' }" @click="startTool('distance')">距离测量</button>
        <button :class="{ active: activeTool === 'area' }" @click="startTool('area')">面积测量</button>
        <button @click="clearMeasurements">清除测量</button>
      </div>
      <button :class="{ active: activeTool === 'marker' }" title="添加标注" @click="startTool('marker')"><i>⚑</i><span>标注</span></button>
      <button title="清除标注" @click="clearAnnotations"><i>×</i><span>清除</span></button>
      <button @click="map?.zoomIn()"><i>＋</i><span>放大</span></button>
      <button @click="map?.zoomOut()"><i>－</i><span>缩小</span></button>
    </aside>

    <div v-if="measureResult" class="measure-result">{{ measureResult }}</div>
    <div v-if="toolMessage" class="tool-message" @click="toolMessage = ''">{{ toolMessage }}　×</div>
    <div class="map-scale" :style="{ width: `${scaleWidth}px` }" :aria-label="`比例尺 ${scaleLabel}`"><b>{{ scaleLabel }}</b><i></i></div>
  </div>
</template>

<style scoped lang="scss">
.dashboard-map { position: relative; width: 100%; height: 100%; overflow: hidden; background: #031a31; }.dashboard-map__canvas { position: absolute; inset: 0; }
.dashboard-map__empty,.dashboard-map__loading { position: absolute; z-index: 700; inset: 0; display: grid; place-content: center; gap: 12px; justify-items: center; color: #56ddef; background: #031a31e8; font-size: 15px; }.dashboard-map__empty button { padding: 6px 14px; color: #d8faff; background: #075477; border: 1px solid #24cbe3; cursor: pointer; }
.layer-manager { position: absolute; z-index: 500; top: 10px; left: 10px; width: 198px; max-height: calc(100% - 20px); overflow-y: auto; color: #bde6ef; background: #03182eed; border: 1px solid #0b6189; box-shadow: 0 0 14px #00a7d52b; }.tool-title { min-height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: #06476b; border-bottom: 1px solid #0d6388; font-size: 15px; }.tool-title button { padding: 2px 4px; color: #7bdcea; background: transparent; border: 0; font-size: 12px; cursor: pointer; }
.layer-row { width: 100%; display: grid; grid-template-columns: 8px 1fr auto; align-items: center; gap: 7px; padding: 7px 8px; color: #6f99aa; background: transparent; border: 0; border-bottom: 1px solid #0a3e59; text-align: left; cursor: pointer; }.layer-row:hover,.layer-row.active { color: #d6f8ff; background: #07567866; }.layer-row>i { width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }.layer-row span,.layer-row b,.layer-row small { min-width: 0; display: block; }.layer-row b { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }.layer-row small { margin-top: 3px; color: #52798a; font-size: 11px; }.layer-row em { color: #39ddef; font-size: 14px; font-style: normal; }.layer-section-title { padding: 5px 8px; color: #6591a3; background: #04243d; font-size: 12px; }.route-symbol { width: 12px!important; height: 2px!important; border-radius: 0!important; background: repeating-linear-gradient(90deg,#ff4d5b 0 3px,transparent 3px 5px)!important; }
.map-search { position: absolute; z-index: 550; top: 10px; right: 70px; width: 270px; min-height: 31px; display: flex; align-items: center; gap: 7px; padding: 0 9px; color: #55dff3; background: #031a31ef; border: 1px solid #11618a; box-shadow: 0 0 10px #00a9de1f; }.map-search input { min-width: 0; height: 29px; flex: 1; border: 0; outline: 0; color: #c6edf7; background: transparent; font-size: 14px; }.search-results { position: absolute; left: -1px; right: -1px; top: 31px; background: #031a31f5; border: 1px solid #11618a; }.search-results button { width: 100%; padding: 7px 9px; color: #bfe8f1; background: transparent; border: 0; border-bottom: 1px solid #0b405c; text-align: left; cursor: pointer; }.search-results button:hover { background: #075479; }.search-results b,.search-results small { display: block; font-size: 14px; }.search-results small { margin-top: 3px; color: #5c8293; font-size: 11px; }
.map-tools { position: absolute; z-index: 600; right: 10px; top: 10px; width: 50px; display: grid; gap: 4px; }.map-tools>button { min-height: 40px; display: grid; place-items: center; gap: 2px; padding: 4px; color: #84b2c3; background: #031a30ed; border: 1px solid #155a7c; cursor: pointer; }.map-tools>button:hover,.map-tools>button.active { color: #fff; border-color: #24cbe3; background: #075477; }.map-tools i { font-size: 16px; font-style: normal; }.map-tools span { font-size: 11px; }.compass { width: 20px; height: 20px; display: grid; place-items: center; border: 1px solid #31d9e9; border-radius: 50%; color: #ff7180; font-size: 14px!important; }.tool-submenu { position: absolute; top: 88px; right: 55px; width: 82px; padding: 4px; background: #031a31f5; border: 1px solid #157298; }.tool-submenu button { width: 100%; padding: 7px; color: #88b7c7; background: transparent; border: 0; text-align: left; font-size: 12px; cursor: pointer; }.tool-submenu button:hover,.tool-submenu button.active { color: #fff; background: #08698e; }.base-submenu { top: 220px; }
.measure-result,.tool-message { position: absolute; z-index: 550; left: 50%; bottom: 12px; transform: translateX(-50%); padding: 7px 12px; color: #c8f8ff; background: #03223aef; border: 1px solid #18a2c1; font-size: 14px; box-shadow: 0 0 10px #12bbd544; }.tool-message { bottom: 46px; cursor: pointer; }.map-scale { position: absolute; z-index: 500; right: 68px; bottom: 7px; padding: 4px 8px; color: #77a9b9; background: #021728cc; font-size: 12px; }
:deep(.leaflet-tile-pane) { filter: brightness(.58) saturate(1.35) hue-rotate(155deg) contrast(1.13); }:deep(.business-task-marker),:deep(.business-drone-marker),:deep(.custom-annotation) { background: transparent; border: 0; }:deep(.business-task-marker span) { width: 23px; height: 23px; display: grid; place-items: center; color: white; background: color-mix(in srgb, var(--marker-color), #062239 35%); border: 2px solid var(--marker-color); border-radius: 50% 50% 50% 5px; transform: rotate(-45deg); box-shadow: 0 0 10px var(--marker-color); font-size: 14px; }:deep(.business-drone-marker) { display: flex; align-items: center; gap: 4px; color: #79eff9; }:deep(.business-drone-marker span) { width: 24px; height: 24px; display: grid; place-items: center; background: #087b9e; border: 1px solid #4defff; border-radius: 50%; box-shadow: 0 0 10px #22e5f4; }:deep(.business-drone-marker b) { padding: 2px 4px; background: #03233ddd; font-size: 12px; white-space: nowrap; }:deep(.business-task-label),:deep(.measure-index) { color: #c9f7ff; background: #03223ddd; border: 1px solid #17698e; box-shadow: none; border-radius: 2px; font: 11px "Microsoft YaHei"; }:deep(.leaflet-popup-content-wrapper),:deep(.leaflet-popup-tip) { color: #d9f8ff; background: #061d34; border: 1px solid #1685ad; border-radius: 2px; }:deep(.business-popup strong),:deep(.business-popup span),:deep(.business-popup small) { display: block; }:deep(.business-popup span) { margin-top: 5px; color: #8db5c3; font-size: 14px; }:deep(.business-popup small) { margin-top: 6px; color: #5d899b; }:deep(.custom-annotation span) { width: 25px; height: 25px; display: grid; place-items: center; color: #fff; background: #e86835; border: 2px solid #ffd7a8; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 0 8px #ff8a45; }

/* Compact, grouped controls keep the map surface visually open. */
.layer-manager { top: 44px; width: 126px; max-height: calc(100% - 52px); overflow: visible; border: 0; background: transparent; box-shadow: none; }
.tool-title,.layer-section-title { min-height: 26px; padding: 0 8px; color: #bff3ff; background: linear-gradient(90deg, #056ea7, #073f6d); border: 1px solid #1688bf; font-size: 12px; }
.tool-title { justify-content: space-between; }.tool-title button { padding: 1px 2px; color: #91e6ff; font-size: 10px; }
.layer-row { min-height: 27px; grid-template-columns: 7px 1fr auto; gap: 5px; padding: 4px 7px; border: 1px solid #0d5278; border-top: 0; background: #031c37e8; }.layer-row b { font-size: 12px; }.layer-row em { font-size: 10px; }.layer-row>i { width: 6px; height: 6px; }.layer-section-title { margin-top: 7px; }
.quick-tools { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #0d5278; border-top: 0; background: #031c37e8; }.quick-tools button { min-height: 33px; display: grid; grid-template-columns: 16px 1fr; align-items: center; gap: 3px; padding: 4px 6px; color: #9bcfe4; background: transparent; border: 0; border-right: 1px solid #0d5278; border-bottom: 1px solid #0d5278; font-size: 11px; cursor: pointer; }.quick-tools button:nth-child(2n) { border-right: 0; }.quick-tools button:last-child { grid-column: 1 / 3; }.quick-tools button:hover,.quick-tools button.active { color: white; background: #08698e; }.quick-tools i { color: #5ae1f4; font-size: 14px; font-style: normal; }
.layer-submenu { top: auto; right: auto; left: 132px; bottom: 0; width: 96px; }.tool-submenu { z-index: 650; }
.map-search { top: 10px; right: 10px; width: 260px; min-height: 34px; }.map-search input { height: 32px; font-size: 12px; }
.map-tools { top: 52px; right: 10px; width: 72px; gap: 4px; }.map-tools>button { min-height: 36px; grid-template-columns: 20px 1fr; justify-content: start; padding: 4px 6px; }.map-tools i { font-size: 14px; }.map-tools span { font-size: 11px; }.compass { width: 18px; height: 18px; font-size: 12px!important; }

/* The layer panel is the only left-side control; operational tools form one right-side rail. */
.layer-manager { top: 50%; width: 255px; height: 74%; max-height: none; display: flex; flex-direction: column; transform: translateY(-50%); overflow: hidden; border: 1px solid #1688bf; border-radius: 14px; background: #031c37b8; box-shadow: 0 0 18px #00a7d534; }.tool-title { min-height: 46px; padding: 0 15px; border: 0; border-bottom: 1px solid #1688bf; background: linear-gradient(90deg, #056ea7c9, #073f6dc9); font-size: 18px; }.tool-title button { font-size: 14px; }.layer-row { min-height: 0; flex: 1; grid-template-columns: 18px 1fr auto; gap: 10px; padding: 9px 16px; border: 0; border-bottom: 1px solid #0d5278; background: #031c37b8; }.layer-row:last-child { border-bottom: 0; }.layer-row b { font-size: 17px; }.layer-row em { width: 13px; height: 13px; display: block; border: 1.5px solid #75cbe9; border-radius: 50%; font-size: 0; transform: translateX(-8px); }.layer-row.active em { border-color: #c3f8ff; background: #49d9f4; box-shadow: 0 0 7px #27dfff; }.layer-row>i { width: 16px; height: 16px; border-radius: 1px; box-shadow: none; }
.map-search { width: 310px; min-height: 42px; padding: 0 12px; border-color: #188fc0; border-radius: 12px; background: #031a31b8; }.map-search span { order: 2; margin-left: 4px; font-size: 26px; line-height: 1; transform: scaleX(-1); }.map-search input { order: 1; height: 40px; font-size: 14px; }.search-results { top: 42px; overflow: hidden; border-radius: 0 0 12px 12px; }
.map-tools { top: 56px; right: 10px; bottom: 34px; width: 120px; display: flex; flex-direction: column; justify-content: center; gap: 4px; overflow: visible; border: 0; border-radius: 0; background: transparent; }.map-tools>button { min-height: 33px; flex: 0 0 33px; grid-template-columns: 22px 1fr; gap: 6px; padding: 4px 10px; border: 1px solid #155a7c; border-radius: 8px; background: #031a30b8; box-shadow: 0 0 8px #00a9de18; }.map-tools>button:last-of-type { border-bottom: 1px solid #155a7c; }.map-tools>button:hover,.map-tools>button.active { border-color: #24cbe3; background: #075477d0; }.map-tools i { font-size: 16px; }.map-tools span { font-size: 12px; white-space: nowrap; }.compass { width: 20px; height: 20px; font-size: 12px!important; }.right-submenu { top: 50%; right: 126px; width: 108px; transform: translateY(-50%); }.right-submenu button { font-size: 12px; }
.map-mode-switch { flex: 0 0 68px; display: grid; grid-template-rows: 1fr 1fr; overflow: hidden; border: 1px solid #155a7c; border-radius: 8px; background: #031a30b8; box-shadow: 0 0 8px #00a9de18; }.map-mode-switch button { display: grid; grid-template-columns: 22px 1fr; align-items: center; gap: 6px; padding: 3px 10px; color: #84b2c3; background: transparent; border: 0; cursor: pointer; }.map-mode-switch button+button { border-top: 1px solid #155a7c; }.map-mode-switch button:hover,.map-mode-switch button.active { color: #fff; background: #075477d0; }.map-mode-switch span { font-size: 12px; white-space: nowrap; }.mode-indicator { width: 13px; height: 13px; display: block; border: 1.5px solid #75cbe9; border-radius: 50%; }.map-mode-switch button.active .mode-indicator { border-color: #c3f8ff; background: #49d9f4; box-shadow: 0 0 7px #27dfff; }
.map-scale { right: 14px; bottom: 10px; width: 96px; height: 18px; padding: 0; color: #b9e7f4; background: transparent; font-size: 11px; text-align: center; }.map-scale b { position: relative; z-index: 1; display: block; font-size: 11px; font-weight: 600; line-height: 12px; }.map-scale i { position: absolute; right: 0; bottom: 0; left: 0; height: 7px; border-right: 2px solid #b9e7f4; border-bottom: 2px solid #b9e7f4; border-left: 2px solid #b9e7f4; }
:deep(.leaflet-administrative-boundaries-pane path) { filter: drop-shadow(0 0 4px #168fe2cc); }
</style>
