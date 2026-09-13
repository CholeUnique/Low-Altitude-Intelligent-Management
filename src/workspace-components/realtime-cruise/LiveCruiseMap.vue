<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps<{
  routeCoordinates: [number, number][]
  flownIndex: number
  dronePosition: [number, number]
}>()

const TAIZHOU_CENTER: L.LatLngTuple = [32.4555, 119.9255]
const token = import.meta.env.VITE_TIANDITU_TOKEN
const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']

let map: L.Map | undefined
let routeGroup: L.LayerGroup | undefined
let containerEl: HTMLElement | undefined

function tileUrl(layer: 'img' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function renderTrack() {
  if (!map || !routeGroup) return
  routeGroup.clearLayers()
  const latlngs = props.routeCoordinates.map((p) => [p[1], p[0]] as L.LatLngTuple)
  if (!latlngs.length) return

  const flown = latlngs.slice(0, props.flownIndex + 1)
  const remaining = latlngs.slice(props.flownIndex)

  if (flown.length > 1) {
    L.polyline(flown, { color: '#1fbf6a', weight: 4 }).addTo(routeGroup)
  }
  if (remaining.length > 1) {
    L.polyline(remaining, { color: '#8aa0b0', weight: 3, dashArray: '8 6' }).addTo(routeGroup)
  }

  latlngs.forEach((point, index) => {
    L.circleMarker(point, {
      radius: 5,
      color: '#fff',
      weight: 1,
      fillColor: index <= props.flownIndex ? '#1fbf6a' : '#7f93a3',
      fillOpacity: 1,
    }).bindTooltip(`WP-${String(index + 1).padStart(2, '0')}`, { direction: 'top' }).addTo(routeGroup!)
  })

  const drone: L.LatLngTuple = [props.dronePosition[1], props.dronePosition[0]]
  L.marker(drone, {
    icon: L.divIcon({
      className: 'drone-live-marker',
      html: '<span>✈</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    }),
  }).bindPopup('当前无人机位置').addTo(routeGroup)

  map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 14 })
}

onMounted(async () => {
  await nextTick()
  containerEl = document.getElementById('live-cruise-map') || undefined
  if (!containerEl || !token) return
  map = L.map(containerEl, { zoomControl: false, attributionControl: false }).setView(TAIZHOU_CENTER, 12)
  map.createPane('labels')
  map.getPane('labels')!.style.zIndex = '450'
  L.tileLayer(tileUrl('img'), { subdomains, maxZoom: 18 }).addTo(map)
  L.tileLayer(tileUrl('cia'), { subdomains, maxZoom: 18, pane: 'labels' }).addTo(map)
  routeGroup = L.layerGroup().addTo(map)
  renderTrack()
})

watch(() => [props.routeCoordinates, props.flownIndex, props.dronePosition], () => renderTrack(), { deep: true })

onBeforeUnmount(() => {
  map?.remove()
  map = undefined
})
</script>

<template>
  <div id="live-cruise-map" class="live-map"></div>
</template>

<style scoped lang="scss">
.live-map {
  width: 100%;
  height: 100%;
  min-height: 280px;
  background: #0a2a3d;
}
</style>

<style>
.drone-live-marker span {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #031a31;
  background: #38e3f4;
  border: 2px solid #fff;
  box-shadow: 0 0 12px #38e3f4aa;
  font-size: 14px;
}
</style>
