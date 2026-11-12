<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { apiClient } from '@/api/client'

const props = defineProps<{ coordinate?: { longitude: number; latitude: number }; geometryType: string }>()
interface PhotoMatch { matched: boolean; mediaId?: string | number; fileName?: string; shootTime?: string; distanceMeters?: number; localFileUrl?: string; localThumbnailUrl?: string }
const radius = ref(20)
const state = ref<'idle' | 'loading' | 'empty' | 'ready' | 'error'>('idle')
const result = ref<PhotoMatch>(), message = ref(''), thumbnail = ref(''), original = ref('')
const previewOpen = ref(false), previewLoading = ref(false), previewError = ref('')
const scale = ref(1), offsetX = ref(0), offsetY = ref(0), dragging = ref(false)
let pointerId: number | undefined, dragX = 0, dragY = 0, originX = 0, originY = 0
function resetTransform() { scale.value = 1; offsetX.value = 0; offsetY.value = 0; dragging.value = false; pointerId = undefined }
function zoom(event: WheelEvent) {
  if (!original.value) return
  event.preventDefault()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const next = Math.min(8, Math.max(1, scale.value * (event.deltaY < 0 ? 1.15 : 1 / 1.15)))
  const x = event.clientX - (rect.left + rect.width / 2), y = event.clientY - (rect.top + rect.height / 2)
  offsetX.value = x - (x - offsetX.value) * next / scale.value
  offsetY.value = y - (y - offsetY.value) * next / scale.value
  scale.value = next
  if (next === 1) resetTransform()
}
function startDrag(event: PointerEvent) {
  if (!original.value || scale.value <= 1 || event.button !== 0) return
  pointerId = event.pointerId; dragging.value = true; dragX = event.clientX; dragY = event.clientY; originX = offsetX.value; originY = offsetY.value
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function moveDrag(event: PointerEvent) {
  if (!dragging.value || pointerId !== event.pointerId) return
  offsetX.value = originX + event.clientX - dragX; offsetY.value = originY + event.clientY - dragY
}
function endDrag(event: PointerEvent) {
  if (pointerId !== event.pointerId) return
  dragging.value = false; pointerId = undefined
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
}
let requestVersion = 0
let controller: AbortController | undefined
function revoke(url: string) { if (url) URL.revokeObjectURL(url) }
function clearImages() { revoke(thumbnail.value); revoke(original.value); thumbnail.value = ''; original.value = ''; previewOpen.value = false; previewLoading.value = false; previewError.value = '' }
function safePath(raw: string, kind: 'thumb' | 'file') {
  const url = new URL(raw, window.location.origin)
  const path = url.pathname.replace(/^\/api(?=\/v1\/uav\/media\/)/, '')
  if (!new RegExp(`^/v1/uav/media/${kind}/[\\w-]+/?$`).test(path)) throw new Error('图片地址无效')
  return path
}
async function readImage(url: string, kind: 'thumb' | 'file', signal: AbortSignal) {
  const image = await apiClient.get<never, Blob>(safePath(url, kind), { responseType: 'blob', signal, timeout: 60000 })
  if (!(image instanceof Blob) || !image.size || !image.type.startsWith('image/')) throw new Error('图片读取失败')
  return URL.createObjectURL(image)
}
async function search() {
  if (!props.coordinate || state.value === 'loading') return
  if (!Number.isFinite(radius.value) || radius.value <= 0 || radius.value > 500) { message.value = '搜索半径请输入 1 至 500 米'; state.value = 'error'; return }
  const version = ++requestVersion
  controller?.abort(); controller = new AbortController()
  clearImages(); result.value = undefined; message.value = ''; state.value = 'loading'
  try {
    const payload = { ...props.coordinate, radiusMeters: Number(radius.value) }
    const match = await apiClient.post<never, PhotoMatch>('/v1/uav/media/match', payload, { signal: controller.signal })
    if (version !== requestVersion) return
    if (!match?.matched) { state.value = 'empty'; return }
    result.value = match; state.value = 'ready'
    if (match.localThumbnailUrl) {
      try {
        const url = await readImage(match.localThumbnailUrl, 'thumb', controller.signal)
        if (version !== requestVersion) revoke(url); else thumbnail.value = url
      } catch { /* 缩略图不可用时仍可查看原图 */ }
    }
  } catch (error) {
    if (version !== requestVersion) return
    state.value = 'error'; message.value = error instanceof Error ? error.message : '查询失败，请重试'
  }
}
async function openPreview() {
  if (!result.value?.localFileUrl) { message.value = '未返回原图地址'; return }
  previewOpen.value = true; previewError.value = ''
  if (original.value || previewLoading.value) return
  const version = requestVersion
  previewLoading.value = true
  try {
    const url = await readImage(result.value.localFileUrl, 'file', controller!.signal)
    if (version !== requestVersion) revoke(url); else original.value = url
  } catch { if (version === requestVersion) previewError.value = '原图读取失败，请重试' }
  finally { if (version === requestVersion) previewLoading.value = false }
}
function closePreview() { previewOpen.value = false; resetTransform() }
function onKey(event: KeyboardEvent) { if (event.key === 'Escape') closePreview() }
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => { requestVersion++; controller?.abort(); clearImages(); window.removeEventListener('keydown', onKey) })
</script>

<template>
  <section class="nearby-photo" aria-label="附近最新航拍照片">
    <header><span class="accent"></span><strong>附近最新航拍照片</strong></header>
    <p class="hint">{{ geometryType === '点' ? '按设施位置查询附近照片' : '按设施范围中心查询，照片可能未覆盖整个设施' }}</p>
    <div class="query-fields"><label>半径（米）<input v-model.number="radius" type="number" min="1" max="500" /></label><button class="query" type="button" :disabled="!coordinate || state === 'loading'" @click="search">{{ state === 'loading' ? '正在查询…' : '查询最新照片' }}</button></div>
    <p v-if="!coordinate" class="notice">设施暂无有效坐标，无法查询</p>
    <p v-else-if="state === 'idle'" class="notice">默认查询近 7 天的本地照片</p>
    <p v-else-if="state === 'empty'" class="notice">该范围和时间内暂无匹配照片</p>
    <p v-else-if="state === 'error'" class="notice error" role="alert">{{ message }}，请调整条件或重试</p>
    <div v-if="state === 'ready' && result" class="photo-result">
      <button type="button" class="photo-preview" :disabled="!result.localFileUrl" @click="openPreview"><img v-if="thumbnail" :src="thumbnail" alt="附近航拍照片缩略图" /><span v-else>点击查看原图</span><small v-if="result.localFileUrl">查看原图 ↗</small></button>
      <div class="photo-meta"><span>拍摄时间 <b>{{ result.shootTime ? result.shootTime.replace('T', ' ').slice(0, 19) : '暂无数据' }}</b></span><span>距离设施 <b>{{ result.distanceMeters == null ? '暂无数据' : `${Number(result.distanceMeters).toFixed(1)} 米` }}</b></span></div>
      <p v-if="message" class="notice error">{{ message }}</p>
    </div>
    <Teleport to="body"><div v-if="previewOpen" class="nearby-preview" role="dialog" aria-modal="true" aria-label="航拍照片原图" @click.self="closePreview" @wheel="zoom" @pointerdown.self="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @dblclick="resetTransform"><button class="preview-close" type="button" aria-label="关闭原图" @click="closePreview">×</button><p v-if="previewLoading">正在读取原图…</p><div v-else-if="previewError"><p>{{ previewError }}</p><button type="button" @click="openPreview">重新加载</button></div><img v-else-if="original" :src="original" :alt="result?.fileName || '航拍照片原图'" :style="{ transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`, cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }" draggable="false" @pointerdown="startDrag" /></div></Teleport>
  </section>
</template>

<style scoped>
.nearby-photo{margin-top:18px;padding:14px 0 2px;border-top:1px solid #719dab38;color:#d8edf0}.nearby-photo header{display:flex;align-items:center;gap:7px;font-size:13px}.accent{width:3px;height:15px;border-radius:3px;background:#4ed7df}.hint,.notice{margin:8px 0;color:#8fb5c1;font-size:11px;line-height:1.55}.notice.error{color:#ffaea3}.query-fields{display:grid;grid-template-columns:78px minmax(0,1fr);gap:8px}.query-fields label{display:grid;gap:5px;color:#91bbc5;font-size:11px}.query-fields input{box-sizing:border-box;width:100%;min-width:0;padding:6px;color:#d8edf0;background:#092a38;border:1px solid #3b6878;border-radius:5px;font-size:11px;color-scheme:dark}.query{width:100%;margin-top:10px;padding:8px;border:1px solid #3a8ca0;border-radius:5px;background:#15516a;color:#d9f7fa;font-size:12px}.query:hover{background:#1a6a80}.query:disabled{opacity:.55;cursor:not-allowed}.photo-result{margin-top:12px}.photo-preview{position:relative;display:grid;place-items:center;overflow:hidden;width:100%;height:128px;padding:0;border:1px solid #42798a;border-radius:6px;background:#092634;color:#9cc6d1}.photo-preview img{width:100%;height:100%;object-fit:cover}.photo-preview small{position:absolute;right:6px;bottom:6px;padding:3px 6px;border-radius:3px;background:#092634dd;color:#e2f8fa}.photo-meta{display:grid;gap:6px;margin-top:9px;color:#91bbc5;font-size:11px}.photo-meta span{display:flex;justify-content:space-between;gap:8px}.photo-meta b{color:#d8edf0;font-weight:500}.nearby-preview{position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;padding:50px;background:rgba(0,12,22,.94);color:#def2f5}.nearby-preview img{max-width:100%;max-height:100%;object-fit:contain}.preview-close{position:absolute;top:20px;right:25px;width:38px;height:38px;border:1px solid #558193;border-radius:6px;background:#15394f;color:#fff;font-size:26px;cursor:pointer}
</style>

<style scoped>
.query-fields{grid-template-columns:78px minmax(0,1fr);align-items:end}.query-fields .query{width:100%;min-height:29px;margin:0;padding:6px 10px;white-space:nowrap}
.nearby-preview{overflow:hidden;touch-action:none}
.nearby-preview img{user-select:none;will-change:transform;touch-action:none}
</style>
