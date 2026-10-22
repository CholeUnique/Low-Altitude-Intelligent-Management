<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBackendTaskData } from './use-backend-task'
import { useUserStore } from '@/stores/user'
import { canOperateWorkflowNode } from '@/utils/task-workflow-state'
import { defaultSubmitResult } from '@/utils/default-workflow'
import { getTaskWorkflow, submitWorkflowNode, uploadWorkflowFiles } from '@/api/task-workflow'
import type { WorkbenchUser } from '@/api/workbench-users'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import TaskHistory from '@/components/task-center/TaskHistory.vue'
import WorkflowAssigneePicker from './WorkflowAssigneePicker.vue'
import WorkbenchFeedback from './WorkbenchFeedback.vue'
import TaskAcceptancePanel from './TaskAcceptancePanel.vue'
import '../non-grain/workspace.scss'
const props = defineProps<{ taskId?: string; nodeKey: string; readonly?: boolean }>()
const emit = defineEmits<{ submitted: [] }>()
const user = useUserStore()
const { task, flow, selectedNode, abnormals, logs, loading, errors, load, text } = useBackendTaskData({ get taskId() { return props.taskId }, get nodeKey() { return props.nodeKey }, get readonly() { return props.readonly }, includeMaterials: false })
const busy = ref(false), error = ref(''), activeId = ref(''), deadline = ref(''), opinion = ref('')
const recipient = ref<WorkbenchUser>()
const plots = ref<Array<{ abnormalId: string; result: string; description: string }>>([])
const archive = computed(() => props.nodeKey === 'FINISH_DEFAULT')
const acceptance = computed(() => props.nodeKey === 'REVIEW_OWNER')
const pageName = computed(() => acceptance.value ? '业务受理' : archive.value ? '结案归档' : '现场核查')
const canEdit = computed(() => !props.readonly && !busy.value && !loading.value && canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || '')) && selectedNode.value?.id === flow.value?.currentNode?.id)
const evidenceFiles = computed(() => archive.value ? (flow.value?.timeline || []).flatMap(node => node.files || []).filter((file, index, files) => files.findIndex(item => item.id === file.id) === index) : selectedNode.value?.files || [])
const saved = computed(() => (selectedNode.value?.resultData || {}) as Record<string, unknown>)
const active = computed(() => plots.value.find(plot => plot.abnormalId === activeId.value))
const displayPlots = computed(() => abnormals.value.length ? abnormals.value : [{ id: 'task', title: '任务整体', description: '此任务暂无图斑，按任务整体填报。', boundaryGeoJson: undefined, imageUrl: undefined, area: undefined }])
const activeSpot = computed(() => displayPlots.value.find(spot => spot.id === activeId.value))
const summaries = computed(() => [
  { icon: '单', label: '任务编号', value: task.value?.taskNo },
  { icon: '景', label: '所属场景', value: task.value?.sceneName },
  { icon: '斑', label: '疑似图斑数量', value: `${abnormals.value.length} 个` },
  { icon: '人', label: '当前办理人', value: selectedNode.value?.assigneeName },
])
let initialized = ''
watch([() => selectedNode.value?.id, () => props.nodeKey], () => {
  const node = selectedNode.value
  if (!node || initialized === node.id) return
  initialized = node.id
  const record = (node.resultData || {}) as Record<string, unknown>
  const previous = flow.value?.timeline.find(item => item.id === String(node.prevNodeInstId))?.resultData as Record<string, unknown> | undefined
  const source = (Array.isArray(record.plotResults) ? record.plotResults : archive.value && Array.isArray(previous?.plotResults) ? previous.plotResults : []) as Array<{ abnormalId: string; result: string; description: string }>
  plots.value = displayPlots.value.map(spot => ({ abnormalId: spot.id, result: source.find(item => String(item.abnormalId) === spot.id)?.result || String(record.assessment || ''), description: source.find(item => String(item.abnormalId) === spot.id)?.description || String(record.description || '') }))
  activeId.value = plots.value[0]?.abnormalId || ''
  opinion.value = String(record.opinion || '')
  deadline.value = String(record.deadline || '')
  error.value = ''
})
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || []); input.value = ''
  if (!canEdit.value || !selectedNode.value || !files.length) return
  busy.value = true; error.value = ''
  try { await uploadWorkflowFiles(selectedNode.value.id, files); await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '上传失败' }
  finally { busy.value = false }
}
async function submit() {
  if (!canEdit.value || !props.taskId || !selectedNode.value) return
  error.value = ''
  if (!acceptance.value) {
    const missing = plots.value.find(plot => !plot.result || !plot.description.trim())
    if (missing) { activeId.value = missing.abnormalId; error.value = '请为每个图斑选择有／无问题，并填写说明。'; return }
  }
  if (!archive.value && (!recipient.value || !deadline.value)) { error.value = '请选择下一节点办理人和办理期限。'; return }
  if (!acceptance.value && !archive.value && !selectedNode.value.files?.length) { error.value = '请上传现场核查材料。'; return }
  busy.value = true
  try {
    const current = await getTaskWorkflow(props.taskId)
    const node = current?.currentNode
    if (!node || node.id !== selectedNode.value.id || !canOperateWorkflowNode(node, String(user.currentUser?.id || ''))) throw new Error('办理节点已变化，请刷新后重试。')
    const assessment = plots.value.some(plot => plot.result === 'PROBLEM') ? 'PROBLEM' : 'NO_PROBLEM'
    await submitWorkflowNode({ nodeInstId: node.id, ...(!archive.value ? { targetAssigneeId: recipient.value!.id, targetDeptId: recipient.value!.deptId, deadline: new Date(deadline.value).toISOString() } : {}), resultData: { ...defaultSubmitResult(node.nodeKey, assessment), opinion: opinion.value.trim(), description: acceptance.value ? opinion.value.trim() : plots.value.map(plot => plot.description.trim()).join('；'), plotResults: plots.value, attachment: evidenceFiles.value.map(file => file.id), deadline: deadline.value, targetAssigneeName: recipient.value?.realName || recipient.value?.nickname || recipient.value?.username, operator: user.name } })
    await load(); emit('submitted'); window.dispatchEvent(new Event('workflow-todos-changed'))
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '提交失败' }
  finally { busy.value = false }
}
</script>
<template>
  <TaskAcceptancePanel v-if="!selectedNode && !loading" :task-id="taskId" />
  <div v-else class="ng-page default-page" :class="{ 'default-page--acceptance': acceptance, 'default-page--archive': archive }">
    <WorkbenchFeedback :message="[...errors, error].filter(Boolean).join('；')" />
    <section class="ng-summary ng-summary--compact default-summary" aria-label="任务概况">
      <article v-for="item in summaries" :key="item.label" class="ng-summary-card">
        <i>{{ item.icon }}</i><span><small>{{ item.label }}</small><b :title="item.value || '—'">{{ item.value || '—' }}</b></span>
      </article>
    </section>
    <div class="default-columns">
      <aside class="default-sidebar">
        <section class="ng-card plot-guide-card default-plots">
          <h3><i>斑</i>{{ acceptance ? '疑似图斑列表' : archive ? '归档图斑列表' : '待核查图斑' }} <small>共 {{ abnormals.length }} 个</small></h3>
          <div class="plot-scroll">
            <button v-for="(spot, index) in displayPlots" :key="spot.id" type="button" class="default-plot" :class="{ selected: spot.id === activeId }" :aria-pressed="spot.id === activeId" @click="activeId = spot.id">
              <span class="plot-radio">{{ spot.id === activeId ? '●' : '○' }}</span>
              <div class="thumbnail">
                <img v-if="spot.imageUrl" :src="spot.imageUrl" :alt="spot.title" />
                <TaskRangeMap v-else-if="spot.boundaryGeoJson" :geo-json="spot.boundaryGeoJson" />
                <span v-else>图斑 {{ index + 1 }}</span>
              </div>
              <span class="plot-content"><b>{{ spot.title }}</b><small>面积：{{ spot.area == null ? '—' : `${spot.area} ㎡` }}</small><em :class="{ complete: plots.find(item => item.abnormalId === spot.id)?.result }">{{ acceptance ? '待受理图斑' : plots.find(item => item.abnormalId === spot.id)?.result === 'PROBLEM' ? '有问题图斑' : plots.find(item => item.abnormalId === spot.id)?.result === 'NO_PROBLEM' ? '无问题图斑' : '待填报' }}</em></span>
            </button>
          </div>
          <div class="plot-guide">
            <h4>ⓘ {{ pageName }}填写说明</h4>
            <template v-if="acceptance"><p>① 查看疑似图斑及任务处理记录。</p><p>② 填写受理说明，选择现场核查办理人和办理期限。</p><p>③ 确认下发后进入现场核查。</p></template>
            <template v-else-if="archive"><p>① 逐一核对图斑结论、核查说明和材料。</p><p>② 填写每个图斑的结案结果与说明。</p><p>③ 确认结案后归档。</p></template>
            <template v-else><p>① 逐一选择图斑，填写核查结论和说明。</p><p>② 上传现场核查材料。</p><p>③ 选择结案归档办理人和期限后提交。</p></template>
          </div>
        </section>
        <section class="ng-card default-history"><TaskHistory :task="task" :logs="logs" :flow="flow" :spots="abnormals" :loading="loading" /></section>
      </aside>
      <section class="ng-card default-operation">
        <h3><i>填</i>{{ pageName }}填报 <span v-if="selectedNode?.status === 'COMPLETED'" class="ng-tag ok">已完成办理</span><span v-else-if="!canEdit && !loading" class="ng-tag">只读查看</span></h3>
        <div class="default-form-summary">
          <span>办理节点<b>{{ pageName }}</b></span><span>当前图斑<b>{{ activeSpot?.title || '—' }}</b></span><span>办理人<b>{{ selectedNode?.assigneeName || '—' }}</b></span><span>主责部门<b>{{ task?.deptName || '—' }}</b></span>
        </div>
        <form @submit.prevent="submit">
          <fieldset :disabled="!canEdit">
            <template v-if="!acceptance && active">
              <h4 class="section-heading">* {{ archive ? '结案结果' : '核查结论' }}</h4>
              <div class="ng-radio cols-2 default-choices"><label><input v-model="active.result" name="assessment" type="radio" value="PROBLEM" required />有问题图斑</label><label><input v-model="active.result" name="assessment" type="radio" value="NO_PROBLEM" required />无问题图斑</label></div>
              <p class="default-tip">请逐一填写所有图斑的结论及说明，填写结果会保留在对应图斑下。</p>
              <label class="ng-field default-field">* {{ archive ? '结案说明' : '核查说明' }}<textarea v-model="active.description" required maxlength="2000" placeholder="填写实际情况及处理结果" /><small class="field-counter">{{ active.description.length }}/2000</small></label>
            </template>
            <label v-else-if="acceptance" class="ng-field default-field">* 受理说明<textarea v-model="opinion" required maxlength="2000" placeholder="填写受理意见与核查要求" /><small class="field-counter">{{ opinion.length }}/2000</small></label>
            <section v-if="!acceptance" class="default-materials">
              <h4 class="section-heading">{{ archive ? '归档材料' : '* 现场核查材料' }}</h4>
              <div class="material-list"><article v-for="file in evidenceFiles" :key="file.id"><span>▤</span><div><b>{{ file.fileName }}</b><small>{{ text(file.createTime) }}</small></div></article></div>
              <label v-if="canEdit" class="material-upload"><span>＋</span><b>{{ archive ? '补充归档材料' : '上传现场核查材料' }}</b><small>支持 JPG、PNG、PDF、Word，可多选</small><input type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" aria-label="上传办理材料" @change="upload" /></label>
              <p v-else-if="!evidenceFiles.length" class="default-tip">暂无上传材料</p>
            </section>
            <template v-if="!archive">
              <WorkflowAssigneePicker v-model="recipient" :node-id="selectedNode?.id" :dept-id="selectedNode?.deptId" :readonly="!canEdit" :saved-name="String(saved.targetAssigneeName || '')" :label="acceptance ? '现场核查办理人' : '结案归档办理人'" />
              <label class="ng-field default-field deadline-field">* 办理期限<input v-model="deadline" type="datetime-local" required aria-label="办理期限" /></label>
            </template>
            <footer class="default-actions"><button :disabled="!canEdit" type="submit">{{ busy ? '正在处理…' : selectedNode?.status === 'COMPLETED' ? '已完成办理' : archive ? '确认结案' : acceptance ? '确认下发' : '提交核查结果' }}</button></footer>
          </fieldset>
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.default-page { display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
.default-summary { flex: 0 0 74px; }
.default-summary .ng-summary-card:nth-child(2) > i { color: #15a577; background: #e5f8ef; }
.default-summary .ng-summary-card:nth-child(3) > i { color: #e29b15; background: #fff5df; }
.default-summary .ng-summary-card:nth-child(4) > i { color: #7960ec; background: #f0edff; }
.default-columns { flex: 1; min-height: 0; display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; }
.default-page--acceptance .default-columns { grid-template-columns: minmax(0, 1.15fr) minmax(340px, 1fr); }
.default-page--archive .default-columns { grid-template-columns: 360px minmax(0, 1fr); }
.default-sidebar { min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(240px, 1.5fr) minmax(150px, 1fr); gap: 14px; }
.default-plot { box-sizing: border-box; display: grid; grid-template-columns: 14px 76px minmax(0, 1fr); align-items: center; gap: 10px; width: 100%; margin-bottom: 9px; padding: 10px; text-align: left; background: #f8fbff; border: 1px solid #e0ebf2; border-radius: 6px; color: #294a61; cursor: pointer; font: inherit; }
.default-plot.selected { border-color: #1687ef; background: #eff7ff; }
.plot-radio { color: #1687ef; font-size: 12px; }
.thumbnail { height: 66px; min-width: 0; overflow: hidden; display: grid; place-items: center; background: #e7f0f6; border-radius: 5px; font-size: 11px; color: #8195a6; }
.thumbnail img { width: 100%; height: 100%; object-fit: cover; }
.thumbnail :deep(.task-range-map) { height: 100%; min-height: 0; pointer-events: none; }
.thumbnail :deep(.range-tools), .thumbnail :deep(.range-area) { display: none; }
.plot-content { min-width: 0; display: grid; gap: 6px; }
.plot-content b { overflow-wrap: anywhere; font-size: 12px; }
.plot-content small { color: #8195a6; font-size: 10px; }
.plot-content em { color: #8195a6; font-size: 10px; font-style: normal; }
.plot-content em.complete { color: #1687ef; }
.default-history { padding: 0; }
.default-operation { overflow-y: auto; scrollbar-width: thin; display: block; padding: 16px; }
.default-operation > h3 { margin-bottom: 12px; }
.default-operation > h3 .ng-tag { margin-left: auto; }
.default-form-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 12px; border-radius: 5px; background: #edf7ff; }
.default-form-summary span { min-width: 0; display: grid; gap: 6px; color: #7190a4; font-size: 11px; }
.default-form-summary b { color: #294a61; font-size: 12px; overflow-wrap: anywhere; }
.default-operation fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.default-field { margin: 15px 0; gap: 8px; font-size: 12px; }
.default-field textarea { min-height: 88px; resize: vertical; font: inherit; line-height: 1.7; }
.default-field input { font: inherit; }
.default-field :is(input, textarea):disabled { opacity: 1; color: #36556d; -webkit-text-fill-color: #36556d; }
.field-counter { text-align: right; color: #8195a6; font-size: 10px; }
.default-operation .section-heading { padding-left: 7px; border-left: 3px solid #61aef9; margin-top: 15px; }
.default-choices label { font-size: 12px; }
.default-tip { margin: 8px 0; color: #8195a6; font-size: 11px; line-height: 1.7; }
.material-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.material-list article { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e0eaf1; border-radius: 5px; }
.material-list article > span { color: #1687ef; font-size: 22px; }
.material-list article > div { min-width: 0; display: grid; gap: 5px; }
.material-list b { overflow-wrap: anywhere; font-size: 11px; font-weight: 500; }
.material-list small { color: #8195a6; font-size: 10px; }
.material-upload { position: relative; display: grid; justify-items: center; gap: 5px; margin-top: 8px; padding: 12px; border: 1px dashed #a6c9e2; border-radius: 5px; color: #4389b6; background: #f5fbff; cursor: pointer; font-size: 11px; }
.material-upload > span { font-size: 22px; }
.material-upload small { color: #8195a6; font-size: 10px; }
.material-upload input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.material-upload:focus-within { outline: 2px solid #1687ef; outline-offset: 2px; }
.default-actions { display: flex; justify-content: flex-end; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e1eaf0; }
.default-actions button { min-width: 112px; padding: 9px 18px; color: #fff; background: #1687ef; border: 0; border-radius: 4px; font-size: 12px; cursor: pointer; }
.default-actions button:disabled { color: #8d9da9; background: #e9edf0; cursor: not-allowed; }
.default-operation :deep(.assignee-picker) { font-size: 12px; padding: 10px; gap: 7px; }
.default-operation :deep(.assignee-picker small) { font-size: 11px; }
@media (max-height: 780px) { .default-page { gap: 10px; } .default-summary { flex-basis: 62px; } .default-sidebar { grid-template-rows: minmax(210px, 1.5fr) minmax(120px, 1fr); gap: 10px; } }
@media (max-width: 1100px) { .default-columns, .default-page--archive .default-columns { grid-template-columns: 280px minmax(0, 1fr); gap: 12px; } .default-page--acceptance .default-columns { grid-template-columns: minmax(0, 1fr) minmax(320px, 1fr); gap: 12px; } .default-form-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 800px) { .default-page { overflow: auto; } .default-summary { flex-basis: auto; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 62px; } .default-columns, .default-page--acceptance .default-columns, .default-page--archive .default-columns { flex: none; grid-template-columns: minmax(0, 1fr); } .default-sidebar { grid-template-rows: 300px 240px; } .default-operation { overflow: visible; } }
</style>
