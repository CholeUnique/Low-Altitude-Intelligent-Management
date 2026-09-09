import type { PortalTask } from '@/types'

export type RouteType = 'ortho' | 'oblique' | 'strip' | 'waypoint' | 'area'

export interface FlightRoute {
  id: string
  name: string
  group: string
  aircraft: string
  routeType: RouteType
  routeTypeLabel: string
  area: string
  status: '草稿' | '已规划' | '已下发' | '已完成'
  waypoints: [number, number][]
  polygon: [number, number][]
  height: number
  speed: number
  overlapFront: number
  overlapSide: number
  createdAt: string
  lengthKm: number
  durationMin: number
  photoEstimate: number
  taskId?: string
}

export interface FlightPlanItem {
  id: string
  date: string
  start: string
  end: string
  title: string
  area: string
  routeId: string
}

export const routeTypeOptions = [
  { group: '测绘航线', items: [
    { key: 'ortho' as const, label: '正射建图', icon: '▦' },
    { key: 'oblique' as const, label: '倾斜建模', icon: '▣' },
    { key: 'strip' as const, label: '带状航线', icon: '〰' },
  ] },
  { group: '巡查航线', items: [
    { key: 'waypoint' as const, label: '航点巡检', icon: '◉' },
    { key: 'area' as const, label: '面状巡检', icon: '⬡' },
  ] },
]

export const aircraftOptions = ['大疆 Mavic 3E', '大疆 Matrice 300 RTK', '大疆 Phantom 4 RTK', '经纬 M30T']

export const routeGroups = ['默认分组', '林业巡查', '专项核查', '日常巡检']

const basePolygon: [number, number][] = [
  [119.88, 32.48],
  [119.97, 32.51],
  [120.02, 32.46],
  [119.96, 32.41],
  [119.89, 32.43],
]

function calcLength(points: [number, number][]) {
  let sum = 0
  for (let i = 1; i < points.length; i += 1) {
    const [lng1, lat1] = points[i - 1]!
    const [lng2, lat2] = points[i]!
    const dx = (lng2 - lng1) * 111.32 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180)
    const dy = (lat2 - lat1) * 110.57
    sum += Math.hypot(dx, dy)
  }
  return Number(sum.toFixed(2))
}

export function createDefaultWaypoints(polygon: [number, number][] = basePolygon): [number, number][] {
  if (polygon.length < 3) return [[119.92, 32.455], [119.95, 32.47], [119.98, 32.45], [119.94, 32.43]]
  const centerLng = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const centerLat = polygon.reduce((s, p) => s + p[1], 0) / polygon.length
  return [
    [centerLng - 0.025, centerLat - 0.01],
    [centerLng - 0.01, centerLat + 0.015],
    [centerLng + 0.01, centerLat + 0.012],
    [centerLng + 0.022, centerLat - 0.005],
    [centerLng + 0.008, centerLat - 0.018],
    [centerLng - 0.012, centerLat - 0.016],
    [centerLng - 0.025, centerLat - 0.01],
  ]
}

export function buildRouteMetrics(waypoints: [number, number][], speed = 8) {
  const lengthKm = calcLength(waypoints)
  const durationMin = Math.max(8, Math.round((lengthKm / speed) * 60))
  return {
    lengthKm,
    durationMin,
    photoEstimate: Math.round(lengthKm * 55 + waypoints.length * 12),
    coverageKm2: Number((lengthKm * 0.48).toFixed(2)),
  }
}

export function createRoutesForTask(task?: PortalTask): FlightRoute[] {
  const polygon = task?.coordinates?.length ? task.coordinates : basePolygon
  const waypoints = createDefaultWaypoints(polygon)
  const metrics = buildRouteMetrics(waypoints)
  return [
    {
      id: `RT-${task?.id?.slice(-6) || '000001'}-A`,
      name: `${task?.area || '西山林区'}主航线`,
      group: '林业巡查',
      aircraft: '大疆 Mavic 3E',
      routeType: 'waypoint',
      routeTypeLabel: '航点巡检',
      area: task?.area || '西山林区片区A',
      status: '已规划',
      waypoints,
      polygon,
      height: 120,
      speed: 8,
      overlapFront: 75,
      overlapSide: 65,
      createdAt: task?.createdAt?.slice(0, 10) || '2026-09-09',
      lengthKm: metrics.lengthKm,
      durationMin: metrics.durationMin,
      photoEstimate: metrics.photoEstimate,
      taskId: task?.id,
    },
    {
      id: `RT-${task?.id?.slice(-6) || '000001'}-B`,
      name: `${task?.area || '西山林区'}备用航线`,
      group: '默认分组',
      aircraft: '大疆 Matrice 300 RTK',
      routeType: 'area',
      routeTypeLabel: '面状巡检',
      area: `${task?.area || '西山林区'}东侧`,
      status: '草稿',
      waypoints: createDefaultWaypoints(polygon.map((p, i) => [p[0] + 0.03, p[1] + (i % 2) * 0.01] as [number, number])),
      polygon: polygon.map((p) => [p[0] + 0.03, p[1]] as [number, number]),
      height: 100,
      speed: 6,
      overlapFront: 70,
      overlapSide: 60,
      createdAt: '2026-09-08',
      lengthKm: 5.24,
      durationMin: 18,
      photoEstimate: 286,
      taskId: task?.id,
    },
  ]
}

export function createHistoryRoutes(task?: PortalTask): FlightRoute[] {
  return [
    {
      id: 'RT-HIS-001',
      name: '西山林区常态化巡查-A线',
      group: '林业巡查',
      aircraft: '大疆 Mavic 3E',
      routeType: 'ortho',
      routeTypeLabel: '正射建图',
      area: '西山林区片区A',
      status: '已完成',
      waypoints: createDefaultWaypoints(),
      polygon: basePolygon,
      height: 120,
      speed: 8,
      overlapFront: 75,
      overlapSide: 65,
      createdAt: '2026-09-01',
      lengthKm: 6.82,
      durationMin: 24,
      photoEstimate: 386,
      taskId: task?.id,
    },
    {
      id: 'RT-HIS-002',
      name: '北岭疑似毁林复核航线',
      group: '专项核查',
      aircraft: '大疆 Phantom 4 RTK',
      routeType: 'waypoint',
      routeTypeLabel: '航点巡检',
      area: '北岭街道',
      status: '已完成',
      waypoints: createDefaultWaypoints(basePolygon.map((p) => [p[0] - 0.05, p[1] + 0.04] as [number, number])),
      polygon: basePolygon.map((p) => [p[0] - 0.05, p[1] + 0.04] as [number, number]),
      height: 110,
      speed: 7,
      overlapFront: 70,
      overlapSide: 60,
      createdAt: '2026-08-28',
      lengthKm: 4.56,
      durationMin: 16,
      photoEstimate: 248,
    },
    {
      id: 'RT-HIS-003',
      name: '清河林地占用专项航线',
      group: '日常巡检',
      aircraft: '经纬 M30T',
      routeType: 'strip',
      routeTypeLabel: '带状航线',
      area: '清河镇',
      status: '已完成',
      waypoints: createDefaultWaypoints(basePolygon.map((p) => [p[0] + 0.06, p[1] - 0.03] as [number, number])),
      polygon: basePolygon.map((p) => [p[0] + 0.06, p[1] - 0.03] as [number, number]),
      height: 130,
      speed: 9,
      overlapFront: 80,
      overlapSide: 70,
      createdAt: '2026-08-20',
      lengthKm: 8.12,
      durationMin: 28,
      photoEstimate: 420,
    },
  ]
}

export function createFlightPlans(routes: FlightRoute[]): FlightPlanItem[] {
  const base = routes[0]
  return [
    { id: 'FP-1', date: '2026-09-09', start: '08:30', end: '09:30', title: base?.name || '主航线巡查', area: base?.area || '片区A', routeId: base?.id || '' },
    { id: 'FP-2', date: '2026-09-09', start: '10:00', end: '11:00', title: '东侧补充采集', area: '片区B', routeId: routes[1]?.id || '' },
    { id: 'FP-3', date: '2026-09-10', start: '09:00', end: '10:20', title: '复核航线执行', area: '片区A', routeId: base?.id || '' },
    { id: 'FP-4', date: '2026-09-11', start: '14:00', end: '15:00', title: '备用航线下发演练', area: '片区C', routeId: routes[1]?.id || '' },
  ]
}

export const planningAlerts = [
  { level: 'success', text: '航线规划已完成，可保存草稿或下发任务' },
  { level: 'info', text: '当前区域为山地丘陵，建议飞行高度不低于 100m' },
  { level: 'warning', text: '请核验航向重叠度与旁向重叠度设置' },
  { level: 'info', text: '未来 24 小时气象适宜飞行' },
]
