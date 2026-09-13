import type { PortalTask } from '@/types'

export interface LiveTelemetry {
  altitude: number
  speed: number
  heading: number
  battery: number
  gps: string
  rcLink: string
  videoLink: string
}

export interface LiveMediaItem {
  id: string
  name: string
  capturedAt: string
  thumbnail: string
}

export interface LiveEventItem {
  id: string
  time: string
  type: string
  message: string
}

export interface LivePlanItem {
  id: string
  title: string
  start: string
  area: string
  status: string
}

export interface LiveHistoryItem {
  id: string
  title: string
  date: string
  durationMin: number
  distanceKm: number
  status: string
}

export interface LiveCruiseSnapshot {
  flightId: string
  aircraftName: string
  aircraftId: string
  taskName: string
  area: string
  status: string
  progress: number
  routeCoordinates: [number, number][]
  flownIndex: number
  dronePosition: [number, number]
  telemetry: LiveTelemetry
  liveStatus: 'ONLINE' | 'OFFLINE' | 'STARTING' | 'ERROR'
  media: LiveMediaItem[]
  events: LiveEventItem[]
  pendingPlans: LivePlanItem[]
  history: LiveHistoryItem[]
}

const baseRoute: [number, number][] = [
  [119.88, 32.48],
  [119.91, 32.50],
  [119.94, 32.49],
  [119.97, 32.51],
  [120.00, 32.48],
  [119.96, 32.45],
  [119.92, 32.44],
]

export function createLiveCruiseSnapshot(task?: PortalTask): LiveCruiseSnapshot {
  const route = task?.coordinates?.length ? task.coordinates : baseRoute
  const flownIndex = Math.min(3, Math.max(1, route.length - 2))
  return {
    flightId: `FL-${task?.id?.slice(-6) || 'LIVE01'}`,
    aircraftName: '大疆 Matrice 300 RTK',
    aircraftId: 'UAV-D3-017',
    taskName: task?.name || '西山林区常态化巡查',
    area: task?.area || '西山林区片区A',
    status: '巡航中',
    progress: 46,
    routeCoordinates: route,
    flownIndex,
    dronePosition: route[flownIndex] || route[0]!,
    telemetry: {
      altitude: 118,
      speed: 8.6,
      heading: 126,
      battery: 72,
      gps: 'RTK 固定解 · 18 星',
      rcLink: '良好 96%',
      videoLink: '4K · 稳定',
    },
    liveStatus: 'ONLINE',
    media: [
      { id: 'M1', name: 'IMG_0908_128.JPG', capturedAt: '10:12:18', thumbnail: 'forest' },
      { id: 'M2', name: 'IMG_0908_129.JPG', capturedAt: '10:12:42', thumbnail: 'field' },
      { id: 'M3', name: 'IMG_0908_130.JPG', capturedAt: '10:13:05', thumbnail: 'river' },
      { id: 'M4', name: 'IMG_0908_131.JPG', capturedAt: '10:13:28', thumbnail: 'forest' },
    ],
    events: [
      { id: 'E1', time: '10:08:02', type: '起飞', message: '无人机已起飞并进入巡航航线' },
      { id: 'E2', time: '10:09:15', type: '航点', message: '到达航点 WP-02，云台锁定正射' },
      { id: 'E3', time: '10:11:40', type: '采集', message: '连续拍照模式开启，预计 386 张' },
      { id: 'E4', time: '10:13:05', type: '告警', message: '局部风速 6.2 m/s，仍在安全阈值' },
    ],
    pendingPlans: [
      { id: 'P1', title: '东侧补充采集', start: '11:00', area: '片区B', status: '待执行' },
      { id: 'P2', title: '北岭复核航线', start: '14:30', area: '北岭街道', status: '待执行' },
    ],
    history: [
      { id: 'H1', title: '西山林区常态化巡查-A线', date: '2026-09-01', durationMin: 24, distanceKm: 6.82, status: '已完成' },
      { id: 'H2', title: '北岭疑似毁林复核', date: '2026-08-28', durationMin: 16, distanceKm: 4.56, status: '已完成' },
      { id: 'H3', title: '清河林地占用专项', date: '2026-08-20', durationMin: 28, distanceKm: 8.12, status: '已完成' },
    ],
  }
}
