import type { TaskWorkflow, WorkflowNode } from '@/api/task-workflow'
import { workflowNodeState } from './task-workflow-state'

/**
 * 林业执法：后端流程节点与工作台业务节点的绑定关系。
 *
 * 兼容历史 DEFAULT_FLOW 三节点
 * （REVIEW_OWNER 场景负责人审核 → RECTIFY_DEFAULT 现场核查 → FINISH_DEFAULT 结案归档），
 * 工作台按林业执法业务拆成「科室下发 / 实地考察 / 科室验收结案」，
 * 一个业务节点只绑定一个后端节点，避免同一条办理记录被两个节点重复展示。
 */
export const FORESTRY_WORKSPACE_BACKEND_KEY: Record<string, string> = {
  'task-dispatch': 'REVIEW_OWNER',
  'field-inspection': 'RECTIFY_DEFAULT',
  'review-archive': 'FINISH_DEFAULT',
}

const FORESTRY_CURRENT_KEYS: Record<string, string> = {
  DISTRICT_DISPATCH: 'task-dispatch', SECTION_DISPATCH: 'section-dispatch',
  FIELD_COLLECT: 'field-inspection', SECTION_AUDIT: 'section-audit',
  RECTIFY_FOREST: 'forest-rectify', SECTION_RECHECK: 'section-recheck', FINISH_FOREST: 'forest-finish',
}

export function forestryBackendKey(workspaceKey: string): string | undefined {
  return FORESTRY_WORKSPACE_BACKEND_KEY[workspaceKey]
}

export function forestryWorkspaceKey(backendKey?: string): string | undefined {
  if (!backendKey) return undefined
  const normalized = backendKey.trim().toUpperCase()
  if (FORESTRY_CURRENT_KEYS[normalized]) return FORESTRY_CURRENT_KEYS[normalized]
  return Object.keys(FORESTRY_WORKSPACE_BACKEND_KEY).find((key) => FORESTRY_WORKSPACE_BACKEND_KEY[key] === normalized)
}

/** 工作台节点是否绑定后端流程节点（任务受理/图斑识别这类本地节点返回 false）。 */
export function isForestryFlowNode(workspaceKey: string): boolean {
  return Boolean(FORESTRY_WORKSPACE_BACKEND_KEY[workspaceKey]) || Object.values(FORESTRY_CURRENT_KEYS).includes(workspaceKey)
}

/** 取该业务节点对应的后端节点实例；转办/退回会留多条历史，取最新一条。 */
export function forestryNodeInstance(flow: TaskWorkflow | undefined, workspaceKey: string): WorkflowNode | undefined {
  if (!isForestryFlowNode(workspaceKey) || !flow) return undefined
  const nodes = [...(flow.timeline || []), ...(flow.currentNode ? [flow.currentNode] : [])]
  return [...nodes].reverse().find((node) => forestryWorkspaceKey(String(node.nodeKey || '')) === workspaceKey)
}

export function forestryNodeStatus(flow: TaskWorkflow | undefined, workspaceKey: string): 'completed' | 'active' | 'pending' {
  const instance = forestryNodeInstance(flow, workspaceKey)
  if (instance) return workflowNodeState(instance)
  // 流程已结束但结案节点缺失时按完成处理，避免验收节点长期挂起。
  if (workspaceKey === 'review-archive' && flow?.status === 'FINISHED') return 'completed'
  return 'pending'
}

/**
 * 业务节点是否可进入：已有后端实例即可查看；
 * 流程尚未启动时只放开「科室下发」，避免后续节点在无流程时被当成可办理。
 */
export function isForestryNodeAvailable(flow: TaskWorkflow | undefined, workspaceKey: string): boolean {
  if (!isForestryFlowNode(workspaceKey)) return true
  if (!flow) return workspaceKey === 'task-dispatch'
  return Boolean(forestryNodeInstance(flow, workspaceKey)) || forestryNodeStatus(flow, workspaceKey) !== 'pending'
}
