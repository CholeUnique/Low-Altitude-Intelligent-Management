import type { LiveStream } from '@/adapters/dasFly'
import type { FlightRoute } from '@/mocks/route-planning'
import { createFlightPlans, createRoutesForTask } from '@/mocks/route-planning'
import { createLiveCruiseSnapshot } from '@/mocks/patrol-live'
import { apiClient, useMock } from '@/api/client'
import {
  toFlightPlanList,
  toFlightTaskDetail,
  toLiveStream,
  toMediaList,
  toRouteList,
} from '@/adapters/dasFly'

export interface PageQuery {
  pageNum?: number
  pageSize?: number
  keyword?: string
  projectId?: string
  taskId?: string
  flightTaskId?: string
}

export async function getRoutes(params: PageQuery = {}) {
  if (useMock) {
    return {
      list: createRoutesForTask(),
      total: 2,
    }
  }
  const data = await apiClient.post('/v1/uav/wayline/page', params)
  return toRouteList(data)
}

export async function getRouteDetail(id: string) {
  if (useMock) {
    const list = createRoutesForTask()
    return list.find((item) => item.id === id) || list[0]
  }
  const data = await apiClient.post('/v1/uav/wayline/detail', { id })
  return toRouteList({ records: [data] }).list[0]
}

export async function getFlightPlans(params: PageQuery = {}) {
  if (useMock) {
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
  if (useMock) {
    const routes = createRoutesForTask()
    return createFlightPlans(routes).find((item) => item.id === id)
  }
  return apiClient.post('/v1/uav/flight-plan/detail', { id })
}

export async function getProgressingFlight() {
  if (useMock) {
    return createLiveCruiseSnapshot()
  }
  const data = await apiClient.post('/v1/uav/flight-task/progressing', {})
  if (!Array.isArray(data) || !data.length) return undefined
  return toFlightTaskDetail(data[0])
}

export async function getFlightTaskPage(params: PageQuery = {}) {
  if (useMock) {
    const snap = createLiveCruiseSnapshot()
    return { list: snap.history, total: snap.history.length }
  }
  return apiClient.post('/v1/uav/flight-task/page', params)
}

export async function getFlightTaskDetail(id: string) {
  if (useMock) {
    return createLiveCruiseSnapshot()
  }
  const data = await apiClient.post('/v1/uav/flight-task/detail', { id })
  return toFlightTaskDetail(data)
}

export async function getFlightTaskTrace(flightTaskId: string) {
  if (useMock) {
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
  if (useMock) {
    const snap = createLiveCruiseSnapshot()
    return { list: snap.media, total: snap.media.length }
  }
  const data = await apiClient.post('/v1/uav/flight-task/media/page', params)
  return toMediaList(data)
}

export async function getLiveStreams(): Promise<{ list: LiveStream[]; total: number }> {
  if (useMock) {
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
  // 正式环境：先取正在执行任务，再按设备 SN 换取直播分享码 / 临时播放信息
  const progressing = await apiClient.post('/v1/uav/flight-task/progressing', {})
  if (!Array.isArray(progressing) || !progressing.length) return { list: [], total: 0 }
  return { list: [toLiveStream(progressing[0])], total: 1 }
}

export async function getLiveShareCode(sn: string) {
  if (useMock) {
    return { shareCode: 'MOCK-SHARE-CODE', sn }
  }
  return apiClient.post('/v1/uav/live/share-code', { sn })
}

export async function getStatisticsOverview() {
  if (useMock) {
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
