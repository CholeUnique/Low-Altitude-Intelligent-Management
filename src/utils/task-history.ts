import type { GovernanceTask, GovernanceTaskOperateLog, TaskAbnormal } from '@/api/governance-task'
import type { TaskWorkflow, WorkflowNode } from '@/api/task-workflow'
import { workflowNodeDisplayName } from './task-workflow-state'

export interface TaskHistoryEntry { id: string; time?: string; title: string; actor: string; content: string[] }
function object(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') { try { return object(JSON.parse(value)) } catch { return {} } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
// JSON 是内部数据；只显示明确的业务字段，未知字段不直接泄露到页面。
function text(value: unknown): string { return typeof value === 'string' && !/^[\s]*[\[{]/.test(value) && value !== '-' ? value.trim() : '' }
function timeValue(time?: string) { return time ? Date.parse(time.replace(' ', 'T')) : NaN }
export function formatHistoryTime(time?: string) { return time ? time.replace('T', ' ').replace(/\.\d+(Z)?$/, '$1') : '时间未记录' }

export function buildTaskHistory(task?: GovernanceTask, logs: GovernanceTaskOperateLog[] = [], flow?: TaskWorkflow, spots: TaskAbnormal[] = []): TaskHistoryEntry[] {
  const entries: TaskHistoryEntry[] = [], consumed = new Set<GovernanceTaskOperateLog>()
  const nodes = flow?.timeline || []
  const allLogs = [...logs]
  for (const node of nodes) for (const log of node.operateLogs || []) if (!allLogs.some(item => item.id && String(item.id) === String(log.id))) allLogs.push(log)
  const nodeName = (node: WorkflowNode) => workflowNodeDisplayName(node, task?.sceneCode || '')
  const userName = (id: unknown) => nodes.find(node => id != null && String(node.assigneeId) === String(id))?.assigneeName || (id != null && String(id) === task?.assigneeId ? task.assigneeName : undefined) || allLogs.find(log => id != null && String(log.operatorId) === String(id))?.operatorName
  const replaceNodes = (value: string) => nodes.reduce((result, node) => result.split(node.nodeKey).join(nodeName(node)).split(node.nodeName).join(nodeName(node)), value)
  const resultLabel = (value: unknown, node: WorkflowNode) => {
    const labels: Record<string, string> = { FORWARD: '同意下发', REJECT: '退回', DONE: '已完成整改', IN_PROGRESS: '整改进行中', NOT_READY: '暂不具备整改条件', RESTORED: '整改完成并复耕复种', SPECIAL: '特殊情形结案', COMPLETED: '已完成治理', NO_PROBLEM: node.nodeKey === 'UAV_RECHECK' ? '完成治理' : node.nodeKey === 'FINISH' ? '现场核查无问题，直接结案' : '无问题图斑', PROBLEM: node.nodeKey === 'UAV_RECHECK' ? '整改不到位' : '有问题图斑' }
    return labels[String(value)] || text(value).replace(/^[A-Z_]+$/, '')
  }
  for (const spot of spots) if (spot.foundTime) {
    const location = (task?.rangeName && task.rangeName !== task.name ? task.rangeName : '') || (spot.longitude != null && spot.latitude != null ? `经度 ${spot.longitude}、纬度 ${spot.latitude}` : '')
    entries.push({ id: `discovery:${spot.id}`, time: spot.foundTime, title: '发现疑似图斑', actor: '发现人未记录', content: [`${location ? `在${location}附近` : ''}发现疑似${spot.abnormalTypeDesc || '异常'}图斑：${spot.title || spot.spotNo || `图斑 #${spot.id}`}`, ...(text(spot.description) ? [`发现说明：${text(spot.description)}`] : [])] })
  }
  for (const node of nodes) {
    if (node.status !== 'COMPLETED') continue
    const data = object(node.resultData)
    const matching = allLogs.filter(log => {
      if (!['WORKFLOW_FORWARD', 'WORKFLOW_SUBMIT', 'WORKFLOW_FINISH', 'WORKFLOW_REJECT'].includes(log.operateType) || /上传|附件/.test(log.operateDesc)) return false
      const meta = object(log.detailJson)
      const sameNode = String(meta.nodeInstId || '') === String(node.id) || meta.fromNode === node.nodeKey || log.operateDesc.includes(`[${node.nodeName}]`)
      return sameNode && Math.abs(timeValue(log.createTime) - timeValue(node.submitTime)) <= 2000
    }).sort((a, b) => Math.abs(timeValue(a.createTime) - timeValue(node.submitTime)) - Math.abs(timeValue(b.createTime) - timeValue(node.submitTime)))
    const matched = matching[0]
    if (matched) consumed.add(matched)
    const content: string[] = []
    const opinion = text(data.opinion) || text(data.reviewConclusion) || text(data['初核结论'])
    if (opinion) content.push(`办理意见：${opinion}`)
    const conclusion = resultLabel(data.result, node)
    if (conclusion) content.push(`办理结论：${conclusion}`)
    const plots = Array.isArray(data.plotResults) ? data.plotResults.map(object) : []
    for (const plot of plots) {
      const spot = spots.find(item => item.id === String(plot.abnormalId))
      const name = spot?.title || spot?.spotNo || `图斑 #${plot.abnormalId || '未记录'}`
      const summary = [resultLabel(plot.result || plot.rectificationStatus || plot.archiveType || plot.archiveStatus, node), text(plot.description), text(plot.noProblemReason) ? `无问题原因：${text(plot.noProblemReason)}` : '', text(plot.unableReason) ? `无法复耕原因：${text(plot.unableReason)}` : ''].filter(Boolean).join('；')
      if (summary) content.push(`${name}：${summary}`)
    }
    if (text(data.description) && !plots.some(plot => text(plot.description))) content.push(`办理说明：${text(data.description)}`)
    if (text(data.remark)) content.push(`备注：${text(data.remark)}`)
    const next = nodes.find(item => item.prevNodeInstId != null && String(item.prevNodeInstId) === String(node.id))
    const recipient = text(data.targetAssigneeName) || next?.assigneeName || userName(data.targetAssigneeId)
    const department = text(data.targetDeptName) || next?.deptName
    const selectedPlots = Array.isArray(data.abnormalIds) ? data.abnormalIds.map(id => spots.find(spot => spot.id === String(id))?.title || `图斑 #${id}`).join('、') : ''
    if (next || recipient || department) content.push(`${selectedPlots ? `将${selectedPlots}` : '任务'}下发至${next ? `【${nodeName(next)}】` : ''}${department ? department : ''}${recipient && recipient !== department ? `，由${recipient}办理` : ''}${text(data.dispatchMode) ? `（${text(data.dispatchMode)}）` : ''}`)
    if (text(data.deadline) || next?.deadline) content.push(`办理截止时间：${formatHistoryTime(text(data.deadline) || next?.deadline)}`)
    if (node.files?.length) content.push(`提交 ${node.files.length} 份办理材料`)
    entries.push({ id: `node:${node.id}`, time: node.submitTime || matched?.createTime, title: `完成${nodeName(node)}`, actor: matched?.operatorName || node.assigneeName || userName(node.assigneeId) || '办理人未记录', content: content.length ? content : ['已完成节点办理，后端未记录具体意见。'] })
  }
  for (const [index, log] of allLogs.entries()) {
    if (consumed.has(log)) continue
    const meta = object(log.detailJson), content: string[] = []
    const description = text(log.operateDesc)
    if (description) content.push(replaceNodes(description))
    for (const [key, label] of [['opinion', '办理意见'], ['description', '办理说明'], ['remark', '备注']] as const) if (text(meta[key])) content.push(`${label}：${text(meta[key])}`)
    const next = nodes.find(node => node.nodeKey === meta.toNode && Math.abs(timeValue(node.createTime) - timeValue(log.createTime)) <= 2000)
    const assignee = text(meta.targetAssigneeName) || next?.assigneeName || userName(meta.assigneeId || meta.targetAssigneeId)
    if (assignee) content.push(`接收人：${assignee}`)
    entries.push({ id: `log:${log.id || index}`, time: log.createTime, title: text(log.operateTypeDesc) && !/^[A-Z_]+$/.test(log.operateTypeDesc) ? log.operateTypeDesc : '任务操作', actor: log.operatorName || userName(log.operatorId) || '操作人未记录', content: content.length ? content : ['已记录此操作，后端未提供具体说明。'] })
  }
  if (task?.createTime && !allLogs.some(log => log.operateType === 'TASK_CREATE')) entries.push({ id: `create:${task.id}`, time: task.createTime, title: '创建任务', actor: userName(task.createBy) || '创建人未记录', content: [`创建任务“${task.name}”${task.description ? `：${task.description}` : ''}`] })
  const order = (entry: TaskHistoryEntry) => entry.title === '发现疑似图斑' ? 0 : entry.title === '创建任务' ? 1 : entry.title === '启动工作流' ? 2 : 3
  return entries.sort((a, b) => (timeValue(a.time) || Infinity) - (timeValue(b.time) || Infinity) || order(a) - order(b))
}
