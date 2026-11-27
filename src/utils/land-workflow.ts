import type { TaskWorkflow, WorkflowSubmitInput } from '@/api/task-workflow'
import { LAND_WARNING_SCENE, type LandSceneCode } from '@/types/land-supervision'

/** Backend wf_node_def, flows 5/6, supplied 2026-11-27. Keep result values verbatim. */
export function landFlowDefinition(scene: LandSceneCode) {
  const warning = scene === LAND_WARNING_SCENE
  const field = warning ? 'FIELD_COLLECT' : 'FIELD_RECTIFY'
  const finish = warning ? 'FINISH_EARLYWARN' : 'FINISH_RECTIFY'
  return {
    key: warning ? 'ILLEGAL_LAND_EARLY_WARN_FLOW' : 'STOCK_ILLEGAL_LAND_RECTIFY_FLOW',
    nodes: [
      { key: 'DISTRICT_DISPATCH', name: '区县分局派发' },
      { key: 'SECTION_DISPATCH', name: '科室派发' },
      { key: field, name: warning ? '实地采集' : '实地监测整改' },
      { key: 'SECTION_AUDIT', name: '科室审核' },
      { key: finish, name: '结束' },
    ],
    routes: {
      DISTRICT_DISPATCH: { FORWARD: { next: 'SECTION_DISPATCH', assignee: 'manual' } },
      SECTION_DISPATCH: { FORWARD: { next: field, assignee: 'manual' } },
      [field]: { FORWARD: { next: 'SECTION_AUDIT', assignee: 'manual' } },
      SECTION_AUDIT: {
        NO_PROBLEM: { next: finish, assignee: 'none' },
        PROBLEM: { next: warning ? finish : field, assignee: warning ? 'none' : 'prevAssignee' },
      },
    } as Record<string, Record<string, { next: string; assignee: string }>>,
  }
}
export function isLandFlow(scene: LandSceneCode, flow?: TaskWorkflow) {
  const definition = landFlowDefinition(scene)
  return !!flow && flow.flowKey === definition.key && (!flow.currentNode || definition.nodes.some(node => node.key === flow.currentNode!.nodeKey))
}
export interface LandNodeDraft {
  opinion?: string; checkTime?: string; checker?: string; description?: string
  attachment?: string[]; result?: string; inDeadline?: string
  target?: { id: string; deptId?: string; realName?: string; nickname?: string; username?: string; deptName?: string }
  deadline?: string
  evidence?: Array<{id:string;kind:string;mediaId?:string}>
}
/** Recheck the freshly read instance/owner before submitting. Visibility never grants edit permission. */
export function landNodeSubmission(scene: LandSceneCode, flow: TaskWorkflow | undefined, nodeId: string, userId: string, draft: LandNodeDraft): WorkflowSubmitInput {
  const node = flow?.currentNode
  if (!isLandFlow(scene, flow)) throw new Error('当前场景流程未配置或节点不匹配，请刷新核对。')
  if (!node || node.id !== nodeId || node.status !== 'PROCESSING' || flow?.status !== 'RUNNING') throw new Error('当前办理节点已变化或结束，请刷新后重试。')
  if (!userId || node.assigneeId !== userId) throw new Error('只有当前节点的指定办理人可以提交。')
  const finish = node.nodeKey.startsWith('FINISH_')
  const field = ['FIELD_COLLECT','FIELD_RECTIFY'].includes(node.nodeKey)
  const result = finish ? undefined : node.nodeKey === 'SECTION_AUDIT' ? draft.result : 'FORWARD'
  const route = result ? landFlowDefinition(scene).routes[node.nodeKey]?.[result] : undefined
  if (!finish && !route) throw new Error('请选择有效的审核结论。')
  const resultData: Record<string, unknown> = finish ? {} : { result, opinion: draft.opinion?.trim() || '' }
  if (field) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.checkTime || '') || !Number.isFinite(Date.parse(draft.checkTime!)) || new Date(draft.checkTime!).toISOString().slice(0,10) !== draft.checkTime) throw new Error('请填写有效的采集／整改日期。')
    if (!draft.checker?.trim() || !draft.description?.trim()) throw new Error('请填写办理人员和实地说明。')
    const attachment = [...new Set(draft.attachment || [])]
    const available = new Set(node.files?.map(file => file.id) || [])
    if (!attachment.length || attachment.some(id => !available.has(id))) throw new Error('请至少上传一种图片凭证，附件须属于当前节点。')
    Object.assign(resultData, { checkTime: draft.checkTime, checker: draft.checker.trim(), description: draft.description.trim(), attachment, evidence: draft.evidence || [] })
    delete resultData.opinion
  }
  if (node.nodeKey === 'SECTION_AUDIT' && draft.inDeadline) {
    if (scene === LAND_WARNING_SCENE || !['YES','NO'].includes(draft.inDeadline)) throw new Error('整改限期选项无效。')
    resultData.inDeadline = draft.inDeadline
  }
  const input: WorkflowSubmitInput = { nodeInstId: node.id, resultData }
  if (route?.assignee === 'manual') {
    if (!draft.target?.id) throw new Error('请选择下一节点办理人。')
    input.targetAssigneeId = draft.target.id
    input.targetDeptId = draft.target.deptId
    Object.assign(resultData, { targetAssigneeId: draft.target.id, targetDeptId: draft.target.deptId, targetAssigneeName: draft.target.realName || draft.target.nickname || draft.target.username, targetDeptName: draft.target.deptName })
    if (draft.deadline) {
      if (!Number.isFinite(Date.parse(draft.deadline)) || Date.parse(draft.deadline) <= Date.now()) throw new Error('请设置未来的办理期限。')
      input.deadline = draft.deadline.length === 16 ? draft.deadline + ':00' : draft.deadline
      resultData.deadline = input.deadline
    } else if (route.next === 'FIELD_RECTIFY') throw new Error('请设置整改期限。')
  }
  // prevAssignee is resolved by the backend; never overwrite it with a UI-selected target.
  return input
}
