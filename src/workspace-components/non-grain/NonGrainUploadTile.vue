<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{
  label?: string
  accept?: string
  multiple?: boolean
  readonly?: boolean
}>(), {
  label: '上传图片',
  accept: 'image/*',
  multiple: true,
  readonly: false,
})

const emit = defineEmits<{ selected: [files: File[]] }>()
const input = ref<HTMLInputElement>()
const selectedFiles = ref<File[]>([])
const previewUrl = ref('')

function releasePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

function openPicker() {
  if (props.readonly) return
  input.value?.click()
}

function handleChange(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || [])
  if (!files.length) return
  releasePreview()
  selectedFiles.value = files
  const image = files.find((file) => file.type.startsWith('image/'))
  if (image) previewUrl.value = URL.createObjectURL(image)
  emit('selected', files)
}

onBeforeUnmount(releasePreview)
</script>

<template>
  <button
    type="button"
    class="ng-photo upload ng-upload-tile"
    :class="{ 'has-file': selectedFiles.length, 'is-disabled': readonly }"
    :aria-disabled="readonly"
    :data-permission-tip="readonly ? '无权限操作' : ''"
    :style="previewUrl ? { backgroundImage: `linear-gradient(#092f4840, #092f48b8), url(${previewUrl})` } : undefined"
    @click="openPicker"
  >
    <span v-if="selectedFiles.length">{{ selectedFiles[0]?.name }}<small v-if="selectedFiles.length > 1">等 {{ selectedFiles.length }} 个文件</small></span>
    <span v-else>＋<small>{{ label }}</small></span>
  </button>
  <input ref="input" class="ng-file-input" type="file" :accept="accept" :multiple="multiple" @change="handleChange">
</template>
