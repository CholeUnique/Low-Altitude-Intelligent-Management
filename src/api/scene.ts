import { apiClient, isMockMode } from './client'
import type { Scene } from '@/types'

interface BizSceneDto {
  id: string | number
  sceneCode: string
  sceneName: string
  category?: string
  description?: string
  status?: number
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
