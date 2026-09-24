<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TaskAbnormal } from '@/api/governance-task'

export interface ComparisonPeriod {
  number: number
  label: string
  kind: 'dom' | 'image' | 'empty'
  imageUrl?: string
}

const props = defineProps<{
  /** 仅第 1 期 DOM 基准窗口使用当前图斑的空间范围。 */
  spot?: TaskAbnormal
  period: ComparisonPeriod
  /** 用于期次栏缩略图时隐藏说明和期次浮标。 */
  thumbnail?: boolean
}>()

const emit = defineEmits<{ select: [id: string] }>()
const container = ref<HTMLElement>()
const imageError = ref(false)
const token = import.meta.env.VITE_TIANDITU_TOKEN
const domXyzTileUrl = import.meta.env.VITE_DOM_XYZ_TILE_URL?.trim()
const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']
const domBounds = L.latLngBounds(
  [32.48574015140688, 119.8412888155381],
  [32.49689672806349, 119.85940753661878],
)
let map: L.Map | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame: number | undefined

function tileUrl(layer: 'img' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function isArea(bounds: L.LatLngBounds) {
  return bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())
}

/** 第 1 期：DOM 基准图及其异常图斑范围。 */
function createReferenceMap() {
  if (!container.value) return
  map = L.map(container.value, { maxZoom: 22, zoomControl: false, attributionControl: false }).setView([32.4555, 119.9255], 11)
  if (token) {
    const labelsPane = map.createPane('labels')
    labelsPane.style.zIndex = '450'
    labelsPane.style.pointerEvents = 'none'
    L.tileLayer(tileUrl('img'), { subdomains, maxNativeZoom: 18, maxZoom: 22 }).addTo(map)
    L.tileLayer(tileUrl('cia'), { subdomains, maxNativeZoom: 18, maxZoom: 22, pane: 'labels' }).addTo(map)
  }
  if (domXyzTileUrl) {
    L.tileLayer(domXyzTileUrl, {
      bounds: domBounds,
      minNativeZoom: 16,
      maxNativeZoom: 22,
      maxZoom: 22,
      tms: true,
      opacity: .94,
      noWrap: true,
    }).addTo(map)
  }

  const spot = props.spot
  if (!spot) return
  let boundaryBounds: L.LatLngBounds | undefined
  if (spot.boundaryGeoJson?.features.length) {
    try {
      const boundary = L.geoJSON(spot.boundaryGeoJson as GeoJSON.FeatureCollection, {
        style: { color: '#f3475b', weight: 3, opacity: 1, fillColor: '#f3475b', fillOpacity: .22, dashArray: '5 4' },
        pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
          radius: 8, color: '#fff', weight: 2, fillColor: '#f3475b', fillOpacity: 1,
        }),
      })
      const bounds = boundary.getBounds()
      if (isArea(bounds)) {
        boundary.addTo(map)
        boundaryBounds = bounds
      }
    } catch {
      // 不规范的历史边界改用中心点显示，不能影响基准图使用。
    }
  }
  if (!boundaryBounds && spot.latitude !== undefined && spot.longitude !== undefined) {
    L.circleMarker([spot.latitude, spot.longitude], {
      radius: 9, color: '#fff', weight: 2.5, fillColor: '#f3475b', fillOpacity: 1,
    }).bindTooltip(`${spot.title}（仅中心点）`, { direction: 'top' }).on('click', () => emit('select', spot.id)).addTo(map)
    map.setView([spot.latitude, spot.longitude], 18, { animate: false })
    return
  }
  if (boundaryBounds) {
    const padding: L.PointExpression = props.thumbnail ? [0, 0] : [24, 24]
    map.fitBounds(boundaryBounds.pad(.7), { padding, animate: false })
  }
}

/**
 * 第 2 期及以后：以原图像素坐标创建独立查看器。
 * 这里没有天地图、图斑边界或视图同步，拖动与缩放只作用于本窗口。
 */
function createImageViewer(imageUrl: string) {
  if (!container.value) return
  map = L.map(container.value, {
    crs: L.CRS.Simple,
    minZoom: -4,
    maxZoom: 4,
    zoomControl: true,
    attributionControl: false,
    zoomSnap: .25,
  }).setView([0, 0], 0)
  const source = new Image()
  source.onload = () => {
    if (!map || !source.naturalWidth || !source.naturalHeight) return
    const bounds = L.latLngBounds([0, 0], [source.naturalHeight, source.naturalWidth])
    L.imageOverlay(imageUrl, bounds, { opacity: 1, interactive: false }).on('error', () => { imageError.value = true }).addTo(map)
    map.setMaxBounds(bounds.pad(.5))
    map.fitBounds(bounds, { padding: [12, 12], animate: false })
  }
  source.onerror = () => { imageError.value = true }
  source.src = imageUrl
}

onMounted(async () => {
  await nextTick()
  if (!container.value || props.period.kind === 'empty') return
  if (props.period.kind === 'dom') createReferenceMap()
  else if (props.period.imageUrl) createImageViewer(props.period.imageUrl)
  if (!map) return
  resizeObserver = new ResizeObserver(() => {
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
    resizeFrame = window.requestAnimationFrame(() => map?.invalidateSize({ pan: false }))
  })
  resizeObserver.observe(container.value)
})

onBeforeUnmount(() => {
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  map?.remove()
})
</script>

<template>
  <div class="spot-map" :class="{ 'spot-map--empty': period.kind === 'empty', 'spot-map--thumbnail': thumbnail }">
    <div v-if="period.kind !== 'empty'" ref="container" class="spot-map__canvas"></div>
    <span v-if="!thumbnail" class="period-badge">第 {{ period.number }} 期 · {{ period.label }}</span>
    <div v-if="!thumbnail && period.kind === 'empty'" class="empty-imagery">暂无多期影像</div>
    <div v-else-if="!thumbnail && period.kind === 'image' && imageError" class="empty-imagery empty-imagery--error">关联影像加载失败</div>
  </div>
</template>

<style scoped>
.spot-map { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; background: #dce8ee; }
.spot-map--empty { background: #d2d9de; }
.spot-map__canvas { position: absolute; inset: 0; }
.period-badge { position: absolute; z-index: 500; top: 9px; right: 9px; padding: 5px 8px; color: #effbff; background: #08364ad9; border: 1px solid #54d6e099; border-radius: 4px; font-size: 12px; font-weight: 600; pointer-events: none; }
.empty-imagery { position: absolute; z-index: 500; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 10px 15px; color: #526773; background: #edf1f3dd; border: 1px solid #afbdc5; border-radius: 4px; font-size: 14px; font-weight: 600; white-space: nowrap; pointer-events: none; }
.empty-imagery--error { color: #a64a4a; }
</style>
