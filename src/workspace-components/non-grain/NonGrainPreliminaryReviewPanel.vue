<script setup lang="ts">
import { taskImageryService } from '@/utils/task-imagery'
import WorkbenchFeedback from '@/workspace-components/shared/WorkbenchFeedback.vue'
import { computed, ref, watch } from 'vue'
import { useBackendTaskData } from '@/workspace-components/shared/use-backend-task'
import SpotDistributionMap from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import type { ComparisonPeriod } from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import type { TaskAbnormal } from '@/api/governance-task'
import { getWorkbenchUsers, prioritizeWorkbenchUsers, type WorkbenchUser } from '@/api/workbench-users'
import { getTaskWorkflow, submitWorkflowNode } from '@/api/task-workflow'
import { useUserStore } from '@/stores/user'
import { canOperateWorkflowNode } from '@/utils/task-workflow-state'

import './workspace.scss'

const props = defineProps<{ taskId?: string; readonly?: boolean; flowError?: string; stage?: 'preliminary' | 'department' }>()
const emit = defineEmits<{ submitted: [] }>()
const user = useUserStore()
const departmentMode = computed(() => props.stage === 'department')
const pageLabel = computed(() => departmentMode.value ? '部门确认' : '科室初核')
const dataProps = computed(() => ({ taskId: props.taskId, nodeKey: departmentMode.value ? 'department-confirmation' : 'section-preliminary-review' }))
// 保留响应式 taskId，读取的是同一套任务详情、图斑、影像和节点实例接口。
const { detail, task, flow, abnormals, activeSpotId, selectedNode, logs, loading, errors, text, handleLabel, load } = useBackendTaskData({ get taskId() { return dataProps.value.taskId }, get readonly() { return props.readonly }, get nodeKey() { return dataProps.value.nodeKey }, includeMaterials: false })
const record = computed<Record<string, unknown>>(() => {
  const value = selectedNode.value?.resultData
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
})
const conclusion = computed(() => draft.value.reviewConclusion || record.value.opinion || record.value['初核结论'] || record.value.reviewConclusion)
const comparisonImages = computed(() => task.value?.comparisonImages || [])
const selectedPlotIds = ref<string[]>([])
const previewPlot = ref<TaskAbnormal>()
const dispatchedPlotIds = computed(() => {
  // 只有真实完成的部门确认与后续核查实例能证明任务已下发，勾选不改变状态。
  if (!departmentMode.value || selectedNode.value?.status !== 'COMPLETED' || nextNode.value?.nodeKey !== 'IMPLEMENT') return new Set<string>()
  const recorded = record.value.abnormalIds
  return new Set(Array.isArray(recorded) ? recorded.map(String) : abnormals.value.map(spot => spot.id))
})
const pendingPlots = computed(() => abnormals.value.filter(spot => !dispatchedPlotIds.value.has(spot.id)))
function togglePlot(id: string) {
  if (!canEdit.value || dispatchedPlotIds.value.has(id)) return
  selectedPlotIds.value = selectedPlotIds.value.includes(id) ? selectedPlotIds.value.filter(value => value !== id) : [...selectedPlotIds.value, id]
}
const receiveCount = computed(() => departmentMode.value && canEdit.value ? selectedPlotIds.value.length : abnormals.value.length)
function spotPeriod(spot: TaskAbnormal): ComparisonPeriod {
  const reference = comparisonImages.value[1] || comparisonImages.value[0]
  return spot.imageUrl ? { number: 1, label: spot.title, kind: 'image', imageUrl: spot.imageUrl }
    : reference?.mapService ? { number: 1, label: reference.label, kind: 'map-service', mapService: reference.mapService }
    : { number: 1, label: spot.title, kind: 'empty' }
}

const canEdit = computed(() => !props.readonly && !loading.value && canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || '')) && flow.value?.currentNode?.id === selectedNode.value?.id)
const gridUsers = ref<WorkbenchUser[]>([])
const gridSearch = ref('')
const visibleGridUsers = computed(() => gridUsers.value.filter(person => `${person.realName || ''} ${person.username} ${person.nickname || ''}`.toLowerCase().includes(gridSearch.value.trim().toLowerCase())))
const readonlyGridUsers = computed(() => readonlyForm.value.targetAssigneeId ? [{ id: readonlyForm.value.targetAssigneeId, name: readonlyAssigneeName.value }] : [])
const gridOptions = computed(() => canEdit.value ? visibleGridUsers.value.map(person => ({ id: String(person.id), name: `${person.realName || person.nickname || person.username}（${person.username}）${person.id === String(user.currentUser?.id) ? " · 我" : ""}` })) : readonlyGridUsers.value)
function selectGridUser(id: string) {
  if (!canEdit.value) return
  draft.value.targetAssigneeId = draft.value.targetAssigneeId === id ? '' : id
  draft.value.targetDeptId = gridUsers.value.find(person => person.id === id)?.deptId || ''
}
const optionsLoading = ref(false)
const optionsError = ref('')
const submitError = ref('')
const submitting = ref(false)
const draft = ref({ reviewConclusion: '', targetDeptId: '', targetAssigneeId: '', dispatchMode: '逐级下发', deadline: '', remark: '' })
const nextNode = computed(() => {
  const nodes = flow.value?.timeline || []
  const selected = selectedNode.value
  if (!selected || selected.status !== 'COMPLETED') return undefined
  return nodes.find(node => String(node.prevNodeInstId) === selected.id)
    || nodes[nodes.findIndex(node => node.id === selected.id) + 1]
})
const readonlyForm = computed(() => ({
  reviewConclusion: String(record.value.opinion ?? record.value.reviewConclusion ?? record.value['初核结论'] ?? ''),
  targetDeptId: String(record.value.targetDeptId ?? nextNode.value?.deptId ?? ''),
  targetAssigneeId: String(record.value.targetAssigneeId ?? nextNode.value?.assigneeId ?? ''),
  dispatchMode: String(record.value.dispatchMode ?? ''),
  deadline: String(record.value.deadline ?? nextNode.value?.deadline ?? '').slice(0, 16),
  remark: String(record.value.remark ?? ''),
}))
const reviewForm = computed(() => canEdit.value ? draft.value : readonlyForm.value)
const readonlyAssigneeName = computed(() => String(record.value.targetAssigneeName ?? nextNode.value?.assigneeName ?? '暂无处理人'))
let optionsVersion = 0
watch(() => selectedNode.value?.id, () => {
  draft.value = { reviewConclusion: String(record.value.opinion ?? record.value.reviewConclusion ?? record.value['初核结论'] ?? ''), targetDeptId: '', targetAssigneeId: '', dispatchMode: String(record.value.dispatchMode ?? (departmentMode.value ? '直接指派' : '逐级下发')), deadline: '', remark: String(record.value.remark ?? '') }
  submitError.value = ''
  gridSearch.value = ''
  selectedPlotIds.value = []; previewPlot.value = undefined
})
watch([canEdit, departmentMode, () => props.taskId], async ([editable]) => {
  if (!editable) { optionsVersion++; optionsLoading.value = false; return }
  gridUsers.value = []
  optionsLoading.value = true; optionsError.value = ''
  const version = ++optionsVersion
  try {
    const result = await getWorkbenchUsers(task.value?.deptId || selectedNode.value?.deptId, user.currentUser, user.activeDeptId)
    if (version !== optionsVersion) return
    gridUsers.value = prioritizeWorkbenchUsers(result.users, departmentMode.value ? { gridUsers: true } : { usernames: ['hlqNYNCJ'] })
    optionsError.value = result.warnings.length ? `部分部门用户未加载：${result.warnings.join('；')}` : ''

  }
  catch (error) { if (version === optionsVersion) optionsError.value = error instanceof Error ? error.message : '下发对象读取失败' }
  finally { if (version === optionsVersion) optionsLoading.value = false }
})
async function submitReview() {
  if (!canEdit.value || submitting.value || !props.taskId || !selectedNode.value) return
  submitError.value = ''
  if (departmentMode.value && pendingPlots.value.length) {
    if (!selectedPlotIds.value.length) { submitError.value = '请先选择要下发的图斑。'; return }
    if (pendingPlots.value.some(spot => !selectedPlotIds.value.includes(spot.id))) {
      submitError.value = '当前后端按整条任务流转，暂不支持部分图斑下发。请选中全部待下发图斑，或由后端提供按图斑分派接口。'; return
    }
  }
  if (!draft.value.reviewConclusion.trim() || !draft.value.targetDeptId || !draft.value.targetAssigneeId || !draft.value.deadline) {
    submitError.value = `请填写${pageLabel.value}意见，并选择下发用户和办理期限。`; return
  }
  const deadline = draft.value.deadline.length === 16 ? `${draft.value.deadline}:00` : draft.value.deadline
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(deadline) || !Number.isFinite(new Date(deadline).getTime())) {
    submitError.value = '请选择有效的办理期限日期和时间。'; return
  }
  submitting.value = true
  try {
    const current = await getTaskWorkflow(props.taskId)
    if (current?.currentNode?.id !== selectedNode.value.id || !canOperateWorkflowNode(current.currentNode, String(user.currentUser?.id || ''))) throw new Error('节点状态或办理人已变化，请刷新后重试')
    if (current.currentNode.nodeKey !== (departmentMode.value ? 'REVIEW_COUNTY' : 'REVIEW_CITY')) throw new Error(`当前节点不是非粮流程的${pageLabel.value}，请刷新或核实后端流程配置。`)
    // wf_node_def: REVIEW_CITY + FORWARD -> REVIEW_COUNTY; opinion 保存审核意见。
    const targetDeptId = gridUsers.value.find(person => person.id === draft.value.targetAssigneeId)?.deptId
    const recipient = gridUsers.value.find(person => String(person.id) === draft.value.targetAssigneeId)
    if (!recipient) throw new Error('选择的处理人已不在当前可下发用户列表，请重新选择。')
    await submitWorkflowNode({ nodeInstId: current.currentNode.id, deadline, targetDeptId, targetAssigneeId: draft.value.targetAssigneeId, resultData: { opinion: draft.value.reviewConclusion.trim(), result: 'FORWARD', dispatchMode: draft.value.dispatchMode, remark: draft.value.remark.trim(), targetDeptId, targetDeptName: recipient.deptName, targetAssigneeId: draft.value.targetAssigneeId, targetAssigneeName: recipient?.realName || recipient?.nickname || recipient?.username, deadline, ...(departmentMode.value ? { abnormalIds: selectedPlotIds.value } : {}) } })
    window.dispatchEvent(new Event('workflow-todos-changed'))
    await load(); emit('submitted')
  } catch (error) { submitError.value = error instanceof Error ? error.message : `${pageLabel.value}提交失败` }
  finally { submitting.value = false }
}

</script>

<template>
  <div class="ng-page preliminary-review">

    <WorkbenchFeedback :message="[...errors, flowError].filter(Boolean).join('；')" />

    <section class="ng-summary ng-summary--compact review-summary">
      <article class="ng-summary-card"><i>单</i><span><small>任务编号</small><b>{{ text(task?.taskNo) }}</b></span></article>
      <article class="ng-summary-card"><i>景</i><span><small>所属场景</small><b>{{ text(task?.sceneName) }}</b></span></article>
      <article class="ng-summary-card"><i>斑</i><span><small>当前疑似图斑</small><b class="number">{{ detail?.abnormalCount == null ? '暂无数据' : `${detail.abnormalCount} 个` }}</b></span></article>
      <article class="ng-summary-card"><i>核</i><span><small>{{ pageLabel }}意见</small><b>{{ text(conclusion) }}</b></span></article>
    </section>
    <div class="review-columns">
      <main class="review-left">
        <section class="ng-card review-plots"><h3><i>斑</i>{{ departmentMode ? '疑似图斑概览' : '初核图斑概览' }} <small>共 {{ abnormals.length }} 个</small></h3>
          <div v-if="departmentMode" class="plot-selection-tools"><span>已选 {{ selectedPlotIds.length }} 个 · 待下发 {{ pendingPlots.length }} 个</span><button v-if="canEdit" type="button" @click="selectedPlotIds = pendingPlots.map(spot => spot.id)">全选待下发</button><button v-if="canEdit" type="button" @click="selectedPlotIds = []">清空</button></div>
          <div class="review-scroll" tabindex="0" role="region" aria-label="初核图斑概览列表">
          <article v-for="(spot, index) in abnormals" :key="spot.id" class="review-plot" :class="{ selected: activeSpotId === spot.id, 'selectable-plot': departmentMode }" @click="activeSpotId = spot.id">
            <input v-if="departmentMode" class="plot-checkbox" type="checkbox" :aria-label="`选择图斑${index + 1}：${spot.title}`" :checked="selectedPlotIds.includes(spot.id)" :disabled="!canEdit || dispatchedPlotIds.has(spot.id)" @change="togglePlot(spot.id)" />
            <div role="button" tabindex="0" class="plot-thumbnail" :aria-label="`查看图斑${index + 1}：${spot.title}`" @click="previewPlot = spot" @keydown.enter="previewPlot = spot" @keydown.space.prevent="previewPlot = spot">
              <TaskRangeMap v-if="spotPeriod(spot).kind === 'empty'" :abnormal-points="[spot]" :active-abnormal-id="spot.id" fit-abnormal-points show-dom-imagery :imagery-service="taskImageryService(task?.comparisonImages)" />
              <SpotDistributionMap v-else :key="`${spot.id}-${spotPeriod(spot).imageUrl || spotPeriod(spot).mapService?.id}`" :spot="spot" :period="spotPeriod(spot)" thumbnail />
            </div>
            <span class="plot-content"><b><i>{{ index + 1 }}</i>{{ spot.title }}</b><span>面积：<strong>{{ spot.area == null ? '暂无数据' : `${spot.area} ㎡` }}</strong></span><small>{{ spot.abnormalTypeDesc }} · {{ handleLabel(spot.handleStatus) }}</small><small v-if="departmentMode" :class="dispatchedPlotIds.has(spot.id) ? 'plot-dispatched' : 'plot-pending'">{{ dispatchedPlotIds.has(spot.id) ? '已下发' : '待下发' }}</small><small>{{ spot.description || '暂无图斑说明' }}</small></span>
          </article>
          <p v-if="!abnormals.length" class="review-empty">当前任务暂无异常图斑，任务范围及影像请在任务受理页查看。</p>
          </div>
        </section>
        <section class="ng-card review-history"><h3><i>痕</i>任务操作历史 <small>{{ logs.length }} 条</small></h3><div class="review-actions"><button :disabled="loading" @click="load">刷新任务操作历史</button></div><div class="review-scroll" tabindex="0" role="region" aria-label="任务操作历史列表"><article v-for="log in logs" :key="log.id" class="review-log"><b>{{ log.operateTypeDesc }}</b><small>{{ text(log.createTime) }} · {{ log.operatorName || '暂无操作人' }}</small><p>{{ log.operateDesc }}</p></article><p v-if="!logs.length" class="review-empty">暂无任务操作历史</p></div></section>
      </main>
      <aside class="review-right">
        <section class="ng-card review-record"><h3 class="dispatch-heading"><i></i>{{ task?.taskNo }} 下发</h3>
          <form class="review-unsubmitted review-edit-form" :class="{ 'review-readonly-form': !canEdit }" @submit.prevent="submitReview">
            <fieldset :disabled="submitting || !canEdit">
              <label>{{ pageLabel }}意见<textarea v-model="reviewForm.reviewConclusion" maxlength="2000" :placeholder="`填写${pageLabel}意见`" /></label>
              <section class="dispatch-departments" aria-label="选择下发用户">
                <p class="dispatch-label">选择下发用户 <small>{{ departmentMode ? '原指定网格员优先' : '原指定办理人优先' }}，可选择其他用户或自己</small></p>
                <div class="department-search"><span aria-hidden="true">⌕</span><input v-model="gridSearch" aria-label="搜索姓名、账号" placeholder="搜索姓名、账号" /></div>
                <div class="department-list grid-user-list">
                  <label v-for="person in gridOptions" :key="person.id" class="department-option" :class="{ selected: reviewForm.targetAssigneeId === person.id }">
                    <input type="checkbox" :checked="reviewForm.targetAssigneeId === person.id" @change="selectGridUser(person.id)" />
                    <b>{{ person.name }}</b><span>将接收 <strong>{{ receiveCount }}</strong> 条</span>
                  </label>
                  <p v-if="canEdit && optionsError" class="review-status error" role="alert">{{ optionsError }}</p>
                  <p v-else-if="!gridOptions.length" class="review-empty">{{ optionsLoading ? '正在读取用户…' : gridSearch ? '没有匹配的用户' : '暂无可选用户' }}</p>
                </div>
                <div class="department-selection"><div><button type="button" :disabled="gridOptions.length !== 1" @click="selectGridUser(gridOptions[0]!.id)">全选</button><button type="button" :disabled="gridOptions.length !== 1" @click="selectGridUser(gridOptions[0]!.id)">反选</button><button type="button" @click="reviewForm.targetAssigneeId = ''">清空</button></div><span>已选 <strong>{{ reviewForm.targetAssigneeId ? 1 : 0 }}</strong> 位用户，合计接收 <strong>{{ reviewForm.targetAssigneeId ? receiveCount : 0 }}</strong> 条</span></div>
                <small class="single-department-note">每次选择一位用户接收此任务。</small>
              </section>
              <section class="dispatch-method"><p class="dispatch-label">下发方式</p>
                <div v-if="departmentMode" class="dispatch-method-options"><label class="unavailable-method"><input type="radio" disabled /><span><b>属地下发</b><small>暂无图斑属地与网格员对应数据</small></span></label><label :class="{ chosen: reviewForm.dispatchMode === '直接指派' }"><input v-model="reviewForm.dispatchMode" type="radio" value="直接指派" name="dispatch-mode" /><span><b>直接指派</b><small>选择用户直接接收核查任务</small></span></label></div>
                <div v-else class="dispatch-method-options"><label :class="{ chosen: reviewForm.dispatchMode === '逐级下发' }"><input v-model="reviewForm.dispatchMode" type="radio" value="逐级下发" name="dispatch-mode" /><span><b>逐级下发</b><small>发给区级部门，由其接收后继续组织核查</small></span></label><label :class="{ chosen: reviewForm.dispatchMode === '直接下发至基层' }"><input v-model="reviewForm.dispatchMode" type="radio" value="直接下发至基层" name="dispatch-mode" /><span><b>直接下发至基层</b><small>跳过区级部门，直接发给基层核查单位</small></span></label></div>
              </section>
              <label class="dispatch-deadline">办理期限 <span class="required-hint">必填</span><input v-model="reviewForm.deadline" type="datetime-local" step="60" required aria-label="办理期限" /><small>请选择下一节点的办理截止日期和时间。</small></label>
              <label>备注<textarea v-model="reviewForm.remark" :maxlength="departmentMode ? 200 : 500" placeholder="请结合影像判读结果，填写核查要求" /><small class="remark-count">{{ reviewForm.remark.length }}/{{ departmentMode ? 200 : 500 }}</small></label>

              <p v-if="canEdit && submitError" class="review-status error" role="alert">{{ submitError }}</p>
              <div class="review-actions"><button type="submit" :disabled="!canEdit || optionsLoading">{{ submitting ? '正在提交…' : selectedNode?.status === 'COMPLETED' ? '已完成下发' : '确认下发' }}</button></div>
            </fieldset>
          </form>

        </section>

      </aside>
    </div>
    <Teleport to="body"><div v-if="previewPlot" class="plot-preview-backdrop" @click.self="previewPlot = undefined" @keydown.esc="previewPlot = undefined"><section role="dialog" aria-modal="true" aria-label="图斑详情地图" class="plot-preview"><header><b>{{ previewPlot.title }} · {{ previewPlot.area == null ? '暂无面积' : `${previewPlot.area} ㎡` }}</b><button type="button" autofocus @click="previewPlot = undefined">关闭</button></header><TaskRangeMap :abnormal-points="[previewPlot]" :active-abnormal-id="previewPlot.id" fit-abnormal-points show-dom-imagery :imagery-service="taskImageryService(task?.comparisonImages)" /><small>展示真实图斑边界与配置底图。</small></section></div></Teleport>
  </div>
</template>

<style scoped>
.preliminary-review{overflow:auto;scrollbar-width:thin}.review-summary{min-height:78px;margin-bottom:18px}.review-summary .number{color:#1687ef;font-size:24px}.review-columns{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(340px,1fr);gap:20px;align-items:start}.review-left,.review-right{min-width:0;display:grid;gap:16px}.review-record{padding:20px}.review-record h3{margin-bottom:18px;font-size:17px}.review-fields,.review-unsubmitted{display:grid;gap:15px}.review-fields label,.review-unsubmitted label{display:grid;gap:8px;font-size:13px;color:#6d8394}.review-fields textarea,.review-unsubmitted textarea,.review-unsubmitted input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #d9e7f2;border-radius:5px;background:#fbfdff;color:#36556d;resize:vertical;min-height:42px}.review-fields textarea,.review-unsubmitted textarea{min-height:75px}.review-plot{width:100%;display:grid;grid-template-columns:95px minmax(0,1fr);gap:14px;text-align:left;align-items:center;padding:12px;margin-bottom:10px;background:#f8fbff;border:1px solid #e1edf5;border-radius:7px;cursor:pointer;color:#294a61}.review-plot.selected{border-color:#1687ef;background:#f0f8ff}.plot-thumbnail{height:90px;border-radius:6px;overflow:hidden;background:#e7f0f6}.plot-content{display:grid;gap:7px;font-size:12px}.plot-content b{font-size:14px;display:flex;gap:7px;align-items:center}.plot-content b i{width:22px;height:22px;display:grid;place-items:center;background:#1687ef;color:white;border-radius:50%;font-style:normal;font-size:12px}.plot-content strong{color:#1687ef;font-size:16px}.plot-content small{color:#8195a6;line-height:1.6}.review-empty{color:#8195a6;font-size:12px;line-height:1.8;margin:16px 0}.review-log p{line-height:1.6;margin:6px 0}.review-actions{display:flex;justify-content:flex-end;margin-top:15px}.review-actions button{padding:9px 16px;border:1px solid #1687ef;color:#1687ef;background:white;border-radius:4px;cursor:pointer}.review-status{font-size:12px;color:#80601e;background:#fff6df;padding:8px 12px;border-radius:5px}.review-status.error{color:#b95046;background:#fff1ef}@media(max-width:1050px){.review-columns{grid-template-columns:minmax(0,1.1fr) minmax(300px,1fr);gap:12px}.review-record{padding:14px}.review-plot{grid-template-columns:75px minmax(0,1fr);padding:8px;gap:10px}}@media(max-width:800px){.review-columns{grid-template-columns:1fr}.review-summary{grid-template-columns:1fr 1fr;gap:8px}}
</style>

<style scoped>
.review-edit-form fieldset{display:grid;gap:15px;border:0;padding:0;margin:0;min-width:0}.review-edit-form select{width:100%;padding:10px;border:1px solid #d9e7f2;border-radius:5px;background:white;color:#36556d}.review-edit-form .review-actions button{background:#1687ef;color:white}.review-edit-form fieldset:disabled{opacity:.65}
</style>

<style scoped>
.review-plots{padding:20px}.review-record{padding:22px}.dispatch-heading{display:flex;align-items:center}.dispatch-heading i{width:4px;height:20px;padding:0;background:#1687ef;border-radius:3px}.dispatch-label{margin:0 0 8px;color:#8195a6;font-size:14px}.department-search{display:flex;align-items:center;border:1px solid #d9e7f2;border-radius:4px;background:#f8fbff;padding:0 10px;gap:8px}.department-search span{font-size:24px;color:#36556d}.review-unsubmitted .department-search input{padding:9px 0;background:transparent;border:0;min-height:36px}.department-list{margin-top:14px;min-height:92px;padding:8px 12px;border:1px solid #e1edf5;border-radius:5px;background:#fbfdff}.review-unsubmitted .department-option{display:flex;align-items:center;gap:10px;min-height:40px;color:#294a61}.review-unsubmitted .department-option input{width:18px;height:18px;min-height:0;padding:0;accent-color:#1687ef}.department-option b{font-size:14px}.department-option>span{margin-left:auto;color:#8195a6;font-size:13px;white-space:nowrap}.department-option strong,.department-selection strong{color:#1687ef}.department-selection{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;font-size:12px;color:#8195a6}.department-selection>div{display:flex;gap:9px}.department-selection button{border:0;background:transparent;color:#1687ef;padding:0;cursor:pointer}.department-selection button:disabled{color:#a3b4c2;cursor:default}.single-department-note{display:block;margin-top:7px;color:#8195a6}.dispatch-method-options{display:grid;grid-template-columns:1fr 1fr;gap:12px}.review-unsubmitted .dispatch-method-options label{display:flex;align-items:flex-start;gap:8px;padding:12px;border:1px solid #d9e7f2;border-radius:4px;cursor:pointer}.review-unsubmitted .dispatch-method-options input{width:17px;height:17px;min-height:0;padding:0;margin:2px 0;accent-color:#1687ef}.dispatch-method-options span{display:grid;gap:6px}.dispatch-method-options b{color:#294a61;font-size:14px}.dispatch-method-options small{font-size:12px;line-height:1.6}.dispatch-method-options .chosen{border-color:#1687ef!important;background:#f5faff}.dispatch-method-options .chosen b{color:#1687ef}.remark-count{text-align:right;color:#8195a6}.review-actions button[type=submit]{min-width:120px}.review-plots>h3{margin-bottom:20px}@media(max-width:1000px){.department-selection{align-items:flex-start;flex-direction:column}.dispatch-method-options{gap:6px}.review-unsubmitted .dispatch-method-options label{padding:8px}}
</style>



<style scoped>
.review-history{padding:20px}.review-history>.review-actions{margin:0 0 8px}.review-history h3{margin-bottom:12px}.review-log{padding:12px 0;border-bottom:1px solid #e6eef4;font-size:12px}.review-log small{display:block;margin-top:5px;color:#8195a6}
</style>

<style scoped>
.dispatch-deadline{position:relative}.required-hint{position:absolute;right:0;top:0;color:#e26c58;font-size:11px}.dispatch-deadline small{color:#8195a6;font-size:11px}.dispatch-deadline input{font-family:inherit;color-scheme:light}
</style>

<style scoped>
.preliminary-review{display:flex;flex-direction:column;overflow:hidden}
.review-summary,.review-status{flex-shrink:0}
.review-columns{flex:1;min-height:0;align-items:stretch}
.review-left{min-height:0;grid-template-rows:minmax(0,3fr) minmax(0,2fr)}
.review-plots,.review-history{min-height:0;box-sizing:border-box;padding:16px}
.review-plots>h3,.review-history>h3,.review-history>.review-actions{flex-shrink:0}
.review-plots>h3{margin-bottom:12px}
.review-history{position:relative}
.review-history>h3{padding-right:145px}
.review-history>.review-actions{position:absolute;top:12px;right:16px;margin:0}
.review-history>.review-actions button{padding:6px 10px;font-size:12px}
.review-scroll{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-gutter:stable;overscroll-behavior:contain}
.review-scroll:focus-visible{outline:2px solid #1687ef;outline-offset:2px}
.review-right{min-height:0;grid-template-rows:minmax(0,1fr);overflow:hidden}
.review-right>.review-record{min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-gutter:stable;overscroll-behavior:contain}
.review-record>h3,.review-record>form,.review-record>.review-fields,.review-record>.review-unsubmitted{flex-shrink:0}
.review-readonly-form fieldset:disabled{opacity:1}
.review-actions button:disabled{opacity:.55;cursor:default}
.review-readonly-form :is(input,textarea,select):disabled{opacity:1;color:#36556d;-webkit-text-fill-color:#36556d;cursor:default}
.grid-user-list{padding:0;overflow:auto;max-height:220px}
.review-unsubmitted .grid-user-list .department-option{padding:12px;min-height:48px;border-bottom:1px solid #e1edf5}
.grid-user-list .department-option:last-child{border-bottom:0}
.grid-user-list .department-option.selected{background:#edf7ff}
.review-plot.selectable-plot{grid-template-columns:20px 95px minmax(0,1fr)}
.plot-checkbox{width:18px;height:18px;accent-color:#1687ef}
.plot-thumbnail{position:relative;cursor:zoom-in}
.plot-thumbnail :deep(.task-range-map),.plot-thumbnail :deep(.spot-map){pointer-events:none;min-height:0;height:100%;width:100%}
.plot-thumbnail :deep(.range-tools),.plot-thumbnail :deep(.range-area),.plot-thumbnail :deep(.leaflet-control-container){display:none}
.plot-selection-tools{display:flex;align-items:center;gap:10px;flex-shrink:0;margin-bottom:10px;font-size:12px;color:#7199ac}
.plot-selection-tools button{padding:4px 7px;border:1px solid #c9deec;border-radius:4px;background:white;color:#1687ef;cursor:pointer}
.plot-content .plot-dispatched{color:#16835b}.plot-content .plot-pending{color:#ce830a}
.plot-preview-backdrop{position:fixed;z-index:1000;inset:0;background:#082d45aa;display:grid;place-items:center;padding:20px}
.plot-preview{width:min(950px,95vw);height:min(650px,85dvh);background:white;border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box}
.plot-preview header{display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.plot-preview header button{border:1px solid #c9deec;border-radius:4px;background:white;padding:6px 14px;color:#1687ef;cursor:pointer}
.plot-preview :deep(.task-range-map){flex:1;min-height:0;height:auto}
.plot-preview :deep(.range-area){display:none}
.plot-preview>small{flex-shrink:0;color:#7199ac}
.dispatch-method-options .unavailable-method{opacity:.6;cursor:default!important}
@media(max-width:800px){
  .preliminary-review{overflow:auto}
  .review-columns{flex:none}
  .review-left{height:clamp(360px,70dvh,650px)}
  .review-right{grid-template-rows:auto;overflow:visible}
  .review-right>.review-record{overflow:visible}
}
</style>
