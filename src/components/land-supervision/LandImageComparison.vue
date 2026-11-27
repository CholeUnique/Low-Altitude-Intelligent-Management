<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import type { MapServiceItem } from '@/api/map-service'
import type { LandGeometry } from '@/types/land-supervision'
const props=defineProps<{geometry:LandGeometry;services:MapServiceItem[];beforeId?:string;afterId?:string}>()
const emit=defineEmits<{close:[];choose:[before:string,after:string]}>()
const before=ref(props.beforeId||''),after=ref(props.afterId||''),view=ref<{center:[number,number];zoom:number}>()
watch(()=>props.beforeId,id=>{before.value=id||''})
watch(()=>props.afterId,id=>{after.value=id||''})
const geometry=computed(()=>({type:'FeatureCollection' as const,features:[{type:'Feature' as const,geometry:props.geometry,properties:{}}]}))
</script>
<template><Teleport to="body"><div class="land-dialog-mask" data-map-labels="layer"><section class="land-dialog land-comparison" role="dialog" aria-modal="true" aria-label="历史影像对比"><header><h2>历史影像对比</h2><button aria-label="关闭影像对比" @click="emit('close')">×</button></header><div class="land-comparison-grid"><figure v-for="side in ['before','after']" :key="side"><label>{{ side==='before'?'前期影像':'后期影像' }}<ElSelect v-if="side==='before'" v-model="before" class="system-select" popper-class="system-select-options" placeholder="请选择前期影像" aria-label="前期影像"><ElOption v-for="service in services" :key="String(service.id)" :value="String(service.id)" :label="service.name" /></ElSelect><ElSelect v-else v-model="after" class="system-select" popper-class="system-select-options" placeholder="请选择后期影像" aria-label="后期影像"><ElOption v-for="service in services" :key="String(service.id)" :value="String(service.id)" :label="service.name" /></ElSelect></label><div class="land-comparison-map"><TaskRangeMap :geo-json="geometry" :show-dom-imagery="true" :imagery-service="services.find(s=>String(s.id)===(side==='before'?before:after))" :view="view" @view-change="view=$event" /></div></figure></div><p v-if="!services.length" role="status">当前部门暂无可用影像服务，请先配置背景影像。</p><footer><button @click="emit('close')">取消</button><button class="primary" :disabled="!before||!after||before===after" @click="emit('choose',before,after)">采用这两期影像</button></footer></section></div></Teleport></template>
<style scoped>.land-comparison{width:min(1180px,95vw)!important}.land-comparison-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.land-comparison-grid figure{margin:0;min-width:0}.land-comparison-map{height:45vh;min-height:250px;margin-top:10px}.land-comparison p{font-size:12px;color:#b5cede}@media(max-width:750px){.land-comparison-grid{grid-template-columns:1fr}.land-comparison-map{height:28vh;min-height:180px}}</style>
