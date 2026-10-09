import type { MyWorkflowTask } from '@/api/my-workflow-tasks'

export type TodoTaskStatus = 'handled' | 'pending' | 'archived'
export type TodoDeadlineSort = 'default' | 'asc' | 'desc'

function dateValue(value?: string) {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isFinite(time) ? time : undefined
}

export function compareTodoTasks(left: MyWorkflowTask, right: MyWorkflowTask, order: TodoDeadlineSort = 'default') {
  if (order !== 'default') {
    const a = dateValue(left.myDeadline), b = dateValue(right.myDeadline)
    if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1
    return order === 'asc' ? a - b : b - a
  }
  const stateDifference = Number(todoTaskStatus(left) !== 'pending') - Number(todoTaskStatus(right) !== 'pending')
  if (stateDifference) return stateDifference
  const priorityDifference = left.priority - right.priority
  if (Number.isFinite(priorityDifference) && priorityDifference) return priorityDifference
  return (dateValue(right.createTime) ?? -Infinity) - (dateValue(left.createTime) ?? -Infinity) || 0
}

/** 已结案优先于本人已办；工作流存在时以工作流为准，避免业务状态滞后。 */
export function todoTaskStatus(task: Pick<MyWorkflowTask, 'flow' | 'taskStatus' | 'myWorkState'>): TodoTaskStatus {
  if (task.flow ? ['FINISHED', 'COMPLETED'].includes(task.flow.status) : task.taskStatus === 5) return 'archived'
  return task.myWorkState === 'handled' ? 'handled' : 'pending'
}

export function todoTaskStatusLabel(task: Pick<MyWorkflowTask, 'flow' | 'taskStatus' | 'myWorkState'>) {
  return { handled: '已处理', pending: '待处理', archived: '已结案' }[todoTaskStatus(task)]
}
