<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Compass, MapLocation, Close } from '@element-plus/icons-vue'
import TaskLocationPreview from '@/components/TaskLocationPreview.vue'
import { getGovernanceTaskDetail, getGovernanceTaskGeometry, type TaskGeometryFeatureCollection } from '@/api/governance-task'
import { facilityTaskGeometry } from '@/utils/facility-task'
import { geometryLocation } from '@/utils/geometry-location'
import { workspaceToolsLayout } from '@/utils/workspace-tools-layout'

const props=defineProps<{taskId:string;deptId?:string;taskName?:string;geometry?:TaskGeometryFeatureCollection}>()
const root=ref<HTMLElement>(),expanded=ref(false),locationOpen=ref(false),dragging=ref(false)
const geometry=ref<TaskGeometryFeatureCollection>(),loading=ref(false),error=ref('')
const width=ref(1000),height=ref(700),requestedTop=ref(450)
const layout=computed(()=>workspaceToolsLayout(width.value,height.value,requestedTop.value))
let observer:ResizeObserver|undefined,version=0,loadedContext='',ignoredClickUntil=0
let drag:{pointerId:number;startY:number;startX:number;top:number;handle:HTMLElement;moved:boolean}|undefined
const context=computed(()=>`${props.deptId}:${props.taskId}`)
async function load(){
  if(geometryLocation(props.geometry)){geometry.value=props.geometry;return}
  if(loadedContext===context.value&&geometry.value)return
  const request=++version,captured=context.value;loading.value=true;error.value=''
  try{
    if(props.taskId.startsWith('demo-'))throw new Error('当前演示任务尚未提供真实位置。')
    let data:TaskGeometryFeatureCollection|undefined
    try{data=await getGovernanceTaskGeometry(props.taskId,undefined,false,props.deptId)}catch{/* Facility task detail may carry its point, line or polygon. */}
    if(!geometryLocation(data))data=facilityTaskGeometry(await getGovernanceTaskDetail(props.taskId))
    if(request===version){geometry.value=data;loadedContext=captured}
  }catch(reason){if(request===version)error.value=reason instanceof Error?reason.message:'任务位置读取失败'}
  finally{if(request===version)loading.value=false}
}
watch(context,()=>{version++;loadedContext='';geometry.value=undefined;error.value='';loading.value=false;locationOpen.value=false;expanded.value=false})
watch(()=>props.geometry,value=>{if(geometryLocation(value)){version++;geometry.value=value;loading.value=false}else{geometry.value=undefined;loadedContext='';if(locationOpen.value)void load()}})
function toggleBall(){if(performance.now()<ignoredClickUntil)return;expanded.value=!expanded.value;if(!expanded.value)locationOpen.value=false}
function toggleLocation(){locationOpen.value=!locationOpen.value;if(locationOpen.value)void load()}
function startDrag(event:PointerEvent){
  if(event.button!==0||!event.isPrimary)return
  const handle=event.currentTarget as HTMLElement
  drag={pointerId:event.pointerId,startY:event.clientY,startX:event.clientX,top:layout.value.top,handle,moved:false};handle.setPointerCapture(event.pointerId)
}
function moveDrag(event:PointerEvent){
  if(!drag||drag.pointerId!==event.pointerId)return
  if(Math.hypot(event.clientY-drag.startY,event.clientX-drag.startX)>5)drag.moved=true
  if(drag.moved){dragging.value=true;requestedTop.value=workspaceToolsLayout(width.value,height.value,drag.top+event.clientY-drag.startY).top}
}
function endDrag(event?:PointerEvent){
  if(!drag||(event&&event.pointerId!==drag.pointerId))return
  const previous=drag;drag=undefined;dragging.value=false;requestedTop.value=layout.value.top
  if(previous.moved)ignoredClickUntil=performance.now()+350
  if(previous.handle.hasPointerCapture(previous.pointerId))previous.handle.releasePointerCapture(previous.pointerId)
}
function moveWithKey(event:KeyboardEvent){
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return
  event.preventDefault();requestedTop.value=event.key==='Home'?12:event.key==='End'?height.value:event.key==='ArrowUp'?layout.value.top-24:layout.value.top+24
}
function escape(event:KeyboardEvent){if(event.key==='Escape'){locationOpen.value=false;expanded.value=false}}
onMounted(()=>{
  let first=true
  observer=new ResizeObserver(()=>{if(!root.value)return;width.value=root.value.clientWidth;height.value=root.value.clientHeight;if(first){requestedTop.value=height.value*.68;first=false}else requestedTop.value=layout.value.top})
  if(root.value)observer.observe(root.value)
  document.addEventListener('keydown',escape)
})
onBeforeUnmount(()=>{version++;endDrag();observer?.disconnect();document.removeEventListener('keydown',escape)})
</script>
<template>
  <aside ref="root" class="workspace-tools" :class="{'is-dragging':dragging}" aria-label="工作台悬浮工具">
    <Transition name="tool-panel"><section v-if="expanded&&locationOpen" id="workspace-location-tool" class="workspace-tool-panel" :style="{right:`${layout.panelRight}px`,top:`${layout.panelTop}px`,width:`${layout.panelWidth}px`,maxHeight:`${layout.panelHeight}px`}" aria-label="任务位置工具"><button type="button" class="tool-panel-close" aria-label="收起任务位置" @click="locationOpen=false"><Close/></button><TaskLocationPreview :geo-json="geometry" :loading="loading" :error="error" :cgcs2000="true" navigation :destination-name="taskName||'任务地块位置'"/><button v-if="error" class="tool-retry" type="button" @click="load">重新读取位置</button></section></Transition>
    <Transition name="tool-strip"><nav v-if="expanded" class="workspace-tool-strip" :style="{right:`${layout.toolbarRight}px`,top:`${layout.toolbarTop}px`}" aria-label="工作台工具栏"><button type="button" title="任务位置与导航" aria-label="任务位置与导航" aria-controls="workspace-location-tool" :aria-expanded="locationOpen" :class="{active:locationOpen}" @click="toggleLocation"><MapLocation/></button></nav></Transition>
    <button type="button" class="workspace-tool-ball" :style="{right:`${layout.right}px`,top:`${layout.top}px`}" :class="{expanded}" :aria-expanded="expanded" aria-label="工作台工具，沿右侧上下拖动" title="点击展开工具，按住沿右侧上下拖动" @click="toggleBall" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag" @keydown="moveWithKey"><Compass/><span class="tool-ball-light" aria-hidden="true"/></button>
  </aside>
</template>
<style scoped>
.workspace-tools{position:absolute;inset:0;z-index:520;pointer-events:none;overflow:hidden;font:12px/1.5 var(--ui-font);color:#dff5fc}.workspace-tool-ball,.workspace-tool-strip,.workspace-tool-panel{position:absolute;pointer-events:auto;box-sizing:border-box}.workspace-tool-ball{z-index:3;display:grid;place-items:center;width:52px;height:52px;padding:10px;border:1px solid #73e2ed;border-radius:50%;background:radial-gradient(circle at 30% 20%,#287c94,#0d3b54 65%,#082b42);color:#aaf7ff;box-shadow:0 4px 18px #001b4059,inset 0 0 12px #50e2ff29;cursor:grab;touch-action:none;user-select:none;transition:top .18s ease,box-shadow .18s ease}.workspace-tool-ball>svg{width:30px;height:30px;transition:transform .2s}.workspace-tool-ball.expanded{box-shadow:0 0 0 4px #36c8dc24,0 5px 18px #001b4059}.workspace-tool-ball.expanded>svg{transform:rotate(45deg)}.tool-ball-light{position:absolute;right:5px;top:5px;width:6px;height:6px;border:1px solid #b6ffff;border-radius:50%;background:#59e8eb}.is-dragging .workspace-tool-ball{cursor:grabbing;transition:none}.workspace-tool-strip{z-index:2;display:flex;gap:6px;padding:4px;border:1px solid #5ba7bc;border-radius:12px;background:#0c3044f5;box-shadow:0 4px 16px #001e3540}.workspace-tool-strip button{width:38px;height:38px;display:grid;place-items:center;padding:8px;border:0;border-radius:8px;background:transparent;color:#c6eaf4;cursor:pointer}.workspace-tool-strip button.active,.workspace-tool-strip button:hover{background:#1c6d83;color:#85f2fc}.workspace-tool-strip svg{width:22px;height:22px}.workspace-tool-panel{z-index:1;overflow:auto;overscroll-behavior:contain;border-radius:10px;background:#0c3044;box-shadow:0 8px 28px #00152666;scrollbar-width:thin}.workspace-tool-panel :deep(.task-location-preview>header){padding-right:38px;align-items:flex-start;flex-direction:column;gap:2px}.workspace-tool-panel :deep(.location-map){height:210px}.tool-panel-close{position:absolute;top:8px;right:8px;z-index:2;display:grid;place-items:center;width:26px;height:26px;padding:4px;border:0;border-radius:5px;background:#16475a;color:#d6f4fc;cursor:pointer}.tool-panel-close svg{width:17px;height:17px}.tool-retry{margin:0 10px 10px;border:1px solid #54b9ce;background:#10516a;color:#defaff;border-radius:5px;padding:6px 10px;cursor:pointer}.workspace-tools button:focus-visible{outline:2px solid #84efff;outline-offset:3px}.tool-strip-enter-active,.tool-strip-leave-active,.tool-panel-enter-active,.tool-panel-leave-active{transition:opacity .16s,transform .16s}.tool-strip-enter-from,.tool-strip-leave-to,.tool-panel-enter-from,.tool-panel-leave-to{opacity:0;transform:translateX(8px)}@media(prefers-reduced-motion:reduce){.workspace-tool-ball,.workspace-tool-ball>svg,.tool-strip-enter-active,.tool-strip-leave-active,.tool-panel-enter-active,.tool-panel-leave-active{transition:none}}
</style>
