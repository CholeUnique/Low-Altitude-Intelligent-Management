<script setup lang="ts">
import TaskHistory from '@/components/task-center/TaskHistory.vue'
import WorkbenchFeedback from '@/workspace-components/shared/WorkbenchFeedback.vue'
import { computed } from 'vue'
import { useBackendTaskData } from './use-backend-task'
import NonGrainImageryComparison from '@/workspace-components/non-grain/NonGrainImageryComparison.vue'
import { taskPriorityLabel } from '@/api/governance-task'
import '@/workspace-components/non-grain/workspace.scss'

const props = defineProps<{ taskId?: string }>()
const { detail, geometry, abnormals, logs, flow, loading, errors, activeSpotId, task, selectedSpot, text, handleLabel } = useBackendTaskData({ get taskId() { return props.taskId }, readonly: true, includeMaterials: false })
const summaries = computed(() => [
  { icon: '景', label: '所属场景', value: task.value?.sceneName },
  { icon: '时', label: '创建时间', value: task.value?.createTime },
  { icon: '位', label: '所属区域', value: task.value?.rangeName },
  { icon: '斑', label: '问题图斑数量', value: detail.value?.abnormalCount == null ? undefined : `${detail.value.abnormalCount} 个` },
  { icon: '积', label: '异常总面积', value: detail.value?.abnormalArea == null ? undefined : `${detail.value.abnormalArea} ㎡` },
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
const detailFields = computed(() => {
  const fields = [...spotFields.value, ...basics.value]
  return fields.filter(([label], index) => fields.findIndex(([name]) => name === label) === index)
})
</script>

<template>
  <div class="ng-page task-acceptance">
    <WorkbenchFeedback :message="errors.join('；')" />
    <section class="ng-summary ng-summary--acceptance acceptance-summary">
      <article v-for="item in summaries" :key="item.label" class="ng-summary-card"><i>{{ item.icon }}</i><span><small>{{ item.label }}</small><b :title="text(item.value)">{{ text(item.value) }}</b></span></article>
    </section>
    <div class="acceptance-layout">
      <section class="ng-card acceptance-plot-panel"><h3><i>斑</i>问题图斑列表 <small>共 {{ abnormals.length }} 个</small></h3>
            <div class="acceptance-plots"><button v-for="(spot, index) in abnormals" :key="spot.id" :class="{ selected: activeSpotId === spot.id }" @click="activeSpotId = spot.id"><img v-if="spot.imageUrl" :src="spot.imageUrl" :alt="spot.title" /><span v-else class="plot-placeholder">{{ index + 1 }}</span><b>{{ spot.title }}</b><small>{{ spot.spotNo || spot.id }} · {{ handleLabel(spot.handleStatus) }}</small><strong>{{ spot.area == null ? '暂无面积' : `${spot.area} ㎡` }}</strong></button></div>
            <p v-if="!abnormals.length" class="empty-copy">当前任务暂无异常图斑</p>
          </section>
      <NonGrainImageryComparison :images="task?.comparisonImages || []" :spot="selectedSpot" :geometry="geometry" :abnormals="abnormals" :allow-image-selection="false" />
      <section class="ng-card acceptance-detail-panel"><h3><i>详</i>疑似图斑详情</h3><div class="acceptance-scroll"><dl class="detail-pairs"><template v-for="[label, value] in detailFields" :key="label"><dt>{{ label }}</dt><dd>{{ text(value) }}</dd></template></dl></div></section>
      <section class="ng-card acceptance-record-panel"><TaskHistory :task="task" :logs="logs" :flow="flow" :spots="abnormals" :loading="loading" /></section>
    </div>
  </div>
</template>

<style scoped>
.task-acceptance{display:flex;flex-direction:column;overflow:auto;scrollbar-width:thin}
.acceptance-summary{flex-shrink:0;min-height:72px;margin-bottom:12px;grid-template-columns:repeat(6,minmax(0,1fr))}
.acceptance-layout{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(0,1.3fr);grid-template-rows:minmax(250px,1.15fr) minmax(200px,1fr);gap:12px;flex:1;min-height:462px}
.acceptance-layout>.ng-card{min-height:0;box-sizing:border-box}
.acceptance-layout :deep(.imagery-comparison){height:100%;min-height:0;box-sizing:border-box}
.acceptance-scroll{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;padding-right:4px}
.detail-pairs{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;margin:0;font-size:12px;line-height:1.5}
.detail-pairs dt{color:#8195a6}.detail-pairs dd{margin:0;color:#254863;overflow-wrap:anywhere}
.acceptance-plots{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;overflow:auto;min-height:0;align-content:start;scrollbar-width:thin}
.acceptance-plots button{display:grid;gap:5px;align-content:start;padding:8px;text-align:left;color:#264f69;background:#f8fbff;border:1px solid #dfebf4;border-radius:6px;cursor:pointer}
.acceptance-plots button.selected{border-color:#1687ef;box-shadow:0 0 0 1px #1687ef}
.acceptance-plots img,.plot-placeholder{width:100%;height:85px;object-fit:cover;border-radius:5px}
.plot-placeholder{display:grid;place-items:center;background:#e7f2fa;color:#1687ef;font-size:22px}
.acceptance-plots b{font-size:12px}.acceptance-plots small{font-size:10px;color:#8195a6}.acceptance-plots strong{font-size:15px;color:#147dda}
.acceptance-record-panel{padding:0!important;overflow:hidden}
.empty-copy{margin:16px 0;color:#8195a6;font-size:12px;text-align:center}
@media(max-width:1100px){.acceptance-summary{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:8px}}
@media(max-width:800px){.acceptance-layout{flex:none;grid-template-columns:minmax(0,1fr);grid-template-rows:260px 360px 360px 360px}.acceptance-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
