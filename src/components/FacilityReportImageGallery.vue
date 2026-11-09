<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getFacilityReportImage } from '@/api/facility'
import type { GovernanceTaskDetail } from '@/api/governance-task'

const props = defineProps<{ images: GovernanceTaskDetail['reportImages']; deptId?: string }>()
const urls = ref<Record<string, string>>({})
const failures = ref<Record<string, string>>({})
const previewId = ref('')
let version = 0
function clear() { previewId.value = ''; Object.values(urls.value).forEach(URL.revokeObjectURL); urls.value = {}; failures.value = {} }
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape' && previewId.value) { event.stopPropagation(); previewId.value = '' } }
onMounted(() => window.addEventListener('keydown', onKeydown))
watch(() => [props.images, props.deptId] as const, async ([images, deptId]) => {
  const request = ++version
  clear()
  await Promise.all(images.map(async image => {
    try {
      const blob = await getFacilityReportImage(image.imageId, deptId)
      if (request !== version) return
      urls.value[image.imageId] = URL.createObjectURL(blob)
    } catch (error) { if (request === version) failures.value[image.imageId] = error instanceof Error ? error.message : '照片读取失败' }
  }))
}, { immediate: true })
onBeforeUnmount(() => { version++; window.removeEventListener('keydown', onKeydown); clear() })
</script>

<template>
  <section v-if="images.length" class="report-gallery" aria-label="上报现场照片">
    <h3>上报现场照片 <small>{{ images.length }} 张</small></h3>
    <div class="gallery-grid"><div v-for="image in images" :key="image.imageId" class="gallery-item">
      <button v-if="urls[image.imageId]" type="button" class="gallery-open" :title="`查看 ${image.fileName}`" @click="previewId = image.imageId"><img :src="urls[image.imageId]" :alt="image.fileName" /></button>
      <span v-else class="gallery-state" :title="failures[image.imageId]">{{ failures[image.imageId] ? '加载失败' : '加载中…' }}</span>
      <small :title="image.fileName">{{ image.fileName }}</small>
    </div></div>
    <Teleport to="body"><div v-if="previewId && urls[previewId]" class="photo-fullscreen" role="dialog" aria-modal="true" aria-label="上报照片预览" @click.self="previewId = ''"><button type="button" class="photo-close" aria-label="退出照片全屏" title="退出全屏（Esc）" @click="previewId = ''">×</button><img :src="urls[previewId]" :alt="images.find(image => image.imageId === previewId)?.fileName || '上报现场照片'" /></div></Teleport>
  </section>
</template>
<style scoped>
.report-gallery{padding:12px;border:1px solid #315e6e;border-radius:6px;color:#d7edf3;background:#103445}.report-gallery h3{margin:0 0 10px;font-size:15px}.report-gallery h3 small{color:#91b7c2;font-size:12px;font-weight:400}.gallery-grid{display:flex;gap:8px;flex-wrap:wrap}.gallery-item{width:88px;min-width:0}.gallery-item img,.gallery-state{display:grid;width:88px;height:68px;object-fit:cover;place-items:center;background:#0a2634;border-radius:4px;color:#9bbcc8;font-size:12px}.gallery-item small{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a9ccd6;font-size:12px}
.gallery-open{display:block;border:0;padding:0;background:transparent;cursor:zoom-in}.gallery-open:focus-visible{outline:2px solid #6bdaf0;outline-offset:2px}.photo-fullscreen{position:fixed;z-index:3000;inset:0;display:grid;place-items:center;padding:56px 24px 24px;background:#020a10ed;box-sizing:border-box}.photo-fullscreen>img{max-width:100%;max-height:100%;object-fit:contain}.photo-close{position:absolute;top:18px;right:22px;width:40px;height:40px;border:1px solid #7899ad;border-radius:5px;background:#102b3c;color:#fff;font-size:28px;line-height:1;cursor:pointer}
</style>
