<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBackendTaskData } from '@/workspace-components/shared/use-backend-task'
import SpotDistributionMap from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import type { ComparisonPeriod } from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import type { TaskAbnormal } from '@/api/governance-task'
import { getDepartmentList, getUserPage, type DepartmentInfo } from '@/api/account-management'
import { getTaskWorkflow, submitWorkflowNode } from '@/api/task-workflow'
import { collectPages } from '@/api/pagination'
import { useUserStore } from '@/stores/user'
import { canOperateWorkflowNode } from '@/utils/task-workflow-state'
import type { CurrentUser } from '@/types'
import './workspace.scss'

const props = defineProps<{ taskId?: string; readonly?: boolean; flowError?: string }>()
const emit = defineEmits<{ submitted: [] }>()
const user = useUserStore()
const dataProps = computed(() => ({ taskId: props.taskId, nodeKey: 'section-preliminary-review' }))
// 保留响应式 taskId，读取的是同一套任务详情、图斑、影像和节点实例接口。
const { detail, task, flow, abnormals, activeSpotId, selectedNode, logs, loading, errors, text, handleLabel, load } = useBackendTaskData({ get taskId() { return dataProps.value.taskId }, nodeKey: 'section-preliminary-review' })
const record = computed<Record<string, unknown>>(() => {
  const value = selectedNode.value?.resultData
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
})
const conclusion = computed(() => draft.value.reviewConclusion || record.value['初核结论'] || record.value.reviewConclusion || record.value.result)
const fields = computed(() => Object.entries(record.value).filter(([key]) => key !== 'reviewConclusion' || record.value.result == null).map(([key, value]) => [key === 'result' || key === 'reviewConclusion' ? '初核结论' : key, value] as [string, unknown]))
const comparisonImages = computed(() => task.value?.comparisonImages || [])
function spotPeriod(spot: TaskAbnormal): ComparisonPeriod {
  const reference = comparisonImages.value[1] || comparisonImages.value[0]
  return spot.imageUrl ? { number: 1, label: spot.title, kind: 'image', imageUrl: spot.imageUrl }
    : reference?.mapService ? { number: 1, label: reference.label, kind: 'map-service', mapService: reference.mapService }
    : { number: 1, label: spot.title, kind: 'empty' }
}

const canEdit = computed(() => !props.readonly && !loading.value && canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || '')) && flow.value?.currentNode?.id === selectedNode.value?.id)
const departments = ref<Array<DepartmentInfo & { assigneeId?: string; sourceDeptId?: string }>>([])
const departmentSearch = ref('')
const visibleDepartments = computed(() => departments.value.filter(dept => dept.name.includes(departmentSearch.value.trim())))
// 接口一次只接受一个目标部门，不能把多选显示成一次成功下发多个部门。
function toggleDepartment(id: string) { draft.value.targetDeptId = draft.value.targetDeptId === id ? '' : id }
function selectAllDepartments() { if (visibleDepartments.value.length === 1) draft.value.targetDeptId = String(visibleDepartments.value[0]!.id) }
function invertDepartments() { if (visibleDepartments.value.length === 1) toggleDepartment(String(visibleDepartments.value[0]!.id)) }
const recipients = ref<CurrentUser[]>([])
const optionsLoading = ref(false)
const optionsError = ref('')
const submitError = ref('')
const submitting = ref(false)
const draft = ref({ reviewConclusion: '', targetDeptId: '', targetAssigneeId: '', dispatchMode: '逐级下发', deadline: '', remark: '' })
let optionsVersion = 0
watch(() => selectedNode.value?.id, () => {
  draft.value = { reviewConclusion: String(record.value.reviewConclusion ?? record.value['初核结论'] ?? record.value.result ?? ''), targetDeptId: '', targetAssigneeId: '', dispatchMode: String(record.value.dispatchMode ?? '逐级下发'), deadline: '', remark: String(record.value.remark ?? '') }
  submitError.value = ''
})
watch(canEdit, async editable => {
  if (!editable) return
  try {
    // 非粮化首期仅开放农业农村部门，名称和 ID 保留接口原值。
    const relatedDepartments = (await getDepartmentList({ status: 1 })).filter(dept => dept.name.includes('农业农村'))
    const destinations = await Promise.all(relatedDepartments.map(async dept => {
      const members = await collectPages((pageNum, pageSize) => getUserPage({ deptId: String(dept.id), pageNum, pageSize, status: 1 }))
      // 本系统的区级单位以用户身份接收任务，使用其真实名称及 ID 路由。
      const units = members.filter(member => (member.realName || '').includes('农业农村局'))
      return units.length ? units.map(member => ({ ...dept, id: `${dept.id}:${member.id}`, name: member.realName!, assigneeId: String(member.id), sourceDeptId: String(dept.id) })) : [dept]
    }))
    departments.value = destinations.flat()
  }
  catch (error) { optionsError.value = error instanceof Error ? error.message : '部门读取失败' }
})
watch(() => draft.value.targetDeptId, async deptId => {
  const version = ++optionsVersion
  recipients.value = []; draft.value.targetAssigneeId = ''; optionsError.value = ''
  if (!deptId) { optionsLoading.value = false; return }
  optionsLoading.value = true
  try {
    const records = await collectPages((pageNum, pageSize) => getUserPage({ deptId: departments.value.find(dept => String(dept.id) === deptId)?.sourceDeptId || deptId, pageNum, pageSize, status: 1 }))
    if (version === optionsVersion) {
      recipients.value = records
      const assigneeId = departments.value.find(dept => String(dept.id) === deptId)?.assigneeId
      if (assigneeId && records.some(person => String(person.id) === assigneeId)) draft.value.targetAssigneeId = assigneeId
    }
  } catch (error) {
    if (version === optionsVersion) optionsError.value = error instanceof Error ? error.message : '处理人读取失败'
  } finally { if (version === optionsVersion) optionsLoading.value = false }
})
async function submitReview() {
  if (!canEdit.value || submitting.value || !props.taskId || !selectedNode.value) return
  submitError.value = ''
  if (!draft.value.reviewConclusion.trim() || !draft.value.targetDeptId || !draft.value.targetAssigneeId || !draft.value.deadline) {
    submitError.value = '请填写初核结论，并选择下发部门、处理人和办理期限。'; return
  }
  const deadline = draft.value.deadline.length === 16 ? `${draft.value.deadline}:00` : draft.value.deadline
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(deadline) || !Number.isFinite(new Date(deadline).getTime())) {
    submitError.value = '请选择有效的办理期限日期和时间。'; return
  }
  submitting.value = true
  try {
    const current = await getTaskWorkflow(props.taskId)
    if (current?.currentNode?.id !== selectedNode.value.id || !canOperateWorkflowNode(current.currentNode, String(user.currentUser?.id || ''))) throw new Error('节点状态或办理人已变化，请刷新后重试')
    // result 即业务人员填写的初核结论，不另设路由值或要求用户重复填写。
    await submitWorkflowNode({ nodeInstId: current.currentNode.id, deadline, targetDeptId: departments.value.find(dept => String(dept.id) === draft.value.targetDeptId)?.sourceDeptId || draft.value.targetDeptId, targetAssigneeId: draft.value.targetAssigneeId, resultData: { reviewConclusion: draft.value.reviewConclusion.trim(), result: draft.value.reviewConclusion.trim(), dispatchMode: draft.value.dispatchMode, remark: draft.value.remark.trim() } })
    await load(); emit('submitted')
  } catch (error) { submitError.value = error instanceof Error ? error.message : '初核提交失败' }
  finally { submitting.value = false }
}

function recordText(value: unknown) { return value && typeof value === 'object' ? JSON.stringify(value, null, 2) : text(value) }
</script>

<template>
  <div class="ng-page preliminary-review">
    <p v-if="loading" class="review-status" role="status">正在读取科室初核数据…</p>
    <p v-else-if="errors.length || flowError" class="review-status error" role="alert">{{ [...errors, flowError].filter(Boolean).join('；') }}</p>
    <p v-if="readonly && !loading" class="review-status">该办理节点已完成或属于其他办理人，当前只读。</p>
    <section class="ng-summary ng-summary--compact review-summary">
      <article class="ng-summary-card"><i>单</i><span><small>任务编号</small><b>{{ text(task?.taskNo) }}</b></span></article>
      <article class="ng-summary-card"><i>景</i><span><small>所属场景</small><b>{{ text(task?.sceneName) }}</b></span></article>
      <article class="ng-summary-card"><i>斑</i><span><small>当前疑似图斑</small><b class="number">{{ detail?.abnormalCount == null ? '暂无数据' : `${detail.abnormalCount} 个` }}</b></span></article>
      <article class="ng-summary-card"><i>核</i><span><small>科室初核结论</small><b>{{ text(conclusion) }}</b></span></article>
    </section>
    <div class="review-columns">
      <main class="review-left">
        <section class="ng-card review-plots"><h3><i>斑</i>初核图斑概览 <small>共 {{ abnormals.length }} 个</small></h3>
          <button v-for="(spot, index) in abnormals" :key="spot.id" class="review-plot" :class="{ selected: activeSpotId === spot.id }" @click="activeSpotId = spot.id">
            <div class="plot-thumbnail"><SpotDistributionMap :key="`${spot.id}-${spotPeriod(spot).imageUrl || spotPeriod(spot).mapService?.id || 'empty'}`" :spot="spot" :period="spotPeriod(spot)" thumbnail /></div>
            <span class="plot-content"><b><i>{{ index + 1 }}</i>{{ spot.title }}</b><span>面积：<strong>{{ spot.area == null ? '暂无数据' : `${spot.area} ㎡` }}</strong></span><small>{{ spot.abnormalTypeDesc }} · {{ handleLabel(spot.handleStatus) }}</small><small>{{ spot.description || '暂无图斑说明' }}</small></span>
          </button>
          <p v-if="!abnormals.length" class="review-empty">当前任务暂无异常图斑，任务范围及影像请在任务受理页查看。</p>

        </section>
        <section class="ng-card review-history"><h3><i>痕</i>任务操作历史 <small>{{ logs.length }} 条</small></h3><div class="review-actions"><button :disabled="loading" @click="load">刷新任务操作历史</button></div><article v-for="log in logs" :key="log.id" class="review-log"><b>{{ log.operateTypeDesc }}</b><small>{{ text(log.createTime) }} · {{ log.operatorName || '暂无操作人' }}</small><p>{{ log.operateDesc }}</p></article><p v-if="!logs.length" class="review-empty">暂无任务操作历史</p></section>
      </main>
      <aside class="review-right">
        <section class="ng-card review-record"><h3 class="dispatch-heading"><i></i>{{ task?.taskNo }} 下发</h3>
          <form v-if="canEdit" class="review-unsubmitted review-edit-form" @submit.prevent="submitReview">
            <fieldset :disabled="submitting">
              <label>初核结论<textarea v-model="draft.reviewConclusion" maxlength="2000" placeholder="填写初核结论" /></label>
              <section class="dispatch-departments" aria-label="选择下发部门">
                <p class="dispatch-label">选择下发部门</p>
                <div class="department-search"><span aria-hidden="true">⌕</span><input v-model="departmentSearch" aria-label="搜索部门名称" placeholder="搜索部门名称" /></div>
                <div class="department-list">
                  <label v-for="dept in visibleDepartments" :key="dept.id" class="department-option">
                    <input type="checkbox" :checked="draft.targetDeptId === String(dept.id)" @change="toggleDepartment(String(dept.id))" />
                    <b>{{ dept.name }}</b><span>将接收 <strong>{{ abnormals.length }}</strong> 条</span>
                  </label>
                  <p v-if="!visibleDepartments.length" class="review-empty">{{ departmentSearch ? '没有匹配的部门' : '暂无可下发部门' }}</p>
                </div>
                <div class="department-selection"><div><button type="button" :disabled="visibleDepartments.length !== 1" @click="selectAllDepartments">全选</button><button type="button" :disabled="visibleDepartments.length !== 1" @click="invertDepartments">反选</button><button type="button" @click="draft.targetDeptId = ''">清空</button></div><span>已选 <strong>{{ draft.targetDeptId ? 1 : 0 }}</strong> 个部门，合计接收 <strong>{{ draft.targetDeptId ? abnormals.length : 0 }}</strong> 条</span></div>
                <small v-if="departments.length > 1" class="single-department-note">每次下发选择一个部门。</small>
              </section>
              <label>下一节点处理人<select v-model="draft.targetAssigneeId" required :disabled="!draft.targetDeptId || optionsLoading"><option value="">{{ optionsLoading ? '正在读取用户…' : '请选择处理人' }}</option><option v-for="person in recipients" :key="person.id" :value="String(person.id)">{{ person.realName || person.nickname || person.username }}（{{ person.username }}）</option></select></label>
              <section class="dispatch-method"><p class="dispatch-label">下发方式</p><div class="dispatch-method-options"><label :class="{ chosen: draft.dispatchMode === '逐级下发' }"><input v-model="draft.dispatchMode" type="radio" value="逐级下发" name="dispatch-mode" /><span><b>逐级下发</b><small>发给区级部门，由其接收后继续组织核查</small></span></label><label :class="{ chosen: draft.dispatchMode === '直接下发至基层' }"><input v-model="draft.dispatchMode" type="radio" value="直接下发至基层" name="dispatch-mode" /><span><b>直接下发至基层</b><small>跳过区级部门，直接发给基层核查单位</small></span></label></div></section>
              <label class="dispatch-deadline">办理期限 <span class="required-hint">必填</span><input v-model="draft.deadline" type="datetime-local" step="60" required aria-label="办理期限" /><small>请选择下一节点的办理截止日期和时间。</small></label>
              <label>备注<textarea v-model="draft.remark" maxlength="500" placeholder="请结合影像判读结果，填写核查要求" /><small class="remark-count">{{ draft.remark.length }}/500</small></label>

              <p v-if="optionsError || submitError" class="review-status error" role="alert">{{ optionsError || submitError }}</p>
              <div class="review-actions"><button type="submit" :disabled="optionsLoading">{{ submitting ? '正在提交…' : '确认下发' }}</button></div>
            </fieldset>
          </form>
          <div v-else-if="fields.length" class="review-fields"><label v-for="[label, value] in fields" :key="label"><span>{{ label }}</span><textarea :value="recordText(value)" readonly /></label></div>
          <div v-else class="review-unsubmitted"><label>初核结论<textarea readonly placeholder="尚未提交初核结论" /></label><label>下发部门<input readonly placeholder="暂无下发记录" /></label><label>下发方式<input readonly placeholder="暂无下发记录" /></label><label>备注<textarea readonly placeholder="暂无已提交的初核说明" /></label></div>

        </section>

      </aside>
    </div>
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
