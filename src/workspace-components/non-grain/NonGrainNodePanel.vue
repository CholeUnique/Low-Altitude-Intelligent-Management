<script setup lang="ts">
import { computed } from 'vue'
import { useBackendTaskData } from '@/workspace-components/shared/use-backend-task'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import NonGrainImageryComparison from './NonGrainImageryComparison.vue'
import './workspace.scss'

const props = defineProps<{ taskId?: string; nodeKey?: string; flowError?: string; flowLoading?: boolean; readonly?: boolean }>()
const { detail, flow, geometry, abnormals, results, images, logs, loading, errors, activeSpotId, task, selectedNode, selectedSpot, text, handleLabel, load } = useBackendTaskData(props)
const isAcceptance = computed(() => props.nodeKey === 'task-acceptance')
const summaries = computed(() => [
  { icon: '单', label: '任务编号', value: task.value?.taskNo },
  { icon: '景', label: '所属场景', value: task.value?.sceneName },
  { icon: '位', label: '所属区域', value: task.value?.rangeName },
  { icon: '斑', label: '问题图斑数量', value: detail.value?.abnormalCount == null ? undefined : `${detail.value.abnormalCount} 个` },
  { icon: '积', label: '异常总面积', value: detail.value?.abnormalArea == null ? undefined : `${detail.value.abnormalArea} ㎡` },
  { icon: '态', label: '任务状态', value: task.value?.taskStatusDesc },
  { icon: '人', label: '负责人', value: task.value?.assigneeName },
])
const nodeLayout = computed(() => ({
  'section-preliminary-review': { left: 'span-6', right: 'span-6', overview: '初核图斑概览', title: '科室初核 / 下发', fields: ['初核结论', '下发部门', '下发方式', '初核说明'] },
  'department-confirmation': { left: 'span-6', right: 'span-6', overview: '部门确认依据', title: '部门确认填报', fields: ['确认结论', '接收单位', '接收人员', '确认说明'] },
  'on-site-verification': { left: 'span-3', right: 'span-9', overview: '待核查图斑', title: '现场核查填报', fields: ['核查结论', '实际用途', '种植作物', '核查说明'] },
  'rectification-disposal': { left: 'span-6', right: 'span-6', overview: '待整改图斑', title: '整改处置填报', fields: ['整改要求', '整改措施', '整改期限', '整改说明'] },
  'drone-review': { left: 'span-8', right: 'span-4', overview: '无人机复核影像', title: '复核结果填报', fields: ['复核结论', '复耕情况', '复核说明'] },
  'case-archive': { left: 'span-5', right: 'span-7', overview: '结案依据概览', title: '结案信息填报', fields: ['结案结论', '结案说明', '归档材料'] },
} as Record<string, { left: string; right: string; overview: string; title: string; fields: string[] }>)[props.nodeKey || ''] || { left: 'span-6', right: 'span-6', overview: '任务图斑', title: '节点办理记录', fields: [] })
const nodeFields = computed(() => {
  const value = selectedNode.value?.resultData
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.entries(value).map(([label, content]) => ({ label, value: typeof content === 'object' ? JSON.stringify(content) : text(content) }))
  return nodeLayout.value.fields.map(label => ({ label, value: '暂无数据' }))
})
const comparisonImages = computed(() => task.value?.comparisonImages || [])
const showLogError = computed(() => errors.value.some(message => message.startsWith('操作记录')))
</script>

<template>
  <div class="ng-page" :class="isAcceptance ? 'ng-page-acceptance' : 'ng-page-stage'">
    <div v-if="!loading && nodeKey && readonly" class="ng-readonly">当前节点只读：已处理或不属于本人的工作权限</div>
    <div v-if="loading" class="ng-readonly" role="status">正在加载后端数据…</div>
    <div v-else-if="errors.length || flowError" class="ng-readonly" role="alert">{{ [...errors, flowError].filter(Boolean).join('；') }}</div>
    <div class="ng-grid">
      <section :class="['ng-summary span-12', isAcceptance ? 'ng-summary--acceptance' : 'ng-summary--compact']">
        <article v-for="item in (isAcceptance ? summaries : summaries.filter((_, index) => [0, 1, 3, 5].includes(index)))" :key="item.label" class="ng-summary-card"><i>{{ item.icon }}</i><span><small>{{ item.label }}</small><b :title="text(item.value)">{{ text(item.value) }}</b></span></article>
      </section>

      <template v-if="isAcceptance && !flowLoading">
        <NonGrainImageryComparison class="span-8" :images="comparisonImages" :spot="selectedSpot" />
        <section class="ng-card span-4 ng-side-diagnosis">
          <div class="ng-detail-block"><h3><i>详</i>疑似图斑详情</h3><ul class="ng-list dense"><li><span>图斑编号</span><b>{{ text(selectedSpot?.spotNo || selectedSpot?.id) }}</b></li><li><span>图斑面积</span><b>{{ selectedSpot?.area == null ? '暂无数据' : `${selectedSpot.area} ㎡` }}</b></li><li><span>异常类型</span><b>{{ text(selectedSpot?.abnormalTypeDesc) }}</b></li><li><span>发现时间</span><b>{{ text(selectedSpot?.foundTime) }}</b></li><li><span>当前状态</span><b>{{ selectedSpot ? handleLabel(selectedSpot.handleStatus) : '暂无数据' }}</b></li></ul></div>
          <div class="ng-ai-block"><h4>监测说明</h4><p>{{ selectedSpot?.description || task?.description || '暂无后端监测说明' }}</p></div>
        </section>
        <section class="ng-card span-4 ng-issue-panel"><h3><i>列</i>问题图斑列表 <small>（共 {{ abnormals.length }} 个）</small></h3><div class="ng-plot-list"><article v-for="spot in abnormals" :key="spot.id" class="ng-plot clickable" :class="{ active: activeSpotId === spot.id }" @click="activeSpotId = spot.id"><b>{{ spot.title }}</b><small>{{ spot.spotNo || spot.id }} · {{ spot.area ?? '—' }} ㎡</small><em>{{ handleLabel(spot.handleStatus) }}</em></article></div><p v-if="!abnormals.length" class="ng-empty">暂无异常图斑</p></section>
        <section class="ng-card span-4 ng-analysis-panel"><h3><i>析</i>任务范围</h3><div v-if="geometry.features.length || abnormals.length" class="ng-real-map"><TaskRangeMap :geo-json="geometry" :abnormal-points="abnormals" :active-abnormal-id="activeSpotId" :fit-abnormal-points="true" /></div><p v-else class="ng-empty">暂无任务范围</p></section>
        <section class="ng-card span-4 ng-explain-panel ng-scroll"><h3><i>痕</i>操作留痕 <small>{{ logs.length }} 条</small></h3><article v-for="log in logs" :key="log.id" class="ng-real-log"><b>{{ log.operateTypeDesc }}</b><small>{{ text(log.createTime) }} · {{ log.operatorName || '暂无操作人' }}</small><p>{{ log.operateDesc }}</p><details v-if="log.detailJson"><summary>变更明细</summary><pre>{{ log.detailJson }}</pre></details></article><p v-if="!logs.length && !loading && !showLogError">暂无操作留痕</p></section>
      </template>

      <template v-else-if="!nodeKey">
        <section class="ng-card span-12 ng-stage-card"><h3><i>流</i>工作流状态</h3><p v-if="flowLoading">正在核对真实工作流…</p><p v-else-if="flowError">{{ flowError }}</p><p v-else-if="flow">后端尚未提供可对应此工作台页面的办理节点，请核对流程配置。</p><p v-else>该任务尚未启动工作流，没有可进入的办理节点。未进行的节点仅显示流程位置，不能打开或操作。</p><h4>真实任务操作留痕（{{ logs.length }} 条）</h4><article v-for="log in logs" :key="log.id" class="ng-real-log"><b>{{ log.operateTypeDesc }}</b><small>{{ text(log.createTime) }} · {{ log.operatorName || '暂无操作人' }}</small><p>{{ log.operateDesc }}</p><details v-if="log.detailJson"><summary>变更明细</summary><pre>{{ log.detailJson }}</pre></details></article></section>
      </template>
      <template v-else>
        <section class="ng-card ng-stage-card" :class="nodeLayout.left"><h3><i>斑</i>{{ nodeLayout.overview }}</h3><div v-if="geometry.features.length || abnormals.length" class="ng-node-map"><TaskRangeMap :geo-json="geometry" :abnormal-points="abnormals" :active-abnormal-id="activeSpotId" :fit-abnormal-points="true" /></div><div class="ng-plot-list ng-plot-list--side"><article v-for="spot in abnormals" :key="spot.id" class="ng-plot clickable" :class="{ active: activeSpotId === spot.id }" @click="activeSpotId = spot.id"><b>{{ spot.title }}</b><small>{{ spot.spotNo || spot.id }} · {{ spot.area ?? '—' }} ㎡</small></article></div><p v-if="!abnormals.length" class="ng-empty">暂无图斑记录</p><div class="ng-info-box"><h4>任务说明</h4><p>{{ task?.description || '暂无任务说明' }}</p></div></section>
        <section class="ng-card ng-stage-card" :class="nodeLayout.right"><h3><i>填</i>{{ nodeLayout.title }}</h3><div class="ng-record-bar"><span>任务编号<b>{{ task?.taskNo || '暂无数据' }}</b></span><span>办理人<b>{{ selectedNode?.assigneeName || '暂无数据' }}</b></span><span>提交时间<b>{{ text(selectedNode?.submitTime) }}</b></span><span>任务状态<b>{{ task?.taskStatusDesc || '暂无数据' }}</b></span></div><div class="ng-form"><label v-for="field in nodeFields" :key="field.label" class="ng-field"><span>{{ field.label }}</span><textarea :value="field.value" readonly /></label></div><p v-if="!flow" class="ng-info-box">{{ flowError || '该任务尚未启动工作流，暂无节点办理内容。' }}</p><h4>节点附件与成果材料</h4><div class="ng-materials"><article v-for="file in selectedNode?.files || []" :key="file.id"><b>{{ file.fileName }}</b><small>{{ text(file.createTime) }}</small></article><article v-for="result in results" :key="result.id"><b>{{ result.resultType }} · {{ result.parseStatusDesc }}</b><p v-for="file in result.files" :key="file.id">{{ file.fileName }}</p></article></div><p v-if="!selectedNode?.files?.length && !results.length">暂无附件或成果材料</p><div class="ng-real-photos"><img v-for="image in images.filter(item => item.thumbnailUrl || item.imageUrl)" :key="image.id" :src="image.thumbnailUrl || image.imageUrl" :alt="image.fileName" /></div><h4>任务操作留痕（{{ logs.length }} 条）</h4><article v-for="log in logs" :key="log.id" class="ng-real-log"><b>{{ log.operateTypeDesc }}</b><small>{{ text(log.createTime) }} · {{ log.operatorName || '暂无操作人' }}</small><p>{{ log.operateDesc }}</p><details v-if="log.detailJson"><summary>变更明细</summary><pre>{{ log.detailJson }}</pre></details></article><p v-if="!logs.length && !loading && !showLogError">暂无操作留痕</p><div class="ng-actions"><button @click="load" :disabled="loading">刷新任务数据</button></div></section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ng-plot-list .ng-plot{flex:0 0 auto;min-height:54px;box-sizing:border-box}.ng-real-map{flex:1;min-height:0;position:relative;overflow:hidden;border:1px solid #b9d0dd;border-radius:6px}.ng-node-map{height:220px;flex:0 0 220px;border-radius:6px;overflow:hidden}.ng-real-image{width:100%;min-height:0;flex:1;object-fit:contain}.ng-empty{flex:1;display:grid;place-items:center;color:#8195a6;font-size:12px}.ng-scroll,.ng-plot-list{overflow:auto;scrollbar-width:thin}.ng-real-log{padding:8px 0;border-bottom:1px solid #edf2f5;font-size:12px}.ng-real-log b,.ng-real-log small{display:block}.ng-real-log small{margin-top:4px;color:#8195a6}.ng-real-log p{margin:5px 0;line-height:1.5}.ng-real-log pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f8fa;padding:8px}.ng-real-photos{display:flex;gap:10px;flex-wrap:wrap}.ng-real-photos img{max-width:150px;max-height:100px;object-fit:contain}
</style>
