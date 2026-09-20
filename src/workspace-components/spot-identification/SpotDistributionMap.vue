<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TaskAbnormal } from '@/api/governance-task'
import { registerComparisonMap } from './mapViewSync'

export interface ComparisonPeriod {
  number: number
  label: string
  kind: 'dom' | 'image' | 'empty'
  imageUrl?: string
}

const props = defineProps<{
  /** 当前窗口只绘制用户选中的一条异常图斑。 */
  spot?: TaskAbnormal
  period: ComparisonPeriod
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
let geometryLayer: L.FeatureGroup | undefined
let imageLayer: L.ImageOverlay | undefined
let unregisterComparisonMap: (() => void) | undefined

function tileUrl(layer: 'img' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function isArea(bounds: L.LatLngBounds) {
  return bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())
}

function imageBoundsForSpot(spot: TaskAbnormal, geometryBounds?: L.LatLngBounds) {
  if (geometryBounds && isArea(geometryBounds)) return geometryBounds.pad(.16)
  if (spot.latitude !== undefined && spot.longitude !== undefined) {
    const delta = .00055
    return L.latLngBounds(
      [spot.latitude - delta, spot.longitude - delta],
      [spot.latitude + delta, spot.longitude + delta],
    )
  }
  return undefined
}

function renderSelectedSpot() {
  if (!map || !geometryLayer) return
  geometryLayer.clearLayers()
  imageLayer?.remove()
  imageLayer = undefined
  imageError.value = false
  const spot = props.spot
  if (!spot) return

  let boundaryBounds: L.LatLngBounds | undefined
  if (spot.boundaryGeoJson?.features.length) {
    try {
      const boundary = L.geoJSON(spot.boundaryGeoJson as GeoJSON.FeatureCollection, {
        pane: 'comparison-geometry-pane',
        style: { color: '#f3475b', weight: 3, opacity: 1, fillColor: '#f3475b', fillOpacity: .22, dashArray: '5 4' },
        pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
          pane: 'comparison-geometry-pane', radius: 8, color: '#fff', weight: 2, fillColor: '#f3475b', fillOpacity: 1,
        }),
      })
      const bounds = boundary.getBounds()
      if (isArea(bounds)) {
        boundary.addTo(geometryLayer)
        boundaryBounds = bounds
      }
    } catch {
      // 不规范的历史边界会在下面按中心点兜底，不能使图斑识别页不可用。
    }
  }
  if (!boundaryBounds && spot.latitude !== undefined && spot.longitude !== undefined) {
    L.circleMarker([spot.latitude, spot.longitude], {
      pane: 'comparison-geometry-pane', radius: 9, color: '#fff', weight: 2.5, fillColor: '#f3475b', fillOpacity: 1,
    }).bindTooltip(`${spot.title}（仅中心点）`, { direction: 'top' }).on('click', () => emit('select', spot.id)).addTo(geometryLayer)
  }

  if (props.period.kind === 'image' && props.period.imageUrl) {
    const imageBounds = imageBoundsForSpot(spot, boundaryBounds)
    if (imageBounds) {
      imageLayer = L.imageOverlay(props.period.imageUrl, imageBounds, {
        pane: 'comparison-image-pane', opacity: .96, interactive: false,
      }).on('error', () => { imageError.value = true }).addTo(map)
    }
  }
  const viewBounds = boundaryBounds || imageBoundsForSpot(spot)
  if (viewBounds && isArea(viewBounds)) map.fitBounds(viewBounds.pad(.7), { padding: [24, 24], animate: false })
  else if (spot.latitude !== undefined && spot.longitude !== undefined) map.setView([spot.latitude, spot.longitude], 18, { animate: false })
}

function renderBaseLayer() {
  if (!map || props.period.kind === 'empty') return
  if (token) {
    L.tileLayer(tileUrl('img'), { subdomains, maxNativeZoom: 18, maxZoom: 22 }).addTo(map)
    L.tileLayer(tileUrl('cia'), { subdomains, maxNativeZoom: 18, maxZoom: 22 }).addTo(map)
  }
  if (props.period.kind === 'dom' && domXyzTileUrl) {
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
}

onMounted(async () => {
  await nextTick()
  if (!container.value) return
  map = L.map(container.value, { maxZoom: 22, zoomControl: false, attributionControl: false }).setView([32.4555, 119.9255], 11)
  const imagePane = map.createPane('comparison-image-pane')
  imagePane.style.zIndex = '350'
  const geometryPane = map.createPane('comparison-geometry-pane')
  geometryPane.style.zIndex = '460'
  renderBaseLayer()
  geometryLayer = L.featureGroup().addTo(map)
  renderSelectedSpot()
  unregisterComparisonMap = registerComparisonMap(map)
})

watch(() => [props.spot, props.period] as const, renderSelectedSpot, { deep: true })
onBeforeUnmount(() => {
  unregisterComparisonMap?.()
  map?.remove()
})
</script>

<template>
  <div class="spot-map" :class="{ 'spot-map--empty': period.kind === 'empty' }">
    <div ref="container" class="spot-map__canvas"></div>
    <span class="period-badge">第 {{ period.number }} 期 · {{ period.label }}</span>
    <div v-if="period.kind === 'empty'" class="empty-imagery">暂无多期影像</div>
    <div v-else-if="period.kind === 'image' && imageError" class="empty-imagery empty-imagery--error">关联影像加载失败</div>
    <small v-else-if="period.kind === 'image'" class="image-note">关联影像未返回覆盖范围，按图斑范围展示</small>
  </div>
</template>

<style scoped>
.spot-map { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; background: #dce8ee; }
.spot-map--empty { background: #d2d9de; }
.spot-map__canvas { position: absolute; inset: 0; }
.spot-map--empty :deep(.leaflet-container) { background: #d2d9de; }
.period-badge { position: absolute; z-index: 500; top: 9px; right: 9px; padding: 5px 8px; color: #effbff; background: #08364ad9; border: 1px solid #54d6e099; border-radius: 4px; font-size: 12px; font-weight: 600; pointer-events: none; }
.empty-imagery { position: absolute; z-index: 500; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 10px 15px; color: #526773; background: #edf1f3dd; border: 1px solid #afbdc5; border-radius: 4px; font-size: 14px; font-weight: 600; white-space: nowrap; pointer-events: none; }
.empty-imagery--error { color: #a64a4a; }
.image-note { position: absolute; z-index: 500; left: 9px; bottom: 8px; padding: 4px 7px; color: #effbff; background: #172d3ac9; border-radius: 3px; font-size: 11px; pointer-events: none; }
</style>
