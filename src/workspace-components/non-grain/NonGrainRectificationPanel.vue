<script setup lang="ts">
import { taskImageryService } from '@/utils/task-imagery'
import WorkbenchFeedback from '@/workspace-components/shared/WorkbenchFeedback.vue'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useBackendTaskData } from '@/workspace-components/shared/use-backend-task'
import { useUserStore } from '@/stores/user'
import { canOperateWorkflowNode } from '@/utils/task-workflow-state'
import { getTaskWorkflow, submitWorkflowNode, uploadWorkflowFiles, deleteWorkflowFile } from '@/api/task-workflow'
import { getMetadataOptions, type MetadataOption } from '@/api/metadata'
import { inspectionImageAccept, inspectionDocumentAccept, isInspectionImage, inspectionFileError } from '@/utils/inspection-files'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import SpotDistributionMap from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import type { ComparisonPeriod } from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import './workspace.scss'

interface RectificationRecord { abnormalId: string; rectificationStatus: string; regionCode: string; elementCode: string; parcelCode: string; area: string; treatmentType: string; restoredArea: string; landUse: string; description: string; attachment: string[] }
const props = defineProps<{ taskId?: string; readonly?: boolean; flowError?: string }>()
const emit = defineEmits<{ submitted: [] }>()
const user = useUserStore()
const { task, flow, selectedNode, abnormals, loading, errors, load } = useBackendTaskData({ get taskId() { return props.taskId }, get readonly() { return props.readonly }, nodeKey: 'rectification-disposal', includeMaterials: false })
const busy = ref(false)
const canEdit = computed(() => !props.readonly && !loading.value && !busy.value && canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || '')) && selectedNode.value?.id === flow.value?.currentNode?.id)
const error = ref('')
const activeId = ref('')
const draft = ref<RectificationRecord[]>([])
const fillDate = ref('')
const previewUrls = ref<Record<string, string>>({})
const options = ref<MetadataOption[]>([])
const optionError = ref('')
const record = computed(() => (selectedNode.value?.resultData || {}) as Record<string, unknown>)
const records = computed(() => {
  if (canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || ''))) return draft.value
  if (Array.isArray(record.value.plotResults)) return record.value.plotResults as RectificationRecord[]
  return abnormals.value.map(spot => ({ ...emptyRecord(spot.id), ...record.value, abnormalId: spot.id, rectificationStatus: record.value.result === 'DONE' ? 'DONE' : '', attachment: Array.isArray(record.value.attachment) ? record.value.attachment.map(String) : [] })) as RectificationRecord[]
})
const active = computed(() => records.value.find(item => item.abnormalId === activeId.value))
const activeSpot = computed(() => abnormals.value.find(spot => spot.id === activeId.value))
const currentImagery = computed(() => {
  const images = task.value?.comparisonImages || []
  return images.find(image => /当前|最新/.test(image.label)) || images[1]
    || (images.length === 1 && !/历史|history|historical/i.test(images[0]!.label) ? images[0] : undefined)
})
const currentPeriod = computed<ComparisonPeriod>(() => ({
  number: 2,
  label: currentImagery.value?.label || '当前影像',
  kind: currentImagery.value?.mapService ? 'map-service' : currentImagery.value?.imageUrl ? 'image' : 'empty',
  mapService: currentImagery.value?.mapService,
  imageUrl: currentImagery.value?.imageUrl,
}))
const files = computed(() => selectedNode.value?.files || [])
const activeFiles = computed(() => files.value.filter(file => active.value?.attachment.includes(file.id)))
const visibleFiles = computed(() => files.value.filter(file => active.value?.attachment.includes(file.id) || !records.value.some(plot => plot.attachment.includes(file.id))))
const afterImage = computed(() => activeFiles.value.find(file => previewUrls.value[file.id] && isInspectionImage(file.fileName)))
const plantingOptions = computed(() => {
  const list: MetadataOption[] = []
  function flatten(items: MetadataOption[], prefix = '') { for (const item of items) { list.push({ ...item, name: prefix + item.name }); if (item.children) flatten(item.children, prefix + item.name + ' / ') } }
  flatten(options.value); return list
})
function emptyRecord(id: string): RectificationRecord { const spot = abnormals.value.find(item => item.id === id); return { abnormalId: id, rectificationStatus: '', regionCode: '', elementCode: '', parcelCode: '', area: spot?.area?.toString() || '', treatmentType: '', restoredArea: '', landUse: '', description: '', attachment: [] } }
let initializedNode = ''
watch(() => selectedNode.value?.id, id => {
  if (!id || initializedNode === `${props.taskId}:${id}`) return
  initializedNode = `${props.taskId}:${id}`
  draft.value = abnormals.value.map(spot => emptyRecord(spot.id))
  activeId.value = abnormals.value[0]?.id || ''
  fillDate.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,10)
  error.value = ''; clearPreviews()
})
getMetadataOptions('PLANT_USE').then(value => { options.value = value }).catch(reason => { optionError.value = reason instanceof Error ? reason.message : '种植用途读取失败' })
function clearPreviews() { Object.values(previewUrls.value).forEach(URL.revokeObjectURL); previewUrls.value = {} }
const dragDepth = ref(0)
function hasFiles(event: DragEvent) { return Array.from(event.dataTransfer?.types || []).includes('Files') }
function dragEnter(event: DragEvent) { if (hasFiles(event)) { event.preventDefault(); dragDepth.value++ } }
function dragOver(event: DragEvent) { if (hasFiles(event)) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = canEdit.value && active.value ? 'copy' : 'none' } }
function dragLeave(event: DragEvent) { if (hasFiles(event)) dragDepth.value = Math.max(0, dragDepth.value - 1) }
function drop(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault(); dragDepth.value = 0
  if (!canEdit.value || !active.value) { error.value = busy.value ? '正在处理文件，请稍后再拖入。' : '当前页面只读或没有选中图斑，无法上传。'; return }
  void uploadPicked(Array.from(event.dataTransfer?.files || []))
}
onMounted(() => { window.addEventListener('dragenter', dragEnter); window.addEventListener('dragover', dragOver); window.addEventListener('dragleave', dragLeave); window.addEventListener('drop', drop) })
onBeforeUnmount(() => { clearPreviews(); window.removeEventListener('dragenter', dragEnter); window.removeEventListener('dragover', dragOver); window.removeEventListener('dragleave', dragLeave); window.removeEventListener('drop', drop) })
async function choose(event: Event, photos: boolean) { const input = event.target as HTMLInputElement; const picked = Array.from(input.files || []); input.value = ''; if (!canEdit.value) return; error.value = inspectionFileError(picked, photos); if (!error.value) await uploadPicked(picked) }
async function uploadPicked(picked: File[]) {
  if (!canEdit.value || !selectedNode.value || !active.value || !picked.length) return
  error.value = inspectionFileError(picked.filter(file => isInspectionImage(file.name)), true) || inspectionFileError(picked.filter(file => !isInspectionImage(file.name)), false)
  if (error.value) return
  const plot = active.value; const nodeId = selectedNode.value.id; const previousIds = new Set(files.value.map(file => file.id))
  busy.value = true
  try {
    await uploadWorkflowFiles(nodeId, picked); await load()
    const added = files.value.filter(file => !previousIds.has(file.id))
    plot.attachment.push(...added.map(file => file.id))
    for (const file of added) { const local = picked.find(item => item.name === file.fileName); if (local && /\.(jpe?g|png|svg|webp|gif|bmp|avif)$/i.test(local.name)) previewUrls.value[file.id] = URL.createObjectURL(local) }
    if (!added.length) error.value = '文件已上传，但详情尚未返回附件记录，请刷新核对。'
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '附件上传失败' }
  finally { busy.value = false }
}
async function removeFile(id: string) {
  if (!canEdit.value) return
  busy.value = true; error.value = ''
  try { await deleteWorkflowFile(id); draft.value.forEach(plot => { plot.attachment = plot.attachment.filter(item => item !== id) }); if (previewUrls.value[id]) URL.revokeObjectURL(previewUrls.value[id]); delete previewUrls.value[id]; await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '附件删除失败' }
  finally { busy.value = false }
}
function toggleAttachment(id: string) {
  if (!canEdit.value || !active.value) return
  active.value.attachment = active.value.attachment.includes(id) ? active.value.attachment.filter(value => value !== id) : [...active.value.attachment, id]
}
function plotStatus(id: string) {
  const saved = records.value.find(plot => plot.abnormalId === id)
  if (selectedNode.value?.status === 'COMPLETED' && (saved?.rectificationStatus === 'DONE' || record.value.result === 'DONE')) return '整改完成'
  return selectedNode.value?.status === 'PROCESSING' ? '整改中' : '待整改'
}
async function submit() {
  if (!canEdit.value || !props.taskId || !selectedNode.value) return
  busy.value = true; error.value = ''
  try {
    if (!draft.value.length) throw new Error('没有可填写的整改图斑。')
    for (const plot of draft.value) {
      if (plot.rectificationStatus !== 'DONE') throw new Error('请完成所有图斑整改后再提交，整改进行中或暂不具备条件不能流转到复核。')
      if (!plot.description.trim() || !plot.landUse || !plot.treatmentType.trim()) throw new Error('请填写每个图斑的治理类型、种植用途和整改说明。')
      if (!plot.attachment.length || plot.attachment.some(id => !files.value.some(file => file.id === id))) throw new Error('每个图斑都需要上传有效的整改证明材料。')
      for (const value of [plot.area, plot.restoredArea]) if (value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('请填写有效的地块面积和复耕复种面积。')
    }
    const current = await getTaskWorkflow(props.taskId)
    if (!current?.currentNode || current.currentNode.id !== selectedNode.value.id || current.currentNode.nodeKey !== 'RECTIFY' || !canOperateWorkflowNode(current.currentNode, String(user.currentUser?.id || ''))) throw new Error('整改节点状态或办理人已变化，请刷新后重试。')
    // wf_node_def: RECTIFY + DONE -> UAV_RECHECK，复核办理人由后端 taskCreator 规则确定。
    await submitWorkflowNode({ nodeInstId: current.currentNode.id, resultData: { result: 'DONE', description: draft.value.map(plot => plot.description.trim()).join('；'), attachment: [...new Set(draft.value.flatMap(plot => plot.attachment))], plotResults: draft.value.map(plot => ({ ...plot, area: Number(plot.area), restoredArea: Number(plot.restoredArea) })), fillDate: fillDate.value, operatorName: user.name } })
    await load(); window.dispatchEvent(new Event('workflow-todos-changed')); emit('submitted')
    if (flow.value?.currentNode?.nodeKey !== 'UAV_RECHECK') error.value = '整改结果已提交，但后端尚未返回无人机复核节点，请刷新核对。'
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '整改提交失败' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="ng-page rectification-page">
    <div v-if="dragDepth > 0 && canEdit" class="drop-hint" role="status"><b>松开鼠标，自动上传整改证明材料</b><span>上传到当前图斑 · 图片或文档 · 单个文件不超过 10MB</span></div>
    <WorkbenchFeedback :message="[...errors, flowError, error, optionError].filter(Boolean).join('；')" />
    <section class="ng-summary ng-summary--compact rectification-summary"><article class="ng-summary-card"><i>单</i><span><small>任务编号</small><b>{{ task?.taskNo || '暂无数据' }}</b></span></article><article class="ng-summary-card"><i>景</i><span><small>所属场景</small><b>{{ task?.sceneName || '暂无数据' }}</b></span></article><article class="ng-summary-card"><i>斑</i><span><small>{{ selectedNode?.status === 'COMPLETED' ? '已整改图斑' : '待整改图斑' }}</small><b>{{ abnormals.length }} 个</b></span></article><article class="ng-summary-card"><i>整</i><span><small>整改要求</small><b>恢复粮食种植条件，提交整改结果</b></span></article></section>
    <div class="rectification-layout">
      <aside><section class="ng-card comparison"><h3>▧ 整改前后对比</h3><p class="spot-info">{{ activeSpot?.title || '请选择图斑' }}　|　面积：{{ activeSpot?.area ?? '—' }} ㎡　|　地块代码：{{ active?.parcelCode || '暂无数据' }}</p><div class="comparison-images"><figure><div class="photo"><SpotDistributionMap v-if="activeSpot && currentPeriod.kind !== 'empty'" :key="`${activeSpot.id}-${currentImagery?.id}`" :spot="activeSpot" :period="currentPeriod" /><span v-else>暂无当前影像</span><b>当前影像／整改前</b></div><figcaption>{{ currentImagery?.label || '暂无当前影像' }}</figcaption></figure><span class="arrow">➜</span><figure><div class="photo"><img v-if="afterImage" :src="previewUrls[afterImage.id]" alt="整改后现场图片" /><span v-else>{{ activeFiles.some(file => isInspectionImage(file.fileName)) ? '整改后图片暂不可预览' : '暂无整改后图片' }}</span><b>整改后</b></div><figcaption>{{ active?.description || '上传整改后现场图片进行对比' }}</figcaption></figure></div></section>
        <section class="ng-card plot-list plot-guide-card"><h3>{{ selectedNode?.status === 'COMPLETED' ? '已整改' : '待整改' }}图斑列表（共{{ abnormals.length }}个）</h3><div class="plot-scroll"><button v-for="(spot,index) in abnormals" :key="spot.id" :class="{ selected: activeId === spot.id }" @click="activeId = spot.id"><div class="thumb"><img v-if="spot.imageUrl" :src="spot.imageUrl" :alt="spot.title" /><TaskRangeMap v-else :abnormal-points="[spot]" :active-abnormal-id="spot.id" fit-abnormal-points :fit-padding="4" show-dom-imagery :imagery-service="taskImageryService(task?.comparisonImages)" /></div><span><b>图斑{{ index+1 }}</b><small>{{ spot.title }}</small></span><span><small>面积</small><b>{{ spot.area ?? '—' }} ㎡</b></span><em :class="{ done: plotStatus(spot.id) === '整改完成' }">● {{ plotStatus(spot.id) }}</em><i>›</i></button><p v-if="!abnormals.length">暂无后端图斑数据</p></div><div class="plot-guide"><h4>ⓘ 整改要求说明</h4><p>1. 清除非粮种植或设施，恢复粮食生产条件。</p><p>2. 据实填写治理类型、面积和种植用途。</p><p>3. 上传整改证明材料，完成后提交复核。</p></div></section>
      </aside>
      <section class="ng-card rectification-form"><h3>✎ 整改结果填报</h3><div class="form-summary"><span>任务编号<b>{{ task?.taskNo || '—' }}</b></span><span>当前图斑<b>{{ activeSpot?.title || '—' }}</b></span><span>填报人<b>{{ selectedNode?.assigneeName || '—' }}</b></span><span>填报日期<b>{{ selectedNode?.status === 'COMPLETED' ? String(record.fillDate || selectedNode.submitTime || '').slice(0,10) || '—' : fillDate }}</b></span></div>
        <form v-if="active" @submit.prevent="submit"><fieldset :disabled="!canEdit"><h4>整改结果</h4><div class="result-options"><label><input v-model="active.rectificationStatus" type="radio" value="DONE" />已完成整改</label><label><input v-model="active.rectificationStatus" type="radio" value="IN_PROGRESS" />整改进行中</label><label><input v-model="active.rectificationStatus" type="radio" value="UNABLE" />暂不具备整改条件</label></div>
          <h4>治理填报</h4><div class="fields"><label><span>区划代码</span><input v-model="active.regionCode" /></label><label><span>要素代码</span><input v-model="active.elementCode" /></label><label><span>地块代码</span><input v-model="active.parcelCode" /></label><label><span>* 地块面积</span><div class="area-input"><input v-model="active.area" type="number" min="0" step="any" required /><small>㎡</small></div></label><label><span>* 治理类型</span><input v-model="active.treatmentType" required placeholder="填写实际治理类型" /></label><label><span>* 复耕复种面积</span><div class="area-input"><input v-model="active.restoredArea" type="number" min="0" step="any" required /><small>㎡</small></div></label><label><span>* 种植用途</span><select v-model="active.landUse" required><option value="">请选择</option><option v-if="active.landUse && !plantingOptions.some(item => item.code === active?.landUse)" :value="active.landUse">{{ active.landUse }}</option><option v-for="item in plantingOptions" :key="item.id" :value="item.code">{{ item.code }} {{ item.name }}</option></select></label><label class="wide"><span>* 备注／整改说明</span><textarea v-model="active.description" required maxlength="500" placeholder="填写整改措施和恢复种植情况" /><small class="counter">{{ active.description?.length || 0 }}/500</small></label></div>
          <h4>♧ 整改证明材料</h4><div class="materials"><article v-for="file in visibleFiles" :key="file.id"><img v-if="previewUrls[file.id]" :src="previewUrls[file.id]" :alt="file.fileName" /><span v-else class="file-symbol">{{ isInspectionImage(file.fileName) ? '▧' : '▤' }}</span><b>{{ file.fileName }}</b><small>{{ file.createTime }}</small><label v-if="canEdit" class="material-association"><input type="checkbox" :checked="active.attachment.includes(file.id)" @change="toggleAttachment(file.id)" />用于当前图斑</label><button v-if="canEdit" type="button" @click="removeFile(file.id)">删除</button></article><label class="upload"><span>＋</span><b>上传整改图片</b><small>PNG、SVG、JPG 等图片</small><input type="file" :accept="inspectionImageAccept" multiple @change="choose($event,true)" /></label><label class="upload"><span>▤</span><b>上传附件</b><small>PDF、Word 等文档</small><input type="file" :accept="inspectionDocumentAccept" multiple @change="choose($event,false)" /></label></div><p class="upload-tip">可将图片、文档拖入此页面，自动上传到当前图斑；单个文件不超过 10MB。</p><footer><button type="submit" :disabled="!canEdit">{{ busy ? '正在处理…' : selectedNode?.status === 'COMPLETED' ? '已提交整改结果' : '提交整改结果' }}</button></footer>
        </fieldset></form><p v-else>暂无可填写的整改图斑。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.rectification-page{display:flex;flex-direction:column;gap:12px;overflow:hidden}.notice{padding:9px 12px;margin:0;background:#fff8df;color:#876521;font-size:12px}.error{background:#fff0ed;color:#bc4c40}.rectification-summary{flex-shrink:0;min-height:72px}.rectification-layout{display:grid;grid-template-columns:minmax(350px,1fr) minmax(0,1fr);gap:16px;min-height:0;flex:1}.rectification-layout aside{display:grid;grid-template-rows:minmax(0,1fr) minmax(0,1fr);gap:12px;min-height:0}.ng-card{padding:14px;min-height:0}h3{font-size:14px!important;margin-bottom:10px!important}.comparison-images{display:grid;grid-template-columns:minmax(0,1fr) 25px minmax(0,1fr);gap:8px;flex:1;min-height:0}.spot-info{font-size:11px;color:#67879a;margin:0 0 8px}.comparison-images figure{margin:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;border-radius:5px;background:#f1f7fb}.photo{position:relative;flex:1;min-height:90px;display:grid;place-items:center;color:#8195a6;font-size:12px;background:#edf3f8;overflow:hidden}.photo img{height:100%;width:100%;object-fit:cover}.photo :deep(.task-range-map){position:absolute;inset:0;height:100%;min-height:0}.photo :deep(.range-area),.photo :deep(.range-tools){display:none}.photo>b{position:absolute;top:6px;left:6px;font-size:10px;color:white;background:#0b6e67b0;border-radius:4px;padding:4px 6px;z-index:500}.comparison-images figcaption{padding:6px;font-size:10px;color:#607e91;min-height:24px;overflow:auto}.arrow{align-self:center;color:#1687ef;font-size:24px}.plot-scroll{overflow:auto;min-height:0;flex:1}.plot-scroll button{display:grid;grid-template-columns:68px 1fr 1fr auto 10px;align-items:center;gap:8px;width:100%;padding:7px;border:1px solid #e0eaf1;border-radius:4px;background:#fbfdff;color:#36556d;font-size:11px;margin-bottom:7px;text-align:left;cursor:pointer}.plot-scroll .selected{border-color:#1687ef;background:#eff7ff}.plot-scroll b,.plot-scroll small{display:block;margin:3px 0}.plot-scroll small{color:#7894a6}.plot-scroll em{color:#ca8b14;font-style:normal;font-size:10px}.plot-scroll em.done{color:#26a671}.plot-scroll i{font-style:normal;color:#1687ef}.thumb{height:46px;width:68px;overflow:hidden;border-radius:4px}.thumb img{height:100%;width:100%;object-fit:cover}.thumb :deep(.task-range-map){min-height:0;height:100%;pointer-events:none}.thumb :deep(.range-area),.thumb :deep(.range-tools){display:none}.requirements{flex-shrink:0;background:#eff7ff;padding:8px 10px;border-radius:4px;margin-top:8px;font-size:10px;color:#607e91}.requirements b{font-size:11px;color:#1687ef}.requirements p{margin:4px 0}.rectification-form{overflow:auto;display:block}.form-summary{display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:10px;background:#eff7ff;padding:12px;border-radius:4px;font-size:10px}.form-summary span{display:grid;gap:6px;color:#7199ac}.form-summary b{color:#294a61;overflow-wrap:anywhere}fieldset{border:0;padding:0;margin:0;min-width:0}h4{font-size:12px;color:#36556d;border-left:3px solid #61aef9;padding-left:6px;margin:13px 0 8px}.result-options{display:flex;flex-wrap:wrap;gap:15px;font-size:12px}.result-options label{display:flex;align-items:center;gap:5px}.result-options input{width:auto;accent-color:#1687ef}.fields{display:grid;grid-template-columns:1fr 1fr;gap:9px 14px}.fields label{display:grid;grid-template-columns:82px minmax(0,1fr);align-items:center;gap:8px;font-size:11px;color:#607e91}.fields .wide{grid-column:1/-1}select,input,textarea{width:100%;box-sizing:border-box;min-width:0;padding:6px 8px;border:1px solid #d9e7f2;border-radius:4px;background:#fbfdff;color:#36556d;font:inherit}textarea{height:60px;resize:vertical}.counter{grid-column:2;text-align:right;color:#8195a6}.area-input{display:flex;align-items:center;border:1px solid #d9e7f2;border-radius:4px}.area-input input{border:0}.area-input small{padding:0 7px}.materials{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.materials article,.upload{position:relative;display:flex;flex-direction:column;gap:5px;min-height:100px;padding:7px;border:1px solid #dce8f0;border-radius:4px;font-size:10px;overflow:hidden}.materials article img{height:80px;width:100%;object-fit:cover}.materials b{overflow-wrap:anywhere}.materials small{color:#8195a6}.file-symbol{font-size:35px;text-align:center;padding:15px}.materials button{align-self:end;border:1px solid #e1bcb6;color:#b64b45;border-radius:3px;background:white;cursor:pointer}.upload{border-style:dashed;align-items:center;justify-content:center;background:#fbfdff;cursor:pointer}.upload>span{font-size:25px;color:#1687ef}.upload input{position:absolute;inset:0;opacity:0;cursor:pointer}.upload-tip{font-size:10px;color:#8195a6}footer{display:flex;justify-content:flex-end;margin-top:12px}footer button{border:0;background:#1687ef;color:white;border-radius:4px;padding:9px 20px;cursor:pointer;font-size:12px}button:disabled{opacity:.6;cursor:default}fieldset:disabled :is(input:not([type=file]),textarea,select){opacity:1;color:#36556d;-webkit-text-fill-color:#36556d}fieldset:disabled .upload{opacity:.55;cursor:default}.drop-hint{position:fixed;z-index:1200;inset:12px;border:3px dashed #1687ef;border-radius:12px;background:#eaf6fff0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;color:#1676bb;pointer-events:none}.drop-hint b{font-size:24px}.drop-hint span{font-size:14px}@media(max-width:1000px){.rectification-layout{grid-template-columns:340px minmax(0,1fr)}.fields{grid-template-columns:1fr}.fields .wide{grid-column:auto}.materials{grid-template-columns:repeat(2,minmax(0,1fr))}.form-summary{grid-template-columns:1fr 1fr}.plot-scroll button{grid-template-columns:50px 1fr auto 8px}.plot-scroll button>span:nth-of-type(2){display:none}.thumb{width:50px}}@media(max-width:750px){.rectification-page{overflow:auto}.rectification-layout{display:block}.rectification-layout aside{display:flex;flex-direction:column;margin-bottom:12px}.comparison{min-height:220px}.plot-list{max-height:340px}.rectification-form{overflow:visible}}
</style>

<style scoped>
.material-association{display:flex;align-items:center;gap:4px;font-size:10px;color:#67879a}
.material-association input{width:auto;accent-color:#1687ef}
.photo :deep(.spot-map){position:absolute;inset:0;width:100%;height:100%;min-height:0}
.photo:first-child>b{left:auto;right:6px;z-index:700}
.photo :deep(.map-top-labels){display:none}
</style>
