import type { SceneWorkspaceConfig } from '@/types'
import { forestryConfig } from './forestry'

const workspaceRegistry: Record<string, SceneWorkspaceConfig> = {
  [forestryConfig.sceneId]: forestryConfig,
}

export function getWorkspaceConfig(sceneId: string): SceneWorkspaceConfig | undefined {
  return workspaceRegistry[sceneId]
}

export function listWorkspaceConfigs(): SceneWorkspaceConfig[] {
  return Object.values(workspaceRegistry)
}
