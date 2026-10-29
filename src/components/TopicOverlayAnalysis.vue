<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, markRaw, type Raw } from 'vue'
import L from 'leaflet'
import { analyzeSpatialOverlay, getSpatialLayers, getSpatialOverlayDetail, type SpatialCollection, type SpatialLayer, type SpatialOverlaySummary, type SpatialInput } from '@/api/spatial-analysis'
import { loadSpatialOverlayResult, spatialFilters, spatialDifferenceFeatures } from '@/utils/spatial-overlay-result'
import { useUserStore } from '@/stores/user'
interface FilterRow { id:number; field:string; op:'EQ'|'IN'; values:string }
interface Selection { label:'A'|'B'; serviceId:string; layerId:string; layers:SpatialLayer[]; filters:FilterRow[]; loading:boolean; error:string; revision:number }
interface Result { id:string; name:string; summary:SpatialOverlaySummary; data:Raw<SpatialCollection>; difference:Raw<SpatialCollection>; layer:Raw<L.GeoJSON>; visible:boolean; restore:string[]; details:boolean; refreshing:boolean; error:string }
const props=defineProps<{map:L.Map; open:boolean; context:string; sources:{id:string;name:string}[]; visibleKeys:string[]}>()
const emit=defineEmits<{close:[];hide:[keys:string[]];restore:[keys:string[]]}>()
const user=useUserStore(),dialog=ref<HTMLDialogElement>()
const selection=(label:'A'|'B'):Selection=>({label,serviceId:'',layerId:'',layers:[],filters:[],loading:false,error:'',revision:0})
const a=reactive(selection('A')),b=reactive(selection('B')),selections=[a,b]
const minAreaSqm=ref<number|string>(4)
const busy=ref(false),stage=ref(''),validation=ref(''),notice=ref(''),failed=ref(false),results=ref<Result[]>([])
const canFinish=computed(()=>!busy.value&&selections.every(side=>!side.loading&&selected(side)?.analyzable))
let job=0,filterSequence=0,controller:AbortController|undefined,toastTimer:ReturnType<typeof setTimeout>|undefined
const layerControllers=new Map<Selection,AbortController>(),detailControllers=new Set<AbortController>()
const typeNames:Record<string,string>={DIFF:'不重叠区域'}
const colors:Record<string,string>={DIFF:'#45d9d2'}
function selected(side:Selection){return side.layers.find(layer=>String(layer.layerId)===side.layerId)}
function sourceKey(side:Selection){return `${side.serviceId}/${side.layerId}`}
function toast(message:string,isError=false){notice.value=message;failed.value=isError;clearTimeout(toastTimer);if(!isError)toastTimer=setTimeout(()=>{notice.value=''},10_000)}
function errorText(error:unknown){return error instanceof Error?error.message:'请求失败，请重试'}
function number(value:number|null|undefined){return value==null||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2})}
function addFilter(side:Selection){side.filters.push({id:++filterSequence,field:selected(side)?.fields[0]?.name||'',op:'EQ',values:''})}
async function loadLayers(side:Selection){
  layerControllers.get(side)?.abort()
  const request=++side.revision,abort=new AbortController();layerControllers.set(side,abort)
  side.layerId='';side.layers=[];side.filters=[];side.error=''
  if(!side.serviceId){side.loading=false;return}
  side.loading=true
  try{
    const layers=await getSpatialLayers(side.serviceId,user.activeDeptId,{signal:abort.signal})
    if(request!==side.revision||abort.signal.aborted)return
    if(!Array.isArray(layers))throw new Error('后端图层清单格式无效')
    side.layers=layers.map(layer=>({...layer,fields:layer.fields||[]}));side.layerId=String(layers.find(layer=>layer.analyzable)?.layerId??'')
    if(!layers.some(layer=>layer.analyzable))side.error='该服务没有可用于面积分析的面图层'
  }catch(error){if(request===side.revision&&!abort.signal.aborted)side.error=errorText(error)}
  finally{if(request===side.revision)side.loading=false}
}
async function initialize(){
  const context=props.context
  const preferred=props.sources.find(source=>props.visibleKeys.some(key=>key.startsWith(`${source.id}/`)))||props.sources[0]
  if(!a.serviceId||!props.sources.some(source=>source.id===a.serviceId)){a.serviceId=preferred?.id||'';await loadLayers(a)}
  if(context!==props.context)return
  if(!b.serviceId||!props.sources.some(source=>source.id===b.serviceId)){b.serviceId=a.serviceId;await loadLayers(b)}
  if(sourceKey(a)===sourceKey(b))b.layerId=String(b.layers.find(layer=>layer.analyzable&&String(layer.layerId)!==a.layerId)?.layerId??'')
}
watch(()=>props.open,async open=>{
  await nextTick()
  if(open){validation.value='';dialog.value?.showModal();void initialize()}else dialog.value?.close()
},{immediate:true})
function stopWaiting(notify=true){
  job++;controller?.abort();controller=undefined
  if(busy.value&&notify)toast('已停止等待；后端计算不会因此取消，输入图层保持不变')
  busy.value=false
}
function clear(){
  stopWaiting(false)
  selections.forEach(side=>{side.revision++;layerControllers.get(side)?.abort();Object.assign(side,{serviceId:'',layerId:'',layers:[],filters:[],loading:false,error:''})})
  detailControllers.forEach(abort=>abort.abort());detailControllers.clear()
  results.value.forEach(result=>result.layer.remove());results.value=[];emit('close');notice.value='';clearTimeout(toastTimer)
}
watch(()=>props.context,clear)
onBeforeUnmount(clear)
function toggle(result:Result){result.visible?result.layer.addTo(props.map):result.layer.remove()}
function remove(result:Result){result.layer.remove();results.value=results.value.filter(item=>item.id!==result.id)}
function download(result:Result){
  const url=URL.createObjectURL(new Blob([JSON.stringify(result.difference)],{type:'application/geo+json'}))
  const link=document.createElement('a');link.href=url;link.download=`对称差分-${result.id}.geojson`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
async function refreshDetail(result:Result){
  if(result.refreshing)return
  const abort=new AbortController();detailControllers.add(abort);result.refreshing=true;result.error=''
  try{const detail=await getSpatialOverlayDetail(result.id,user.activeDeptId,{signal:abort.signal});if(!abort.signal.aborted)result.summary=detail}
  catch(error){if(!abort.signal.aborted)result.error=errorText(error)}
  finally{result.refreshing=false;detailControllers.delete(abort)}
}
function display(data:SpatialCollection,summary:SpatialOverlaySummary,restore:string[]){
  const difference=spatialDifferenceFeatures(data)
  // Only the current analysis is initially visible; older results stay available in the list.
  const hidePrevious=()=>results.value.forEach(result=>{result.layer.remove();result.visible=false})
  const existing=results.value.find(result=>result.id===summary.resultId)
  if(!props.map.getPane('topic-analysis'))props.map.createPane('topic-analysis').style.zIndex='370'
  const title=`${summary.sourceA.layerName} ↔ ${summary.sourceB.layerName}`
  const layer=L.geoJSON(difference,{pane:'topic-analysis',style:{color:colors.DIFF,weight:2,fillOpacity:.35},onEachFeature(feature,shape){
    const properties=feature.properties||{},type=typeNames[String(properties.diffType)]||String(properties.diffType||'差异图斑')
    shape.bindTooltip(`${type} · ${number(properties.areaSqm)} ㎡`,{sticky:true})
    const body=document.createElement('div');body.className='overlay-result-properties'
    const heading=document.createElement('b');heading.textContent=type;body.appendChild(heading)
    for(const [label,source] of [['A',summary.sourceA],['B',summary.sourceB]] as const){const row=document.createElement('p');row.textContent=`${label} 图层：${source.layerName}（${source.serviceName}）`;body.appendChild(row)}
    const aliases:Record<string,string>={seqNo:'图斑序号',diffType:'结果类型',areaSqm:'差异面积（㎡）',partCount:'子图斑数',centerLng:'中心经度',centerLat:'中心纬度'}
    Object.entries(properties).forEach(([key,value])=>{const row=document.createElement('p');row.textContent=`${aliases[key]||key}：${key==='diffType'?type:value??'—'}`;body.appendChild(row)})
    shape.bindPopup(body,{maxWidth:320,maxHeight:260})
    shape.on('mouseover',()=>{(shape as L.Path).setStyle({weight:4})});shape.on('mouseout',()=>layer.resetStyle(shape as L.Path))
  }})
  try{if(difference.features.length)layer.addTo(props.map)}catch(error){layer.remove();throw error}
  hidePrevious()
  if(existing)results.value=results.value.filter(result=>result.id!==existing.id)
  results.value.unshift({id:summary.resultId,name:title,summary,data:markRaw(data),difference:markRaw(difference),layer:markRaw(layer),visible:difference.features.length>0,restore,details:true,refreshing:false,error:''})
  if(layer.getBounds().isValid())props.map.fitBounds(layer.getBounds(),{padding:[80,80],maxZoom:17})
  return difference.features.length
}
function input(side:Selection):SpatialInput{
  const layer=selected(side)
  if(!side.serviceId||!layer?.analyzable)throw new Error(`请选择可分析的图层 ${side.label}`)
  return {serviceId:side.serviceId,layerId:layer.layerId,filters:spatialFilters(side.filters,layer.fields)}
}
async function finish(){
  if(busy.value)return
  validation.value=''
  let sourceA:SpatialInput,sourceB:SpatialInput
  const area=Number(minAreaSqm.value)
  try{
    sourceA=input(a);sourceB=input(b)
    if(sourceA.serviceId===sourceB.serviceId&&sourceA.layerId===sourceB.layerId)throw new Error('请选择两个不同的面图层')
    if(String(minAreaSqm.value).trim()===''||!Number.isFinite(area)||area<0||area>10000)throw new Error('最小图斑面积须在 0–10,000 ㎡之间')
  }catch(error){validation.value=errorText(error);return}
  const keys=[sourceKey(a),sourceKey(b)],restore=keys.filter(key=>props.visibleKeys.includes(key)),deptId=user.activeDeptId
  const request=++job,abort=new AbortController();controller=abort;busy.value=true;stage.value='后端正在执行对称差分分析…';notice.value='';emit('close')
  try{
    const summary=await analyzeSpatialOverlay({deptId,sourceA,sourceB,minAreaSqm:area,includeOverlapSpots:false},{signal:abort.signal})
    if(request!==job)return
    stage.value='正在读取后端独立不重叠区域图层…'
    const data=await loadSpatialOverlayResult(summary.resultId,deptId,{signal:abort.signal})
    if(request!==job)return
    display(data,summary,restore)
    emit('hide',keys)
    toast(`对称差分完成：已显示独立的不重叠区域图层，已隐藏原始图层${summary.cached?'（命中后端缓存）':''}`)
  }catch(error){if(request===job&&!abort.signal.aborted)toast(`对称差分分析失败：${errorText(error)}`,true)}
  finally{if(request===job){controller=undefined;busy.value=false}}
}
const metrics=[['areaA','A 图层面积'],['areaB','B 图层面积'],['overlapArea','重叠面积'],['onlyAArea','仅 A 面积'],['onlyBArea','仅 B 面积'],['diffArea','差异面积'],['diffAreaRaw','过滤前差异面积']] as const
</script>
<template>
  <section v-if="results.length" class="overlay-results" aria-label="对称差分分析结果">
    <h3>后端分析结果 <small>{{ results.length }}</small></h3>
    <div v-for="result in results" :key="result.id" class="overlay-result-row">
      <label><input v-model="result.visible" type="checkbox" :disabled="!result.difference.features.length" @change="toggle(result)" /><span :title="result.name">不重叠区域</span><small>独立图层</small></label>
      <dl class="analysis-sources"><div><dt>A 图层</dt><dd><b>{{ result.summary.sourceA.layerName }}</b><small>{{ result.summary.sourceA.serviceName }}</small></dd></div><div><dt>B 图层</dt><dd><b>{{ result.summary.sourceB.layerName }}</b><small>{{ result.summary.sourceB.serviceName }}</small></dd></div></dl>
      <div class="result-actions"><button type="button" @click="result.details=!result.details">{{ result.details?'收起统计':'面积统计' }}</button><button type="button" :disabled="!result.difference.features.length" @click="download(result)">导出差异图层</button><button type="button" :disabled="!result.restore.length" @click="emit('restore',result.restore)">恢复输入</button><button type="button" @click="remove(result)">移除</button></div>
      <div v-if="result.details" class="result-summary">
        <p>结果编号 {{ result.id }} <span v-if="result.summary.cached">· 后端缓存</span></p>
        <dl><div v-for="[key,label] in metrics" :key="key"><dt>{{ label }}</dt><dd>{{ number(result.summary[key]) }}<small>㎡</small></dd></div><div><dt>差异率</dt><dd>{{ result.summary.diffRate==null?'—':`${number(result.summary.diffRate*100)}%` }}</dd></div></dl>
        <p>A / B 要素数：{{ number(result.summary.featureCountA) }} / {{ number(result.summary.featureCountB) }}<br />输出图斑数：{{ number(result.summary.spotCount) }} · 最小面积 {{ number(result.summary.minAreaSqm) }} ㎡<br />投影：{{ result.summary.crsUsed }}<br />耗时：{{ number(result.summary.costMs) }} 毫秒 · {{ result.summary.createTime }}</p>
        <p>地图显示后端合并的不重叠区域图层，不显示原始 A、B 图层及交集。</p>
        <div v-if="result.difference.features.length" class="result-types"><span><i :style="{background:colors.DIFF}"></i>不重叠区域</span></div>
        <button type="button" :disabled="result.refreshing" @click="refreshDetail(result)">{{ result.refreshing?'读取中…':'刷新后端统计' }}</button><p v-if="result.error" class="overlay-error" role="alert">{{ result.error }}</p>
      </div>
    </div>
  </section>
  <dialog ref="dialog" class="overlay-dialog" aria-labelledby="overlay-title" @cancel.prevent="emit('close')" @close="emit('close')">
    <form @submit.prevent="finish">
      <header><div><small>SPATIAL ANALYSIS / SYMMETRICAL DIFFERENCE</small><h2 id="overlay-title">对称差分 / 交集取反</h2></div><button type="button" aria-label="关闭对称差分分析" @click="emit('close')">×</button></header>
      <div class="overlay-dialog-body">
        <div class="overlay-intro"><svg viewBox="0 0 120 64" aria-hidden="true"><path d="M10 10h62v42H10z" fill="#31b8cd33" stroke="#56d6e9"/><path d="M45 24h62v35H45z" fill="#f8c36b33" stroke="#f8c36b"/><path d="M45 24h27v28H45z" fill="#102f3b"/></svg><div><b>两图层对称差分（交集取反）</b><p>由后端生成独立的不重叠区域图层，去掉共同区域；成功后自动隐藏原始图层。</p></div></div>
        <fieldset v-for="side in selections" :key="side.label"><legend>图层 {{ side.label }} · {{ side.label==='A'?'基准数据':'对比数据' }}</legend>
          <div class="overlay-output-grid"><label>地图服务 <em>*</em><select v-model="side.serviceId" required :aria-label="`图层${side.label}地图服务`" @change="loadLayers(side)"><option value="" disabled>请选择地图服务</option><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option></select></label>
          <label>分析图层 <em>*</em><select v-model="side.layerId" required :disabled="side.loading||!side.layers.length" :aria-label="`图层${side.label}分析图层`" @change="side.filters=[]"><option value="" disabled>{{ side.loading?'正在读取后端图层…':'请选择面图层' }}</option><option v-for="layer in side.layers" :key="layer.layerId" :value="String(layer.layerId)" :disabled="!layer.analyzable">{{ layer.name }}{{ layer.analyzable?'':`（${layer.geometryType}，不可分析）` }}</option></select></label></div>
          <p v-if="side.error" class="overlay-error" role="alert">{{ side.error }} <button type="button" class="text-button" @click="loadLayers(side)">重试</button></p>
          <div v-for="filter in side.filters" :key="filter.id" class="attribute-filter">
            <label>筛选字段<select v-model="filter.field" :aria-label="`图层${side.label}筛选字段`"><option v-for="field in selected(side)?.fields||[]" :key="field.name" :value="field.name">{{ field.alias||field.name }}{{ field.alias&&field.alias!==field.name?` · ${field.name}`:'' }}</option></select></label>
            <label>条件<select v-model="filter.op"><option value="EQ">等于</option><option value="IN">集合内</option></select></label>
            <label class="filter-values">{{ filter.op==='IN'?'取值（一行一个，最多 50 个）':'取值' }}<textarea v-if="filter.op==='IN'" v-model="filter.values" rows="2" :aria-label="`图层${side.label}筛选值`"></textarea><input v-else v-model="filter.values" :aria-label="`图层${side.label}筛选值`" /></label>
            <button type="button" class="text-button" :aria-label="`删除图层${side.label}筛选条件`" @click="side.filters=side.filters.filter(row=>row.id!==filter.id)">删除</button>
          </div>
          <button type="button" class="text-button add-filter" :disabled="!selected(side)?.analyzable||!selected(side)?.fields.length" @click="addFilter(side)">＋ 添加图层 {{ side.label }} 属性筛选</button><p>未添加条件时分析整个图层；多条条件同时满足。</p>
        </fieldset>
        <fieldset><legend>输出设置</legend><label>最小差异图斑面积（㎡）<input v-model="minAreaSqm" type="number" required min="0" max="10000" step="any" aria-label="最小差异图斑面积" /></label><p>后端合并输出（A − B）∪（B − A），作为独立的不重叠区域图层。小于阈值的碎片不输出；设为 0 保留全部差异。左侧保留完整面积统计。</p><p>面积按后端 CGCS2000 3° 带投影计算，结果图斑以 WGS 84 显示。源数据不作修改。</p></fieldset>
        <p v-if="validation" class="overlay-error" role="alert">{{ validation }}</p>
      </div>
      <footer><span>完成后仅显示两图层不同的区域</span><button type="button" @click="emit('close')">取消</button><button class="primary" type="submit" :disabled="!canFinish">Finish · 开始分析</button></footer>
    </form>
  </dialog>
  <Teleport :to="map.getContainer().parentElement!">
    <div v-if="busy" class="overlay-running" role="status" aria-live="polite"><div class="analysis-earth" aria-hidden="true"><div class="earth-land"></div><i></i><i></i></div><div><b>后端对称差分分析运行中</b><span>{{ stage }}</span></div><button type="button" title="仅停止前端等待，不取消后端计算" @click="stopWaiting()">停止等待</button></div>
    <div v-if="notice" class="overlay-toast" :class="{'is-error':failed}" :role="failed?'alert':'status'"><span>{{ failed?'!':'✓' }}</span><p>{{ notice }}</p><button type="button" aria-label="关闭分析提示" @click="notice=''">×</button></div>
  </Teleport>
</template>

<style scoped>
.analysis-sources{display:grid;gap:10px;margin:12px 0;padding:10px;border:1px solid #7cafbd24;border-radius:6px;background:#103f4c44}.analysis-sources>div{display:grid;grid-template-columns:42px minmax(0,1fr);gap:8px;align-items:start}.analysis-sources dt{font-size:10px;line-height:18px;color:#77dcd7}.analysis-sources dd{margin:0;min-width:0}.analysis-sources b{display:block;font-size:12px;font-weight:500;line-height:18px;color:#d6eef2;overflow-wrap:anywhere}.analysis-sources dd small{display:block;margin-top:3px;font-size:9px;line-height:15px;color:#8eb1bf;overflow-wrap:anywhere}
.overlay-results{border-top:1px solid #7395a229;padding-top:12px;margin-bottom:14px}.overlay-results h3{display:flex;align-items:center;gap:8px;font-size:12px;margin:0 0 10px;color:#f6d69a}.overlay-results h3 small{font-size:10px;color:#bda981}.overlay-result-row{padding:8px 0;border-top:1px solid #7395a21a}.overlay-result-row label{display:flex;gap:8px;align-items:center;font-size:12px}.overlay-result-row label span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.overlay-result-row small{font-size:10px;color:#9db9c5}.overlay-result-row>div{display:flex;gap:12px;padding:8px 0 0 22px}.overlay-result-row button{border:0;padding:0;background:none;color:#8bcedb;font-size:10px;cursor:pointer}.overlay-result-row button:disabled{opacity:.35;cursor:default}
.overlay-dialog{width:620px;max-width:calc(100vw - 40px);max-height:calc(100dvh - 40px);padding:0;border:1px solid #81ccdf40;border-radius:16px;background:linear-gradient(145deg,#153c4ff5,#0b2436fa);color:#e3f2f7;box-shadow:0 30px 100px #00131c99;font-family:inherit;font-size:13px;line-height:1.6;overflow:auto;scrollbar-width:none}.overlay-dialog::backdrop{background:#00152088;backdrop-filter:blur(6px)}.overlay-dialog form{margin:0}.overlay-dialog header{display:flex;align-items:center;justify-content:space-between;padding:22px 26px;border-bottom:1px solid #94c5d524}.overlay-dialog header small{font-size:9px;letter-spacing:2px;color:#82bacb}.overlay-dialog h2{margin:4px 0 0;font-size:21px;font-weight:600}.overlay-dialog button{cursor:pointer;font:inherit;color:inherit}.overlay-dialog header button{width:32px;height:32px;border:0;border-radius:6px;background:#91cad414;font-size:24px}.overlay-dialog-body{padding:20px 26px}.overlay-intro{display:flex;align-items:center;gap:18px;padding:14px;background:#64b1c40b;border:1px solid #8ec4d216;border-radius:9px}.overlay-intro svg{width:110px;height:64px;flex:none}.overlay-intro b{font-size:13px;color:#a9e4ed}.overlay-dialog p{font-size:11px;line-height:1.8;color:#98b6c5;margin:6px 0 0}.overlay-dialog fieldset{padding:16px 0 0;margin:18px 0 0;border:0;border-top:1px solid #94c5d524;min-width:0}.overlay-dialog legend{padding:0 10px 0 0;font-size:11px;color:#79c6d9;letter-spacing:1px}.overlay-dialog label{display:block;font-size:12px;color:#bcd1dc;margin:0 0 12px}.overlay-dialog em{font-style:normal;color:#ffab88}.overlay-dialog select,.overlay-dialog input{box-sizing:border-box;display:block;width:100%;height:38px;margin-top:6px;padding:0 10px;background:#071e2d80;border:1px solid #6598ac48;border-radius:6px;color:#e1f2f8;font:inherit;outline:none}.overlay-dialog select option{background:#103144;color:#d6eaf1}.overlay-dialog select:focus,.overlay-dialog input:focus{border-color:#69cce5;box-shadow:0 0 0 3px #45bed315}.overlay-dialog input:read-only{color:#83a5b8}.overlay-output-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:14px}.overlay-dialog footer{padding:16px 26px;display:flex;align-items:center;justify-content:flex-end;gap:10px;border-top:1px solid #94c5d524;background:#021b2a30}.overlay-dialog footer span{flex:1;max-width:210px;font-size:10px;color:#87a9bc}.overlay-dialog footer button{padding:9px 13px;border:1px solid #779eb63d;background:#34576a33;border-radius:6px;font-size:12px}.overlay-dialog footer .primary{background:linear-gradient(120deg,#127fa8,#146c90);border-color:#3ea0c5}.overlay-dialog button:disabled{opacity:.4;cursor:not-allowed}.overlay-dialog .overlay-error{color:#ffb49b}.overlay-running{position:absolute;right:72px;bottom:30px;z-index:570;display:flex;align-items:center;gap:14px;width:310px;box-sizing:border-box;padding:16px;border:1px solid #76cce33d;border-radius:12px;background:#0b2c40ed;backdrop-filter:blur(16px);box-shadow:0 10px 40px #00132166;color:#d6eef8}.overlay-running>div:nth-child(2){display:grid;gap:5px;flex:1;min-width:0}.overlay-running b{font-size:12px;font-weight:500}.overlay-running span{font-size:10px;line-height:1.6;color:#93bfce}.overlay-running button,.overlay-toast button{border:0;background:none;color:#8bbaca;cursor:pointer;font:inherit;font-size:11px}.analysis-earth{position:relative;width:46px;height:46px;flex:none;border:1px solid #70def0;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 30% 25%,#1a6f86,#0b2946 75%);box-shadow:inset -8px -2px 12px #001421aa,0 0 16px #3dc9ec24}.earth-land{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 24px,#60e8d0aa 25px 34px,transparent 36px 44px);clip-path:polygon(0 20%,15% 10%,24% 25%,38% 18%,44% 36%,59% 31%,67% 16%,86% 25%,100% 42%,100% 65%,85% 63%,76% 88%,62% 65%,43% 87%,38% 61%,21% 54%,0 70%);background-size:90px 100%;animation:earth-turn 4s linear infinite}.analysis-earth i{position:absolute;inset:0 11px;border:1px solid #8edff14a;border-radius:50%}.analysis-earth i+i{inset:13px -1px}.overlay-toast{position:absolute;top:86px;left:50%;translate:-50% 0;z-index:800;display:flex;align-items:center;gap:10px;padding:13px 16px;max-width:min(560px,80%);border:1px solid #6fddc949;border-radius:9px;background:#0d3547f5;color:#d1f0ed;box-shadow:0 10px 40px #00162166}.overlay-toast>span{color:#67e1c5;font-size:18px}.overlay-toast p{margin:0;font-size:12px;line-height:1.8}.overlay-toast.is-error{border-color:#d89f784f}.overlay-toast.is-error>span{color:#ffc09c}:global(.overlay-result-properties){max-height:240px;overflow:auto;scrollbar-width:none;font-size:11px}:global(.overlay-result-properties p){margin:7px 0;overflow-wrap:anywhere}@keyframes earth-turn{to{background-position:90px 0}}@media(prefers-reduced-motion:reduce){.earth-land{animation:none}}@media(max-width:700px){.overlay-output-grid{grid-template-columns:1fr}.overlay-dialog header,.overlay-dialog-body,.overlay-dialog footer{padding:16px}.overlay-dialog footer span{display:none}.overlay-intro svg{width:70px}.overlay-running{right:60px;width:270px}}
.overlay-result-row>.result-actions{flex-wrap:wrap;gap:10px;padding-left:0}.overlay-result-row>.result-summary{display:block;padding:10px 0 0}.result-summary>p{font-size:10px;line-height:1.8;color:#9bbbc8;overflow-wrap:anywhere;margin:6px 0}.result-summary dl{display:grid;grid-template-columns:1fr 1fr;gap:9px 10px;margin:10px 0}.result-summary dl div{min-width:0}.result-summary dt{font-size:10px;color:#9bbbc8}.result-summary dd{font-size:13px;color:#c9eef3;margin:3px 0 0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.result-summary dd small{font-size:9px;color:#90b0bd;margin-left:4px}.result-types{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0;font-size:10px;color:#afc9d3}.result-types span{display:flex;align-items:center;gap:5px}.result-types i{width:9px;height:9px;border-radius:2px}.overlay-dialog .text-button{padding:0;border:0;background:none;color:#8bd3e3;font-size:11px}.overlay-dialog .text-button:disabled{opacity:.4;cursor:not-allowed}.add-filter{margin-bottom:6px}.attribute-filter{display:grid;grid-template-columns:minmax(0,1fr) 90px auto;gap:10px;align-items:center;padding:12px;margin-bottom:10px;border:1px solid #83bbc329;border-radius:8px;background:#00182820}.attribute-filter .filter-values{grid-column:1/3}.attribute-filter>button{grid-column:3;grid-row:2}.overlay-dialog textarea{box-sizing:border-box;display:block;width:100%;min-width:0;margin-top:6px;padding:8px 10px;background:#071e2d80;border:1px solid #6598ac48;border-radius:6px;color:#e1f2f8;font:inherit;resize:vertical}.overlay-dialog input,.overlay-dialog select{min-width:0}.overlay-dialog .difference-option{display:flex;align-items:center;gap:8px;margin-top:20px}.overlay-dialog input[type=checkbox]{display:inline-block;width:14px;height:14px;margin:0;accent-color:#39c7d5;flex:none}.overlay-error,.overlay-dialog .overlay-error,.overlay-toast p{overflow-wrap:anywhere}.result-summary .overlay-error{color:#ffb49b}.overlay-dialog footer{position:sticky;bottom:0;background:#0c2c3ff5}.overlay-dialog fieldset{margin-top:16px}@media(max-width:700px){.attribute-filter{grid-template-columns:minmax(0,1fr) 80px auto}}
</style>
