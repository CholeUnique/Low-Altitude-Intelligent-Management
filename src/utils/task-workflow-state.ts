import type { TaskWorkflow, WorkflowNode } from '@/api/task-workflow'
import { NON_GRAIN_WORKFLOW } from '../workspace/config/non-grain-workflow'

export function isNodeMine(node: WorkflowNode, userId: string) {
  return Boolean(userId && node.assigneeId === userId)
}
export function canViewWorkflowNode(node?: WorkflowNode) {
  return Boolean(node && ['PROCESSING', 'COMPLETED'].includes(node.status))
}
export function canOperateWorkflowNode(node: WorkflowNode | undefined, userId: string) {
  return Boolean(node && node.status === 'PROCESSING' && isNodeMine(node, userId))
}
export function workflowNodeState(node?: WorkflowNode): 'completed' | 'active' | 'pending' {
  return node?.status === 'COMPLETED' ? 'completed' : node?.status === 'PROCESSING' ? 'active' : 'pending'
}
export function nonGrainNodeKey(node: WorkflowNode) {
  const normalized = node.nodeKey.toLowerCase().replace(/_/g, '-')
  // 非粮化 NON_GRAIN_MONITOR 的真实首审标识（任务 1314 联调确认）。
  // 工作台按业务称为科室初核，提交仍使用后端的节点实例 ID，不改写流程数据。
  if (normalized === 'review-city' && node.nodeType === 'REVIEW') return 'section-preliminary-review'
  return NON_GRAIN_WORKFLOW.find(step => step.key === normalized || step.name === node.nodeName)?.key
}
export function workflowNodeDisplayName(node: WorkflowNode, sceneCode: string) {
  if (!['CULTIVATED_LAND_USE_CONTROL', 'NON_GRAIN', 'NON_GRAIN_MONITORING'].includes(sceneCode)) return node.nodeName
  return NON_GRAIN_WORKFLOW.find(step => step.key === nonGrainNodeKey(node))?.name || node.nodeName
}
/** 转办/退回会留下同一节点多条历史；展示最后一个实例的状态和办理人。 */
export function nonGrainWorkflow(flow?: TaskWorkflow, taskAccepted = false) {
  return NON_GRAIN_WORKFLOW.map((step, index) => {
    const instance = [...(flow?.timeline || []), ...(flow?.currentNode ? [flow.currentNode] : [])].reverse().find(node => nonGrainNodeKey(node) === step.key)
    // 任务受理是已创建任务的详情回看页，不伪造后端办理实例或办理人。
    if (step.key === 'task-acceptance' && taskAccepted) return { ...step, order: index + 1, instance, status: 'completed' as const, viewable: true }
    return { ...step, order: index + 1, instance, status: workflowNodeState(instance), viewable: canViewWorkflowNode(instance) }
  })
}
export function myTaskWorkState(flow: TaskWorkflow | undefined, userId: string) {
  const nodes = [...(flow?.timeline || []), ...(flow?.currentNode ? [flow.currentNode] : [])]
  if (nodes.some(node => canOperateWorkflowNode(node, userId))) return 'pending' as const
  if (nodes.some(node => isNodeMine(node, userId) && node.status === 'COMPLETED')) return 'handled' as const
  return undefined
}
