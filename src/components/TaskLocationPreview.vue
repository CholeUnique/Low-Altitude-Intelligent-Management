<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TaskRangeMap from './TaskRangeMap.vue'
import type { TaskGeometryFeatureCollection } from '@/api/governance-task'
import { geometryLocation } from '@/utils/geometry-location'
import { cgcs2000Coordinate } from '@/utils/location-coordinate'
import NavigationQrDialog from '@/workspace-components/spot-identification/NavigationQrDialog.vue'
import { Guide } from '@element-plus/icons-vue'
const props = withDefaults(defineProps<{ geoJson?: TaskGeometryFeatureCollection; title?: string; loading?: boolean; error?: string; cgcs2000?:boolean; navigation?:boolean; destinationName?:string }>(), { title: '任务位置' })
const location = computed(() => geometryLocation(props.geoJson))
const displayLocation=computed(()=>location.value&&(props.cgcs2000?cgcs2000Coordinate(location.value.lng,location.value.lat):location.value))
const navigationTarget=ref<{longitude:number;latitude:number;address:string}>()
function navigate(){if(location.value)navigationTarget.value={longitude:location.value.lng,latitude:location.value.lat,address:props.destinationName||props.title}}
watch(()=>props.geoJson,()=>{navigationTarget.value=undefined})
</script>
<template>
  <section class="task-location-preview" :aria-label="title">
    <header><b>{{ title }}</b><small>{{ cgcs2000?'CGCS2000 · EPSG:4490':'WGS84' }}</small></header>
    <div v-if="loading" class="location-empty" role="status">正在读取位置…</div>
    <template v-else-if="location && displayLocation && geoJson"><div class="location-map"><TaskRangeMap :geo-json="geoJson" basemap="vector" :show-abnormal="false" :fit-padding="16" /></div><p class="location-coordinates"><span>{{ location.west === location.east && location.south === location.north ? '位置坐标' : '范围中心坐标' }}</span><b>经度 {{ displayLocation.lng.toFixed(6) }}°</b><b>纬度 {{ displayLocation.lat.toFixed(6) }}°</b></p><button v-if="navigation" type="button" class="location-navigate" @click="navigate"><Guide/>去导航 · 三地图扫码</button></template>
    <p v-else class="location-empty">{{ error || '暂无真实位置数据' }}</p>
  </section>
  <NavigationQrDialog v-if="navigationTarget" :target="navigationTarget" @close="navigationTarget=undefined" />
</template>
<style scoped>
.task-location-preview{min-width:0;box-sizing:border-box;overflow:hidden;border:1px solid #548ca654;border-radius:8px;background:#0c3044;color:#d7edf6;font:12px/1.5 var(--ui-font)}header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px}header b{font-size:14px}small{font-size:12px;color:#9cbaca}.location-map{height:180px;position:relative}.location-map :deep(.task-range-map){min-height:0}.location-map :deep(.range-tools){top:8px;right:8px}.location-map :deep(.range-tools button){padding:3px 8px}.location-coordinates{display:flex;flex-wrap:wrap;gap:3px 10px;margin:0;padding:8px 10px;color:#9fbdce}.location-coordinates span{width:100%}.location-coordinates b{font-size:12px;font-weight:500;color:#82e6ed;font-variant-numeric:tabular-nums;white-space:nowrap}.location-empty{padding:20px 12px;margin:0;color:#a6c4d3}
</style>
<style scoped>
.location-navigate{display:flex;align-items:center;justify-content:center;gap:6px;width:calc(100% - 20px);margin:0 10px 10px;padding:8px 10px;background:#0f566f;border:1px solid #42b3cb;border-radius:6px;color:#dbfaff;font:12px var(--ui-font);cursor:pointer}.location-navigate svg{width:17px;height:17px}.location-navigate:hover{background:#126e88}
</style>
