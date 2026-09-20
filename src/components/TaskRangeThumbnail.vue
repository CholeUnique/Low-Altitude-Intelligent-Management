<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TaskGeometryFeatureCollection } from '@/api/governance-task'

const props = defineProps<{
  geoJson: TaskGeometryFeatureCollection
}>()

const container = ref<HTMLElement>()
let map: L.Map | undefined
let rangeLayer: L.GeoJSON | undefined
const token = import.meta.env.VITE_TIANDITU_TOKEN
const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']

function tileUrl(layer: 'img' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function isTaskRangeFeature(feature: TaskGeometryFeatureCollection['features'][number]) {
  const type = feature.geometry?.type.toUpperCase()
  const isEmptyReference = (value: unknown) => value === undefined || value === null || value === '' || value === 'null'
  return Boolean(type && ['POLYGON', 'MULTIPOLYGON', 'LINESTRING', 'MULTILINESTRING', 'POINT', 'MULTIPOINT'].includes(type))
    && isEmptyReference(feature.properties?.abnormalId)
    && isEmptyReference(feature.properties?.resultId)
}

async function renderRange() {
  if (!map) return
  rangeLayer?.remove()
  const features = props.geoJson.features.filter(isTaskRangeFeature)
  rangeLayer = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
    style: {
      color: '#2ff4ff',
      weight: 2,
      opacity: 1,
      fillColor: '#22cbd7',
      fillOpacity: .1,
      dashArray: '4 3',
    },
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
      radius: 3,
      color: '#dffcff',
      weight: 1,
      fillColor: '#22dce9',
      fillOpacity: 1,
    }),
    interactive: false,
  }).addTo(map)
  const bounds = rangeLayer.getBounds()
  if (!bounds.isValid()) return
  await nextTick()
  map.invalidateSize({ pan: false })
  map.fitBounds(bounds.pad(.16), { padding: [3, 3], maxZoom: 19, animate: false })
}

onMounted(() => {
  if (!container.value) return
  map = L.map(container.value, {
    attributionControl: false,
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false,
    preferCanvas: true,
  }).setView([32.49, 119.85], 16)
  if (token) {
    L.tileLayer(tileUrl('img'), { subdomains, maxNativeZoom: 18, maxZoom: 22, noWrap: true }).addTo(map)
    L.tileLayer(tileUrl('cia'), { subdomains, maxNativeZoom: 18, maxZoom: 22, noWrap: true, opacity: .78 }).addTo(map)
  } else {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 22 }).addTo(map)
  }
  void renderRange()
})

watch(() => props.geoJson, () => void renderRange(), { deep: true })
onBeforeUnmount(() => map?.remove())
</script>

<template>
  <div ref="container" class="task-range-thumbnail" title="任务范围地理缩略图"></div>
</template>

<style scoped>
.task-range-thumbnail { width: 64px; height: 42px; flex: 0 0 auto; overflow: hidden; border: 1px solid #2086a6; background: #123546; }
:deep(.leaflet-container) { width: 100%; height: 100%; background: #123546; }
</style>
