<script setup lang="ts">
import { computed } from 'vue'
import { ElTooltip } from 'element-plus'
import type { WorkflowNode } from '@/api/task-workflow'
import { workflowNodeActor } from '@/utils/workflow-node-actor'
const props = defineProps<{ node?: WorkflowNode; userId: string }>()
const actor = computed(() => workflowNodeActor(props.node, props.userId))
</script>
<template>
  <el-tooltip :show-after="120" :hide-after="0" placement="bottom" popper-class="workflow-actor-tooltip">
    <template #content><span class="workflow-actor-tooltip-content">{{ actor.tooltip }}</span></template>
    <b class="workflow-actor-badge" :class="{ 'actor-mine': actor.mine }" :aria-label="actor.tooltip" tabindex="0">{{ actor.mine ? '我' : actor.initial }}</b>
  </el-tooltip>
</template>
<style scoped>
.workflow-actor-badge{position:absolute;z-index:5;top:-6px;right:-9px;display:grid;place-items:center;box-sizing:border-box;width:18px;height:18px;border:1px solid #c2e8ff;border-radius:50%;color:#fff;background:#278ed3;font-size:12px;font-weight:600;line-height:1;text-align:center;text-decoration:none;box-shadow:0 1px 4px #08233644;cursor:help}.workflow-actor-badge.actor-mine{background:#ee9420;border-color:#ffe1a7}
</style>
<style>
.workflow-actor-tooltip.el-fade-in-linear-enter-active,.workflow-actor-tooltip.el-fade-in-linear-leave-active{transition-duration:.08s}
</style>
<style>
.el-popper.workflow-actor-tooltip{max-width:280px;padding:9px 12px;border:1px solid #33768e;background:#0b3045;color:#dbf1fa;box-shadow:0 5px 18px #001a2d55;font:12px/1.7 var(--ui-font);white-space:pre-line}.el-popper.workflow-actor-tooltip .el-popper__arrow:before{background:#0b3045;border-color:#33768e}.workflow-actor-tooltip-content{white-space:pre-line;font-weight:400}
</style>
