<script setup lang="ts">
import { computed } from 'vue'
import { buildTaskHistory, formatHistoryTime } from '@/utils/task-history'
import type { GovernanceTask, GovernanceTaskOperateLog, TaskAbnormal } from '@/api/governance-task'
import type { TaskWorkflow } from '@/api/task-workflow'
const props = defineProps<{ task?: GovernanceTask; logs?: GovernanceTaskOperateLog[]; flow?: TaskWorkflow; spots?: TaskAbnormal[]; loading?: boolean; error?: string; dark?: boolean }>()
const entries = computed(() => buildTaskHistory(props.task, props.logs, props.flow, props.spots))
</script>
<template>
  <section class="task-history" :class="{ dark }">
    <header><h3>任务处理记录</h3><span>{{ entries.length }} 条</span></header>
    <div class="history-scroll" tabindex="0" aria-label="任务处理记录，可滚动查看">
      <p v-if="loading" class="history-message" role="status">正在加载任务处理记录…</p>
      <p v-if="error" class="history-message history-error" role="alert">{{ error }}</p>
      <ol v-if="entries.length"><li v-for="entry in entries" :key="entry.id"><div class="history-heading"><b>{{ entry.title }}</b><time>{{ formatHistoryTime(entry.time) }}</time></div><p class="history-actor">{{ entry.actor }}</p><p v-for="(line, index) in entry.content" :key="index" class="history-content">{{ line }}</p></li></ol>
      <p v-else-if="!loading && !error" class="history-message">暂无任务处理记录</p>
    </div>
  </section>
</template>
<style scoped>
.task-history{display:flex;flex-direction:column;min-height:0;min-width:0;height:100%;font-family:inherit;font-size:13px;--history-text:#254863;--history-muted:#718799;--history-line:#dbe8f1;color:var(--history-text)}
.task-history.dark{--history-text:#b6d7e1;--history-muted:#83aabb;--history-line:#125271}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid var(--history-line);flex-shrink:0}h3{margin:0;font-size:15px;font-weight:600}header>span{color:var(--history-muted);font-size:12px}
.history-scroll{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;padding:0 12px}ol{list-style:none;margin:0;padding:0}li{padding:12px 0;border-bottom:1px solid var(--history-line)}li:last-child{border-bottom:0}.history-heading{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;line-height:1.6}.history-heading b{font-weight:600}time,.history-actor{color:var(--history-muted);font-size:12px}.history-actor{margin:4px 0}.history-content{margin:5px 0;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.history-message{margin:14px 0;line-height:1.6;color:var(--history-muted)}.history-error{color:#d06959}
</style>
