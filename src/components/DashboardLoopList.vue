<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ itemCount: number }>()
const viewport = ref<HTMLElement>()
const content = ref<HTMLElement>()
const contentHeight = ref(0)
const reducedMotion = ref(false)
const looping = computed(() => props.itemCount > 1 && contentHeight.value > 0 && !reducedMotion.value)
const hovered = ref(false)
const focused = ref(false)
let frame = 0
let previousTime = 0
let position = 0
let observer: ResizeObserver | undefined
let motion: MediaQueryList | undefined

function measure() {
  contentHeight.value = content.value?.offsetHeight || 0
  if (viewport.value && contentHeight.value) {
    position = viewport.value.scrollTop % contentHeight.value
    viewport.value.scrollTop = position
  }
}

function updateMotion() {
  reducedMotion.value = motion?.matches || false
}

function animate(time: number) {
  const elapsed = previousTime ? Math.min(time - previousTime, 64) : 0
  previousTime = time
  const element = viewport.value
  if (element && looping.value && !hovered.value && !focused.value && !document.hidden) {
    // Keep fractional pixels between frames; native scrollTop may round them.
    position = (position + elapsed * 0.018) % contentHeight.value
    element.scrollTop = position
  } else if (element) {
    position = element.scrollTop
  }
  frame = requestAnimationFrame(animate)
}

function onFocusOut(event: FocusEvent) {
  focused.value = event.relatedTarget instanceof Node && Boolean(viewport.value?.contains(event.relatedTarget))
}

onMounted(() => {
  motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  updateMotion()
  motion.addEventListener('change', updateMotion)
  observer = new ResizeObserver(measure)
  if (content.value) observer.observe(content.value)
  if (viewport.value) observer.observe(viewport.value)
  measure()
  frame = requestAnimationFrame(animate)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  motion?.removeEventListener('change', updateMotion)
})
</script>

<template>
  <div
    ref="viewport"
    class="dashboard-loop-list"
    :style="contentHeight ? { maxHeight: `${contentHeight}px` } : undefined"
    tabindex="0"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="onFocusOut"
  >
    <div ref="content" class="dashboard-loop-list__content"><slot :duplicate="false" /></div>
    <!-- The visual repeat remains mouse-operable but is excluded from keyboard/AT order. -->
    <div v-if="looping" class="dashboard-loop-list__content" aria-hidden="true"><slot :duplicate="true" /></div>
  </div>
</template>

<style scoped>
.dashboard-loop-list { min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:none;overflow-anchor:none;scroll-behavior:auto; }
.dashboard-loop-list::-webkit-scrollbar { display:none; }
.dashboard-loop-list__content { display:flow-root; }
</style>
