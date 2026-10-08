import { getDeptUserPage } from './account-management'
import { apiClient, ApiBusinessError } from './client'
import { getTaskWorkflow } from './task-workflow'

export function isNonGrainScene(code: string) {
  return ['CULTIVATED_LAND_USE_CONTROL', 'NON_GRAIN', 'NON_GRAIN_MONITORING'].includes(code)
}

/** 非粮首节点固定分派给启用的 nyncKZ，ID 和部门关联从后端读取。 */
export async function getNonGrainReviewerId(deptId?: string): Promise<string> {
  if (!deptId) throw new Error('请选择处理部门后再查询科室初核办理人。')
  for (let pageNum = 1; ; pageNum++) {
    const page = await getDeptUserPage({ deptId, includeChild: false, pageNum, pageSize: 100, keyword: 'nyncKZ' })
    const reviewer = page.records.find(user => user.username === 'nyncKZ')
    if (reviewer) {
      return String(reviewer.id)
    }
    if (!page.records.length || pageNum * page.pageSize >= Number(page.total)) break
  }
  throw new Error('未找到启用的 nyncKZ 账号，无法分派科室初核。')
}

export async function assignNonGrainReview(bizTaskId: string, deptId: string, assigneeId: string) {
  try {
    await apiClient.post('/v1/workflow/start', { bizTaskId, deptId, assigneeId })
  } catch (error) {
    // 创建接口也可能已自动启动流程；继续读取真实节点，不能重复启动或跳过节点。
    if (!(error instanceof ApiBusinessError && error.code === '10508')) throw error
  }
  let flow = await getTaskWorkflow(bizTaskId)
  if (!flow?.currentNode || flow.currentNode.nodeKey !== 'REVIEW_CITY') {
    throw new Error(`任务已启动工作流，但后端当前节点为“${flow?.currentNode?.nodeName || '未返回'}”，需将非粮化场景首节点配置为“科室初核”。`)
  }
  if (flow.currentNode.status !== 'PROCESSING') throw new Error('科室初核节点尚未进入处理中，分派未完成。')
  if (flow.currentNode.assigneeId !== assigneeId) {
    await apiClient.post('/v1/workflow/reassign', { nodeInstId: flow.currentNode.id, targetUserId: assigneeId })
    flow = await getTaskWorkflow(bizTaskId)
  }
  if (!flow?.currentNode || flow.currentNode.nodeKey !== 'REVIEW_CITY' || flow.currentNode.status !== 'PROCESSING' || flow.currentNode.assigneeId !== assigneeId) {
    throw new Error('后端未确认科室初核分派给 nyncKZ，请检查工作流配置。')
  }
  window.dispatchEvent(new Event('workflow-todos-changed'))
}
