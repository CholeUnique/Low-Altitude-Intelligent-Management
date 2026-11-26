import { assignNonGrainReview, isNonGrainScene } from '@/api/non-grain-assignment'
import { getTaskWorkflow, startTaskWorkflow } from '@/api/task-workflow'

/** 创建后按场景启动，非粮化保留科室初核指定办理人规则。 */
export async function startCreatedSpotTask(task: { id: string; sceneCode?: string; deptId?: string }, fallbackScene: string, fallbackDept?: string, reviewerId?: string) {
  const deptId = task.deptId || fallbackDept
  if (isNonGrainScene(task.sceneCode || fallbackScene)) {
    if (!deptId || !reviewerId) throw new Error('无法确定科室初核办理人或处理部门')
    await assignNonGrainReview(task.id, deptId, reviewerId)
    return
  }
  const existing = await getTaskWorkflow(task.id)
  if (!existing) await startTaskWorkflow(task.id, deptId || undefined)
  const flow = existing || await getTaskWorkflow(task.id)
  if (!flow || flow.status !== 'RUNNING' || !flow.currentNode) throw new Error('后端未确认工作流进入办理节点')
}
