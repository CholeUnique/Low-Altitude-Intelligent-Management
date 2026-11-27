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
  prevNodeInstId?: string | number | null
  resultData?: unknown
  files?: WorkflowFile[]
  operateLogs?: GovernanceTaskOperateLog[]
}

export interface TaskWorkflow {
  flowInstanceId: string
  flowKey?: string
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
export function uploadWorkflowFiles(nodeInstId: string, files: File[]) {
  const form = new FormData()
  files.forEach(file => form.append('files', file))
  return apiClient.post<never, void>('/v1/workflow/file/upload', form, { params: { nodeInstId } })
}
export function deleteWorkflowFile(fileId: string) {
  return apiClient.post<never, void>('/v1/workflow/file/delete', undefined, { params: { fileId } })
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

/** 上报接口通常已启动流程；仅在后端确认未启动时补启动。 */
export async function ensureFacilityWorkflowStarted(bizTaskId: string): Promise<TaskWorkflow> {
  if (!bizTaskId) throw new Error('上报结果缺少任务 ID。')
  let flow = await getTaskWorkflow(bizTaskId)
  if (!flow) {
    try {
      await apiClient.post('/v1/workflow/start', { bizTaskId })
    } catch (error) {
      // 上报接口或其他操作可能在查询后并发启动。
      if (!(error instanceof ApiBusinessError && error.code === '10508')) throw error
    }
    flow = await getTaskWorkflow(bizTaskId)
  }
  if (!flow) throw new Error('后端未返回已启动的工作流。')
  return flow
}

/**
 * 启动业务任务的工作流。
 * 任务接口未自动启动流程时（`/flow/detail` 返回 10501），由工作台显式发起；
 * 10508 表示流程已存在，视为成功，交由调用方重新读取流程。
 */
export async function startTaskWorkflow(bizTaskId: string, deptId?: string): Promise<void> {
  if (!bizTaskId) throw new Error('缺少任务 ID，无法启动工作流。')
  try {
    await apiClient.post('/v1/workflow/start', { bizTaskId, deptId })
  } catch (error) {
    if (!(error instanceof ApiBusinessError && error.code === '10508')) throw error
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
