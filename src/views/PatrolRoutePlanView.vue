<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PlatformLayout from '@/layouts/PlatformLayout.vue'
import RouteFlightPlanPanel from '@/workspace-components/route-flight-plan/RouteFlightPlanPanel.vue'
import { getTask } from '@/mocks/portal'
import { isMockMode } from '@/api/client'
import { getGovernanceTaskDetail, toPatrolTask } from '@/api/governance-task'
import type { PortalTask } from '@/types'

const route = useRoute()
const task = ref<PortalTask>()
const taskLoading = ref(false)
const taskError = ref('')
const flightMenu = [
  { label: '机队总览', path: '/flight/fleet', icon: '机' },
  { label: '航线规划', path: '/patrol/route-plan', icon: '线' },
  { label: '飞行计划', path: '/flight/plans', icon: '计' },
  { label: '实时巡航', path: '/patrol/live', icon: '巡' },
]

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
  <PlatformLayout section="flight" title="飞行作业" subtitle="机队、航线、计划与实时巡航" :menu="flightMenu">
    <div class="embedded-flight-page">
      <RouteFlightPlanPanel :task="task" :task-loading="taskLoading" :task-error="taskError" />
    </div>
  </PlatformLayout>
</template>

<style scoped>
.embedded-flight-page { height: calc(100vh - 106px); min-height: 620px; overflow: hidden; border-radius: 8px; box-shadow: 0 4px 18px #153a5117; }
</style>
