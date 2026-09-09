<script setup lang="ts">
import type { PortalTask } from '@/types'
import WorkspaceNodeShell from '../shared/WorkspaceNodeShell.vue'

defineProps<{ task?: PortalTask }>()
</script>

<template>
  <WorkspaceNodeShell
    title="问题图斑识别"
    description="基于航拍影像进行 AI 识别与人工研判，输出问题图斑清单。"
    :task="task"
  />
</template>
