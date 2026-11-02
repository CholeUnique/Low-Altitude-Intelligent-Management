<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { listEnabledMapServices } from '@/api/map-service'
import { useUserStore } from '@/stores/user'
import { readTopicLayerCatalog } from '@/utils/topic-layer-catalog'
import { expandMapServiceSublayers, getMapServiceLayerMetadata, queryMapServiceFeatures } from '@/utils/map-service-layer'

const emit=defineEmits<{openMap:[]}>(),user=useUserStore()
interface FacilitySource {key:string;source:string;name:string;geometry:string;count:number|null;error:string}
const rows=ref<FacilitySource[]>([]),pending=ref(false),error=ref('')
let version=0
const count=computed(()=>rows.value.reduce((total,row)=>total+(row.count||0),0))
const services=computed(()=>new Set(rows.value.map(row=>row.key.split('/')[0])).size)
async function load(){
  const request=++version;pending.value=true;error.value='';rows.value=[]
  try{
    const sources=await listEnabledMapServices(user.activeDeptId)
    for(let offset=0;offset<sources.length;offset+=3){
      const groups=await Promise.all(sources.slice(offset,offset+3).map(source=>readTopicLayerCatalog(source,{expand:service=>expandMapServiceSublayers(service,true),metadata:getMapServiceLayerMetadata})))
      if(request!==version)return
      for(const entry of groups.flat().filter(item=>item.role==='facility')){
        const row:FacilitySource={key:entry.key,source:entry.sourceName,name:entry.service.name,geometry:entry.service.arcGisGeometryType==='esriGeometryPoint'?'点':entry.service.arcGisGeometryType==='esriGeometryPolyline'?'线':'面',count:null,error:entry.error}
        try{row.count=(await queryMapServiceFeatures(entry.service,['GCMC'])).features.length}
        catch(reason){row.error=reason instanceof Error?reason.message:'数据读取失败'}
        if(request!==version)return
        rows.value.push(row)
      }
    }
  }catch(reason){if(request===version)error.value=reason instanceof Error?reason.message:'工程设施读取失败'}
  finally{if(request===version)pending.value=false}
}
watch(()=>user.activeDeptId,load,{immediate:true})
onBeforeUnmount(()=>{version++})
</script>
<template>
  <section class="facilities-overview" aria-label="工程设施总览">
    <header><div><small>专题分析 / 高标准农田工程设施管理</small><h1>工程设施总览</h1><p>查看当前部门已发布的工程设施数据。</p></div><button @click="emit('openMap')">工程设施地图 →</button></header>
    <div class="facility-metrics"><div><span>设施数据服务</span><b>{{ services }}</b></div><div><span>设施图层</span><b>{{ rows.length }}</b></div><div><span>已读取设施要素</span><b>{{ count.toLocaleString() }}</b></div></div>
    <p v-if="pending" role="status">正在读取工程设施数据…</p><p v-if="error" role="alert">{{ error }} <button @click="load">重试</button></p>
    <div class="facility-sources"><h2>已发布设施图层</h2><p>名称沿用后端。要素数量按各发布图层分别统计，不代表去重后的实体设施数量。</p><table><thead><tr><th>数据服务</th><th>图层名称</th><th>几何类型</th><th>要素数量</th><th>读取状态</th></tr></thead><tbody><tr v-for="row in rows" :key="row.key"><td>{{ row.source }}</td><td>{{ row.name }}</td><td>{{ row.geometry }}</td><td>{{ row.count===null?'—':row.count.toLocaleString() }}</td><td :class="{failed:row.error}">{{ row.error||'正常' }}</td></tr></tbody></table><p v-if="!pending&&!error&&!rows.length">当前部门尚无可读取的工程设施图层。</p></div>
  </section>
</template>
<style scoped>
.facilities-overview{height:100%;box-sizing:border-box;overflow:auto;background:#082738;color:#d8edf4;padding:28px 30px}.facilities-overview header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:26px}.facilities-overview small{color:#83bdce;font-size:11px}.facilities-overview h1{font-size:24px;margin:10px 0}.facilities-overview p{font-size:12px;line-height:1.7;color:#93b7c7}.facilities-overview button{border:1px solid #327087;background:#10465c;color:#bcecf8;border-radius:6px;padding:10px 16px;cursor:pointer;white-space:nowrap}.facility-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-bottom:28px}.facility-metrics>div{display:grid;gap:14px;padding:20px 22px;border:1px solid #346378;border-radius:9px;background:#103448}.facility-metrics span{font-size:13px;color:#9fc5d4}.facility-metrics b{font-size:30px;font-variant-numeric:tabular-nums;color:#5de0df}.facility-sources{overflow:auto}.facility-sources h2{font-size:16px}.facility-sources table{border-collapse:collapse;width:100%;font-size:12px}.facility-sources th,.facility-sources td{padding:15px 12px;text-align:left;border-bottom:1px solid #285064;line-height:1.6}.facility-sources th{color:#91bacb;font-weight:500}.failed{color:#efb399}@media(max-width:900px){.facilities-overview{padding:20px}.facilities-overview header{align-items:flex-start}.facility-metrics{gap:8px}.facility-metrics>div{padding:14px}}
</style>
