<script setup lang="ts">
import DashboardSymbol from '@/components/DashboardSymbol.vue'
import type { MyWorkflowTask } from '@/api/my-workflow-tasks'

defineProps<{ tasks: MyWorkflowTask[]; error?: string }>()
const emit = defineEmits<{ openAll: []; openTask: [task: MyWorkflowTask] }>()
</script>

<template>
  <div class="workbench-notice-shell">
    <button class="workbench-notice" type="button" aria-label="我的待办通知" title="前往我的待办" @click="emit('openAll')">
      <DashboardSymbol name="notification" /><b>{{ tasks.length > 99 ? '99+' : tasks.length }}</b>
    </button>
    <div class="workbench-notices">
      <header><strong>其他待我处理的任务</strong><button type="button" @click="emit('openAll')">查看全部</button></header>
      <div class="workbench-notice-list">
        <button v-for="task in tasks" :key="task.id" type="button" @click="emit('openTask', task)">
          <span><b :title="task.name">{{ task.name }}</b><small>{{ task.taskNo }} · 待我处理</small></span><time>{{ task.taskStatusDesc }}</time>
        </button>
        <p v-if="error">{{ error }}</p><p v-else-if="!tasks.length">暂无其他待我处理的任务</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workbench-notice-shell{position:relative;justify-self:end;width:32px;height:32px}
.workbench-notice{position:relative;width:32px;height:32px;padding:0;display:grid;place-items:center;background:transparent;border:0;cursor:pointer}
.workbench-notice :deep(svg){width:25px;height:25px;filter:drop-shadow(0 0 4px #1ce5f540)}
.workbench-notice>b{position:absolute;top:-1px;right:-3px;min-width:16px;height:16px;padding:0 3px;border-radius:9px;background:#f04d62;color:#fff;font:12px/16px var(--ui-font);text-align:center}
.workbench-notices{position:absolute;z-index:240;top:32px;right:0;display:none;flex-direction:column;width:310px;max-width:calc(100vw - 32px);max-height:min(440px,calc(100dvh - 90px));padding:14px;overflow:hidden;border:1px solid #dce5ee;border-radius:10px;background:#fff;color:#40566c;box-shadow:0 10px 28px #173e5926}
.workbench-notice-shell:is(:hover,:focus-within) .workbench-notices{display:flex}
.workbench-notices header{display:flex;flex:none;justify-content:space-between;align-items:center;gap:12px;padding-bottom:10px;border-bottom:1px solid #e8eef4}
.workbench-notices header strong{color:#21354c;font-size:14px}.workbench-notices header button{border:0;padding:0;background:transparent;color:#176db3;font:12px/22px var(--ui-font);cursor:pointer}
.workbench-notice-list{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:none}.workbench-notice-list::-webkit-scrollbar{display:none}
.workbench-notice-list>button{display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;border:0;border-bottom:1px solid #e8eef4;background:transparent;text-align:left;cursor:pointer}
.workbench-notice-list>button:hover{background:#edf5fc}.workbench-notice-list span{flex:1;min-width:0}.workbench-notice-list b,.workbench-notice-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.workbench-notice-list b{font:500 13px/20px var(--ui-font);color:#21354c}.workbench-notice-list small,.workbench-notice-list p{font:12px/18px var(--ui-font);color:#65788b}.workbench-notice-list time{max-width:88px;color:#ba6a08;font:12px/18px var(--ui-font)}
</style>
