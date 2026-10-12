import type { TaskWorkflow } from '@/api/task-workflow'
import { canViewWorkflowNode, workflowNodeState } from './task-workflow-state'

export const DEFAULT_WORKFLOW = [
  { key: 'business-acceptance', backendKey: 'REVIEW_OWNER', name: '业务受理' },
  { key: 'on-site-verification', backendKey: 'RECTIFY_DEFAULT', name: '现场核查' },
  { key: 'case-archive', backendKey: 'FINISH_DEFAULT', name: '结案归档' },
] as const
export function isDefaultWorkflow(flow?: TaskWorkflow) {
  if (flow?.flowKey) return flow.flowKey === 'DEFAULT_FLOW'
  if (!flow) return true
  const nodes = [...flow.timeline, ...(flow.currentNode ? [flow.currentNode] : [])]
  return nodes.length > 0 && nodes.every(node => DEFAULT_WORKFLOW.some(step => step.backendKey === node.nodeKey))
}
export function defaultWorkflow(flow?: TaskWorkflow) {
  return DEFAULT_WORKFLOW.map((step, index) => {
    const instance = [...(flow?.timeline || []), ...(flow?.currentNode ? [flow.currentNode] : [])].reverse().find(node => node.nodeKey === step.backendKey)
    return { ...step, order: index + 1, instance, status: workflowNodeState(instance), viewable: canViewWorkflowNode(instance) || (!flow && index === 0) }
  })
}
export function defaultSubmitResult(nodeKey: string, assessment: string) {
  // Workflow routing values differ from the business assessment stored in the form.
  if (nodeKey === 'REVIEW_OWNER') return { result: 'FORWARD' }
  if (nodeKey === 'RECTIFY_DEFAULT') return { result: 'DONE', assessment }
  if (nodeKey === 'FINISH_DEFAULT') return { assessment }
  throw new Error('当前节点未配置默认流程，请核对后端流程定义。')
}
