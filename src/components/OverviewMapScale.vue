<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type L from 'leaflet'

const props = defineProps<{ map?: L.Map }>()
const width = ref(96)
const label = ref('')
let current: L.Map | undefined
function update() {
  if (!current) return
  const referenceWidth = 110
  const centerY = current.getSize().y / 2
  const metres = current.distance(current.containerPointToLatLng([0, centerY]), current.containerPointToLatLng([referenceWidth, centerY]))
  if (!Number.isFinite(metres) || metres <= 0) return
  const magnitude = 10 ** Math.floor(Math.log10(metres))
  const distance = [1, 2, 5].reduce((best, factor) => {
    const candidate = factor * magnitude
    return candidate <= metres && candidate > best ? candidate : best
  }, magnitude / 10)
  width.value = Math.max(34, Math.round(referenceWidth * distance / metres))
  label.value = distance >= 1000 ? `${distance / 1000} km` : `${distance} m`
}
watch(() => props.map, next => {
  current?.off('moveend zoomend resize', update)
  current = next
  if (current) { current.on('moveend zoomend resize', update); update() }
}, { immediate: true })
onBeforeUnmount(() => current?.off('moveend zoomend resize', update))
</script>

<template>
  <div v-if="label" class="overview-scale" :style="{ width: `${width}px` }" :aria-label="`比例尺 ${label}`"><b>{{ label }}</b><i></i></div>
</template>

<style scoped>
.overview-scale{position:absolute;z-index:500;right:14px;bottom:10px;height:18px;padding:0;color:#b9e7f4;background:transparent;font-size:11px;text-align:center;pointer-events:none}.overview-scale b{position:relative;z-index:1;display:block;font-size:11px;font-weight:600;line-height:12px}.overview-scale i{position:absolute;right:0;bottom:0;left:0;height:7px;border-right:2px solid #b9e7f4;border-bottom:2px solid #b9e7f4;border-left:2px solid #b9e7f4}
</style>
