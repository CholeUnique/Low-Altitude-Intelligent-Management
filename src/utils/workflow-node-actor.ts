import type { WorkflowNode } from '@/api/task-workflow'

export function workflowNodeActor(node: WorkflowNode | undefined, userId: string) {
  const name = node?.assigneeName?.trim() || (node?.assigneeId ? `处理人 #${node.assigneeId}` : '尚未指定处理人')
  const mine = Boolean(userId && node?.assigneeId === userId)
  const time = node?.submitTime?.replace('T', ' ').replace(/\.\d+(?:Z)?$/, '')
  const status = node?.status
  const timing = time || (status === 'COMPLETED' ? '未记录实际处理时间' : status === 'PROCESSING' ? '办理中，尚未提交' : '尚未处理')
  return { name, mine, initial: node?.assigneeName?.trim() ? Array.from(node.assigneeName.trim())[0]! : '—', tooltip: `${name}${mine ? '（我）' : ''}\n实际处理时间：${timing}` }
}
