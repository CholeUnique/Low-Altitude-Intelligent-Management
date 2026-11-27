import type { TaskWorkflow, WorkflowNode } from '@/api/task-workflow'
import { workflowNodeState } from './task-workflow-state'

/**
 * 土地供后巡查与履约分析：后端流程节点与工作台业务节点的绑定。
 *
 * 与林业执法同构（backend DEFAULT_FLOW 三节点），单独一份配置，
 * 后续如需四场景共用，可再抽成工厂函数。
 */
export const SUPPLY_WORKSPACE_BACKEND_KEY: Record<string, string> = {
  'supply-inspection-dispatch': 'REVIEW_OWNER',
  'supply-on-site-verification': 'RECTIFY_DEFAULT',
  'supply-disposal-archive': 'FINISH_DEFAULT',
}

/** 需要核对地块前后影像的节点。 */
export const SUPPLY_IMAGERY_NODES = ['supply-on-site-verification', 'supply-disposal-archive']

export function supplyBackendKey(workspaceKey: string): string | undefined {
  return SUPPLY_WORKSPACE_BACKEND_KEY[workspaceKey]
}

export function supplyWorkspaceKey(backendKey?: string): string | undefined {
  if (!backendKey) return undefined
  const normalized = backendKey.trim().toUpperCase()
  return Object.keys(SUPPLY_WORKSPACE_BACKEND_KEY).find((key) => SUPPLY_WORKSPACE_BACKEND_KEY[key] === normalized)
}

export function isSupplyFlowNode(workspaceKey: string): boolean {
  return Boolean(SUPPLY_WORKSPACE_BACKEND_KEY[workspaceKey])
}

export function supplyNodeInstance(flow: TaskWorkflow | undefined, workspaceKey: string): WorkflowNode | undefined {
  const backendKey = supplyBackendKey(workspaceKey)
  if (!backendKey || !flow) return undefined
  const nodes = [...(flow.timeline || []), ...(flow.currentNode ? [flow.currentNode] : [])]
  return [...nodes].reverse().find((node) => String(node.nodeKey || '').toUpperCase() === backendKey)
}

export function supplyNodeStatus(flow: TaskWorkflow | undefined, workspaceKey: string): 'completed' | 'active' | 'pending' {
  const instance = supplyNodeInstance(flow, workspaceKey)
  if (instance) return workflowNodeState(instance)
  if (workspaceKey === 'supply-disposal-archive' && flow?.status === 'FINISHED') return 'completed'
  return 'pending'
}

export function isSupplyNodeAvailable(flow: TaskWorkflow | undefined, workspaceKey: string): boolean {
  if (!isSupplyFlowNode(workspaceKey)) return true
  if (!flow) return workspaceKey === 'supply-inspection-dispatch'
  return Boolean(supplyNodeInstance(flow, workspaceKey)) || supplyNodeStatus(flow, workspaceKey) !== 'pending'
}

export function showsSupplyImagery(workspaceKey: string): boolean {
  return SUPPLY_IMAGERY_NODES.includes(workspaceKey)
}
