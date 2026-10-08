<script setup lang="ts">
import { watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{ message?: string }>()
watch(() => props.message, message => {
  if (message) ElMessage.error({ message, showClose: true, duration: 6000, grouping: true })
}, { immediate: true })
</script>

<template><!-- 请求错误使用浮动提示，不占工作台布局空间。 --></template>
