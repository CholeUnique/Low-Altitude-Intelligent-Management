import type { MapServiceItem } from '@/api/map-service'

export const NON_GRAIN = 'CULTIVATED_LAND_USE_CONTROL'
export const HOMESTEAD = 'RURAL_HOMESTEAD_SUPERVISE'
export type TopicRole = 'land' | 'permanent' | 'boundary' | 'changes' | 'facility' | 'project' | 'parcel' | 'imagery' | 'unconfigured'
/** 字段能力优先；不把同名服务、任意 WMS 或变化图斑一概当作某种业务成果。 */
export function topicRole(service: MapServiceItem, fields: string[]): TopicRole {
  const has = (...names: string[]) => names.every(name => fields.includes(name))
  if (has('PAC', 'NAME')) return 'boundary'
  if (has('DLBM', 'DLMC')) return has('YJJBNTTBBH') ? 'permanent' : 'land'
  if (has('变化类')) return 'changes'
  if (has('GCMC')) return 'facility'
  if (has('XMMC')) return 'project'
  if (has('DLMC', 'SFYJJBNT')) return 'parcel'
  if (!fields.length && (service.dataType === 'IMAGERY' || /ImageServer/i.test(service.serviceUrl)
    || /TMS|XYZ|WMTS/i.test(service.type) || /影像|天地图/.test(service.name))) return 'imagery'
  return 'unconfigured'
}
export function topicIncludes(role: TopicRole, scene: string, assignedScene?: string | null) {
  if (![NON_GRAIN, HOMESTEAD].includes(scene)) return false
  if (assignedScene && assignedScene !== scene) return false
  if (['boundary', 'imagery', 'land', 'changes'].includes(role)) return true
  return scene === NON_GRAIN && ['permanent', 'facility', 'project', 'parcel'].includes(role)
}
export function sqlValue(value: string) { return `'${value.replace(/'/g, "''")}'` }
export function categoryWhere(field: string, selected: string[], all: string[]) {
  if (!selected.length) return '1=0'
  if (selected.length === all.length) return '1=1'
  const values = selected.filter(value => value !== '').map(sqlValue)
  return [values.length ? `${field} IN (${values.join(',')})` : '', selected.includes('') ? `(${field} IS NULL OR ${field} = '')` : ''].filter(Boolean).join(' OR ')
}
export function topicBaseWhere(role: TopicRole, scene: string) {
  if (scene !== HOMESTEAD) return '1=1'
  if (role === 'land') return "DLBM = '0702'"
  // 变化仅按已有调查底类筛选，不能据此认定违法或审批状态。
  if (role === 'changes') return '"2025DLTB" = \'农村宅基地\''
  return '1=1'
}
export function combineWhere(...parts: string[]) {
  if (parts.includes('1=0')) return '1=0'
  return parts.filter(part => part && part !== '1=1').map(part => `(${part})`).join(' AND ') || '1=1'
}
