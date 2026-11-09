<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{ speed?: number }>(), { speed: 20 })
const viewport = ref<HTMLElement>()
const content = ref<HTMLElement>()
const looping = ref(false)
let observer: ResizeObserver | undefined
let frame = 0
let previousTime = 0
let position = 0
const hovered = ref(false)
const focused = ref(false)
let manualPauseUntil = 0
let reducedMotion: MediaQueryList | undefined

function measure() {
  if (!viewport.value || !content.value) return
  const height = content.value.getBoundingClientRect().height
  looping.value = height > viewport.value.clientHeight + 1
  position = looping.value ? viewport.value.scrollTop % height : 0
  viewport.value.scrollTop = position
}

function animate(time: number) {
  const elapsed = previousTime ? Math.min(time - previousTime, 100) : 0
  previousTime = time
  const element = viewport.value
  const height = content.value?.getBoundingClientRect().height || 0
  if (element && looping.value && height) {
    if (!hovered.value && !focused.value && !document.hidden && !reducedMotion?.matches && time >= manualPauseUntil) {
      position = (position + Math.max(0, props.speed) * elapsed / 1000) % height
      element.scrollTop = position
    } else {
      position = element.scrollTop % height
    }
  }
  frame = requestAnimationFrame(animate)
}

function onFocusOut(event: FocusEvent) {
  focused.value = Boolean(event.relatedTarget instanceof Node && viewport.value?.contains(event.relatedTarget))
}
function onWheel() { manualPauseUntil = performance.now() + 1800 }

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  observer = new ResizeObserver(measure)
  if (viewport.value) observer.observe(viewport.value)
  if (content.value) observer.observe(content.value)
  measure()
  frame = requestAnimationFrame(animate)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
</script>

<template>
  <div ref="viewport" class="continuous-scroll-list" tabindex="0"
    @mouseenter="hovered = true" @mouseleave="hovered = false"
    @focusin="focused = true" @focusout="onFocusOut"
    @wheel.passive="onWheel">
    <div ref="content" class="continuous-scroll-list__content"><slot /></div>
    <div v-if="looping" class="continuous-scroll-list__content" aria-hidden="true" inert><slot /></div>
  </div>
</template>

<style scoped>
.continuous-scroll-list{min-height:0;overflow-y:auto;scroll-behavior:auto;overscroll-behavior:contain}
.continuous-scroll-list__content{display:flow-root}
.continuous-scroll-list:focus-visible{outline:2px solid var(--ui-accent);outline-offset:-2px}
</style>
