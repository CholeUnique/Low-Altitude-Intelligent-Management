<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { showWorkbenchFeedback } from './workbench-validation'

const props = defineProps<{ message?: string }>()
let feedback: ReturnType<typeof showWorkbenchFeedback>
watch(() => props.message, message => {
  feedback?.close()
  feedback = showWorkbenchFeedback(message || '')
}, { immediate: true })
onBeforeUnmount(() => feedback?.close())
</script>

<template><!-- 请求错误使用浮动提示，不占工作台布局空间。 --></template>
