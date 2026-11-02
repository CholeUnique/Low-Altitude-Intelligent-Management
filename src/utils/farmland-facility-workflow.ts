import type { TaskWorkflow, WorkflowNode } from '@/api/task-workflow'
import { FARMLAND_FACILITY_STEPS } from '@/workspace/config/farmland-facilities'
import { canViewWorkflowNode, workflowNodeState } from './task-workflow-state'

const aliases: Record<string, string> = {
  TASK_ACCEPTANCE: 'task-acceptance', FACILITY_ACCEPTANCE: 'task-acceptance',
  DEPARTMENT_REVIEW: 'department-review', DEPT_REVIEW: 'department-review',
  ON_SITE_VERIFICATION: 'on-site-verification', ONSITE_VERIFY: 'on-site-verification',
  DEPARTMENT_RECHECK: 'department-recheck', DEPT_RECHECK: 'department-recheck',
  CASE_ARCHIVE: 'case-archive', FACILITY_ARCHIVE: 'case-archive',
}

/** 仅映射明确的节点名称/标识；未知后端节点不擅自归入某个办理阶段。 */
export function facilityNodeKey(node: WorkflowNode): string | undefined {
  const normalized = node.nodeKey.trim().replace(/-/g, '_').toUpperCase()
  return aliases[normalized] || FARMLAND_FACILITY_STEPS.find(step => step.key === node.nodeKey || step.name === node.nodeName)?.key
}

export function facilityWorkflow(flow?: TaskWorkflow) {
  const instances = [...(flow?.timeline || []), ...(flow?.currentNode ? [flow.currentNode] : [])]
  return FARMLAND_FACILITY_STEPS.map((step, index) => {
    const instance = [...instances].reverse().find(node => facilityNodeKey(node) === step.key)
    return { ...step, order: index + 1, instance, status: workflowNodeState(instance), viewable: canViewWorkflowNode(instance) }
  })
}
