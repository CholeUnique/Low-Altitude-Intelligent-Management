<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, markRaw, type Raw } from 'vue'
import L from 'leaflet'
import { analyzeSpatialOverlay, compareSpatialGeometries, getSpatialLayers, getSpatialOverlayDetail, getSpatialOverlayGeoJson, type SpatialCollection, type SpatialDifferenceType, type SpatialLayer, type SpatialInput, type SpatialResultLegend, type SpatialSource } from '@/api/spatial-analysis'
import { annotateSpatialDifference, loadSpatialOverlayResult, spatialFilters, spatialDifferenceLabel, SPATIAL_DIFFERENCE_COLORS } from '@/utils/spatial-overlay-result'
import { geometryAnalysisResult, COVERAGE_COLORS, type SpatialAnalysisOperation, type SpatialAnalysisSummary } from '@/utils/spatial-geometry-result'
import { filterUploadedGeometry, geometryRequestInputs } from '@/utils/spatial-geometry-input'
import type { UploadedTopicLayer } from '@/utils/topic-upload'
import { createLocalId } from '@/utils/local-id'
import { featureHoverCaption } from '@/utils/feature-hover-caption'
import { bindTopicFeatureHover } from '@/utils/topic-feature-hover'
import { squareMetresToMu, muToSquareMetres, formatSquareMetresAsMu } from '@/utils/topic-area'
import { splitFarmlandOverlay, partitionUploadedRange, type FarmlandPartition, type AnalysisStatistic, type AnalysisStatistics } from '@/utils/farmland-analysis'
import TopicLayerCard from './TopicLayerCard.vue'
import TopicLayerDisplayMode from './TopicLayerDisplayMode.vue'
import { useUserStore } from '@/stores/user'
import { useFarmlandComparisonStore } from '@/stores/farmland-comparison'
interface FilterRow { id:number; field:string; op:'EQ'|'IN'; values:string }
interface Selection { label:'A'|'B'; serviceId:string; layerId:string; layers:SpatialLayer[]; filters:FilterRow[]; loading:boolean; error:string; revision:number }
interface ResultGroup extends FarmlandPartition { id:string; layer:Raw<L.GeoJSON>; visible:boolean; mode:'filled'|'boundary' }
interface Result { id:string; name:string; operation:SpatialAnalysisOperation;remote:boolean;groups?:ResultGroup[];statistics?:AnalysisStatistic[];uploadName?:string;summary:SpatialAnalysisSummary; data:Raw<SpatialCollection>; difference:Raw<SpatialCollection>; layer:Raw<L.GeoJSON>; visible:boolean; restore:string[]; details:boolean; refreshing:boolean; error:string }
const props=withDefaults(defineProps<{map:L.Map; open:boolean; context:string; sources:{id:string;name:string}[]; visibleKeys:string[];uploads?:UploadedTopicLayer[];farmland?:boolean;defaults?:{a?:SpatialInput;b?:SpatialInput};keyword?:string;layerOrder?:Record<string,number>;operation?:SpatialAnalysisOperation;loadGeometry?:(input:SpatialInput,signal:AbortSignal)=>Promise<SpatialCollection>}>(),{uploads:()=>[],operation:'difference'})
const emit=defineEmits<{close:[];upload:[];hide:[keys:string[]];restore:[keys:string[]];legend:[items:SpatialResultLegend[]];layerkeys:[keys:string[]];statistics:[items:AnalysisStatistics[]]}>()
const user=useUserStore(),comparisonStore=useFarmlandComparisonStore(),dialog=ref<HTMLDialogElement>()
const selection=(label:'A'|'B'):Selection=>({label,serviceId:'',layerId:'',layers:[],filters:[],loading:false,error:'',revision:0})
const a=reactive(selection('A')),b=reactive(selection('B')),selections=[a,b]
const rangeId=ref('')
const minAreaMu=ref<number|string>(squareMetresToMu(4))
const busy=ref(false),stage=ref(''),validation=ref(''),notice=ref(''),failed=ref(false),results=ref<Result[]>([])
const canFinish=computed(()=>!busy.value&&selections.every(side=>!side.loading&&selected(side)?.analyzable)&&(!props.farmland||!coverage.value||props.uploads.some(item=>item.id===rangeId.value&&item.analyzable)))
const coverage=computed(()=>props.operation==='coverage'),title=computed(()=>coverage.value?'范围覆盖分析':props.farmland?'高标田与永农对比分析':'对称差分 / 交集取反')
const availableUploads=computed(()=>props.uploads.filter(item=>item.analyzable))
let job=0,analysisSequence=0,filterSequence=0,controller:AbortController|undefined,toastTimer:ReturnType<typeof setTimeout>|undefined
const layerControllers=new Map<Selection,AbortController>(),detailControllers=new Set<AbortController>()
const colors=SPATIAL_DIFFERENCE_COLORS
function resultTypes(result:Result){return (result.operation==='coverage'?['INSIDE','OUTSIDE']:['A_ONLY','B_ONLY']).filter(type=>result.difference.features.some(feature=>resultType(result,feature)===type))}
function resultType(result:Pick<Result,'operation'>,feature:GeoJSON.Feature){return String(result.operation==='coverage'?feature.properties?.analysisCoverage:feature.properties?.diffType)}
function typeColor(type:string){return {...colors,...COVERAGE_COLORS}[type as keyof typeof colors|keyof typeof COVERAGE_COLORS]}
function typeLabel(type:string,summary:SpatialAnalysisSummary){return type==='INSIDE'?`位于${summary.sourceB.layerName}范围内`:type==='OUTSIDE'?`位于${summary.sourceB.layerName}范围外`:spatialDifferenceLabel(type as SpatialDifferenceType,summary)}
function publishResults(){
  if(!props.farmland){emit('legend',results.value.filter(result=>result.visible).map(result=>({id:result.id,name:result.name,symbols:resultTypes(result).map(type=>({label:typeLabel(type,result.summary),color:typeColor(type)}))})));return}
  emit('layerkeys',results.value.map(result=>`analysis:${result.id}`))
  emit('legend',results.value.filter(result=>result.groups?.some(group=>group.visible&&group.data.features.length)).map(result=>({id:result.id,name:result.name,symbols:result.groups!.filter(group=>group.visible&&group.data.features.length).map(group=>({label:group.name,color:group.color,mode:group.mode}))})))
  emit('statistics',results.value.filter(result=>result.groups?.some(group=>group.visible)).map(result=>({id:result.id,title:result.name,sources:[result.summary.sourceA.layerName,result.summary.sourceB.layerName],metrics:[...(result.statistics||[]),...(result.operation==='difference'?[{label:'差异面积',areaSqm:result.summary.diffArea},{label:'差异率',ratio:result.summary.diffRate}]:[])]})))
}
watch(()=>results.value.map(result=>[result.id,result.visible,result.summary,...(result.groups?.flatMap(group=>[group.id,group.visible,group.mode,group.color])||[])]),publishResults,{immediate:true})

function selected(side:Selection){return side.layers.find(layer=>String(layer.layerId)===side.layerId)}
function uploaded(side:Selection){return props.uploads.find(item=>`upload:${item.id}`===side.serviceId)}
function sourceKey(side:Selection){return uploaded(side)?side.serviceId:`${side.serviceId}/${side.layerId}`}
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
    const local=uploaded(side)
    if(local){side.layers=[{layerId:0,name:local.name,geometryType:local.analyzable?'POLYGON':'OTHER',analyzable:local.analyzable,fields:local.fields}];side.layerId='0';return}
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
  if(props.farmland){
    if(!props.uploads.some(item=>item.id===rangeId.value))rangeId.value=availableUploads.value[0]?.id||''
    for(const [side,preferred] of [[a,props.defaults?.a],[b,props.defaults?.b]] as const){
      if(!preferred){side.error=`未找到${side.label==='A'?'高标准农田':'永久基本农田'}基准图层，请核对场景配置和部门服务`;continue}
      side.serviceId=preferred.serviceId;await loadLayers(side)
      if(context!==props.context)return
      if(side.layers.some(layer=>layer.layerId===preferred.layerId&&layer.analyzable))side.layerId=String(preferred.layerId)
      else side.error='后端基准图层不可用于面积分析'
    }
    return
  }
  if(coverage.value){
    if(!uploaded(a)){a.serviceId=availableUploads.value[0]?`upload:${availableUploads.value[0].id}`:'';await loadLayers(a)}
    if(context!==props.context)return
    if(!b.serviceId||!props.sources.some(source=>source.id===b.serviceId)&&!uploaded(b)){const other=availableUploads.value.find(item=>`upload:${item.id}`!==a.serviceId);b.serviceId=props.sources[0]?.id||(other?`upload:${other.id}`:'');await loadLayers(b)}
    return
  }
  const preferred=props.sources.find(source=>props.visibleKeys.some(key=>key.startsWith(`${source.id}/`)))||props.sources[0]
  if(!a.serviceId||!props.sources.some(source=>source.id===a.serviceId)&&!uploaded(a)){a.serviceId=preferred?.id||'';await loadLayers(a)}
  if(context!==props.context)return
  if(!b.serviceId||!props.sources.some(source=>source.id===b.serviceId)&&!uploaded(b)){b.serviceId=a.serviceId;await loadLayers(b)}
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
  results.value.forEach(result=>result.layer.remove());results.value=[];analysisSequence=0;emit('close');notice.value='';clearTimeout(toastTimer)
}
watch(()=>props.context,clear)
watch(()=>props.defaults,()=>{if(props.farmland&&props.open&&!busy.value)void initialize()})
watch(()=>props.operation,()=>{stopWaiting(false);validation.value='';if(props.open)void initialize()})
watch(()=>props.uploads.map(item=>item.id).join(','),()=>{
  for(const side of selections)if(side.serviceId.startsWith('upload:')&&!uploaded(side)){if(busy.value){stopWaiting(false);toast('输入上传图层已移除，已停止等待分析结果',true)};side.serviceId='';side.layerId='';side.layers=[];side.filters=[]}
  if(props.open&&!busy.value)void initialize()
})
onBeforeUnmount(clear)
function toggle(result:Result){result.visible?result.layer.addTo(props.map):result.layer.remove()}
function remove(result:Result){result.layer.remove();results.value=results.value.filter(item=>item.id!==result.id)}
function download(result:Result){
  const url=URL.createObjectURL(new Blob([JSON.stringify(result.difference)],{type:'application/geo+json'}))
  const link=document.createElement('a');link.href=url;link.download=`${result.operation==='coverage'?'范围覆盖':'对称差分'}-${result.id}.geojson`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
async function refreshDetail(result:Result){
  if(result.refreshing||!result.remote)return
  const abort=new AbortController();detailControllers.add(abort);result.refreshing=true;result.error=''
  try{const detail=await getSpatialOverlayDetail(result.summary.resultId||result.id,user.activeDeptId,{signal:abort.signal});if(!abort.signal.aborted)result.summary=detail}
  catch(error){if(!abort.signal.aborted)result.error=errorText(error)}
  finally{result.refreshing=false;detailControllers.delete(abort)}
}
function display(data:SpatialCollection,summary:SpatialAnalysisSummary,restore:string[],operation:SpatialAnalysisOperation='difference',remote=true,partitions?:FarmlandPartition[],uploadName?:string){
  const difference=partitions?{type:'FeatureCollection' as const,features:partitions.filter(group=>!group.aggregate).flatMap(group=>group.data.features)}:operation==='coverage'?data:annotateSpatialDifference(data,summary)
  if(!difference.features.length&&!partitions)throw new Error('后端未返回可显示的分析图斑')
  const id=props.farmland?createLocalId():summary.resultId||createLocalId()
  if(!props.map.getPane('topic-analysis'))props.map.createPane('topic-analysis').style.zIndex='370'
  const name=props.farmland?`${operation==='coverage'?'范围覆盖分析':'高标田与永农对比分析'} ${++analysisSequence}${uploadName?` · ${uploadName}`:''}`:operation==='coverage'?`${summary.sourceA.layerName} · ${summary.sourceB.layerName}覆盖分析`:`${summary.sourceA.layerName} ↔ ${summary.sourceB.layerName}`
  function makeLayer(collection:SpatialCollection,color?:(feature:GeoJSON.Feature)=>string,mode:()=>string=()=> 'filled'){
    const style=(feature?:GeoJSON.Feature)=>{const currentColor=color?color(feature!):typeColor(resultType({operation},feature!));return {color:currentColor,fillColor:currentColor,weight:mode()==='boundary'?3:2,fillOpacity:mode()==='boundary'?0:.65}}
    const native=L.geoJSON(collection,{pane:'topic-analysis',bubblingMouseEvents:false,style,onEachFeature(feature,shape){
      const properties=feature.properties||{},type=String(properties.analysisMembership||typeLabel(resultType({operation},feature),summary))
      bindTopicFeatureHover(shape,props.map,()=>featureHoverCaption(properties,[],type),()=>native.resetStyle(shape as L.Path))
      const body=document.createElement('dl');body.className='overlay-result-properties'
      const coordinate=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(6):'—'
      const values=[['所属图层',properties.analysisSourceLayerName||summary.sourceA.layerName],['图斑序号',properties.seqNo??'—'],['结果面积',`${formatSquareMetresAsMu(properties.areaSqm)} 亩`],['中心坐标',`${coordinate(properties.centerLng)}, ${coordinate(properties.centerLat)}`]]
      values.forEach(([label,value])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=String(label);dd.textContent=String(value);row.append(dt,dd);body.appendChild(row)})
      shape.bindPopup(body,{className:'topic-analysis-popup',minWidth:280,maxWidth:310,maxHeight:260})
    }})
    return native
  }
  let layer:L.GeoJSON,groups:ResultGroup[]|undefined
  if(partitions){
    layer=L.geoJSON()
    groups=partitions.map(part=>{
      const group:ResultGroup={...part,data:markRaw(part.data),id:`analysis:${id}:${part.kind}`,layer:markRaw(L.geoJSON()),visible:!!part.data.features.length,mode:'filled'}
      group.layer=markRaw(makeLayer(group.data,()=>group.color,()=>group.mode))
      return group
    })
  }else layer=makeLayer(difference)
  try{if(difference.features.length)layer.addTo(props.map)}catch(error){layer.remove();throw error}
  if(!props.farmland)results.value.forEach(result=>{result.layer.remove();result.visible=false})
  const result:Result={id,name,operation,remote,summary,groups,statistics:partitions?.map(group=>({label:group.name,areaSqm:group.areaSqm})),uploadName,data:markRaw(data),difference:markRaw(difference),layer:markRaw(layer),visible:difference.features.length>0,restore,details:true,refreshing:false,error:''}
  if(groups) { try { syncResultLayers(result) } catch(error) { layer.remove(); throw error } }
  if(props.farmland)results.value.push(result)
  else {results.value=results.value.filter(item=>item.id!==id);results.value.unshift(result)}
  if(layer.getBounds().isValid())props.map.fitBounds(layer.getBounds(),{padding:[80,80],maxZoom:17})
  return difference.features.length
}
function syncResultLayers(result:Result){
  result.layer.clearLayers()
  const seen = new Set<string>()
  const ordered = [...(result.groups||[])].sort((a,b)=>Number(!!a.aggregate)-Number(!!b.aggregate))
  for(const group of ordered){
    if(!group.visible)continue
    const features=group.data.features.filter(feature=>{
      const key=feature.properties?.coverageAtom
      if(!key)return true
      if(seen.has(String(key)))return false
      seen.add(String(key));return true
    })
    group.layer.clearLayers();group.layer.addData({type:'FeatureCollection',features} as SpatialCollection)
    if(features.length)result.layer.addLayer(group.layer)
  }
  result.visible=!!result.groups?.some(group=>group.visible)
  if(result.visible&&!props.map.hasLayer(result.layer))result.layer.addTo(props.map)
  else if(!result.visible)result.layer.remove()
}
function toggleGroup(result:Result,group:ResultGroup,visible:boolean){
  group.visible=visible&&!!group.data.features.length
  syncResultLayers(result)
}
function groupMode(group:ResultGroup,mode:'filled'|'boundary'){group.mode=mode;group.layer.setStyle({color:group.color,fillColor:group.color,weight:mode==='boundary'?3:2,fillOpacity:mode==='boundary'?0:.65})}
function groupColor(group:ResultGroup,color:string){group.color=color;groupMode(group,group.mode)}
function groupMatches(group:ResultGroup){return !props.keyword?.trim()||group.name.toLocaleLowerCase().includes(props.keyword.trim().toLocaleLowerCase())}
function resultMatches(result:Result){return !props.keyword?.trim()||result.name.toLocaleLowerCase().includes(props.keyword.trim().toLocaleLowerCase())||result.groups?.some(groupMatches)}
function categoryMatches(result:Result,group:ResultGroup){return !props.keyword?.trim()||result.name.toLocaleLowerCase().includes(props.keyword.trim().toLocaleLowerCase())||groupMatches(group)}
function selectableGroups(result:Result){return result.groups?.filter(group=>group.data.features.length)||[]}
function resultAllSelected(result:Result){const groups=selectableGroups(result);return groups.length>0&&groups.every(group=>group.visible)}
function resultPartSelected(result:Result){return !resultAllSelected(result)&&selectableGroups(result).some(group=>group.visible)}
function selectResult(result:Result,selection:'all'|'none'){selectableGroups(result).forEach(group=>{group.visible=selection==='all'});syncResultLayers(result)}
function locateResult(result:Result){const bounds=(result.groups||[]).reduce((bounds,group)=>bounds.extend(L.geoJSON(group.data).getBounds()),L.latLngBounds([]));if(bounds.isValid())props.map.fitBounds(bounds,{padding:[80,80],maxZoom:17})}

function input(side:Selection):SpatialInput{
  const layer=selected(side)
  if(!side.serviceId||!layer?.analyzable)throw new Error(`请选择可分析的图层 ${side.label}`)
  return {serviceId:side.serviceId,layerId:layer.layerId,filters:spatialFilters(side.filters,layer.fields)}
}
async function finish(){
  if(busy.value)return
  validation.value=''
  let sourceA:SpatialInput,sourceB:SpatialInput
  const area=muToSquareMetres(Number(minAreaMu.value))
  try{
    sourceA=input(a);sourceB=input(b)
    if(coverage.value&&!props.farmland&&!uploaded(a))throw new Error('范围覆盖分析需要选择上传的面图层作为范围 U')
    if(sourceA.serviceId===sourceB.serviceId&&sourceA.layerId===sourceB.layerId)throw new Error('请选择两个不同的面图层')
    if(String(minAreaMu.value).trim()===''||!Number.isFinite(area)||area<0||area>10000)throw new Error('最小图斑面积须在 0–15 亩之间')
  }catch(error){validation.value=errorText(error);return}
  const operation=props.operation,keys=[sourceKey(a),sourceKey(b)],restore=keys.filter(key=>props.visibleKeys.includes(key)),deptId=user.activeDeptId
  const snapshot=(side:Selection):SpatialSource=>({serviceId:side.serviceId,serviceName:uploaded(side)?'本机上传':props.sources.find(source=>source.id===side.serviceId)?.name||side.serviceId,layerId:selected(side)!.layerId,layerName:selected(side)!.name,filters:spatialFilters(side.filters,selected(side)!.fields)})
  const sources={sourceA:snapshot(a),sourceB:snapshot(b)},locals=[uploaded(a),uploaded(b)],comparisonScope=comparisonStore.scope
  const request=++job,abort=new AbortController();controller=abort;busy.value=true;stage.value='正在读取完整输入图层…';notice.value='';emit('close')
  try{
    let summary:SpatialAnalysisSummary,data:SpatialCollection
    const remote=operation==='difference'&&!locals.some(Boolean)
    if(props.farmland&&operation==='coverage'){
      const range=availableUploads.value.find(item=>item.id===rangeId.value)
      if(!range)throw new Error('请选择上传的面图层作为规划范围')
      if(!props.loadGeometry)throw new Error('未配置基准图层几何读取')
      stage.value='正在读取高标田、永农完整几何…'
      const resolve=(side:Selection,input:SpatialInput)=>uploaded(side)?Promise.resolve(filterUploadedGeometry(uploaded(side)!.data,input.filters)):props.loadGeometry!(input,abort.signal)
      const [high,permanent]=await Promise.all([resolve(a,sourceA),resolve(b,sourceB)])
      const check=()=>{abort.signal.throwIfAborted();if(request!==job)throw new Error('分析上下文已变化')}
      check();stage.value='后端正在将上传范围裁切为四类区域…'
      const result=await partitionUploadedRange(filterUploadedGeometry(range.data,[]),high,permanent,area,{high:sources.sourceA,permanent:sources.sourceB,uploadName:range.name},input=>compareSpatialGeometries(input,{signal:abort.signal}),check)
      check()
      summary={...sources,areaA:result.areaSqm,areaB:0,overlapArea:0,onlyAArea:0,onlyBArea:0,diffArea:0,minAreaSqm:area,crsUsed:result.crsUsed,featureCountA:range.data.features.length,featureCountB:0,spotCount:result.partitions.filter(group=>!group.aggregate).reduce((sum,group)=>sum+group.data.features.length,0)}
      data={type:'FeatureCollection',features:result.partitions.filter(group=>!group.aggregate).flatMap(group=>group.data.features)}
      display(data,summary,restore,operation,false,result.partitions,range.name);emit('hide',[...keys,`upload:${range.id}`]);toast('范围覆盖分析完成');return
    }
    if(remote){
      stage.value=props.farmland?'后端正在执行高标田与永农对比分析…':'后端正在执行对称差分分析…'
      const response=await analyzeSpatialOverlay({deptId,sourceA,sourceB,minAreaSqm:area,includeOverlapSpots:!!props.farmland},{signal:abort.signal})
      if(request!==job)return
      summary=response;stage.value=props.farmland?'正在读取高标田、永农及交集三类图斑…':'正在读取后端差分图层及来源分类…'
      data=props.farmland?await getSpatialOverlayGeoJson(response.resultId,deptId,{signal:abort.signal}):await loadSpatialOverlayResult(response.resultId,deptId,{signal:abort.signal})
    }else{
      const resolve=async(input:SpatialInput,index:number):Promise<SpatialCollection>=>{
        const local=locals[index]
        if(local)return filterUploadedGeometry(local.data,input.filters)
        if(!props.loadGeometry)throw new Error('未配置发布图层几何读取功能')
        return props.loadGeometry(input,abort.signal)
      }
      const [geometryA,geometryB]=await Promise.all([resolve(sourceA,0),resolve(sourceB,1)])
      if(request!==job)return
      stage.value='后端正在计算交集与差集…'
      const response=await compareSpatialGeometries({...geometryRequestInputs(geometryA,geometryB),minAreaSqm:area},{signal:abort.signal})
      if(request!==job)return
      const result=geometryAnalysisResult(response,operation,sources,{a:geometryA.features.length,b:geometryB.features.length})
      summary=result.summary;data=result.data
    }
    if(request!==job)return
    if(props.farmland&&operation==='difference'){
      if(!remote)throw new Error('高标田与永农对比分析需要使用已发布的两类基准图层')
      const partitions=splitFarmlandOverlay(data,summary as import('@/api/spatial-analysis').SpatialOverlaySummary)
      display(data,summary,restore,operation,true,partitions);comparisonStore.remember(summary as import('@/api/spatial-analysis').SpatialOverlaySummary,'analysis',comparisonScope);emit('hide',keys);toast('高标田与永农对比分析完成');return
    }
    if(!data.features.length){if(operation==='difference'&&summary.diffArea>0)throw new Error('后端未返回统计中存在的不重叠区域');toast('分析完成：没有满足面积阈值的结果图斑，输入图层保持显示');return}
    display(data,summary,restore,operation,remote)
    emit('hide',keys)
    toast(operation==='coverage'?'范围覆盖分析完成：绿色为范围内，橙色为范围外；原图层已取消勾选，配置保留':`对称差分完成：一个结果图层按“仅 A / 仅 B”分色，已隐藏原始图层${summary.cached?'（命中后端缓存）':''}`)
  }catch(error){if(request===job&&!abort.signal.aborted){toast(`${operation==='coverage'?'范围覆盖':props.farmland?'高标田与永农对比':'对称差分'}分析失败：${errorText(error)}`,true);abort.abort()}}
  finally{if(request===job){controller=undefined;busy.value=false}}
}
const metrics=[['onlyAArea','A 中非 B 面积'],['onlyBArea','B 中非 A 面积'],['overlapArea','重叠面积'],['diffArea','差异面积']] as const
const coverageMetrics=[['areaA','上传范围总面积'],['overlapArea','范围内面积'],['onlyAArea','范围外面积'],['unreturnedArea','阈值未输出面积']] as const
</script>
<template>
  <div v-if="farmland" class="farmland-result-layers">
    <TopicLayerCard v-for="result in results" v-show="resultMatches(result)" :key="result.id" v-model:expanded="result.details" :title="result.name" :category-count="result.groups?.length || 0" :checked="resultAllSelected(result)" :indeterminate="resultPartSelected(result)" :disabled="!selectableGroups(result).length" class="analysis-result-group" :data-layer-key="`analysis:${result.id}`" :style="{order:layerOrder?.[`analysis:${result.id}`] ?? 10000}" @select="selectResult(result,$event?'all':'none')">
      <div class="analysis-result-children" role="group" :aria-label="`${result.name}分类`">
        <section v-for="group in result.groups" v-show="categoryMatches(result,group)" :key="group.id" class="analysis-layer-item" :data-analysis-group="group.kind">
          <label class="analysis-group-switch"><input type="checkbox" :checked="group.visible" :disabled="!group.data.features.length" :aria-label="`${group.name}显示`" @change="toggleGroup(result,group,($event.target as HTMLInputElement).checked)" /><span>{{ group.name }}</span><small>{{ group.data.features.length }}</small></label>
          <TopicLayerDisplayMode :mode="group.mode" :name="`analysis-mode-${group.id}`" :label="`${group.name}显示模式`" :color="group.color" color-editable @change="groupMode(group,$event)" @color-change="groupColor(group,$event)" />
        </section>
      </div>
      <template #actions><button type="button" :disabled="!result.difference.features.length" @click="locateResult(result)">定位</button><button type="button" @click="download(result)">导出结果图层</button><button type="button" @click="remove(result)">移除</button></template>
    </TopicLayerCard>
  </div>
  <section v-else-if="results.length" class="overlay-results" aria-label="对称差分分析结果">
    <h3>后端分析结果 <small>{{ results.length }}</small></h3>
    <div v-for="result in results" :key="result.id" class="overlay-result-row">
      <label><input v-model="result.visible" type="checkbox" :disabled="!result.difference.features.length" @change="toggle(result)" /><span :title="result.name">{{ result.operation==='coverage'?'范围覆盖结果':'不重叠区域' }}</span><small>独立图层</small></label>
      <dl class="analysis-sources"><div><dt>A 图层</dt><dd><b>{{ result.summary.sourceA.layerName }}</b><small>{{ result.summary.sourceA.serviceName }}</small></dd></div><div><dt>B 图层</dt><dd><b>{{ result.summary.sourceB.layerName }}</b><small>{{ result.summary.sourceB.serviceName }}</small></dd></div></dl>
      <div class="result-actions"><button type="button" @click="result.details=!result.details">{{ result.details?'收起统计':'面积统计' }}</button><button type="button" :disabled="!result.difference.features.length" @click="download(result)">导出结果图层</button><button type="button" :disabled="!result.restore.length" @click="emit('restore',result.restore)">恢复输入</button><button type="button" @click="remove(result)">移除</button></div>
      <div v-if="result.details" class="result-summary">
        <dl>
          <div v-for="[key,label] in result.operation==='coverage'?coverageMetrics:metrics" :key="key"><dt>{{ label }}</dt><dd><span class="metric-value">{{ formatSquareMetresAsMu(result.summary[key]) }}</span><small>亩</small></dd></div>
          <template v-if="result.operation==='coverage'"><div><dt>范围内占比</dt><dd><span class="metric-value">{{ number((result.summary.coverageRate??0)*100) }}</span><small>%</small></dd></div><div><dt>范围外占比</dt><dd><span class="metric-value">{{ number((result.summary.outsideRate??0)*100) }}</span><small>%</small></dd></div></template>
          <div v-else class="difference-rate"><dt>差异率</dt><dd><span class="metric-value">{{ result.summary.diffRate==null?'—':number(result.summary.diffRate*100) }}</span><small v-if="result.summary.diffRate!=null">%</small></dd></div>
        </dl>
        <template v-if="result.operation==='coverage'">
          <p>A / B 要素数：{{ number(result.summary.featureCountA) }} / {{ number(result.summary.featureCountB) }}<br />输出图斑数：{{ number(result.summary.spotCount) }} · 最小面积 {{ formatSquareMetresAsMu(result.summary.minAreaSqm) }} 亩<br />投影：{{ result.summary.crsUsed }}<template v-if="result.summary.costMs!=null"><br />耗时：{{ number(result.summary.costMs) }} 毫秒 · {{ result.summary.createTime }}</template></p>
          <p>A 为上传范围，B 为目标图层。结果包含 A∩B（范围内）与 A−B（范围外），不包含 B 单独存在的区域。</p>
          <div v-if="result.difference.features.length" class="result-types"><span v-for="type in resultTypes(result)" :key="type"><i :style="{background:typeColor(type)}"></i>{{ typeLabel(type,result.summary) }}</span></div>
        </template>
        <button v-if="result.remote" type="button" :disabled="result.refreshing" @click="refreshDetail(result)">{{ result.refreshing?'读取中…':'刷新后端统计' }}</button><p v-if="result.error" class="overlay-error" role="alert">{{ result.error }}</p>
      </div>
    </div>
  </section>
  <Teleport :to="map.getContainer().parentElement!">
  <dialog ref="dialog" class="overlay-dialog" aria-labelledby="overlay-title" @cancel.prevent="emit('close')" @close="emit('close')">
    <form @submit.prevent="finish">
      <header><div><small>SPATIAL ANALYSIS / {{ coverage?'COVERAGE':farmland?'FARMLAND COMPARISON':'SYMMETRICAL DIFFERENCE' }}</small><h2 id="overlay-title">{{ title }}</h2></div><button type="button" aria-label="关闭空间分析" @click="emit('close')">×</button></header>
      <div class="overlay-dialog-body">
        <div class="overlay-intro"><svg viewBox="0 0 120 64" aria-hidden="true"><path d="M10 10h62v42H10z" fill="#f8c36b55" stroke="#f8c36b"/><path d="M45 24h62v35H45z" fill="#a998ff55" stroke="#a998ff"/><path d="M45 24h27v28H45z" :fill="coverage?'#57d2a3':'#102f3b'"/></svg><div><b>{{ coverage?(farmland?'上传范围与高标田、永农的覆盖关系':'上传范围与目标图层的覆盖关系'):(farmland?'高标田与永农对比分析':'两图层对称差分（保留来源）') }}</b><p>{{ farmland?(coverage?'将上传范围裁切为仅在永农、仅在高标田、同时满足、同时不满足四类区域。':'输出高标田独有、永农独有及两者交集，分别控制显示；统计在右侧展示。'):(coverage?'将上传范围裁切为目标范围内、外两部分，显示各自面积和占比。':'输出一个不重叠区域图层：黄色为仅 A，紫色为仅 B。图例和点击详情显示具体图层名称。') }}</p></div></div>
        <p v-if="coverage&&!availableUploads.length" class="overlay-error">请先上传一个面图层。<button type="button" class="text-button" @click="emit('close');emit('upload')">上传 SHP</button></p>
        <label v-if="farmland&&coverage">上传范围 U <em>*</em><ElSelect :empty-values="[null, undefined]" :append-to="dialog" :popper-options="{ strategy: 'fixed' }" class="system-select" popper-class="system-select-options" v-model="rangeId" aria-label="上传分析范围" required><ElOption value="" disabled label="请选择上传的面图层" /><ElOption v-for="item in availableUploads" :key="item.id" :value="item.id" :label="String(item.name)" /></ElSelect></label>
        <fieldset v-for="side in selections" :key="side.label"><legend>{{ farmland?(side.label==='A'?'高标田基准数据':'永农基准数据'):`图层 ${side.label} · ${side.label==='A'?'基准数据':'对比数据'}` }}</legend>
          <div class="overlay-output-grid"><label>{{ coverage&&!farmland&&side.label==='A'?'上传范围 U':'数据来源' }} <em>*</em><ElSelect :empty-values="[null, undefined]" :append-to="dialog" :popper-options="{ strategy: 'fixed' }" class="system-select" popper-class="system-select-options" v-model="side.serviceId" required :aria-label="`图层${side.label}地图服务`" @change="loadLayers(side)"><ElOption value="" disabled label="请选择图层来源" /><optgroup v-if="farmland||!coverage||side.label==='B'" label="已发布服务"><ElOption v-for="source in sources" :key="source.id" :value="source.id" :label="String(source.name)" /></optgroup><optgroup v-if="!farmland" label="本机上传面图层"><ElOption v-for="item in availableUploads" :key="item.id" :value="`upload:${item.id}`" :label="String(item.name)" /></optgroup></ElSelect></label>
          <label>分析图层 <em>*</em><ElSelect :empty-values="[null, undefined]" :append-to="dialog" :popper-options="{ strategy: 'fixed' }" class="system-select" popper-class="system-select-options" v-model="side.layerId" required :disabled="side.loading||!side.layers.length" :aria-label="`图层${side.label}分析图层`" @change="side.filters=[]"><ElOption value="" disabled :label="String(side.loading?'正在读取后端图层…':'请选择面图层')" /><ElOption v-for="layer in side.layers" :key="layer.layerId" :value="String(layer.layerId)" :disabled="!layer.analyzable" :label="String(layer.name) + String(layer.analyzable?'':`（${layer.geometryType}，不可分析）`)" /></ElSelect></label></div>
          <p v-if="side.error" class="overlay-error" role="alert">{{ side.error }} <button type="button" class="text-button" @click="loadLayers(side)">重试</button></p>
          <div v-for="filter in side.filters" :key="filter.id" class="attribute-filter">
            <label>筛选字段<ElSelect :empty-values="[null, undefined]" :append-to="dialog" :popper-options="{ strategy: 'fixed' }" class="system-select" popper-class="system-select-options" v-model="filter.field" :aria-label="`图层${side.label}筛选字段`"><ElOption v-for="field in selected(side)?.fields||[]" :key="field.name" :value="field.name" :label="String(field.alias||field.name) + String(field.alias&&field.alias!==field.name?` · ${field.name}`:'')" /></ElSelect></label>
            <label>条件<ElSelect :empty-values="[null, undefined]" :append-to="dialog" :popper-options="{ strategy: 'fixed' }" class="system-select" popper-class="system-select-options" v-model="filter.op"><ElOption value="EQ" label="等于" /><ElOption value="IN" label="集合内" /></ElSelect></label>
            <label class="filter-values">{{ filter.op==='IN'?'取值（一行一个，最多 50 个）':'取值' }}<textarea v-if="filter.op==='IN'" v-model="filter.values" rows="2" :aria-label="`图层${side.label}筛选值`"></textarea><input v-else v-model="filter.values" :aria-label="`图层${side.label}筛选值`" /></label>
            <button type="button" class="text-button" :aria-label="`删除图层${side.label}筛选条件`" @click="side.filters=side.filters.filter(row=>row.id!==filter.id)">删除</button>
          </div>
          <button type="button" class="text-button add-filter" :disabled="!selected(side)?.analyzable||!selected(side)?.fields.length" @click="addFilter(side)">＋ 添加{{ farmland?(side.label==='A'?'高标田':'永农'):`图层 ${side.label}` }}属性筛选</button><p>未添加条件时分析整个图层；多条条件同时满足。</p>
        </fieldset>
        <fieldset><legend>输出设置</legend><label>最小结果图斑面积（亩）<input v-model="minAreaMu" type="number" required min="0" max="15" step="any" aria-label="最小差异图斑面积" /></label><p v-if="!farmland">{{ coverage?'后端输出 A∩B 和 A−B，在同一结果图层中以绿色、橙色区分；占比以完整上传范围面积为分母。':'后端输出（A − B）∪（B − A），在同一结果图层中保留 A_ONLY / B_ONLY 归属。' }} 小于阈值的碎片不输出，过滤面积单独列出。导出包含来源图层名称。</p><p>面积按后端 CGCS2000 3° 带投影计算，结果图斑以 WGS 84 显示。源数据不作修改。</p></fieldset>
        <p v-if="validation" class="overlay-error" role="alert">{{ validation }}</p>
      </div>
      <footer><span>{{ farmland?'完成后追加分类结果，右侧显示统计':coverage?'完成后显示上传范围内、外的结果':'完成后仅显示两图层不同的区域' }}</span><button type="button" @click="emit('close')">取消</button><button class="primary" type="submit" :disabled="!canFinish">Finish · 开始分析</button></footer>
    </form>
  </dialog>
    <div v-if="busy" class="overlay-running" role="status" aria-live="polite"><div class="analysis-earth" aria-hidden="true"><div class="earth-land"></div><i></i><i></i></div><div><b>后端空间分析运行中</b><span>{{ stage }}</span></div><button type="button" title="仅停止前端等待，不取消后端计算" @click="stopWaiting()">停止等待</button></div>
    <div v-if="notice" class="overlay-toast" :class="{'is-error':failed}" :role="failed?'alert':'status'"><span>{{ failed?'!':'✓' }}</span><p>{{ notice }}</p><button type="button" aria-label="关闭分析提示" @click="notice=''">×</button></div>
  </Teleport>
</template>

<style scoped>
.analysis-sources{display:grid;gap:10px;margin:12px 0;padding:10px;border:1px solid #7cafbd24;border-radius:6px;background:#103f4c44}.analysis-sources>div{display:grid;grid-template-columns:42px minmax(0,1fr);gap:8px;align-items:start}.analysis-sources dt{font-size:10px;line-height:18px;color:#77dcd7}.analysis-sources dd{margin:0;min-width:0}.analysis-sources b{display:block;font-size:12px;font-weight:500;line-height:18px;color:#d6eef2;overflow-wrap:anywhere}.analysis-sources dd small{display:block;margin-top:3px;font-size:9px;line-height:15px;color:#8eb1bf;overflow-wrap:anywhere}
.overlay-results{border-top:1px solid #7395a229;padding-top:12px;margin-bottom:14px}.overlay-results h3{display:flex;align-items:center;gap:8px;font-size:12px;margin:0 0 10px;color:#f6d69a}.overlay-results h3 small{font-size:10px;color:#bda981}.overlay-result-row{padding:8px 0;border-top:1px solid #7395a21a}.overlay-result-row label{display:flex;gap:8px;align-items:center;font-size:12px}.overlay-result-row label span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.overlay-result-row small{font-size:10px;color:#9db9c5}.overlay-result-row>div{display:flex;gap:12px;padding:8px 0 0 22px}.overlay-result-row button{border:0;padding:0;background:none;color:#8bcedb;font-size:10px;cursor:pointer}.overlay-result-row button:disabled{opacity:.35;cursor:default}
.overlay-dialog{width:620px;max-width:calc(100vw - 40px);max-height:calc(100dvh - 40px);padding:0;border:1px solid #81ccdf40;border-radius:16px;background:linear-gradient(145deg,#153c4ff5,#0b2436fa);color:#e3f2f7;box-shadow:0 30px 100px #00131c99;font-family:inherit;font-size:13px;line-height:1.6;overflow:auto;scrollbar-width:none}.overlay-dialog::backdrop{background:#00152088;backdrop-filter:blur(6px)}.overlay-dialog form{margin:0}.overlay-dialog header{display:flex;align-items:center;justify-content:space-between;padding:22px 26px;border-bottom:1px solid #94c5d524}.overlay-dialog header small{font-size:9px;letter-spacing:2px;color:#82bacb}.overlay-dialog h2{margin:4px 0 0;font-size:21px;font-weight:600}.overlay-dialog button{cursor:pointer;font:inherit;color:inherit}.overlay-dialog header button{width:32px;height:32px;border:0;border-radius:6px;background:#91cad414;font-size:24px}.overlay-dialog-body{padding:20px 26px}.overlay-intro{display:flex;align-items:center;gap:18px;padding:14px;background:#64b1c40b;border:1px solid #8ec4d216;border-radius:9px}.overlay-intro svg{width:110px;height:64px;flex:none}.overlay-intro b{font-size:13px;color:#a9e4ed}.overlay-dialog p{font-size:11px;line-height:1.8;color:#98b6c5;margin:6px 0 0}.overlay-dialog fieldset{padding:16px 0 0;margin:18px 0 0;border:0;border-top:1px solid #94c5d524;min-width:0}.overlay-dialog legend{padding:0 10px 0 0;font-size:11px;color:#79c6d9;letter-spacing:1px}.overlay-dialog label{display:block;font-size:12px;color:#bcd1dc;margin:0 0 12px}.overlay-dialog em{font-style:normal;color:#ffab88}.overlay-dialog select,.overlay-dialog input{box-sizing:border-box;display:block;width:100%;height:38px;margin-top:6px;padding:0 10px;background:#071e2d80;border:1px solid #6598ac48;border-radius:6px;color:#e1f2f8;font:inherit;outline:none}.overlay-dialog select option{background:#103144;color:#d6eaf1}.overlay-dialog select:focus,.overlay-dialog input:focus{border-color:#69cce5;box-shadow:0 0 0 3px #45bed315}.overlay-dialog input:read-only{color:#83a5b8}.overlay-output-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:14px}.overlay-dialog footer{padding:16px 26px;display:flex;align-items:center;justify-content:flex-end;gap:10px;border-top:1px solid #94c5d524;background:#021b2a30}.overlay-dialog footer span{flex:1;max-width:210px;font-size:10px;color:#87a9bc}.overlay-dialog footer button{padding:9px 13px;border:1px solid #779eb63d;background:#34576a33;border-radius:6px;font-size:12px}.overlay-dialog footer .primary{background:linear-gradient(120deg,#127fa8,#146c90);border-color:#3ea0c5}.overlay-dialog button:disabled{opacity:.4;cursor:not-allowed}.overlay-dialog .overlay-error{color:#ffb49b}.overlay-running{position:absolute;right:72px;bottom:30px;z-index:570;display:flex;align-items:center;gap:14px;width:310px;box-sizing:border-box;padding:16px;border:1px solid #76cce33d;border-radius:12px;background:#0b2c40ed;backdrop-filter:blur(16px);box-shadow:0 10px 40px #00132166;color:#d6eef8}.overlay-running>div:nth-child(2){display:grid;gap:5px;flex:1;min-width:0}.overlay-running b{font-size:12px;font-weight:500}.overlay-running span{font-size:10px;line-height:1.6;color:#93bfce}.overlay-running button,.overlay-toast button{border:0;background:none;color:#8bbaca;cursor:pointer;font:inherit;font-size:11px}.analysis-earth{position:relative;width:46px;height:46px;flex:none;border:1px solid #70def0;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 30% 25%,#1a6f86,#0b2946 75%);box-shadow:inset -8px -2px 12px #001421aa,0 0 16px #3dc9ec24}.earth-land{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 24px,#60e8d0aa 25px 34px,transparent 36px 44px);clip-path:polygon(0 20%,15% 10%,24% 25%,38% 18%,44% 36%,59% 31%,67% 16%,86% 25%,100% 42%,100% 65%,85% 63%,76% 88%,62% 65%,43% 87%,38% 61%,21% 54%,0 70%);background-size:90px 100%;animation:earth-turn 4s linear infinite}.analysis-earth i{position:absolute;inset:0 11px;border:1px solid #8edff14a;border-radius:50%}.analysis-earth i+i{inset:13px -1px}.overlay-toast{position:absolute;top:86px;left:50%;translate:-50% 0;z-index:800;display:flex;align-items:center;gap:10px;padding:13px 16px;max-width:min(560px,80%);border:1px solid #6fddc949;border-radius:9px;background:#0d3547f5;color:#d1f0ed;box-shadow:0 10px 40px #00162166}.overlay-toast>span{color:#67e1c5;font-size:18px}.overlay-toast p{margin:0;font-size:12px;line-height:1.8}.overlay-toast.is-error{border-color:#d89f784f}.overlay-toast.is-error>span{color:#ffc09c}:global(.overlay-result-properties){max-height:240px;overflow:auto;scrollbar-width:none;font-size:11px}:global(.overlay-result-properties p){margin:7px 0;overflow-wrap:anywhere}@keyframes earth-turn{to{background-position:90px 0}}@media(prefers-reduced-motion:reduce){.earth-land{animation:none}}@media(max-width:700px){.overlay-output-grid{grid-template-columns:1fr}.overlay-dialog header,.overlay-dialog-body,.overlay-dialog footer{padding:16px}.overlay-dialog footer span{display:none}.overlay-intro svg{width:70px}.overlay-running{right:60px;width:270px}}
.overlay-result-row>.result-actions{flex-wrap:wrap;gap:10px;padding-left:0}.overlay-result-row>.result-summary{display:block;padding:10px 0 0}.result-summary>p{font-size:10px;line-height:1.8;color:#9bbbc8;overflow-wrap:anywhere;margin:6px 0}.result-summary dl{display:grid;grid-template-columns:1fr 1fr;gap:9px 10px;margin:10px 0}.result-summary dl div{min-width:0}.result-summary dt{font-size:10px;color:#9bbbc8}.result-summary dd{display:flex;align-items:baseline;gap:5px;margin:4px 0 0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.result-summary .metric-value{min-width:0;font-size:16px;font-weight:600;line-height:1.4;color:#8ae8e4;overflow-wrap:anywhere}.result-summary dd small{flex:none;font-size:10px;font-weight:400;color:#91afba}.result-summary .difference-rate{grid-column:1/-1;display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding-top:10px;border-top:1px solid #7395a229}.result-summary .difference-rate dd{margin:0}.result-types{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0;font-size:10px;color:#afc9d3}.result-types span{display:flex;align-items:center;gap:5px}.result-types i{width:9px;height:9px;border-radius:2px}.overlay-dialog .text-button{padding:0;border:0;background:none;color:#8bd3e3;font-size:11px}.overlay-dialog .text-button:disabled{opacity:.4;cursor:not-allowed}.add-filter{margin-bottom:6px}.attribute-filter{display:grid;grid-template-columns:minmax(0,1fr) 90px auto;gap:10px;align-items:center;padding:12px;margin-bottom:10px;border:1px solid #83bbc329;border-radius:8px;background:#00182820}.attribute-filter .filter-values{grid-column:1/3}.attribute-filter>button{grid-column:3;grid-row:2}.overlay-dialog textarea{box-sizing:border-box;display:block;width:100%;min-width:0;margin-top:6px;padding:8px 10px;background:#071e2d80;border:1px solid #6598ac48;border-radius:6px;color:#e1f2f8;font:inherit;resize:vertical}.overlay-dialog input,.overlay-dialog select{min-width:0}.overlay-dialog .difference-option{display:flex;align-items:center;gap:8px;margin-top:20px}.overlay-dialog input[type=checkbox]{display:inline-block;width:14px;height:14px;margin:0;accent-color:#39c7d5;flex:none}.overlay-error,.overlay-dialog .overlay-error,.overlay-toast p{overflow-wrap:anywhere}.result-summary .overlay-error{color:#ffb49b}.overlay-dialog footer{position:sticky;bottom:0;background:#0c2c3ff5}.overlay-dialog fieldset{margin-top:16px}@media(max-width:700px){.attribute-filter{grid-template-columns:minmax(0,1fr) 80px auto}}
.farmland-result-layers{display:contents}.analysis-result-children{margin-left:6px;padding-left:10px;border-left:1px solid #719dad38}.analysis-layer-item{padding:4px 0 10px;min-width:0}.analysis-layer-item+.analysis-layer-item{border-top:1px solid #719dad20;padding-top:12px}.analysis-group-switch{display:flex;align-items:center;gap:7px;cursor:pointer}.analysis-group-switch>input{margin:0;width:12px;height:12px;flex:none;accent-color:#39c7d5}.analysis-group-switch>span{flex:1;min-width:0;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.analysis-group-switch>small{flex:none;color:#8fb4c1;font-size:10px;font-variant-numeric:tabular-nums}.analysis-layer-item>.layer-display-mode{margin-top:7px;padding-left:19px}

:global(.topic-analysis-popup .leaflet-popup-content-wrapper),:global(.topic-analysis-popup .leaflet-popup-tip){background:#103342f7;color:#dceff3;box-shadow:0 8px 26px #00131b66}:global(.topic-analysis-popup .leaflet-popup-content){margin:14px 16px}:global(.topic-analysis-popup .leaflet-popup-close-button){color:#bddae5}:global(.topic-analysis-popup .overlay-result-properties){margin:0;max-height:240px;overflow:auto;scrollbar-width:none;font-size:12px;line-height:1.7}:global(.topic-analysis-popup .overlay-result-properties>div){display:grid;grid-template-columns:64px minmax(0,1fr);gap:12px;padding:8px 0;border-bottom:1px solid #87b6c429}:global(.topic-analysis-popup .overlay-result-properties>div:last-child){border-bottom:0}:global(.topic-analysis-popup dt){color:#94bdc9}:global(.topic-analysis-popup dd){margin:0;color:#e2f2f6;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
</style>
