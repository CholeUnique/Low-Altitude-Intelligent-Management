<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PatrolLayout from '@/layouts/PatrolLayout.vue'
import RouteFlightPlanPanel from '@/workspace-components/route-flight-plan/RouteFlightPlanPanel.vue'
import { getTask } from '@/mocks/portal'
import { isMockMode } from '@/api/client'
import { getGovernanceTaskDetail, toPatrolTask } from '@/api/governance-task'
import type { PortalTask } from '@/types'

const route = useRoute()
const task = ref<PortalTask>()
const taskLoading = ref(false)
const taskError = ref('')

async function loadTask() {
  const taskId = typeof route.query.taskId === 'string' ? route.query.taskId : ''
  task.value = undefined
  taskError.value = ''
  if (!taskId) return
  if (isMockMode()) {
    task.value = getTask(taskId)
    return
  }
  taskLoading.value = true
  try {
    const detail = await getGovernanceTaskDetail(taskId)
    task.value = detail ? toPatrolTask(detail.task) : undefined
    if (!task.value) taskError.value = '未找到该真实业务任务，或当前账号没有查看权限。'
  } catch (error) {
    taskError.value = error instanceof Error ? error.message : '真实任务上下文加载失败。'
  } finally {
    taskLoading.value = false
  }
}

watch(() => route.query.taskId, () => void loadTask())
onMounted(() => void loadTask())
</script>

<template>
  <PatrolLayout active-node="route-plan">
    <RouteFlightPlanPanel :task="task" :task-loading="taskLoading" :task-error="taskError" />
  </PatrolLayout>
</template>
