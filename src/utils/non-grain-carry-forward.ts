import type { TaskWorkflow, WorkflowNode } from '@/api/task-workflow'

type PlotRecord = Record<string, unknown>
export type InspectionConclusion = 'PROBLEM' | 'NO_PROBLEM' | undefined

function object(value: unknown): PlotRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PlotRecord : {}
}

/** 图斑明细优先；不能用汇总结论或其他图斑的数据填补缺失行。 */
export function workflowPlotRecord(data: unknown, abnormalId: string, allowLegacy = false): PlotRecord {
  const record = object(data)
  if (Array.isArray(record.plotResults)) {
    return object(record.plotResults.find(item => String(object(item).abnormalId) === abnormalId))
  }
  if (record.abnormalId != null) return String(record.abnormalId) === abnormalId ? record : {}
  return allowLegacy ? record : {}
}

/** 只沿当前节点的办理历史向前查找，避免退回重办或查看历史时引用后续节点。 */
export function precedingWorkflowNodes(flow: TaskWorkflow | undefined, nodeId: string): WorkflowNode[] {
  if (!flow) return []
  const index = flow.timeline.findIndex(node => node.id === nodeId)
  const node = flow.timeline[index] || (flow.currentNode?.id === nodeId ? flow.currentNode : undefined)
  if (!node) return []
  if (node.prevNodeInstId == null) return index < 0 ? [] : flow.timeline.slice(0, index).reverse()
  const byId = new Map(flow.timeline.map(item => [item.id, item]))
  const seen = new Set([nodeId])
  const result: WorkflowNode[] = []
  let previous: WorkflowNode['prevNodeInstId'] = node.prevNodeInstId
  while (previous != null && !seen.has(String(previous))) {
    const ancestor = byId.get(String(previous))
    if (!ancestor) break
    seen.add(ancestor.id)
    result.push(ancestor)
    previous = ancestor.prevNodeInstId
  }
  return result
}

export function inspectionConclusion(flow: TaskWorkflow | undefined, nodeId: string, abnormalId: string): InspectionConclusion {
  const inspection = precedingWorkflowNodes(flow, nodeId).find(node => node.nodeKey === 'IMPLEMENT' && node.status === 'COMPLETED')
  const result = workflowPlotRecord(inspection?.resultData, abnormalId, true).result
  return result === 'PROBLEM' || result === 'NO_PROBLEM' ? result : undefined
}

export function archiveTypeAllowed(type: string, conclusion: InspectionConclusion): boolean {
  if (type === 'NO_PROBLEM') return conclusion === 'NO_PROBLEM'
  if (type === 'RESTORED') return conclusion === 'PROBLEM'
  return type === 'SPECIAL'
}

function fieldText(value: unknown): string {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? String(value).trim() : ''
}

/** 保留本节点已填值；面积和用途分别取最近一次完成节点的数据，0 也是有效面积。 */
export function carriedPlotFields(flow: TaskWorkflow | undefined, nodeId: string, abnormalId: string, plotCount: number, saved: unknown = {}) {
  const own = object(saved)
  const fields = { restoredArea: fieldText(own.restoredArea), landUse: fieldText(own.landUse) }
  for (const node of precedingWorkflowNodes(flow, nodeId)) {
    if (node.status !== 'COMPLETED' || !['UAV_RECHECK', 'RECTIFY', 'IMPLEMENT'].includes(node.nodeKey)) continue
    const row = workflowPlotRecord(node.resultData, abnormalId, plotCount === 1)
    if (!fields.restoredArea && node.nodeKey !== 'IMPLEMENT') fields.restoredArea = fieldText(row.restoredArea)
    if (!fields.landUse) fields.landUse = fieldText(row.landUse)
    if (fields.restoredArea && fields.landUse) break
  }
  return fields
}
