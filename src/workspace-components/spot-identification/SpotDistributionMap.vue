<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ProblemSpot } from '@/mocks/governance'

const props = defineProps<{ spots: ProblemSpot[]; activeId: string }>()
const emit = defineEmits<{ select: [id: string] }>()
const token = import.meta.env.VITE_TIANDITU_TOKEN
let map: L.Map | undefined
let spotGroup: L.LayerGroup | undefined

function tileUrl(layer: 'img' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function renderSpots() {
  if (!map || !spotGroup) return
  spotGroup.clearLayers()
  const bounds: L.LatLngTuple[] = []
  props.spots.forEach((spot) => {
    const points = spot.polygon.map(([lng, lat]) => [lat, lng] as L.LatLngTuple)
    bounds.push(...points)
    const active = spot.id === props.activeId
    L.polygon(points, {
      color: active ? '#ff6b47' : spot.risk === '高' ? '#e74c3c' : spot.risk === '中' ? '#f0a52b' : '#31a7dc',
      weight: active ? 4 : 2,
      fillOpacity: active ? 0.38 : 0.18,
    })
      .bindTooltip(`${spot.id}<br>${spot.type} · ${spot.area} ha`)
      .on('click', () => emit('select', spot.id))
      .addTo(spotGroup!)
  })
  if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [35, 35], maxZoom: 13 })
}

onMounted(async () => {
  await nextTick()
  const container = document.getElementById('spot-distribution-map')
  if (!container) return
  map = L.map(container, { zoomControl: true, attributionControl: false }).setView([32.4555, 119.9255], 11)
  if (token) {
    L.tileLayer(tileUrl('img'), { subdomains: ['0','1','2','3','4','5','6','7'], maxZoom: 18 }).addTo(map)
    L.tileLayer(tileUrl('cia'), { subdomains: ['0','1','2','3','4','5','6','7'], maxZoom: 18 }).addTo(map)
  }
  spotGroup = L.layerGroup().addTo(map)
  renderSpots()
})

watch(() => [props.spots, props.activeId], renderSpots, { deep: true })
onBeforeUnmount(() => map?.remove())
</script>

<template><div id="spot-distribution-map" class="spot-map"></div></template>

<style scoped>
.spot-map { width: 100%; height: 100%; min-height: 280px; background: #dce8ee; }
</style>
