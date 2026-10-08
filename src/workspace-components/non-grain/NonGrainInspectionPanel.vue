<script setup lang="ts">
import WorkbenchFeedback from '@/workspace-components/shared/WorkbenchFeedback.vue'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useUserStore } from '@/stores/user'
import { useBackendTaskData } from '@/workspace-components/shared/use-backend-task'
import { getDeptUserPage } from '@/api/account-management'
import { collectPages } from '@/api/pagination'
import { getMetadataOptions, type MetadataOption } from '@/api/metadata'
import { getTaskWorkflow, submitWorkflowNode, uploadWorkflowFiles, deleteWorkflowFile } from '@/api/task-workflow'
import { canOperateWorkflowNode } from '@/utils/task-workflow-state'
import { inspectionRoute, type PlotInspection } from '@/utils/non-grain-inspection'
import { inspectionImageAccept, inspectionDocumentAccept, isInspectionImage, inspectionFileError } from '@/utils/inspection-files'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import './workspace.scss'

const props = defineProps<{ taskId?: string; readonly?: boolean; flowError?: string }>()
const emit = defineEmits<{ submitted: [] }>()
const user = useUserStore()
const { task, flow, abnormals, selectedNode, loading, errors, load } = useBackendTaskData({ get taskId() { return props.taskId }, get readonly() { return props.readonly }, nodeKey: 'on-site-verification', includeMaterials: false })
const canEdit = computed(() => !props.readonly && !loading.value && !busy.value && canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || '')) && selectedNode.value?.id === flow.value?.currentNode?.id)
const busy = ref(false)
const error = ref('')
const options = ref<MetadataOption[]>([])
const optionError = ref('')
const activeId = ref('')
const drafts = ref<PlotInspection[]>([])
const checkTime = ref('')
const checker = ref('')
const previewUrls = ref<Record<string, string>>({})
const nodeRecord = computed(() => (selectedNode.value?.resultData || {}) as Record<string, unknown>)
const records = computed<PlotInspection[]>(() => {
  if (canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || ''))) return drafts.value
  const saved = nodeRecord.value.plotResults
  if (Array.isArray(saved)) return saved as PlotInspection[]
  return abnormals.value.map(spot => ({ ...emptyPlot(spot.id), ...nodeRecord.value, abnormalId: spot.id })) as PlotInspection[]
})
const active = computed(() => records.value.find(item => item.abnormalId === activeId.value))
const files = computed(() => selectedNode.value?.files || [])
const photoFiles = computed(() => files.value.filter(file => isInspectionImage(file.fileName)))
const displayTime = computed(() => canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || '')) ? checkTime.value : String(nodeRecord.value.checkTime || ''))
const displayChecker = computed(() => canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || '')) ? checker.value : String(nodeRecord.value.checker || selectedNode.value?.assigneeName || ''))
const flatOptions = computed(() => {
  const list: MetadataOption[] = []
  function walk(items: MetadataOption[], prefix = '') { for (const item of items) { list.push({ ...item, name: prefix + item.name }); if (item.children) walk(item.children, prefix + item.name + ' / ') } }
  walk(options.value); return list
})
function emptyPlot(id: string): PlotInspection {
  const spot = abnormals.value.find(item => item.id === id)
  return { abnormalId: id, result: '', landUse: '', summerCrop: '', earlyCrop: '', autumnCrop: '', noProblemReason: '', description: '', longitude: spot?.longitude?.toString() || '', latitude: spot?.latitude?.toString() || '', village: '', phone: '', attachment: [] }
}
let initializedNode = ''
watch(() => selectedNode.value?.id, id => {
  // 附件上传后的详情刷新会短暂清空节点，不能因此丢掉正在填写的核查结果。
  const key = `${props.taskId}:${id}`
  if (!id || key === initializedNode) return
  initializedNode = key
  drafts.value = abnormals.value.map(spot => emptyPlot(spot.id))
  activeId.value = abnormals.value[0]?.id || ''
  checkTime.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  checker.value = selectedNode.value?.assigneeName || user.name
  error.value = ''; clearPreviews()
})
getMetadataOptions('PLANT_USE').then(value => { options.value = value }).catch(reason => { optionError.value = reason instanceof Error ? reason.message : '种植用途读取失败' })
function clearPreviews() { Object.values(previewUrls.value).forEach(URL.revokeObjectURL); previewUrls.value = {} }
const dragDepth = ref(0)
const draggingImages = computed(() => dragDepth.value > 0 && canEdit.value)
function hasDraggedFiles(event: DragEvent) { return Array.from(event.dataTransfer?.types || []).includes('Files') }
function dragEnter(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  event.preventDefault(); dragDepth.value++
}
function dragOver(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = canEdit.value && active.value ? 'copy' : 'none'
}
function dragLeave(event: DragEvent) {
  if (hasDraggedFiles(event)) dragDepth.value = Math.max(0, dragDepth.value - 1)
}
function dropImages(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  event.preventDefault(); dragDepth.value = 0
  if (!canEdit.value || !active.value) { error.value = busy.value ? '正在处理文件，请稍后再拖入。' : '当前页面只读或没有选中图斑，无法上传现场图片。'; return }
  void uploadPicked(Array.from(event.dataTransfer?.files || []), true)
}
onMounted(() => {
  window.addEventListener('dragenter', dragEnter)
  window.addEventListener('dragover', dragOver)
  window.addEventListener('dragleave', dragLeave)
  window.addEventListener('drop', dropImages)
})
onBeforeUnmount(() => {
  clearPreviews()
  window.removeEventListener('dragenter', dragEnter)
  window.removeEventListener('dragover', dragOver)
  window.removeEventListener('dragleave', dragLeave)
  window.removeEventListener('drop', dropImages)
})
async function upload(event: Event, photos: boolean) {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files || []); input.value = ''
  await uploadPicked(picked, photos)
}
async function uploadPicked(picked: File[], photos: boolean) {
  if (!canEdit.value || !selectedNode.value || !active.value || !picked.length) return
  error.value = ''
  error.value = inspectionFileError(picked, photos)
  if (error.value) return
  const plot = active.value; const nodeId = selectedNode.value.id
  const previous = new Set(files.value.map(file => file.id))
  busy.value = true
  try {
    await uploadWorkflowFiles(nodeId, picked)
    await load()
    const added = files.value.filter(file => !previous.has(file.id))
    if (photos) plot.attachment.push(...added.filter(file => isInspectionImage(file.fileName)).map(file => file.id))
    for (const file of added) { const local = picked.find(item => item.name === file.fileName); if (local && /\.(jpe?g|png|svg|webp|gif|bmp|avif)$/i.test(local.name)) previewUrls.value[file.id] = URL.createObjectURL(local) }
    if (!added.length) error.value = '附件已上传，但详情未返回附件记录，请刷新核对后再提交。'
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '上传失败' }
  finally { busy.value = false }
}
async function removeFile(id: string) {
  if (!canEdit.value) return
  busy.value = true; error.value = ''
  try { await deleteWorkflowFile(id); drafts.value.forEach(plot => { plot.attachment = plot.attachment.filter(value => value !== id) }); if (previewUrls.value[id]) URL.revokeObjectURL(previewUrls.value[id]); delete previewUrls.value[id]; await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '删除附件失败' }
  finally { busy.value = false }
}
function locate() {
  if (!canEdit.value || !active.value) return
  const plot = active.value
  navigator.geolocation.getCurrentPosition(position => { plot.longitude = String(position.coords.longitude); plot.latitude = String(position.coords.latitude) }, reason => { error.value = `定位失败：${reason.message}` })
}
async function submit() {
  if (!canEdit.value || !props.taskId || !selectedNode.value) return
  busy.value = true; error.value = ''
  try {
    const current = await getTaskWorkflow(props.taskId)
    if (!current?.currentNode || current.currentNode.id !== selectedNode.value.id || current.currentNode.nodeKey !== 'IMPLEMENT' || !canOperateWorkflowNode(current.currentNode, String(user.currentUser?.id || ''))) throw new Error('节点状态已变化，请刷新后重试。')
    if (!checkTime.value || !checker.value.trim()) throw new Error('请填写核查日期和核查人。')
    let rectifyUserId: string | undefined
    if (drafts.value.some(plot => plot.result === 'PROBLEM')) {
      const deptId = current.currentNode.deptId || task.value?.deptId
      if (!deptId) throw new Error('缺少处理部门，无法查询 ntjsg。')
      const members = await collectPages((pageNum, pageSize) => getDeptUserPage({ deptId, keyword: 'ntjsg', includeChild: false, pageNum, pageSize }))
      rectifyUserId = members.find(person => person.username === 'ntjsg')?.id
    }
    const route = inspectionRoute(drafts.value, current, rectifyUserId)
    const primary = drafts.value.find(plot => plot.result === route.result)!
    await submitWorkflowNode({ nodeInstId: current.currentNode.id, targetAssigneeId: route.assigneeId, targetDeptId: route.deptId, resultData: { result: route.result, landUse: primary.landUse, checkTime: checkTime.value, checker: checker.value.trim(), description: primary.description, attachment: files.value.map(file => file.id), plotResults: drafts.value.map(plot => ({ ...plot })), targetAssigneeId: route.assigneeId, targetDeptId: route.deptId } })
    await load(); emit('submitted'); window.dispatchEvent(new Event('workflow-todos-changed'))
    if (flow.value?.currentNode && flow.value.currentNode.nodeKey !== route.nextKey) error.value = '核查已提交，但后端返回的下一节点与预期不同，请核对流程配置。'
    if (flow.value?.currentNode?.nodeKey === 'FINISH' && flow.value.currentNode.assigneeId !== route.assigneeId) error.value = '后端已进入归档，但归档办理人未按首节点办理人分派，请核对后端 FINISH 的接收人处理。'
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '核查提交失败' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="ng-page inspection-page">
    <div v-if="draggingImages" class="image-drop-hint" role="status"><b>松开鼠标，自动上传现场图片</b><span>上传到当前选中的图斑 · 单个文件不超过 10MB</span></div>


    <WorkbenchFeedback :message="[...errors, flowError, error, optionError].filter(Boolean).join('；')" />
    <div class="inspection-layout">
      <aside><section class="ng-card plot-list plot-guide-card"><h3>▣ 待核查图斑（{{ abnormals.length }} 个）</h3><div class="plot-scroll"><button v-for="(spot, index) in abnormals" :key="spot.id" type="button" :class="{ selected: activeId === spot.id }" @click="activeId = spot.id"><span class="radio">{{ activeId === spot.id ? '●' : '○' }}</span><div class="thumb"><img v-if="spot.imageUrl" :src="spot.imageUrl" :alt="spot.title" /><TaskRangeMap v-else :abnormal-points="[spot]" :active-abnormal-id="spot.id" fit-abnormal-points show-dom-imagery /></div><span><b>图斑{{ index + 1 }}</b><span>{{ spot.title }}</span><small>面积：{{ spot.area ?? '—' }} ㎡</small></span></button><p v-if="!abnormals.length">暂无后端图斑</p></div><div class="plot-guide"><h4>ⓘ 填写说明</h4><p>① 选择图斑，填写核查结论及说明。</p><p>② 上传现场照片，填写定位信息。</p><p>③ 全部无问题时进入结案归档；存在问题时进入整改处理。</p></div></section></aside>
      <section class="ng-card inspection-form"><h3>▤ 现场核查填报</h3>
        <div class="summary"><span>任务编号<b>{{ task?.taskNo || '—' }}</b></span><span>当前图斑<b>{{ abnormals.find(spot => spot.id === activeId)?.title || '—' }}</b></span><span>核查人<input v-if="canEdit" v-model="checker" aria-label="核查人" /><b v-else>{{ displayChecker || '—' }}</b></span><span>核查日期<input v-if="canEdit" v-model="checkTime" type="date" aria-label="核查日期" /><b v-else>{{ displayTime || '—' }}</b></span></div>
        <form v-if="active" @submit.prevent="submit"><fieldset :disabled="!canEdit"><h4>◇ 核查结论</h4><div class="conclusions"><label><input v-model="active.result" type="radio" value="PROBLEM" />问题图斑</label><label><input v-model="active.result" type="radio" value="NO_PROBLEM" />无问题图斑</label></div><p class="tip">请逐一填写所有图斑。全部无问题流转至首节点办理人归档；存在问题流转至农田建设股整改。</p>
          <div class="fields"><label><span>* 核查用途</span><select v-model="active.landUse" required><option value="">请选择</option><option v-if="active.landUse && !flatOptions.some(item => item.code === active?.landUse)" :value="active.landUse">{{ active.landUse }}</option><option v-for="item in flatOptions" :key="item.id" :value="item.code">{{ item.code }} / {{ item.name }}</option></select></label><label v-for="field in (['summerCrop','earlyCrop','autumnCrop'] as const)" :key="field"><span>{{ { summerCrop: '夏收作物', earlyCrop: '早稻作物', autumnCrop: '秋收作物' }[field] }}</span><select v-model="active[field]"><option value="">请选择</option><option v-if="active[field] && !flatOptions.some(item => item.code === active?.[field])" :value="active[field]">{{ active[field] }}</option><option v-for="item in flatOptions" :key="item.id" :value="item.code">{{ item.name }}</option></select></label><label v-if="active.result === 'NO_PROBLEM'" class="wide"><span>* 无问题原因</span><textarea v-model="active.noProblemReason" required maxlength="500" /></label><label class="wide"><span>* 核查说明</span><textarea v-model="active.description" required maxlength="500" placeholder="填写现场实际用途及核查依据" /><small>{{ active.description?.length || 0 }}/500</small></label></div>
          <h4>▧ 拍照信息（上传图片）</h4><div class="photo-grid"><article v-for="file in files" :key="file.id"><img v-if="previewUrls[file.id]" :src="previewUrls[file.id]" :alt="file.fileName" /><span v-else class="file-icon">{{ photoFiles.includes(file) ? '▧' : '▤' }}</span><b>{{ file.fileName }}</b><small>{{ file.createTime }}</small><button v-if="canEdit" type="button" @click="removeFile(file.id)">删除</button></article><label class="upload"><span>◎</span><b>上传现场图片</b><small>PNG、SVG、JPG 等图片，可拖入页面上传</small><input type="file" :accept="inspectionImageAccept" multiple @change="upload($event, true)" /></label><label class="upload"><span>♧</span><b>上传附件</b><small>PDF、Word 等文档，单个不超过 10MB</small><input type="file" :accept="inspectionDocumentAccept" multiple @change="upload($event, false)" /></label></div>
          <h4>♧ 现场定位与附加信息</h4><div class="fields location"><label><span>经度</span><input v-model="active.longitude" inputmode="decimal" /></label><label><span>纬度</span><input v-model="active.latitude" inputmode="decimal" /></label><button type="button" @click="locate">获取现场定位</button><label><span>所属村组</span><input v-model="active.village" /></label><label><span>联系电话</span><input v-model="active.phone" type="tel" /></label></div>
          <footer><button type="submit" :disabled="!canEdit">{{ busy ? '正在处理…' : selectedNode?.status === 'COMPLETED' ? '已提交核查结果' : '提交核查结果' }}</button></footer>
        </fieldset></form><p v-else>暂无可核查图斑。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.inspection-page{display:flex;flex-direction:column;overflow:hidden;gap:12px}.notice{margin:0;padding:10px;background:#fff8df;color:#876521;font-size:13px}.error{background:#fff0ed;color:#bc4c40}.inspection-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;flex:1;min-height:0}.inspection-layout aside{display:flex;flex-direction:column;gap:16px;min-height:0}.plot-list{padding:16px;flex:1;min-height:0}.plot-scroll{overflow:auto;min-height:0}.plot-scroll button{display:grid;grid-template-columns:18px 86px minmax(0,1fr);align-items:center;gap:10px;padding:12px;margin:0 0 10px;width:100%;text-align:left;background:#f8fbff;border:1px solid #e0ebf2;border-radius:5px;color:#294a61;cursor:pointer}.plot-scroll button.selected{border-color:#1687ef;background:#eff7ff}.plot-scroll button>span:last-child{display:grid;gap:6px}.radio{color:#1687ef}.thumb{height:70px;overflow:hidden;border-radius:4px}.thumb img{width:100%;height:100%;object-fit:cover}.thumb :deep(.task-range-map){height:100%;min-height:0;pointer-events:none}.thumb :deep(.range-tools),.thumb :deep(.range-area){display:none}.instructions{padding:16px;flex-shrink:0}.instructions p{font-size:12px;line-height:1.8;margin:8px 0;color:#6c8597}.inspection-form{padding:20px;overflow:auto;display:block;min-height:0}.inspection-form h3{margin-bottom:14px}.summary{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;background:#eff7ff;border-radius:5px;padding:12px;gap:14px;font-size:12px}.summary span{display:grid;gap:7px;color:#7190a2}.summary b{color:#244760}.summary input{width:100%;box-sizing:border-box}fieldset{border:0;padding:0;margin:0;min-width:0}h4{margin:20px 0 12px;color:#294a61;font-size:14px}.conclusions{display:flex;gap:22px;font-size:14px}.conclusions label{display:flex;align-items:center;gap:6px}input[type=radio]{accent-color:#1687ef}.tip{padding:10px;background:#eaf5ff;color:#57778c;font-size:12px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px 20px}.fields label{display:grid;grid-template-columns:85px minmax(0,1fr);align-items:start;gap:10px;font-size:13px;color:#607e91}.fields .wide{grid-column:1/-1}.fields label>span{padding-top:8px}.fields small{grid-column:2;text-align:right;color:#8195a6}input,textarea,select{border:1px solid #d9e7f2;border-radius:4px;background:#fbfdff;color:#36556d;padding:8px;font:inherit;box-sizing:border-box;min-width:0;width:100%}input[type=radio]{width:auto}textarea{height:70px;resize:vertical}.photo-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.photo-grid article,.upload{position:relative;border:1px solid #e0ebf2;border-radius:5px;overflow:hidden;display:flex;flex-direction:column;font-size:12px;gap:6px;padding:8px;min-height:132px}.photo-grid article img{height:110px;width:100%;object-fit:cover}.photo-grid b{overflow-wrap:anywhere}.photo-grid small{color:#8195a6}.file-icon{font-size:40px;text-align:center;padding:24px}.upload{border-style:dashed;justify-content:center;align-items:center;background:#fbfdff;cursor:pointer}.upload>span{font-size:30px;color:#7199ac}.upload input{position:absolute;inset:0;opacity:0;cursor:pointer}.photo-grid button{align-self:end;padding:3px 7px;color:#b64b45;background:white;border:1px solid #e1bcb6;border-radius:4px}.location{grid-template-columns:1fr 1fr}.location button{grid-column:1/-1;justify-self:start}button{font:inherit;cursor:pointer}footer{display:flex;justify-content:flex-end;padding-top:20px}footer button{background:#1687ef;color:white;border:0;border-radius:4px;padding:10px 20px}button:disabled{opacity:.55;cursor:default}fieldset:disabled :is(input:not([type=file]),textarea,select){opacity:1;-webkit-text-fill-color:#36556d}fieldset:disabled .upload{opacity:.55;cursor:default}@media(max-width:1000px){.inspection-layout{grid-template-columns:240px minmax(0,1fr)}.photo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.summary{grid-template-columns:1fr 1fr}.fields{grid-template-columns:1fr}.fields .wide{grid-column:auto}}@media(max-width:750px){.inspection-page{overflow:auto}.inspection-layout{display:block}.plot-list{min-height:330px;max-height:450px;margin-bottom:12px}.instructions{display:none}.inspection-form{overflow:visible}}
</style>

<style scoped>
.image-drop-hint{position:fixed;z-index:1200;inset:12px;border:3px dashed #1687ef;border-radius:12px;background:#eaf6fff0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#1676bb;pointer-events:none}
.image-drop-hint b{font-size:24px}.image-drop-hint span{font-size:14px}
</style>
