<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { GovernanceTaskComparisonImage, TaskAbnormal, TaskGeometryFeatureCollection } from '@/api/governance-task'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import SpotDistributionMap from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import type { ComparisonPeriod, SynchronizedMapView } from '@/workspace-components/spot-identification/SpotDistributionMap.vue'

const props = defineProps<{ images: GovernanceTaskComparisonImage[]; spot?: TaskAbnormal; geometry?: TaskGeometryFeatureCollection; abnormals?: TaskAbnormal[] }>()
const mode = ref<'side' | 'swipe'>('side')
const historyId = ref('')
const currentId = ref('')
const view = ref<SynchronizedMapView>()
const position = ref(50)
const rangeView = ref<{ center: [number, number]; zoom: number }>()
const hasTaskMap = computed(() => Boolean(props.geometry?.features.length || props.abnormals?.length))
const viewport = ref<HTMLElement>()
const choices = computed(() => {
  const images = [...props.images]
  if (props.spot?.imageUrl && !images.some(image => image.imageUrl === props.spot?.imageUrl)) {
    images.push({ id: `spot-image-${props.spot.id}`, label: `${props.spot.title} · 问题图斑影像`, imageUrl: props.spot.imageUrl })
  }
  return images
})
const selectedImages = computed(() => [choices.value.find(image => image.id === historyId.value), choices.value.find(image => image.id === currentId.value)])
watch(() => `${props.spot?.id || ''}:${props.images.map(image => image.id).join(',')}`, () => {
  historyId.value = props.images[0]?.id || ''
  currentId.value = choices.value.find(image => image.id === `spot-image-${props.spot?.id}`)?.id || props.images[1]?.id || ''
  view.value = undefined
}, { immediate: true })
const periods = computed<ComparisonPeriod[]>(() => [0, 1].map(index => {
  const image = selectedImages.value[index]
  return { number: index + 1, label: image?.label || (index ? '当前影像' : '历史影像'), kind: image?.mapService ? 'map-service' : image?.imageUrl ? 'image' : 'empty', mapService: image?.mapService, imageUrl: image?.imageUrl }
}))
function move(event: PointerEvent) {
  const bounds = viewport.value?.getBoundingClientRect()
  if (bounds?.width) position.value = Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100))
}
function stop() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
function start(event: PointerEvent) {
  event.preventDefault(); move(event)
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop, { once: true })
}
function keyMove(event: KeyboardEvent) {
  const values: Record<string, number> = { ArrowLeft: position.value - 2, ArrowRight: position.value + 2, Home: 0, End: 100 }
  if (event.key in values) { event.preventDefault(); position.value = Math.max(0, Math.min(100, values[event.key]!)) }
}
watch([historyId, currentId], () => { view.value = undefined })
onBeforeUnmount(stop)
</script>

<template>
  <section class="ng-card ng-map-panel imagery-comparison">
    <header class="ng-card-head"><h3><i>图</i>历史 / 当前影像对比</h3><div class="ng-tabs compact" aria-label="影像对比模式"><button :class="{ active: mode === 'side' }" :aria-pressed="mode === 'side'" @click="mode = 'side'">并排对比</button><button :class="{ active: mode === 'swipe' }" :aria-pressed="mode === 'swipe'" @click="mode = 'swipe'">卷帘对比</button></div></header>
    <div ref="viewport" class="comparison-viewport" :class="mode" :data-center="view?.center.join(',')" :data-zoom="view?.zoom">
      <div v-for="(period, index) in periods" :key="`${spot?.id}-${period.mapService?.id || period.imageUrl || index}-${mode}-${periods.every(item => item.kind === 'image')}`" class="comparison-map" :class="{ current: index === 1 }" :style="mode === 'swipe' && index === 1 ? { clipPath: `inset(0 0 0 ${position}%)` } : {}">
        <header v-if="mode === 'side'" class="period-title"><b>{{ period.kind === 'empty' && hasTaskMap ? (index ? '异常图斑 / 正射影像' : '任务范围 / 底图') : (index ? '当前影像' : '历史影像') }}</b><select v-if="choices.length" :value="index ? currentId : historyId" :aria-label="index ? '选择当前影像' : '选择历史影像'" @change="index ? currentId = ($event.target as HTMLSelectElement).value : historyId = ($event.target as HTMLSelectElement).value"><option value="">暂无影像</option><option v-for="image in choices" :key="image.id" :value="image.id">{{ image.label }}</option></select><small v-else>暂无关联影像</small></header>
        <div class="comparison-canvas"><TaskRangeMap v-if="period.kind === 'empty' && hasTaskMap" :geo-json="geometry" :abnormal-points="abnormals" :active-abnormal-id="spot?.id" :fit-abnormal-points="true" :show-task-range="index === 0" :abnormal-fill-opacity="index ? 0 : .2" :show-dom-imagery="index === 1" :auto-fit="index === 0" :view="rangeView" @view-change="rangeView = $event" /><SpotDistributionMap v-else :spot="spot" :period="period" :synchronized-view="view" :synchronize-images="periods.every(item => item.kind === 'image')" @view-change="view = $event" /></div>
      </div>
      <div v-if="mode === 'swipe'" class="swipe-periods"><header v-for="index in [0, 1]" :key="index" class="period-title"><b>{{ periods[index]?.kind === 'empty' && hasTaskMap ? (index ? '异常图斑 / 正射影像' : '任务范围 / 底图') : (index ? '当前影像' : '历史影像') }}</b><select v-if="choices.length" :value="index ? currentId : historyId" :aria-label="index ? '选择当前影像' : '选择历史影像'" @change="index ? currentId = ($event.target as HTMLSelectElement).value : historyId = ($event.target as HTMLSelectElement).value"><option value="">暂无影像</option><option v-for="image in choices" :key="image.id" :value="image.id">{{ image.label }}</option></select><small v-else>暂无关联影像</small></header></div>
      <div v-if="mode === 'swipe'" class="swipe-handle" :style="{ left: `${position}%` }" role="slider" tabindex="0" aria-label="影像卷帘位置" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(position)" @pointerdown="start" @keydown="keyMove"><i>↔</i></div>
    </div>
    <p v-if="hasTaskMap && periods.some(period => period.kind === 'empty')" class="map-source-note">与任务详情共用任务范围及异常图斑；底图和配置的正射图层不代表后端已提供历史期次影像。</p>
    <footer><span>历史期次：{{ selectedImages[0]?.captureTime || selectedImages[0]?.label || '暂无数据' }}</span><span>当前期次：{{ selectedImages[1]?.captureTime || selectedImages[1]?.label || '暂无数据' }}</span></footer>
  </section>
</template>

<style scoped>
.imagery-comparison{gap:8px}.comparison-viewport{position:relative;flex:1;min-height:0;overflow:hidden;border:1px solid #b9d0dd;border-radius:6px;background:#e8eef3}.comparison-viewport.side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.comparison-map{min-width:0;min-height:0;height:100%}/* Isolate Leaflet panes so the historical map cannot cover the clipped current map. */
.swipe .comparison-map{position:absolute;inset:38px 0 0;height:auto;z-index:0;isolation:isolate}.swipe .current{z-index:2}.swipe .current :deep(.leaflet-top.leaflet-left){left:auto;right:10px}.swipe-handle{position:absolute;z-index:600;top:0;bottom:0;width:3px;background:white;box-shadow:0 0 8px #092f48aa;cursor:ew-resize;touch-action:none;transform:translateX(-50%)}.swipe-handle i{position:absolute;top:50%;left:50%;width:32px;height:32px;display:grid;place-items:center;transform:translate(-50%,-50%);color:#fff;background:#1687ef;border:2px solid #fff;border-radius:50%;font-style:normal;box-shadow:0 3px 10px #06263b66}.swipe-handle:focus-visible i{outline:3px solid #fce505}footer{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:#718696}footer span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
</style>

<style scoped>
.comparison-map{display:flex;flex-direction:column}.period-title{position:relative;z-index:3;flex:0 0 38px;display:flex;align-items:center;gap:8px;box-sizing:border-box;padding:0 9px;background:#f5faff;border-bottom:1px solid #dbe7ef;min-width:0;font-size:12px;color:#254863}.period-title b{white-space:nowrap}.period-title select{min-width:0;flex:1;max-width:100%;padding:3px;border:1px solid #d6e5ef;border-radius:4px;font-size:11px}.period-title small{color:#8195a6}.comparison-canvas{position:relative;min-height:0;flex:1}.comparison-canvas :deep(.period-badge){display:none}.swipe .comparison-canvas{height:100%;flex:auto}.swipe .swipe-handle{top:38px}.swipe-periods{position:absolute;z-index:650;top:0;left:0;right:0;display:grid;grid-template-columns:1fr 1fr;height:38px}.swipe-periods .period-title{height:38px}.swipe .comparison-canvas :deep(.leaflet-top){top:10px}
</style>

<style scoped>
.map-source-note{margin:0;font-size:11px;color:#718696}.comparison-canvas :deep(.task-range-map){min-height:0}.swipe .current :deep(.range-tools){right:10px}
</style>
