import { LAND_WARNING_SCENE, type LandAction, type LandGeometry, type LandStage, type LandTask, type LandTaskAction, type LandEvidence, type LandStatistics, type LandSceneCode } from '@/types/land-supervision'
export function formatLandMetric(value: number | null | undefined, unit: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—'
  if (unit === '个' && !Number.isInteger(value)) return '—'
  return value.toLocaleString('zh-CN', { minimumFractionDigits: unit === '亩' ? 2 : 0, maximumFractionDigits: unit === '亩' ? 2 : 0 })
}
/** Demo facts only. Live metrics must be returned by the server, never derived from a page. */
export function demoLandStatistics(scene: LandSceneCode, tasks: LandTask[]): LandStatistics {
  if (scene === LAND_WARNING_SCENE) return {
    abnormalCount: tasks.length,
    violationArea: tasks.filter(t => t.history.some(h => h.action === 'CONFIRM_TRANSFER')).reduce((area, t) => area + t.areaSqm, 0) / (2000 / 3),
    earlyWarnCount: tasks.filter(t => t.history.some(h => h.action === 'DISPATCH')).length,
  }
  return {
    stockCount: tasks.length,
    rectifiedCount: tasks.filter(t => t.history.some(h => h.action === 'APPROVE_CLOSE')).length,
    canceledCount: tasks.filter(t => t.stage === 'CLOSED').length,
  }
}
/** Public HTTP deployments may not expose crypto.randomUUID (secure-context only). */
export function newLandRequestId() { return globalThis.crypto?.randomUUID?.() || `land-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` }
export function formatLandTime(value?: string) {
  if(!value)return '未记录'
  const date=new Date(value)
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date).replace(/\//g,'-'):'未记录'
}
export const landStageLabels: Record<LandStage, string> = { DISTRICT_DISPATCH:'区县分局派发',SECTION_DISPATCH:'科室派发',FIELD_COLLECT:'实地采集',FIELD_RECTIFY:'实地监测整改',SECTION_AUDIT:'科室审核',FINISH_EARLYWARN:'待结束',FINISH_RECTIFY:'待结束',DISPATCH: '待负责人派发', INSPECTION: '现场核查中', CONFIRM: '待核查结论确认', RECTIFY: '整改中', REVIEW: '待整改审核', TRANSFERRED: '已转整改', CLOSED: '已结案', NOT_STARTED: '待启动流程', UNSUPPORTED: '流程待适配', FAILED: '已失败', CANCELLED: '已取消' }
export const landTaskStatusLabels: Record<string, string> = { '0': '待执行', '1': '执行中', '2': '待核查', '3': '已失败', '4': '已取消', '5': '已完成' }
export function landWorkflow(scene: string) {
  return [{ key: 'ACCEPTANCE', name: '任务受理' }, { key: 'DISPATCH', name: '负责人审核并派发' }, ...(scene === LAND_WARNING_SCENE
    ? [{ key: 'INSPECTION', name: '现场核查' }, { key: 'CONFIRM', name: '核查结论确认' }]
    : [{ key: 'RECTIFY', name: '整改处理' }, { key: 'REVIEW', name: '整改审核' }]), { key: 'CLOSED', name: scene === LAND_WARNING_SCENE ? '结案／转整改' : '销号结案' }]
}
export function landActions(task: LandTask): LandAction[] {
  if (task.stage === 'DISPATCH') return ['DISPATCH']
  if (task.stage === 'INSPECTION') return ['SUBMIT_INSPECTION']
  if (task.stage === 'CONFIRM') return [...(task.conclusion === 'YES' ? ['CONFIRM_TRANSFER' as const] : task.conclusion === 'NO' ? ['CONFIRM_CLOSE' as const] : []), 'RETURN_INSPECTION']
  if (task.stage === 'RECTIFY') return ['SUBMIT_RECTIFICATION']
  if (task.stage === 'REVIEW') return ['APPROVE_CLOSE', 'RETURN_RECTIFICATION']
  return []
}
export const landActionLabels: Record<LandAction, string> = { DISPATCH: '审核通过并派发', SUBMIT_INSPECTION: '提交核查结论', RETURN_INSPECTION: '退回现场核查', CONFIRM_CLOSE: '确认无问题并结案', CONFIRM_TRANSFER: '确认问题并转入整改', SUBMIT_RECTIFICATION: '提交整改审核', APPROVE_CLOSE: '审核通过并销号', RETURN_RECTIFICATION: '退回整改' }
export function validateLandAction(task: LandTask, input: LandTaskAction, evidence: LandEvidence[]) {
  if (input.expectedVersion !== task.version) throw new Error('任务已更新，请刷新后重试。')
  if (!task.currentNode?.canOperate) throw new Error('当前节点不允许操作。')
  if (input.nodeInstId !== task.currentNode.id) throw new Error('当前办理节点已变化，请刷新后重试。')
  if (!landActions(task).includes(input.action)) throw new Error('当前节点不能执行该操作。')
  if (!input.description.trim()) throw new Error('请填写办理说明。')
  if (input.action === 'DISPATCH') {
    if (!input.assigneeId) throw new Error('请选择办理人。')
    if (task.sceneCode !== LAND_WARNING_SCENE && (!input.deadline || !Number.isFinite(Date.parse(input.deadline)) || Date.parse(input.deadline) <= Date.now())) throw new Error('请设置未来的整改期限。')
  }
  if (input.action === 'SUBMIT_INSPECTION' && !['YES', 'NO'].includes(input.conclusion || '')) throw new Error('请选择是否存在问题。')
  if (input.action === 'SUBMIT_RECTIFICATION' && !evidence.length) throw new Error('整改说明必填，并至少提供一种图片凭证。')
}
export function landGeometryCenter(geometry: LandGeometry): [number, number] {
  const points = geometry.type === 'Polygon' ? geometry.coordinates[0]! : geometry.coordinates.flatMap(p => p[0]!)
  return [(Math.min(...points.map(p => p[0]!)) + Math.max(...points.map(p => p[0]!))) / 2, (Math.min(...points.map(p => p[1]!)) + Math.max(...points.map(p => p[1]!))) / 2]
}
/** Respect holes and disconnected polygons when checking points against a supervision area. */
export function pointInLandGeometry(point: number[], geometry: LandGeometry): boolean {
  const inRing = (ring: number[][]) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!, b = ring[j]!, x = point[0]!, y = point[1]!
      const cross = (x-a[0]!)*(b[1]!-a[1]!) - (y-a[1]!)*(b[0]!-a[0]!)
      if (Math.abs(cross) < 1e-12 && x >= Math.min(a[0]!,b[0]!) && x <= Math.max(a[0]!,b[0]!) && y >= Math.min(a[1]!,b[1]!) && y <= Math.max(a[1]!,b[1]!)) return true
      if ((a[1]! > y) !== (b[1]! > y) && x < (b[0]!-a[0]!)*(y-a[1]!)/(b[1]!-a[1]!) + a[0]!) inside = !inside
    }
    return inside
  }
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.some(rings => inRing(rings[0]!) && !rings.slice(1).some(inRing))
}
/** Conservative client check for one connected drawn plot; backend must recheck exact spatial coverage. */
export function landPlotWithinRegion(plot: GeoJSON.Polygon, region: LandGeometry): boolean {
  const ring=plot.coordinates[0]!, polygons=region.type==='Polygon'?[region.coordinates]:region.coordinates
  if(!ring.every(point=>pointInLandGeometry(point,region)))return false
  const cross=(a:number[],b:number[])=>a[0]!*b[1]!-a[1]!*b[0]!
  for(let i=1;i<ring.length;i++){
    const a=ring[i-1]!,b=ring[i]!,d=[b[0]!-a[0]!,b[1]!-a[1]!],cuts=[0,1]
    for(const rings of polygons)for(const edge of rings)for(let j=1;j<edge.length;j++){
      const c=edge[j-1]!,e=[edge[j]![0]!-c[0]!,edge[j]![1]!-c[1]!],v=[c[0]!-a[0]!,c[1]!-a[1]!],den=cross(d,e)
      if(Math.abs(den)<1e-18)continue
      const t=cross(v,e)/den,u=cross(v,d)/den
      if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t)
    }
    cuts.sort((x,y)=>x-y)
    for(let j=1;j<cuts.length;j++){const t=(cuts[j-1]!+cuts[j]!)/2;if(!pointInLandGeometry([a[0]!+d[0]!*t,a[1]!+d[1]!*t],region))return false}
  }
  return !polygons.some(rings=>rings.slice(1).some(hole=>pointInLandGeometry(hole[0]!,plot)))
}
