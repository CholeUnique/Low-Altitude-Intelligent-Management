<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LandGeometry, LandTask, SupervisionRegion, LandTopicObject } from '@/types/land-supervision'
import type { MapServiceItem } from '@/api/map-service'
import { createMapServiceLayer, MAP_SERVICE_IMAGERY_PANE, MAP_SERVICE_VECTOR_PANE } from '@/utils/map-service-layer'
import { createDrawingFeature } from '@/utils/map-drawing'
const props = defineProps<{ regions: SupervisionRegion[]; objects?:LandTopicObject[]; tasks: LandTask[]; selectedId?: string; focus?: LandGeometry; imagery?: MapServiceItem; draft?: LandGeometry; fitImagery?:boolean; allTasks?:boolean; view?: {center:[number,number];zoom:number;source:symbol} }>()
const emit = defineEmits<{ select: [id: string]; 'select-object':[id:string]; drawn: [kind: 'region'|'plot', geometry: GeoJSON.Polygon]; drawing: [active: boolean]; 'view-change':[view:{center:[number,number];zoom:number;source:symbol}] }>()
const canvas = ref<HTMLElement>(), drawing = ref<'region'|'plot'>(), message = ref(''), mapError = ref('')
let map: L.Map | undefined, observer: ResizeObserver | undefined, geometryLayer: L.LayerGroup, sketch: L.LayerGroup, imageryLayer: L.Layer | undefined, imageVersion = 0
let vertices: L.LatLng[] = []
const source=Symbol('land-map')
let syncing=false
function applyView(view=props.view){
  if(!map||!view||view.source===source)return
  const center=map.getCenter()
  if(map.getZoom()===view.zoom&&Math.abs(center.lat-view.center[0])<1e-9&&Math.abs(center.lng-view.center[1])<1e-9)return
  syncing=true;map.setView(view.center,view.zoom,{animate:false});syncing=false
}
function stop() { drawing.value = undefined; vertices = []; sketch?.clearLayers(); map?.doubleClickZoom.enable(); emit('drawing',false); message.value = '' }
function start(kind: 'region'|'plot') { stop(); drawing.value = kind; map?.doubleClickZoom.disable(); emit('drawing',true); message.value = '点击添加顶点，右键完成；Esc 取消。一次圈定一个面。' }
function sketchAt(cursor?: L.LatLng) {
  sketch.clearLayers(); const path = cursor ? [...vertices,cursor] : vertices
  if (path.length>1) L.polygon(path,{color:'#fff064',fillOpacity:.12,interactive:false}).addTo(sketch)
  vertices.forEach(p => L.circleMarker(p,{radius:4,color:'#fff064',interactive:false}).addTo(sketch))
}
function finish() {
  if(!drawing.value)return
  try { const feature = createDrawingFeature('polygon',vertices.map(p=>[p.lng,p.lat]),1); const kind=drawing.value; stop(); emit('drawn',kind,feature.geometry as GeoJSON.Polygon) }
  catch(error) { message.value=error instanceof Error?error.message:'请重画有效面。' }
}
function key(event: KeyboardEvent) { if(event.key==='Escape')stop() }
function locate(geometry?: LandGeometry) { if(!map||!geometry)return; const bounds=L.geoJSON(geometry).getBounds(); if(bounds.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:18}) }
function render() {
  if(!map)return; geometryLayer.clearLayers()
  props.regions.forEach(region=>L.geoJSON(region.geometry,{style:{color:'#56d8ed',weight:2,fillOpacity:.045,dashArray:'7 5'}}).bindTooltip(region.name).addTo(geometryLayer))
  props.objects?.forEach(item=>L.geoJSON(item.geometry,{style:{color:item.objectType==='CONFIRMED'?'#ff897d':'#ffc75b',weight:2,fillOpacity:.2}}).bindTooltip(item.name).on('click',()=>{if(!drawing.value)emit('select-object',item.id)}).addTo(geometryLayer))
  props.tasks.forEach(task=>{
    if(!task.geometry)return
    const selected=props.selectedId===task.id, color=task.stage==='CLOSED'?'#33d9ab':task.stage==='TRANSFERRED'?'#a691f7':'#ffc75b'
    L.geoJSON(task.geometry,{style:{color:selected?'#fff064':color,weight:selected?4:2,fillColor:color,fillOpacity:selected?.48:.22}}).bindTooltip(task.name).on('click',()=>{if(!drawing.value)emit('select',task.id)}).addTo(geometryLayer)
  })
  if(props.draft)L.geoJSON(props.draft,{style:{color:'#ff836f',weight:3,fillOpacity:.24}}).addTo(geometryLayer)
}
async function loadImagery(){
  const request=++imageVersion; imageryLayer?.remove(); imageryLayer=undefined; mapError.value=''
  if(!map||!props.imagery)return
  try{const handle=await createMapServiceLayer(props.imagery);if(request!==imageVersion||!map)return;imageryLayer=handle.layer;imageryLayer.addTo(map);if(props.fitImagery&&!props.focus&&!props.regions.length&&handle.bounds?.isValid())map.fitBounds(handle.bounds,{padding:[20,20],maxZoom:18,animate:false})}
  catch(error){if(request===imageVersion)mapError.value=error instanceof Error?error.message:'影像加载失败。'}
}
onMounted(()=>{
  if(!canvas.value)return
  map=L.map(canvas.value,{center:[32.49,119.92],zoom:13,zoomControl:false,attributionControl:false,maxZoom:22})
  map.createPane(MAP_SERVICE_IMAGERY_PANE).style.zIndex='250'; map.createPane(MAP_SERVICE_VECTOR_PANE).style.zIndex='350'
  const token=import.meta.env.VITE_TIANDITU_TOKEN
  if(token)for(const type of ['img','cia'])L.tileLayer(`https://t{s}.tianditu.gov.cn/${type}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${type}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`,{subdomains:['0','1','2','3'],maxNativeZoom:18,maxZoom:22}).addTo(map)
  else mapError.value='未配置底图，请选择已授权的背景影像。'
  L.control.zoom({position:'bottomright'}).addTo(map)
  L.control.scale({position:'bottomleft',imperial:false,maxWidth:100}).addTo(map)
  geometryLayer=L.layerGroup().addTo(map); sketch=L.layerGroup().addTo(map)
  map.on('click',event=>{if(drawing.value){vertices.push(event.latlng);sketchAt()}})
  map.on('mousemove',event=>{if(drawing.value)sketchAt(event.latlng)})
  map.on('contextmenu',event=>{if(drawing.value){event.originalEvent.preventDefault();finish()}})
  map.on('moveend',()=>{if(map&&!syncing){const center=map.getCenter();emit('view-change',{center:[center.lat,center.lng],zoom:map.getZoom(),source})}})
  observer=new ResizeObserver(()=>map?.invalidateSize());observer.observe(canvas.value);window.addEventListener('keydown',key)
  render();if(props.focus)locate(props.focus);else if(props.regions.length){const bounds=L.featureGroup(props.regions.map(r=>L.geoJSON(r.geometry))).getBounds();map.fitBounds(bounds,{padding:[25,25]})}
  void loadImagery()
  applyView()
})
onBeforeUnmount(()=>{imageVersion++;window.removeEventListener('keydown',key);observer?.disconnect();map?.remove();map=undefined})
watch(()=>[props.regions,props.objects,props.tasks,props.selectedId,props.draft],render,{deep:true})
watch(()=>props.focus,locate);watch(()=>props.imagery,loadImagery)
watch(()=>props.view,applyView)
defineExpose({start,stop,locate})
</script>
<template><div class="land-scene-map"><div ref="canvas" class="land-scene-canvas" /><div class="land-map-north" role="img" aria-label="指北针，正北朝上"><b>N</b><svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 2 21 29 12 23Z" fill="#ddf6ff"/><path d="M12 2 3 29 12 23Z" fill="#40bfd6"/></svg></div><div v-if="message" class="land-map-hint" role="status">{{ message }}<button @click="finish">完成绘制</button><button @click="stop">取消</button></div><p v-if="mapError" class="land-map-error" role="alert">{{ mapError }}</p><div class="land-map-key"><span v-if="regions.length" class="key-region">┄ 监管范围</span><span v-if="tasks.length" class="key-task">■ {{ allTasks?'全部任务':'当前页任务' }}</span><span v-if="draft||selectedId" class="key-selected">■ 选中地块</span></div></div></template>
<style scoped>
.land-scene-map{position:relative;height:100%;min-height:300px;background:#0c3445}.land-scene-canvas{position:absolute;inset:0}.land-map-hint,.land-map-error,.land-map-key{position:absolute;z-index:500;border:1px solid #80c6df40;background:#072941ee;color:#deeffb;border-radius:8px;padding:9px 12px;font-size:12px}.land-map-hint{top:70px;left:12px;right:12px}.land-map-error{bottom:48px;left:12px;max-width:80%}.land-map-key{bottom:12px;right:44px;left:auto;display:flex;gap:15px}.land-map-key .key-region{color:#56d8ed}.land-map-key .key-task{color:#ffc75b}.land-map-key .key-selected{color:#fff064}.land-map-hint button{margin-left:8px;background:#225673;color:white;border:1px solid #78c9de60;border-radius:4px;font:inherit;padding:3px 7px}
</style>
<style scoped>
.land-map-north{position:absolute;right:12px;top:84px;z-index:480;display:grid;justify-items:center;gap:1px;pointer-events:none;color:#e7f7ff;text-shadow:0 1px 3px #001b2f}.land-map-north b{font-size:12px;line-height:16px}.land-map-north svg{width:22px;height:30px;filter:drop-shadow(0 1px 2px #001b2f)}
.land-map-key:empty{display:none}
.land-scene-map :deep(.leaflet-control-scale-line){background:#072941d9;border-color:#c6e5ef;color:#e2f4ff;text-shadow:none}
</style>
