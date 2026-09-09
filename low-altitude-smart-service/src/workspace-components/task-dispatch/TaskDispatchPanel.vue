<script setup lang="ts">
import type { PortalTask } from '@/types'
import WorkspaceNodeShell from '../shared/WorkspaceNodeShell.vue'

defineProps<{ task?: PortalTask }>()
</script>

<template>
  <WorkspaceNodeShell
    title="核查任务下发"
    description="编制核查要求并下发至责任单位，跟踪接收与执行反馈。"
    :task="task"
  />
</template>
