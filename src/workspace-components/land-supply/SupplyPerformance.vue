<script setup lang="ts">
import { computed } from 'vue'
import type { PortalTask, WorkspaceNodeConfig } from '@/types'
import { useBackendTaskData } from '@/workspace-components/shared/use-backend-task'

/**
 * 土地供后巡查「履约分析」：只用后端已有的计划/实际时间与任务进度做偏差计算。
 * 合同约定的开工、竣工、投资、产出节点后端暂无接口，明确标注缺失，不推测履约结论。
 */
const props = defineProps<{ task?: PortalTask; sceneName?: string; node?: WorkspaceNodeConfig }>()
const source = computed(() => props.task?.id)
const { task, abnormals, results, loading, errors, text, load } = useBackendTaskData({ get taskId() { return source.value } })

function parse(value?: string) {
  const time = Date.parse(String(value || '').replace(' ', 'T'))
  return Number.isFinite(time) ? time : undefined
}
function days(value?: number) {
  return value == null ? undefined : Math.round(value / 86_400_000)
}

const startDeviation = computed(() => {
  const plan = parse(task.value?.planStartTime)
  const actual = parse(task.value?.actualStartTime)
  return plan != null && actual != null ? days(actual - plan) : undefined
})
const endDeviation = computed(() => {
  const plan = parse(task.value?.planEndTime)
  const actual = parse(task.value?.actualEndTime) ?? (task.value?.taskStatusDesc?.includes('完成') ? undefined : Date.now())
  return plan != null && actual != null ? days(actual - plan) : undefined
})
const startOverdue = computed(() => (startDeviation.value ?? 0) > 0)
const endOverdue = computed(() => (endDeviation.value ?? 0) > 0)
const finished = computed(() => Boolean(task.value?.taskStatusDesc?.includes('完成')))

const milestones = computed(() => [
  { key: 'start', name: '开工节点', plan: task.value?.planStartTime, actual: task.value?.actualStartTime, deviation: startDeviation.value, overdue: startOverdue.value },
  { key: 'end', name: '竣工/完成节点', plan: task.value?.planEndTime, actual: task.value?.actualEndTime, deviation: endDeviation.value, overdue: endOverdue.value },
])
const progress = computed(() => [
  { icon: '态', label: '任务状态', value: task.value?.taskStatusDesc },
  { icon: '斑', label: '图斑数量', value: `${abnormals.value.length} 个` },
  { icon: '果', label: '成果批次', value: `${results.value.length} 批` },
  { icon: '影', label: '参考影像', value: `${task.value?.comparisonImages?.length || 0} 期` },
])
const contractGaps = [
  '合同约定的开工、竣工、投资、产出时间节点',
  '按节点自动比对是否违约（履约结论、预警等级）',
  '闲置土地认定所需的开工/竣工证明与现场影像关联',
]
</script>

<template>
  <div class="performance-page">
    <p v-if="errors.length" class="page-error" role="alert">{{ errors.join('；') }}</p>
    <section class="milestone-card">
      <header><b>节点履约比对</b><small>按任务计划时间与实际时间计算偏差；合同约定节点需后端接口补充</small></header>
      <table>
        <thead><tr><th>节点</th><th>计划时间</th><th>实际时间</th><th>偏差</th><th>结论</th></tr></thead>
        <tbody>
          <tr v-for="item in milestones" :key="item.key">
            <td>{{ item.name }}</td>
            <td>{{ text(item.plan) }}</td>
            <td>{{ text(item.actual) }}</td>
            <td>{{ item.deviation == null ? '暂无数据' : `${item.deviation > 0 ? '滞后' : '提前'} ${Math.abs(item.deviation)} 天` }}</td>
            <td><em :class="{ overdue: item.overdue, pending: item.deviation == null }">{{ item.deviation == null ? '缺数据' : item.overdue ? '超期' : '正常' }}</em></td>
          </tr>
        </tbody>
      </table>
      <p class="note" v-if="finished">任务已完成，竣工节点按实际完成时间比对。</p>
    </section>
    <section class="progress-strip">
      <article v-for="item in progress" :key="item.label"><i>{{ item.icon }}</i><span><small>{{ item.label }}</small><b>{{ text(item.value) }}</b></span></article>
    </section>
    <section class="gap-card">
      <h3>待后端补充的履约数据 <small>缺口</small></h3>
      <ul><li v-for="item in contractGaps" :key="item">{{ item }}</li></ul>
      <small>建议接口：`POST /v1/biz/supply/milestone/list`、`POST /v1/biz/supply/performance/analyze`</small>
    </section>
    <footer class="page-footer"><span role="status">{{ loading ? '正在读取真实任务…' : '偏差按后端计划/实际时间计算，未使用预估数据' }}</span><button type="button" :disabled="loading" @click="load">刷新</button></footer>
  </div>
</template>

<style scoped>
.performance-page { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 12px; overflow: auto; background: #eef3f8; color: #29475a; font-size: 12px; }
.milestone-card, .gap-card { flex: 0 0 auto; padding: 12px; border: 1px solid #dde7ef; border-radius: 7px; background: #fff; }
.milestone-card header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.milestone-card header b { color: #1f3d52; font-size: 14px; }
.milestone-card header small { color: #8195a6; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 8px 10px; border-bottom: 1px solid #edf2f6; text-align: left; }
th { color: #668090; background: #f5f8fa; font-weight: 500; }
td em { color: #1a9a63; font-style: normal; }
td em.overdue { color: #b04747; }
td em.pending { color: #a9741f; }
.note { margin: 8px 0 0; color: #8195a6; }
.progress-strip { flex: 0 0 auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.progress-strip article { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #d9e3ee; border-radius: 7px; background: #fff; }
.progress-strip i { width: 30px; height: 30px; flex: 0 0 30px; display: grid; place-items: center; border-radius: 7px; color: #1687ef; background: #e8f2fd; font-style: normal; }
.progress-strip small { display: block; color: #8195a6; }
.progress-strip b { display: block; font-size: 14px; }
.gap-card h3 { margin: 0 0 8px; color: #1f3d52; font-size: 14px; }
.gap-card h3 small { margin-left: 6px; padding: 1px 6px; border: 1px solid #d9c48a; border-radius: 8px; color: #8a6d24; font-weight: 400; }
.gap-card ul { margin: 0 0 8px; padding-left: 18px; line-height: 1.8; color: #8a6d24; }
.gap-card > small { color: #9c8748; }
.page-error { margin: 0; padding: 8px 10px; border-radius: 6px; color: #b04747; background: #fdeeee; }
.page-footer { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; color: #6b8394; }
.page-footer span { margin-right: auto; }
.page-footer button { height: 30px; padding: 0 14px; border: 1px solid #c8d9e4; border-radius: 4px; color: #426174; background: #fff; cursor: pointer; }
.page-footer button:disabled { opacity: .5; cursor: not-allowed; }
</style>
