import { apiClient, isMockMode } from './client'

export interface MapServiceItem {
  id: string | number
  name: string
  serviceUrl: string
  type: string
  sort?: number
  status: number
  preset?: number
  remark?: string
}

/**
 * 单位总览只读取启用的地图服务。请求参数和前端二次过滤同时生效，避免后端
 * 忽略筛选条件时把已停用服务暴露到图层面板。
 */
export async function listEnabledMapServices() {
  if (isMockMode()) return []
  const services = await apiClient.post<never, MapServiceItem[]>('/v1/map/service/list', { status: 1 })
  return (Array.isArray(services) ? services : [])
    .filter((service) => Number(service.status) === 1 && Boolean(service.serviceUrl?.trim()))
    .sort((left, right) => (Number(left.sort) || 0) - (Number(right.sort) || 0))
}
