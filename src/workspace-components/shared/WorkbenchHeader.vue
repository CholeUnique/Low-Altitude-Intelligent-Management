<script setup lang="ts">
import WorkflowSteps from './WorkflowSteps.vue'
import WorkbenchTaskNotice from './WorkbenchTaskNotice.vue'
import type { WorkflowNode } from '@/api/task-workflow'
import type { MyWorkflowTask } from '@/api/my-workflow-tasks'

withDefaults(defineProps<{
  title:string;taskName?:string;steps?:Array<{key:string;name:string;order:number;status:string;viewable:boolean;instance?:WorkflowNode}>
  selectedKey?:string;userId:string;busy?:boolean;showBack?:boolean;backLabel?:string
  showNotice?:boolean;tasks?:MyWorkflowTask[];noticeError?:string
}>(),{steps:()=>[],tasks:()=>[],showBack:true,backLabel:'返回任务'})
const emit=defineEmits<{back:[];select:[key:string];openAll:[];openTask:[task:MyWorkflowTask]}>()
</script>
<template>
  <header class="workbench-header" aria-label="工作台操作">
    <div class="workbench-brand"><button v-if="showBack" type="button" class="workbench-back" @click="emit('back')">‹ {{ backLabel }}</button><div><b :title="title">{{ title }}</b></div></div>
    <WorkflowSteps :steps="steps" :selected-key="selectedKey" :user-id="userId" :busy="busy" @select="emit('select',$event)" />
    <div class="workbench-header-actions"><slot name="status"/><WorkbenchTaskNotice v-if="showNotice" :tasks="tasks" :error="noticeError" @open-all="emit('openAll')" @open-task="emit('openTask',$event)" /></div>
  </header>
</template>
<style scoped>
.workbench-header{position:relative;z-index:100;flex:0 0 72px;min-width:0;box-sizing:border-box;display:grid;grid-template-columns:minmax(210px,1fr) minmax(0,2.6fr) auto;align-items:center;gap:12px;padding:0 14px;background:#08283c;color:#e1f2fb;border-bottom:1px solid #14506a;font:14px/1.5 var(--ui-font);isolation:isolate}.workbench-brand{display:flex;align-items:center;gap:10px;min-width:0}.workbench-brand>div{min-width:0}.workbench-brand b,.workbench-brand small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.workbench-brand b{font-size:15px;font-weight:700}.workbench-brand small{font-size:12px;margin-top:3px;color:#a6c2d3}.workbench-back{height:32px;flex:none;white-space:nowrap;padding:0 10px;border:1px solid #3b7592;border-radius:5px;background:#0a4769;color:#e2f2fb;font:12px var(--ui-font);cursor:pointer}.workbench-back:hover{background:#155879}.workbench-header-actions{min-width:32px;display:flex;align-items:center;justify-content:flex-end;gap:8px}.workbench-header :deep(.shared-workflow-steps){min-width:0;width:100%}.workbench-header :deep(.shared-workflow-steps>button){font-size:12px;padding:7px 3px}.workbench-header :deep(.workflow-actor-badge){z-index:5}.workbench-header button:focus-visible{outline:2px solid #62dcea;outline-offset:3px}@media(max-width:950px){.workbench-header{flex-basis:auto;min-height:112px;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;padding:9px 14px}.workbench-header :deep(.shared-workflow-steps){grid-column:1/-1;grid-row:2;overflow-x:auto;padding-bottom:3px;scrollbar-width:thin}.workbench-header :deep(.shared-workflow-steps>button){min-width:76px}.workbench-header-actions{grid-column:2;grid-row:1}.workbench-brand b{font-size:14px}}
</style>
