import type { TaskWorkflow } from '@/api/task-workflow'
export function recheckRoute(results: string[], flow: TaskWorkflow) {
  if (!results.length || results.some(value => !['NO_PROBLEM', 'PROBLEM'].includes(value))) throw new Error('请为所有图斑选择复核结论。')
  const result = results.includes('PROBLEM') ? 'PROBLEM' : 'NO_PROBLEM'
  const target = [...flow.timeline].reverse().find(node => node.nodeKey === (result === 'PROBLEM' ? 'RECTIFY' : 'REVIEW_CITY') && node.status === 'COMPLETED')
  if (!target?.assigneeId) throw new Error(result === 'PROBLEM' ? '未找到上一轮整改办理人，无法退回整改。' : '未找到首审办理人，无法分派归档。')
  return { result, assigneeId: target.assigneeId, deptId: target.deptId, nextKey: result === 'PROBLEM' ? 'RECTIFY' : 'FINISH' }
}
