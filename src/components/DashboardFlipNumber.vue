<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
const props=defineProps<{value:string|number|undefined}>()
const text=computed(()=>String(props.value ?? '—')),previous=ref(text.value),flipping=ref(false)
let timer:ReturnType<typeof setTimeout>|undefined
watch(text,(value,old)=>{
  clearTimeout(timer);previous.value=old
  flipping.value=value!==old && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  timer=setTimeout(()=>{flipping.value=false;previous.value=value},650)
})
onBeforeUnmount(()=>clearTimeout(timer))
</script>
<template>
  <span class="dashboard-flip-number" :class="{'is-flipping':flipping}"><span class="flip-accessible">{{ text }}</span><span v-for="(character,index) in text" :key="index" class="flip-cell" :class="{'flip-cell--changed':previous[index]!==character}" :style="{'--digit-delay':`${Math.min(index,5)*24}ms`}" aria-hidden="true"><span class="flip-current">{{ character }}</span><span v-if="flipping && previous[index]!==character" class="flip-old">{{ previous[index] || character }}</span></span></span>
</template>
<style scoped>
.flip-accessible{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.dashboard-flip-number{display:inline-flex!important;align-items:baseline;gap:0;color:inherit!important;font:inherit!important;line-height:inherit!important;white-space:nowrap;vertical-align:baseline;font-variant-numeric:tabular-nums;letter-spacing:inherit!important}.flip-cell{position:relative;display:inline-grid!important;perspective:160px;font:inherit!important;line-height:inherit!important;color:inherit!important;letter-spacing:inherit!important}.flip-current{grid-area:1/1;font:inherit!important;line-height:inherit!important;color:inherit!important}.flip-old{position:absolute;inset:0;font:inherit!important;line-height:inherit!important;color:inherit!important;backface-visibility:hidden;transform-origin:center}.is-flipping .flip-cell--changed .flip-current{animation:digit-arrive .55s cubic-bezier(.2,.7,.2,1) var(--digit-delay) both;transform-origin:center}.is-flipping .flip-old{animation:digit-depart .3s ease-in var(--digit-delay) both}@keyframes digit-arrive{0%,35%{opacity:0;transform:rotateX(75deg)}100%{opacity:1;transform:rotateX(0)}}@keyframes digit-depart{to{opacity:0;transform:rotateX(-85deg)}}@media(prefers-reduced-motion:reduce){.flip-current,.flip-old{animation:none!important}.flip-old{display:none}}
</style>
