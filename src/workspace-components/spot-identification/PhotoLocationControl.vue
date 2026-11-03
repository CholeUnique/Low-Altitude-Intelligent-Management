<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { FlightReviewMedia } from '@/api/flight-review'
import { containedVideoBounds } from '@/utils/telemetry-panel'
import PhotoLocationOverlay from './PhotoLocationOverlay.vue'

const props = defineProps<{ media: FlightReviewMedia; fullscreen?: boolean }>()
const open = ref(false)
const button = ref<HTMLElement>()
const position = ref<{ left: number; top: number }>()
const style = computed(() => position.value ? { left: `${position.value.left}px`, top: `${position.value.top}px` } : {})
const hasCoordinates = computed(() => Number.isFinite(props.media.longitude) && Number.isFinite(props.media.latitude))
let observer: ResizeObserver | undefined
let image: HTMLImageElement | undefined

function updatePosition() {
  const parent = button.value?.parentElement
  const currentImage = parent?.querySelector(':scope > img') as HTMLImageElement | null
  if (currentImage !== image) {
    image?.removeEventListener('load', updatePosition)
    if (image) observer?.unobserve(image)
    image = currentImage || undefined
    image?.addEventListener('load', updatePosition)
    if (image) observer?.observe(image)
  }
  if (!image?.naturalWidth || !image.naturalHeight || !image.clientWidth || !image.clientHeight) return
  const bounds = containedVideoBounds({ left: image.offsetLeft, top: image.offsetTop, width: image.clientWidth, height: image.clientHeight }, image.naturalWidth, image.naturalHeight)
  position.value = { left: bounds.left + 9, top: bounds.top + 9 }
}

onMounted(() => {
  observer = new ResizeObserver(updatePosition)
  if (button.value?.parentElement) observer.observe(button.value.parentElement)
  updatePosition()
})
watch(() => props.media.id, async () => {
  open.value = false
  position.value = undefined
  await nextTick()
  updatePosition()
})
watch(() => props.fullscreen, async () => { await nextTick(); updatePosition() }, { flush: 'post' })
onBeforeUnmount(() => { observer?.disconnect(); image?.removeEventListener('load', updatePosition) })
</script>

<template>
  <button ref="button" class="photo-location-button" :class="{ 'is-active': open }" :style="style" type="button"
    :aria-pressed="open" :disabled="!hasCoordinates" :title="!hasCoordinates ? '图片暂无拍摄坐标' : open ? '关闭拍摄位置' : '查看拍摄位置'"
    @pointerdown.stop @wheel.stop @dblclick.stop @keydown.stop @click.stop="open = !open">拍摄位置</button>
  <PhotoLocationOverlay v-if="open && hasCoordinates" :media="media" :fullscreen="fullscreen" @close="open = false" />
</template>

<style scoped>
.photo-location-button{position:absolute;z-index:8;top:9px;left:9px;padding:6px 10px;border:1px solid #54a9c1;border-radius:4px;color:#e1f7ff;background:#10384ddd;font:inherit;font-size:13px;line-height:normal;cursor:pointer;touch-action:manipulation}
.photo-location-button.is-active{color:#70edff;border-color:#33cde4;background:#075875ef;box-shadow:0 0 0 1px #27c4dd55}
.photo-location-button:disabled{opacity:.5;cursor:not-allowed}
</style>
