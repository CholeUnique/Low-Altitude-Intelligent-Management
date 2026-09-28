<script lang="ts">
import type { GovernanceTask, GovernanceTaskStatus } from '@/api/governance-task'
import type { TaskWorkflowNode } from '@/types'
import { getSharedWorkspaceConfig, resolveWorkspaceSceneId } from '@/workspace/config/registry'

export const NON_GRAIN_WORKFLOW = [
  { key: 'task-acceptance', name: '任务受理' },
  { key: 'section-preliminary-review', name: '科室初核' },
  { key: 'department-confirmation', name: '部门确认' },
  { key: 'on-site-verification', name: '现场核查' },
  { key: 'rectification-disposal', name: '整改处置' },
  { key: 'drone-review', name: '无人机复核' },
  { key: 'case-archive', name: '结案归档' },
] as const

export function isNonGrainTask(task: Pick<GovernanceTask, 'sceneCode' | 'sceneName'>) {
  return resolveWorkspaceSceneId(task.sceneCode, task.sceneName) === 'non-grain-monitoring'
}

function nonGrainStatusIndex(status: GovernanceTaskStatus, total: number) {
  if (status === 5) return total
  if (status === 3 || status === 4) return 0
  if (status === 2) return Math.max(0, total - 2)
  if (status === 1) return Math.min(Math.max(1, Math.floor(total / 2)), total - 1)
  return 0
}

export function getTaskWorkflowSteps(task: GovernanceTask): TaskWorkflowNode[] {
  if (!isNonGrainTask(task) && task.workflow?.length) return task.workflow
  const source = isNonGrainTask(task)
    ? NON_GRAIN_WORKFLOW
    : getSharedWorkspaceConfig().nodes.map((node) => ({ key: node.key, name: node.shortName }))
  const activeIndex = isNonGrainTask(task)
    ? nonGrainStatusIndex(task.taskStatus, source.length)
    : task.taskStatus === 0 ? 0 : task.taskStatus === 1 ? 1 : 2

  return source.map((node, index) => ({
    key: node.key,
    name: node.name,
    status: task.taskStatus === 5 || index < activeIndex
      ? 'done'
      : index === activeIndex && task.taskStatus !== 3 && task.taskStatus !== 4
        ? 'active'
        : 'pending',
  }))
}

/**
 * 非粮事项使用独立七节点流程；其他任务延续列表原有的共享工作台投影。
 */
export function getTaskWorkspaceNodeKey(task: GovernanceTask) {
  if (isNonGrainTask(task)) {
    if (task.taskStatus === 1) return 'on-site-verification'
    if (task.taskStatus === 2) return 'drone-review'
    if (task.taskStatus === 5) return 'case-archive'
    return 'task-acceptance'
  }
  if (task.taskStatus === 5) return 'review-archive'
  if (task.taskStatus === 2) return 'task-dispatch'
  if (task.taskStatus === 1) return 'realtime-cruise'
  return 'route-flight-plan'
}
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  task: GovernanceTask
  compact?: boolean
}>(), {
  compact: false,
})

const steps = computed(() => getTaskWorkflowSteps(props.task))
</script>

<template>
  <div
    class="workflow-progress"
    :class="{ compact, 'is-non-grain': isNonGrainTask(task) }"
    :style="{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }"
    :aria-label="`${task.name}流程进度`"
  >
    <span v-for="node in steps" :key="node.key" class="workflow-step" :class="node.status">
      <i>{{ node.status === 'done' ? '✓' : node.status === 'active' ? '•' : '' }}</i>
      <small :title="node.name">{{ node.name }}</small>
    </span>
  </div>
</template>

<style scoped>
.workflow-progress { min-width: 0; display: grid; align-items: start; }
.workflow-step { position: relative; min-width: 0; display: grid; grid-template-rows: 18px auto; justify-items: center; color: #98a5b3; }
.workflow-step:not(:first-child)::before { content: ""; position: absolute; top: 7px; right: calc(50% + 7px); width: calc(100% - 14px); height: 2px; background: #d9e0e7; }
.workflow-step.done::before { background: #43b88b; }
.workflow-step.active::before { background: linear-gradient(90deg, #43b88b, #328fd3); }
.workflow-step i { position: relative; z-index: 1; width: 15px; height: 15px; display: grid; place-items: center; color: #fff; background: #fff; border: 2px solid #c4ced8; border-radius: 50%; font-size: 9px; font-style: normal; line-height: 1; }
.workflow-step.done i { background: #43b88b; border-color: #43b88b; }
.workflow-step.active i { background: #328fd3; border-color: #328fd3; box-shadow: 0 0 0 3px #328fd31c; }
.workflow-step small { width: calc(100% - 3px); margin-top: 4px; overflow: hidden; color: inherit; font-size: 10px; line-height: 1.2; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.workflow-step.done small, .workflow-step.active small { color: #52677b; }
.compact .workflow-step { grid-template-rows: 16px auto; }
.compact .workflow-step i { width: 13px; height: 13px; }
.compact .workflow-step:not(:first-child)::before { top: 6px; right: calc(50% + 6px); width: calc(100% - 12px); }
.compact .workflow-step small { font-size: 9px; }
</style>
