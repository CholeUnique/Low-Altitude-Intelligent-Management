<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBackendTaskData } from './use-backend-task'
import { useUserStore } from '@/stores/user'
import { canOperateWorkflowNode } from '@/utils/task-workflow-state'
import { defaultSubmitResult } from '@/utils/default-workflow'
import { getTaskWorkflow, submitWorkflowNode, uploadWorkflowFiles } from '@/api/task-workflow'
import type { WorkbenchUser } from '@/api/workbench-users'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
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
const displayPlots = computed(() => abnormals.value.length ? abnormals.value : [{ id: 'task', title: '任务整体', description: '此任务暂无图斑，按任务整体填报。', boundaryGeoJson: undefined }])
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
  <div v-else class="ng-page default-page"><WorkbenchFeedback :message="[...errors,error].filter(Boolean).join('；')" /><section class="ng-summary"><article><span>任务编号</span><b>{{ task?.taskNo || '—' }}</b></article><article><span>所属场景</span><b>{{ task?.sceneName || '默认业务流程' }}</b></article><article><span>当前办理人</span><b>{{ selectedNode?.assigneeName || '—' }}</b></article><article><span>办理节点</span><b>{{ pageName }}</b></article></section><div class="default-columns"><aside><section class="ng-card plots"><h3>疑似图斑列表（共 {{ abnormals.length }} 个）</h3><button v-for="spot in displayPlots" :key="spot.id" type="button" :class="{ chosen: spot.id === activeId }" @click="activeId = spot.id"><div class="thumbnail"><TaskRangeMap v-if="spot.boundaryGeoJson" :geo-json="spot.boundaryGeoJson" /><span v-else>图斑</span></div><b>{{ spot.title }}</b><small>{{ plots.find(item => item.abnormalId === spot.id)?.result === 'PROBLEM' ? '有问题图斑' : plots.find(item => item.abnormalId === spot.id)?.result === 'NO_PROBLEM' ? '无问题图斑' : '待填报' }}</small></button><div class="instruction"><b>{{ pageName }}填写说明</b><p>{{ archive ? '核对核查结论与材料，填写结案说明后确认归档。' : '逐一查看图斑，填写实际情况；选择下一节点办理人后提交。' }}</p></div></section><section class="ng-card history"><h3>任务操作历史</h3><div><article v-for="log in logs" :key="log.id"><b>{{ log.operateTypeDesc }}</b><small>{{ text(log.createTime) }} · {{ log.operatorName }}</small><p>{{ log.operateDesc }}</p></article><p v-if="!logs.length">暂无操作历史</p></div></section></aside><section class="ng-card operation"><h3>{{ pageName }}填报</h3><form @submit.prevent="submit"><fieldset :disabled="!canEdit"><template v-if="!acceptance && active"><h4>* {{ archive ? '结案结果' : '核查结论' }}</h4><div class="choices"><label><input v-model="active.result" name="assessment" type="radio" value="PROBLEM" required />有问题图斑</label><label><input v-model="active.result" name="assessment" type="radio" value="NO_PROBLEM" required />无问题图斑</label></div><label class="field">* {{ archive ? '结案说明' : '核查说明' }}<textarea v-model="active.description" required maxlength="2000" placeholder="填写实际情况及处理结果" /></label></template><label v-else-if="acceptance" class="field">* 受理说明<textarea v-model="opinion" required maxlength="2000" placeholder="填写受理意见与核查要求" /></label><template v-if="!archive"><WorkflowAssigneePicker v-model="recipient" :node-id="selectedNode?.id" :dept-id="selectedNode?.deptId" :readonly="!canEdit" :saved-name="String(saved.targetAssigneeName || '')" label="下一节点办理人" /><label class="field">* 办理期限<input v-model="deadline" type="datetime-local" required aria-label="办理期限" /></label></template><div v-if="!acceptance" class="materials"><h4>{{ archive ? '归档材料' : '* 现场核查材料' }}</h4><p v-for="file in evidenceFiles" :key="file.id">{{ file.fileName }}</p><input v-if="canEdit" type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" @change="upload" /></div><footer><button :disabled="!canEdit" type="submit">{{ busy ? '正在处理…' : selectedNode?.status === 'COMPLETED' ? '已完成办理' : archive ? '确认结案' : '确认下发' }}</button></footer></fieldset></form></section></div></div>
</template>
<style scoped>
.default-page{overflow:auto}.default-columns{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(360px,1fr);gap:20px}.default-columns aside{min-width:0;display:grid;gap:16px}.plots{display:flex;flex-direction:column;min-height:260px}.plots>button{display:flex;align-items:center;gap:14px;width:100%;padding:12px;background:#f9fcff;border:1px solid #dce8f2;border-radius:6px;color:#315571;cursor:pointer;margin-bottom:8px;text-align:left}.plots>button.chosen{border-color:#1687ef;background:#eff7ff}.plots small{margin-left:auto}.thumbnail{width:80px;height:56px;overflow:hidden;background:#edf3f8;display:grid;place-items:center}.instruction{margin-top:auto;padding:14px;background:#eff7ff;border-radius:6px;color:#5884a4;font-size:12px}.history>div{max-height:240px;overflow:auto}.history article{padding:12px 0;border-bottom:1px solid #e3edf4;font-size:13px}.history small{display:block;margin:8px 0;color:#8ba0b0}.operation fieldset{border:0;padding:0;min-width:0}.field{display:grid;gap:10px;margin:16px 0;font-size:13px;color:#66829a}.field input,.field textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #d9e7f2;border-radius:5px;background:#fbfdff;color:#36556d;font:inherit}.field textarea{min-height:140px;resize:vertical}.choices{display:flex;gap:24px;padding:14px;background:#f5faff;border-radius:6px;font-size:14px}.materials{padding:12px 0;color:#688399;font-size:13px}.operation footer{display:flex;justify-content:flex-end;padding-top:20px}.operation footer button{padding:10px 22px;border:0;border-radius:5px;background:#1687ef;color:white;cursor:pointer}.operation footer button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:900px){.default-columns{grid-template-columns:1fr}}
</style>
