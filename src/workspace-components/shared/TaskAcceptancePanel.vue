<script setup lang="ts">
import { computed } from 'vue'
import { useBackendTaskData } from './use-backend-task'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import NonGrainImageryComparison from '@/workspace-components/non-grain/NonGrainImageryComparison.vue'
import { taskPriorityLabel } from '@/api/governance-task'
import '@/workspace-components/non-grain/workspace.scss'

const props = defineProps<{ taskId?: string }>()
const { detail, geometry, abnormals, results, images, logs, loading, errors, activeSpotId, task, selectedSpot, text, handleLabel, statisticsFields, load } = useBackendTaskData(props)
const summaries = computed(() => [
  { icon: '景', label: '所属场景', value: task.value?.sceneName },
  { icon: '时', label: '创建时间', value: task.value?.createTime },
  { icon: '位', label: '所属区域', value: task.value?.rangeName },
  { icon: '斑', label: '问题图斑数量', value: detail.value?.abnormalCount == null ? undefined : `${detail.value.abnormalCount} 个` },
  { icon: '积', label: '异常总面积', value: detail.value?.abnormalArea == null ? undefined : `${detail.value.abnormalArea} ㎡` },
  { icon: '果', label: '成果批次', value: loading.value ? undefined : `${results.value.length} 个` },
  { icon: '态', label: '任务状态', value: task.value?.taskStatusDesc },
])
const basics = computed<Array<[string, unknown]>>(() => [
  ['任务名称', task.value?.name], ['任务编号', task.value?.taskNo], ['业务场景', task.value?.sceneName],
  ['场景编码', task.value?.sceneCode], ['主责部门', task.value?.deptName], ['任务状态', task.value?.taskStatusDesc],
  ['优先级', task.value ? taskPriorityLabel(task.value.priority) : undefined],
  ['执行方式', task.value?.executeMode === 'AUTO' ? '自动执行' : task.value ? '手动执行' : undefined],
  ['关联类型', task.value?.refType], ['关联对象 ID', task.value?.refId], ['关联信息', detail.value?.refSummary],
  ['计划开始', task.value?.planStartTime], ['计划结束', task.value?.planEndTime],
  ['实际开始', task.value?.actualStartTime], ['实际结束', task.value?.actualEndTime],
  ['任务负责人', task.value?.assigneeName || (task.value?.assigneeId ? `用户 #${task.value.assigneeId}` : undefined)],
  ['创建时间', task.value?.createTime], ['更新时间', task.value?.updateTime],
  ['联系人', task.value?.contactName], ['联系电话', task.value?.contactPhone],
  ['成果要求', task.value?.resultRequirements?.join('、')], ['范围名称', task.value?.rangeName],
  ['范围面积', task.value?.rangeArea == null ? undefined : `${task.value.rangeArea} ${task.value.rangeAreaUnit || ''}`],
  ['范围要素', loading.value ? undefined : `${geometry.value.features.length} 个`], ['内部备注', detail.value?.process?.remark],
])
const spotFields = computed<Array<[string, unknown]>>(() => [
  ['图斑编号', selectedSpot.value?.spotNo || selectedSpot.value?.id], ['图斑名称', selectedSpot.value?.title],
  ['图斑面积', selectedSpot.value?.area == null ? undefined : `${selectedSpot.value.area} ㎡`],
  ['异常类型', selectedSpot.value?.abnormalTypeDesc], ['异常等级', selectedSpot.value?.abnormalLevel],
  ['处置状态', selectedSpot.value ? handleLabel(selectedSpot.value.handleStatus) : undefined], ['发现时间', selectedSpot.value?.foundTime],
  ['经度', selectedSpot.value?.longitude], ['纬度', selectedSpot.value?.latitude],
])
</script>

<template>
  <div class="ng-page task-acceptance">
    <div class="acceptance-state"><span>✓ 任务受理已完成</span><button :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新数据' }}</button></div>
    <p v-if="errors.length" class="data-error" role="alert">{{ errors.join('；') }}</p>
    <section class="ng-summary ng-summary--acceptance acceptance-summary">
      <article v-for="item in summaries" :key="item.label" class="ng-summary-card"><i>{{ item.icon }}</i><span><small>{{ item.label }}</small><b :title="text(item.value)">{{ text(item.value) }}</b></span></article>
    </section>
    <div class="acceptance-layout">
      <main class="acceptance-main">
        <NonGrainImageryComparison :images="task?.comparisonImages || []" :spot="selectedSpot" :geometry="geometry" :abnormals="abnormals" />
        <div class="acceptance-bottom">
          <section class="ng-card"><h3><i>斑</i>问题图斑列表 <small>共 {{ abnormals.length }} 个</small></h3>
            <div class="acceptance-plots"><button v-for="(spot, index) in abnormals" :key="spot.id" :class="{ selected: activeSpotId === spot.id }" @click="activeSpotId = spot.id"><img v-if="spot.imageUrl" :src="spot.imageUrl" :alt="spot.title" /><span v-else class="plot-placeholder">{{ index + 1 }}</span><b>{{ spot.title }}</b><small>{{ spot.spotNo || spot.id }} · {{ handleLabel(spot.handleStatus) }}</small><strong>{{ spot.area == null ? '暂无面积' : `${spot.area} ㎡` }}</strong></button></div>
            <p v-if="!abnormals.length" class="empty-copy">当前任务暂无异常图斑</p>
          </section>
          <section class="ng-card"><h3><i>位</i>任务范围与统计</h3><div class="acceptance-range"><TaskRangeMap v-if="geometry.features.length || abnormals.length" :geo-json="geometry" :abnormal-points="abnormals" :active-abnormal-id="activeSpotId" :fit-abnormal-points="true" /><p v-else class="empty-copy">暂无任务范围</p></div><dl class="acceptance-stats"><div v-for="[label, value] in statisticsFields" :key="label"><dt>{{ label }}</dt><dd>{{ text(value) }}</dd></div></dl></section>
        </div>
      </main>
      <aside class="acceptance-sidebar">
        <section class="ng-card"><h3><i>详</i>疑似图斑详情</h3><dl class="detail-pairs"><template v-for="[label, value] in spotFields" :key="label"><dt>{{ label }}</dt><dd>{{ text(value) }}</dd></template></dl></section>
        <section class="ng-card"><h3><i>析</i>监测说明</h3><p class="description">{{ selectedSpot?.description || '暂无图斑监测说明' }}</p><h4>任务说明</h4><p class="description">{{ task?.description || '暂无任务说明' }}</p></section>
        <section class="ng-card"><h3><i>单</i>任务基本信息</h3><dl class="detail-pairs"><template v-for="[label, value] in basics" :key="label"><dt>{{ label }}</dt><dd>{{ text(value) }}</dd></template></dl></section>
      </aside>
    </div>
    <div class="acceptance-records">
      <section class="ng-card"><h3><i>图</i>影像证据 <small>{{ images.length }} 张</small></h3><div class="evidence-list"><a v-for="image in images" :key="image.id" :href="image.originalUrl || image.imageUrl || image.thumbnailUrl" target="_blank" rel="noopener"><img v-if="image.thumbnailUrl || image.imageUrl" :src="image.thumbnailUrl || image.imageUrl" :alt="image.fileName" /><b>{{ image.fileName }}</b><small>{{ text(image.shootTime) }}</small></a></div><p v-if="!images.length" class="empty-copy">暂无任务关联影像</p></section>
      <section class="ng-card"><h3><i>果</i>成果批次 <small>{{ results.length }} 个</small></h3><article v-for="result in results" :key="result.id" class="result-row"><b>{{ result.resultType }} · {{ result.parseStatusDesc }}</b><small>{{ result.operator || '暂无作业人员' }} · {{ text(result.collectTime || result.createTime) }}</small><p v-for="file in result.files" :key="file.id">{{ file.fileName }}</p></article><p v-if="!results.length" class="empty-copy">暂无后端成果记录</p></section>
      <section class="ng-card"><h3><i>痕</i>任务处理记录 <small>{{ logs.length }} 条</small></h3><article v-for="log in logs" :key="log.id" class="result-row"><b>{{ log.operateTypeDesc }}</b><small>{{ text(log.createTime) }} · {{ log.operatorName || '暂无操作人' }}</small><p>{{ log.operateDesc }}</p><details v-if="log.detailJson"><summary>变更明细</summary><pre>{{ log.detailJson }}</pre></details></article><p v-if="!logs.length" class="empty-copy">暂无操作留痕</p></section>
    </div>
  </div>
</template>

<style scoped>
.task-acceptance{overflow:auto;scrollbar-width:thin}.acceptance-state{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px;color:#16835b}.acceptance-state button{color:#137ed1;background:white;border:1px solid #c9deec;border-radius:4px;padding:5px 12px;cursor:pointer}.acceptance-summary{min-height:72px;margin-bottom:12px}.acceptance-layout{display:grid;grid-template-columns:minmax(0,2.2fr) minmax(300px,1fr);gap:12px;align-items:start}.acceptance-main{min-width:0;display:grid;gap:12px}.acceptance-main :deep(.imagery-comparison){height:420px;box-sizing:border-box}.acceptance-bottom{display:grid;grid-template-columns:1fr 1.15fr;gap:12px}.acceptance-sidebar{display:grid;gap:12px}.detail-pairs{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;margin:0;font-size:12px;line-height:1.5}.detail-pairs dt{color:#8195a6}.detail-pairs dd{margin:0;color:#254863;overflow-wrap:anywhere}.description{margin:0;font-size:12px;line-height:1.8;white-space:pre-wrap}.acceptance-plots{display:grid;grid-template-columns:repeat(3,minmax(95px,1fr));gap:8px;max-height:275px;overflow:auto}.acceptance-plots button{display:grid;gap:5px;align-content:start;padding:8px;text-align:left;color:#264f69;background:#f8fbff;border:1px solid #dfebf4;border-radius:6px;cursor:pointer}.acceptance-plots button.selected{border-color:#1687ef;box-shadow:0 0 0 1px #1687ef}.acceptance-plots img,.plot-placeholder{width:100%;height:85px;object-fit:cover;border-radius:5px}.plot-placeholder{display:grid;place-items:center;background:#e7f2fa;color:#1687ef;font-size:22px}.acceptance-plots b{font-size:12px}.acceptance-plots small{font-size:10px;color:#8195a6}.acceptance-plots strong{font-size:15px;color:#147dda}.acceptance-range{height:185px;overflow:hidden;border-radius:6px}.acceptance-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0 0}.acceptance-stats dt{font-size:10px;color:#8195a6}.acceptance-stats dd{margin:3px 0 0;font-size:12px;color:#254863}.acceptance-records{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}.evidence-list{display:flex;flex-wrap:wrap;gap:10px}.evidence-list a{display:grid;gap:4px;width:120px;color:#264f69;text-decoration:none;font-size:12px}.evidence-list img{height:80px;width:100%;object-fit:cover;border-radius:5px}.result-row{padding:10px 0;border-bottom:1px solid #e7eff5;font-size:12px}.result-row b,.result-row small{display:block}.result-row small{color:#8195a6;margin-top:5px}.result-row p{margin:6px 0;line-height:1.5}.result-row pre{white-space:pre-wrap;overflow-wrap:anywhere}.empty-copy{margin:16px 0;color:#8195a6;font-size:12px;text-align:center}.data-error{color:#b95046;background:#fff1ef;padding:8px;border-radius:5px;font-size:12px}@media(max-width:1100px){.acceptance-layout{grid-template-columns:minmax(0,1.8fr) minmax(270px,1fr)}.acceptance-main :deep(.imagery-comparison){height:360px}.acceptance-bottom{grid-template-columns:1fr}.acceptance-summary{grid-template-columns:repeat(4,minmax(0,1fr));row-gap:8px}.acceptance-plots{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:800px){.acceptance-layout,.acceptance-records{grid-template-columns:1fr}.acceptance-sidebar{grid-template-columns:1fr}.acceptance-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
