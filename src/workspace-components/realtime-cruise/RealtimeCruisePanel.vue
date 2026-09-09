<script setup lang="ts">
import type { PortalTask } from '@/types'
import WorkspaceNodeShell from '../shared/WorkspaceNodeShell.vue'

defineProps<{ task?: PortalTask }>()
</script>

<template>
  <WorkspaceNodeShell
    title="实时巡航"
    description="监控无人机巡航与影像采集状态，支持实时视频与飞行遥测展示。"
    :task="task"
  />
</template>
