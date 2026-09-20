import type { LiveStream } from '@/adapters/dasFly'
import type { FlightRoute } from '@/mocks/route-planning'
import { createFlightPlans, createRoutesForTask } from '@/mocks/route-planning'
import { createLiveCruiseSnapshot } from '@/mocks/patrol-live'
import { apiClient, isMockMode } from '@/api/client'
import {
  toFlightPlanList,
  toFlightTaskDetail,
  toMediaList,
  toProjectOptions,
  toRouteList,
} from '@/adapters/dasFly'
import type { PatrolProjectOption } from '@/adapters/dasFly'

export interface PageQuery {
  pageNum?: number
  pageSize?: number
  keyword?: string
  projectId?: string
  taskId?: string
  flightTaskId?: string
}

export interface UavDeviceOption {
  id: string
  label: string
  sn?: string
  online?: boolean
}

export type { PatrolProjectOption }

/** 低空云开放组件类型，与后端 UavComponentUrlReq 的 type 枚举保持一致。 */
export type UavOpenComponentType =
  | 'WAYLINE_CREATE'
  | 'WAYLINE_EDIT'
  | 'FLIGHT_CREATE'
  | 'COCKPIT'
  | 'TRAJECTORY_PLAYBACK'

/**
 * 获取低空大师开放组件的短时效访问地址。
 * 后端会代为向低空大师换取分享码，并将完整组件 URL 作为 data 返回。
 */
export async function getUavComponentUrl(type: UavOpenComponentType, flightTaskId?: string | number): Promise<string> {
  if (isMockMode()) throw new Error('Mock 模式不调用低空大师开放组件接口。')
  const data = await apiClient.post<never, unknown>('/v1/uav/component/url', {
    type,
    // Swagger 示例明确给出 0；即使后端说明可省略，也显式传值以兼容其请求 DTO 校验。
    flightTaskId: flightTaskId !== undefined && flightTaskId !== '' ? flightTaskId : 0,
  })
  if (typeof data !== 'string' || !data.trim()) throw new Error('开放组件接口未返回有效访问地址。')
  return data.trim()
}

/** 航线规划的项目下拉选项。 */
export async function getUavProjectOptions(): Promise<PatrolProjectOption[]> {
  if (isMockMode()) return []
  const data = await apiClient.post('/v1/uav/project/options', {})
  return toProjectOptions(data)
}

export async function getRoutes(params: PageQuery = {}) {
  if (isMockMode()) {
    return {
      list: createRoutesForTask(),
      total: 2,
    }
  }
  const data = await apiClient.post('/v1/uav/wayline/page', params)
  return toRouteList(data)
}

/** 航线规划弹窗使用的真实飞行器选项。 */
export async function getUavDeviceOptions(): Promise<UavDeviceOption[]> {
  if (isMockMode()) return []
  const data = await apiClient.post<never, { records?: Array<Record<string, unknown>> }>('/v1/uav/device/page', {
    pageNum: 1,
    pageSize: 200,
  })
  return (data.records || []).map((item, index) => {
    const id = String(item.id ?? item.deviceId ?? item.sn ?? index + 1)
    const sn = item.sn ? String(item.sn) : undefined
    const name = String(item.nickname ?? item.deviceName ?? item.name ?? item.deviceModelName ?? sn ?? `飞行器 ${index + 1}`)
    const model = item.deviceModelName && item.deviceModelName !== item.nickname && item.deviceModelName !== item.deviceName
      ? ` · ${String(item.deviceModelName)}`
      : ''
    return {
      id,
      label: `${name}${model}`,
      sn,
      online: Number(item.deviceOnlineStatus ?? item.onlineStatus ?? item.online ?? 0) === 1,
    }
  })
}

export async function getRouteDetail(id: string) {
  if (isMockMode()) {
    const list = createRoutesForTask()
    return list.find((item) => item.id === id) || list[0]
  }
  const data = await apiClient.post('/v1/uav/wayline/detail', { id })
  return toRouteList({ records: [data] }).list[0]
}

export async function getFlightPlans(params: PageQuery = {}) {
  if (isMockMode()) {
    const routes = createRoutesForTask()
    return {
      list: createFlightPlans(routes),
      total: 4,
    }
  }
  const data = await apiClient.post('/v1/uav/flight-plan/page', params)
  return toFlightPlanList(data)
}

export async function getFlightPlanDetail(id: string) {
  if (isMockMode()) {
    const routes = createRoutesForTask()
    return createFlightPlans(routes).find((item) => item.id === id)
  }
  const data = await apiClient.post('/v1/uav/flight-plan/detail', { id })
  return toFlightPlanList({ records: [data] }).list[0]
}

export async function getProgressingFlight() {
  if (isMockMode()) {
    return createLiveCruiseSnapshot()
  }
  const data = await apiClient.post('/v1/uav/flight-task/progressing', {})
  if (!Array.isArray(data) || !data.length) return undefined
  return toFlightTaskDetail(data[0])
}

export async function getFlightTaskPage(params: PageQuery = {}) {
  if (isMockMode()) {
    const snap = createLiveCruiseSnapshot()
    return { list: snap.history, total: snap.history.length }
  }
  return apiClient.post('/v1/uav/flight-task/page', params)
}

export async function getFlightTaskDetail(id: string) {
  if (isMockMode()) {
    return createLiveCruiseSnapshot()
  }
  const data = await apiClient.post('/v1/uav/flight-task/detail', { id })
  return toFlightTaskDetail(data)
}

export async function getFlightTaskTrace(flightTaskId: string) {
  if (isMockMode()) {
    const snap = createLiveCruiseSnapshot()
    return {
      coordinates: snap.routeCoordinates,
      flownIndex: snap.flownIndex,
      dronePosition: snap.dronePosition,
    }
  }
  return apiClient.post('/v1/uav/flight-task/trace', { id: flightTaskId })
}

export async function getFlightTaskMedia(params: PageQuery) {
  if (isMockMode()) {
    const snap = createLiveCruiseSnapshot()
    return { list: snap.media, total: snap.media.length }
  }
  const data = await apiClient.post('/v1/uav/flight-task/media/page', params)
  return toMediaList(data)
}

export async function getLiveStreams(): Promise<{ list: LiveStream[]; total: number }> {
  if (isMockMode()) {
    const snap = createLiveCruiseSnapshot()
    return {
      list: [
        {
          id: snap.flightId,
          aircraftId: snap.aircraftId,
          aircraftName: snap.aircraftName,
          flightId: snap.flightId,
          status: snap.liveStatus,
          protocol: 'HLS',
          playUrl: '',
        },
      ],
      total: 1,
    }
  }
  // 直播由在线设备提供，与是否存在执行中的飞行任务无关。
  const devicePage = await apiClient.post<never, { records?: Array<Record<string, unknown>> }>('/v1/uav/device/page', {
    pageNum: 1,
    pageSize: 200,
  })
  const onlineDevices = (devicePage.records || []).filter((device) =>
    Number(device.deviceOnlineStatus ?? device.onlineStatus ?? device.online ?? 0) === 1,
  )
  const results = await Promise.allSettled(onlineDevices.map(async (device) => {
    const sn = valueOf(device, 'sn', 'droneSn', 'aircraftSn')
    if (!sn) throw new Error('在线设备未返回 SN')
    return toDeviceLiveStream(device, await getLiveShareCode(sn))
  }))
  const list = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
  return { list, total: list.length }
}

function valueOf(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function unwrapLiveResponse(payload: unknown): Record<string, unknown> {
  let current = payload
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return {}
    const record = current as Record<string, unknown>
    if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) return record
    current = record.data
  }
  return current && typeof current === 'object' && !Array.isArray(current) ? current as Record<string, unknown> : {}
}

function liveProtocol(url: string): LiveStream['protocol'] {
  const normalized = url.toLowerCase()
  if (normalized.includes('.m3u8')) return 'HLS'
  if (normalized.includes('.flv')) return 'FLV'
  if (normalized.includes('webrtc')) return 'WEBRTC'
  return 'OTHER'
}

function shareEmbedUrl(shareCode: string) {
  const endpoint = import.meta.env.VITE_DAS_FLY_LIVE_EMBED_URL?.trim()
    || 'https://fly.get3d.cn/share/live/{code}'
  if (!shareCode) return ''
  if (endpoint.includes('{code}')) return endpoint.replace('{code}', encodeURIComponent(shareCode))
  try {
    const url = new URL(endpoint)
    url.searchParams.set('share_code', shareCode)
    return url.toString()
  } catch {
    return endpoint
  }
}

function toDeviceLiveStream(device: Record<string, unknown>, response: unknown): LiveStream {
  const share = unwrapLiveResponse(response)
  const sn = valueOf(device, 'sn', 'droneSn', 'aircraftSn')
  const playUrl = valueOf(share, 'playUrl', 'play_url', 'streamUrl', 'stream_url', 'hlsUrl', 'hls_url', 'flvUrl', 'flv_url')
  // /v1/uav/live/share-code 的 data 约定为 { code, expireTime, sn }。
  // apiClient 已解包最外层业务响应，因此这里的 code 就是直播分享码。
  const shareCode = valueOf(share, 'shareCode', 'share_code', 'liveShareCode', 'live_share_code', 'shareId', 'share_id', 'code')
  const returnedEmbedUrl = valueOf(share, 'embedUrl', 'embed_url', 'shareLink', 'share_link', 'liveUrl', 'live_url')
  return {
    id: String(device.id ?? sn),
    aircraftId: sn,
    aircraftName: valueOf(device, 'nickname', 'deviceName', 'name', 'deviceModelName') || sn,
    status: 'ONLINE',
    protocol: playUrl ? liveProtocol(playUrl) : 'OTHER',
    playUrl,
    embedUrl: playUrl ? undefined : (returnedEmbedUrl || shareEmbedUrl(shareCode) || undefined),
    shareCode: shareCode || undefined,
    expiresAt: valueOf(share, 'expiresAt', 'expireAt', 'expireTime') || undefined,
  }
}

export async function getLiveShareCode(sn: string) {
  if (isMockMode()) {
    return { shareCode: 'MOCK-SHARE-CODE', sn }
  }
  return apiClient.post('/v1/uav/live/share-code', { sn })
}

export async function getStatisticsOverview() {
  if (isMockMode()) {
    return {
      flights: 18,
      flightHours: 26.4,
      devicesOnline: 7,
      mediaCount: 1286,
    }
  }
  return apiClient.post('/v1/uav/statistics/overview', {})
}

/** 保留领域模型导出，便于页面后续接入 */
export type { FlightRoute }
