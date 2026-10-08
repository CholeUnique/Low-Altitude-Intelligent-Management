import type { TaskWorkflow } from '@/api/task-workflow'
export interface PlotInspection {
  abnormalId: string
  result: 'PROBLEM' | 'NO_PROBLEM' | ''
  landUse: string
  summerCrop: string
  earlyCrop: string
  autumnCrop: string
  noProblemReason: string
  description: string
  longitude: string
  latitude: string
  village: string
  phone: string
  attachment: string[]
}
export function inspectionRoute(plots: PlotInspection[], flow: TaskWorkflow, rectifyUserId?: string) {
  if (!plots.length) throw new Error('没有待核查图斑，无法提交核查结果。')
  for (const plot of plots) {
    if (!['PROBLEM', 'NO_PROBLEM'].includes(plot.result)) throw new Error('请为每个图斑选择核查结论。')
    if (!plot.landUse || !plot.description.trim()) throw new Error('请为每个图斑选择核查用途并填写核查说明。')
    if (plot.result === 'NO_PROBLEM' && !plot.noProblemReason.trim()) throw new Error('请填写无问题原因。')
    if (plot.result === 'PROBLEM' && !plot.attachment.length) throw new Error('问题图斑需要上传现场拍摄图片。')
  }
  const result = plots.some(plot => plot.result === 'PROBLEM') ? 'PROBLEM' : 'NO_PROBLEM'
  const reviewer = flow.timeline.find(node => node.nodeKey === 'REVIEW_CITY')
  const assigneeId = result === 'PROBLEM' ? rectifyUserId : reviewer?.assigneeId
  if (!assigneeId) throw new Error(result === 'PROBLEM' ? '未找到启用的 ntjsg，无法分派整改处理。' : '未找到首节点办理人，无法分派结案归档。')
  return { result, assigneeId, deptId: result === 'PROBLEM' ? flow.currentNode?.deptId : reviewer?.deptId, nextKey: result === 'PROBLEM' ? 'RECTIFY' : 'FINISH' }
}
