import type { TaskWorkflow, WorkflowNode, WorkflowSubmitInput } from '@/api/task-workflow'
import { FARMLAND_FACILITY_STEPS } from '../workspace/config/farmland-facilities'
import { canOperateWorkflowNode, canViewWorkflowNode, workflowNodeState } from './task-workflow-state'

const aliases: Record<string, string> = {
  TASK_ACCEPTANCE: 'task-acceptance', FACILITY_ACCEPTANCE: 'task-acceptance',
  DEPARTMENT_REVIEW: 'department-review', DEPT_REVIEW: 'department-review',
  REVIEW_COUNTY: 'department-review', REVIEW_OWNER: 'department-review',
  ON_SITE_VERIFICATION: 'on-site-verification', ONSITE_VERIFY: 'on-site-verification',
  IMPLEMENT: 'on-site-verification', FIELD_CHECK: 'on-site-verification',
  DEPARTMENT_RECHECK: 'department-recheck', DEPT_RECHECK: 'department-recheck',
  UAV_RECHECK: 'department-recheck', RECHECK_AUDIT: 'department-recheck',
  CASE_ARCHIVE: 'case-archive', FACILITY_ARCHIVE: 'case-archive',
  FINISH: 'case-archive', FINISH_FACILITY: 'case-archive',
  RECTIFY: 'facility-repair',
}
const namedAliases: Record<string, string> = { '区县分局审核': 'department-review', '现场核查修复': 'on-site-verification' }
const normalizedKey = (node: WorkflowNode) => node.nodeKey.trim().replace(/-/g, '_').toUpperCase()

/** Historical nodes and finished tasks are always read-only, even with a stale currentNode summary. */
export function canOperateFacilityWorkflowNode(node: WorkflowNode | undefined, flow: TaskWorkflow | undefined, userId: string, taskStatus?: number) {
  return flow?.status === 'RUNNING' && taskStatus !== 5 && node?.id === flow.currentNode?.id && canOperateWorkflowNode(node,userId)
}

export const FACILITY_CHECK_RESULTS = [
  { value: 'REPAIRED', label: '核查属实，已修复' },
  { value: 'NO_PROBLEM', label: '核查不属实，无问题' },
  { value: 'APPLY_DISCARD', label: '申请废弃' },
] as const
export const FACILITY_RECHECK_RESULTS = [
  { value: 'NO_PROBLEM', label: '复核通过，确认无问题' },
  { value: 'REPAIRED', label: '复核通过，确认已修复' },
  { value: 'APPLY_DISCARD', label: '复核通过，同意废弃' },
  { value: 'NOT_PASS', label: '复核不通过，退回核查修复' },
] as const

export function isFacilityRepairFlow(flow?: TaskWorkflow) {
  return flow?.flowKey === 'FACILITY_REPAIR_FLOW' || [...(flow?.timeline || []), ...(flow?.currentNode ? [flow.currentNode] : [])].some(node => ['FIELD_CHECK', 'RECHECK_AUDIT', 'FINISH_FACILITY'].includes(normalizedKey(node)))
}

function isMergedCheck(node: WorkflowNode, flow?: TaskWorkflow) {
  return normalizedKey(node) === 'FIELD_CHECK' || (isFacilityRepairFlow(flow) && facilityNodeKey(node) === 'on-site-verification')
}

export function facilityRequiredFields(node: WorkflowNode | undefined, draft: Record<string, string>, flow?: TaskWorkflow): string[] {
  if (!node) return []
  if (normalizedKey(node) === 'FINISH_FACILITY' || (isFacilityRepairFlow(flow) && facilityNodeKey(node) === 'case-archive')) return []
  if (isMergedCheck(node, flow)) return ['result', 'faultCause', ...(draft.result === 'REPAIRED' ? ['repairAction', 'testResult'] : draft.result === 'APPLY_DISCARD' ? ['discardReason'] : [])]
  if (normalizedKey(node) === 'RECHECK_AUDIT' || (isFacilityRepairFlow(flow) && facilityNodeKey(node) === 'department-recheck')) return ['result', 'recheckOpinion']
  return ({ 'department-review': ['reviewOpinion'], 'on-site-verification': ['faultConfirmed', 'faultCause'], 'facility-repair': ['repairAction', 'testResult'], 'department-recheck': ['repairResult', 'recheckOpinion'], 'case-archive': ['closureConclusion', 'closureSummary'] } as Record<string, string[]>)[facilityNodeKey(node) || ''] || []
}

export function facilityHandoff(node: WorkflowNode | undefined, draft: Record<string, string>, flow?: TaskWorkflow) {
  const key = node && facilityNodeKey(node)
  if (key === 'case-archive' || !key) return { required: false, label: '' }
  if (node && isMergedCheck(node, flow)) return { required: true, label: '区县分局复核办理人' }
  // 复核通过后流程进入「部门审核」节点，后端要求显式指定办理人（处理人必填）；
  // 复核不通过时由后端自动退回原现场核查办理人，无需前端选择。
  if (node && (normalizedKey(node) === 'RECHECK_AUDIT' || (isFacilityRepairFlow(flow) && key === 'department-recheck'))) return draft.result === 'NOT_PASS' ? { required: false, label: '复核不通过将退回原现场核查办理人继续核查修复，无需另选办理人。' } : { required: true, label: '部门审核办理人' }
  return { required: true, label: key === 'department-review' ? '现场核查办理人' : key === 'on-site-verification' ? draft.faultConfirmed === '属实' ? '维修处置办理人' : '结案归档办理人' : key === 'facility-repair' ? '部门复核办理人' : draft.repairResult === '退回重修' ? '维修处置办理人' : '结案归档办理人' }
}

/** 仅映射明确的节点名称/标识；未知后端节点不擅自归入某个办理阶段。 */
export function facilityNodeKey(node: WorkflowNode): string | undefined {
  const normalized = normalizedKey(node)
  const name = (node.nodeName || '').trim()
  return aliases[normalized] || namedAliases[name] || FARMLAND_FACILITY_STEPS.find(step => step.key === node.nodeKey || step.name === name)?.key
}

/** 自动结束节点可能没有表单；结案结论只取本次实际通过的复核记录。 */
export function facilityArchiveConclusion(node: WorkflowNode | undefined, flow?: TaskWorkflow): string | undefined {
  if (!node || normalizedKey(node) !== 'FINISH_FACILITY') return undefined
  const conclusion = (record: WorkflowNode) => {
    const data = record.resultData
    if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
    const result = (data as Record<string, unknown>).result
    return FACILITY_CHECK_RESULTS.some(option => option.value === result) ? String(result) : undefined
  }
  const own = conclusion(node)
  if (own) return own
  const timeline = flow?.timeline || []
  const index = timeline.findIndex(item => item.id === node.id)
  const review = node.prevNodeInstId != null
    ? timeline.find(item => item.id === String(node.prevNodeInstId))
    : index >= 0 ? timeline.slice(0, index).reverse().find(item => normalizedKey(item) === 'RECHECK_AUDIT' && item.status === 'COMPLETED') : undefined
  return review && normalizedKey(review) === 'RECHECK_AUDIT' && review.status === 'COMPLETED' ? conclusion(review) : undefined
}

export function facilityWorkflow(flow?: TaskWorkflow) {
  const instances = [...(flow?.timeline || [])]
  if (flow?.currentNode) {
    const current = flow.currentNode
    const detail = [...instances].reverse().find(node => node.id === current.id)
    // currentNode 可能只是待办摘要，附件和表单取同一实例的时间线详情。
    instances.push({ ...detail, ...current, files: detail?.files ?? current.files, resultData: detail?.resultData ?? current.resultData, operateLogs: detail?.operateLogs ?? current.operateLogs })
  }
  const steps: Array<{key:string;name:string;description:string}> = [...FARMLAND_FACILITY_STEPS]
  if (isFacilityRepairFlow(flow)) {
    steps[2] = { key: 'on-site-verification', name: '现场核查修复', description: '核查故障并完成维修，或提交无问题、申请废弃结论，统一进入部门复核' }
    steps[4] = { key: 'case-archive', name: '结案归档', description: '部门复核通过并完成部门审核后进行结案归档，设施状态由后端同步更新' }
  }
  else if (instances.some(node => facilityNodeKey(node) === 'facility-repair')) steps.splice(3, 0, { key:'facility-repair', name:'设施维修', description:'记录工程设施维修处置及完成情况' })
  return steps.map((step, index) => {
    const instance = [...instances].reverse().find(node => facilityNodeKey(node) === step.key)
    return { ...step, order: index + 1, instance, status: workflowNodeState(instance), viewable: canViewWorkflowNode(instance) }
  })
}

/** 按真实流程契约提交结论；业务描述独立存储，不借用非粮图斑表单。 */
export function facilitySubmission(node: WorkflowNode, draft: Record<string,string>, target?: {id:string;deptId?:string;name:string}, deadline?:string, flow?: TaskWorkflow): WorkflowSubmitInput {
  const key = facilityNodeKey(node)
  let result: string | undefined
  if (key === 'department-review') {
    if (!draft.reviewOpinion?.trim()) throw new Error('请填写审核与派单意见。')
    result = 'FORWARD'
  } else if (isMergedCheck(node, flow)) {
    if (!FACILITY_CHECK_RESULTS.some(option => option.value === draft.result)) throw new Error('请选择明确的核查处置结论：已修复、无问题或申请废弃。')
    if (!draft.faultCause?.trim()) throw new Error('请填写现场核查说明。')
    if (draft.result === 'REPAIRED' && (!draft.repairAction?.trim() || !draft.testResult?.trim())) throw new Error('请完成维修并填写维修处置措施和测试结果。')
    if (draft.result === 'APPLY_DISCARD' && !draft.discardReason?.trim()) throw new Error('请填写申请废弃原因。')
    if (draft.result === 'NO_PROBLEM' && !node.files?.length) throw new Error('请上传无问题的核查证据材料。')
    result = draft.result
  } else if (key === 'on-site-verification') {
    if (!['属实','不属实'].includes(draft.faultConfirmed || '')) throw new Error('请选择明确的故障核实结果。')
    if (!draft.faultCause?.trim()) throw new Error('请填写现场核查说明。')
    result = draft.faultConfirmed === '属实' ? 'PROBLEM' : 'NO_PROBLEM'
  } else if (key === 'facility-repair') {
    if (isFacilityRepairFlow(flow)) throw new Error('该流程为核查与维修合并办理，不存在独立维修提交节点。')
    if (!draft.repairAction?.trim() || !draft.testResult?.trim()) throw new Error('请填写维修处置措施和测试结果。')
    result = 'DONE'
  } else if (key === 'department-recheck') {
    if (normalizedKey(node) === 'RECHECK_AUDIT' || isFacilityRepairFlow(flow)) {
      if (!FACILITY_RECHECK_RESULTS.some(option => option.value === draft.result) || !draft.recheckOpinion?.trim()) throw new Error('请选择明确的复核结论并填写复核意见。')
      result = draft.result
    } else {
      if (!['通过','退回重修'].includes(draft.repairResult || '') || !draft.recheckOpinion?.trim()) throw new Error('请选择明确的复核结果并填写复核意见。')
      result = draft.repairResult === '通过' ? 'NO_PROBLEM' : 'PROBLEM'
    }
  } else if (key === 'case-archive') {
    // 结案归档节点由后端流转到当前人时需要人工提交（如：复核通过 → 部门审核 → 结案归档），
    // 不再前端拦截；表单字段以页面实际渲染为准，这里不额外强制必填。
  } else throw new Error('该节点暂未配置提交规则，请核对后端流程定义。')
  const needsTarget = facilityHandoff(node, draft, flow).required
  if (needsTarget && !target?.id) throw new Error('请选择下一节点办理人。')
  const data = {...draft}
  if (isMergedCheck(node, flow)) {
    delete data.faultConfirmed
    if (result !== 'REPAIRED') { delete data.repairAction; delete data.materials; delete data.testResult }
    if (result !== 'APPLY_DISCARD') delete data.discardReason
  }
  if (!needsTarget) { delete data.targetAssigneeId; delete data.targetAssigneeName; delete data.targetDeptId; delete data.deadline }
  return { nodeInstId:node.id, ...(needsTarget ? {targetAssigneeId:target?.id,targetDeptId:target?.deptId,deadline:deadline || undefined} : {}), resultData:{...data,...(result ? {result} : {}),opinion:draft.reviewOpinion || draft.recheckOpinion || draft.closureSummary || draft.faultCause || draft.repairAction, ...(needsTarget && target ? {targetAssigneeId:target.id,targetAssigneeName:target.name,targetDeptId:target.deptId} : {})} }
}
