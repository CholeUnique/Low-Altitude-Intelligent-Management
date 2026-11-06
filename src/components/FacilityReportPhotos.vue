<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ modelValue: File[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [File[]] }>()
const error = ref('')
const previews = ref<string[]>([])
watch(() => props.modelValue, files => {
  previews.value.forEach(URL.revokeObjectURL)
  previews.value = files.map(file => URL.createObjectURL(file))
}, { immediate: true })
onBeforeUnmount(() => previews.value.forEach(URL.revokeObjectURL))
function select(event: Event) {
  const input = event.target as HTMLInputElement
  const added = Array.from(input.files || [])
  input.value = ''
  if (!added.length) return
  if (props.modelValue.length + added.length > 9) { error.value = '最多上传 9 张照片'; return }
  if (added.some(file => !/\.(jpe?g|png|webp)$/i.test(file.name))) { error.value = '仅支持 JPG、JPEG、PNG 或 WebP 图片'; return }
  if (added.some(file => file.size > 10 * 1024 * 1024 || !file.size)) { error.value = '每张照片须大于 0 且不超过 10 MB'; return }
  error.value = ''
  emit('update:modelValue', [...props.modelValue, ...added])
}
function remove(index: number) { error.value = ''; emit('update:modelValue', props.modelValue.filter((_, i) => i !== index)) }
</script>

<template>
  <div class="report-photos">
    <label>现场照片（选填，{{ modelValue.length }}/9）<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple :disabled="disabled || modelValue.length >= 9" @change="select" /></label>
    <p>支持 JPG、PNG、WebP，每张不超过 10 MB。</p>
    <p v-if="error" class="photo-error" role="alert">{{ error }}</p>
    <div v-if="modelValue.length" class="previews"><div v-for="(file, index) in modelValue" :key="`${file.name}-${index}`"><img :src="previews[index]" :alt="file.name" /><button type="button" :disabled="disabled" :aria-label="`移除${file.name}`" @click="remove(index)">×</button><span :title="file.name">{{ file.name }}</span></div></div>
  </div>
</template>

<style scoped>
.report-photos{grid-column:1/-1;color:#a9ccd6;font-size:12px}.report-photos label{display:grid;gap:7px}.report-photos input{width:100%;box-sizing:border-box;padding:8px;border:1px solid #35687a;border-radius:5px;background:#0a2634;color:#d7edf3;font:inherit}.report-photos p{margin:6px 0;color:#8fb0c2}.report-photos .photo-error{color:#ffb6ad}.previews{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.previews>div{position:relative;width:78px;min-width:0}.previews img{display:block;width:78px;height:64px;object-fit:cover;border-radius:4px}.previews button{position:absolute;top:2px;right:2px;border:0;border-radius:50%;width:22px;height:22px;background:#102b3cdd;color:white;cursor:pointer}.previews span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px}
</style>
