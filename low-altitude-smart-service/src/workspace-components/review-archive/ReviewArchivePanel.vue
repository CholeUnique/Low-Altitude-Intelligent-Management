<script setup lang="ts">
import type { PortalTask } from '@/types'
import WorkspaceNodeShell from '../shared/WorkspaceNodeShell.vue'

defineProps<{ task?: PortalTask }>()
</script>

<template>
  <WorkspaceNodeShell
    title="复核与归档"
    description="核验整改成果、形成案件材料并完成归档闭环。"
    :task="task"
  />
</template>
