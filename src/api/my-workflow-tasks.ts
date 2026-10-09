import { getGovernanceTaskDetail, getGovernanceTaskPage, getMyTodoTaskPage, type GovernanceTask } from './governance-task'
import { getTaskWorkflow, getWorkflowTodos, workflowSteps, type TaskWorkflow, type WorkflowNode } from './task-workflow'
import { collectPages } from './pagination'
import { myTaskWorkState, workflowNodeDisplayName } from '@/utils/task-workflow-state'

export interface MyWorkflowTask extends GovernanceTask {
  myWorkState: 'pending' | 'handled'
  myDeadline?: string
  myNodes: WorkflowNode[]
  flow: TaskWorkflow
}

/** 业务负责人列表仅作为候选；待办/已办必须由本人真实节点实例证明。 */
export async function getMyWorkflowTasks(userId: string, deptId?: string): Promise<{ records: MyWorkflowTask[]; warnings: string[] }> {
  if (!userId) return { records: [], warnings: [] }
  const [assigned, visible, todos] = await Promise.all([
    collectPages((pageNum, pageSize) => getMyTodoTaskPage({ pageNum, pageSize, deptId })),
    collectPages((pageNum, pageSize) => getGovernanceTaskPage({ pageNum, pageSize, deptId })),
    getWorkflowTodos(deptId),
  ])
  // 待办记录可能保留流程启动时的旧名称；任务列表中的业务名称优先。
  const candidates = new Map([...assigned, ...visible].map(task => [task.id, task]))
  for (const id of new Set(todos.map(node => node.bizTaskId))) {
    if (candidates.has(id)) continue
    const detail = await getGovernanceTaskDetail(id)
    if (detail) candidates.set(id, detail.task)
  }
  const records: MyWorkflowTask[] = []
  const warnings: string[] = []
  const pendingIds = new Set(todos.filter(node => node.status === 'PROCESSING' && node.assigneeId === userId).map(node => node.bizTaskId))
  // 控制并发，兼容大任务列表；每条历史来自服务端，不依赖本地缓存。
  const tasks = [...candidates.values()]
  for (let offset = 0; offset < tasks.length; offset += 4) {
    await Promise.all(tasks.slice(offset, offset + 4).map(async task => {
      try {
        const flow = await getTaskWorkflow(task.id)
        const state = pendingIds.has(task.id) && myTaskWorkState(flow, userId) === 'pending' ? 'pending'
          : flow?.timeline.some(node => node.status === 'COMPLETED' && node.assigneeId === userId) ? 'handled' : undefined
        if (!flow || !state) return
        // 只对本人相关任务读取详情，使用用户创建/编辑后的任务名称。
        let taskName = task.name
        try {
          const detail = await getGovernanceTaskDetail(task.id)
          if (detail?.task.name && detail.task.name !== '未命名任务') taskName = detail.task.name
        } catch (reason) {
          warnings.push(`${task.taskNo}：任务名称核实失败，${reason instanceof Error ? reason.message : '详情读取失败'}`)
        }
        const myNodes = flow.timeline.filter(node => node.assigneeId === userId)
        if (flow.currentNode?.assigneeId === userId && !myNodes.some(node => node.id === flow.currentNode?.id)) myNodes.push(flow.currentNode)
        const current = flow.currentNode?.assigneeId === userId && flow.currentNode.status === 'PROCESSING'
          ? flow.currentNode : [...myNodes].reverse().find(node => node.status === 'PROCESSING')
        const workflow = workflowSteps(flow).map((step, index) => ({ ...step, name: workflowNodeDisplayName(flow.timeline[index]!, task.sceneCode) }))
        records.push({ ...task, name: taskName, flow, workflow, myNodes, myWorkState: state, myDeadline: current?.deadline || [...myNodes].reverse().find(node => node.status === 'COMPLETED')?.deadline })
      } catch (reason) {
        warnings.push(`${task.taskNo}：${reason instanceof Error ? reason.message : '工作流读取失败'}`)
      }
    }))
  }
  return { records, warnings }
}
