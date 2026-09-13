<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PatrolLayout from '@/layouts/PatrolLayout.vue'
import RealtimeCruisePanel from '@/workspace-components/realtime-cruise/RealtimeCruisePanel.vue'
import { getTask } from '@/mocks/portal'

const route = useRoute()
const task = computed(() => {
  const taskId = typeof route.query.taskId === 'string' ? route.query.taskId : ''
  return taskId ? getTask(taskId) : undefined
})
</script>

<template>
  <PatrolLayout active-node="live">
    <RealtimeCruisePanel :task="task" />
  </PatrolLayout>
</template>
