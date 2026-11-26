<script setup lang="ts">
import type { PortalTask } from '@/types'
import DefaultWorkflowPanel from '@/workspace-components/shared/DefaultWorkflowPanel.vue'
import ForestryBeforeAfter from '@/workspace-components/forestry/ForestryBeforeAfter.vue'

/**
 * 绑定后端流程节点的通用办理页：按后端 nodeKey 复用默认流程面板
 * （业务受理 / 现场核查 / 结案归档三种表单与提交逻辑），
 * 需要核对影像的节点额外挂整改前后对比，附图沿用面板内的材料上传。
 */
const props = defineProps<{ task?: PortalTask; backendKey: string; showImagery?: boolean; imageryTitle?: string }>()
</script>

<template>
  <DefaultWorkflowPanel :key="`${task?.id || ''}:${backendKey}`" :task-id="task?.id" :node-key="backendKey" :readonly="backendKey === 'DISTRICT_DISPATCH'">
    <template v-if="showImagery" #context="{ task: workflowTask, selectedSpot, selectedNode }">
      <ForestryBeforeAfter :images="workflowTask?.comparisonImages || []" :spot="selectedSpot" :has-evidence="Boolean(selectedNode?.files?.length)" :title="imageryTitle" />
    </template>
  </DefaultWorkflowPanel>
</template>
