import type { GovernanceTask, GovernanceTaskDetail, TaskGeometryFeatureCollection } from '@/api/governance-task'
import type { FacilityRecord } from '@/api/facility'

export function isFacilityTask(task?: Pick<GovernanceTask,'sceneCode'|'sceneName'>) {
  return !!task && (['HIGH_STANDARD_FARMLAND_FACILITY','FARMLAND_FACILITIES','farmland-facilities'].includes(task.sceneCode) || /高标.*农田.*设施|农田工程设施/.test(task.sceneName))
}
export function facilityTaskReference(task?: GovernanceTask, facilityId?: string) {
  if(!task || !isFacilityTask(task))return undefined
  const structured = facilityId || task.facilityId || (task.refType === 'FACILITY' ? task.refId : undefined)
  if(structured && /^[1-9]\d*$/.test(structured))return {id:structured,source:'structured' as const}
  // 兼容已生成的固定上报文案；不从任意备注、任务名或其他场景猜测设施关联。
  const description=task.description?.trim() || ''
  const match=/^工程设施问题上报[（(]扫码\/PC[）)][。.]?\s*设施[：:]\s*([^\r\n]+?)[（(]ID\s*[:：]\s*([1-9]\d*)[）)]\s*(?:\r?\n|问题描述[：:])/.exec(description)
  return match ? {id:match[2]!,expectedName:match[1]!.trim(),source:'report-description' as const} : undefined
}
/** 先核对任务明确关联，再使用任务接口内的设施摘要，避免摘要 ID 覆盖真实关联。 */
export function facilityDetailReference(detail?: Pick<GovernanceTaskDetail, 'task' | 'facilityId' | 'facility'>) {
  return facilityTaskReference(detail?.task, detail?.facilityId) || facilityTaskReference(detail?.task, detail?.facility?.id?.toString())
}
export function facilityGeometry(facility?: FacilityRecord): TaskGeometryFeatureCollection {
  try {
    const value = JSON.parse(facility?.geometryJson || 'null')
    if (value?.type === 'FeatureCollection' && Array.isArray(value.features)) return value
    const feature = value?.type === 'Feature' ? value : value?.type && value.coordinates ? {type:'Feature',geometry:value,properties:{}} : undefined
    return {type:'FeatureCollection',features:feature ? [feature] : []}
  } catch { return {type:'FeatureCollection',features:[]} }
}
export function facilityFacts(task: GovernanceTask | undefined, facility?: FacilityRecord, reference = facilityTaskReference(task)): Array<[string,unknown]> {
  return [
    ['设施名称',facility?.name || reference?.expectedName],['设施 ID',facility?.id || reference?.id],['设施编号',facility?.facilityNo],['设施类型',facility?.typeName || facility?.facilityType],
    ['设施状态',facility?.bizStatusName || ({NORMAL:'正常',ABNORMAL:'异常',CHECKING:'核查中',DISCARDED:'废弃'} as Record<string,string>)[facility?.bizStatus || '']],
    ['所属项目',facility?.projectName],['行政区划',facility?.regionName],['所属行政村',facility?.villageName],
    ['建设 / 检修位置',task?.rangeName || [facility?.regionName,facility?.villageName].filter(Boolean).join(' · ')],
    ['建设 / 检修需求',task?.description],['联系人',task?.contactName],['联系电话',task?.contactPhone],['上报时间',task?.createTime],
    ['设施备注',facility?.remark],
  ]
}
