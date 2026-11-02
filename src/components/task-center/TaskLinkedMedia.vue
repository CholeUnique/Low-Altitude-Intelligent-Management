<script setup lang="ts">
import { ref, watch } from 'vue'
import { getTaskEvidenceImages, type TaskEvidenceImage } from '@/api/governance-result'
import { unbindGovernanceTaskMedia } from '@/api/governance-task'

const props = defineProps<{ taskId: string; deptId?: string; editable: boolean; imageCount?: number }>()
const emit = defineEmits<{ changed: [] }>()
const images = ref<TaskEvidenceImage[]>([])
const loading = ref(false)
const busyId = ref('')
const selected = ref<TaskEvidenceImage>()
const error = ref('')
let version = 0
async function load() {
  const current = ++version
  images.value = []
  error.value = ''
  if (!props.taskId || !props.imageCount) return
  loading.value = true
  try { const data = await getTaskEvidenceImages(props.taskId, props.deptId); if (current === version) images.value = data.filter(item => item.id) }
  catch (reason) { if (current === version) error.value = reason instanceof Error ? reason.message : '影像加载失败' }
  finally { if (current === version) loading.value = false }
}
async function unbind() {
  const image = selected.value
  if (!image || busyId.value) return
  busyId.value = image.id
  error.value = ''
  try {
    await unbindGovernanceTaskMedia({ bizTaskId: props.taskId, deptId: props.deptId, mediaIds: [image.id] })
    selected.value = undefined
    emit('changed')
    await load()
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '解绑失败，请重试' }
  finally { busyId.value = '' }
}
watch(() => [props.taskId, props.deptId, props.imageCount], () => void load(), { immediate: true })
</script>

<template>
  <section class="linked-media">
    <header><strong>任务关联影像</strong><span>{{ imageCount ?? 0 }} 项</span></header>
    <p v-if="loading">正在加载影像…</p><p v-else-if="!images.length">暂无已关联影像</p>
    <div v-else class="linked-media__list"><div v-for="image in images" :key="image.id" class="linked-media__item"><span :title="image.fileName">{{ image.fileName }}</span><button v-if="editable" type="button" :disabled="!!busyId" @click="selected = image">解绑</button></div></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="selected" class="linked-media__confirm" role="alertdialog" aria-label="确认解绑影像"><p>确认解绑“{{ selected.fileName }}”？素材文件不会被删除。</p><div><button type="button" :disabled="!!busyId" @click="selected = undefined">取消</button><button type="button" :disabled="!!busyId" @click="unbind">{{ busyId ? '正在解绑…' : '确认解绑' }}</button></div></div>
  </section>
</template>

<style scoped>
.linked-media{position:relative;padding:12px;color:#c6e8f1;background:#0d2639;border:1px solid #245269;border-radius:5px}.linked-media header,.linked-media__item{display:flex;align-items:center;justify-content:space-between;gap:10px}.linked-media header span,.linked-media p{color:#8cb1c2;font-size:12px}.linked-media__list{max-height:180px;overflow:auto}.linked-media__item{padding:8px 0;border-top:1px solid #214559}.linked-media__item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.linked-media button{padding:4px 9px;border:1px solid #31677d;border-radius:4px;color:#bde4f1;background:#133c50;cursor:pointer}.linked-media button:disabled{opacity:.5;cursor:not-allowed}.linked-media__confirm{padding:10px;margin-top:8px;border:1px solid #50839a;border-radius:4px;background:#14364a}.linked-media__confirm div{display:flex;justify-content:flex-end;gap:8px}
</style>
