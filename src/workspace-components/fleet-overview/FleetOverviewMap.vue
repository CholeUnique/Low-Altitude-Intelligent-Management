<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { UavDeviceOption } from '@/api/patrol'

const props = defineProps<{ devices: UavDeviceOption[] }>()
const container = ref<HTMLElement>()
const token = import.meta.env.VITE_TIANDITU_TOKEN
const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']
const TAIZHOU_CENTER: L.LatLngTuple = [32.4555, 119.9255]
let map: L.Map | undefined
let markerGroup: L.LayerGroup | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame: number | undefined

function tileUrl(layer: 'img' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function renderDevices() {
  if (!map || !markerGroup) return
  const activeMarkerGroup = markerGroup
  activeMarkerGroup.clearLayers()
  props.devices.forEach((device) => {
    if (device.longitude === undefined || device.latitude === undefined) return
    const state = device.online ? '在线' : '离线'
    const color = device.online ? '#14b89c' : '#8295a1'
    L.marker([device.latitude, device.longitude], {
      icon: L.divIcon({
        className: 'fleet-device-marker',
        html: `<span style="--device-color:${color}">✦</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).bindPopup(`<strong>${device.label}</strong><br/><small>${device.sn || '设备编号未返回'} · ${state}</small>`).addTo(activeMarkerGroup)
  })
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
onBeforeUnmount(() => {
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  map?.remove()
})
</script>

<template><div ref="container" class="fleet-map" /></template>

<style scoped>.fleet-map { width:100%; height:100%; min-height:280px; background:#dbe8dc; }</style>
<style>.fleet-device-marker { background:transparent; border:0; }.fleet-device-marker span { display:grid; width:28px; height:28px; place-items:center; color:#fff; background:var(--device-color); border:2px solid #fff; border-radius:50%; box-shadow:0 2px 10px #17374655; font-size:15px; }</style>
