<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { UavDeviceOption } from '@/api/patrol'

const props = defineProps<{ devices: UavDeviceOption[]; selectedDeviceId?: string }>()
const emit = defineEmits<{ 'select-device': [deviceId: string] }>()
const container = ref<HTMLElement>()
const token = import.meta.env.VITE_TIANDITU_TOKEN
const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']
const TAIZHOU_CENTER: L.LatLngTuple = [32.4555, 119.9255]
let map: L.Map | undefined
let markerGroup: L.LayerGroup | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame: number | undefined
let hasFittedDevices = false

function tileUrl(layer: 'img' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function renderDevices() {
  if (!map || !markerGroup) return
  const activeMarkerGroup = markerGroup
  activeMarkerGroup.clearLayers()
  const bounds = L.latLngBounds([])
  props.devices.forEach((device) => {
    if (device.longitude === undefined || device.latitude === undefined) return
    const state = device.online ? '在线' : '离线'
    const point: L.LatLngTuple = [device.latitude, device.longitude]
    bounds.extend(point)
    const tooltip = document.createElement('div')
    const name = document.createElement('strong')
    const status = document.createElement('span')
    name.textContent = device.label
    status.textContent = state
    tooltip.append(name, status)
    L.marker(point, {
      icon: L.divIcon({
        className: `fleet-device-marker ${device.online ? 'is-online' : 'is-offline'} ${device.id === props.selectedDeviceId ? 'is-selected' : ''}`,
        html: '<span><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 13h10l3 4-3 2H11l-3-2 3-4Z"/><path d="M9 15 5 10m18 5 4-5M9 19l-4 4m18-4 4 4"/><circle cx="4.5" cy="9.5" r="3"/><circle cx="27.5" cy="9.5" r="3"/><circle cx="4.5" cy="23.5" r="3"/><circle cx="27.5" cy="23.5" r="3"/></svg></span>',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      }),
    }).bindTooltip(tooltip, { direction: 'top', offset: [0, -18], className: 'fleet-device-tooltip' })
      .on('click', () => emit('select-device', device.id))
      .addTo(activeMarkerGroup)
  })
  if (!hasFittedDevices && bounds.isValid()) {
    if (props.devices.length === 1) map.setView(bounds.getCenter(), 15, { animate: false })
    else map.fitBounds(bounds, { padding: [55, 55], maxZoom: 15, animate: false })
    hasFittedDevices = true
  }
}

function focusSelectedDevice() {
  if (!map || !props.selectedDeviceId) return
  const device = props.devices.find((item) => item.id === props.selectedDeviceId)
  if (device?.longitude === undefined || device.latitude === undefined) return
  map.flyTo([device.latitude, device.longitude], Math.max(map.getZoom(), 16), { duration: 0.45 })
}

onMounted(async () => {
  await nextTick()
  if (!container.value) return
  map = L.map(container.value, { zoomControl: false, attributionControl: false, maxZoom: 22 }).setView(TAIZHOU_CENTER, 10)
  map.createPane('labels')
  map.getPane('labels')!.style.zIndex = '450'
  if (token) {
    L.tileLayer(tileUrl('img'), { subdomains, maxNativeZoom: 18, maxZoom: 22 }).addTo(map)
    L.tileLayer(tileUrl('cia'), { subdomains, maxNativeZoom: 18, maxZoom: 22, pane: 'labels' }).addTo(map)
  } else {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 18, maxZoom: 22 }).addTo(map)
  }
  markerGroup = L.layerGroup().addTo(map)
  renderDevices()
  resizeObserver = new ResizeObserver(() => {
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
    resizeFrame = window.requestAnimationFrame(() => map?.invalidateSize({ pan: false }))
  })
  resizeObserver.observe(container.value)
})

watch(() => props.devices, renderDevices, { deep: true })
watch(() => props.selectedDeviceId, () => {
  renderDevices()
  focusSelectedDevice()
})
onBeforeUnmount(() => {
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  map?.remove()
})
</script>

<template><div ref="container" class="fleet-map" /></template>

<style scoped>.fleet-map { width:100%; height:100%; min-height:0; background:#dbe8dc; }</style>
<style>
.fleet-device-marker { background:transparent; border:0; }
.fleet-device-marker span { display:grid;width:36px;height:36px;place-items:center;border:2px solid #fff;border-radius:50%;background:#8295a1;color:#fff;box-sizing:border-box; }
.fleet-device-marker svg { width:25px;height:25px;fill:currentColor;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round; }
.fleet-device-marker.is-online span { background:#079b91;color:#eaffff;border-color:#d8ffff;box-shadow:0 0 7px #38f6dc,0 0 18px #14d9c5,0 2px 8px #17374677;animation:fleet-drone-glow 1.8s ease-in-out infinite alternate; }
.fleet-device-marker.is-offline span { background:#7d8a91;color:#d9dfe2;border-color:#c5cdd1;box-shadow:0 2px 7px #17374655;filter:grayscale(1); }
.fleet-device-marker.is-selected span { outline:3px solid #ffcf4e;outline-offset:3px; }
.fleet-device-tooltip strong,.fleet-device-tooltip span { display:block;text-align:center; }
.fleet-device-tooltip span { margin-top:3px;color:#5b7888;font-size:11px; }
@keyframes fleet-drone-glow { from { box-shadow:0 0 5px #38f6dc,0 0 11px #14d9c5,0 2px 8px #17374677; } to { box-shadow:0 0 10px #7ffff0,0 0 24px #14d9c5,0 2px 8px #17374677; } }
</style>
