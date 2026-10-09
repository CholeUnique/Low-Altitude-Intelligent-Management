import type { MyWorkflowTask } from '@/api/my-workflow-tasks'

export type TodoTaskStatus = 'handled' | 'pending' | 'archived'

/** 已结案优先于本人已办；工作流存在时以工作流为准，避免业务状态滞后。 */
export function todoTaskStatus(task: Pick<MyWorkflowTask, 'flow' | 'taskStatus' | 'myWorkState'>): TodoTaskStatus {
  if (task.flow ? ['FINISHED', 'COMPLETED'].includes(task.flow.status) : task.taskStatus === 5) return 'archived'
  return task.myWorkState === 'handled' ? 'handled' : 'pending'
}

export function todoTaskStatusLabel(task: Pick<MyWorkflowTask, 'flow' | 'taskStatus' | 'myWorkState'>) {
  return { handled: '已处理', pending: '待处理', archived: '已结案' }[todoTaskStatus(task)]
}
