export type AppPermissionKey =
  | 'unit-overview'
  | 'fleet-overview'
  | 'request-ticket'
  | 'route-planning'
  | 'flight-plan'
  | 'live-monitoring'
  | 'smart-recognition'
  | 'algorithm-analysis'
  | 'data-management'
  | 'task-overview'
  | 'task-list'
  | 'task-todo'

export const permissionAliases: Record<AppPermissionKey, string[]> = {
  'unit-overview': ['单位总览', 'UNIT_OVERVIEW', 'MENU_UNIT_OVERVIEW'],
  'fleet-overview': ['机队总览', 'FLEET_OVERVIEW', 'MENU_FLEET_OVERVIEW'],
  'request-ticket': ['需求工单', 'REQUEST_TICKET', 'DEMAND_ORDER', 'MENU_REQUEST_TICKET'],
  'route-planning': ['航线规划', 'ROUTE_PLANNING', 'WAYLINE_PLAN', 'MENU_ROUTE_PLANNING'],
  'flight-plan': ['飞行计划', 'FLIGHT_PLAN', 'MENU_FLIGHT_PLAN'],
  'live-monitoring': ['直播监控', '实时作业', 'LIVE_MONITORING', 'REALTIME_OPERATION', 'MENU_LIVE_MONITORING'],
  'smart-recognition': ['智能识别', 'SMART_RECOGNITION', 'MENU_SMART_RECOGNITION'],
  'algorithm-analysis': ['算法分析', 'ALGORITHM_ANALYSIS', 'MENU_ALGORITHM_ANALYSIS'],
  'data-management': ['数据管理', 'DATA_MANAGEMENT', 'MENU_DATA_MANAGEMENT'],
  'task-overview': ['任务总览', 'TASK_OVERVIEW', 'MENU_TASK_OVERVIEW'],
  'task-list': ['任务列表', 'TASK_LIST', 'MENU_TASK_LIST'],
  'task-todo': ['我的待办', 'TASK_TODO', 'MY_TODO', 'MENU_TASK_TODO'],
}

export const uavTabPermission: Record<string, AppPermissionKey> = {
  fleet: 'fleet-overview', ticket: 'request-ticket', route: 'route-planning',
  plan: 'flight-plan', schedule: 'flight-plan', live: 'live-monitoring',
}

export const recognitionTabPermission: Record<string, AppPermissionKey> = {
  spots: 'smart-recognition', algorithms: 'algorithm-analysis', data: 'data-management',
}

export const taskRoutePermission: Record<string, AppPermissionKey> = {
  'task-overview': 'task-overview', 'task-list': 'task-list', 'task-todo': 'task-todo',
  'task-detail': 'task-list', workspace: 'task-list',
}

export const uavPermissionOrder: Array<{ key: AppPermissionKey; path: string }> = [
  { key: 'fleet-overview', path: '/uav-tasks/fleet' },
  { key: 'request-ticket', path: '/uav-tasks/ticket' },
  { key: 'route-planning', path: '/uav-tasks/route' },
  { key: 'flight-plan', path: '/uav-tasks/schedule' },
  { key: 'live-monitoring', path: '/uav-tasks/live' },
]

export const recognitionPermissionOrder: Array<{ key: AppPermissionKey; path: string }> = [
  { key: 'smart-recognition', path: '/recognition/spots' },
  { key: 'algorithm-analysis', path: '/recognition/algorithms' },
  { key: 'data-management', path: '/recognition/data' },
]

export const taskPermissionOrder: Array<{ key: AppPermissionKey; path: string }> = [
  { key: 'task-overview', path: '/tasks/overview' },
  { key: 'task-list', path: '/tasks/list' },
  { key: 'task-todo', path: '/tasks/todo' },
]

export const appPermissionOrder: Array<{ key: AppPermissionKey; path: string }> = [
  { key: 'unit-overview', path: '/dashboard' },
  ...uavPermissionOrder,
  ...recognitionPermissionOrder,
  ...taskPermissionOrder,
]

export function firstAccessiblePath(hasPermission: (key: AppPermissionKey) => boolean) {
  return appPermissionOrder.find((item) => hasPermission(item.key))?.path || '/forbidden'
}

export function normalizePermissionToken(value: string) {
  return value.trim().toUpperCase().replace(/[\s:_-]+/g, '')
}
