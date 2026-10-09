<script setup lang="ts">
import ImageGeoreferenceDialog from '@/workspace-components/shared/ImageGeoreferenceDialog.vue'
import WorkflowAssigneePicker from '@/workspace-components/shared/WorkflowAssigneePicker.vue'
import type { WorkbenchUser } from '@/api/workbench-users'
import { taskImageryService } from '@/utils/task-imagery'
import { readReviewGeoTiff, reviewImageryAccept, reviewImageryFileError, reviewBoundary, reviewShapefile, type ReviewImagery } from '@/utils/review-geotiff'
import WorkbenchFeedback from '@/workspace-components/shared/WorkbenchFeedback.vue'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useBackendTaskData } from '@/workspace-components/shared/use-backend-task'
import { getTaskWorkflow, submitWorkflowNode, uploadWorkflowFiles, deleteWorkflowFile } from '@/api/task-workflow'
import { getMetadataOptions, type MetadataOption } from '@/api/metadata'
import { canOperateWorkflowNode } from '@/utils/task-workflow-state'
import { recheckRoute } from '@/utils/non-grain-recheck'
import { isInspectionImage } from '@/utils/inspection-files'
import SpotDistributionMap from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import type { ComparisonPeriod, SynchronizedMapView } from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import './workspace.scss'

interface ReviewRecord { abnormalId: string; result: string; restoration: string; restoredArea: string; landUse: string; grainCondition: string; rectifiedStatus: string; description: string; attachment: string[]; reviewImageId: string; reviewImagery?: ReviewImagery }
const props = defineProps<{ taskId?: string; readonly?: boolean; flowError?: string }>()
const emit = defineEmits<{ submitted: [] }>()
const router = useRouter()
const user = useUserStore()
const { task, flow, selectedNode, abnormals, loading, errors, load } = useBackendTaskData({ get taskId() { return props.taskId }, get readonly() { return props.readonly }, nodeKey: 'drone-review', includeMaterials: false })
const busy = ref(false)
const canEdit = computed(() => !props.readonly && !busy.value && !loading.value && canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || '')) && flow.value?.currentNode?.id === selectedNode.value?.id)
const recipient = ref<WorkbenchUser>()
const nextNode = computed(() => flow.value?.timeline.find(node => String(node.prevNodeInstId || '') === selectedNode.value?.id))
const dispatchBranch = computed(() => records.value.some(plot => plot.result === 'PROBLEM') ? 'RECTIFY' : 'FINISH')
const preferredRecipientIds = computed(() => [[...(flow.value?.timeline || [])].reverse().find(node => node.nodeKey === (dispatchBranch.value === 'RECTIFY' ? 'RECTIFY' : 'REVIEW_CITY') && node.status === 'COMPLETED')?.assigneeId || ''])
const activeId = ref('')
const draft = ref<ReviewRecord[]>([])
const record = computed(() => (selectedNode.value?.resultData || {}) as Record<string, unknown>)
const records = computed<ReviewRecord[]>(() => {
  if (canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || ''))) return draft.value
  const saved = record.value.plotResults
  if (Array.isArray(saved)) return saved.map(item => ({ ...emptyRecord(String(item.abnormalId)), ...item, abnormalId: String(item.abnormalId), attachment: Array.isArray(item.attachment) ? item.attachment.map(String) : [] }))
  return abnormals.value.map(spot => ({ ...emptyRecord(spot.id), ...record.value, abnormalId: spot.id, attachment: Array.isArray(record.value.attachment) ? record.value.attachment.map(String) : [] })) as ReviewRecord[]
})
watch(dispatchBranch, () => { recipient.value = undefined })
const active = computed(() => records.value.find(item => item.abnormalId === activeId.value))
const activeSpot = computed(() => abnormals.value.find(item => item.id === activeId.value))
const error = ref('')
const reviewDate = ref('')
const options = ref<MetadataOption[]>([])
const optionError = ref('')
const view = ref<SynchronizedMapView>()
const previewUrls = ref<Record<string, string>>({})
const files = computed(() => selectedNode.value?.files || [])
const visibleFiles = computed(() => files.value.filter(file => active.value?.attachment.includes(file.id) || !records.value.some(plot => plot.attachment.includes(file.id))))
const reviewSpot = computed(() => activeSpot.value && ({ ...activeSpot.value, boundaryGeoJson: active.value?.reviewImagery?.boundary || activeSpot.value.boundaryGeoJson }))
const fullscreen = ref(false)
const pendingPhoto = ref<{ file: File; plotId: string; nodeId: string }>()
function photoRegistered(value: { file: File; imagery: ReviewImagery }) {
  const photo = pendingPhoto.value
  if (!photo || !canEdit.value || photo.nodeId !== selectedNode.value?.id || photo.plotId !== activeId.value) { pendingPhoto.value = undefined; error.value = '办理节点或图斑已变化，请重新选择影像。'; return }
  pendingImagery.value = { ...value, plotId: photo.plotId, nodeId: photo.nodeId }; pendingPhoto.value = undefined
  drawPoints.value = []; drawingFinished.value = false; drawingError.value = ''
}
const pendingImagery = ref<{ file: File; imagery: ReviewImagery; plotId: string; nodeId: string }>()
const drawPoints = ref<[number, number][]>([])
const drawingFinished = ref(false)
const drawingError = ref('')
const drawingPeriod = computed<ComparisonPeriod>(() => ({ number: 3, label: '绘制复核图斑', kind: 'image', imageUrl: pendingImagery.value?.imagery.previewDataUrl, bounds: pendingImagery.value?.imagery.bounds }))
const sourceImages = computed(() => {
  const images = (task.value?.comparisonImages || []).filter(image => image.mapService && Number(image.mapService.status) === 1)
  return [images.length > 1 ? images[0] : undefined, images[images.length - 1]]
})
const periods = computed<ComparisonPeriod[]>(() => sourceImages.value.map((image,index) => ({ number: index + 1, label: image?.label || (index ? '整改前遥感影像' : '历史影像'), kind: image?.mapService ? 'map-service' : 'empty', mapService: image?.mapService })))
const thirdPeriod = computed<ComparisonPeriod>(() => ({ number: 3, label: '无人机复核影像', kind: active.value?.reviewImagery ? 'image' : 'empty', imageUrl: active.value?.reviewImagery?.previewDataUrl, bounds: active.value?.reviewImagery?.bounds }))
const plantingOptions = computed(() => {
  const list: MetadataOption[] = []
  function flatten(items: MetadataOption[], prefix = '') { for (const item of items) { list.push({ ...item, name: prefix + item.name }); if (item.children) flatten(item.children, prefix + item.name + ' / ') } }
  flatten(options.value); return list
})
function emptyRecord(id: string): ReviewRecord { return { abnormalId: id, result: '', restoration: '', restoredArea: '', landUse: '', grainCondition: '', rectifiedStatus: '', description: '', attachment: [], reviewImageId: '' } }
let initializedNode = ''
watch(() => selectedNode.value?.id, id => {
  if (!id || initializedNode === `${props.taskId}:${id}`) return
  initializedNode = `${props.taskId}:${id}`
  draft.value = abnormals.value.map(spot => emptyRecord(spot.id)); activeId.value = abnormals.value[0]?.id || ''
  reviewDate.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,10)
  error.value = ''; view.value = undefined; clearPreviews()
})
watch(activeId, () => { view.value = undefined })
getMetadataOptions('PLANT_USE').then(value => { options.value = value }).catch(reason => { optionError.value = reason instanceof Error ? reason.message : '用途字典读取失败' })
function clearPreviews() { Object.values(previewUrls.value).forEach(URL.revokeObjectURL); previewUrls.value = {} }
function goFlightPlanning() { void router.push({ name: 'uav-tasks', params: { tab: 'plan' } }) }
const dragDepth = ref(0)
function hasFiles(event: DragEvent) { return Array.from(event.dataTransfer?.types || []).includes('Files') }
function dragEnter(event: DragEvent) { if (hasFiles(event)) { event.preventDefault(); dragDepth.value++ } }
function dragOver(event: DragEvent) { if (hasFiles(event)) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = canEdit.value && active.value ? 'copy' : 'none' } }
function dragLeave(event: DragEvent) { if (hasFiles(event)) dragDepth.value = Math.max(0,dragDepth.value - 1) }
function drop(event: DragEvent) { if (!hasFiles(event)) return; event.preventDefault(); dragDepth.value = 0; if (!canEdit.value || !active.value) { error.value = busy.value ? '正在处理文件，请稍后再拖入。' : '当前页面只读或没有选中图斑，无法上传。'; return }; void uploadPicked(Array.from(event.dataTransfer?.files || [])) }
onMounted(() => { window.addEventListener('dragenter',dragEnter); window.addEventListener('dragover',dragOver); window.addEventListener('dragleave',dragLeave); window.addEventListener('drop',drop) })
onBeforeUnmount(() => { clearPreviews(); window.removeEventListener('dragenter',dragEnter); window.removeEventListener('dragover',dragOver); window.removeEventListener('dragleave',dragLeave); window.removeEventListener('drop',drop) })
async function choose(event: Event) { const input = event.target as HTMLInputElement; const picked = Array.from(input.files || []); input.value = ''; if (picked.length) await uploadPicked(picked) }
async function uploadPicked(picked: File[]) {
  if (!canEdit.value || !selectedNode.value || !active.value || !picked.length || pendingImagery.value || pendingPhoto.value) return
  error.value = reviewImageryFileError(picked)
  if (error.value) return
  const plotId = active.value.abnormalId, nodeId = selectedNode.value.id
  busy.value = true
  try {
    if (/\.(jpe?g|png)$/i.test(picked[0]!.name)) { pendingPhoto.value = { file: picked[0]!, plotId, nodeId }; return }
    const imagery = await readReviewGeoTiff(picked[0]!)
    if (selectedNode.value?.id !== nodeId || activeId.value !== plotId) throw new Error('当前图斑已切换，请重新选择影像。')
    pendingImagery.value = { file: picked[0]!, imagery, plotId, nodeId }
    drawPoints.value = []; drawingFinished.value = false; drawingError.value = ''
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '影像解析失败' }
  finally { busy.value = false }
}
function drawPoint(_period: number, point: [number, number]) { if (!drawingFinished.value) drawPoints.value.push(point) }
function finishDrawing() {
  try { reviewBoundary(drawPoints.value, pendingImagery.value!.imagery.bounds); drawingFinished.value = true; drawingError.value = '' }
  catch (reason) { drawingError.value = reason instanceof Error ? reason.message : '绘制边界无效' }
}
async function downloadPendingFile(shape: boolean) {
  const pending = pendingImagery.value
  if (!pending || busy.value) return
  try {
    const file = shape ? await reviewShapefile(reviewBoundary(drawPoints.value, pending.imagery.bounds), pending.plotId) : pending.file
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url; link.download = file.name; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (reason) { drawingError.value = reason instanceof Error ? reason.message : '文件生成失败' }
}
async function confirmImagery() {
  if (!canEdit.value || !pendingImagery.value || !drawingFinished.value) return
  const pending = pendingImagery.value
  const plot = draft.value.find(item => item.abnormalId === pending.plotId)
  if (!plot || selectedNode.value?.id !== pending.nodeId) { drawingError.value = '办理节点已变化，请关闭并刷新后重试。'; return }
  busy.value = true; drawingError.value = ''
  try {
    const boundary = reviewBoundary(drawPoints.value, pending.imagery.bounds)
    const prefix = pending.plotId + '_' + Date.now()
    const original = new File([pending.file], prefix + '_' + pending.file.name, { type: pending.file.type || 'image/tiff' })
    const shape = await reviewShapefile(boundary, prefix)
    await uploadWorkflowFiles(pending.nodeId, [original, shape]); await load()
    const imageFile = files.value.find(file => file.fileName === original.name)
    const shapeFile = files.value.find(file => file.fileName === shape.name)
    if (!imageFile || !shapeFile) throw new Error('已上传，但后端未返回完整附件记录，请刷新核对。')
    plot.reviewImageId = imageFile.id
    plot.reviewImagery = { ...pending.imagery, boundary, boundaryFileId: shapeFile.id }
    plot.attachment.push(imageFile.id, shapeFile.id)
    pendingImagery.value = undefined; view.value = undefined
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '影像上传失败'
    drawingError.value = /不支持.*文件类型.*(tif|zip)/i.test(message)
      ? `后端节点附件接口拒绝了文件格式（${message}）。配准影像和绘制边界仍保留，可下载暂存。请后端在 app.biz.workflow 文件白名单中允许 tif、tiff、zip，并核对大小上限。`
      : message
  }
  finally { busy.value = false }
}
function exitFullscreen(event: KeyboardEvent) { if (event.key === 'Escape') { fullscreen.value = false; if (!busy.value) { pendingImagery.value = undefined; pendingPhoto.value = undefined } } }
watch(fullscreen, (enabled, _, onCleanup) => { if (enabled) { const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; onCleanup(() => { document.body.style.overflow = previous }) } })
onMounted(() => window.addEventListener('keydown', exitFullscreen))
onBeforeUnmount(() => window.removeEventListener('keydown', exitFullscreen))
function toggleAttachment(id: string, checked: boolean) {
  if (!canEdit.value || !active.value) return
  if (checked && !active.value.attachment.includes(id)) active.value.attachment.push(id)
  if (!checked) {
    active.value.attachment = active.value.attachment.filter(value => value !== id)
    if (active.value.reviewImageId === id || active.value.reviewImagery?.boundaryFileId === id) { active.value.reviewImageId = ''; active.value.reviewImagery = undefined }
  }
}
async function removeFile(id: string) {
  if (!canEdit.value) return
  busy.value = true; error.value = ''
  try { await deleteWorkflowFile(id); draft.value.forEach(plot => { plot.attachment = plot.attachment.filter(value => value !== id); if (plot.reviewImageId === id || plot.reviewImagery?.boundaryFileId === id) { plot.reviewImageId = ''; plot.reviewImagery = undefined } }); if (previewUrls.value[id]) URL.revokeObjectURL(previewUrls.value[id]); delete previewUrls.value[id]; await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '删除失败' }
  finally { busy.value = false }
}
async function submit(returnToRectify = false) {
  if (!canEdit.value || !props.taskId || !selectedNode.value) return
  busy.value = true; error.value = ''
  try {
    const current = await getTaskWorkflow(props.taskId)
    if (!current?.currentNode || current.currentNode.id !== selectedNode.value.id || current.currentNode.nodeKey !== 'UAV_RECHECK' || !canOperateWorkflowNode(current.currentNode,String(user.currentUser?.id || ''))) throw new Error('复核节点状态或办理人已变化，请刷新后重试。')
    if (!recipient.value) throw new Error('请选择下一节点办理人。')
    const route = recheckRoute(draft.value.map(plot => plot.result),current, { assigneeId: recipient.value.id, deptId: recipient.value.deptId })
    if (returnToRectify && route.result !== 'PROBLEM') throw new Error('请选择至少一个“整改不到位”的图斑并填写说明后，再退回整改。')
    for (const plot of draft.value) {
      if (!plot.description.trim() || !plot.landUse || !plot.grainCondition || !plot.rectifiedStatus) throw new Error('请填写每个图斑的种植用途、粮食生产条件、整治后状态和复核说明。')
      if (plot.result === 'NO_PROBLEM' && (plot.grainCondition !== 'YES' || !plot.restoration || plot.restoredArea === '' || !Number.isFinite(Number(plot.restoredArea)) || Number(plot.restoredArea) < 0)) throw new Error('完成治理需要确认已恢复粮食生产条件，并填写复耕情况和有效面积。')
    }
    await submitWorkflowNode({ nodeInstId: current.currentNode.id, targetAssigneeId: route.assigneeId, targetDeptId: route.deptId, resultData: { targetAssigneeId: recipient.value.id, targetDeptId: recipient.value.deptId, targetAssigneeName: recipient.value.realName || recipient.value.nickname || recipient.value.username, targetDeptName: recipient.value.deptName, result: route.result, description: draft.value.map(plot => plot.description.trim()).join('；'), attachment: [...new Set(draft.value.flatMap(plot => plot.attachment))], plotResults: draft.value.map(plot => ({ ...plot, restoredArea: plot.restoredArea === '' ? null : Number(plot.restoredArea) })), reviewDate: reviewDate.value, reviewer: user.name } })
    await load(); window.dispatchEvent(new Event('workflow-todos-changed')); emit('submitted')
    if (flow.value?.currentNode?.nodeKey !== route.nextKey) error.value = '复核已提交，但后端尚未返回预期下一节点，请刷新核对。'
    if (flow.value?.currentNode?.nodeKey === route.nextKey && flow.value.currentNode.assigneeId !== route.assigneeId) error.value = '结果已提交，但后端未分派给所选办理人，请核对节点接收人配置。'
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '复核提交失败' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="ng-page drone-review-page"><div v-if="dragDepth > 0 && canEdit" class="drop-hint" role="status"><b>松开鼠标，上传无人机复核材料</b><span>JPG / PNG 可地理配准 · GeoTIFF 可直接绘制 · 单个不超过 100MB</span></div><WorkbenchFeedback :message="[...errors,flowError,error,optionError].filter(Boolean).join('；')" />
    <section class="ng-summary ng-summary--compact drone-summary"><article class="ng-summary-card"><i>单</i><span><small>任务编号</small><b>{{ task?.taskNo || '暂无数据' }}</b></span></article><article class="ng-summary-card"><i>景</i><span><small>所属场景</small><b>{{ task?.sceneName || '暂无数据' }}</b></span></article><article class="ng-summary-card"><i>斑</i><span><small>{{ selectedNode?.status === 'COMPLETED' ? '已复核图斑' : '待复核图斑' }}</small><b>{{ abnormals.length }} 个</b></span></article><article class="ng-summary-card"><i>核</i><span><small>复核目标</small><b>核实整改成效，确认是否完成治理</b></span></article></section>
    <div class="review-layout"><aside><div v-if="fullscreen" class="comparison-placeholder" /><Teleport to="body" :disabled="!fullscreen"><section class="ng-card comparison" :class="{ fullscreen }" :role="fullscreen ? 'dialog' : undefined" :aria-modal="fullscreen || undefined"><h3>✣ 无人机复核对比<button type="button" class="fullscreen-toggle" @click="fullscreen = !fullscreen">{{ fullscreen ? '退出全屏' : '全屏展示' }}</button></h3><div class="three-images"><figure v-for="(period,index) in periods" :key="index"><header><b>{{ index ? '整改前遥感影像' : '历史影像' }}</b></header><div class="image-window"><SpotDistributionMap v-if="activeSpot && period.kind !== 'empty'" :key="`${activeSpot.id}-${period.mapService?.id || period.imageUrl}`" :spot="activeSpot" :period="period" :synchronized-view="view" @view-change="view = $event" /><span v-else>{{ index ? '暂无整改前影像' : '暂无历史影像' }}</span></div><figcaption>{{ sourceImages[index]?.label || '暂无影像记录' }}</figcaption></figure><figure><header><b>无人机复核影像</b></header><div class="image-window"><SpotDistributionMap v-if="thirdPeriod.kind === 'image'" :key="active?.reviewImageId" :period="thirdPeriod" :spot="reviewSpot" :synchronized-view="view" @view-change="view = $event" /><div v-else class="upload-empty"><span>{{ active?.reviewImageId ? '已上传影像暂不可预览' : '上传 JPG / PNG 或 GeoTIFF' }}</span><label v-if="canEdit" class="choose-image">上传复核影像<input type="file" :accept="reviewImageryAccept" @change="choose($event)" /></label></div></div><figcaption>{{ files.find(file => file.id === active?.reviewImageId)?.fileName || '上传影像，地理配准后绘制复核边界' }}</figcaption></figure></div><div class="flight-link"><span>进入计划起飞后，请选择“一键起飞”</span><button type="button" @click="goFlightPlanning">前往飞行作业 · 一键起飞 ↗</button></div></section></Teleport>
      <section class="ng-card plots plot-guide-card"><h3>{{ selectedNode?.status === 'COMPLETED' ? '已复核' : '待复核' }}图斑列表（共{{ abnormals.length }}个）</h3><div class="plot-scroll"><button v-for="(spot,index) in abnormals" :key="spot.id" :class="{ selected: activeId === spot.id }" @click="activeId = spot.id"><span class="radio">{{ activeId === spot.id ? '●' : '○' }}</span><div class="thumb"><img v-if="spot.imageUrl" :src="spot.imageUrl" :alt="spot.title" /><TaskRangeMap v-else :abnormal-points="[spot]" :active-abnormal-id="spot.id" fit-abnormal-points :fit-padding="4" show-dom-imagery :imagery-service="taskImageryService(task?.comparisonImages)" /></div><span><b>图斑{{ index+1 }}</b><small>{{ spot.title }}</small></span><b>{{ spot.area ?? '—' }} ㎡</b><em>{{ selectedNode?.status === 'COMPLETED' ? '已复核' : '待复核' }}</em></button><p v-if="!abnormals.length">暂无后端图斑数据</p></div><div class="plot-guide"><h4>▤ 复核说明</h4><p>1. 对比历史、整改前和新上传的无人机复核影像。</p><p>2. 核实粮食生产条件和当前种植用途。</p><p>3. 完成治理进入归档；整改不到位进入整改处置，原办理人优先显示。</p></div></section></aside>
      <section class="ng-card review-form"><h3>▤ 复核结果填报</h3><div class="form-summary"><span>任务编号<b>{{ task?.taskNo || '—' }}</b></span><span>当前图斑<b>{{ activeSpot?.title || '—' }}</b></span><span>复核人<b>{{ selectedNode?.assigneeName || '—' }}</b></span><span>复核日期<b>{{ selectedNode?.status === 'COMPLETED' ? String(record.reviewDate || selectedNode.submitTime || '').slice(0,10) || '—' : reviewDate }}</b></span></div><form v-if="active" @submit.prevent="submit()"><fieldset :disabled="!canEdit"><h4>✓ 复核结论</h4><div class="conclusions"><label :class="{ chosen: active.result === 'NO_PROBLEM' }"><input v-model="active.result" type="radio" value="NO_PROBLEM" /><span><b>完成治理</b><small>已完成整改，恢复粮食生产条件</small></span></label><label :class="{ chosen: active.result === 'PROBLEM' }"><input v-model="active.result" type="radio" value="PROBLEM" /><span><b>整改不到位</b><small>未完成整改或仍存在问题</small></span></label></div><p class="tip">复核未通过时进入整改处置，原整改办理人优先显示，可选择其他用户。</p><h4>♧ 复耕复种信息</h4><div class="fields"><label><span>复耕复种情况</span><select v-model="active.restoration"><option value="">请选择</option><option value="RESTORED">已完成复耕复种</option><option value="PARTIAL">部分完成复耕复种</option><option value="NOT_RESTORED">未复耕复种</option></select></label><label><span>复耕面积</span><div class="area"><input v-model="active.restoredArea" type="number" min="0" step="any" /><small>㎡</small></div></label><label><span>* 当前种植用途</span><select v-model="active.landUse" required><option value="">请选择</option><option v-if="active.landUse && !plantingOptions.some(item => item.code === active?.landUse)" :value="active.landUse">{{ active.landUse }}</option><option v-for="item in plantingOptions" :key="item.id" :value="item.code">{{ item.code }} {{ item.name }}</option></select></label><label><span>* 恢复粮食生产条件</span><select v-model="active.grainCondition" required><option value="">请选择</option><option value="YES">是</option><option value="NO">否</option></select></label><label><span>* 整治后状态</span><select v-model="active.rectifiedStatus" required><option value="">请选择</option><option value="RESTORED">已恢复耕作</option><option value="IN_PROGRESS">整改中</option><option value="NOT_RESTORED">未恢复耕作</option></select></label><label class="wide"><span>* 复核说明</span><textarea v-model="active.description" required maxlength="500" placeholder="结合影像和现场依据填写复核说明" /></label></div><h4>▧ 复核影像材料</h4><div class="materials"><article v-for="file in visibleFiles" :key="file.id"><img v-if="(file.id === active.reviewImageId && active.reviewImagery?.previewDataUrl) || previewUrls[file.id]" :src="file.id === active.reviewImageId ? active.reviewImagery?.previewDataUrl : previewUrls[file.id]" :alt="file.fileName" /><span v-else class="file-symbol">{{ isInspectionImage(file.fileName) ? '▧' : '▤' }}</span><b>{{ file.fileName }}</b><small>{{ file.createTime }}</small><label v-if="canEdit" class="attachment-choice"><input type="checkbox" :checked="active.attachment.includes(file.id)" @change="toggleAttachment(file.id,($event.target as HTMLInputElement).checked)" />用于当前图斑</label><button v-if="canEdit" type="button" @click="removeFile(file.id)">删除</button></article><label class="upload"><span>＋</span><b>上传复核影像</b><small>JPG / PNG 地理配准，或 GeoTIFF</small><input type="file" :accept="reviewImageryAccept" @change="choose($event)" /></label></div><p class="tip">可拖入 JPG / PNG，选取控制点配准后绘制图斑；已有 GeoTIFF 可直接绘制。完成后上传 GeoTIFF 和 SHP 边界，单个影像不超过 100MB。</p><WorkflowAssigneePicker v-model="recipient" :dept-id="task?.deptId || selectedNode?.deptId" :node-id="selectedNode?.id" :preferred-ids="preferredRecipientIds" :preferred-usernames="dispatchBranch === 'RECTIFY' ? ['ntjsg'] : ['nyncKZ']" :readonly="!canEdit" :saved-name="String(record.targetAssigneeName || nextNode?.assigneeName || '')" :label="dispatchBranch === 'RECTIFY' ? '退回整改办理人' : '结案归档办理人'" :key="dispatchBranch" /><footer><button type="button" class="return" :disabled="!canEdit" @click="submit(true)">↶ 退回继续整改</button><button type="submit" :disabled="!canEdit">{{ busy ? '正在处理…' : selectedNode?.status === 'COMPLETED' ? '已完成复核' : '✓ 确认复核' }}</button></footer></fieldset></form><p v-else>暂无可复核图斑。</p></section>
    </div>
<ImageGeoreferenceDialog v-if="pendingPhoto" :file="pendingPhoto.file" @cancel="pendingPhoto = undefined" @ready="photoRegistered" />
<Teleport to="body"><div v-if="pendingImagery" class="drawing-backdrop"><section class="drawing-dialog" role="dialog" aria-modal="true" aria-label="绘制复核图斑"><header><b>绘制复核图斑 · {{ pendingImagery.file.name }}</b><button :disabled="busy" @click="pendingImagery = undefined">取消</button></header><p>在影像内依次点击至少三个点，右键完成绘制；确认后上传 GeoTIFF 和真实 SHP 边界。</p><SpotDistributionMap :key="pendingImagery.file.name" :period="drawingPeriod" :drawing-mode="drawingFinished ? 'preview' : 'active'" :draft-coordinates="drawPoints" @draw-point="drawPoint" @finish-drawing="finishDrawing" /><p v-if="drawingError" role="alert">{{ drawingError }}</p><footer><button :disabled="busy" @click="downloadPendingFile(false)">下载影像</button><button :disabled="busy || !drawingFinished" @click="downloadPendingFile(true)">下载 SHP</button><button :disabled="busy" @click="drawPoints = []; drawingFinished = false">重新绘制</button><button :disabled="busy || drawPoints.length < 3" @click="finishDrawing">完成绘制</button><button :disabled="busy || !drawingFinished" @click="confirmImagery">{{ busy ? '正在上传…' : '确认并上传' }}</button></footer></section></div></Teleport>
  </div>
</template>

<style scoped>
.drone-review-page{display:flex;flex-direction:column;gap:12px;overflow:hidden}.notice{margin:0;padding:9px 12px;background:#fff8df;color:#876521;font-size:12px}.error{background:#fff0ed;color:#bc4c40}.drone-summary{flex-shrink:0;min-height:72px}.review-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(420px,1fr);gap:16px;min-height:0;flex:1}.review-layout aside{display:grid;grid-template-rows:minmax(300px,1.2fr) minmax(240px,1fr);gap:12px;min-height:0;overflow:auto}.ng-card{padding:14px;min-height:0}h3{font-size:14px!important;margin-bottom:10px!important}.three-images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;flex:1;min-height:0}.three-images figure{display:flex;flex-direction:column;margin:0;min-height:0;border-radius:5px;overflow:hidden;background:#f0f8ff}.three-images header{padding:7px;color:#1687ef;font-size:11px;flex-shrink:0}.image-window{position:relative;flex:1;min-height:100px;display:grid;place-items:center;background:#eaf0f5;color:#8195a6;font-size:11px;text-align:center}.image-window :deep(.spot-map){position:absolute;inset:0;width:100%;height:100%;min-height:0}.image-window :deep(.map-top-labels){display:none}.three-images figcaption{padding:7px;font-size:10px;color:#607e91;flex-shrink:0;min-height:25px;overflow-wrap:anywhere}.upload-empty{display:grid;gap:8px;justify-items:center;padding:8px}.choose-image{position:relative;border:1px solid #1687ef;padding:6px 10px;border-radius:4px;color:#1687ef;background:white;overflow:hidden;cursor:pointer}.choose-image input{position:absolute;inset:0;opacity:0;cursor:pointer}.flight-link{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:#7199ac;margin-top:8px;flex-shrink:0}.flight-link button{border:1px solid #a8ceeb;border-radius:4px;color:#1687ef;padding:5px 8px;background:white;cursor:pointer}.plot-scroll{min-height:0;overflow:auto;flex:1}.plot-scroll button{display:grid;grid-template-columns:15px 62px 1fr auto auto;align-items:center;gap:9px;width:100%;padding:8px;border:1px solid #dce8f0;border-radius:4px;background:#fbfdff;color:#36556d;font-size:11px;margin-bottom:7px;text-align:left;cursor:pointer}.plot-scroll button.selected{background:#eff7ff;border-color:#1687ef}.plot-scroll b,.plot-scroll small{display:block;margin:3px 0}.plot-scroll small{color:#8195a6}.radio{color:#1687ef}.plot-scroll em{font-style:normal;color:#c18a2b;background:#fff4df;font-size:10px;border-radius:12px;padding:4px 7px}.thumb{width:62px;height:43px;overflow:hidden;border-radius:4px}.thumb img{height:100%;width:100%;object-fit:cover}.thumb :deep(.task-range-map){min-height:0;height:100%;pointer-events:none}.thumb :deep(.range-area),.thumb :deep(.range-tools){display:none}.help p{font-size:10px;color:#67879a;margin:5px 0;line-height:1.6}.review-form{display:block;overflow:auto}.form-summary{display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:8px;background:#eff7ff;padding:12px;border-radius:4px;font-size:10px}.form-summary span{display:grid;gap:6px;color:#7199ac}.form-summary b{color:#294a61;overflow-wrap:anywhere}fieldset{border:0;padding:0;margin:0;min-width:0}h4{font-size:12px;color:#36556d;margin:16px 0 10px}.conclusions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.conclusions label{display:flex;align-items:center;gap:8px;border:1px solid #dce8f0;border-radius:4px;padding:12px}.conclusions label.chosen{background:#eff7ff;border-color:#1687ef}.conclusions span{display:grid;gap:5px}.conclusions b{font-size:12px;color:#36556d}.conclusions small{font-size:10px;color:#8195a6}.conclusions input{width:auto;accent-color:#1687ef}.tip{color:#8195a6;font-size:10px;line-height:1.6}.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}.fields label{display:grid;grid-template-columns:85px minmax(0,1fr);gap:8px;align-items:center;font-size:11px;color:#607e91}.fields .wide{grid-column:1/-1}select,input,textarea{width:100%;box-sizing:border-box;min-width:0;padding:6px 8px;border:1px solid #d9e7f2;border-radius:4px;background:#fbfdff;color:#36556d;font:inherit}textarea{height:65px;resize:vertical}.area{display:flex;align-items:center;border:1px solid #d9e7f2;border-radius:4px}.area input{border:0}.area small{padding:0 7px}.materials{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.materials article,.upload{position:relative;display:flex;flex-direction:column;gap:5px;min-height:100px;padding:7px;border:1px solid #dce8f0;border-radius:4px;font-size:10px;overflow:hidden}.materials article img{height:80px;width:100%;object-fit:cover}.attachment-choice{display:flex;align-items:center;gap:5px}.attachment-choice input{width:auto}.materials b{overflow-wrap:anywhere}.materials small{color:#8195a6}.file-symbol{font-size:35px;text-align:center;padding:15px}.materials button{align-self:end;border:1px solid #e1bcb6;color:#b64b45;border-radius:3px;background:white;cursor:pointer}.upload{border-style:dashed;align-items:center;justify-content:center;background:#fbfdff;cursor:pointer}.upload>span{font-size:25px;color:#1687ef}.upload input{position:absolute;inset:0;opacity:0;cursor:pointer}footer{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}footer button{border:1px solid #1687ef;background:#1687ef;color:white;border-radius:4px;padding:9px 18px;cursor:pointer;font-size:12px}footer .return{background:white;border-color:#ed6e67;color:#da514a}button:disabled{opacity:.6;cursor:default}fieldset:disabled :is(input:not([type=file]),textarea,select){opacity:1;color:#36556d;-webkit-text-fill-color:#36556d}.drop-hint{position:fixed;z-index:1200;inset:12px;border:3px dashed #1687ef;border-radius:12px;background:#eaf6fff0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;color:#1676bb;pointer-events:none}.drop-hint b{font-size:24px}.drop-hint span{font-size:14px}@media(max-width:1000px){.review-layout{grid-template-columns:minmax(0,1.3fr) minmax(330px,1fr)}.fields{grid-template-columns:1fr}.fields .wide{grid-column:auto}.form-summary{grid-template-columns:1fr 1fr}.materials{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:750px){.drone-review-page{overflow:auto}.review-layout{display:block}.review-layout aside{display:flex;flex-direction:column;margin-bottom:12px}.comparison{min-height:270px}.plots{max-height:300px}.review-form{overflow:visible}}
</style>

<style scoped>
.comparison h3{display:flex;align-items:center;justify-content:space-between}.fullscreen-toggle{border:1px solid #a8ceeb;border-radius:4px;padding:5px 10px;background:white;color:#1687ef;cursor:pointer}.comparison.fullscreen{position:fixed;inset:0;z-index:1500;background:#f5faff;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;border-radius:0;padding:18px}.comparison.fullscreen .three-images{flex:1;min-height:0}.comparison.fullscreen .image-window{min-height:0}.comparison-placeholder{min-height:300px}.drawing-backdrop{position:fixed;z-index:1700;inset:0;background:#062c45bb;display:grid;place-items:center;padding:20px}.drawing-dialog{width:min(1100px,95vw);height:min(800px,90dvh);box-sizing:border-box;padding:18px;border-radius:8px;background:white;display:flex;flex-direction:column;gap:12px}.drawing-dialog>header{display:flex;justify-content:space-between;align-items:center}.drawing-dialog>p{margin:0;color:#607e91;font-size:12px}.drawing-dialog>:deep(.spot-map){flex:1;min-height:0}.drawing-dialog button{border:1px solid #1687ef;background:white;color:#1687ef;border-radius:4px;padding:7px 15px;cursor:pointer}.drawing-dialog footer{margin:0}.drawing-dialog footer button:last-child{background:#1687ef;color:white}
</style>
