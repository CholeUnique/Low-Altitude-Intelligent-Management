<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { AnalysisStatistic } from '@/utils/farmland-analysis'
import { formatSquareMetresAsMu } from '@/utils/topic-area'
defineProps<{title:string;metrics?:AnalysisStatistic[];error?:string}>()
const opened=ref(false),pinned=ref(false),anchor=ref<HTMLElement>(),content=ref<HTMLElement>()
const appendTarget=shallowRef<HTMLElement|string>('body')
function syncTarget(){
  // A body-level popper is invisible when the topic map is in the fullscreen top
  // layer. Keep it under the map root, outside the scrolling statistics panel.
  appendTarget.value=anchor.value?.closest<HTMLElement>('.geographic-topics')||document.body
}
const virtualAnchor={getBoundingClientRect(){
  const button=anchor.value?.getBoundingClientRect(),panel=anchor.value?.closest('.topic-farmland-stat,.overlay-result-row')?.getBoundingClientRect()
  return button?new DOMRect(panel?.left??button.left,button.top,panel?.width??button.width,button.height):new DOMRect()
},get contextElement(){return anchor.value}}
let timer:ReturnType<typeof setTimeout>|undefined
function enter(){clearTimeout(timer);syncTarget();opened.value=true}
function leave(){clearTimeout(timer);if(!pinned.value)timer=setTimeout(()=>{opened.value=false},300)}
function toggle(){clearTimeout(timer);syncTarget();pinned.value=!pinned.value;opened.value=pinned.value}
function close(){clearTimeout(timer);pinned.value=false;opened.value=false}
function outside(event:Event){if(!anchor.value?.contains(event.target as Node)&&!content.value?.contains(event.target as Node))close()}
function listen(value:boolean){value?document.addEventListener('pointerdown',outside):document.removeEventListener('pointerdown',outside)}
watch(opened,listen)
onMounted(()=>{syncTarget();document.addEventListener('fullscreenchange',syncTarget)})
onBeforeUnmount(()=>{clearTimeout(timer);document.removeEventListener('pointerdown',outside);document.removeEventListener('fullscreenchange',syncTarget)})
const rate=(value:number|null|undefined)=>value==null?'—':(value*100).toLocaleString('zh-CN',{maximumFractionDigits:2})
</script>
<template>
  <button ref="anchor" class="complete-statistics-help" type="button" :aria-label="`${title}未过滤完整统计`" :aria-expanded="opened" @mouseenter="enter" @mouseleave="leave" @focus="enter" @blur="leave" @click.stop="toggle" @keydown.esc.stop="close">?</button>
  <ElPopover :visible="opened" :virtual-ref="virtualAnchor" virtual-triggering :append-to="appendTarget" :popper-options="{strategy:'fixed'}" :z-index="2400" placement="left-start" :fallback-placements="['left-end','bottom-end','top-end']" :width="360" :show-arrow="true" :teleported="true" popper-class="topic-complete-statistics-popover" :popper-style="{'--el-bg-color-overlay':'#103447','--el-border-color-light':'#537b8b',background:'#103447',color:'#dceff3',border:'1px solid #537b8b',borderRadius:'12px',padding:'16px',boxShadow:'0 10px 32px #00172266',maxWidth:'calc(100vw - 24px)'}">
    <section ref="content" class="complete-statistics-content" :aria-label="`${title}完整统计`" @mouseenter="enter" @mouseleave="leave" @keydown.esc="close">
      <header><b>完整统计（未过滤）</b><button type="button" aria-label="关闭完整统计" @click="close">×</button></header>
      <p>{{ title }} · 未应用最小图斑面积过滤</p>
      <dl v-if="metrics?.length"><div v-for="metric in metrics" :key="metric.label" :class="{'ratio-row':metric.areaSqm===undefined}"><dt>{{ metric.label }}</dt><dd><strong>{{ metric.areaSqm===undefined?rate(metric.ratio):formatSquareMetresAsMu(metric.areaSqm) }}</strong><small v-if="metric.areaSqm!==undefined||metric.ratio!=null">{{ metric.areaSqm===undefined?'%':'亩' }}</small></dd></div></dl>
      <p v-else class="complete-statistics-empty" role="status">{{ error||'后端暂未返回未过滤的完整统计，请重新分析后查看。' }}</p>
    </section>
  </ElPopover>
</template>
<style scoped>
.complete-statistics-help{display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;padding:0;border:1px solid #8dd7df99;border-radius:50%;background:#65cfdf12;color:#a8e9ee;font-family:inherit;font-size:12px;font-weight:700;line-height:1;cursor:pointer;vertical-align:middle;transition:background .15s,border-color .15s}.complete-statistics-help:hover,.complete-statistics-help:focus-visible,.complete-statistics-help[aria-expanded=true]{background:#51d4e433;border-color:#8ce9f2;outline:2px solid transparent}.complete-statistics-content{font-family:inherit;color:#dceff3;max-height:min(65vh,540px);overflow:auto;scrollbar-width:none}.complete-statistics-content::-webkit-scrollbar{display:none}header{display:flex;align-items:center;justify-content:space-between;gap:12px}header b{font-size:15px;line-height:24px}header button{border:0;background:transparent;color:#b8d4df;font-size:20px;cursor:pointer}p{font-size:12px;line-height:20px;color:#abc6d1;margin:8px 0 14px;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 12px;margin:0}dt{font-size:12px;line-height:20px;color:#abc6d1}dd{display:flex;flex-wrap:nowrap;align-items:baseline;gap:4px;margin:4px 0 0;white-space:nowrap}strong{flex:none;font-size:18px;line-height:26px;font-weight:700;color:#80e6ee;font-variant-numeric:tabular-nums;white-space:nowrap;overflow-wrap:normal}small{flex:none;font-size:12px;color:#abc6d1;white-space:nowrap}.ratio-row{grid-column:1/-1;display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #719dad38;padding-top:10px}.ratio-row dd{margin:0}.complete-statistics-empty{margin-bottom:0}
</style>
