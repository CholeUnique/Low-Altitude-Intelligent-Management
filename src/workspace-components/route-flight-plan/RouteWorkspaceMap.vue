<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FlightRoute } from '@/mocks/route-planning'

const props = defineProps<{
  routes: FlightRoute[]
  activeRouteId: string
}>()

const TAIZHOU_CENTER: L.LatLngTuple = [32.4555, 119.9255]
const token = import.meta.env.VITE_TIANDITU_TOKEN
const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']
const container = ref<HTMLElement>()
const mapReady = ref(false)
const mapError = ref('')
const mapMode = ref<'vector' | 'image'>('image')
const searchKeyword = ref('')
const measureOpen = ref(false)
const baseMapOpen = ref(false)
const activeTool = ref<'distance' | 'area' | 'marker' | null>(null)
const measureResult = ref('')
const toolMessage = ref('')

let map: L.Map | undefined
let baseLayer: L.TileLayer | undefined
let labelLayer: L.TileLayer | undefined
let routeGroup: L.LayerGroup | undefined
let measureGroup: L.LayerGroup | undefined
let annotationGroup: L.LayerGroup | undefined
let locationGroup: L.LayerGroup | undefined
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
  let loaded = 0
  baseLayer = L.tileLayer(tileUrl(base), { subdomains, maxZoom: 18 })
  labelLayer = L.tileLayer(tileUrl(label), { subdomains, maxZoom: 18, pane: 'labels' })
  baseLayer.on('tileload', () => {
    loaded += 1
    if (loaded === 1) {
      mapReady.value = true
      mapError.value = ''
    }
  })
  baseLayer.on('tileerror', () => {
    if (!loaded) mapError.value = '天地图加载失败'
  })
  baseLayer.addTo(map)
  labelLayer.addTo(map)
}

function waypointIcon(index: number, active: boolean) {
  return L.divIcon({
    className: 'route-wp-marker',
    html: `<span class="${active ? 'active' : ''}">${index}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function renderRoutes() {
  if (!map || !routeGroup) return
  routeGroup.clearLayers()
  const keyword = searchKeyword.value.trim().toLowerCase()
  const filtered = props.routes.filter((route) =>
    !keyword || `${route.name}${route.id}${route.area}`.toLowerCase().includes(keyword),
  )
  filtered.forEach((route) => {
    const active = route.id === props.activeRouteId
    if (route.polygon.length > 2) {
      L.polygon(route.polygon.map((p) => [p[1], p[0]] as L.LatLngTuple), {
        color: active ? '#2ea7ff' : '#8aa0b0',
        weight: active ? 2 : 1,
        dashArray: '6 5',
        fillColor: active ? '#2ea7ff' : '#7f93a3',
        fillOpacity: active ? 0.18 : 0.08,
      }).addTo(routeGroup!)
    }
    const latlngs = route.waypoints.map((p) => [p[1], p[0]] as L.LatLngTuple)
    L.polyline(latlngs, {
      color: active ? '#1f8fff' : '#9aaeba',
      weight: active ? 4 : 2,
      opacity: active ? 1 : 0.55,
    }).bindPopup(`<b>${route.name}</b><br>${route.aircraft}<br>${route.status}`).addTo(routeGroup!)
    route.waypoints.forEach((point, index) => {
      L.marker([point[1], point[0]], { icon: waypointIcon(index + 1, active) }).addTo(routeGroup!)
    })
    if (active && latlngs[0]) {
      L.marker(latlngs[0], {
        icon: L.divIcon({
          className: 'home-marker',
          html: '<span>H</span>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).bindTooltip('起降点', { permanent: true, direction: 'right', offset: [10, 0], className: 'home-label' }).addTo(routeGroup!)
    }
  })
  const active = filtered.find((route) => route.id === props.activeRouteId) || filtered[0]
  if (active?.waypoints.length) {
    map.fitBounds(L.latLngBounds(active.waypoints.map((p) => [p[1], p[0]] as L.LatLngTuple)), {
      padding: [50, 50],
      maxZoom: 14,
    })
  }
}

function switchMode(mode: 'vector' | 'image') {
  mapMode.value = mode
  addBaseLayers(mode)
  baseMapOpen.value = false
}

function locateUser() {
  if (!map || !navigator.geolocation) {
    toolMessage.value = '定位不可用'
    return
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locationGroup?.clearLayers()
      const point = L.latLng(coords.latitude, coords.longitude)
      L.circleMarker(point, { radius: 7, color: '#fff', fillColor: '#17bce0', fillOpacity: 1, weight: 2 }).addTo(locationGroup!)
      map?.setView(point, 15)
      toolMessage.value = '定位成功'
    },
    () => { toolMessage.value = '定位失败' },
  )
}

function resetNorth() {
  map?.setView(TAIZHOU_CENTER, 11)
  toolMessage.value = '已回到泰州正北视角'
}

function geodesicArea(points: L.LatLng[]) {
  const radius = 6378137
  let area = 0
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]!
    area += ((next.lng - point.lng) * Math.PI) / 180 * (2 + Math.sin((point.lat * Math.PI) / 180) + Math.sin((next.lat * Math.PI) / 180))
  })
  return Math.abs((area * radius * radius) / 2)
}

function redrawMeasurement() {
  if (!measureGroup || !map) return
  measureGroup.clearLayers()
  measurePoints.forEach((point) => {
    L.circleMarker(point, { radius: 4, color: '#fff', fillColor: '#21dff1', fillOpacity: 1, weight: 1 }).addTo(measureGroup!)
  })
  if (activeTool.value === 'distance' && measurePoints.length > 1) {
    L.polyline(measurePoints, { color: '#22e5f4', weight: 3 }).addTo(measureGroup)
    const distance = measurePoints.slice(1).reduce((sum, point, index) => sum + map!.distance(measurePoints[index]!, point), 0)
    measureResult.value = distance >= 1000 ? `测量距离：${(distance / 1000).toFixed(2)} 公里` : `测量距离：${distance.toFixed(1)} 米`
  }
  if (activeTool.value === 'area' && measurePoints.length > 2) {
    L.polygon(measurePoints, { color: '#38e7c0', fillColor: '#1abf9b', fillOpacity: 0.22, weight: 2 }).addTo(measureGroup)
    const area = geodesicArea(measurePoints)
    measureResult.value = area >= 1_000_000 ? `测量面积：${(area / 1_000_000).toFixed(2)} 平方公里` : `测量面积：${area.toFixed(0)} 平方米`
  }
}

function startTool(tool: 'distance' | 'area' | 'marker') {
  activeTool.value = activeTool.value === tool ? null : tool
  measureOpen.value = tool !== 'marker'
  measurePoints = []
  measureGroup?.clearLayers()
  measureResult.value = tool === 'distance' ? '点击采点测距，双击结束' : tool === 'area' ? '点击采点测面，双击结束' : '点击地图添加标注'
}

function clearMeasurements() {
  measurePoints = []
  measureGroup?.clearLayers()
  activeTool.value = null
  measureResult.value = ''
}

function clearAnnotations() {
  annotationGroup?.clearLayers()
}

async function initMap() {
  if (!container.value) return
  if (!token) {
    mapError.value = '未配置天地图 Token'
    return
  }
  await nextTick()
  map = L.map(container.value, {
    center: TAIZHOU_CENTER,
    zoom: 11,
    zoomControl: false,
    attributionControl: false,
    doubleClickZoom: false,
    preferCanvas: true,
  })
  const labelsPane = map.createPane('labels')
  labelsPane.style.zIndex = '250'
  labelsPane.style.pointerEvents = 'none'
  routeGroup = L.layerGroup().addTo(map)
  measureGroup = L.layerGroup().addTo(map)
  annotationGroup = L.layerGroup().addTo(map)
  locationGroup = L.layerGroup().addTo(map)
  addBaseLayers('image')
  renderRoutes()
  map.on('click', (event) => {
    if (activeTool.value === 'marker') {
      L.marker(event.latlng, {
        draggable: true,
        icon: L.divIcon({ className: 'anno-marker', html: '<span>⚑</span>', iconSize: [24, 24], iconAnchor: [12, 24] }),
      }).bindPopup(`${event.latlng.lng.toFixed(6)}, ${event.latlng.lat.toFixed(6)}`).addTo(annotationGroup!)
    }
    if (activeTool.value === 'distance' || activeTool.value === 'area') {
      measurePoints.push(event.latlng)
      redrawMeasurement()
    }
  })
  map.on('dblclick', () => { activeTool.value = null })
  window.setTimeout(() => map?.invalidateSize(), 120)
}

watch(() => [props.routes, props.activeRouteId, searchKeyword.value], () => renderRoutes(), { deep: true })

onMounted(initMap)
onBeforeUnmount(() => map?.remove())
</script>

<template>
  <div class="route-map">
    <div ref="container" class="route-map__canvas"></div>
    <div v-if="mapError" class="map-state">{{ mapError }}</div>
    <div v-else-if="!mapReady" class="map-state">正在加载天地图…</div>

    <div class="map-search">
      <span>⌕</span>
      <input v-model="searchKeyword" placeholder="搜索航线名称、编号、区域…" />
    </div>

    <aside class="map-tools">
      <button @click="locateUser"><i>⌖</i><span>定位</span></button>
      <button @click="resetNorth"><i>N</i><span>指南针</span></button>
      <button :class="{ active: measureOpen }" @click="measureOpen = !measureOpen; baseMapOpen = false"><i>╱</i><span>测量</span></button>
      <div v-if="measureOpen" class="submenu">
        <button @click="startTool('distance')">距离测量</button>
        <button @click="startTool('area')">面积测量</button>
        <button @click="clearMeasurements">清除测量</button>
      </div>
      <button :class="{ active: activeTool === 'marker' }" @click="startTool('marker')"><i>⚑</i><span>标注</span></button>
      <button @click="clearAnnotations"><i>×</i><span>清标注</span></button>
      <button :class="{ active: baseMapOpen }" @click="baseMapOpen = !baseMapOpen; measureOpen = false"><i>▱</i><span>底图</span></button>
      <div v-if="baseMapOpen" class="submenu base">
        <button @click="switchMode('vector')">电子地图</button>
        <button @click="switchMode('image')">卫星影像</button>
      </div>
      <button @click="map?.zoomIn()"><i>＋</i><span>放大</span></button>
      <button @click="map?.zoomOut()"><i>－</i><span>缩小</span></button>
    </aside>

    <div class="legend">
      <b>航线图例</b>
      <span><i class="current"></i>当前航线</span>
      <span><i class="other"></i>其他航线</span>
      <span><i class="home"></i>起降点</span>
    </div>
    <div v-if="measureResult" class="measure-result">{{ measureResult }}</div>
    <div v-if="toolMessage" class="tool-message" @click="toolMessage = ''">{{ toolMessage }}</div>
  </div>
</template>

<style scoped lang="scss">
.route-map { position: relative; width: 100%; height: 100%; min-height: 320px; overflow: hidden; background: #0a1c2c; }
.route-map__canvas { position: absolute; inset: 0; }
.map-state { position: absolute; z-index: 700; inset: 0; display: grid; place-items: center; color: #7ed7ea; background: #031a31e8; }
.map-search {
  position: absolute; z-index: 500; top: 10px; right: 66px; width: 240px; height: 30px;
  display: flex; align-items: center; gap: 6px; padding: 0 8px; color: #7ed7ea;
  background: #031a31ef; border: 1px solid #1a6a8f;
}
.map-search input { flex: 1; border: 0; outline: 0; color: #d7f3fa; background: transparent; font-size: 15px; }
.map-tools { position: absolute; z-index: 550; top: 10px; right: 10px; width: 48px; display: grid; gap: 4px; }
.map-tools > button {
  min-height: 38px; display: grid; place-items: center; gap: 2px; color: #8eb8c8;
  background: #031a30ed; border: 1px solid #1a6286; cursor: pointer;
}
.map-tools > button.active, .map-tools > button:hover { color: #fff; background: #08618a; border-color: #2cc7e4; }
.map-tools i { font-style: normal; font-size: 16px; }
.map-tools span { font-size: 11px; }
.submenu {
  position: absolute; right: 52px; top: 84px; width: 86px; padding: 4px;
  background: #031a31f5; border: 1px solid #1a6f95;
}
.submenu.base { top: 210px; }
.submenu button {
  width: 100%; padding: 7px; border: 0; color: #8eb8c8; background: transparent; text-align: left; font-size: 14px; cursor: pointer;
}
.submenu button:hover { color: #fff; background: #08618a; }
.legend {
  position: absolute; z-index: 500; top: 10px; left: 176px; display: grid; gap: 4px;
  padding: 8px 10px; color: #c7e6ef; background: #031a31ef; border: 1px solid #1a6a8f; font-size: 14px;
}
.legend b { margin-bottom: 2px; }
.legend span { display: flex; align-items: center; gap: 6px; }
.legend i { width: 18px; height: 3px; display: inline-block; }
.legend .current { background: #1f8fff; }
.legend .other { background: #9aaeba; }
.legend .home { width: 10px; height: 10px; border-radius: 50%; background: #1fbf6a; }
.measure-result, .tool-message {
  position: absolute; z-index: 550; left: 50%; bottom: 10px; transform: translateX(-50%);
  padding: 6px 12px; color: #d8f7ff; background: #03223aef; border: 1px solid #18a2c1; font-size: 14px;
}
.tool-message { bottom: 42px; cursor: pointer; }
:deep(.leaflet-tile-pane) { filter: brightness(.72) saturate(1.15) contrast(1.05); }
:deep(.route-wp-marker), :deep(.home-marker), :deep(.anno-marker) { background: transparent; border: 0; }
:deep(.route-wp-marker span) {
  width: 20px; height: 20px; display: grid; place-items: center; color: #fff;
  background: #3d7ea0; border: 2px solid #fff; border-radius: 50%; font-size: 14px;
}
:deep(.route-wp-marker span.active) { background: #1f8fff; box-shadow: 0 0 8px #1f8fff; }
:deep(.home-marker span) {
  width: 22px; height: 22px; display: grid; place-items: center; color: #fff;
  background: #1fbf6a; border: 2px solid #fff; border-radius: 50%; font-size: 15px; font-weight: 700;
}
:deep(.home-label) { color: #dff8e8; background: #063a28dd; border: 1px solid #1fbf6a; font-size: 14px; }
:deep(.anno-marker span) {
  width: 22px; height: 22px; display: grid; place-items: center; color: #fff;
  background: #e86835; border: 2px solid #ffd7a8; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
}
</style>
