import type { GovernanceTask } from '@/api/governance-task'
import type { TaskWorkflow } from '@/api/task-workflow'
import type { TaskWorkflowNode } from '@/types'
import { nonGrainNodeKey, workflowNodeDisplayName } from './task-workflow-state'

/** 列表显示投影：任务执行状态与工作流状态分开存储，不能只看 taskStatus。 */
export function projectTaskListWorkflow(task: GovernanceTask, flow?: TaskWorkflow): GovernanceTask {
  if (!flow) return task
  const seen = new Set<string>()
  const nodes = [...flow.timeline, ...(flow.currentNode ? [flow.currentNode] : [])].filter(node => {
    if (seen.has(node.id) || node.status === 'TRANSFERRED' || (node.status === 'PENDING' && node.id !== flow.currentNode?.id)) return false
    seen.add(node.id)
    return true
  })
  const steps: TaskWorkflowNode[] = nodes.map(node => ({
    key: nonGrainNodeKey(node) || node.nodeKey,
    name: workflowNodeDisplayName(node, task.sceneCode),
    status: node.status === 'PROCESSING' ? 'active' : node.status === 'PENDING' ? 'pending' : 'done',
    time: node.submitTime || node.createTime,
  }))
  if (steps.length) steps.unshift({ key: 'task-created', name: '待执行', status: 'done', time: task.createTime })
  const current = flow.currentNode || [...nodes].reverse().find(node => node.status === 'PROCESSING')
  // 已失败/取消的任务不能因历史工作流记录重新显示为执行中。
  const terminalTask = [3, 4, 5].includes(task.taskStatus)
  const running = !terminalTask && flow.status === 'RUNNING'
  const finished = ![3, 4].includes(task.taskStatus) && flow.status === 'FINISHED'
  return {
    ...task,
    taskStatus: finished ? 5 : running ? 1 : task.taskStatus,
    taskStatusDesc: finished ? '已完成' : running
      ? current ? `${workflowNodeDisplayName(current, task.sceneCode)}处理中` : '流程办理中'
      : task.taskStatusDesc,
    workflow: steps.length ? steps : task.workflow,
  }
}
