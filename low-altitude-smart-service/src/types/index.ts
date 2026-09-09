export type EntityId = string
export type AsyncStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'

export interface ApiResponse<T> {
  code: number | string
  message: string
  data: T
  traceId?: string
}

export interface WorkspaceNodeConfig {
  key: string
  name: string
  shortName: string
  order: number
  component: string
  description: string
  module: 'discovery' | 'governance'
}

export interface WorkspaceFieldConfig {
  field: string
  name: string
  nodes: WorkspaceNodeConfig[]
  modules: { key: 'discovery' | 'governance'; name: string }[]
}

export interface WorkflowEvent {
  id: string
  time: string
  type: string
  name: string
  operator?: string
  description?: string
}

export interface TaskItem {
  id: EntityId
  name: string
  field?: string
  organizationId?: string
  sceneId?: string
  area: string
  status: string
  progress: number
  owner: string
  updatedAt: string
}

export type OrganizationId = 'natural-resources' | 'agriculture-rural'
export type RoleId = 'admin' | 'staff'
export type TaskPriority = '高' | '中' | '低'

export interface Role {
  id: RoleId
  name: string
  description: string
  permissions: string[]
}

export interface Scene {
  id: string
  name: string
  shortName: string
  icon: string
  description: string
  workspaceEnabled: boolean
}

export interface Organization {
  id: OrganizationId
  name: string
  shortName: string
  description: string
  scenes: Scene[]
  overview: {
    onlineDrones: number
    totalDrones: number
    todayTasks: number
    pendingTasks: number
    completionRate: number
    deployedAlgorithms: number
    todayIdentifications: number
    accuracyRate: number
  }
}

export interface TaskWorkflowNode {
  key: string
  name: string
  status: 'done' | 'active' | 'pending'
  time?: string
}

export interface PortalTask {
  id: string
  organizationId: OrganizationId
  sceneId: string
  name: string
  status: string
  priority: TaskPriority
  area: string
  areaSize: number
  owner: string
  assignee: string
  createdAt: string
  updatedAt: string
  plannedStart: string
  plannedEnd: string
  progress: number
  description: string
  contact: string
  phone: string
  resultRequirements: string[]
  coordinates: [number, number][]
  workflow: TaskWorkflowNode[]
  metrics: {
    flights: number
    flightHours: number
    patrolArea: number
    issues: number
    completedNodes: number
    totalNodes: number
  }
}

export interface PortalAlert {
  id: string
  organizationId: OrganizationId
  sceneId: string
  level: 'high' | 'medium' | 'low'
  title: string
  description: string
  time: string
}

export interface PortalCase {
  id: string
  organizationId: OrganizationId
  sceneId: string
  taskId: string
  title: string
  date: string
  image: string
}

export interface PortalData {
  roles: Role[]
  organizations: Organization[]
  tasks: PortalTask[]
  alerts: PortalAlert[]
  cases: PortalCase[]
}

export interface DashboardMapTask {
  taskId: string
  name: string
  area: string
  status: string
  center: [number, number]
  polygon: [number, number][]
}

export interface DashboardMapLayer {
  id: string
  name: string
  color: string
  count: number
  tasks: DashboardMapTask[]
}

export interface DronePatrolRoute {
  id: string
  name: string
  droneId: string
  status: string
  progress: number
  coordinates: [number, number][]
}

export interface AlgorithmModel {
  id: string
  name: string
  scene: string
  type: 'AI算法' | '大模型'
  category: string
  status: '已部署' | '在线'
  description: string
  tags: string[]
  supportedMedia: string[]
  visual: string
  recommended?: boolean
  comparison?: { before: string; after: string }
}
