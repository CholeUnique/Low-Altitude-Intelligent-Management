<script setup lang="ts">
import { computed } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import type { NonGrainWorkflowNodeKey } from '@/types'

const props = withDefaults(defineProps<{ context: NonGrainWorkspaceContext; node?: NonGrainWorkflowNodeKey }>(), { node: 'task-acceptance' })

const compactItems = computed(() => {
  const shared = [
    { icon: '单', label: '任务编号', value: props.context.task.taskNo },
    { icon: '景', label: '所属场景', value: '耕地种植用途管控与“非粮化”动态监测' },
  ]
  const byNode: Record<NonGrainWorkflowNodeKey, Array<{ icon: string; label: string; value: string; tone?: string }>> = {
    'task-acceptance': [],
    'section-preliminary-review': [{ icon: '斑', label: '当前疑似图斑', value: `${props.context.summary.plotCount} 个`, tone: 'primary' }, { icon: '核', label: '科室初核结论', value: '疑似非粮化，建议下发区级核实', tone: 'danger' }],
    'department-confirmation': [{ icon: '斑', label: '待下发图斑', value: `${props.context.summary.plotCount} 个`, tone: 'primary' }, { icon: '确', label: '部门确认结论', value: '疑似非粮化，需下发网格核查', tone: 'danger' }],
    'on-site-verification': [{ icon: '查', label: '待核查图斑', value: `${props.context.summary.plotCount} 个`, tone: 'primary' }, { icon: '标', label: '核查目标', value: '核实种植用途并采集现场证据' }],
    'rectification-disposal': [{ icon: '改', label: '待整改图斑', value: `${props.context.summary.plotCount} 个`, tone: 'primary' }, { icon: '令', label: '整改要求', value: '恢复粮食种植条件，提交整改结果' }],
    'drone-review': [{ icon: '飞', label: '待复核图斑', value: `${props.context.summary.plotCount} 个`, tone: 'primary' }, { icon: '标', label: '复核目标', value: '核实整改成效，确认是否完成治理' }],
    'case-archive': [{ icon: '档', label: '待结案图斑', value: `${props.context.summary.plotCount} 个`, tone: 'primary' }, { icon: '卷', label: '结案目标', value: '归档处置结果，形成闭环记录' }],
  }
  return [...shared, ...byNode[props.node]]
})
</script>

<template>
  <section v-if="node === 'task-acceptance'" class="ng-summary ng-summary--acceptance">
    <article class="ng-summary-card"><i>景</i><span><small>所属场景</small><b>耕地种植用途管控与“非粮化”动态监测</b></span></article>
    <article class="ng-summary-card"><i>时</i><span><small>发现时间</small><b>2026-09-23 10:32</b></span></article>
    <article class="ng-summary-card"><i>位</i><span><small>所属区域</small><b>{{ context.task.area }}</b></span></article>
    <article class="ng-summary-card"><i>斑</i><span><small>问题图斑数量</small><b>{{ context.summary.plotCount }} 个</b></span></article>
    <article class="ng-summary-card"><i>积</i><span><small>疑似总面积</small><b class="ng-kpi-emphasis">8.42 亩</b></span></article>
    <article class="ng-summary-card"><i>田</i><span><small>高标准农田</small><b class="ng-success-text">是</b></span></article>
    <article class="ng-summary-card"><i>层</i><span><small>永久基本农田</small><b class="ng-success-text">部分重叠 6.31 亩</b></span></article>
  </section>
  <section v-else class="ng-summary ng-summary--compact">
    <article v-for="item in compactItems" :key="item.label" class="ng-summary-card"><i :class="item.tone">{{ item.icon }}</i><span><small>{{ item.label }}</small><b :class="item.tone ? `is-${item.tone}` : ''">{{ item.value }}</b></span></article>
  </section>
</template>
