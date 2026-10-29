<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import { EditPen, Location, Connection, ArrowDown } from '@element-plus/icons-vue'
import { geodesicArea, formatArea, formatDistance } from '@/utils/map-measurement'
const props = defineProps<{map:L.Map; suspended?:boolean}>()
const emit = defineEmits<{drawing:[active:boolean];overlay:[]}>()
type Tool = 'distance'|'area'|'marker'
const menu = ref<'measure'|'annotation'|'analysis'>(), tool = ref<Tool>(), message = ref('')
const measurements = L.layerGroup(), annotations = L.layerGroup()
let points: L.LatLng[] = [], doubleClickEnabled = false, boundMap: L.Map | undefined
function stopDrawing() {
  tool.value = undefined
  if (doubleClickEnabled && boundMap?.getPane('mapPane')?.isConnected) boundMap.doubleClickZoom.enable()
  doubleClickEnabled = false
  emit('drawing',false)
}
function toggleMenu(next: typeof menu.value) {
  menu.value = menu.value === next ? undefined : next
}
function start(next: Tool) {
  stopDrawing(); tool.value = next; menu.value = undefined; points = []
  if (next !== 'marker') measurements.clearLayers()
  doubleClickEnabled = props.map.doubleClickZoom.enabled(); props.map.doubleClickZoom.disable()
  message.value = next === 'marker' ? '点击地图添加标注，可拖动调整位置；Esc 退出' : next === 'area' ? '点击绘制范围，右键完成；Esc 退出' : '点击选取测距点，右键完成；Esc 退出'
  emit('drawing',true)
}
function redraw(cursor?:L.LatLng) {
  measurements.clearLayers()
  const path = cursor ? [...points,cursor] : points
  const style = {pane:'topic-tools',interactive:false,color:'#43e4e7',weight:2,fillColor:'#43e4e7',fillOpacity:.16,dashArray:cursor?'6 5':undefined}
  points.forEach((point,index) => L.circleMarker(point,{...style,radius:4,fillOpacity:1}).bindTooltip(String(index+1),{permanent:true,direction:'top',className:'topic-measure-index'}).addTo(measurements))
  if (path.length<2) return
  if (tool.value === 'area' && path.length>2) {
    L.polygon(path,style).addTo(measurements); message.value = `测量面积：${formatArea(geodesicArea(path))}`
  } else {
    L.polyline(path,style).addTo(measurements)
    if (tool.value === 'distance') message.value = `测量距离：${formatDistance(path.slice(1).reduce((sum,point,index)=>sum+props.map.distance(path[index]!,point),0))}`
  }
}
function click(event:L.LeafletMouseEvent) {
  menu.value = undefined
  if (!tool.value) return
  if (tool.value === 'marker') {
    const icon = L.divIcon({className:'topic-tool-marker',iconSize:[28,36],iconAnchor:[14,34],html:'<svg width="28" height="36" viewBox="0 0 28 36"><path d="M14 35C10 28 2 21 2 14a12 12 0 0 1 24 0c0 7-8 14-12 21Z" fill="#31cbd8" stroke="#e5ffff" stroke-width="2"/><circle cx="14" cy="14" r="4" fill="#123b50"/></svg>'})
    const marker = L.marker(event.latlng,{icon,draggable:true}).addTo(annotations)
    const content = () => `地图标注<br>${marker.getLatLng().lng.toFixed(6)}, ${marker.getLatLng().lat.toFixed(6)}`
    marker.bindPopup(content).openPopup(); marker.on('dragend',()=>marker.setPopupContent(content()))
  } else { points.push(event.latlng); redraw() }
}
function move(event:L.LeafletMouseEvent) { if (tool.value && tool.value !== 'marker' && points.length) redraw(event.latlng) }
function finish(event:L.LeafletMouseEvent) {
  if (!tool.value) return
  event.originalEvent?.preventDefault()
  if (tool.value === 'marker') { stopDrawing(); message.value = ''; return }
  if (points.length < (tool.value === 'area' ? 3 : 2)) { message.value = tool.value === 'area' ? '面积测量至少需要 3 个点' : '距离测量至少需要 2 个点'; return }
  redraw(); stopDrawing()
}
function clearMeasure() { measurements.clearLayers(); points=[]; if(tool.value!=='marker')stopDrawing(); message.value=''; menu.value=undefined }
function clearAnnotations() { annotations.clearLayers(); if(tool.value==='marker')stopDrawing(); message.value=''; menu.value=undefined }
function key(event:KeyboardEvent) { if(event.key==='Escape'){ stopDrawing(); menu.value=undefined; message.value='' } }
function unbind() {
  stopDrawing(); boundMap?.off('click',click).off('mousemove',move).off('contextmenu',finish)
  measurements.remove(); annotations.remove()
}
watch(()=>props.map,map=>{
  unbind(); boundMap=map
  if(!map.getPane('topic-tools'))map.createPane('topic-tools').style.zIndex='460'
  measurements.addTo(map); annotations.addTo(map)
  map.on('click',click).on('mousemove',move).on('contextmenu',finish)
},{immediate:true})
watch(()=>props.suspended,value=>{if(value){stopDrawing();menu.value=undefined;message.value=''}})
window.addEventListener('keydown',key)
onBeforeUnmount(()=>{unbind();window.removeEventListener('keydown',key)})
</script>
<template>
  <nav class="topic-tools" aria-label="专题地图操作" @keydown.esc="menu=undefined">
    <div class="tool-actions">
      <div class="tool-dropdown">
        <button :class="{active:menu==='measure'||tool==='distance'||tool==='area'}" :aria-expanded="menu==='measure'" @click="toggleMenu('measure')"><EditPen /><span>测量</span><ArrowDown class="down" /></button>
        <div v-if="menu==='measure'" class="tool-menu" aria-label="测量选项"><button @click="start('distance')">距离测量</button><button @click="start('area')">面积测量</button><button @click="clearMeasure">清除测量</button></div>
      </div>
      <div class="tool-dropdown">
        <button :class="{active:menu==='annotation'||tool==='marker'}" :aria-expanded="menu==='annotation'" @click="toggleMenu('annotation')"><Location /><span>标注</span><ArrowDown class="down" /></button>
        <div v-if="menu==='annotation'" class="tool-menu" aria-label="标注选项"><button @click="start('marker')">添加标注</button><button @click="clearAnnotations">清除标注</button></div>
      </div>
      <div class="tool-dropdown">
        <button :class="{active:menu==='analysis'}" :aria-expanded="menu==='analysis'" @click="toggleMenu('analysis')"><Connection /><span>空间分析</span><ArrowDown class="down" /></button>
        <div v-if="menu==='analysis'" class="tool-menu" aria-label="空间分析选项"><button @click="stopDrawing(); menu=undefined; emit('overlay')">对称差分</button></div>
      </div>
      <span class="tool-divider"></span><slot />
    </div>
    <div v-if="message" class="tool-feedback" role="status"><span>{{ message }}</span><button aria-label="关闭工具提示" @click="message=''">×</button></div>
  </nav>
</template>
<style scoped>
:global(.topic-measure-index){padding:2px 5px;border:1px solid #6bbcd455;border-radius:4px;background:#0d3042ed;color:#c9eff8;box-shadow:0 3px 8px #00182640;font:11px/16px 'Microsoft YaHei',sans-serif}:global(.topic-measure-index.leaflet-tooltip-top:before){border-top-color:#0d3042ed}
.topic-tools{position:absolute;z-index:550;right:20px;top:20px;padding:6px;border:1px solid #83cae027;border-radius:10px;background:linear-gradient(130deg,#133c4bef,#082736f2);box-shadow:0 8px 28px #001b2a40;backdrop-filter:blur(18px);color:#def1f5}.tool-actions{display:flex;align-items:center;gap:4px}.tool-actions :deep(button){height:34px;display:flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:6px;padding:0 9px;color:inherit;background:transparent;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}.tool-actions :deep(button:hover),.tool-actions :deep(button.active){background:#398f9c38;color:#a1f0f5}.tool-actions :deep(svg){width:16px;height:16px;flex:none}.tool-actions .down{width:10px;height:10px;color:#83acb9}.tool-divider{width:1px;height:20px;background:#83c8d82b;margin:0 4px}.tool-dropdown{position:relative}.tool-menu{position:absolute;top:calc(100% + 12px);left:0;min-width:130px;padding:5px;border:1px solid #79bed530;border-radius:8px;background:#0b2b3af5;box-shadow:0 10px 24px #00172566;backdrop-filter:blur(18px)}.tool-menu button{width:100%;justify-content:flex-start}.tool-menu--empty{padding:14px;color:#8fbbc8;font-size:12px}.tool-feedback{position:absolute;right:calc(100% + 12px);top:0;width:230px;display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border:1px solid #6bbdce35;border-radius:8px;background:#0b2b3af0;font-size:12px;line-height:1.6;box-shadow:0 6px 18px #00162444}.tool-feedback span{flex:1}.tool-feedback button{border:0;background:transparent;color:#b2d5e0;cursor:pointer}@media(max-width:1100px){.tool-actions :deep(button){font-size:11px;padding:0 6px;gap:4px}.tool-feedback{right:0;top:calc(100% + 140px)}}
</style>
