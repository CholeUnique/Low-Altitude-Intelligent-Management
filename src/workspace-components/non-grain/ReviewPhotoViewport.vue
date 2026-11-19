<script setup lang="ts">
import { ref, watch } from 'vue'
const props=defineProps<{src:string;alt?:string}>()
const zoom=ref(1),x=ref(0),y=ref(0),dragging=ref(false),hint=ref(false)
let start:{x:number;y:number;left:number;top:number}|undefined
function reset(){zoom.value=1;x.value=0;y.value=0;dragging.value=false;hint.value=false;start=undefined}
watch(()=>props.src,reset)
function wheel(event:WheelEvent){
  const rect=(event.currentTarget as HTMLElement).getBoundingClientRect()
  const next=Math.max(1,Math.min(12,zoom.value*Math.exp(-event.deltaY*.0015)))
  const ratio=next/zoom.value,px=event.clientX-rect.left-rect.width/2,py=event.clientY-rect.top-rect.height/2
  x.value=px-(px-x.value)*ratio;y.value=py-(py-y.value)*ratio;zoom.value=next
  if(next===1){x.value=0;y.value=0}
}
function down(event:PointerEvent){if(event.button!==0)return;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);start={x:event.clientX,y:event.clientY,left:x.value,top:y.value};dragging.value=true;hint.value=true}
function move(event:PointerEvent){if(start){x.value=start.left+event.clientX-start.x;y.value=start.top+event.clientY-start.y}}
function up(){start=undefined;dragging.value=false;hint.value=false}
</script>
<template>
  <div class="review-photo-viewport" :class="{dragging}" tabindex="0" aria-label="无人机图片，可滚轮缩放、拖动平移，双击复位" @wheel.prevent.stop="wheel" @pointerdown.prevent="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up" @dblclick="reset" @keydown.esc="reset" @keydown.home.prevent="reset">
    <img :src="src" :alt="alt || '无人机复核凭证'" draggable="false" :style="{transform:`translate(${x}px,${y}px) scale(${zoom})`}" />
    <span v-if="hint" class="photo-hint" role="status">图片独立缩放与平移，不参与地图联动</span>
    <button v-if="zoom!==1 || x || y" type="button" class="photo-reset" @pointerdown.stop @click.stop="reset">复位</button>
  </div>
</template>
<style scoped>
.review-photo-viewport{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:grab;background:#eaf0f5;outline-offset:-2px}.review-photo-viewport.dragging{cursor:grabbing}.review-photo-viewport img{display:block;width:100%;height:100%;max-width:none;object-fit:cover;user-select:none;pointer-events:none;transform-origin:center}.photo-hint{position:absolute;bottom:5px;left:5px;right:5px;padding:5px;border-radius:4px;background:#072941dd;color:#edf8ff;font:12px/1.5 var(--ui-font);pointer-events:none}.photo-reset{position:absolute;right:5px;top:5px;border:1px solid #a8ceeb;border-radius:4px;background:#fff;color:#1673b5;font:12px var(--ui-font);padding:4px 7px;cursor:pointer}
</style>
