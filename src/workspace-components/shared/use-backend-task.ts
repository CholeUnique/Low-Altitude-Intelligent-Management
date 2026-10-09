import { computed, ref, watch } from 'vue'
import { getGovernanceTaskDetail, getGovernanceTaskOperateLogs, getGovernanceTaskGeometry, getTaskAbnormalPage, taskPriorityLabel } from '@/api/governance-task'
import type { GovernanceTaskOperateLog, GovernanceTaskComparisonImage, GovernanceTaskDetail, TaskAbnormal, TaskGeometryFeatureCollection } from '@/api/governance-task'
import { getGovernanceResultPage, getTaskEvidenceImages } from '@/api/governance-result'
import type { GovernanceResult, TaskEvidenceImage } from '@/api/governance-result'
import { getTaskWorkflow } from '@/api/task-workflow'
import type { TaskWorkflow } from '@/api/task-workflow'
import { nonGrainNodeKey } from '@/utils/task-workflow-state'
import { collectPages } from '@/api/pagination'
import type { ComparisonPeriod } from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import { shouldShowTaskDataError } from './task-data-errors'

export function useBackendTaskData(props: { taskId?: string; nodeKey?: string; readonly?: boolean; includeMaterials?: boolean }) {
  const detail = ref<GovernanceTaskDetail>()
  const flow = ref<TaskWorkflow>()
  const logs = ref<GovernanceTaskOperateLog[]>([])
  const geometry = ref<TaskGeometryFeatureCollection>({ type: 'FeatureCollection', features: [] })
  const abnormals = ref<TaskAbnormal[]>([])
  const results = ref<GovernanceResult[]>([])
  const images = ref<TaskEvidenceImage[]>([])
  const loading = ref(false)
  const errors = ref<string[]>([])
  const activeSpotId = ref('')
  let version = 0
  const task = computed(() => detail.value?.task)
  const selectedNode = computed(() => props.nodeKey ? [...(flow.value?.timeline || [])].reverse().find(node => node.nodeKey === props.nodeKey || nonGrainNodeKey(node) === props.nodeKey) : flow.value?.currentNode)
  const taskFields = computed<Array<[string, unknown]>>(() => [
    ['任务编号', task.value?.taskNo], ['所属场景', task.value?.sceneName],
    ['任务状态', task.value?.taskStatusDesc], ['主责部门', task.value?.deptName],
    ['负责人', task.value?.assigneeName || (task.value?.assigneeId ? `ID ${task.value.assigneeId}` : undefined)],
    ['优先级', task.value ? taskPriorityLabel(task.value.priority) : undefined],
    ['范围名称', task.value?.rangeName],
    ['范围面积', task.value?.rangeArea === undefined ? undefined : `${task.value.rangeArea} ${task.value.rangeAreaUnit || ''}`],
    ['计划开始', task.value?.planStartTime], ['计划结束', task.value?.planEndTime],
    ['联系人', task.value?.contactName], ['联系电话', task.value?.contactPhone],
    ['创建时间', task.value?.createTime], ['更新时间', task.value?.updateTime],
  ])
  const statisticsFields = computed<Array<[string, unknown]>>(() => [
    ['飞行次数', detail.value?.statistics?.flightCount],
    ['飞行时长（小时）', detail.value?.statistics?.flightHours],
    ['巡查面积', detail.value?.statistics?.patrolArea == null ? undefined : `${detail.value.statistics.patrolArea} ${detail.value.statistics.patrolAreaUnit || ''}`],
    ['异常数量', detail.value?.abnormalCount],
    ['异常面积（㎡）', detail.value?.abnormalArea],
  ])
  const selectedSpot = computed(() => abnormals.value.find(spot => spot.id === activeSpotId.value))
  function text(value: unknown) { return value == null || value === '' ? '暂无数据' : String(value).replace(/^(\d{4}-\d{2}-\d{2})T(?=\d{2}:)/, '$1 ') }
  function handleLabel(status: number) { return ['待核查', '核查中', '已处置', '已销号'][status] || String(status) }
  function imageryPeriod(image: GovernanceTaskComparisonImage): ComparisonPeriod {
    return { number: 1, label: image.label, kind: image.mapService ? 'map-service' : 'image', mapService: image.mapService, imageUrl: image.imageUrl }
  }
  
  async function load() {
    const current = ++version
    detail.value = undefined
    flow.value = undefined
    logs.value = []
    geometry.value = { type: 'FeatureCollection', features: [] }
    abnormals.value = []; results.value = []; images.value = []; errors.value = []; activeSpotId.value = ''
    loading.value = Boolean(props.taskId)
    if (!props.taskId) return
    const taskId = props.taskId
    try {
      const taskDetail = await getGovernanceTaskDetail(taskId)
      if (current !== version) return
      if (!taskDetail) throw new Error('未找到任务或无查看权限')
      detail.value = taskDetail
    } catch (error) {
      if (current !== version) return
      errors.value = [error instanceof Error ? error.message : '任务详情读取失败']
      loading.value = false
      return
    }
    const deptId = detail.value.task.deptId
    const responses = await Promise.allSettled([
      getGovernanceTaskGeometry(taskId, undefined, false, deptId),
      collectPages((pageNum, pageSize) => getTaskAbnormalPage({ bizTaskId: taskId, deptId, pageNum, pageSize })),
      props.includeMaterials === false ? Promise.resolve([] as GovernanceResult[]) : collectPages((pageNum, pageSize) => getGovernanceResultPage({ bizTaskId: taskId, deptId, pageNum, pageSize })),
      props.includeMaterials === false ? Promise.resolve([] as TaskEvidenceImage[]) : getTaskEvidenceImages(taskId, deptId), getTaskWorkflow(taskId), getGovernanceTaskOperateLogs(taskId, deptId),
    ])
    if (current !== version) return
    const labels = ['任务范围', '异常图斑', '成果材料', '任务影像', '工作流', '操作记录']
    const workflowResponse = responses[4]
    if (workflowResponse?.status === 'fulfilled') flow.value = workflowResponse.value
    const readOnly = props.readonly === true || selectedNode.value?.status === 'COMPLETED'
    responses.forEach((response, index) => {
      if (response.status === 'rejected' && shouldShowTaskDataError(index, response.reason, readOnly)) errors.value.push(`${labels[index]}：${response.reason instanceof Error ? response.reason.message : '读取失败'}`)
    })
    const [geometryResponse, spotResponse, resultResponse, imageResponse, , logResponse] = responses
    if (geometryResponse.status === 'fulfilled') geometry.value = geometryResponse.value
    if (spotResponse.status === 'fulfilled') { abnormals.value = spotResponse.value; activeSpotId.value = spotResponse.value[0]?.id || '' }
    if (resultResponse.status === 'fulfilled') results.value = resultResponse.value
    if (imageResponse.status === 'fulfilled') images.value = imageResponse.value
    if (logResponse.status === 'fulfilled') logs.value = logResponse.value
    loading.value = false
  }
  watch(() => props.taskId, () => void load(), { immediate: true })
  return { detail, flow, geometry, abnormals, results, images, logs, loading, errors, activeSpotId, task, selectedNode, taskFields, statisticsFields, selectedSpot, text, handleLabel, imageryPeriod, load }
}
