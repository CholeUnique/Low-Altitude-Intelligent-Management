import { getUserDetail, getUserPage } from './account-management'
import { apiClient, ApiBusinessError } from './client'
import { getTaskWorkflow } from './task-workflow'
import { nonGrainNodeKey } from '@/utils/task-workflow-state'

export function isNonGrainScene(code: string) {
  return ['CULTIVATED_LAND_USE_CONTROL', 'NON_GRAIN', 'NON_GRAIN_MONITORING'].includes(code)
}

/** 查询确切的 admin 账号，不能把搜索返回的其他管理员或当前登录人当作 admin。 */
export async function getNonGrainReviewerId(deptId?: string): Promise<string> {
  for (let pageNum = 1; ; pageNum++) {
    const page = await getUserPage({ pageNum, pageSize: 200, keyword: 'admin', role: 'ADMIN', status: 1 })
    const admin = page.records.find(user => user.username === 'admin' && user.role === 'ADMIN' && user.status === 1)
    if (admin) {
      if (deptId) {
        const detail = await getUserDetail(String(admin.id))
        if (!detail.deptList?.some(dept => String(dept.deptId) === deptId)) {
          throw new Error('admin 未关联所选处理部门，后端无法启动其科室初核待办。请先在用户管理中关联该部门。')
        }
      }
      return String(admin.id)
    }
    if (!page.records.length || pageNum * page.pageSize >= Number(page.total)) break
  }
  throw new Error('未找到启用的 admin 管理员账号，无法分派科室初核。')
}

export async function assignNonGrainReview(bizTaskId: string, deptId: string, assigneeId: string) {
  try {
    await apiClient.post('/v1/workflow/start', { bizTaskId, deptId, assigneeId })
  } catch (error) {
    // 创建接口也可能已自动启动流程；继续读取真实节点，不能重复启动或跳过节点。
    if (!(error instanceof ApiBusinessError && error.code === '10508')) throw error
  }
  let flow = await getTaskWorkflow(bizTaskId)
  if (!flow?.currentNode || nonGrainNodeKey(flow.currentNode) !== 'section-preliminary-review') {
    throw new Error(`任务已启动工作流，但后端当前节点为“${flow?.currentNode?.nodeName || '未返回'}”，需将非粮化场景首节点配置为“科室初核”。`)
  }
  if (flow.currentNode.status !== 'PROCESSING') throw new Error('科室初核节点尚未进入处理中，分派未完成。')
  if (flow.currentNode.assigneeId !== assigneeId) {
    await apiClient.post('/v1/workflow/reassign', { nodeInstId: flow.currentNode.id, targetUserId: assigneeId })
    flow = await getTaskWorkflow(bizTaskId)
  }
  if (!flow?.currentNode || nonGrainNodeKey(flow.currentNode) !== 'section-preliminary-review' || flow.currentNode.status !== 'PROCESSING' || flow.currentNode.assigneeId !== assigneeId) {
    throw new Error('后端未确认科室初核分派给 admin，请检查工作流配置。')
  }
  window.dispatchEvent(new Event('workflow-todos-changed'))
}
