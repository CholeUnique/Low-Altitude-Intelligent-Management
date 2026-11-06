import type { TaskWorkflow, WorkflowNode, WorkflowSubmitInput } from '@/api/task-workflow'
import { FARMLAND_FACILITY_STEPS } from '../workspace/config/farmland-facilities'
import { canViewWorkflowNode, workflowNodeState } from './task-workflow-state'

const aliases: Record<string, string> = {
  TASK_ACCEPTANCE: 'task-acceptance', FACILITY_ACCEPTANCE: 'task-acceptance',
  DEPARTMENT_REVIEW: 'department-review', DEPT_REVIEW: 'department-review',
  REVIEW_COUNTY: 'department-review', REVIEW_OWNER: 'department-review',
  ON_SITE_VERIFICATION: 'on-site-verification', ONSITE_VERIFY: 'on-site-verification',
  IMPLEMENT: 'on-site-verification',
  DEPARTMENT_RECHECK: 'department-recheck', DEPT_RECHECK: 'department-recheck',
  UAV_RECHECK: 'department-recheck',
  CASE_ARCHIVE: 'case-archive', FACILITY_ARCHIVE: 'case-archive',
  FINISH: 'case-archive',
  RECTIFY: 'facility-repair',
}

/** 仅映射明确的节点名称/标识；未知后端节点不擅自归入某个办理阶段。 */
export function facilityNodeKey(node: WorkflowNode): string | undefined {
  const normalized = node.nodeKey.trim().replace(/-/g, '_').toUpperCase()
  return aliases[normalized] || (node.nodeName === '区县分局审核' ? 'department-review' : undefined) || FARMLAND_FACILITY_STEPS.find(step => step.key === node.nodeKey || step.name === node.nodeName)?.key
}

export function facilityWorkflow(flow?: TaskWorkflow) {
  const instances = [...(flow?.timeline || []), ...(flow?.currentNode ? [flow.currentNode] : [])]
  const steps: Array<{key:string;name:string;description:string}> = [...FARMLAND_FACILITY_STEPS]
  if (instances.some(node => facilityNodeKey(node) === 'facility-repair')) steps.splice(3, 0, { key:'facility-repair', name:'设施维修', description:'记录工程设施维修处置及完成情况' })
  return steps.map((step, index) => {
    const instance = [...instances].reverse().find(node => facilityNodeKey(node) === step.key)
    return { ...step, order: index + 1, instance, status: workflowNodeState(instance), viewable: canViewWorkflowNode(instance) }
  })
}

/** 通用 Handler 的路由值；业务描述独立存储，不借用非粮图斑表单。 */
export function facilitySubmission(node: WorkflowNode, draft: Record<string,string>, target?: {id:string;deptId?:string;name:string}, deadline?:string): WorkflowSubmitInput {
  const key = facilityNodeKey(node)
  let result: string | undefined
  if (key === 'department-review') {
    if (!draft.reviewOpinion?.trim()) throw new Error('请填写审核与派单意见。')
    result = 'FORWARD'
  } else if (key === 'on-site-verification') {
    if (!['属实','不属实'].includes(draft.faultConfirmed || '')) throw new Error('请选择明确的故障核实结果。')
    if (!draft.faultCause?.trim()) throw new Error('请填写现场核查说明。')
    result = draft.faultConfirmed === '属实' ? 'PROBLEM' : 'NO_PROBLEM'
  } else if (key === 'facility-repair') {
    if (!draft.repairAction?.trim() || !draft.testResult?.trim()) throw new Error('请填写维修处置措施和测试结果。')
    result = 'DONE'
  } else if (key === 'department-recheck') {
    if (!['通过','退回重修'].includes(draft.repairResult || '') || !draft.recheckOpinion?.trim()) throw new Error('请选择明确的复核结果并填写复核意见。')
    result = draft.repairResult === '通过' ? 'NO_PROBLEM' : 'PROBLEM'
  } else if (key === 'case-archive') {
    if (!draft.closureConclusion?.trim() || !draft.closureSummary?.trim()) throw new Error('请填写结案结论与说明。')
  } else throw new Error('该节点暂未配置提交规则，请核对后端流程定义。')
  if (key !== 'case-archive' && !target?.id) throw new Error('请选择下一节点办理人。')
  return { nodeInstId:node.id, ...(key !== 'case-archive' ? {targetAssigneeId:target?.id,targetDeptId:target?.deptId,deadline:deadline || undefined} : {}), resultData:{...draft,...(result ? {result} : {}),opinion:draft.reviewOpinion || draft.recheckOpinion || draft.closureSummary || draft.faultCause || draft.repairAction, ...(target ? {targetAssigneeId:target.id,targetAssigneeName:target.name,targetDeptId:target.deptId} : {})} }
}
