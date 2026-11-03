<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getFacilityGeoJson } from '@/api/facility'
const props = defineProps<{ deptId: string }>()
const element = ref<HTMLElement>(), error = ref(''), loading = ref(false), count = ref(0)
let map: L.Map | undefined, features: L.GeoJSON | undefined, version = 0
async function load() {
  if (!map || !props.deptId) return
  const request = ++version, bounds = map.getBounds()
  loading.value = true; error.value = ''
  try {
    const data = await getFacilityGeoJson({ deptId: props.deptId, minLng: Math.max(-180, bounds.getWest()), minLat: Math.max(-90, bounds.getSouth()), maxLng: Math.min(180, bounds.getEast()), maxLat: Math.min(90, bounds.getNorth()) })
    if (request !== version) return
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('地图接口返回的 GeoJSON 格式无效')
    features?.clearLayers(); features?.addData(data); count.value = data.features.length
  } catch (e) { if (request === version) { features?.clearLayers(); count.value = 0; error.value = e instanceof Error ? e.message : '地图数据读取失败' } }
  finally { if (request === version) loading.value = false }
}
onMounted(() => {
  if (!element.value) return
  map = L.map(element.value).setView([32.49, 119.85], 12)
  const token = import.meta.env.VITE_TIANDITU_TOKEN
  if (token) for (const layer of ['img', 'cia']) L.tileLayer(`https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`, { subdomains: ['0','1','2','3','4','5','6','7'], maxNativeZoom: 18, maxZoom: 22 }).addTo(map)
  features = L.geoJSON(undefined, { style: { color: '#48d5e8', weight: 3 }, pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 6, color: '#fff1c3', weight: 2, fillColor: '#ffc45a', fillOpacity: 1 }), onEachFeature: (feature, layer) => { const name = document.createElement('span'); name.textContent = String(feature.properties?.name || '未命名设施'); layer.bindPopup(name) } }).addTo(map)
  map.on('moveend', load); void load()
})
watch(() => props.deptId, () => { features?.clearLayers(); void load() })
onBeforeUnmount(() => { version++; map?.remove() })
</script>
<template><section class="map-card"><div class="map-header"><strong>台账设施地图</strong><span>{{ loading ? '正在加载…' : error ? `加载失败：${error}` : `当前范围 ${count} 条设施` }}</span><button v-if="error" @click="load">重试</button></div><div ref="element" class="map" aria-label="台账设施地图"></div></section></template>
<style scoped>.map-card{margin-bottom:18px;border:1px solid #285468;border-radius:6px;overflow:hidden;background:#102d40}.map-header{display:flex;gap:12px;align-items:center;padding:12px 14px;font-size:12px}.map-header span{color:#9abdc9}.map-header button{background:transparent;color:#70dbe6;border:0;cursor:pointer}.map{height:400px;background:#0b2331}</style>
