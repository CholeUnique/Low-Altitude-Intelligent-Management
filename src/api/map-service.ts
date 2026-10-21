import { apiClient, isMockMode } from './client'

export interface MapServiceItem {
  id: string | number
  name: string
  serviceUrl: string
  type: string
  topicCode?: string | null
  dataType?: string | null
  serviceTime?: string | null
  sort?: number
  status: number
  preset?: number
  remark?: string
  deptIds?: Array<string | number> | null
  deptNames?: string[]
  createTime?: string
  updateTime?: string
  /** 前端展开 ArcGIS MapServer 时使用的子图层信息，不参与后端接口提交。 */
  sourceServiceId?: string | number
  arcGisLayerId?: number
  arcGisGeometryType?: string
}

export interface MapServiceListQuery {
  deptId?: string | number
  keyword?: string
  status?: 0 | 1
  topicCode?: string
  dataType?: string
}

export interface MapServiceCreateInput {
  name: string
  serviceUrl: string
  type?: string
  topicCode?: string
  dataType?: string
  serviceTime?: string
  sort?: number
  remark?: string
  /** 空数组表示所有部门均可使用。 */
  deptIds?: Array<string | number>
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

/** 后端只提供单部门视角列表；管理员管理页需逐部门汇总并按服务 ID 去重。 */
export async function listMapServicesForDepartments(
  deptIds: Array<string | number>,
  query: Omit<MapServiceListQuery, 'deptId'> = {},
) {
  const uniqueDeptIds = [...new Set(deptIds.map(String).filter(Boolean))]
  const services = new Map<string, MapServiceItem>()
  for (let index = 0; index < uniqueDeptIds.length; index += 4) {
    const batch = await Promise.all(uniqueDeptIds.slice(index, index + 4)
      .map((deptId) => listMapServices({ ...query, deptId })))
    batch.flat().forEach((service) => services.set(String(service.id), service))
  }
  return [...services.values()]
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
 * 业务页面只读取当前部门可用且已启用的地图服务。请求参数和前端二次过滤
 * 同时生效，避免后端忽略筛选条件时显示其他部门或已停用的服务。
 */
export async function listEnabledMapServices(deptId?: string | number) {
  if (isMockMode()) return []
  const services = await apiClient.post<never, MapServiceItem[]>('/v1/map/service/list', { deptId, status: 1 })
  return (Array.isArray(services) ? services : [])
    .filter((service) => Number(service.status) === 1
      && Boolean(service.serviceUrl?.trim())
      && (!deptId || !service.deptIds?.length || service.deptIds.some((id) => String(id) === String(deptId))))
    .sort((left, right) => (Number(left.sort) || 0) - (Number(right.sort) || 0))
}
