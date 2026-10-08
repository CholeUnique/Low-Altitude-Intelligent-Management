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
  createTime?: string
  updateTime?: string
  /** 前端展开 ArcGIS MapServer 时使用的子图层信息，不参与后端接口提交。 */
  sourceServiceId?: string | number
  arcGisLayerId?: number
  arcGisGeometryType?: string
}

export interface MapServiceListQuery {
  keyword?: string
  status?: 0 | 1
}

export interface MapServiceCreateInput {
  name: string
  serviceUrl: string
  type?: string
  sort?: number
  remark?: string
}

export interface MapServiceUpdateInput extends Partial<MapServiceCreateInput> {
  id: string | number
}

export async function listMapServices(query: MapServiceListQuery = {}) {
  if (isMockMode()) return []
  const services = await apiClient.post<never, MapServiceItem[]>('/v1/map/service/list', query)
  return (Array.isArray(services) ? services : [])
    .sort((left, right) => (Number(left.sort) || 0) - (Number(right.sort) || 0))
}

export async function getMapServiceDetail(id: string | number) {
  return apiClient.post<never, MapServiceItem>('/v1/map/service/detail', { id })
}

export async function addMapService(input: MapServiceCreateInput) {
  return apiClient.post<never, MapServiceItem>('/v1/map/service/add', input)
}

export async function updateMapService(input: MapServiceUpdateInput) {
  await apiClient.post('/v1/map/service/update', input)
}

export async function deleteMapService(id: string | number) {
  await apiClient.post('/v1/map/service/delete', { id })
}

export async function updateMapServiceStatus(id: string | number, status: 0 | 1) {
  await apiClient.post('/v1/map/service/status', { id, status })
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
