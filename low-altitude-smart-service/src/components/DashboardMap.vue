<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { dashboardMapPoints } from '@/mocks/data'

const container = ref<HTMLElement>()
const mapReady = ref(false)
const mapMode = ref<'vector' | 'image'>('vector')
const token = import.meta.env.VITE_TIANDITU_TOKEN
let map: L.Map | undefined
let baseLayer: L.TileLayer | undefined
let labelLayer: L.TileLayer | undefined

const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']

function tileUrl(layer: 'vec' | 'img' | 'cva' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function addBaseLayers(mode: 'vector' | 'image') {
  if (!map || !token) return
  baseLayer?.remove()
  labelLayer?.remove()
  const base = mode === 'vector' ? 'vec' : 'img'
  const label = mode === 'vector' ? 'cva' : 'cia'
  baseLayer = L.tileLayer(tileUrl(base), { subdomains, maxZoom: 18 })
  labelLayer = L.tileLayer(tileUrl(label), { subdomains, maxZoom: 18, pane: 'labels' })
  baseLayer.addTo(map)
  labelLayer.addTo(map)
}

function switchMode(mode: 'vector' | 'image') {
  mapMode.value = mode
  addBaseLayers(mode)
}

function markerIcon(type: string) {
  const symbols: Record<string, string> = { drone: '✦', alert: '!', task: '◆', center: '⌂' }
  return L.divIcon({
    className: `cockpit-map-marker marker-${type}`,
    html: `<span>${symbols[type] || '●'}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

async function initMap() {
  if (!container.value || !token) return
  await nextTick()
  map = L.map(container.value, {
    center: [26.0812, 119.3268],
    zoom: 12,
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
  })
  const labelsPane = map.createPane('labels')
  labelsPane.style.zIndex = '250'
  labelsPane.style.pointerEvents = 'none'
  addBaseLayers('vector')

  const route = dashboardMapPoints.map((point) => [point.coordinates[1], point.coordinates[0]] as L.LatLngTuple)
  L.polyline(route, { color: '#25d9ff', weight: 2, opacity: 0.9, dashArray: '8 9' }).addTo(map)
  L.polyline(route.slice().reverse(), { color: '#8d6cff', weight: 5, opacity: 0.18 }).addTo(map)

  dashboardMapPoints.forEach((point) => {
    const marker = L.marker([point.coordinates[1], point.coordinates[0]], { icon: markerIcon(point.type) }).addTo(map!)
    marker.bindTooltip(point.name, { permanent: true, direction: 'right', className: 'cockpit-map-label', offset: [10, 0] })
    marker.bindPopup(`<div class="cockpit-popup"><strong>${point.name}</strong><span>${point.detail}</span><button>查看详情</button></div>`)
  })

  mapReady.value = true
  window.setTimeout(() => map?.invalidateSize(), 100)
}

onMounted(initMap)
onBeforeUnmount(() => {
  map?.remove()
  map = undefined
})
</script>

<template>
  <div class="dashboard-map">
    <div ref="container" class="dashboard-map__canvas"></div>
    <div v-if="!token" class="dashboard-map__empty">未配置天地图 Token</div>
    <div v-else-if="!mapReady" class="dashboard-map__loading">正在加载天地图…</div>

    <div class="map-search">
      <span>⌕</span><input placeholder="搜索区域、地点、任务…" /><kbd>搜索</kbd>
    </div>
    <div class="map-left-tools">
      <strong>图层管理</strong>
      <button class="active">✦ 无人机</button>
      <button>◇ 任务航线</button>
      <button>● 事件点位</button>
      <button>⬡ 行政区划</button>
      <button>▱ 专题图层</button>
      <strong>快捷工具</strong>
      <button>╱ 测距</button>
      <button>△ 测面积</button>
      <button>⌖ 标注</button>
      <button>× 清除</button>
    </div>
    <div class="map-right-tools">
      <button :class="{ active: mapMode === 'vector' }" @click="switchMode('vector')">矢量图</button>
      <button :class="{ active: mapMode === 'image' }" @click="switchMode('image')">卫星图</button>
      <button @click="map?.zoomIn()">＋</button>
      <button @click="map?.zoomOut()">－</button>
    </div>
    <div class="map-scale">天地图 · 实时态势图层</div>
  </div>
</template>

<style scoped lang="scss">
.dashboard-map { position: relative; width: 100%; height: 100%; overflow: hidden; background: #031a31; }
.dashboard-map__canvas { position: absolute; inset: 0; }
.dashboard-map__empty,.dashboard-map__loading { position: absolute; inset: 0; display: grid; place-items: center; color: #56ddef; background: #031a31; font-size: 13px; }
.map-search { position: absolute; z-index: 500; top: 10px; right: 10px; width: 250px; height: 30px; display: flex; align-items: center; gap: 7px; padding: 0 7px; color: #55dff3; background: #031a31df; border: 1px solid #11618a; box-shadow: 0 0 10px #00a9de1f; }
.map-search input { min-width: 0; flex: 1; border: 0; outline: 0; color: #c6edf7; background: transparent; font-size: 11px; }.map-search input::placeholder { color: #5f8397; }.map-search kbd { padding: 3px 6px; color: #70ddec; background: #07517a; font: 9px inherit; }
.map-left-tools { position: absolute; z-index: 500; top: 10px; left: 10px; width: 94px; padding-bottom: 5px; background: #03182ee8; border: 1px solid #0b527a; box-shadow: 0 0 12px #00a7d52b; }
.map-left-tools strong { display: block; padding: 7px 9px; color: #86dff0; background: #08496f; font-size: 10px; }.map-left-tools strong:not(:first-child) { margin-top: 5px; }
.map-left-tools button { width: 100%; padding: 6px 9px; border: 0; color: #8eb7c8; background: transparent; text-align: left; font-size: 9px; cursor: pointer; }.map-left-tools button:hover,.map-left-tools button.active { color: white; background: #0789ba77; }
.map-right-tools { position: absolute; z-index: 500; right: 10px; top: 50px; display: grid; gap: 5px; }.map-right-tools button { min-width: 42px; padding: 6px; color: #92bed0; background: #031a30e8; border: 1px solid #155a7c; font-size: 9px; cursor: pointer; }.map-right-tools button.active,.map-right-tools button:hover { color: #fff; border-color: #24cbe3; background: #075477; }
.map-scale { position: absolute; z-index: 500; right: 10px; bottom: 7px; padding: 4px 8px; color: #77a9b9; background: #021728cc; font-size: 8px; }
:deep(.leaflet-tile-pane) { filter: brightness(.53) saturate(1.55) hue-rotate(155deg) contrast(1.18); }
:deep(.leaflet-overlay-pane) { mix-blend-mode: screen; }
:deep(.cockpit-map-marker) { display: grid; place-items: center; border: 0; background: transparent; }
:deep(.cockpit-map-marker span) { width: 24px; height: 24px; display: grid; place-items: center; color: white; background: #079db7; border: 2px solid #6af3ff; border-radius: 50% 50% 50% 5px; transform: rotate(-45deg); box-shadow: 0 0 0 5px #04d9f31c, 0 0 14px #00e5ff; font-size: 11px; }
:deep(.cockpit-map-marker span::first-letter) { transform: rotate(45deg); }
:deep(.marker-alert span) { background: #bf2838; border-color: #ff727c; box-shadow: 0 0 0 5px #fa35451f, 0 0 14px #ff3145; }
:deep(.marker-task span) { background: #c97413; border-color: #ffca68; box-shadow: 0 0 0 5px #f4a72b1f, 0 0 14px #ffad31; }
:deep(.marker-center span) { background: #6f46c7; border-color: #c99cff; }
:deep(.cockpit-map-label) { color: #c8f6ff; background: #04213cdd; border: 1px solid #17698e; box-shadow: 0 2px 8px #001; border-radius: 2px; font: 9px "Microsoft YaHei"; }
:deep(.cockpit-map-label::before) { border-right-color: #17698e; }
:deep(.leaflet-popup-content-wrapper),:deep(.leaflet-popup-tip) { color: #d9f8ff; background: #061d34; border: 1px solid #1685ad; border-radius: 2px; }
:deep(.cockpit-popup) { min-width: 145px; }.cockpit-popup strong,.cockpit-popup span { display: block; }.cockpit-popup span { margin: 7px 0; color: #88adbd; font-size: 10px; }.cockpit-popup button { padding: 4px 8px; color: white; background: #078cb1; border: 0; font-size: 9px; }
</style>
