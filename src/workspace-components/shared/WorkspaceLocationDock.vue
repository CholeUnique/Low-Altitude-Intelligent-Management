<script setup lang="ts">
// Compatibility entry: all workbenches use the same right-side tool ball.
import WorkspaceToolBall from './WorkspaceToolBall.vue'
defineProps<{taskId:string;deptId?:string}>()
</script>
<template><WorkspaceToolBall :task-id="taskId" :dept-id="deptId" /></template>
