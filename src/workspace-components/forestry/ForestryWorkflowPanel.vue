<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBackendTaskData } from '@/workspace-components/shared/use-backend-task'
import WorkflowAssigneePicker from '@/workspace-components/shared/WorkflowAssigneePicker.vue'
import WorkbenchRequiredMark from '@/workspace-components/shared/WorkbenchRequiredMark.vue'
import DeadlinePicker from '@/workspace-components/shared/DeadlinePicker.vue'
import TaskHistory from '@/components/task-center/TaskHistory.vue'
import { getTaskWorkflow, submitWorkflowNode, uploadWorkflowFiles } from '@/api/task-workflow'
import { canOperateWorkflowNode } from '@/utils/task-workflow-state'
import { useUserStore } from '@/stores/user'
import type { WorkbenchUser } from '@/api/workbench-users'

const props = defineProps<{ taskId?: string; nodeKey: string }>()
const emit = defineEmits<{ submitted: [] }>()
const user = useUserStore()
const { task, flow, selectedNode, abnormals, logs, loading, errors, load } = useBackendTaskData({ get taskId() { return props.taskId }, get nodeKey() { return props.nodeKey }, includeMaterials: false })
const busy = ref(false), error = ref(''), result = ref(''), opinion = ref(''), description = ref(''), deadline = ref(''), checker = ref(''), checkTime = ref('')
const recipient = ref<WorkbenchUser>()
const spotResults = ref<Array<{ abnormalId: string; conclusion: string; remark: string }>>([])
const node = computed(() => props.nodeKey)
const isDispatch = computed(() => ['DISTRICT_DISPATCH', 'SECTION_DISPATCH'].includes(node.value))
const isField = computed(() => node.value === 'FIELD_COLLECT')
const isRectify = computed(() => node.value === 'RECTIFY_FOREST')
const isReview = computed(() => ['SECTION_AUDIT', 'SECTION_RECHECK'].includes(node.value))
const isFinish = computed(() => node.value === 'FINISH_FOREST')
const requiresRecipient = computed(() => isDispatch.value || isField.value || (isReview.value && (result.value === 'NO_PROBLEM' || (node.value === 'SECTION_AUDIT' && result.value === 'PROBLEM'))))
const canEdit = computed(() => !busy.value && !loading.value && canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || '')) && selectedNode.value?.id === flow.value?.currentNode?.id)
const title = computed(() => selectedNode.value?.nodeName || '林业执法办理')
const nextNode = computed(() => {
  const currentId = selectedNode.value?.id
  if (!currentId) return undefined
  return [...(flow.value?.timeline || []), ...(flow.value?.currentNode ? [flow.value.currentNode] : [])]
    .find(item => item.prevNodeInstId != null && String(item.prevNodeInstId) === currentId)
})
const savedRecipientName = computed(() => {
  const data = (selectedNode.value?.resultData || {}) as Record<string, unknown>
  return String(data.targetAssigneeName || nextNode.value?.assigneeName || (data.targetAssigneeId ? `用户 #${data.targetAssigneeId}` : ''))
})
let initializedNodeId = ''
watch([() => selectedNode.value?.id, abnormals, loading], () => {
  if (!selectedNode.value || loading.value || initializedNodeId === selectedNode.value.id) return
  initializedNodeId = selectedNode.value.id
  recipient.value = undefined; deadline.value = ''; error.value = ''
  const data = (selectedNode.value?.resultData || {}) as Record<string, unknown>
  if (selectedNode.value.status === 'COMPLETED') deadline.value = String(data.deadline || nextNode.value?.deadline || '').slice(0, 16)
  const saved = Array.isArray(data.spotResults) ? data.spotResults as Array<{ abnormalId: string; conclusion: string; remark: string }> : []
  spotResults.value = abnormals.value.map(spot => ({ abnormalId: spot.id, conclusion: saved.find(item => String(item.abnormalId) === spot.id)?.conclusion || '', remark: saved.find(item => String(item.abnormalId) === spot.id)?.remark || '' }))
  result.value = String(data.result || ''); opinion.value = String(data.opinion || ''); description.value = String(data.description || '')
  checker.value = String(data.checker || ''); checkTime.value = String(data.checkTime || '')
}, { immediate: true })
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, files = Array.from(input.files || []); input.value = ''
  if (!canEdit.value || !selectedNode.value || !files.length) return
  busy.value = true; error.value = ''
  try { await uploadWorkflowFiles(selectedNode.value.id, files); await load() } catch (e) { error.value = e instanceof Error ? e.message : '上传失败' } finally { busy.value = false }
}
async function submit() {
  if (!canEdit.value || !props.taskId || !selectedNode.value) return
  error.value = ''
  if (requiresRecipient.value && !recipient.value) { error.value = '请选择下一节点办理人。'; return }
  if (isDispatch.value && !deadline.value) { error.value = '请选择办理期限。'; return }
  if (isReview.value && !result.value) { error.value = '请选择审核结论。'; return }
  if ((isField.value || isRectify.value) && (!description.value.trim() || !selectedNode.value.files?.length)) { error.value = '请填写说明并上传现场材料。'; return }
  if (isField.value && (!checker.value.trim() || !checkTime.value || spotResults.value.some(item => !item.conclusion || !item.remark.trim()))) { error.value = '请填写核查时间、核查人和每个图斑的结论及说明。'; return }
  busy.value = true
  try {
    const current = await getTaskWorkflow(props.taskId)
    if (!current?.currentNode || current.currentNode.id !== selectedNode.value.id || !canOperateWorkflowNode(current.currentNode, String(user.currentUser?.id || ''))) throw new Error('办理节点已变化，请刷新后重试。')
    const route = isDispatch.value || isField.value ? 'FORWARD' : isRectify.value ? 'DONE' : isReview.value ? result.value : undefined
    const targetDeadline = deadline.value ? `${deadline.value}:00` : ''
    await submitWorkflowNode({ nodeInstId: current.currentNode.id, ...(requiresRecipient.value && recipient.value ? { targetAssigneeId: recipient.value.id, targetDeptId: recipient.value.deptId } : {}), ...(targetDeadline && !isFinish.value ? { deadline: targetDeadline } : {}), resultData: { ...(route ? { result: route } : {}), opinion: opinion.value.trim(), description: description.value.trim(), ...(requiresRecipient.value && recipient.value ? { targetAssigneeId: recipient.value.id, targetAssigneeName: recipient.value.realName || recipient.value.nickname || recipient.value.username, targetDeptId: recipient.value.deptId } : {}), ...(targetDeadline ? { deadline: targetDeadline } : {}), ...(isField.value ? { checkTime: checkTime.value, checker: checker.value.trim(), spotResults: spotResults.value } : {}), attachment: (selectedNode.value.files || []).map(file => file.id) } })
    emit('submitted'); window.dispatchEvent(new Event('workflow-todos-changed'))
  } catch (e) { error.value = e instanceof Error ? e.message : '提交失败' } finally { busy.value = false }
}
</script>

<template>
  <div class="forest-page">
    <header><h2>{{ title }}</h2><span>{{ task?.name }} · {{ selectedNode?.assigneeName || '暂无办理人' }}</span></header>
    <p v-if="errors.length || error" class="error" role="alert">{{ [...errors, error].filter(Boolean).join('；') }}</p>
    <p v-if="!canEdit && !loading" class="note">{{ selectedNode?.status === 'COMPLETED' ? '该节点已办理完成，可点击顶部当前节点继续办理。' : '当前节点只读，只有当前办理人可以提交。' }}</p>
    <div class="columns"><section class="card"><h3>关联图斑</h3><p v-if="!abnormals.length">暂无关联图斑</p><article v-for="spot in abnormals" :key="spot.id"><b>{{ spot.title }}</b><small>{{ spot.spotNo || spot.id }}</small><template v-if="isField"><label><span><WorkbenchRequiredMark />核查结论</span><select v-model="spotResults.find(item => item.abnormalId === spot.id)!.conclusion" :disabled="!canEdit"><option value="">请选择</option><option value="CONFIRMED">有问题或故障</option><option value="NO_PROBLEM">无问题</option></select></label><label><span><WorkbenchRequiredMark />图斑说明</span><textarea v-model="spotResults.find(item => item.abnormalId === spot.id)!.remark" :disabled="!canEdit" /></label></template></article><TaskHistory :task="task" :logs="logs" :flow="flow" :spots="abnormals" :loading="loading" /></section>
      <section class="card"><h3>节点办理</h3><form @submit.prevent="submit"><fieldset :disabled="!canEdit">
        <div v-if="isField" class="handoff-row"><label><span><WorkbenchRequiredMark />核查日期</span><input v-model="checkTime" type="date" required /></label><label><span><WorkbenchRequiredMark />核查人</span><input v-model="checker" required /></label></div>
        <label v-if="isField || isRectify"><span><WorkbenchRequiredMark />{{ isField ? '现场核查说明' : '整改说明' }}</span><textarea v-model="description" required /></label>
        <label v-if="isDispatch || isReview || isFinish">{{ isFinish ? '归档说明' : '办理意见' }}<textarea v-model="opinion" /></label>
        <label v-if="isReview"><span><WorkbenchRequiredMark />审核结论</span><select v-model="result" required><option value="">请选择</option><option value="NO_PROBLEM">确认无问题</option><option value="PROBLEM">仍有问题</option></select></label>
        <div v-if="isField || isRectify"><h4><WorkbenchRequiredMark />现场材料</h4><p v-for="file in selectedNode?.files || []" :key="file.id">{{ file.fileName }}</p><input v-if="canEdit" type="file" multiple @change="upload" /></div>
        <div v-if="requiresRecipient" class="handoff-row">
          <WorkflowAssigneePicker v-model="recipient" :node-id="selectedNode?.id" :dept-id="selectedNode?.deptId" :readonly="!canEdit" :saved-name="savedRecipientName" label="下一节点办理人" hide-hint />
          <label><span><WorkbenchRequiredMark v-if="isDispatch" />办理期限</span><DeadlinePicker v-model="deadline" :required="isDispatch" :disabled="!canEdit" /></label>
        </div>
        <p v-if="isRectify || (node === 'SECTION_RECHECK' && result === 'PROBLEM')" class="note">下一办理人由工作流按历史办理记录自动确定。</p>
        <button type="submit" :disabled="!canEdit">{{ busy ? '提交中…' : isFinish ? '确认结束' : '提交办理' }}</button>
      </fieldset></form></section></div>
  </div>
</template>

<style scoped>
.forest-page{height:100%;overflow:auto;padding:16px;background:#eef3f8;color:#29475a}.forest-page header,.card{padding:16px;background:#fff;border:1px solid #dbe6ee;border-radius:7px}.forest-page header{display:flex;align-items:center;gap:20px;margin-bottom:12px}.forest-page h2{font-size:18px;margin:0}.columns{display:grid;grid-template-columns:minmax(260px,1fr) minmax(340px,1.4fr);gap:12px}.card h3{margin:0 0 14px}.card article{padding:12px 0;border-bottom:1px solid #e5edf2}.card small{display:block;color:#79909f}.card label{display:grid;gap:6px;margin:12px 0}.card input,.card select,.card textarea{box-sizing:border-box;width:100%;padding:8px;border:1px solid #cbdce6;border-radius:4px;font:inherit}.card textarea{min-height:70px}.card fieldset{border:0;padding:0;margin:0}.card button{padding:9px 22px;color:white;background:#168bd2;border:0;border-radius:4px}.card button:disabled{opacity:.5}.note{color:#587486}.error{color:#a73737;background:#fff2f2;padding:10px}
.handoff-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}.handoff-row :deep(.assignee-picker){min-width:0;margin:12px 0;padding:0;border:0;border-radius:0;gap:6px;font:inherit;color:inherit}.handoff-row :deep(.assignee-label){display:block;margin:0;font-weight:inherit;line-height:20px}.handoff-row :deep(.assignee-picker select){height:38px}.handoff-row>label{min-width:0}.handoff-row>label>span{line-height:20px}.handoff-row :deep(.deadline-trigger){height:38px}
@media(max-width:1100px){.handoff-row{grid-template-columns:1fr;gap:0}}
</style>
