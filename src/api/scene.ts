import { apiClient, isMockMode } from './client'
import type { Scene } from '@/types'

export interface BizSceneMetric {
  code?: string
  name?: string
  unit?: string
  [key: string]: unknown
}

export interface BizSceneResultType {
  code?: string
  name?: string
  [key: string]: unknown
}

export interface BizSceneDto {
  id: string | number
  sceneCode: string
  sceneName: string
  deptId?: string | number
  deptName?: string
  category?: string
  description?: string
  governanceEnabled?: number
  defaultRefType?: string
  metricJson?: string
  metrics?: BizSceneMetric[]
  resultTypes?: BizSceneResultType[]
  sort?: number
  status?: number
  createTime?: string
  updateTime?: string
}

export interface BizSceneListQuery {
  deptId?: string
  keyword?: string
  category?: string
  status?: number | ''
  groupByCategory?: boolean
}

export interface BizSceneInput {
  deptId?: string
  sceneCode: string
  sceneName: string
  category?: string
  description?: string
  governanceEnabled?: number
  defaultRefType?: string
  metricJson?: string
  sort?: number
  status?: number
}

export interface BizSceneUpdateInput extends Omit<Partial<BizSceneInput>, 'sceneCode' | 'status'> {
  id: string
}

export interface BizSceneAssignee {
  sceneCode: string
  sceneName?: string
  deptId?: string | number
  deptName?: string
  assigneeId?: string | number | null
  assigneeName?: string | null
  updateTime?: string
}

/**
 * 页面使用的统一场景字典项。
 * id 在真实模式下为后端业务场景 ID；code 保留后端场景编码，供后续任务接口传参使用。
 */
export interface SceneDictionaryItem {
  id: string
  code: string
  name: string
  shortName: string
  description: string
  category?: string
  enabled: boolean
}

function toSceneDictionaryItem(scene: BizSceneDto): SceneDictionaryItem {
  return {
    id: String(scene.id),
    code: scene.sceneCode,
    name: scene.sceneName,
    shortName: scene.sceneName,
    description: scene.description || '',
    category: scene.category,
    enabled: scene.status === 1,
  }
}

export function toMockSceneDictionaryItem(scene: Scene): SceneDictionaryItem {
  return {
    id: scene.id,
    code: scene.id,
    name: scene.name,
    shortName: scene.shortName,
    description: scene.description,
    enabled: true,
  }
}

/**
 * 获取可选场景。真实模式只读取后端已启用的场景，不在接口异常时回退到 Mock 数据。
 */
export async function getSceneDictionary(mockScenes: Scene[], deptId?: string): Promise<SceneDictionaryItem[]> {
  if (isMockMode()) return mockScenes.map(toMockSceneDictionaryItem)

  // ADMIN 显式传入当前切换后的部门，避免接口回落为默认/全局部门视角。
  const scenes = await apiClient.post<never, BizSceneDto[]>('/v1/biz/scene/list', {
    status: 1,
    deptId: deptId || undefined,
  })
  return scenes.map(toSceneDictionaryItem)
}

function withoutEmptyFilter<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== '')) as T
}

export function getBizSceneList(query: BizSceneListQuery = {}) {
  return apiClient.post<never, BizSceneDto[]>('/v1/biz/scene/list', withoutEmptyFilter(query as Record<string, unknown>))
}

export function getBizSceneDetail(id: string, deptId?: string) {
  return apiClient.post<never, BizSceneDto>('/v1/biz/scene/detail', { id, deptId })
}

export function addBizScene(input: BizSceneInput) {
  return apiClient.post<never, void>('/v1/biz/scene/add', input)
}

export function updateBizScene(input: BizSceneUpdateInput) {
  return apiClient.post<never, void>('/v1/biz/scene/update', input)
}

export function updateBizSceneStatus(id: string, status: number, deptId?: string) {
  return apiClient.post<never, void>('/v1/biz/scene/status', { id, status, deptId })
}

export function deleteBizScene(id: string, deptId?: string) {
  return apiClient.post<never, void>('/v1/biz/scene/delete', { id, deptId })
}

export function getBizSceneAssignees(deptId?: string, sceneCode?: string) {
  return apiClient.post<never, BizSceneAssignee[]>('/v1/biz/scene/assignee/query', { deptId, sceneCode })
}

export function addBizSceneAssignee(sceneCode: string, assigneeId: string, deptId?: string) {
  return apiClient.post<never, void>('/v1/biz/scene/assignee/add', { deptId, sceneCode, assigneeId })
}

export function updateBizSceneAssignee(sceneCode: string, assigneeId: string, deptId?: string) {
  return apiClient.post<never, void>('/v1/biz/scene/assignee/update', { deptId, sceneCode, assigneeId })
}
