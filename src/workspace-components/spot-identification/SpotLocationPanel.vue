<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { useSpotAddress } from '@/composables/useSpotAddress'
import NavigationQrDialog from './NavigationQrDialog.vue'

const props = defineProps<{ longitude: number; latitude: number }>()
const emit = defineEmits<{ close: [] }>()
const container = ref<HTMLElement>()
const mapMode = ref<'image' | 'vector'>('image')
const target = ref<{ longitude: number; latitude: number; address: string }>()
const { spotAddress, spotAddressLoading, spotAddressError } = useSpotAddress(() => props.longitude, () => props.latitude)
const token = import.meta.env.VITE_TIANDITU_TOKEN || ''
let map: L.Map | undefined
let layers: L.TileLayer[] = []
let marker: L.CircleMarker | undefined
let observer: ResizeObserver | undefined

function refreshLayers() {
  if (!map) return
  layers.forEach(layer => layer.remove())
  layers = []
  if (!token) return
  for (const type of mapMode.value === 'image' ? ['img', 'cia'] : ['vec', 'cva']) {
    const layer = L.tileLayer(`https://t{s}.tianditu.gov.cn/${type}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${type}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${encodeURIComponent(token)}`, { subdomains: '01234567', maxZoom: 20 })
    layer.addTo(map)
    layers.push(layer)
  }
}
function updatePosition() {
  if (!map) return
  const position: L.LatLngTuple = [props.latitude, props.longitude]
  if (!marker) marker = L.circleMarker(position, { radius: 8, color: '#fff', weight: 2, fillColor: '#19a8cd', fillOpacity: 1 }).addTo(map)
  else marker.setLatLng(position)
  map.setView(position, 14, { animate: false })
}
function navigate() {
  if (!spotAddressLoading.value && !spotAddressError.value && spotAddress.value && spotAddress.value !== '未提供有效坐标') target.value = { longitude: props.longitude, latitude: props.latitude, address: spotAddress.value }
}
onMounted(() => {
  if (!container.value) return
  map = L.map(container.value, { zoomControl: false, attributionControl: false, maxZoom: 20 })
  refreshLayers()
  updatePosition()
  observer = new ResizeObserver(() => map?.invalidateSize({ pan: false }))
  observer.observe(container.value)
})
watch(() => [props.longitude, props.latitude], updatePosition)
onBeforeUnmount(() => { observer?.disconnect(); map?.remove() })
</script>

<template>
  <NavigationQrDialog v-if="target" :target="target" @close="target = undefined" />
  <section class="spot-location-panel" aria-label="图斑位置" @pointerdown.stop @wheel.stop @click.stop @dblclick.stop>
    <header><strong>图斑位置</strong><button type="button" aria-label="关闭位置面板" @click="emit('close')">×</button></header>
    <div class="spot-location-map"><div ref="container" class="spot-location-map__canvas" /><span v-if="!token">未配置底图</span></div>
    <div class="spot-location-details"><div><span>经纬度</span><b>{{ Math.abs(longitude).toFixed(6) }}°{{ longitude < 0 ? 'W' : 'E' }}，{{ Math.abs(latitude).toFixed(6) }}°{{ latitude < 0 ? 'S' : 'N' }}</b><button type="button" :disabled="spotAddressLoading || spotAddressError || !spotAddress || spotAddress === '未提供有效坐标'" @click="navigate">导航</button></div><div><span>地址</span><b :title="spotAddress">{{ spotAddress }}</b></div></div>
    <button class="spot-location-basemap" type="button" @click="mapMode = mapMode === 'image' ? 'vector' : 'image'; refreshLayers()">切换底图</button>
  </section>
</template>

<style scoped>
.spot-location-panel{position:absolute;z-index:720;top:48px;right:10px;width:min(340px,calc(100% - 20px));height:min(300px,calc(100% - 55px));min-height:150px;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;border:1px solid #5a9aaf;border-radius:8px;color:#dff4fc;background:#102d40f5;box-shadow:0 8px 25px #00152366;font-size:11px}.spot-location-panel header{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid #345464}.spot-location-panel header strong{font-size:13px}.spot-location-panel header button{border:0;color:#dff4fc;background:transparent;font-size:19px;cursor:pointer}.spot-location-map{position:relative;flex:1;min-height:0}.spot-location-map__canvas{height:100%}.spot-location-map>span{position:absolute;inset:0;display:grid;place-items:center;color:#edcc8c;background:#102d40d9}.spot-location-details{display:grid;gap:5px;padding:7px 10px 0}.spot-location-details>div{display:flex;align-items:center;gap:6px}.spot-location-details span{flex:none;color:#91b5c4}.spot-location-details b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400}.spot-location-details button,.spot-location-basemap{border:1px solid #4d7e92;border-radius:4px;color:#d3f1fc;background:#1d4356;cursor:pointer}.spot-location-details button:disabled{opacity:.45;cursor:not-allowed}.spot-location-basemap{margin:7px 10px;padding:5px}
</style>
