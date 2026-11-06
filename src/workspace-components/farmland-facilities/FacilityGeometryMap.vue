<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TaskGeometryFeatureCollection } from '@/api/governance-task'

const props = defineProps<{
  geometry?: TaskGeometryFeatureCollection
  repairGeometry?: TaskGeometryFeatureCollection
  editable?: boolean
  facilityLocation?: boolean
}>()
const emit = defineEmits<{ 'update:repairGeometry': [value: TaskGeometryFeatureCollection | undefined] }>()
const container = ref<HTMLElement>()
const error = ref('')
const mode = ref<'' | 'point' | 'line' | 'polygon'>('')
const points = ref<[number, number][]>([])
let map: L.Map | undefined
let facilityLayer: L.GeoJSON | undefined
let repairLayer: L.GeoJSON | undefined
let draftLayer: L.Polyline | L.Polygon | L.CircleMarker | undefined
let observer: ResizeObserver | undefined

function render() {
  if (!map) return
  facilityLayer?.remove(); repairLayer?.remove(); draftLayer?.remove()
  try {
    if (props.geometry?.features.length) {
      facilityLayer = L.geoJSON(props.geometry as GeoJSON.FeatureCollection, {
        style: feature => /Point/i.test(feature?.geometry?.type || '')
          ? { color: '#9aeefe', weight: 3, opacity: 1, fill: true, fillColor: '#135888', fillOpacity: 1 }
          : { color: '#9aeefe', weight: 4, opacity: 1, fill: !/LineString/i.test(feature?.geometry?.type || ''), fillColor: '#66b9da', fillOpacity: .25 },
        pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 9, color: '#9aeefe', weight: 3, fillColor: '#135888', fillOpacity: 1 }),
      }).addTo(map)
    }
    if (props.repairGeometry?.features.length) {
      repairLayer = L.geoJSON(props.repairGeometry as GeoJSON.FeatureCollection, {
        style: feature => ({ color: '#ffbd68', weight: 4, fill: !/LineString/i.test(feature?.geometry?.type || ''), fillColor: '#f99845', fillOpacity: .22 }),
        pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: '#f99845', fillOpacity: 1 }),
      }).addTo(map)
    }
    const bounds = facilityLayer?.getBounds()
    if (bounds?.isValid()) {
      if (bounds.getNorthEast().equals(bounds.getSouthWest())) map.setView(bounds.getCenter(), 16)
      else map.fitBounds(bounds, { padding: [32, 32], maxZoom: 17 })
    }
    error.value = ''
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '关联几何无法显示' }
  drawDraft()
}
function drawDraft() {
  draftLayer?.remove()
  if (!map || !points.value.length) return
  const latLngs = points.value.map(([lng, lat]) => L.latLng(lat, lng))
  if (mode.value === 'point') draftLayer = L.circleMarker(latLngs[0]!, { radius: 7, color: '#fff', fillColor: '#f99845', fillOpacity: 1 }).addTo(map)
  else if (mode.value === 'polygon') draftLayer = L.polygon(latLngs, { color: '#ffbd68', weight: 3, fillColor: '#f99845', fillOpacity: .2 }).addTo(map)
  else draftLayer = L.polyline(latLngs, { color: '#ffbd68', weight: 3 }).addTo(map)
}
function start(next: typeof mode.value) { if (!props.editable) return; mode.value = next; points.value = []; drawDraft() }
function finish() {
  if (!props.editable || !mode.value || (mode.value === 'line' && points.value.length < 2) || (mode.value === 'polygon' && points.value.length < 3)) return
  const coordinates = mode.value === 'point' ? points.value[0] : mode.value === 'line' ? points.value : [...points.value, points.value[0]!]
  emit('update:repairGeometry', { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: ({ point: 'Point', line: 'LineString', polygon: 'Polygon' } as const)[mode.value], coordinates: mode.value === 'polygon' ? [coordinates] : coordinates }, properties: { role: 'repair-location' } }] })
  mode.value = ''; points.value = []; drawDraft()
}
function clear() { if (!props.editable) return; mode.value = ''; points.value = []; drawDraft(); emit('update:repairGeometry', undefined) }
onMounted(() => {
  if (!container.value) return
  const token = import.meta.env.VITE_TIANDITU_TOKEN
  if (!token) { error.value = '地图底图尚未配置'; return }
  map = L.map(container.value, { center: [32.455, 119.923], zoom: 10, zoomControl: !props.facilityLocation, attributionControl: false })
  const url = (layer: string) => `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
  L.tileLayer(url('img'), { subdomains: '01234567', maxNativeZoom: 18, maxZoom: 21 }).addTo(map)
  L.tileLayer(url('cia'), { subdomains: '01234567', maxNativeZoom: 18, maxZoom: 21 }).addTo(map)
  map.on('click', event => {
    if (!props.editable || !mode.value) return
    points.value = mode.value === 'point' ? [[event.latlng.lng, event.latlng.lat]] : [...points.value, [event.latlng.lng, event.latlng.lat]]
    drawDraft()
  })
  observer = new ResizeObserver(() => map?.invalidateSize())
  observer.observe(container.value)
  render()
})
watch(() => [props.geometry, props.repairGeometry], render)
watch(() => props.editable, editable => { if (!editable) { mode.value = ''; points.value = []; drawDraft() } })
onBeforeUnmount(() => { observer?.disconnect(); map?.remove(); map = undefined })
</script>

<template>
  <div class="facility-map">
    <div ref="container" class="facility-map-canvas" role="img" aria-label="任务关联几何地图" />
    <div v-if="!geometry?.features.length && !repairGeometry?.features.length" class="facility-map-empty">暂无真实关联位置</div>
    <div v-if="editable" class="facility-map-draw">
      <button type="button" :class="{ active: mode === 'point' }" @click="start('point')">标故障点</button>
      <button type="button" :class="{ active: mode === 'line' }" @click="start('line')">绘制线段</button>
      <button type="button" :class="{ active: mode === 'polygon' }" @click="start('polygon')">绘制区域</button>
      <button v-if="mode" type="button" :disabled="!points.length" @click="finish">完成</button>
      <button v-if="mode || repairGeometry" type="button" @click="clear">清除</button>
    </div>
    <p v-if="error" class="facility-map-error" role="alert">{{ error }}</p>
    <small v-if="!facilityLocation" class="facility-map-legend">蓝色：任务关联几何　橙色：本次故障位置。关联几何不自动等同设施档案。</small>
  </div>
</template>

<style scoped>
.facility-map{position:relative;display:flex;flex-direction:column;min-height:0;height:100%;background:#e7f1f4;border-radius:8px;overflow:hidden}.facility-map-canvas{flex:1;min-height:170px;z-index:0}.facility-map-empty{position:absolute;z-index:400;inset:0 0 28px;display:grid;place-items:center;background:#e8f1f4ec;color:#5a8193;font-size:13px;pointer-events:none}.facility-map-draw{position:absolute;z-index:500;top:10px;right:10px;display:flex;flex-wrap:wrap;gap:5px;max-width:65%;padding:6px;background:#0a344bcc;border:1px solid #65b9cf88;border-radius:8px}.facility-map-draw button{padding:5px 8px;border:1px solid #87c9d9;background:#e7f8fc;color:#14516b;border-radius:5px;font-size:11px;cursor:pointer}.facility-map-draw button.active{background:#ffbd68;color:#3b2915;border-color:#ffbd68}.facility-map-draw button:disabled{opacity:.5;cursor:not-allowed}.facility-map-error{position:absolute;z-index:500;top:8px;left:45px;margin:0;padding:6px 10px;color:#a52f25;background:#fff8f4eb;border:1px solid #e6a496;border-radius:5px;font-size:12px}.facility-map-legend{flex:none;padding:7px 10px;color:#497083;background:#f3fafc;font-size:11px}
</style>
