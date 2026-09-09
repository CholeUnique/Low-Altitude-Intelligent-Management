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
}

export interface WorkspaceFieldConfig {
  field: string
  name: string
  nodes: WorkspaceNodeConfig[]
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
  field: string
  area: string
  status: string
  progress: number
  owner: string
  updatedAt: string
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
