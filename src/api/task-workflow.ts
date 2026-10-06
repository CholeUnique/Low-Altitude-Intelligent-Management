import { apiClient, ApiBusinessError } from './client'
import type { GovernanceTaskOperateLog } from './governance-task'
import type { TaskWorkflowNode } from '@/types'

export interface WorkflowFile {
  id: string
  fileName: string
  fileExt?: string
  fileSize?: number
  uploadBy?: string
  createTime?: string
}

export interface WorkflowNode {
  id: string
  bizTaskId: string
  nodeKey: string
  nodeType: string
  nodeName: string
  taskName?: string
  taskNo?: string
  status: string
  deptId?: string
  deptName?: string
  assigneeId?: string
  assigneeName?: string
  deadline?: string
  overdue?: boolean
  createTime?: string
  submitTime?: string
  resultData?: unknown
  files?: WorkflowFile[]
  operateLogs?: GovernanceTaskOperateLog[]
}

export interface TaskWorkflow {
  flowInstanceId: string
  flowName?: string
  status: string
  currentNode?: WorkflowNode
  timeline: WorkflowNode[]
}

export interface WorkflowSubmitInput {
  nodeInstId: string
  resultData: Record<string, unknown>
  targetAssigneeId?: string
  targetDeptId?: string
  deadline?: string
}

export function submitWorkflowNode(input: WorkflowSubmitInput) {
  return apiClient.post<never, void>('/v1/workflow/submit', input)
}

function normalizeNode(raw: WorkflowNode): WorkflowNode {
  return {
    ...raw,
    id: String(raw.id),
    bizTaskId: String(raw.bizTaskId),
    assigneeId: raw.assigneeId == null ? undefined : String(raw.assigneeId),
    deptId: raw.deptId == null ? undefined : String(raw.deptId),
    files: (raw.files || []).map(file => ({ ...file, id: String(file.id) })),
  }
}

export async function getTaskWorkflow(bizTaskId: string): Promise<TaskWorkflow | undefined> {
  try {
    const raw = await apiClient.post<never, TaskWorkflow>('/v1/workflow/flow/detail', { bizTaskId })
    return raw ? { ...raw, flowInstanceId: String(raw.flowInstanceId), currentNode: raw.currentNode ? normalizeNode(raw.currentNode) : undefined, timeline: (raw.timeline || []).map(normalizeNode) } : undefined
  } catch (error) {
    // 后端明确表示尚未启动流程，不是网络失败，也不能推算节点。
    if (error instanceof ApiBusinessError && error.code === '10501') return undefined
    throw error
  }
}

export async function getWorkflowTodos(deptId?: string): Promise<WorkflowNode[]> {
  const records: WorkflowNode[] = []
  for (let pageNum = 1; ; pageNum++) {
    const page = await apiClient.post<never, { records?: WorkflowNode[]; total: number | string }>('/v1/workflow/todo/page', { pageNum, pageSize: 200, deptId })
    const batch = page.records || []
    records.push(...batch.map(normalizeNode))
    if (!batch.length || records.length >= Number(page.total)) return records
  }
}

export function workflowSteps(flow: TaskWorkflow): TaskWorkflowNode[] {
  return flow.timeline.map(node => ({ key: node.nodeKey, name: node.nodeName, status: node.status === 'COMPLETED' ? 'done' : node.status === 'PROCESSING' ? 'active' : 'pending', time: node.submitTime || node.createTime }))
}

export function workflowStatusLabel(status: string) {
  return ({ PENDING: '待处理', PROCESSING: '处理中', COMPLETED: '已完成', SKIPPED: '已跳过', TERMINATED: '已终止', TRANSFERRED: '已转办', RUNNING: '运行中', FINISHED: '已结束', REJECTED: '已拒绝', CANCELLED: '已取消' } as Record<string, string>)[status] || status
}
