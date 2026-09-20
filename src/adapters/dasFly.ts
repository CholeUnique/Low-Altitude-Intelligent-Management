/**
 * 低空大师 / 本系统 UAV 接口 → 前端领域模型转换。
 * 供应商 DTO 变化时只改本文件，不改 Vue 页面。
 */

import type { FlightPlanItem, FlightRoute } from '@/mocks/route-planning'
import type { LiveCruiseSnapshot, LiveMediaItem } from '@/mocks/patrol-live'

export interface LiveStream {
  id: string
  aircraftId: string
  aircraftName?: string
  flightId?: string
  status: 'ONLINE' | 'OFFLINE' | 'STARTING' | 'ERROR'
  protocol: 'HLS' | 'FLV' | 'WEBRTC' | 'OTHER'
  playUrl: string
  /** 供应商返回的可嵌入直播页；没有直连流地址时使用。 */
  embedUrl?: string
  shareCode?: string
  expiresAt?: string
}

function asRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (!payload || typeof payload !== 'object') return []
  const data = payload as Record<string, unknown>
  if (Array.isArray(data.records)) return data.records as Record<string, unknown>[]
  if (Array.isArray(data.list)) return data.list as Record<string, unknown>[]
  if (Array.isArray(data.data)) return data.data as Record<string, unknown>[]
  if (data.data && typeof data.data === 'object') {
    const nested = data.data as Record<string, unknown>
    if (Array.isArray(nested.records)) return nested.records as Record<string, unknown>[]
    if (Array.isArray(nested.list)) return nested.list as Record<string, unknown>[]
  }
  return []
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

type Coordinate = [number, number]

function coordinateOf(value: unknown): Coordinate | undefined {
  if (Array.isArray(value) && value.length >= 2) {
    const [lng, lat] = value
    if (typeof lng === 'number' && typeof lat === 'number' && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) return [lng, lat]
  }
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const lng = record.lng ?? record.lon ?? record.longitude
  const lat = record.lat ?? record.latitude
  if (typeof lng === 'number' && typeof lat === 'number' && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) return [lng, lat]
  return undefined
}

function coordinatePath(value: unknown): Coordinate[] {
  const parsed = parseJson(value)
  const direct = coordinateOf(parsed)
  if (direct) return [direct]
  if (Array.isArray(parsed)) {
    const directPoints = parsed.map(coordinateOf)
    if (directPoints.every(Boolean)) return directPoints as Coordinate[]
    return parsed.flatMap((item) => coordinatePath(item))
  }
  if (!parsed || typeof parsed !== 'object') return []
  const record = parsed as Record<string, unknown>
  if (record.type === 'FeatureCollection' && Array.isArray(record.features)) return coordinatePath(record.features)
  if (record.type === 'Feature' && record.geometry) return coordinatePath(record.geometry)
  if (record.coordinates) return coordinatePath(record.coordinates)
  if (record.geometry) return coordinatePath(record.geometry)
  if (record.waypoints) return coordinatePath(record.waypoints)
  if (record.points) return coordinatePath(record.points)
  return []
}

function routeTypeOf(value: unknown): FlightRoute['routeType'] {
  const type = String(value || '').toUpperCase()
  if (type.includes('MAPPING2D') || type.includes('MAPPING_2D') || type.includes('ORTHO')) return 'ortho'
  if (type.includes('MAPPING3D') || type.includes('MAPPING_3D') || type.includes('OBLIQUE')) return 'oblique'
  if (type.includes('STRIP') || type.includes('LINEAR')) return 'strip'
  if (type.includes('AREA')) return 'area'
  return 'waypoint'
}

function routeTypeLabel(type: FlightRoute['routeType']) {
  return ({ ortho: '正射建图', oblique: '倾斜建模', strip: '带状航线', waypoint: '航点巡检', area: '面状巡检' } as const)[type]
}

function totalOf(payload: unknown, fallback: number) {
  if (!payload || typeof payload !== 'object') return fallback
  const data = payload as Record<string, unknown>
  const nested = data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : data
  const total = nested.total ?? nested.totalCount ?? nested.count
  return typeof total === 'number' || typeof total === 'string' ? Number(total) : fallback
}

export function toRouteList(payload: unknown): { list: FlightRoute[]; total: number } {
  const records = asRecords(payload)
  const list = records.map((item, index) => {
    const routeType = routeTypeOf(item.waylineType ?? item.type)
    const waypoints = coordinatePath(item.locationJson ?? item.waypoints ?? item.coordinates)
    const lastWaypoint = waypoints[waypoints.length - 1]
    const isClosed = waypoints.length > 3 && waypoints[0]?.[0] === lastWaypoint?.[0] && waypoints[0]?.[1] === lastWaypoint?.[1]
    const id = String(item.id ?? item.projectId ?? `ROUTE-${index + 1}`)
    return {
      id,
      name: String(item.name ?? item.waylineName ?? `航线 ${index + 1}`),
      group: String(item.folderName ?? item.groupName ?? '默认分组'),
      aircraft: String(item.deviceModelName ?? item.aircraftName ?? item.droneModelKey ?? '待绑定飞行器'),
      routeType,
      routeTypeLabel: routeTypeLabel(routeType),
      area: String(item.areaName ?? item.regionName ?? '-'),
      status: '已规划' as const,
      waypoints,
      polygon: isClosed ? waypoints.slice(0, -1) : [],
      height: Number(item.flightHeight ?? item.height ?? 120),
      speed: Number(item.flightSpeed ?? item.speed ?? 8),
      overlapFront: 75,
      overlapSide: 65,
      createdAt: String(item.createTime ?? item.createdAt ?? '').slice(0, 10),
      lengthKm: Number(item.flightDistance ?? item.lengthKm ?? 0) / (item.flightDistance ? 1000 : 1),
      durationMin: Number(item.expectedDuration ?? item.durationMin ?? 0) / (item.expectedDuration ? 60 : 1),
      photoEstimate: Number(item.photoEstimate ?? 0),
      taskId: item.taskId ? String(item.taskId) : undefined,
    } satisfies FlightRoute
  })
  return { list, total: totalOf(payload, list.length) }
}

export function toFlightPlanList(payload: unknown): { list: FlightPlanItem[]; total: number } {
  const records = asRecords(payload)
  const list = records.map((item, index) => ({
    id: String(item.id ?? item.flightPlanId ?? `FP-${index + 1}`),
    projectId: item.projectId === undefined ? undefined : String(item.projectId),
    date: String(item.executeDate ?? item.planDate ?? item.createTime ?? '').slice(0, 10),
    start: String(item.executeTime ?? item.startTime ?? '08:00').slice(0, 5),
    end: String(item.endTime ?? item.finishTime ?? '09:00').slice(0, 5),
    title: String(item.name ?? item.planName ?? `飞行计划 ${index + 1}`),
    area: String(item.waylineName ?? item.areaName ?? item.regionName ?? '-'),
    routeId: String(item.routeId ?? item.waylineId ?? ''),
  }))
  return { list, total: totalOf(payload, list.length) }
}

export interface PatrolProjectOption {
  id: string
  name: string
}

export function toProjectOptions(payload: unknown): PatrolProjectOption[] {
  return asRecords(payload).map((item, index) => ({
    id: String(item.id ?? item.projectId ?? index + 1),
    name: String(item.name ?? item.projectName ?? `项目 ${index + 1}`),
  }))
}

export function toFlightTaskDetail(payload: unknown): Partial<LiveCruiseSnapshot> {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  return {
    flightId: String(root.id ?? root.flightTaskId ?? ''),
    aircraftName: String(root.droneType ?? root.deviceType ?? root.aircraftName ?? ''),
    aircraftId: String(root.droneSn ?? root.sn ?? root.aircraftSn ?? ''),
    taskName: String(root.name ?? root.taskName ?? ''),
    area: String(root.waylineName ?? root.areaName ?? ''),
    status: String(root.progressing === 1 ? '巡航中' : root.statusName ?? root.status ?? '待执行'),
    progress: Number(root.progress ?? root.percent ?? (root.progressing === 1 ? 50 : 0)),
    liveStatus: 'ONLINE',
  }
}

export function toMediaList(payload: unknown): { list: LiveMediaItem[]; total: number } {
  const records = asRecords(payload)
  const list = records.map((item, index) => ({
    id: String(item.id ?? item.mediaId ?? `MEDIA-${index + 1}`),
    name: String(item.fileName ?? item.name ?? `IMG_${index + 1}.JPG`),
    capturedAt: String(item.capturedAt ?? item.createTime ?? '').slice(11, 19) || '--:--:--',
    thumbnail: String(item.thumbnailUrl ?? item.previewUrl ?? 'forest'),
  }))
  return { list, total: totalOf(payload, list.length) }
}

export function toLiveStream(payload: unknown): LiveStream {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  return {
    id: String(root.id ?? root.flightTaskId ?? 'live-1'),
    aircraftId: String(root.droneSn ?? root.sn ?? root.aircraftSn ?? ''),
    aircraftName: String(root.droneType ?? root.deviceType ?? root.aircraftName ?? ''),
    flightId: String(root.id ?? root.flightTaskId ?? ''),
    status: 'ONLINE',
    protocol: 'HLS',
    playUrl: String(root.playUrl ?? root.streamUrl ?? ''),
    expiresAt: root.expiresAt ? String(root.expiresAt) : undefined,
  }
}
