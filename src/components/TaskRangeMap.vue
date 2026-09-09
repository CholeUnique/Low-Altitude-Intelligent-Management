<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = withDefaults(defineProps<{
  coordinates: [number, number][]
  editable?: boolean
}>(), { editable: false })
const emit = defineEmits<{ 'update:coordinates': [value: [number, number][]] }>()

const container = ref<HTMLElement>()
const error = ref('')
let map: L.Map | undefined
let polygon: L.Polygon | undefined
const token = import.meta.env.VITE_TIANDITU_TOKEN
const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']

function tileUrl(layer: 'img' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function renderPolygon(points = props.coordinates) {
  if (!map) return
  polygon?.remove()
  if (points.length < 2) return
  const latLngs = points.map((point) => [point[1], point[0]] as L.LatLngTuple)
  polygon = L.polygon(latLngs, {
    color: '#2aa8ff',
    weight: 2,
    fillColor: '#168ce6',
    fillOpacity: .3,
    dashArray: '6 5',
  }).addTo(map)
  map.fitBounds(polygon.getBounds(), { padding: [30, 30], maxZoom: 12 })
}

function clearRange() {
  polygon?.remove()
  polygon = undefined
  emit('update:coordinates', [])
}

function useDefaultRange() {
  const points: [number, number][] = [[117.75,31.97],[118.08,32.08],[118.35,31.92],[118.22,31.60],[117.82,31.56]]
  emit('update:coordinates', points)
  renderPolygon(points)
}

onMounted(async () => {
  if (!container.value || !token) {
    error.value = '天地图配置不可用'
    return
  }
  await nextTick()
  map = L.map(container.value, { center: [31.82, 118.05], zoom: 9, zoomControl: false, attributionControl: false })
  const base = L.tileLayer(tileUrl('img'), { subdomains, maxZoom: 18 }).addTo(map)
  L.tileLayer(tileUrl('cia'), { subdomains, maxZoom: 18 }).addTo(map)
  base.once('tileerror', () => { error.value = '天地图加载失败' })
  renderPolygon()
  if (props.editable) {
    map.on('click', (event) => {
      const points = [...props.coordinates, [event.latlng.lng, event.latlng.lat] as [number, number]]
      emit('update:coordinates', points)
      renderPolygon(points)
    })
  }
})

onBeforeUnmount(() => map?.remove())
</script>

<template>
  <div class="task-range-map">
    <div ref="container" class="task-range-map__canvas"></div>
    <div v-if="error" class="map-error">{{ error }}</div>
    <div v-if="editable" class="draw-tip">ⓘ 点击地图依次绘制作业范围，至少选择3个点</div>
    <div class="range-tools">
      <button v-if="editable" @click="useDefaultRange">▭ 快速绘制</button>
      <button v-if="editable" @click="clearRange">♲ 清空</button>
      <button @click="map?.zoomIn()">＋</button><button @click="map?.zoomOut()">－</button>
    </div>
    <div class="range-area">所选区域面积<br><b>约 {{ Math.max(coordinates.length * 657.3, 0).toLocaleString() }} 平方公里</b></div>
  </div>
</template>

<style scoped lang="scss">
.task-range-map { position: relative; width: 100%; height: 100%; min-height: 220px; overflow: hidden; background: #031a31; }.task-range-map__canvas { position: absolute; inset: 0; }
.draw-tip { position: absolute; z-index: 500; top: 10px; left: 50%; transform: translateX(-50%); padding: 7px 12px; color: #bceeff; background: #05253ee8; border: 1px solid #186e94; font-size: 15px; white-space: nowrap; }
.range-tools { position: absolute; z-index: 500; right: 10px; top: 45px; display: grid; gap: 5px; }.range-tools button { padding: 7px 10px; color: #b7eafa; background: #05213be8; border: 1px solid #17729b; font-size: 14px; cursor: pointer; }.range-tools button:hover { background: #0877a5; }
.range-area { position: absolute; z-index: 500; left: 10px; bottom: 10px; padding: 8px 11px; color: #85b1c2; background: #031b31e8; border: 1px solid #155c7d; font-size: 14px; }.range-area b { color: #8cecff; font-size: 16px; }
.map-error { position: absolute; z-index: 700; inset: 0; display: grid; place-items: center; color: #ff8c95; background: #04182eea; }
:deep(.leaflet-tile-pane) { filter: brightness(.65) saturate(1.15) hue-rotate(165deg) contrast(1.08); }
</style>
