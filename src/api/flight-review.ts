import { apiClient } from './client'

type RawRecord = Record<string, unknown>

interface RawPage {
  records?: RawRecord[]
  total?: number | string
  pageNum?: number
  pageSize?: number
}

export interface FlightReviewPlan {
  id: string
  name: string
  type: string
  waylineId: string
  waylineName: string
  waylineType: string
  sn: string
  deviceType: string
}

export interface FlightReviewTask {
  id: string
  planId: string
  name: string
  type: string
  waylineType: string
  sn: string
  deviceType: string
  startTime: string
  endTime: string
}

export interface FlightReviewMedia {
  id: string
  taskId: string
  fileName: string
  type: string
  thumbnailUrl: string
  originalUrl: string
  localFileUrl: string
  fileSize?: number
  shootTime: string
}

export interface FlightReviewPage<T> {
  records: T[]
  total: number
  pageSize: number
}

function value(record: RawRecord, key: string): string {
  const item = record[key]
  return item === null || item === undefined ? '' : String(item).trim()
}

function page<T>(raw: RawPage, map: (record: RawRecord) => T): FlightReviewPage<T> {
  if (!Array.isArray(raw?.records)) throw new Error('接口未返回有效的分页记录。')
  return {
    records: raw.records.map(map),
    total: Number(raw.total ?? raw.records.length) || 0,
    pageSize: Math.max(1, Number(raw.pageSize) || raw.records.length || 200),
  }
}

/** 研判页直接使用真实 UAV 分页接口，不读取演示数据。 */
export async function getFlightReviewPlans(deptId: string | undefined, pageNum: number) {
  const data = await apiClient.post<never, RawPage>('/v1/uav/flight-plan/page', { deptId, pageNum, pageSize: 200 })
  return page(data, (item): FlightReviewPlan => ({
    id: value(item, 'id'),
    name: value(item, 'name'),
    type: value(item, 'type'),
    waylineId: value(item, 'waylineId'),
    waylineName: value(item, 'waylineName'),
    waylineType: value(item, 'waylineType'),
    sn: value(item, 'sn'),
    deviceType: value(item, 'deviceType'),
  }))
}

export async function getFlightReviewTasks(deptId: string | undefined, pageNum: number) {
  const data = await apiClient.post<never, RawPage>('/v1/uav/flight-task/page', { deptId, pageNum, pageSize: 200 })
  return page(data, (item): FlightReviewTask => ({
    id: value(item, 'id'),
    planId: value(item, 'planId'),
    name: value(item, 'name'),
    type: value(item, 'type'),
    waylineType: value(item, 'waylineType'),
    sn: value(item, 'sn') || value(item, 'droneSn'),
    deviceType: value(item, 'deviceType') || value(item, 'droneType'),
    startTime: value(item, 'startTime'),
    endTime: value(item, 'endTime'),
  }))
}

export async function getFlightReviewMedia(taskId: string, pageNum: number) {
  const data = await apiClient.post<never, RawPage>('/v1/uav/flight-task/media/page', { taskId, pageNum, pageSize: 200 })
  return page(data, (item): FlightReviewMedia => ({
    id: value(item, 'id'),
    taskId,
    fileName: value(item, 'fileName'),
    type: value(item, 'type'),
    thumbnailUrl: value(item, 'thumbnailUrl'),
    originalUrl: value(item, 'originalUrl'),
    localFileUrl: value(item, 'localFileUrl'),
    fileSize: item.fileSize === null || item.fileSize === undefined ? undefined : Number(item.fileSize),
    shootTime: value(item, 'shootTime'),
  }))
}

/** 只允许通过当前 API 服务读取后端素材，避免向第三方地址发送登录令牌。 */
export function flightReviewFileApiPath(localFileUrl: string): string {
  const url = new URL(localFileUrl, 'http://local.invalid')
  const path = url.pathname.replace(/^\/api(?=\/v1\/uav\/media\/file\/)/, '')
  if (!/^\/v1\/uav\/media\/file\/[\w-]+\/?$/.test(path)) throw new Error('后端返回的素材文件地址无效。')
  return `${path}${url.search}`
}

export async function getFlightReviewMediaFile(localFileUrl: string, signal?: AbortSignal): Promise<Blob> {
  const file = await apiClient.get<never, Blob>(flightReviewFileApiPath(localFileUrl), {
    responseType: 'blob',
    timeout: 60_000,
    signal,
  })
  if (!(file instanceof Blob) || !file.size || /(?:json|xml|html)/i.test(file.type)) {
    throw new Error('后端未返回有效的素材文件。')
  }
  return file
}
