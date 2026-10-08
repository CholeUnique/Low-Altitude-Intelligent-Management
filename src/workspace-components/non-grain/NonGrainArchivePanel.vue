<script setup lang="ts">
import WorkbenchFeedback from '@/workspace-components/shared/WorkbenchFeedback.vue'
import { computed, ref, watch } from 'vue'
import { useBackendTaskData } from '@/workspace-components/shared/use-backend-task'
import { useUserStore } from '@/stores/user'
import { canOperateWorkflowNode } from '@/utils/task-workflow-state'
import { getTaskWorkflow, submitWorkflowNode } from '@/api/task-workflow'
import { getMetadataOptions, type MetadataOption } from '@/api/metadata'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import './workspace.scss'

interface ArchiveRecord { abnormalId: string; archiveType: string; restoration: string; restoredArea: string; landUse: string; archiveStatus: string; unableReason: string; description: string }
const props = defineProps<{ taskId?: string; readonly?: boolean; flowError?: string }>()
const emit = defineEmits<{ submitted: [] }>()
const user = useUserStore()
const { task, flow, selectedNode, abnormals, loading, errors, load } = useBackendTaskData({ get taskId() { return props.taskId }, get readonly() { return props.readonly }, nodeKey: 'case-archive', includeMaterials: false })
const canEdit = computed(() => !props.readonly && !loading.value && !submitting.value && canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || '')) && selectedNode.value?.id === flow.value?.currentNode?.id)
const submitting = ref(false)
const error = ref('')
const activeId = ref('')
const draft = ref<ArchiveRecord[]>([])
const archiveDate = ref('')
const options = ref<MetadataOption[]>([])
const optionError = ref('')
const record = computed(() => (selectedNode.value?.resultData || {}) as Record<string, unknown>)
const evidence = computed(() => [
  { key: 'IMPLEMENT', title: '现场核查', icon: '⌖' },
  { key: 'RECTIFY', title: '整改处理', icon: '⚒' },
  { key: 'UAV_RECHECK', title: '无人机复核', icon: '✣' },
].map(item => ({ ...item, node: [...(flow.value?.timeline || [])].reverse().find(node => node.nodeKey === item.key) })))
const inspection = computed(() => evidence.value[0]?.node?.resultData as Record<string, unknown> | undefined)
const records = computed(() => {
  if (canOperateWorkflowNode(selectedNode.value, String(user.currentUser?.id || ''))) return draft.value
  const saved = record.value.plotResults
  if (Array.isArray(saved)) return saved as ArchiveRecord[]
  return abnormals.value.map(spot => ({ ...emptyRecord(spot.id), ...record.value, abnormalId: spot.id })) as ArchiveRecord[]
})
const active = computed(() => records.value.find(item => item.abnormalId === activeId.value))
const activeSpot = computed(() => abnormals.value.find(spot => spot.id === activeId.value))
const materialGroups = computed(() => evidence.value.map(item => ({ ...item, files: item.node?.files || [] })))
const useOptions = computed(() => {
  const result: MetadataOption[] = []
  function flatten(items: MetadataOption[], prefix = '') { items.forEach(item => { result.push({ ...item, name: prefix + item.name }); if (item.children) flatten(item.children, prefix + item.name + ' / ') }) }
  flatten(options.value); return result
})
const types = [
  { value: 'NO_PROBLEM', title: '现场核查无问题，直接结案', description: '现场核查未发现非粮化问题，按核查结果归档。' },
  { value: 'RESTORED', title: '整改完成并复耕复种', description: '整改及复核已完成，记录复耕复种结果。' },
  { value: 'SPECIAL', title: '无法复耕，按特殊情形结案', description: '记录无法复耕原因及特殊结案依据。' },
]
function emptyRecord(id: string): ArchiveRecord { return { abnormalId: id, archiveType: '', restoration: '', restoredArea: '', landUse: '', archiveStatus: '', unableReason: '', description: '' } }
let initializedNode = ''
watch(() => selectedNode.value?.id, id => {
  if (!id || initializedNode === `${props.taskId}:${id}`) return
  initializedNode = `${props.taskId}:${id}`
  draft.value = abnormals.value.map(spot => {
    const saved = Array.isArray(record.value.plotResults) ? record.value.plotResults.find((item: ArchiveRecord) => item.abnormalId === spot.id) : undefined
    return { ...emptyRecord(spot.id), ...(saved || {}), abnormalId: spot.id }
  })
  activeId.value = abnormals.value[0]?.id || ''
  archiveDate.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  error.value = ''
})
getMetadataOptions('PLANT_USE').then(value => { options.value = value }).catch(reason => { optionError.value = reason instanceof Error ? reason.message : '用途字典读取失败' })
function evidenceDescription(data: unknown) {
  if (!data || typeof data !== 'object') return '暂无办理说明'
  const value = data as Record<string, unknown>
  return String(value.description || value.opinion || ({ NO_PROBLEM: '核查无问题', PROBLEM: '核查存在问题', DONE: '整改已完成' } as Record<string, string>)[String(value.result)] || '暂无办理说明')
}
async function submit() {
  if (!canEdit.value || !props.taskId || !selectedNode.value) return
  submitting.value = true; error.value = ''
  try {
    if (!draft.value.length) throw new Error('任务暂无图斑，无法填写结案结果。')
    for (const plot of draft.value) {
      if (!plot.archiveType || !plot.landUse || !plot.archiveStatus || !plot.description.trim()) throw new Error('请为每个图斑填写结案类型、当前用途、结案状态和结案说明。')
      if (plot.archiveType === 'SPECIAL' && !plot.unableReason.trim()) throw new Error('特殊情形结案需要填写无法复耕原因。')
      if (plot.archiveType === 'RESTORED' && (!plot.restoration || !plot.restoredArea || !Number.isFinite(Number(plot.restoredArea)) || Number(plot.restoredArea) < 0)) throw new Error('请填写复耕复种情况及有效复耕面积。')
      if (plot.archiveType === 'RESTORED' && !evidence.value.some(item => item.key === 'UAV_RECHECK' && item.node?.status === 'COMPLETED')) throw new Error('尚未完成无人机复核，不能按整改完成并复耕复种结案。')
      if (plot.archiveType === 'NO_PROBLEM' && inspection.value?.result !== 'NO_PROBLEM') throw new Error('现场核查结论不是无问题，请核对结案类型。')
    }
    const current = await getTaskWorkflow(props.taskId)
    if (current?.currentNode?.id !== selectedNode.value.id || current.currentNode.nodeKey !== 'FINISH' || !canOperateWorkflowNode(current.currentNode, String(user.currentUser?.id || ''))) throw new Error('结案节点状态或办理人已变化，请刷新后重试。')
    // FINISH 节点未定义 result 路由；结案表单作为 resultData 保存，不编造路由结论。
    await submitWorkflowNode({ nodeInstId: current.currentNode.id, resultData: { plotResults: draft.value.map(item => ({ ...item, restoredArea: item.restoredArea ? Number(item.restoredArea) : null })), archiveDate: archiveDate.value, archiver: user.name, description: draft.value.map(item => item.description).join('；'), attachment: evidence.value.flatMap(item => (item.node?.files || []).map(file => file.id)) } })
    await load(); emit('submitted'); window.dispatchEvent(new Event('workflow-todos-changed'))
    if (selectedNode.value?.status !== 'COMPLETED' || flow.value?.status !== 'FINISHED') error.value = '结案请求已提交，但后端尚未确认流程结束，请刷新核对。'
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '结案提交失败' }
  finally { submitting.value = false }
}
</script>

<template>
  <div class="ng-page archive-page">

    <WorkbenchFeedback :message="[...errors, flowError, error, optionError].filter(Boolean).join('；')" />
    <section class="ng-summary archive-summary"><article class="ng-summary-card"><i>单</i><span><small>任务编号</small><b>{{ task?.taskNo || '暂无数据' }}</b></span></article><article class="ng-summary-card"><i>景</i><span><small>所属场景</small><b>{{ task?.sceneName || '暂无数据' }}</b></span></article><article class="ng-summary-card"><i>斑</i><span><small>{{ selectedNode?.status === 'COMPLETED' ? '已结案图斑' : '待结案图斑' }}</small><b>{{ abnormals.length }} 个</b></span></article><article class="ng-summary-card"><i>档</i><span><small>结案目标</small><b>归档处置结果，形成闭环记录</b></span></article></section>
    <div class="archive-layout">
      <aside><section class="ng-card evidence-card"><h3>结案依据概览</h3><div class="evidence-scroll"><article v-for="item in evidence" :key="item.key"><i>{{ item.icon }}</i><div><b>{{ item.title }} <em :class="{ done: item.node?.status === 'COMPLETED' }">{{ item.node?.status === 'COMPLETED' ? '已完成' : item.node ? '处理中' : '未经过此节点' }}</em></b><p>{{ item.node ? evidenceDescription(item.node.resultData) : '本任务暂无此节点办理记录' }}</p><small v-if="item.node?.files?.length">{{ item.node.files.map(file => file.fileName).join('、') }}</small></div></article></div></section>
        <section class="ng-card archive-plots"><h3>{{ selectedNode?.status === 'COMPLETED' ? '已结案' : '待结案' }}图斑列表（共{{ abnormals.length }}个）</h3><div class="plot-scroll"><button v-for="(spot,index) in abnormals" :key="spot.id" :class="{ selected: activeId === spot.id }" @click="activeId = spot.id"><div class="thumb"><img v-if="spot.imageUrl" :src="spot.imageUrl" :alt="spot.title" /><TaskRangeMap v-else :abnormal-points="[spot]" :active-abnormal-id="spot.id" fit-abnormal-points :fit-padding="4" show-dom-imagery /></div><b>图斑{{ index + 1 }}</b><span>{{ spot.title }}</span><small>{{ spot.area ?? '—' }} ㎡</small><em>{{ selectedNode?.status === 'COMPLETED' ? '已结案' : '待结案' }}</em><span>›</span></button><p v-if="!abnormals.length">暂无后端图斑数据</p></div></section>
        <section class="ng-card archive-help"><h3>ⓘ 归档说明</h3><p>1. 依据核查、整改及复核结果填写最终结案信息。</p><p>2. 逐一记录图斑结果，再提交整条任务结案。</p><p>3. 已完成的结案记录可查看，不能再次修改或提交。</p></section>
      </aside>
      <section class="ng-card archive-form"><h3>结案信息填报</h3><div class="form-summary"><span>任务编号<b>{{ task?.taskNo || '—' }}</b></span><span>当前图斑<b>{{ activeSpot?.title || '—' }}</b></span><span>结案人<b>{{ selectedNode?.assigneeName || '—' }}</b></span><span>结案日期<b>{{ selectedNode?.status === 'COMPLETED' ? String(record.archiveDate || selectedNode.submitTime || '').slice(0,10) || '—' : archiveDate }}</b></span></div>
        <form v-if="active" @submit.prevent="submit"><fieldset :disabled="!canEdit"><h4>结案类型</h4><div class="archive-types"><label v-for="item in types" :key="item.value" :class="{ chosen: active.archiveType === item.value }"><input v-model="active.archiveType" type="radio" :value="item.value" /><span><b>{{ item.title }}</b><small>{{ item.description }}</small></span></label></div>
          <h4>结案结果</h4><div class="fields"><label><span>{{ active.archiveType === 'RESTORED' ? '* ' : '' }}复耕复种情况</span><select v-model="active.restoration" :disabled="active.archiveType !== 'RESTORED'"><option value="">请选择</option><option value="RESTORED">已完成复耕复种</option><option value="RESTORED_PARTIAL">部分完成复耕复种</option></select></label><label><span>{{ active.archiveType === 'RESTORED' ? '* ' : '' }}复耕面积</span><div class="area-input"><input v-model="active.restoredArea" type="number" min="0" step="any" :disabled="active.archiveType !== 'RESTORED'" /><small>㎡</small></div></label><label><span>* 当前种植用途</span><select v-model="active.landUse" required><option value="">请选择</option><option v-if="active.landUse && !useOptions.some(item => item.code === active?.landUse)" :value="active.landUse">{{ active.landUse }}</option><option v-for="item in useOptions" :key="item.id" :value="item.code">{{ item.code }} {{ item.name }}</option></select></label><label><span>* 结案状态</span><select v-model="active.archiveStatus" required><option value="">请选择</option><option value="NO_PROBLEM">核查无问题</option><option value="COMPLETED">已完成治理</option><option value="SPECIAL">特殊情形结案</option></select></label><label class="wide"><span>无法复耕原因</span><input v-model="active.unableReason" :disabled="active.archiveType !== 'SPECIAL'" :required="active.archiveType === 'SPECIAL'" maxlength="500" placeholder="填写无法复耕原因及依据" /></label><label class="wide"><span>* 结案说明</span><textarea v-model="active.description" required maxlength="500" placeholder="结合核查、整改及复核结果填写结案说明" /><small class="counter">{{ active.description?.length || 0 }}/500</small></label></div>
          <h4>结案归档材料</h4><div class="materials"><article v-for="group in materialGroups" :key="group.key"><b>{{ group.title }}材料</b><ul v-if="group.files.length"><li v-for="file in group.files" :key="file.id">{{ file.fileName }}</li></ul><p v-else>{{ group.node ? '暂无附件' : '未经过此节点' }}</p></article></div><footer><button type="submit" :disabled="!canEdit">{{ submitting ? '正在结案…' : selectedNode?.status === 'COMPLETED' ? '已完成结案' : '确认结案' }}</button></footer>
        </fieldset></form><p v-else class="empty">暂无可填写的图斑结案记录。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.archive-page{display:flex;flex-direction:column;gap:12px;overflow:hidden}.archive-notice{margin:0;padding:9px 12px;background:#fff8df;color:#876521;font-size:12px}.error{background:#fff0ed;color:#bc4c40}.archive-summary{min-height:72px;flex-shrink:0}.archive-layout{display:grid;grid-template-columns:minmax(350px,2fr) minmax(0,3fr);gap:16px;flex:1;min-height:0}.archive-layout aside{display:grid;grid-template-rows:minmax(0,1fr) minmax(0,1fr) auto;gap:12px;min-height:0}.ng-card{padding:14px;min-height:0}h3{font-size:14px!important;margin-bottom:10px!important;border-left:4px solid #1687ef;padding-left:8px}.evidence-scroll,.plot-scroll{overflow:auto;min-height:0}.evidence-scroll article{display:flex;align-items:center;gap:12px;border:1px solid #e0eaf1;border-radius:5px;padding:12px;margin-bottom:8px}.evidence-scroll i{font-size:25px;font-style:normal;color:#1687ef;background:#eaf5ff;border-radius:50%;width:40px;height:40px;flex:none;display:grid;place-items:center}.evidence-scroll b{font-size:13px}.evidence-scroll p,.evidence-scroll small{font-size:11px;color:#7894a6;margin:6px 0 0;overflow-wrap:anywhere}em{font-style:normal;font-size:10px;background:#edf1f5;color:#8195a6;padding:3px 7px;border-radius:10px}.done{background:#def6e9;color:#248465}.plot-scroll button{display:flex;align-items:center;gap:8px;width:100%;border:1px solid #e0eaf1;border-radius:4px;background:#fbfdff;padding:7px;margin-bottom:7px;color:#36556d;text-align:left;font-size:11px;cursor:pointer}.plot-scroll .selected{border-color:#1687ef;background:#eff7ff}.plot-scroll button>span{color:#1687ef}.plot-scroll em{margin-left:auto}.thumb{height:38px;width:60px;flex:none;border-radius:4px;overflow:hidden}.thumb img{height:100%;width:100%;object-fit:cover}.thumb :deep(.task-range-map){height:100%;min-height:0;pointer-events:none}.thumb :deep(.range-area),.thumb :deep(.range-tools){display:none}.archive-help p{font-size:11px;color:#67879a;margin:5px 0;line-height:1.6}.archive-form{overflow:auto;display:block}.form-summary{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:10px;background:#edf7ff;padding:12px;border-radius:4px;font-size:11px}.form-summary span{display:grid;gap:6px;color:#7199ac}.form-summary b{color:#294a61;overflow-wrap:anywhere}fieldset{border:0;padding:0;margin:0;min-width:0}h4{font-size:12px;color:#36556d;border-left:3px solid #61aef9;padding-left:6px;margin:13px 0 8px}.archive-types{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.archive-types label{display:flex;align-items:flex-start;gap:7px;border:1px solid #dce8f0;border-radius:4px;padding:10px;cursor:pointer}.archive-types .chosen{border-color:#1687ef;background:#eff7ff}.archive-types span{display:grid;gap:6px}.archive-types b{font-size:11px;color:#36556d;line-height:1.5}.archive-types small{font-size:10px;color:#7894a6;line-height:1.6}.archive-types input{width:auto;accent-color:#1687ef;margin:2px 0}.fields{display:grid;grid-template-columns:1fr 1fr;gap:9px 14px}.fields label{display:grid;grid-template-columns:85px minmax(0,1fr);align-items:center;gap:8px;font-size:11px;color:#607e91}.fields .wide{grid-column:1/-1}select,input,textarea{box-sizing:border-box;width:100%;min-width:0;padding:6px 8px;border:1px solid #d9e7f2;border-radius:4px;background:#fbfdff;color:#36556d;font:inherit}textarea{height:64px;resize:vertical}.counter{grid-column:2;text-align:right;color:#8195a6}.area-input{display:flex;align-items:center;border:1px solid #d9e7f2;border-radius:4px}.area-input input{border:0}.area-input small{padding:0 8px;background:#f4f8fb}.materials{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.materials article{border:1px solid #e0eaf1;padding:10px;border-radius:4px;min-height:65px;font-size:11px}.materials p{color:#8195a6}.materials ul{padding-left:14px;color:#67879a;overflow-wrap:anywhere}footer{display:flex;justify-content:flex-end;margin-top:14px}footer button{border:0;background:#1687ef;color:white;border-radius:4px;padding:9px 22px;font-size:12px;cursor:pointer}button:disabled{opacity:.6;cursor:default}fieldset:disabled :is(input,textarea,select){opacity:1;color:#36556d;-webkit-text-fill-color:#36556d}@media(max-width:1000px){.archive-layout{grid-template-columns:330px minmax(0,1fr)}.archive-types{grid-template-columns:1fr}.fields{grid-template-columns:1fr}.fields .wide{grid-column:auto}.form-summary{grid-template-columns:1fr 1fr}}@media(max-width:750px){.archive-page{overflow:auto}.archive-layout{display:block}.archive-layout aside{display:flex;flex-direction:column;margin-bottom:12px}.archive-form{overflow:visible}}
</style>

<style scoped>
.archive-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.archive-summary .ng-summary-card{min-height:72px;box-sizing:border-box}
.archive-summary .ng-summary-card:nth-child(2)>i{color:#15a577;background:#e5f8ef}
.archive-summary .ng-summary-card:nth-child(3)>i{color:#e29b15;background:#fff5df}
.archive-summary .ng-summary-card:nth-child(4)>i{color:#7960ec;background:#f0edff}
.archive-layout aside{grid-template-rows:minmax(0,2fr) minmax(0,1fr) auto}
@media(max-width:750px){.archive-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
