<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Raw } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FullScreen, Setting, Close, Collection, Refresh, Search, Upload } from '@element-plus/icons-vue'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import { useUserStore } from '@/stores/user'
import TopicLayerCard from '@/components/TopicLayerCard.vue'
import TopicSelectionCheckbox from '@/components/TopicSelectionCheckbox.vue'
import TopicLayerDisplayMode from '@/components/TopicLayerDisplayMode.vue'
import TopicFeatureDetails from '@/components/TopicFeatureDetails.vue'
import TopicAnalysisStatistics from '@/components/TopicAnalysisStatistics.vue'
import { farmlandDefaults, type AnalysisStatistics } from '@/utils/farmland-analysis'
import TopicStatisticsSummary from '@/components/TopicStatisticsSummary.vue'
import TopicMapToolbar from '@/components/TopicMapToolbar.vue'
import TopicOverlayAnalysis from '@/components/TopicOverlayAnalysis.vue'
import TopicUploadedLayers from '@/components/TopicUploadedLayers.vue'
import type { UploadedTopicLayer } from '@/utils/topic-upload'
import type { DrawingLayerInput } from '@/utils/map-drawing'
import type { SpatialAnalysisOperation } from '@/utils/spatial-geometry-result'
import { readPublishedSpatialGeometry } from '@/utils/spatial-geometry-input'
import TopicMapLegend from '@/components/TopicMapLegend.vue'
import type { SpatialResultLegend, SpatialInput, SpatialCollection } from '@/api/spatial-analysis'
import OverviewMapScale from '@/components/OverviewMapScale.vue'
import { identifyVectorFeatures, setMapHoverSelection, type IdentifiedMapFeature } from '@/utils/map-service-layer'
import { HIGH_STANDARD_TOPIC_ID, FACILITIES_TOPIC_ID, useGeographicTopicsStore, type GeographicTopic } from '@/stores/geographic-topics'
import { createMapServiceLayer, createAdministrativeBoundaryLayer, expandMapServiceSublayers, getMapServiceLayerMetadata, queryMapServiceFeatures, MAP_SERVICE_IMAGERY_PANE, MAP_SERVICE_VECTOR_PANE, type MapServiceLayerHandle } from '@/utils/map-service-layer'
import { resolveC5Style, c5Pattern, type C5Style } from '@/utils/land-survey-c5'
import { createTopicRenderer, type TopicDisplayMode } from '@/utils/topic-renderer'
import { categoryWhere, type TopicRole } from '@/utils/geographic-topic'
import { readTopicLayerCatalog, topicStatSources, groupTopicLayers } from '@/utils/topic-layer-catalog'
import { facilityCategoryFromName } from '@/utils/facility-category'
import { createTopicFeatureHover, type TopicHoverTarget } from '@/utils/topic-feature-hover'
import { runRegionClip,regionClipKey,RegionClipIntegrityError,type RegionClipResultLayer } from '@/utils/region-clip'
import type { RegionClipRequest } from '@/api/region-clip'
import { createRegionClipLayer } from '@/utils/region-clip-layer'
import TopicRegionStatistics from '@/components/TopicRegionStatistics.vue'
import TopicAnalysisProgress from '@/components/TopicAnalysisProgress.vue'
import { calculateRegionStatistic,type RegionStatisticRow,type RegionGeometry } from '@/utils/region-statistics'
import { matchesTopicText,matchesTopicProperties,topicSearchCategories,indexTopicProperties,matchingTopicPropertyRows,type TopicPropertySearchRow } from '@/utils/topic-layer-search'

interface Category { value: string; name: string; count: number; checked: boolean; style?: C5Style; color?: string; mode?: TopicDisplayMode }
interface TopicLayer { key: string; service: MapServiceItem; sourceName: string; role: TopicRole; fields: string[]; categoryField: string; categories: Category[]; visible: boolean; analysisHidden: boolean; pending: boolean; error: string; ready: boolean; mode: TopicDisplayMode; handle?: Raw<MapServiceLayerHandle> }
const user = useUserStore()
const props = defineProps<{topic: GeographicTopic}>()
const isFarmland=computed(()=>props.topic.id===HIGH_STANDARD_TOPIC_ID)
const analysisStatistics=ref<AnalysisStatistics[]>([])
const detailLayerOrder=ref<Record<string,number>>({})
let nextAddedLayerOrder=10000
function rememberAddedLayers(keys:string[]){for(const key of keys)if(detailLayerOrder.value[key]===undefined)detailLayerOrder.value[key]=nextAddedLayerOrder++}
function updateUploads(items:UploadedTopicLayer[]){uploadedLayers.value=items;rememberAddedLayers(items.map(item=>`upload:${item.id}`))}
const topicStore = useGeographicTopicsStore()
const root = ref<HTMLElement>(), canvas = ref<HTMLElement>()
const legendSpace = ref(22)
let legendResizeObserver: ResizeObserver | undefined
async function observeLegend() {
  await nextTick()
  legendResizeObserver?.disconnect()
  const legend = root.value?.querySelector<HTMLElement>('.map-symbol-legend')
  if (!legend) { legendSpace.value = 22; return }
  const update = () => { legendSpace.value = legend.offsetHeight + 24 }
  legendResizeObserver = new ResizeObserver(update)
  legendResizeObserver.observe(legend)
  update()
}
const layers = ref<TopicLayer[]>([])
const legendCollapsed=ref(false)
const analysisLegend=ref<SpatialResultLegend[]>([])
const configOpen = ref(false), overlayOpen = ref(false), pending = ref(false), error = ref('')
const uploadPanel=ref<InstanceType<typeof TopicUploadedLayers>>(),uploadedLayers=shallowRef<UploadedTopicLayer[]>([]),uploadDialogOpen=ref(false),overlayOperation=ref<SpatialAnalysisOperation>('difference')
const uploadScope=computed(()=>`${user.currentUser?.id||user.currentUser?.username||'anonymous'}:${user.activeDeptId}:${props.topic.id}`)
let resumeCoverage=false
async function openUpload(resume=false){resumeCoverage=resume;overlayOpen.value=false;configOpen.value=false;await nextTick();await uploadPanel.value?.open()}
async function uploaded(){legendCollapsed.value=false;if(resumeCoverage){resumeCoverage=false;await nextTick();openOverlay('coverage')}}
async function loadDrawing(input:DrawingLayerInput){
  if(!uploadPanel.value)throw new Error('图层管理尚未就绪，请稍后再试')
  await uploadPanel.value.addDrawings(input)
  legendCollapsed.value=false;layerKeyword.value=''
}
const fullscreen = ref(false)
const toolsMap = ref<Raw<L.Map>>(), drawingToolActive = ref(false)
const businessBatchPending = ref(false)
const regionClipSources=ref<string[]>([])
const regionClipActive=computed(()=>isFarmland.value&&regionClipSources.value.length>0)
const regionClipBusy=ref(false),regionClipError=ref(''),regionClipMessage=ref('')
const regionClipProgress=ref<number>(),regionStatisticsProgress=ref<number>()
const regionClipStates=shallowRef<Record<string,RegionClipResultLayer>>({})
const regionStatistics=ref<RegionStatisticRow[]>([]),regionStatisticsBusy=ref(false),regionStatisticsMessage=ref(''),activeRegionStatId=ref('')
const regionStatisticsGeometry=new Map<string,SpatialCollection>()
const regionStatisticsCache=new Map<string,RegionStatisticRow[]>()
let regionStatisticsController:AbortController|undefined
const regionClipDisplays=new Map<string,ReturnType<typeof createRegionClipLayer>>()
let regionClipController:AbortController|undefined,regionClipTimer:ReturnType<typeof setTimeout>|undefined,regionClipVersion=0,lastLocatedRegions=''
const layerKeyword = ref('')
const analysisSearchMatches=ref(0)
const localSearchMatches=computed(()=>analysisSearchMatches.value>0||uploadedLayers.value.some(item=>matchesTopicText(layerKeyword.value,item.name)||item.data.features.some(feature=>matchesTopicProperties(layerKeyword.value,feature.properties))))
const propertySearchRows=shallowRef<Record<string,TopicPropertySearchRow[]>>({}),propertySearchBusy=ref(false),propertySearchError=ref('')
let propertySearchController:AbortController|undefined,propertySearchTimer:ReturnType<typeof setTimeout>|undefined
const expandedLegendLayers = ref<Record<string,boolean>>({})
const collapsedConfigSources = ref<Record<string,boolean>>({})
const featureCandidates = ref<IdentifiedMapFeature[]>([]), selectedFeature = ref(0), identifyPending = ref(false), identifyError = ref('')
const featureRoles = computed(() => Object.fromEntries(layers.value.map(item => [String(item.service.id),item.role])))
let selectionGroup: L.LayerGroup | undefined, selectionVersion = 0
let featureHover:ReturnType<typeof createTopicFeatureHover>|undefined
function hoverTargets():TopicHoverTarget[]{
  if(regionClipActive.value)return []
  const focus=featureCandidates.value[selectedFeature.value]
  return layers.value.filter(item=>item.visible&&!item.analysisHidden&&item.handle&&Number.isFinite(item.service.arcGisLayerId)&&item.role!=='imagery'&&item.role!=='boundary'&&expression(item)!=='1=0'&&(!focus||String(item.service.id)===focus.serviceId)).map(item=>{
    let where=expression(item)
    if(focus?.objectIdField&&focus.objectId!=null){const value=typeof focus.objectId==='number'?String(focus.objectId):`'${String(focus.objectId).replace(/'/g,"''")}'`;where=`(${where}) AND (${focus.objectIdField} = ${value})`}
    return {service:item.service,where,pane:item.handle!.layer.options.pane}
  })
}
// 专题目录独立于任务业务场景；仅使用当前部门接口实际返回的可用图层。
const availableLayers = computed(() => layers.value)
const baselineInputs=computed(()=>farmlandDefaults(layers.value))
const overlaySources = computed(() => groupTopicLayers(layers.value.filter(item => item.role !== 'imagery')).map(group => ({id:group.id,name:group.name})))
const overlayVisibleKeys = computed(() => [...layers.value.filter(item => item.visible && !item.analysisHidden && (!item.categories.length || item.categories.some(category => category.checked))).map(item => item.key),...uploadedLayers.value.filter(item=>item.selected).map(item=>`upload:${item.id}`)])
function openOverlay(operation:SpatialAnalysisOperation='difference') { overlayOperation.value=operation;configOpen.value=false; clearFeatureSelection(); overlayOpen.value=true }
function loadAnalysisGeometry(input:SpatialInput,signal:AbortSignal,within?:SpatialCollection){const item=layers.value.find(item=>item.key===`${input.serviceId}/${input.layerId}`);if(!item)throw new Error('所选发布图层不在当前部门的可用目录中');return readPublishedSpatialGeometry(item.service,input.filters,signal,within)}
function setOverlaySources(keys:string[],visible:boolean) {
  keys.forEach(key=>{const item=layers.value.find(layer=>layer.key===key);if(item)selectLegend(item,visible?'all':'none')})
  uploadPanel.value?.select(keys,visible)
}
function showOverlayResult() {
  if(regionClipActive.value)clearRegionClip(false)
  clearFeatureSelection()
  // Result isolation affects map visibility only, never the configured layer catalogue.
  layers.value.filter(item=>item.visible&&item.role!=='imagery').forEach(item=>{
    selectLegend(item,'none')
  })
  uploadPanel.value?.select(uploadedLayers.value.map(item=>item.id),false)
}
function matchesLayer(item: TopicLayer) {
  return matchesTopicText(layerKeyword.value,item.service.name,item.sourceName)||matchingCategories(item).length>0||!!propertyMatches.value[item.key]?.length
}
const propertyMatches=computed(()=>Object.fromEntries(Object.entries(propertySearchRows.value).map(([key,rows])=>[key,matchingTopicPropertyRows(layerKeyword.value,rows)])))
function matchingCategories(item:TopicLayer){
  const direct=topicSearchCategories(layerKeyword.value,[item.service.name,item.sourceName],item.categories)
  const matched=new Set((propertyMatches.value[item.key]||[]).map(row=>row.category))
  return item.categories.filter(category=>direct.includes(category)||matched.has(category.value))
}
const legendLayers = computed(() => availableLayers.value.filter(item => item.visible && item.role !== 'imagery' && matchesLayer(item)))
let beforeSearchExpansion:Record<string,boolean>|undefined
watch([layerKeyword,legendLayers],()=>{
  if(layerKeyword.value.trim()){
    beforeSearchExpansion??={...expandedLegendLayers.value}
    legendLayers.value.forEach(item=>{expandedLegendLayers.value[item.key]=true})
  }else if(beforeSearchExpansion){expandedLegendLayers.value=beforeSearchExpansion;beforeSearchExpansion=undefined}
})
function queuePropertySearch(){
  clearTimeout(propertySearchTimer);propertySearchController?.abort();propertySearchBusy.value=false;propertySearchError.value=''
  if(!layerKeyword.value.trim())return
  const abort=new AbortController();propertySearchController=abort
  const targets=layers.value.filter(item=>item.visible&&item.role!=='imagery'&&item.handle&&item.service.arcGisGeometryType&&!propertySearchRows.value[item.key])
  if(!targets.length)return
  propertySearchBusy.value=true
  propertySearchTimer=setTimeout(async()=>{
    const failed:string[]=[]
    for(let offset=0;offset<targets.length;offset+=2){
      if(abort.signal.aborted)return
      await Promise.all(targets.slice(offset,offset+2).map(async item=>{
        try{
          const metadata=await getMapServiceLayerMetadata(item.service)
          if(abort.signal.aborted)return
          const fields=(metadata.fields||[]).map(field=>field.name).filter((name):name is string=>!!name)
          const data=await queryMapServiceFeatures(item.service,fields,'1=1',false,{signal:abort.signal})
          if(abort.signal.aborted)return
          propertySearchRows.value={...propertySearchRows.value,[item.key]:indexTopicProperties(data.features,item.categoryField,item.role==='boundary'?item.handle?.categoryFilter?.values:undefined,data.objectIdField)}
        }catch{if(!abort.signal.aborted)failed.push(item.service.name)}
      }))
    }
    if(!abort.signal.aborted){propertySearchBusy.value=false;propertySearchError.value=failed.length?`部分图层的完整属性未能读取（${failed.join('、')}），已有分类仍可搜索。`:''}
  },300)
}
watch(()=>JSON.stringify([layerKeyword.value,layers.value.filter(item=>item.visible).map(item=>[item.key,!!item.handle])]),queuePropertySearch)
const imageryLayers = computed(() => availableLayers.value.filter(item => item.role === 'imagery'))
const vectorLayers = computed(() => availableLayers.value.filter(item => item.role !== 'imagery' && matchesLayer(item)))
const configSourceGroups = computed(() => groupTopicLayers(vectorLayers.value))
const mapLegendGroups=computed(()=>[
  ...layers.value.filter(item=>item.visible&&!item.analysisHidden&&item.role!=='imagery'&&item.handle&&(!regionClipActive.value||(regionClipStates.value[item.key]?.status==='SUCCEEDED'&&regionClipStates.value[item.key]!.resultFeatureCount>0))).map(item=>{
    const symbols=item.role!=='boundary'&&item.categories.length?item.categories.filter(category=>category.checked).map(category=>({
      label:category.name,color:category.style?`rgb(${category.style.rgb.join(',')})`:category.color||item.handle!.color||'#56bccc',
      pattern:category.style?c5Pattern(category.style):undefined,standard:!!category.style,mode:category.mode??item.mode,geometry:item.service.arcGisGeometryType||'esriGeometryPolygon',
    })):[{label:item.service.name,color:item.handle!.color||'#56bccc',mode:item.mode,geometry:item.service.arcGisGeometryType||'esriGeometryPolygon',administrative:item.role==='boundary'}]
    if (props.topic.id === FACILITIES_TOPIC_ID && item.role === 'facility' && item.categories.length) {
      const grouped = new Map<string, typeof symbols[number]>()
      for (const symbol of symbols) {
        const label = facilityCategoryFromName(symbol.label)
        if (!grouped.has(label)) grouped.set(label, { ...symbol, label })
      }
      return {key:item.key,name:item.service.name,symbols:[...grouped.values()]}
    }
    return {key:item.key,name:item.service.name,symbols}
  }),
  ...analysisLegend.value.map(item=>({key:'analysis-'+item.id,name:item.name,symbols:item.symbols.map(symbol=>({...symbol,mode:symbol.mode||'filled' as TopicDisplayMode,geometry:'esriGeometryPolygon'}))})),
  ...uploadedLayers.value.filter(item=>item.selected).map(item=>({key:item.id,name:item.name,symbols:[{label:item.name,color:item.color,mode:item.mode,geometry:/Point/.test(item.data.features[0]?.geometry.type||'')?'esriGeometryPoint':/LineString/.test(item.data.features[0]?.geometry.type||'')?'esriGeometryPolyline':'esriGeometryPolygon'}]})),
].filter(group=>group.symbols.length))
const farmlandStatSources = computed(() => {
  if(!isFarmland.value)return topicStatSources(layers.value.filter(item=>!item.analysisHidden))
  if(analysisStatistics.value.length)return []
  const {a,b}=baselineInputs.value
  const item=layers.value.find(item=>[a&&`${a.serviceId}/${a.layerId}`,b&&`${b.serviceId}/${b.layerId}`].includes(item.key)&&item.visible&&!item.analysisHidden&&(!item.categories.length||item.categories.some(category=>category.checked)))
  return item?[{id:item.key.split('/')[0]!,name:item.sourceName}]:[]
})
const businessAllSelected = computed(() => vectorLayers.value.length > 0 && vectorLayers.value.every(item => item.visible))
const businessPartSelected = computed(() => !businessAllSelected.value && vectorLayers.value.some(item => item.visible))
const roleNames: Record<TopicRole, string> = { land:'国土调查底类', permanent:'永久基本农田', boundary:'行政边界', changes:'变化线索', facility:'项目设施', project:'项目范围', parcel:'耕地地块', imagery:'遥感影像', unconfigured:'通用图层' }
let map: L.Map | undefined, resizeObserver: ResizeObserver | undefined, version = 0
const featureCache = new Map<string, Awaited<ReturnType<typeof queryMapServiceFeatures>>>()
const inFlight = new Map<string, Promise<void>>()
function current(item: TopicLayer, request: number) { return request === version && layers.value.some(layer => layer.key === item.key) }
function expression(item: TopicLayer) {
  if(item.role==='boundary'&&item.handle?.categoryFilter){
    const selected=item.categories.filter(category=>category.checked)
    if(!selected.length)return '1=0'
    if(selected.length===item.categories.length)return '1=1'
    const ids=administrativeIds(item)
    return ids.length?`${item.categoryField} IN (${ids.map(id=>typeof id==='number'?String(id):`'${String(id).replace(/'/g,"''")}'`).join(',')})`:'1=0'
  }
  const categories = item.categories
  return item.categoryField ? categoryWhere(item.categoryField, categories.filter(c => c.checked).map(c => c.value), categories.map(c => c.value)) : '1=1'
}
function applyFilter(item: TopicLayer) {
  featureHover?.clear()
  regionClipDisplays.get(item.key)?.update(clipStyle(item))
  if (featureCandidates.value.length || identifyPending.value) clearFeatureSelection()
  if(item.role==='boundary')item.handle?.categoryFilter?.setVisibleValues(item.categories.filter(category=>category.checked).map(category=>category.value))
  else item.handle?.setQueryFilter?.(expression(item))
}
function legendAllSelected(item: TopicLayer) { return !item.analysisHidden && item.categories.every(category => category.checked) }
function legendPartSelected(item: TopicLayer) { return !item.analysisHidden && !legendAllSelected(item) && item.categories.some(category => category.checked) }
function applyLegendSelection(item: TopicLayer) {
  if(item.categories.length)item.analysisHidden=!item.categories.some(category=>category.checked)
  applyFilter(item)
  syncPublishedLayer(item)
}
function selectLegend(item: TopicLayer, mode: 'all' | 'none') {
  if(!item.categories.length)item.analysisHidden=mode!=='all'
  item.categories.forEach(category => {
    category.checked = mode === 'all'
  })
  // 一次批量操作只对当前图层提交一次筛选，不影响其他层。
  applyLegendSelection(item)
}
function setCategoryVisible(item: TopicLayer,category: Category,checked: boolean) {
  category.checked=checked
  applyLegendSelection(item)
}
async function selectBusinessLayers(mode: 'all' | 'none') {
  if (businessBatchPending.value) return
  businessBatchPending.value = true
  const targets = vectorLayers.value.map(item => ({ item, visible:mode === 'all' }))
  try { await Promise.all(targets.map(({item,visible}) => setVisible(item,visible,true))) }
  finally { businessBatchPending.value = false }
}
function sourceAllSelected(group:{layers:TopicLayer[]}) { return group.layers.every(item => item.visible) }
function sourcePartSelected(group:{layers:TopicLayer[]}) { return !sourceAllSelected(group) && group.layers.some(item => item.visible) }
async function selectSource(group:{layers:TopicLayer[]},visible:boolean) {
  if (businessBatchPending.value) return
  businessBatchPending.value = true
  try { await Promise.all(group.layers.map(item => setVisible(item,visible,true))) }
  finally { businessBatchPending.value = false }
}
function administrativeIds(item:TopicLayer) {
  const selected=new Set(item.categories.filter(category=>category.checked).map(category=>category.value))
  return [...new Set(item.handle?.categoryFilter?.values.filter(value=>selected.has(value.value)).flatMap(value=>value.objectIds||[])||[])]
}
function clipStyle(item:TopicLayer){return {mode:item.mode,color:item.handle?.color||'#56bccc',categoryField:item.categoryField,categories:item.categories,boundary:item.role==='boundary'}}
function syncPublishedLayer(item:TopicLayer){
  if(!map)return
  const show=item.visible&&!item.analysisHidden
  if(regionClipActive.value&&item.role!=='imagery'){
    item.handle?.layer.remove()
    const clipped=regionClipDisplays.get(item.key)
    if(show&&clipped){if(!map.hasLayer(clipped.layer))clipped.layer.addTo(map)}else clipped?.layer.remove()
  }else if(show&&item.handle){if(!map.hasLayer(item.handle.layer))item.handle.layer.addTo(map)}else item.handle?.layer.remove()
}
const regionClipRequest=computed<RegionClipRequest|undefined>(()=>{
  if(!regionClipActive.value)return
  const baselines=new Set([baselineInputs.value.a,baselineInputs.value.b].filter(Boolean).map(input=>`${input!.serviceId}/${input!.layerId}`))
  return {
    deptId:user.activeDeptId||'',combineMode:'UNION',
    regions:layers.value.filter(item=>regionClipSources.value.includes(item.key)).map(item=>({serviceId:item.key.split('/')[0]!,layerId:Number(item.service.arcGisLayerId),objectIds:administrativeIds(item)})).filter(item=>item.objectIds.length),
    // 基准面始终完整裁切供统计；地图分类只控制显示，不改变区域总量。
    targets:layers.value.filter(item=>(item.visible||baselines.has(item.key)||regionClipSources.value.includes(item.key))&&item.role!=='imagery'&&Number.isInteger(item.service.arcGisLayerId)&&item.service.arcGisGeometryType).map(item=>({serviceId:item.key.split('/')[0]!,layerId:item.service.arcGisLayerId!,where:baselines.has(item.key)?'1=1':expression(item)})),
  }
})
const regionClipSelectionCount=computed(()=>regionClipSources.value.reduce((sum,key)=>sum+(layers.value.find(item=>item.key===key)?.categories.filter(category=>category.checked).length||0),0))
function setRegionClipSource(item:TopicLayer,enabled:boolean){
  regionClipSources.value=enabled?[...new Set([...regionClipSources.value,item.key])]:regionClipSources.value.filter(key=>key!==item.key)
}
function clearRegionClip(restore=true){
  regionStatisticsController?.abort();regionStatistics.value=[];regionStatisticsBusy.value=false;regionStatisticsGeometry.clear();activeRegionStatId.value=''

  regionClipVersion++;clearTimeout(regionClipTimer);regionClipController?.abort();regionClipController=undefined
  regionClipDisplays.forEach(display=>display.destroy());regionClipDisplays.clear()
  regionClipSources.value=[];regionClipStates.value={};regionClipBusy.value=false;regionClipError.value='';regionClipMessage.value='';lastLocatedRegions=''
  if(restore)layers.value.forEach(syncPublishedLayer)
}
function locateClipRange(){
  const bounds=L.latLngBounds([])
  regionClipDisplays.forEach(display=>{if(display.bounds.isValid())bounds.extend(display.bounds)})
  if(bounds.isValid()&&map){const wide=map.getSize().x>1000;map.fitBounds(bounds,{paddingTopLeft:wide?[350,90]:[35,80],paddingBottomRight:wide?[330,60]:[35,60],maxZoom:17});return true}
  return false
}
function locatePublishedLayer(item:TopicLayer){
  const bounds=regionClipActive.value?regionClipDisplays.get(item.key)?.bounds:item.handle?.bounds
  if(bounds?.isValid())map?.fitBounds(bounds,{padding:[80,80],maxZoom:17})
}
function clipLayerMessage(item:TopicLayer){
  const state=regionClipStates.value[item.key]
  if(!state)return regionClipBusy.value?'正在裁切…':regionClipError.value?'未显示未裁切数据':''
  return state.status==='SUCCEEDED'?`裁切后 ${state.resultFeatureCount.toLocaleString()} 个要素`:state.error||'该图层裁切失败，已隐藏'
}
function queueRegionClip(){
  regionStatisticsController?.abort();regionStatistics.value=[];regionStatisticsBusy.value=false;regionStatisticsGeometry.clear();activeRegionStatId.value=''

  const request=++regionClipVersion
  clearTimeout(regionClipTimer);regionClipController?.abort();regionClipController=undefined
  regionClipDisplays.forEach(display=>display.destroy());regionClipDisplays.clear();regionClipStates.value={}
  regionClipError.value='';regionClipMessage.value='';regionClipProgress.value=undefined;regionClipBusy.value=regionClipActive.value
  clearFeatureSelection();layers.value.forEach(syncPublishedLayer)
  const input=regionClipRequest.value
  if(!input){regionClipBusy.value=false;return}
  regionClipTimer=setTimeout(()=>void executeRegionClip(input,request),450)
}
async function executeRegionClip(input:RegionClipRequest,request:number){
  const abort=new AbortController();regionClipController=abort
  try{
    if(!input.deptId)throw new Error('未获取到当前部门，请重新进入专题')
    if(!input.regions.length)throw new Error('请至少勾选一个用于裁切的行政区，或清除区划裁切')
    if(input.regions.length>20||input.regions.reduce((sum,region)=>sum+region.objectIds.length,0)>200)throw new Error('一次最多支持 20 个区划图层、200 个区划要素，请减少勾选范围')
    if(input.targets.length>20)throw new Error('一次最多裁切 20 个业务图层，请减少开启的图层')
    if(!input.targets.length){regionClipMessage.value='当前没有可裁切的已发布业务图层';return}
    const unsupported=layers.value.filter(item=>item.visible&&item.role!=='imagery'&&!input.targets.some(target=>regionClipKey(target)===item.key))
    const states:Record<string,RegionClipResultLayer>={}
    const install=async(state:RegionClipResultLayer)=>{
      abort.signal.throwIfAborted()
      if(request!==regionClipVersion)return
      const key=regionClipKey(state),item=layers.value.find(item=>item.key===key)
      states[key]=state
      if(state.status!=='SUCCEEDED'||!state.data||!item){regionClipStates.value={...states};return}
      try{
        const metadata=await getMapServiceLayerMetadata(item.service)
        if(request!==regionClipVersion||abort.signal.aborted||!map)return
        const pane=`topic-clip-${key.replace(/[^a-zA-Z0-9-]/g,'-')}`
        if(!map.getPane(pane))map.createPane(pane)
        map.getPane(pane)!.style.zIndex=item.role==='boundary'?'350':/point/i.test(item.service.arcGisGeometryType||'')?'345':/polyline/i.test(item.service.arcGisGeometryType||'')?'340':'335'
        const display=createRegionClipLayer(map,state.data,item.service,metadata,pane,clipStyle(item),feature=>{
          if(drawingToolActive.value||configOpen.value||overlayOpen.value||uploadDialogOpen.value)return false
          clearFeatureSelection();featureCandidates.value=[feature];selectFeature(0);return true
        })
        display.setMemberships(item.handle?.categoryFilter?.values||[]);display.update(clipStyle(item))
        regionClipDisplays.set(key,display);syncPublishedLayer(item)
      }catch(error){regionClipDisplays.get(key)?.destroy();regionClipDisplays.delete(key);states[key]={...state,status:'FAILED',error:error instanceof Error?error.message:'裁切图层绘制失败'}}
      regionClipStates.value={...states}
    }
    const result=await runRegionClip(input,{signal:abort.signal,progress:status=>{
      if(request===regionClipVersion){regionClipProgress.value=typeof status.progress==='number'?status.progress:undefined;regionClipMessage.value=`后端已完成 ${status.layers.filter(layer=>['SUCCEEDED','FAILED'].includes(layer.status)).length} / ${input.targets.length} 层，正在读取并显示结果…`}
    },notice:message=>{if(request===regionClipVersion)regionClipMessage.value=message},layer:install})
    if(request!==regionClipVersion||abort.signal.aborted||!map)return
    regionClipStates.value=states
    const selectedRegions=JSON.stringify(input.regions)
    if(selectedRegions!==lastLocatedRegions&&locateClipRange())lastLocatedRegions=selectedRegions
    const failures=Object.values(states).filter(state=>state.status!=='SUCCEEDED')
    regionClipMessage.value=`裁切完成：${Object.values(states).filter(state=>state.status==='SUCCEEDED').length} 个图层${result.cached?'（复用后端结果）':''}`
    void updateRegionStatistics(input,states,request)
    if(failures.length||unsupported.length)regionClipError.value=[...failures.map(layer=>`${layer.layerName||regionClipKey(layer)}：${layer.error||'裁切失败'}`),...unsupported.map(layer=>`${layer.service.name}：当前服务不支持行政区裁切`)].join('；')
  }catch(error){if(request===regionClipVersion&&!abort.signal.aborted){
    if(error instanceof RegionClipIntegrityError){regionClipDisplays.forEach(display=>display.destroy());regionClipDisplays.clear();regionClipStates.value={}}
    regionClipError.value=error instanceof Error?error.message:'行政区裁切失败';regionClipMessage.value=error instanceof RegionClipIntegrityError?'裁切范围不完整，已隐藏全部裁切图层':'裁切未完成，原业务图层已隐藏';regionStatistics.value=[{id:'error',name:'区域统计',status:'FAILED',error:regionClipError.value}]
  }}
  finally{if(request===regionClipVersion){regionClipBusy.value=false;regionClipController=undefined}}
}
function regionPolygonData(data:GeoJSON.FeatureCollection|undefined):SpatialCollection{
  if(!data||data.features.some(feature=>!feature.geometry||!['Polygon','MultiPolygon'].includes(feature.geometry.type)))throw new Error('区域统计缺少有效的后端面几何，请重试裁切')
  return data as SpatialCollection
}
async function updateRegionStatistics(input:RegionClipRequest,states:Record<string,RegionClipResultLayer>,request:number){
  const abort=new AbortController();regionStatisticsController?.abort();regionStatisticsController=abort
  const current=()=>request===regionClipVersion&&!abort.signal.aborted
  const selected:RegionGeometry[]=[]
  regionStatisticsBusy.value=true;regionStatisticsProgress.value=undefined
  try{
    const {a,b}=baselineInputs.value
    if(!a||!b)throw new Error('缺少高标田或永农基准图层，无法计算区域统计')
    const highState=states[`${a.serviceId}/${a.layerId}`],permanentState=states[`${b.serviceId}/${b.layerId}`]
    if(highState?.status!=='SUCCEEDED'||permanentState?.status!=='SUCCEEDED')throw new Error('高标田或永农裁切未成功，不能用原范围代替区域统计')
    const high=regionPolygonData(highState.data),permanent=regionPolygonData(permanentState.data)
    for(const source of input.regions){
      const key=regionClipKey(source),item=layers.value.find(item=>item.key===key),data=regionPolygonData(states[key]?.data)
      if(!item)throw new Error('行政区来源不在当前专题目录')
      const requested=new Set(source.objectIds.map(String))
      for(const category of item.categories){
        const ids=new Set((item.handle?.categoryFilter?.values.find(value=>value.value===category.value)?.objectIds||[]).filter(id=>requested.has(String(id))).map(String))
        if(!ids.size)continue
        const collection:SpatialCollection={type:'FeatureCollection',features:data.features.filter(feature=>ids.has(String(feature.properties?.sourceObjectId)))}
        if(!collection.features.length)throw new Error(`${category.name}未返回有效区划边界，无法统计`)
        selected.push({id:`${key}:${category.value}`,name:category.name,data:collection})
      }
    }
    if(!selected.length)throw new Error('未找到所选区划的统计范围')
    const total:RegionGeometry={id:'total',name:'所选区域内（合计）',data:{type:'FeatureCollection',features:selected.flatMap(region=>region.data.features)}}
    const regions=selected.length>1?[total,...selected]:selected
    regions.forEach(region=>regionStatisticsGeometry.set(region.id,region.data))
    const fingerprint=JSON.stringify([input.deptId,input.regions,a,b])
    const cached=regionStatisticsCache.get(fingerprint)
    if(cached){regionStatistics.value=cached.map(row=>({...row}));return}
    regionStatistics.value=regions.map(region=>({id:region.id,name:region.name,status:'RUNNING'}))
    for(let index=0;index<regions.length;index++){
      if(!current())return
      const region=regions[index]!
      regionStatisticsMessage.value=`正在计算 ${region.name}（${index+1}/${regions.length}）`
      try{
        const value=await calculateRegionStatistic(region.data,high,permanent,abort.signal,undefined,user.activeDeptId,percent=>{if(current())regionStatisticsProgress.value=(index*100+percent)/regions.length})
        if(!current())return
        regionStatistics.value=regionStatistics.value.map(row=>row.id===region.id?{...row,status:'SUCCEEDED',value}:row)
      }catch(error){if(!current())return;regionStatistics.value=regionStatistics.value.map(row=>row.id===region.id?{...row,status:'FAILED',error:error instanceof Error?error.message:'区域统计失败'}:row)}
      regionStatisticsProgress.value=(index+1)*100/regions.length
    }
    if(regionStatistics.value.every(row=>row.status==='SUCCEEDED'))regionStatisticsCache.set(fingerprint,regionStatistics.value.map(row=>({...row})))
  }catch(error){if(current())regionStatistics.value=[{id:'error',name:'区域统计',status:'FAILED',error:error instanceof Error?error.message:'区域统计失败'}]}
  finally{if(current()){regionStatisticsBusy.value=false;regionStatisticsController=undefined}}
}
function highlightStatisticRegion(id:string){
  const data=regionStatisticsGeometry.get(id)
  if(!data||!map||!selectionGroup)return
  clearFeatureSelection();activeRegionStatId.value=id
  const layer=L.geoJSON(data,{pane:'topic-selection',interactive:false,style:{color:'#ffe14a',weight:4,fillColor:'#ffe14a',fillOpacity:.12}}).addTo(selectionGroup)
  if(layer.getBounds().isValid()){const wide=map.getSize().x>1000;map.fitBounds(layer.getBounds(),{paddingTopLeft:wide?[350,90]:[35,80],paddingBottomRight:wide?[330,65]:[35,60],maxZoom:17})}
}
watch(()=>JSON.stringify(regionClipRequest.value),queueRegionClip,{flush:'post'})
function clearFeatureSelection() {
  featureHover?.clear()
  selectionVersion++; identifyPending.value = false; identifyError.value = ''
  featureCandidates.value = []; selectedFeature.value = 0; selectionGroup?.clearLayers();activeRegionStatId.value=''
  if (map) setMapHoverSelection(map)
}
function selectFeature(index: number) {
  const feature = featureCandidates.value[index]
  if (!map || !selectionGroup || !feature) return
  selectedFeature.value = index; selectionGroup.clearLayers()
  const coordinates = (points: number[][]) => points.map(point => [point[1]!,point[0]!] as L.LatLngTuple)
  const style = {pane:'topic-selection',interactive:false,color:'#ffe14a',weight:3,fillColor:'#ffe14a',fillOpacity:.18}
  feature.location.geometries.forEach(geometry => {
    if (geometry.rings?.length) L.polygon(geometry.rings.map(coordinates),style).addTo(selectionGroup!)
    if (geometry.paths?.length) L.polyline(geometry.paths.map(coordinates),style).addTo(selectionGroup!)
    const points = geometry.points || (Number.isFinite(geometry.x) && Number.isFinite(geometry.y) ? [[geometry.x!,geometry.y!]] : [])
    coordinates(points).forEach(point => L.circleMarker(point,{...style,radius:9,fillOpacity:.7}).addTo(selectionGroup!))
  })
  setMapHoverSelection(map,layers.value.find(item => String(item.service.id) === feature.serviceId)?.service,feature)
}
async function identifyFeature(event: L.LeafletMouseEvent) {
  if (!map || drawingToolActive.value || configOpen.value || overlayOpen.value || uploadDialogOpen.value) return
  if(regionClipActive.value){
    clearFeatureSelection()
    // 边界模式的面内部没有原生 SVG 点击，使用当前已显示的裁切几何命中，不能查询未裁切服务。
    featureCandidates.value=layers.value.filter(item=>item.visible&&!item.analysisHidden).slice().reverse().flatMap(item=>regionClipDisplays.get(item.key)?.identify(event.latlng)||[])
    if(featureCandidates.value.length)selectFeature(0)
    return
  }
  clearFeatureSelection(); configOpen.value = false
  const request = selectionVersion
  const point = map.latLngToContainerPoint(event.latlng)
  const nw = map.containerPointToLatLng(point.subtract([6,6])), se = map.containerPointToLatLng(point.add([6,6]))
  const envelope = {west:Math.min(nw.lng,se.lng),east:Math.max(nw.lng,se.lng),south:Math.min(nw.lat,se.lat),north:Math.max(nw.lat,se.lat)}
  const visible = layers.value.filter(item => item.visible && !item.analysisHidden && item.handle && item.role !== 'imagery' && expression(item) !== '1=0')
  identifyPending.value = true
  const results: PromiseSettledResult<IdentifiedMapFeature[]>[] = []
  for (let offset=0; offset<visible.length; offset+=4) {
    if (request !== selectionVersion) return
    results.push(...await Promise.allSettled(visible.slice(offset,offset+4).map(item => identifyVectorFeatures(item.service,envelope,expression(item)))))
  }
  if (request !== selectionVersion) return
  identifyPending.value = false
  identifyError.value = results.some(result => result.status === 'rejected') ? '部分图层查询失败，请点击地图重试。' : ''
  featureCandidates.value = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  if (props.topic.id === FACILITIES_TOPIC_ID) {
    const isPoint = (feature: IdentifiedMapFeature) => /point/i.test(feature.location.geometryType || '') || feature.location.geometries.some(geometry => !!geometry.points?.length || (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)))
    featureCandidates.value.sort((a, b) => Number(isPoint(b)) - Number(isPoint(a)))
  }
  if (featureCandidates.value.length) selectFeature(0)
}
function setDrawingTool(active:boolean) {
  drawingToolActive.value = active
  if (active) { clearFeatureSelection(); configOpen.value=false }
}
function applyDisplayMode(item: TopicLayer) {
  regionClipDisplays.get(item.key)?.update(clipStyle(item))
  if (item.role === 'boundary') {
    item.handle?.setFillOpacity?.(item.mode === 'filled' ? 1 : 0)
    item.categories.forEach(category=>item.handle?.setCategoryFillOpacity?.(category.value,(category.mode??item.mode)==='filled'?1:0))
    return
  }
  if (item.role === 'unconfigured' && !item.service.arcGisGeometryType) return
  item.handle?.setRenderer?.(createTopicRenderer(item.categoryField,item.categories,item.service.arcGisGeometryType,item.handle.color,item.mode))
}
function setLayerMode(item: TopicLayer, mode: TopicDisplayMode) {
  item.mode = mode
  item.categories.forEach(category => { category.mode = undefined })
  applyDisplayMode(item)
  topicStore.setPreference(props.topic.id,item.key,{mode:item.mode,categoryModes:{}})
}
function layerUsesMode(item: TopicLayer, mode: TopicDisplayMode) {
  return item.categories.length ? item.categories.every(category => (category.mode ?? item.mode) === mode) : item.mode === mode
}
function setCategoryMode(item: TopicLayer, category: Category, mode: TopicDisplayMode) {
  category.mode = mode
  applyDisplayMode(item)
  topicStore.setPreference(props.topic.id,item.key,{
    categoryModes:Object.fromEntries(item.categories.filter(category => category.mode).map(category => [category.value,category.mode!])),
  })
}
function restoreCategoryModes(item: TopicLayer) {
  const modes = topicStore.getPreference(props.topic.id,item.key)?.categoryModes
  item.categories.forEach(category => { category.mode = modes?.[category.value] })
}
function assignLayerPane(item: TopicLayer, layer: L.Layer) {
  if (!map || !item.service.arcGisGeometryType || item.role === 'boundary') return
  const paneName = `topic-vector-${item.key.replace(/[^a-zA-Z0-9-]/g, '-')}`
  let pane = map.getPane(paneName)
  if (!pane) pane = map.createPane(paneName)
  // 每层有固定的容器；切换渲染器时新瓦片只替换本层，不能跃到其他图层上方。
  pane.style.zIndex = props.topic.id === FACILITIES_TOPIC_ID && item.role === 'facility' && /point/i.test(item.service.arcGisGeometryType) ? '340' : '335'
  pane.style.pointerEvents = 'none'
  const assign = (child: L.Layer) => {
    child.options.pane = paneName
    if (child instanceof L.LayerGroup) child.eachLayer(assign)
  }
  assign(layer)
  // 固定按列表顺序叠放，不受异步加载或模式切换完成时间影响。
  layers.value.forEach(candidate => {
    const container = map?.getPane(`topic-vector-${candidate.key.replace(/[^a-zA-Z0-9-]/g, '-')}`)
    if (container?.parentElement) container.parentElement.appendChild(container)
  })
}
async function prepare(item: TopicLayer) {
  if (!map || item.handle || item.pending) return
  const request = version
  item.pending = true; item.error = ''
  try {
    if (item.role!=='boundary' && item.categoryField && !item.ready) {
      const fields = [...new Set([item.categoryField, ...(item.fields.includes('DLMC') ? ['DLMC'] : [])])]
      const cacheKey = item.key + fields.join(',')
      let data = featureCache.get(cacheKey)
      if (!data) { data = await queryMapServiceFeatures(item.service, fields); if (request !== version) return; featureCache.set(cacheKey, data) }
      if (!current(item, request)) return
      const groups = new Map<string, Category>()
      data.features.forEach(feature => {
        const attributes = feature.attributes || {}, value = String(attributes[item.categoryField] ?? '').trim()
        const existing = groups.get(value)
        if (existing) { existing.count++; return }
        const name = String(attributes.DLMC || value || '未分类')
        const standard = ['land', 'permanent', 'parcel'].includes(item.role) ? resolveC5Style(item.categoryField === 'DLBM' ? value : '', name) : undefined
        groups.set(value, { value, name, count:1, checked:true, style:standard })
      })
      item.categories = [...groups.values()].sort((a,b) => a.value.localeCompare(b.value, 'zh-CN'))
      item.ready = true
    }
    const handle = item.role === 'boundary' ? await createAdministrativeBoundaryLayer(item.service) : await createMapServiceLayer(item.service)
    if (!current(item, request)) return
    item.handle = markRaw(handle)
    if(item.role==='boundary'&&handle.categoryFilter){
      item.categoryField=handle.categoryFilter.fieldName
      item.categories=handle.categoryFilter.values.map(value=>({value:value.value,name:value.label,count:1,checked:true,color:value.color}))
      item.ready=true
    }
    handle.setHoverEnabled?.(false)
    assignLayerPane(item, handle.layer)
    item.categories.forEach(category => { category.color = item.role === 'project' ? '#ffca5d' : handle.categoryFilter?.values.find(value => value.value === category.value)?.color || handle.color })
    restoreCategoryModes(item)
    applyDisplayMode(item)
    applyFilter(item)
    syncPublishedLayer(item)
    if (item.role === 'boundary' && handle.bounds?.isValid()) map.fitBounds(handle.bounds, { padding:[45,45], maxZoom:14 })
  } catch (reason) { if (current(item, request)) { item.error = reason instanceof Error ? reason.message : '数据读取失败'; item.visible = false } }
  finally { if (current(item, request)) item.pending = false }
}
async function setVisible(item: TopicLayer, visible: boolean, remember = false) {
  clearFeatureSelection()
  if (remember) topicStore.setPreference(props.topic.id,item.key,{visible})
  item.visible = visible
  item.analysisHidden = false
  if (visible) {
    let job = inFlight.get(item.key)
    if (!job) { job = prepare(item); inFlight.set(item.key, job); void job.finally(() => { if (inFlight.get(item.key) === job) inFlight.delete(item.key) }) }
    await job
    if (layers.value.some(layer => layer === item)) { applyFilter(item);syncPublishedLayer(item) }
  } else {item.handle?.layer.remove();regionClipDisplays.get(item.key)?.layer.remove()}
}
async function selectImagery(key: string) { await Promise.all(imageryLayers.value.map(item => setVisible(item, item.key === key,true))) }
let initialSceneScope=''
async function applyScene() {
  const initializeDefaults=initialSceneScope!==uploadScope.value
  initialSceneScope=uploadScope.value
  const initializeFarmland=isFarmland.value&&initializeDefaults&&baselineInputs.value.keys.length>0
  const boundary = availableLayers.value.find(item => item.role === 'boundary'&&(!isFarmland.value||baselineInputs.value.keys.includes(item.key))), imagery = imageryLayers.value[0]
  await Promise.all(layers.value.map(item => {
    const preference = topicStore.getPreference(props.topic.id,item.key)
    const defaultMode=item.role === 'boundary' ? 'boundary' : 'filled'
    const mode = initializeFarmland&&baselineInputs.value.keys.includes(item.key) ? defaultMode : preference?.mode || defaultMode
    item.mode = mode
    if (initializeFarmland&&baselineInputs.value.keys.includes(item.key)) topicStore.setPreference(props.topic.id,item.key,{mode:defaultMode,categoryModes:{}})
    restoreCategoryModes(item)
    applyDisplayMode(item)
    item.categories.forEach(category => { category.checked = true })
    const defaultVisible = [boundary?.key,imagery?.key,...(props.topic.id === HIGH_STANDARD_TOPIC_ID ? baselineInputs.value.keys : props.topic.id===FACILITIES_TOPIC_ID?layers.value.filter(item=>item.role==='facility').map(item=>item.key):[])].includes(item.key)
    return setVisible(item, initializeFarmland&&item.role!=='imagery' ? baselineInputs.value.keys.includes(item.key) : preference?.visible ?? defaultVisible)
  }))
}
async function loadData() {
  if (!map) return
  clearRegionClip(false)
  clearFeatureSelection()
  expandedLegendLayers.value = {}
  collapsedConfigSources.value = {}
  const request = ++version
  clearTimeout(propertySearchTimer);propertySearchController?.abort();propertySearchRows.value={};propertySearchBusy.value=false;propertySearchError.value='';regionStatisticsCache.clear()
  layers.value.forEach(item => item.handle?.layer.remove()); layers.value = []; featureCache.clear(); inFlight.clear()
  pending.value = true; error.value = ''
  try {
    const sources = await listEnabledMapServices(user.activeDeptId)
    if (request !== version) return
    const output: TopicLayer[] = []
    for (let index = 0; index < sources.length; index += 3) {
      await Promise.all(sources.slice(index, index + 3).map(async source => {
        const entries = await readTopicLayerCatalog(source,{
          expand: service => expandMapServiceSublayers(service,true),
          metadata:getMapServiceLayerMetadata,
        })
        entries.forEach(entry => {
          const mode = topicStore.getPreference(props.topic.id,entry.key)?.mode || (entry.role === 'boundary' ? 'boundary' : 'filled')
          output.push({...entry,categories:[],visible:false,analysisHidden:false,pending:false,ready:false,mode})
        })
      }))
      if (request !== version) return
    }
    layers.value = output.sort((a,b) => (Number(a.service.sort) || 0) - (Number(b.service.sort) || 0) || a.key.localeCompare(b.key, undefined, {numeric:true}))
    collapsedConfigSources.value = Object.fromEntries(groupTopicLayers(layers.value).map(group => [group.id,true]))
    await applyScene()
  } catch (reason) { if (request === version) error.value = reason instanceof Error ? reason.message : '专题数据读取失败' }
  finally { if (request === version) pending.value = false }
}
async function toggleFullscreen() {
  try { if (document.fullscreenElement === root.value) await document.exitFullscreen(); else await root.value?.requestFullscreen() }
  catch { error.value = '浏览器未允许全屏，请使用浏览器全屏查看。' }
}
function updateFullscreen() { fullscreen.value = document.fullscreenElement === root.value; map?.invalidateSize({pan:false}) }
watch(uploadScope,()=>{clearRegionClip();analysisStatistics.value=[];analysisLegend.value=[];detailLayerOrder.value={};nextAddedLayerOrder=10000})
watch(() => user.activeDeptId, () => { void loadData() })
watch(configOpen, open => { if (open) clearFeatureSelection() })
watch(uploadDialogOpen,open=>{if(open)featureHover?.clear()})
watch(drawingToolActive,()=>featureHover?.clear())
watch(() => props.topic.id, () => {
  clearFeatureSelection()
  expandedLegendLayers.value = {}
  layerKeyword.value = ''
  // 首次数据准备过程中也同步最新专题的显隐，防止慢请求把前一个专题重新显示出来。
  if (layers.value.length) void applyScene()
})
onMounted(() => {
  if (!canvas.value) return
  map = L.map(canvas.value, { center:[32.49,119.85], zoom:12, attributionControl:false, zoomControl:false })
  for (const [name,zIndex] of [[MAP_SERVICE_IMAGERY_PANE,225],[MAP_SERVICE_VECTOR_PANE,335],['administrative-boundaries',350]] as const) map.createPane(name).style.zIndex = String(zIndex)
  map.createPane('topic-selection').style.zIndex = '450'
  selectionGroup = L.layerGroup().addTo(map)
  featureHover=createTopicFeatureHover(map,hoverTargets,()=>drawingToolActive.value||configOpen.value||overlayOpen.value||uploadDialogOpen.value)
  map.on('click',identifyFeature)
  toolsMap.value = markRaw(map)
  const token = import.meta.env.VITE_TIANDITU_TOKEN
  if (token) L.tileLayer(`https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`, {subdomains:['0','1','2','3','4','5','6','7'],maxNativeZoom:18,maxZoom:22,updateWhenIdle:true,updateWhenZooming:false,keepBuffer:2}).addTo(map)
  resizeObserver = new ResizeObserver(() => map?.invalidateSize({pan:false})); resizeObserver.observe(canvas.value)
  document.addEventListener('fullscreenchange', updateFullscreen)
  void loadData()
})
watch(mapLegendGroups, () => void observeLegend(), { flush: 'post' })
onMounted(() => void observeLegend())
onBeforeUnmount(() => { regionStatisticsController?.abort();clearTimeout(propertySearchTimer);propertySearchController?.abort();clearRegionClip(false);legendResizeObserver?.disconnect(); clearFeatureSelection();featureHover?.destroy();featureHover=undefined; version++; document.removeEventListener('fullscreenchange', updateFullscreen); resizeObserver?.disconnect(); map?.remove(); map = undefined })
</script>

<template>
  <section ref="root" class="geographic-topics" :style="{ '--legend-space': `${legendSpace}px` }" aria-label="专题地图">
    <div ref="canvas" class="topic-map" :class="{'topic-map--drawing':drawingToolActive}"></div>
    <div class="topic-map-reference">
      <div class="topic-north" role="img" aria-label="指北针：上方为北">
        <span>北 N</span><svg viewBox="0 0 24 36" aria-hidden="true"><path d="M12 2 22 32 12 25Z" fill="#ecf4f2"/><path d="M12 2 2 32 12 25Z" fill="#243e49"/><path d="M12 2 22 32 12 25 2 32Z" fill="none" stroke="#ecf4f2" stroke-width="1.2"/></svg>
      </div>
      <OverviewMapScale :map="toolsMap" />
    </div>
    <div class="topic-title"><span>专题分析 / {{ topic.name }}</span></div>
    <TopicMapToolbar v-if="toolsMap" :key="uploadScope" :map="toolsMap" :load-drawing="loadDrawing" :suspended="configOpen || overlayOpen || uploadDialogOpen" :coverage-enabled="topic.id===HIGH_STANDARD_TOPIC_ID" :analysis-label="isFarmland?'高标田与永农对比分析':undefined" @drawing="setDrawingTool" @overlay="openOverlay('difference')" @coverage="openOverlay('coverage')">
      <button v-if="topic.id===HIGH_STANDARD_TOPIC_ID" type="button" aria-label="上传 SHP 图层" title="上传 SHP 图层" @click="openUpload()"><Upload /></button>
      <button :aria-label="fullscreen ? '退出全屏' : '全屏展示'" :title="fullscreen ? '退出全屏' : '全屏展示'" @click="toggleFullscreen"><FullScreen /></button>
      <button :class="{active:configOpen}" :aria-expanded="configOpen" title="场景配置" @click="configOpen = !configOpen"><Setting /><span>场景配置</span></button>
    </TopicMapToolbar>
    <div v-if="error" class="topic-status" role="alert">{{ error }}<button @click="loadData">重试</button></div>
    <div v-else-if="pending" class="topic-status" role="status">正在准备专题数据…</div>
    <div v-else-if="topicStore.storageError" class="topic-status" role="alert">{{ topicStore.storageError }}</div>
    <div v-if="identifyPending || identifyError" class="topic-identify-status" :role="identifyError ? 'alert' : 'status'">{{ identifyError || '正在查询要素…' }}</div>
    <div v-if="!configOpen && (regionClipActive || analysisStatistics.length || farmlandStatSources.length || featureCandidates.length)" class="topic-inspector-rail" :class="{'has-details':featureCandidates.length}">
      <aside v-if="regionClipActive || analysisStatistics.length || farmlandStatSources.length" class="topic-farmland-stat" :aria-label="regionClipActive?'区域统计':analysisStatistics.length?'分析结果':'高标准农田统计'"><header>{{ regionClipActive?'区域统计':analysisStatistics.length?'分析结果':'高标准农田数据' }}</header><template v-if="regionClipActive"><TopicRegionStatistics v-if="regionStatistics.length" :rows="regionStatistics" :active-id="activeRegionStatId" @select="highlightStatisticRegion" /><p v-else role="status">正在准备所选区域的统计数据…</p></template><TopicAnalysisStatistics v-else-if="analysisStatistics.length" :items="analysisStatistics" /><!-- 高标田专题显示部门定制统计，保留后端的实际统计范围标题；图层服务切换不改变统计范围。 --><TopicStatisticsSummary v-else area-in-mu :sources="isFarmland ? undefined : farmlandStatSources" /></aside>
      <TopicFeatureDetails v-if="featureCandidates.length" embedded :features="featureCandidates" :selected="selectedFeature" :roles="featureRoles" @select="selectFeature" @close="clearFeatureSelection" />
    </div>
    <button class="topic-details-toggle" :class="{collapsed:legendCollapsed}" :aria-label="legendCollapsed?'展开图层详情':'收起图层详情'" :aria-expanded="!legendCollapsed" @click="legendCollapsed=!legendCollapsed">{{ legendCollapsed?'›':'‹' }}</button>
    <aside class="topic-legend" :class="{'is-collapsed':legendCollapsed}" :aria-hidden="legendCollapsed" :inert="legendCollapsed">
      <header class="legend-heading"><Collection /><b>图层详情</b></header>
      <label class="layer-search"><Search aria-hidden="true" /><input v-model="layerKeyword" type="search" aria-label="搜索图层名称或属性" placeholder="搜索图层名称或属性（如村名）" /></label>
      <section v-if="regionClipActive" class="region-clip-summary" aria-label="行政区裁切状态" :aria-busy="regionClipBusy">
        <div><b>区划裁切 · {{ regionClipSelectionCount }} 个区域</b><button type="button" @click="locateClipRange">定位范围</button><button type="button" @click="clearRegionClip()">清除裁切</button></div>
        <p role="status">{{ regionClipMessage || '正在准备裁切…' }}</p>
        <p>地图按行政边界裁切；右侧展示所选区域的统计。</p>
        <details v-if="regionClipError"><summary role="alert">{{ regionClipBusy?'正在更新裁切':'部分或全部图层未显示' }}</summary><p>{{ regionClipError }}</p></details>
        <button v-if="regionClipError&&!regionClipBusy" type="button" @click="queueRegionClip">重试裁切</button>
      </section>
      <div class="legend-content"><div class="legend-layer-list"><p v-if="propertySearchBusy" role="status">正在搜索图层属性…</p><p v-if="propertySearchError" role="alert">{{ propertySearchError }}<button type="button" @click="queuePropertySearch">重试</button></p>
        <TopicOverlayAnalysis v-if="toolsMap" :map="toolsMap" :open="overlayOpen" :context="uploadScope" :sources="overlaySources" :uploads="uploadedLayers" :operation="overlayOperation" :farmland="isFarmland" :defaults="baselineInputs" :keyword="layerKeyword" :layer-order="detailLayerOrder" @matches="analysisSearchMatches=$event" @layerkeys="rememberAddedLayers" @statistics="analysisStatistics=$event" :load-geometry="loadAnalysisGeometry" :visible-keys="overlayVisibleKeys" @close="overlayOpen=false" @upload="openUpload(true)" @hide="showOverlayResult" @legend="analysisLegend=$event" @restore="setOverlaySources($event,true)" />
        <TopicUploadedLayers v-if="toolsMap" ref="uploadPanel" :map="toolsMap" :scope="uploadScope" :keyword="layerKeyword" integrated :layer-order="detailLayerOrder" @change="updateUploads" @dialog="uploadDialogOpen=$event" @imported="uploaded" />
        <p v-if="!legendLayers.length && !pending && !propertySearchBusy && !localSearchMatches">{{ layerKeyword.trim() ? '没有匹配的已开启图层或属性，可修改关键词或在场景配置中开启图层。' : '暂无已开启的分类图层，可在场景配置中选择。' }}</p>
        <TopicLayerCard v-for="item in legendLayers" :key="item.key" v-model:expanded="expandedLegendLayers[item.key]" :title="item.service.name" :subtitle="item.service.name!==item.sourceName?item.sourceName:undefined" :category-count="item.categories.length" :checked="legendAllSelected(item)" :indeterminate="legendPartSelected(item)" class="published-layer" :data-layer-key="`published:${item.key}`" :style="{order:layers.findIndex(layer=>layer.key===item.key)}" @select="selectLegend(item,$event?'all':'none')">
          <label v-if="isFarmland&&item.role==='boundary'&&item.handle?.categoryFilter" class="region-clip-switch"><input type="checkbox" :checked="regionClipSources.includes(item.key)" :aria-label="`${item.service.name}用于区划裁切`" @change="setRegionClipSource(item,($event.target as HTMLInputElement).checked)" />用于区划裁切</label>
          <p v-if="regionClipActive&&clipLayerMessage(item)" class="region-clip-layer-state" :class="{'is-error':regionClipStates[item.key]?.status==='FAILED'}">{{ clipLayerMessage(item) }}</p>
          <TopicLayerDisplayMode v-if="item.service.arcGisGeometryType || item.role==='boundary'" :mode="layerUsesMode(item,'filled')?'filled':layerUsesMode(item,'boundary')?'boundary':'mixed'" :name="`legend-mode-${item.key}`" :label="`${item.service.name}图例显示模式`" :class="{'has-categories':item.categories.length>0}" @change="setLayerMode(item,$event)" />
          <div v-for="category in matchingCategories(item)" :key="category.value" class="category-entry">
          <label class="topic-category">
            <input :checked="category.checked" :aria-label="`${item.service.name} ${category.name}`" type="checkbox" @change="setCategoryVisible(item,category,($event.target as HTMLInputElement).checked)" />
            <img v-if="category.style" :src="c5Pattern(category.style)" alt="" /><i v-else class="source-symbol" :style="{background:category.color}"></i>
            <span><template v-if="item.role==='boundary'">{{ category.name }}</template><template v-else>{{ category.value }}<b>{{ category.name !== category.value ? category.name : '' }}</b></template><small v-if="category.style && !category.style.mapped">扩展地类 · 待确认规范映射</small></span><em v-if="item.role!=='boundary'">{{ category.count }}</em>
          </label>
          <fieldset class="category-mode" :aria-label="`${item.service.name} ${category.value} ${category.name}显示模式`">
            <legend class="visually-hidden">分类显示模式</legend>
            <label><input type="radio" :name="`category-mode-${item.key}-${category.value}`" :checked="(category.mode ?? item.mode) === 'filled'" @change="setCategoryMode(item,category,'filled')" />铺满</label>
            <label><input type="radio" :name="`category-mode-${item.key}-${category.value}`" :checked="(category.mode ?? item.mode) === 'boundary'" @change="setCategoryMode(item,category,'boundary')" />边界</label>
          </fieldset>
          </div>
          <template v-if="item.handle?.bounds?.isValid()" #actions><button type="button" @click="locatePublishedLayer(item)">定位</button></template>
        </TopicLayerCard>
      </div></div>
    </aside>
    <TopicMapLegend :groups="mapLegendGroups" />
    <TopicAnalysisProgress v-if="regionClipBusy || regionStatisticsBusy" :title="regionClipBusy?'行政区裁切运行中':'区域统计计算中'" :message="regionClipBusy?(regionClipMessage||'正在提交后端裁切任务…'):regionStatisticsMessage" :progress="regionClipBusy?regionClipProgress:regionStatisticsProgress" />
    <Transition name="topic-drawer"><aside v-if="configOpen" class="topic-config" aria-label="场景配置">
      <header><div><small>SCENE SETTINGS</small><h2>场景配置</h2></div><button aria-label="关闭场景配置" @click="configOpen=false"><Close /></button></header>
      <div class="config-body">
        <p v-if="topicStore.storageError" role="alert">{{ topicStore.storageError }}</p>
        <section><h3>背景影像</h3><ElSelect :empty-values="[null, undefined]" class="system-select" popper-class="system-select-options" aria-label="背景影像" :model-value="imageryLayers.find(item=>item.visible)?.key || ''" @change="selectImagery(String($event))"><ElOption value="" label="仅基础底图" /><ElOption v-for="item in imageryLayers" :key="item.key" :value="item.key" :label="String(item.service.name)" /></ElSelect></section>
        <section><h3>业务数据 <small>{{ configSourceGroups.length }} 个服务 · {{ vectorLayers.length }} 个图层</small></h3>
          <div class="selection-actions" role="group" aria-label="业务数据批量选择">
            <TopicSelectionCheckbox title="业务数据" :count="vectorLayers.length" :checked="businessAllSelected" :indeterminate="businessPartSelected" :disabled="pending || businessBatchPending || !vectorLayers.length" @change="selectBusinessLayers($event?'all':'none')" />
            <small v-if="businessBatchPending" role="status">正在应用…</small>
          </div>
          <p v-if="!vectorLayers.length && layerKeyword.trim()">没有匹配的业务图层。</p>
          <section v-for="group in configSourceGroups" :key="group.id" class="config-service-group" :data-source-id="group.id" :aria-label="group.name">
            <div class="config-source-heading">
              <button class="config-source-toggle" :aria-expanded="!collapsedConfigSources[group.id]" :title="group.name" @click="collapsedConfigSources[group.id] = !collapsedConfigSources[group.id]"><i class="disclosure-triangle" :class="{expanded:!collapsedConfigSources[group.id]}"></i><b>{{ group.name }}</b></button>
              <label class="config-source-switch"><input type="checkbox" :aria-label="`${group.name}整组显示`" :checked="sourceAllSelected(group)" :indeterminate="sourcePartSelected(group)" :disabled="pending || businessBatchPending" @change="selectSource(group,($event.target as HTMLInputElement).checked)" /><span>整组</span></label>
            </div>
            <div v-show="!collapsedConfigSources[group.id]" class="config-source-children">
          <div v-for="item in group.layers" :key="item.key" class="config-layer">
            <label><input :checked="item.visible" :disabled="businessBatchPending" type="checkbox" @change="setVisible(item,($event.target as HTMLInputElement).checked,true)" /><span><b>{{ item.service.name }}</b><small>{{ roleNames[item.role] }}{{ item.categoryField ? ` · ${item.categoryField}` : '' }}</small></span><Refresh v-if="item.pending" class="pending-icon" /></label>
            <fieldset v-if="item.service.arcGisGeometryType || item.role === 'boundary'" class="display-mode" :aria-label="`${item.service.name}配置显示模式`"><legend class="visually-hidden">图层显示</legend>
              <label><input :checked="layerUsesMode(item,'filled')" type="radio" :name="`config-mode-${item.key}`" value="filled" @change="setLayerMode(item,'filled')" />铺满模式</label>
              <label><input :checked="layerUsesMode(item,'boundary')" type="radio" :name="`config-mode-${item.key}`" value="boundary" @change="setLayerMode(item,'boundary')" />边界模式</label>
            </fieldset>
            <p v-if="item.error" role="alert">{{ item.error }} <button @click="setVisible(item,true,true)">重试</button></p>
          </div>
            </div>
          </section>
        </section>
        <section v-if="topic.id === HIGH_STANDARD_TOPIC_ID"><h3>专题统计</h3><TopicStatisticsSummary area-in-mu /></section>
      </div>
    </aside></Transition>
  </section>
</template>

<style scoped>
.region-clip-summary{flex:none;margin:10px 12px 0;padding:10px;border:1px solid #6bc6df40;border-radius:6px;background:#173e5180;font-size:12px;max-height:150px;overflow:auto}.region-clip-summary>div{display:flex;align-items:center;justify-content:space-between;gap:8px}.region-clip-summary b{font-size:14px;font-weight:500}.region-clip-summary button{padding:2px 0;border:0;background:none;color:#7de1e9;font-size:12px;cursor:pointer}.geographic-topics .region-clip-summary p{margin:6px 0 0;font-size:12px}.region-clip-summary details{margin-top:6px;color:#ffba98}.region-clip-summary details p{color:#ffba98;overflow-wrap:anywhere}.region-clip-switch{display:flex;align-items:center;gap:8px;padding-bottom:10px;color:#86e1e7;font-size:12px;cursor:pointer}.geographic-topics .region-clip-layer-state{margin:0 0 8px;color:#8bd9cf;font-size:12px}.geographic-topics .region-clip-layer-state.is-error{color:#ffba98}
.geographic-topics{--details-width:320px;--left-panel-top:110px;--left-panel-bottom:22px;--details-height:clamp(200px,calc((100% - var(--left-panel-top) - var(--left-panel-bottom)) * .68),560px)}.topic-details-toggle{position:absolute;z-index:515;left:calc(20px + var(--details-width));top:calc(var(--left-panel-top) + 10px);display:flex;align-items:center;justify-content:center;width:24px;height:44px;padding:0;border:1px solid #78b8ce40;border-left:0;border-radius:0 7px 7px 0;background:#103745ee;color:#c8edf7;font-size:26px;line-height:1;cursor:pointer;transition:left .24s ease}.topic-details-toggle.collapsed{left:0}.topic-legend{transition:translate .24s ease,opacity .24s ease}.topic-legend.is-collapsed{translate:calc(-100% - 24px) 0;opacity:0;pointer-events:none}@media(max-width:1100px){.geographic-topics{--details-width:300px;--left-panel-top:160px}}@media(prefers-reduced-motion:reduce){.topic-details-toggle,.topic-legend{transition:none}}

.legend-layer-heading{display:flex;align-items:center;gap:8px;width:100%;padding:0 0 12px;border:0;background:transparent;text-align:left;cursor:pointer}.legend-layer-heading b{flex:1;min-width:0;font-size:14px;line-height:1.6;font-weight:500;overflow-wrap:anywhere}.legend-layer-heading small,.legend-layer-heading span{font-size:12px;color:#83b5c4;white-space:nowrap}.legend-layer-heading:hover{color:#84e7f2}.topic-identify-status{position:absolute;z-index:526;right:20px;top:82px;max-width:350px;padding:10px 14px;border-radius:8px;background:#092b3bed;color:#b3d8e3;font-size:12px}.topic-identify-status:has(+.topic-feature-details){top:auto;bottom:10px}
.category-entry{border-radius:6px;padding-bottom:7px}.category-entry:hover{background:#43869c18}.category-mode{display:flex;align-items:center;gap:14px;border:0;margin:0;padding:0 4px 0 27px;min-width:0}.category-mode label{display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;color:#a7c6cf;line-height:20px}.category-mode input{margin:0;width:12px;height:12px;accent-color:#39c7d5}
.topic-map.leaflet-grab,.topic-map :deep(.leaflet-grab){cursor:default!important}.topic-map :deep(.leaflet-interactive){cursor:pointer}.layer-search{display:flex;align-items:center;gap:8px;padding:8px 10px;margin:0 0 14px;border:1px solid #6693a04d;border-radius:6px;background:#12384680}.layer-search svg{width:15px!important;height:15px!important;color:#8ebccb}.layer-search input{width:100%;min-width:0;padding:0;border:0;outline:0;background:transparent;color:#e6f3f5;font:inherit;font-size:12px;line-height:22px}.layer-search:focus-within{border-color:#62c8d9;box-shadow:0 0 0 2px #62c8d922}.layer-search input::placeholder{color:#8eb0be}.config-layer{border-bottom:1px solid #7395a21f;padding-bottom:7px;margin-bottom:6px}.config-layer .display-mode{padding:0 0 0 24px;margin:2px 0 8px;border:0;gap:12px}.config-layer .display-mode label{padding:0;font-size:12px;gap:6px}.legend-group .display-mode{padding:0 0 10px;margin:0 0 8px;border-bottom:0;gap:12px}.legend-group .display-mode legend{display:none}.legend-group .display-mode label{font-size:12px;gap:6px}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.topic-title{max-width:calc(100% - 230px)}.topic-title strong,.topic-title small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:1100px){.geographic-topics .topic-tools{left:auto;right:20px}.topic-title{max-width:calc(100% - 40px)}}
.selection-actions{display:flex;align-items:center;gap:18px;margin-bottom:12px}.selection-actions label,.display-mode label{display:flex;align-items:center;gap:7px;font-size:12px;line-height:1.6;cursor:pointer}.selection-actions label:has(input:disabled){opacity:.4;cursor:not-allowed}.selection-actions small{font-size:12px;color:#83a6b3}.display-mode{display:flex;flex-wrap:wrap;gap:16px;border:0;border-bottom:1px solid #7395a229;padding:0 0 14px;margin:0 0 14px;min-width:0}.display-mode legend{font-size:12px;color:#a7c6cf;margin-bottom:10px}.display-mode input{accent-color:#39c7d5;margin:0;width:14px;height:14px}
.geographic-topics{position:relative;height:100%;min-height:450px;overflow:hidden;background:#173340;color:#e5f2f5;font-family:inherit}.geographic-topics:fullscreen{height:100vh;width:100vw}.topic-map{position:absolute;inset:0;z-index:0}.topic-title{position:absolute;z-index:450;left:24px;top:22px;display:grid;gap:5px;pointer-events:none;text-shadow:0 2px 8px #00141e}.topic-title>span{font-size:12px;letter-spacing:1px;color:#b4e5ef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.topic-title strong{font-size:23px;line-height:1.3}.topic-title small{font-size:12px;color:#d4e9ed}.topic-tools{position:absolute;z-index:510;right:20px;top:20px;display:flex;align-items:center;gap:8px;padding:7px;border-radius:12px;background:#072634e8;box-shadow:0 8px 30px #00162140;backdrop-filter:blur(18px)}.geographic-topics button,.geographic-topics select{font:inherit;color:inherit;box-sizing:border-box}.topic-tools button,.topic-config header button{display:flex;align-items:center;justify-content:center;gap:7px;height:36px;min-width:36px;padding:0 10px;border:0;border-radius:7px;background:transparent;cursor:pointer;font-size:12px}.topic-tools button:hover,.topic-tools button.active,.topic-config header button:hover{background:#1c687d80}.geographic-topics svg{width:18px;height:18px;flex:none}.geographic-topics select{height:36px;max-width:330px;padding:0 28px 0 10px;border:1px solid #6693a04d;border-radius:7px;background:#123846;color:#e6f3f5;font-size:12px}.geographic-topics select option{background:#fff;color:#254652}.topic-status{position:absolute;z-index:520;left:50%;top:85px;transform:translateX(-50%);max-width:75%;padding:10px 16px;border-radius:8px;background:#092b3bea;font-size:12px;box-shadow:0 4px 20px #00141e40}.topic-status button{border:0;background:none;color:#62d7ed;margin-left:12px;cursor:pointer}.topic-legend{position:absolute;z-index:450;left:20px;bottom:42px;width:280px;max-height:calc(100% - 160px);display:flex;flex-direction:column;border-radius:12px;background:linear-gradient(135deg,#123744ed,#092837e6);box-shadow:0 10px 36px #00172255;backdrop-filter:blur(18px);overflow:hidden}.legend-heading{display:flex;align-items:center;gap:10px;padding:15px 16px;background:transparent;border:0;color:#e5f6fa;cursor:pointer;flex:none}.legend-heading b{font-size:14px;font-weight:600}.legend-heading span{margin-left:auto;font-size:12px;color:#82b7c5}.legend-content{padding:0 14px 14px;overflow:auto;scrollbar-width:thin;scrollbar-color:#457385 transparent}.geographic-topics p{font-size:12px;line-height:1.75;color:#a7c6cf;margin:0 0 12px}.topic-note{padding:10px 12px;border-radius:6px;background:#377b8e20}.legend-group{border-top:1px solid #7395a229;padding-top:12px;margin-top:12px}.legend-group h3{font-size:14px;line-height:1.6;margin:0 0 8px;font-weight:500;color:#d5e9ee}.topic-category{display:flex;align-items:center;gap:9px;padding:7px 4px;font-size:12px;cursor:pointer;border-radius:5px}.topic-category:hover{background:#43869c26}.geographic-topics input[type=checkbox]{width:14px;height:14px;accent-color:#39c7d5;flex:none;margin:0}.topic-category img,.source-symbol{width:26px;height:20px;border-radius:2px;object-fit:cover;flex:none;border:1px solid #c9e2e43b}.source-symbol{background:#e7a64333;box-sizing:border-box;border-color:#ebbf7380}.topic-category>span{display:flex;flex-wrap:wrap;column-gap:6px;flex:1;min-width:0;line-height:1.6}.topic-category b{font-weight:400}.topic-category small{font-size:12px;color:#eac37a;width:100%}.topic-category em{font-style:normal;font-variant-numeric:tabular-nums;color:#8cb3c0;font-size:12px}.legend-content footer{border-top:1px solid #7395a229;margin-top:12px;padding-top:12px;font-size:12px;line-height:1.8;color:#83a6b3}.topic-config{position:absolute;z-index:530;right:20px;top:82px;bottom:20px;width:350px;max-width:calc(100% - 40px);display:flex;flex-direction:column;background:linear-gradient(130deg,#103745f5,#092631f2);box-shadow:0 16px 50px #00131b66;border-radius:12px;backdrop-filter:blur(24px);overflow:hidden}.topic-config header{display:flex;align-items:center;justify-content:space-between;flex:none;padding:18px 20px;border-bottom:1px solid #7395a229}.topic-config header small{font-size:12px;letter-spacing:2px;color:#74b3c3}.topic-config h2{font-size:19px;margin:5px 0 0}.config-body{padding:18px;overflow:auto;scrollbar-width:thin;scrollbar-color:#457385 transparent}.config-body section+section{margin-top:22px}.config-body h3{font-size:15px;font-weight:500;display:flex;align-items:center;justify-content:space-between;margin:0 0 12px}.config-body h3 small{font-size:12px;color:#83a6b3}.config-body select{width:100%;max-width:none;margin-bottom:10px}.config-layer label{display:flex;gap:10px;align-items:center;padding:9px 0;cursor:pointer}.config-layer label>span{display:grid;gap:4px;flex:1;min-width:0}.config-layer b{font-size:14px;line-height:1.5;font-weight:400;overflow-wrap:anywhere}.config-layer small{font-size:12px;color:#83a6b3}.config-layer p[role=alert],p[role=alert]{color:#f1ae91}.config-layer button{border:0;background:transparent;color:#66d5ea;cursor:pointer}.topic-drawer-enter-active,.topic-drawer-leave-active{transition:opacity .2s ease,translate .2s ease}.topic-drawer-enter-from,.topic-drawer-leave-to{opacity:0;translate:15px 0}.pending-icon{animation:topic-spin 1.4s linear infinite}@keyframes topic-spin{to{rotate:360deg}}@media(prefers-reduced-motion:reduce){.topic-drawer-enter-active,.topic-drawer-leave-active{transition:none}.pending-icon{animation:none}}@media(max-width:1100px){.topic-title{top:80px;left:20px}.topic-tools{left:20px;right:20px}.topic-tools select{flex:1;min-width:0;max-width:none}.topic-legend{width:240px;max-height:calc(100% - 200px)}}
.topic-map-scale{box-sizing:content-box;position:absolute;z-index:500;right:14px;bottom:10px;padding:6px 8px;color:#f1f6f5;background:transparent;text-shadow:0 1px 2px #001017,0 0 4px #001017;font-size:12px;pointer-events:none}.scale-labels{display:flex;align-items:baseline;justify-content:space-between;gap:8px;line-height:16px}.scale-labels b{font-size:12px;font-weight:500;font-variant-numeric:tabular-nums}.topic-map-scale i{display:block;box-sizing:border-box;height:6px;border:1px solid #e3eeec;background:linear-gradient(to right,#e3eeec 50%,#233e49 50%)}.topic-map-reference{position:absolute;z-index:500;right:14px;bottom:10px;display:flex;align-items:flex-end;gap:12px;pointer-events:none}.topic-map-reference :deep(.overview-scale){position:relative;inset:auto;flex:none}.topic-north{display:grid;justify-items:center;gap:1px;width:24px;padding:0;background:transparent;color:#edf5f3;text-shadow:0 1px 2px #001017,0 0 4px #001017}.topic-north span{font-size:12px;font-weight:600;line-height:16px;letter-spacing:.5px}.topic-north svg{display:block;width:16px;height:24px;filter:drop-shadow(0 1px 2px #001017)}.geographic-topics :deep(.leaflet-bottom.leaflet-right){right:8px;bottom:44px}.geographic-topics :deep(.leaflet-control-zoom){margin:0;border:0;box-shadow:0 4px 14px #00172366}.geographic-topics :deep(.leaflet-control-zoom a){color:#173f54;background:#fffffff2;border-color:#c9dbe3}
/* 详情高度仅随视窗变化；贴底图例独立按内容撑高，位于详情下层，收起详情可查看。 */
.geographic-topics>.topic-tools{z-index:560}
.config-body .config-service-group{margin:10px 0 0;border:1px solid #719dad29;border-radius:7px;overflow:hidden}.config-source-heading{display:flex;align-items:center;gap:8px;min-height:46px;padding:0 10px;background:#23485855}.config-source-toggle{display:flex;align-items:center;gap:8px;flex:1;min-width:0;padding:10px 0;border:0;background:transparent;color:#d9f1f7;font:inherit;text-align:left;cursor:pointer}.config-source-toggle b{font-size:14px;font-weight:500;line-height:1.7;overflow-wrap:anywhere}.config-source-switch{display:flex;align-items:center;gap:5px;flex:none;font-size:12px;cursor:pointer}.config-source-children{padding:0 10px 0 20px}.config-source-children .config-layer:last-child{border-bottom:0;margin-bottom:0}.legend-layer-name{display:grid;flex:1;min-width:0;gap:2px}.legend-layer-name b{color:#d6eaf1}.legend-layer-heading .legend-layer-name small{display:block;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:#81a7b5;line-height:16px}
.topic-legend{top:var(--left-panel-top);bottom:auto;width:var(--details-width);height:var(--details-height);max-height:none;box-sizing:border-box;border:1px solid #88bcd528;border-radius:10px;background:linear-gradient(145deg,#123846ed,#0a2938ed)}
.geographic-topics{--details-top:50px}.topic-legend{top:var(--details-top);bottom:var(--legend-space,22px);height:auto}.topic-details-toggle{top:calc(var(--details-top) + 10px)}
@media(max-width:1100px){.geographic-topics{--details-top:108px}}
.legend-heading{min-height:50px;box-sizing:border-box;flex:0 0 50px;border-bottom:1px solid #7395a229;padding:0 15px;gap:9px;cursor:default}
.legend-content{flex:1;min-height:0;padding:12px;overscroll-behavior:contain;scrollbar-width:none}.legend-content::-webkit-scrollbar{display:none}
.legend-group{margin-top:8px;padding-top:0;border-top:0}.legend-layer-row{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:7px;min-height:42px;border:1px solid #719dad20;border-radius:6px;background:#153746;padding:0 8px}.legend-layer-row:hover{background:#1b4353}
.legend-layer-heading{display:flex;flex:1;min-width:0;align-items:center;gap:7px;width:auto;padding:10px 0;border:0;background:transparent;text-align:left;cursor:pointer}.legend-layer-heading b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:18px}
.disclosure-triangle{display:block;flex:none;width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:5px solid #8cb8c8;transition:transform .18s ease;transform:rotate(0)}.disclosure-triangle.expanded{transform:rotate(90deg)}
.layer-selection-actions{display:flex;flex:none;align-items:center;gap:8px;margin:0}.layer-selection-actions label{gap:4px;font-size:12px;white-space:nowrap}.layer-selection-actions input[type=checkbox]{width:12px;height:12px}
.legend-layer-content{padding:12px 5px 6px 10px;border-left:1px solid #6d9bac25;margin-left:10px}.legend-group .display-mode{gap:10px;margin-bottom:6px}.legend-group .display-mode label{font-size:12px}
.topic-inspector-rail{position:absolute;z-index:525;top:var(--left-panel-top);bottom:60px;right:20px;width:300px;display:flex;flex-direction:column;gap:12px;pointer-events:none}.topic-inspector-rail>*{pointer-events:auto}.topic-farmland-stat{display:flex;flex-direction:column;min-height:0;flex:0 1 auto;max-height:100%;padding:14px;border:1px solid #74cce32b;border-radius:10px;background:linear-gradient(135deg,#143c4bef,#082535ee);box-shadow:0 10px 30px #00131b55;backdrop-filter:blur(18px)}.topic-farmland-stat>header{font-size:14px;line-height:22px;font-weight:600;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid #7395a229}.topic-farmland-stat .topic-statistics{flex:1}.has-details .topic-farmland-stat{max-height:44%}.topic-map.topic-map--drawing.leaflet-grab{cursor:crosshair!important}
.topic-identify-status{top:auto;bottom:8px;max-width:280px}
@media(max-width:1100px){.topic-legend{width:var(--details-width);max-height:none}.topic-inspector-rail{width:280px}}
@media(prefers-reduced-motion:reduce){.disclosure-triangle{transition:none}}
.topic-map--drawing :deep(.jiulong-feature-tooltip){display:none}
.topic-legend>.layer-search{flex:none;margin:12px 12px 0}.legend-content{overflow:auto}.legend-layer-list{display:flex;flex-direction:column;gap:8px;min-height:0}.legend-layer-list>.legend-group{flex:none;margin-top:0}.topic-farmland-stat{max-height:min(68dvh,100%)}.topic-farmland-stat :deep(.analysis-statistics){flex:1;min-height:0}
.published-layer :deep(.layer-display-mode.has-categories){margin-bottom:8px}
</style>
