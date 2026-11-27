<script setup lang="ts">
import WorkflowActorBadge from '@/components/WorkflowActorBadge.vue'
import type { WorkflowNode } from '@/api/task-workflow'
defineProps<{ steps: Array<{ key: string; name: string; order: number; status: string; viewable: boolean; instance?: WorkflowNode }>; selectedKey?: string; userId: string; busy?: boolean }>()
const emit = defineEmits<{select:[key:string]}>()
</script>
<template>
  <nav class="shared-workflow-steps" aria-label="任务办理步骤">
    <button v-for="step in steps" :key="step.key" :class="[step.status,{selected:step.key===selectedKey,mine:step.instance?.assigneeId===userId}]" :disabled="busy||!step.viewable" :aria-current="step.key===selectedKey?'step':undefined" :title="!step.viewable?'还未进行到此流程':step.status==='completed'?'已处理，当前页面只读':step.instance?.assigneeName?`当前处理人：${step.instance.assigneeName}`:step.name" @click="emit('select',step.key)">
      <div class="workflow-step-symbol"><i>{{ step.status==='completed'?'✓':step.order }}</i><WorkflowActorBadge v-if="step.instance" :node="step.instance" :user-id="userId" /></div><span>{{ step.name }}</span>
    </button>
  </nav>
</template>
<style scoped>
.shared-workflow-steps{display:flex;min-width:0;align-items:center;flex:1}.shared-workflow-steps button{position:relative;flex:1;display:grid;justify-items:center;gap:6px;min-width:0;border:0;background:transparent;color:#9bb9ca;font:12px/1.4 var(--ui-font);padding:7px 3px;cursor:pointer}.shared-workflow-steps button:not(:last-child):after{content:'';position:absolute;top:21px;left:calc(50% + 17px);right:calc(-50% + 17px);height:2px;background:#3b657b}.workflow-step-symbol{position:relative;display:grid;place-items:center;width:28px;height:28px;z-index:2}.workflow-step-symbol i{display:grid;place-items:center;box-sizing:border-box;width:28px;height:28px;border:1px solid #648a9f;border-radius:50%;background:#153b52;font-style:normal}.completed i{background:#0b8c9e;border-color:#65d7d9;color:white}.active i{background:#147fc0;border-color:#74d6ff;color:white;box-shadow:0 0 0 3px #218bd333}.active span{color:#77ddff;font-weight:700}.selected span{color:#fff;text-decoration:underline;text-underline-offset:5px}.selected i{outline:2px solid #8fe7ff;outline-offset:2px}button:disabled{opacity:.5;cursor:not-allowed}span{white-space:nowrap}
</style>
