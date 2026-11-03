<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getGovernanceTaskDetail, getGovernanceTaskGeometry, getGovernanceTaskOperateLogs, taskPriorityLabel, type GovernanceTaskDetail, type GovernanceTaskOperateLog, type TaskGeometryFeatureCollection } from '@/api/governance-task'
import { getTaskEvidenceImages, type TaskEvidenceImage } from '@/api/governance-result'
import { deleteWorkflowFile, getTaskWorkflow, uploadWorkflowFiles, type TaskWorkflow } from '@/api/task-workflow'
import { getMyWorkflowTasks, type MyWorkflowTask } from '@/api/my-workflow-tasks'
import { pendingWorkbenchTasks } from '@/utils/task-todo-state'
import { canOperateWorkflowNode, isNodeMine } from '@/utils/task-workflow-state'
import { facilityNodeKey, facilityWorkflow } from '@/utils/farmland-facility-workflow'
import { inspectionDocumentAccept, inspectionFileError, inspectionImageAccept, isInspectionImage } from '@/utils/inspection-files'
import FacilityGeometryMap from './FacilityGeometryMap.vue'

type Field = { key: string; label: string; kind?: 'select' | 'textarea'; options?: string[]; hint?: string }
const fields: Record<string, Field[]> = {
  'task-acceptance': [
    { key: 'facilityCode', label: '设施编码' }, { key: 'issueCategory', label: '故障类别' },
    { key: 'description', label: '报修问题描述', kind: 'textarea' }, { key: 'acceptanceOpinion', label: '受理意见', kind: 'textarea' },
  ],
  'department-review': [
    { key: 'issueLevel', label: '问题等级', kind: 'select', options: ['一般', '较重', '紧急'] },
    { key: 'responsibleUnit', label: '责任单位' }, { key: 'deadlineNote', label: '处置时限说明' },
    { key: 'reviewOpinion', label: '审核与派单意见', kind: 'textarea' },
  ],
  'on-site-verification': [
    { key: 'faultConfirmed', label: '故障核实结果', kind: 'select', options: ['属实', '不属实', '需补充核查'] },
    { key: 'faultCause', label: '故障原因', kind: 'textarea' }, { key: 'repairAction', label: '维修处置措施', kind: 'textarea' },
    { key: 'materials', label: '材料与配件' }, { key: 'testResult', label: '试运行/测试结果', kind: 'textarea' },
  ],
  'department-recheck': [
    { key: 'checkMethod', label: '复核方式', kind: 'select', options: ['现场复核', '材料复核'] },
    { key: 'repairResult', label: '维修结果', kind: 'select', options: ['通过', '退回重修', '待补充材料'] },
    { key: 'retestResult', label: '复测情况' }, { key: 'recheckOpinion', label: '复核意见/退回原因', kind: 'textarea' },
  ],
  'case-archive': [
    { key: 'closureConclusion', label: '结案结论' }, { key: 'closureSummary', label: '结案说明', kind: 'textarea' },
  ],
}
const evidenceTips: Record<string, string[]> = {
  'task-acceptance': ['扫码设施编码与原始报修记录', '故障现场照片；可补充视频或文档'],
  'department-review': ['审核意见和派单记录', '需要时补充认定附件'],
  'on-site-verification': ['到场复扫/定位记录', '维修前、维修过程、维修后照片', '材料清单、试运行或测试记录'],
  'department-recheck': ['复核现场照片或复测记录', '必要时补充验收单、签认材料'],
  'case-archive': ['复用前序全部证据', '需要时补充结案意见或验收文件'],
}
const props = defineProps<{ taskId: string; taskName?: string }>()
const route = useRoute(), router = useRouter(), user = useUserStore()
const detail = ref<GovernanceTaskDetail>(), flow = ref<TaskWorkflow>(), geometry = ref<TaskGeometryFeatureCollection>()
const images = ref<TaskEvidenceImage[]>([]), logs = ref<GovernanceTaskOperateLog[]>([]), todos = ref<MyWorkflowTask[]>([])
const loading = ref(false), busy = ref(false), error = ref(''), noticeError = ref(''), message = ref('')
const draft = ref<Record<string, string>>({}), repairGeometry = ref<TaskGeometryFeatureCollection>(), previewUrls = ref<Record<string, string>>({})
let loadVersion = 0, toastTimer: ReturnType<typeof setTimeout> | undefined
const steps = computed(() => facilityWorkflow(flow.value))
const currentStep = computed(() => steps.value.find(step => step.instance?.id === flow.value?.currentNode?.id))
const selectedKey = computed(() => {
  const requested = steps.value.find(step => step.key === route.query.node && (step.viewable || step.key === 'task-acceptance'))
  return requested?.key || currentStep.value?.key || 'task-acceptance'
})
const selectedStep = computed(() => steps.value.find(step => step.key === selectedKey.value))
const node = computed(() => selectedStep.value?.instance)
const canEdit = computed(() => !busy.value && !loading.value && canOperateWorkflowNode(node.value, String(user.currentUser?.id || '')) && node.value?.id === flow.value?.currentNode?.id)
const otherTodos = computed(() => pendingWorkbenchTasks(todos.value, props.taskId))
const facilityReference = computed(() => detail.value?.task.refId || '')
const geometryKinds = computed(() => [...new Set((geometry.value?.features || []).map(feature => {
  const kind = feature.geometry?.type || ''
  return /point/i.test(kind) ? '点状' : /linestring/i.test(kind) ? '线状' : /polygon/i.test(kind) ? '面状' : ''
}).filter(Boolean))].join('、') || '暂无关联几何')
const resultData = computed(() => (node.value?.resultData && typeof node.value.resultData === 'object' && !Array.isArray(node.value.resultData) ? node.value.resultData : {}) as Record<string, unknown>)
const nodeFiles = computed(() => node.value?.files || [])
const nodeHistory = computed(() => [...(flow.value?.timeline || [])].reverse().filter(item => item.status === 'COMPLETED' || item.status === 'PROCESSING'))
const unknownNodes = computed(() => (flow.value?.timeline || []).filter(item => !facilityNodeKey(item)))
function text(value: unknown) { return value === undefined || value === null || value === '' ? '暂无数据' : String(value).replace(/^([\d-]{10})T/, '$1 ') }
function toast(value: string) { message.value = value; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => { message.value = '' }, 4200) }
function clearPreviews() { Object.values(previewUrls.value).forEach(URL.revokeObjectURL); previewUrls.value = {} }
function selectStep(key: string) {
  const step = steps.value.find(item => item.key === key)
  if (!step || (!step.viewable && key !== 'task-acceptance')) return
  void router.replace({ query: { ...route.query, node: key } })
}
function nodeHint(step: typeof steps.value[number]) {
  if (step.key === 'task-acceptance' && !step.instance) return '查看报修任务资料；后端尚无受理节点记录'
  if (!step.viewable) return '流程尚未到达，不能办理'
  if (step.status === 'completed') return '已完成，可回看'
  return isNodeMine(step.instance!, String(user.currentUser?.id || '')) ? '当前由我办理' : '由其他办理人处理，当前只读'
}
async function verifyCurrentNode(expectedId: string) {
  const latest = await getTaskWorkflow(props.taskId)
  if (latest?.currentNode?.id !== expectedId || !canOperateWorkflowNode(latest.currentNode, String(user.currentUser?.id || ''))) {
    flow.value = latest
    throw new Error('当前办理节点已变化，请刷新后重试。')
  }
}
async function load() {
  const version = ++loadVersion
  loading.value = true; error.value = ''; detail.value = undefined; flow.value = undefined; geometry.value = undefined; images.value = []; logs.value = []
  try {
    const taskDetail = await getGovernanceTaskDetail(props.taskId)
    if (version !== loadVersion) return
    if (!taskDetail) throw new Error('未找到真实报修任务或没有查看权限')
    detail.value = taskDetail
    const deptId = taskDetail.task.deptId
    const responses = await Promise.allSettled([
      getTaskWorkflow(props.taskId), getGovernanceTaskGeometry(props.taskId, undefined, false, deptId),
      getTaskEvidenceImages(props.taskId, deptId), getGovernanceTaskOperateLogs(props.taskId, deptId),
      getMyWorkflowTasks(String(user.currentUser?.id || ''), user.activeDeptId),
    ])
    if (version !== loadVersion) return
    if (responses[0].status === 'fulfilled') flow.value = responses[0].value
    if (responses[1].status === 'fulfilled') geometry.value = responses[1].value
    if (responses[2].status === 'fulfilled') images.value = responses[2].value
    if (responses[3].status === 'fulfilled') logs.value = responses[3].value
    if (responses[4].status === 'fulfilled') { todos.value = responses[4].value.records; noticeError.value = responses[4].value.warnings.join('；') }
    else noticeError.value = '其他待办读取失败'
    const labels = ['工作流', '任务关联几何', '任务影像', '操作记录']
    error.value = responses.slice(0, 4).flatMap((result, index) => result.status === 'rejected' ? [`${labels[index]}：${result.reason instanceof Error ? result.reason.message : '读取失败'}`] : []).join('；')
  } catch (reason) { if (version === loadVersion) error.value = reason instanceof Error ? reason.message : '任务读取失败' }
  finally { if (version === loadVersion) loading.value = false }
}
watch([() => props.taskId, () => user.activeDeptId], () => void load(), { immediate: true })
watch([selectedKey, () => node.value?.id, () => detail.value?.task.id], () => {
  draft.value = Object.fromEntries((fields[selectedKey.value] || []).map(field => [field.key, String(resultData.value[field.key] ?? (selectedKey.value === 'task-acceptance' ? ({ facilityCode: detail.value?.task.refId, description: detail.value?.task.description } as Record<string, unknown>)[field.key] : '') ?? '')]))
  const saved = resultData.value.repairGeometry
  repairGeometry.value = saved && typeof saved === 'object' ? saved as TaskGeometryFeatureCollection : undefined
  clearPreviews()
}, { immediate: true })
async function upload(event: Event, photos: boolean) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || []); input.value = ''
  if (!files.length || !canEdit.value || !node.value) return
  const issue = inspectionFileError(files, photos)
  if (issue) { toast(issue); return }
  busy.value = true
  try {
    const before = new Set(nodeFiles.value.map(file => file.id))
    await verifyCurrentNode(node.value.id)
    await uploadWorkflowFiles(node.value.id, files)
    const latest = await getTaskWorkflow(props.taskId)
    if (latest) flow.value = latest
    const refreshed = steps.value.find(step => step.key === selectedKey.value)?.instance?.files || []
    refreshed.filter(file => !before.has(file.id)).forEach(file => {
      const original = files.find(item => item.name === file.fileName)
      if (original && isInspectionImage(file.fileName)) previewUrls.value[file.id] = URL.createObjectURL(original)
    })
    toast('附件已上传，请核对节点材料列表。')
  } catch (reason) { toast(reason instanceof Error ? reason.message : '附件上传失败') }
  finally { busy.value = false }
}
async function removeFile(id: string) {
  if (!canEdit.value || !node.value) return
  busy.value = true
  try {
    await verifyCurrentNode(node.value.id)
    await deleteWorkflowFile(id)
    if (previewUrls.value[id]) { URL.revokeObjectURL(previewUrls.value[id]); delete previewUrls.value[id] }
    flow.value = await getTaskWorkflow(props.taskId)
    toast('附件已删除')
  } catch (reason) { toast(reason instanceof Error ? reason.message : '附件删除失败') }
  finally { busy.value = false }
}
onBeforeUnmount(() => { loadVersion++; clearPreviews(); if (toastTimer) clearTimeout(toastTimer) })
</script>

<template>
  <div class="facility-workspace">
    <header class="facility-header">
      <div class="facility-brand"><button type="button" @click="router.push('/tasks/todo')">‹ 返回任务</button><span><b>高标田工程设施管理工作台</b><small :title="taskName">{{ taskName || detail?.task.name || '报修任务' }}</small></span></div>
      <nav class="facility-steps" aria-label="报修处置流程"><button v-for="step in steps" :key="step.key" type="button" :class="[step.status, { selected: selectedKey === step.key, mine: step.instance && isNodeMine(step.instance, String(user.currentUser?.id || '')) }]" :title="nodeHint(step)" :aria-disabled="!step.viewable && step.key !== 'task-acceptance'" @click="selectStep(step.key)"><i>{{ step.status === 'completed' ? '✓' : step.order }}</i><span>{{ step.name }}<em v-if="step.instance && isNodeMine(step.instance, String(user.currentUser?.id || ''))">我</em></span></button></nav>
      <div class="facility-notice"><button type="button" title="前往我的待办" @click="router.push('/tasks/todo')">♧ <b>{{ otherTodos.length }}</b></button><div class="facility-notice-list"><strong>其他待我处理的任务</strong><button v-for="todo in otherTodos" :key="todo.id" type="button" @click="router.push({ name: 'workspace', params: { sceneId: todo.sceneCode, taskId: todo.id } })">{{ todo.name }}</button><small v-if="noticeError">{{ noticeError }}</small><small v-else-if="!otherTodos.length">暂无其他待办</small></div></div>
    </header>
    <main class="facility-content">
      <div v-if="message" class="facility-toast" role="status">{{ message }}</div>
      <div v-if="error" class="facility-alert" role="alert">{{ error }} <button type="button" @click="load">重试</button></div>
      <div v-if="loading" class="facility-loading" role="status">正在读取真实任务与流程…</div>
      <template v-else-if="detail">
        <section class="facility-summary" aria-label="任务摘要"><article><small>任务编号</small><b>{{ text(detail.task.taskNo) }}</b></article><article><small>设施关联编号</small><b>{{ text(facilityReference) }}</b></article><article><small>设施几何</small><b>{{ geometryKinds }}</b></article><article><small>所属区域</small><b>{{ text(detail.task.rangeName) }}</b></article><article><small>当前流程</small><b>{{ currentStep?.name || '未匹配/未启动' }}</b></article><article><small>优先级</small><b>{{ taskPriorityLabel(detail.task.priority) }}</b></article></section>
        <div v-if="unknownNodes.length" class="facility-warning" role="status">真实流程中有尚未映射的节点：{{ unknownNodes.map(item => item.nodeName || item.nodeKey).join('、') }}。请核对新场景流程配置，页面不会擅自把它们归入五节点。</div>
        <div class="facility-layout">
          <aside class="facility-left">
            <section class="facility-card facility-map-card"><h2>设施位置与故障部位</h2><FacilityGeometryMap :geometry="geometry" v-model:repair-geometry="repairGeometry" :editable="selectedKey === 'on-site-verification' && canEdit" /><p v-if="!geometry?.features.length" class="facility-empty">当前任务没有关联几何。设施点、线、面数据需由设施台账或任务真实空间数据提供。</p></section>
            <section class="facility-card facility-dossier"><h2>设施 / 报修档案</h2><dl><dt>关联类型</dt><dd>{{ detail.task.refType === 'FACILITY' ? '设施' : text(detail.task.refType) }}</dd><dt>关联对象 ID</dt><dd>{{ text(detail.task.refId) }}</dd><dt>关联说明</dt><dd>{{ text(detail.refSummary) }}</dd><dt>报修人 / 联系人</dt><dd>{{ text(detail.task.contactName) }}</dd><dt>联系电话</dt><dd>{{ text(detail.task.contactPhone) }}</dd><dt>报修时间</dt><dd>{{ text(detail.task.createTime) }}</dd><dt>报修描述</dt><dd>{{ text(detail.task.description) }}</dd></dl><p class="facility-note">设施二维码、完整台账和扫码记录尚无已确认的专用接口；此处只展示任务接口实际返回的关联信息。</p></section>
          </aside>
          <section class="facility-card facility-main-card"><div class="facility-panel-head"><div><small>节点 {{ selectedStep?.order }} / 5</small><h1>{{ selectedStep?.name }}</h1><p>{{ selectedStep?.description }}</p></div><span :class="['facility-state', selectedStep?.status]">{{ node?.status === 'COMPLETED' ? '已完成' : canEdit ? '由我办理' : node?.status === 'PROCESSING' ? '他人办理 · 只读' : '未到达/无节点' }}</span></div>
            <div class="facility-panel-scroll"><p v-if="!node" class="facility-warning">{{ selectedKey === 'task-acceptance' ? '当前展示已创建任务的报修资料；后端没有受理节点记录，不推断受理已完成。' : '后端尚未产生此节点，当前不能填写、上传或提交。' }}</p>
              <div class="facility-fields"><label v-for="field in fields[selectedKey] || []" :key="field.key" :class="{ wide: field.kind === 'textarea' }"><span>{{ field.label }}</span><select v-if="field.kind === 'select'" v-model="draft[field.key]" :disabled="!canEdit"><option value="">请选择</option><option v-for="option in field.options || []" :key="option" :value="option">{{ option }}</option></select><textarea v-else-if="field.kind === 'textarea'" v-model="draft[field.key]" :disabled="!canEdit" rows="3" :placeholder="field.label" /><input v-else v-model="draft[field.key]" :disabled="!canEdit" :placeholder="field.label" /></label></div>
              <p v-if="selectedKey === 'on-site-verification'" class="facility-note">地图可标注本次故障点、线段或区域，不会覆盖设施原始位置。若核查与维修由不同人员负责，维修子工单仍需后端支持。</p>
              <section class="facility-evidence"><h2>本节点证据材料</h2><ul><li v-for="tip in evidenceTips[selectedKey] || []" :key="tip">{{ tip }}</li></ul><div class="facility-files"><article v-for="file in nodeFiles" :key="file.id"><img v-if="previewUrls[file.id]" :src="previewUrls[file.id]" :alt="file.fileName" /><span v-else>{{ isInspectionImage(file.fileName) ? '▧' : '▤' }}</span><div><b :title="file.fileName">{{ file.fileName }}</b><small>{{ text(file.createTime) }}</small></div><button v-if="canEdit" type="button" title="删除此附件" @click="removeFile(file.id)">删除</button></article><label v-if="canEdit" class="facility-upload">＋ 上传照片<input type="file" :accept="inspectionImageAccept" multiple @change="upload($event, true)" /></label><label v-if="canEdit" class="facility-upload">▤ 上传文档<input type="file" :accept="inspectionDocumentAccept" multiple @change="upload($event, false)" /></label><p v-if="!nodeFiles.length" class="facility-empty">此节点暂无已上传附件</p></div></section>
              <section v-if="selectedKey === 'task-acceptance'" class="facility-evidence"><h2>任务关联影像</h2><div class="facility-images"><a v-for="image in images" :key="image.id" :href="image.originalUrl || image.imageUrl || image.thumbnailUrl" target="_blank" rel="noopener noreferrer"><img v-if="image.thumbnailUrl || image.imageUrl" :src="image.thumbnailUrl || image.imageUrl" :alt="image.fileName" /><span>{{ image.fileName }}</span></a><p v-if="!images.length" class="facility-empty">任务暂无关联影像；不使用演示照片充当报修证据。</p></div></section>
              <div v-if="canEdit" class="facility-submit-disabled" title="设施场景的流程结论、派单、维修与归档接口尚未确认"><button type="button" disabled>提交{{ selectedStep?.name }}</button><small>已可上传真实节点附件；结构化字段与流程提交须待后端确认场景字段、结论路由及下一办理人规则后接入。当前填写内容离开页面不会保存。</small></div>
              <section v-if="node && !canEdit" class="facility-record"><h2>已记录的节点内容</h2><dl><template v-for="field in fields[selectedKey] || []" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ text(resultData[field.key]) }}</dd></template></dl></section>
            </div>
          </section>
          <aside class="facility-card facility-history"><h2>处置时间线</h2><ol><li v-for="item in nodeHistory" :key="item.id"><strong>{{ item.nodeName }}</strong><small>{{ item.assigneeName || '未记录办理人' }} · {{ text(item.submitTime || item.createTime) }}</small><span>{{ item.status === 'COMPLETED' ? '已完成' : '处理中' }}</span></li></ol><p v-if="!nodeHistory.length" class="facility-empty">后端尚无流程节点记录</p><h2>任务操作记录</h2><ol><li v-for="item in logs" :key="item.id"><strong>{{ item.operateTypeDesc || item.operateType }}</strong><small>{{ item.operatorName || '系统' }} · {{ text(item.createTime) }}</small><span>{{ item.operateDesc }}</span></li></ol><p v-if="!logs.length" class="facility-empty">暂无操作记录</p></aside>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.facility-workspace{height:100%;min-width:0;display:flex;flex-direction:column;background:#eef4f7;color:#284d63}.facility-header{z-index:20;flex:none;height:76px;display:grid;grid-template-columns:minmax(235px,1fr) minmax(450px,2.5fr) 48px;align-items:center;gap:12px;padding:0 16px;background:#08283c;color:#e7f6fb;box-shadow:0 2px 10px #103b4e3d}.facility-brand{display:flex;align-items:center;gap:10px;min-width:0}.facility-brand>button{flex:none;border:1px solid #4b8aa7;border-radius:5px;background:#0d4968;color:#f2fbff;padding:7px 10px;cursor:pointer}.facility-brand span{min-width:0}.facility-brand b,.facility-brand small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.facility-brand b{font-size:14px}.facility-brand small{margin-top:4px;color:#9dbbca;font-size:11px}.facility-steps{display:flex;min-width:0}.facility-steps button{position:relative;flex:1;min-width:0;display:grid;justify-items:center;gap:4px;border:0;background:transparent;color:#86a6b6;font-size:12px;cursor:pointer}.facility-steps button:not(:last-child):after{content:'';position:absolute;left:calc(50% + 15px);right:calc(-50% + 15px);top:13px;height:2px;background:#3d6e82}.facility-steps i{z-index:1;width:27px;height:27px;display:grid;place-items:center;border:1px solid #638ba0;border-radius:50%;background:#153d53;font-style:normal}.facility-steps span{white-space:nowrap}.facility-steps em{margin-left:4px;padding:1px 4px;border-radius:50%;background:#55cbb7;color:#063b42;font-size:10px;font-style:normal}.facility-steps button.active i{background:#157fb1;border-color:#59c9eb;color:#fff}.facility-steps button.completed i{background:#0e9ab2;border-color:#71dcdf;color:#fff}.facility-steps button.selected span{color:#fff;text-decoration:underline;text-underline-offset:5px}.facility-steps button[aria-disabled=true]{cursor:not-allowed;opacity:.55}.facility-notice{position:relative;justify-self:end}.facility-notice>button{border:0;background:none;color:#c4e7f5;font-size:20px;cursor:pointer}.facility-notice>button b{font-size:11px;color:#ff6c78}.facility-notice-list{display:none;position:absolute;top:32px;right:0;z-index:100;width:250px;max-height:270px;overflow:auto;padding:12px;border:1px solid #80b4c4;background:#123c51;box-shadow:0 8px 20px #001a2d66;border-radius:7px}.facility-notice:hover .facility-notice-list,.facility-notice:focus-within .facility-notice-list{display:grid;gap:8px}.facility-notice-list button{border:0;background:#1b536c;color:#fff;padding:8px;text-align:left;border-radius:4px;cursor:pointer}.facility-notice-list small{color:#bcd2dd}.facility-content{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:12px;gap:10px;overflow:hidden}.facility-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;flex:none}.facility-summary article{min-width:0;display:grid;gap:6px;padding:11px 13px;background:#fff;border:1px solid #dce9ef;border-radius:8px;box-shadow:0 2px 8px #1b607d12}.facility-summary small{color:#7793a2;font-size:11px}.facility-summary b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#163c55;font-size:13px}.facility-layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(290px,1.05fr) minmax(390px,1.55fr) minmax(215px,.7fr);gap:10px}.facility-left{min-height:0;display:grid;grid-template-rows:minmax(220px,1.25fr) minmax(180px,.8fr);gap:10px}.facility-card{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:12px;background:#fff;border:1px solid #dbe8ef;border-radius:9px;box-shadow:0 3px 12px #163e5912}.facility-card h2{flex:none;margin:0 0 9px;color:#173e57;font-size:14px}.facility-map-card :deep(.facility-map){flex:1}.facility-dossier{overflow:auto}.facility-dossier dl,.facility-record dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:7px;margin:0;font-size:12px}.facility-dossier dt,.facility-record dt{color:#8299a7}.facility-dossier dd,.facility-record dd{margin:0;overflow-wrap:anywhere}.facility-note{padding:8px 10px;border-radius:5px;background:#eef8fb;color:#54788b;font-size:11px;line-height:1.5}.facility-panel-head{display:flex;justify-content:space-between;gap:12px;flex:none;border-bottom:1px solid #e0ecf2;padding-bottom:10px}.facility-panel-head small{color:#1986b4;font-size:11px}.facility-panel-head h1{margin:3px 0 4px;color:#133b55;font-size:19px}.facility-panel-head p{margin:0;color:#7991a0;font-size:12px}.facility-state{align-self:flex-start;white-space:nowrap;padding:5px 8px;border-radius:5px;background:#eef3f5;color:#6e8796;font-size:11px}.facility-state.active{background:#e4f6fc;color:#0b8baa}.facility-state.completed{background:#e6f8f1;color:#138668}.facility-panel-scroll{overflow:auto;min-height:0;padding-top:10px;scrollbar-width:thin}.facility-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.facility-fields label{display:grid;gap:5px;min-width:0;font-size:12px;color:#527184}.facility-fields label.wide{grid-column:1/-1}.facility-fields input,.facility-fields select,.facility-fields textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbdde7;border-radius:5px;background:#fbfdff;color:#21465e;padding:8px;font:inherit;resize:vertical;color-scheme:light}.facility-fields :disabled{background:#f6f9fa;color:#45697c;opacity:1}.facility-fields option{background:#fff;color:#21465e}.facility-evidence,.facility-record{margin-top:16px;border-top:1px solid #e2ebf0;padding-top:12px}.facility-evidence ul{margin:0 0 10px;padding-left:20px;color:#5c7c8f;font-size:11px;line-height:1.7}.facility-files{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}.facility-files article{display:flex;align-items:center;gap:6px;min-width:0;border:1px solid #dce8ee;border-radius:6px;padding:7px}.facility-files article>span{color:#1a93b4;font-size:21px}.facility-files article img{width:35px;height:35px;object-fit:cover}.facility-files article div{min-width:0;flex:1}.facility-files article b,.facility-files article small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.facility-files article small{color:#8ca2af}.facility-files article button{border:0;background:none;color:#c3564c;font-size:10px;cursor:pointer}.facility-upload{display:grid;place-items:center;min-height:55px;border:1px dashed #8bc4d9;border-radius:6px;color:#0d84ad;background:#f2fbfe;font-size:12px;cursor:pointer}.facility-upload input{position:absolute;width:1px;height:1px;opacity:0}.facility-images{display:flex;flex-wrap:wrap;gap:8px}.facility-images a{max-width:130px;display:grid;gap:5px;font-size:11px;color:#117ca5;overflow-wrap:anywhere}.facility-images img{width:110px;height:80px;object-fit:cover;border-radius:5px}.facility-submit-disabled{display:flex;align-items:center;gap:10px;margin-top:16px}.facility-submit-disabled button{flex:none;border:0;border-radius:5px;background:#a8c0ca;color:white;padding:9px 15px}.facility-submit-disabled small{color:#8a653c;line-height:1.5}.facility-history{overflow:auto}.facility-history h2:not(:first-child){margin-top:14px}.facility-history ol{list-style:none;margin:0;padding:0}.facility-history li{position:relative;display:grid;gap:4px;border-left:2px solid #8bcddc;padding:0 0 15px 11px;margin-left:4px;font-size:11px}.facility-history li strong{color:#1e607a}.facility-history li small{color:#93a8b2}.facility-history li span{line-height:1.4}.facility-empty{color:#90a4af;font-size:11px;line-height:1.6}.facility-warning,.facility-alert{flex:none;padding:8px 11px;border:1px solid #efd89b;border-radius:5px;background:#fff9e8;color:#8c651b;font-size:12px}.facility-alert{border-color:#ebb3aa;background:#fff3f0;color:#b34e42}.facility-alert button{margin-left:8px;border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer}.facility-loading{padding:30px;text-align:center;color:#7393a3}.facility-toast{position:absolute;z-index:100;top:9px;left:50%;transform:translateX(-50%);max-width:75%;padding:9px 16px;border:1px solid #82d8d3;border-radius:7px;background:#effffdf5;color:#11616b;box-shadow:0 5px 18px #24536d30;font-size:12px}
@media(max-width:1250px){.facility-layout{grid-template-columns:minmax(240px,.9fr) minmax(370px,1.4fr);grid-template-rows:minmax(0,1fr) minmax(110px,.28fr)}.facility-history{grid-column:1/-1}.facility-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.facility-header{grid-template-columns:minmax(200px,.8fr) minmax(430px,2.3fr) 40px}}
@media(max-width:800px){.facility-header{height:auto;min-height:100px;grid-template-columns:1fr 36px;grid-template-rows:auto auto;padding:9px}.facility-steps{grid-column:1/-1;grid-row:2}.facility-notice{grid-column:2;grid-row:1}.facility-content{overflow:auto}.facility-layout{display:flex;flex-direction:column;overflow:visible}.facility-left{display:flex;flex-direction:column}.facility-map-card{height:320px}.facility-dossier{max-height:240px}.facility-main-card{min-height:440px}.facility-history{display:flex;max-height:250px}.facility-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
