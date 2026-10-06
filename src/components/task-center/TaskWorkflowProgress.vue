<script lang="ts">
import type { GovernanceTask } from '@/api/governance-task'
import type { TaskWorkflowNode } from '@/types'
import { resolveWorkspaceSceneId } from '@/workspace/config/registry'

export { NON_GRAIN_WORKFLOW } from '@/workspace/config/non-grain-workflow'

export function isNonGrainTask(task: Pick<GovernanceTask, 'sceneCode' | 'sceneName'>) {
  return resolveWorkspaceSceneId(task.sceneCode, task.sceneName) === 'non-grain-monitoring'
}

/** 只有后端返回节点进度时才展示节点；taskStatus 不能推断七节点完成情况。 */
export function getTaskWorkflowSteps(task: GovernanceTask): TaskWorkflowNode[] {
  if (task.workflow?.length) return task.workflow
  return [{ key: 'task-status', name: task.taskStatusDesc, status: task.taskStatus === 5 ? 'done' : [3, 4].includes(task.taskStatus) ? 'pending' : 'active' }]
}

/**
 * 非粮事项使用独立七节点流程；其他任务延续列表原有的共享工作台投影。
 */
export function getTaskWorkspaceNodeKey(task: GovernanceTask) {
  if (isNonGrainTask(task)) {
    const activeNode = task.workflow?.find((node) => node.status === 'active')
      ?? [...(task.workflow ?? [])].reverse().find((node) => node.status === 'done')
    if (activeNode?.key) return activeNode.key
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
    :style="{ gridTemplateColumns: `repeat(${steps.length}, minmax(56px, 1fr))` }"
    :aria-label="`${task.name}流程进度`"
  >
    <span v-for="(node, index) in steps" :key="`${node.key}-${index}`" class="workflow-step" :class="node.status">
      <i>{{ node.status === 'done' ? '✓' : node.status === 'active' ? '•' : '' }}</i>
      <small :title="node.name">{{ node.name }}</small>
    </span>
  </div>
</template>

<style scoped>
.workflow-progress { min-width: 0; display: grid; align-items: start; overflow-x: auto; padding: 3px 0; scrollbar-width: thin; }
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
