import type { SceneWorkspaceConfig } from '@/types'
import { existingIllegalLandRectificationConfig } from './existing-illegal-land-rectification'
import { farmlandConstructionConfig } from './farmland-construction'
import { farmlandFacilitiesConfig } from './farmland-facilities'
import { forestryConfig } from './forestry'
import { landReclamationConfig } from './land-reclamation'
import { landSupplyInspectionConfig } from './land-supply-inspection'
import { newIllegalLandWarningConfig } from './new-illegal-land-warning'
import { nonGrainMonitoringConfig } from './non-grain-monitoring'
import { plantingSubsidyConfig } from './planting-subsidy'
import { pondInspectionConfig } from './pond-inspection'
import { yangtzeFishingBanConfig } from './yangtze-fishing-ban'

const workspaceRegistry: Record<string, SceneWorkspaceConfig> = {
  [forestryConfig.sceneId]: forestryConfig,
  [newIllegalLandWarningConfig.sceneId]: newIllegalLandWarningConfig,
  [existingIllegalLandRectificationConfig.sceneId]: existingIllegalLandRectificationConfig,
  [landSupplyInspectionConfig.sceneId]: landSupplyInspectionConfig,
  [landReclamationConfig.sceneId]: landReclamationConfig,
  [nonGrainMonitoringConfig.sceneId]: nonGrainMonitoringConfig,
  [plantingSubsidyConfig.sceneId]: plantingSubsidyConfig,
  [pondInspectionConfig.sceneId]: pondInspectionConfig,
  [yangtzeFishingBanConfig.sceneId]: yangtzeFishingBanConfig,
  [farmlandFacilitiesConfig.sceneId]: farmlandFacilitiesConfig,
  [farmlandConstructionConfig.sceneId]: farmlandConstructionConfig,
}

export function getWorkspaceConfig(sceneId: string): SceneWorkspaceConfig | undefined {
  return workspaceRegistry[sceneId]
}

/**
 * 所有场景统一复用已完成的“林业执法监管”五节点工作台流程与页面。
 * 场景名称、任务、范围和异常图斑数据仍按当前任务自身读取。
 */
export function getSharedWorkspaceConfig(): SceneWorkspaceConfig {
  return forestryConfig
}

/**
 * 真实业务任务使用后端 sceneCode，旧工作台配置使用前端 sceneId。
 * 这里集中维护两者的映射，避免任务进入工作台后丢失五节点流程。
 */
const sceneAliases: Record<string, string> = {
  '林业执法': 'forestry-enforcement',
  '林业执法监管': 'forestry-enforcement',
  FORESTRY: 'forestry-enforcement',
  FOREST_LAW: 'forestry-enforcement',
  FOREST_LAW_ENFORCE: 'forestry-enforcement',
  FOREST_LAW_ENFORCEMENT: 'forestry-enforcement',
  '新增用地预警': 'new-illegal-land-warning',
  '新增违法违规用地智能预警': 'new-illegal-land-warning',
  ILLEGAL_LAND_EARLY_WARN: 'new-illegal-land-warning',
  ILLEGAL_LAND_EARLY_WARNING: 'new-illegal-land-warning',
  NEW_ILLEGAL_LAND_WARNING: 'new-illegal-land-warning',
  '存量用地整改': 'existing-illegal-land-rectification',
  '存量违法用地整改': 'existing-illegal-land-rectification',
  EXISTING_ILLEGAL_LAND_RECTIFICATION: 'existing-illegal-land-rectification',
  '供后巡查': 'land-supply-inspection',
  LAND_SUPPLY_INSPECTION: 'land-supply-inspection',
  '土地复垦': 'land-reclamation',
  LAND_RECLAMATION: 'land-reclamation',
  '非粮化': 'non-grain-monitoring',
  '非粮化监测': 'non-grain-monitoring',
  '耕地种植用途管控与“非粮化”动态监测': 'non-grain-monitoring',
  NON_GRAIN: 'non-grain-monitoring',
  NON_GRAIN_MONITORING: 'non-grain-monitoring',
  '种植补贴': 'planting-subsidy',
  '种植面积精准核定与惠农补贴监管': 'planting-subsidy',
  PLANTING_SUBSIDY: 'planting-subsidy',
  '塘口建档': 'pond-archive',
  '塘口全域巡检与“一塘一档”数字建档': 'pond-archive',
  POND_ARCHIVE: 'pond-archive',
  '长江禁捕': 'yangtze-fishing-ban',
  '长江禁捕全流程闭环执法': 'yangtze-fishing-ban',
  YANGTZE_FISHING_BAN: 'yangtze-fishing-ban',
  '农田设施': 'farmland-facilities',
  '高标准农田工程设施管理': 'farmland-facilities',
  FARMLAND_FACILITIES: 'farmland-facilities',
  '在建农田': 'farmland-construction',
  '高标准农田在建工程管理': 'farmland-construction',
  FARMLAND_CONSTRUCTION: 'farmland-construction',
}

export function resolveWorkspaceSceneId(sceneCode: string, sceneName?: string): string {
  if (workspaceRegistry[sceneCode]) return sceneCode
  const direct = sceneAliases[sceneCode] || sceneAliases[sceneName || '']
  if (direct) return direct

  const source = `${sceneCode} ${sceneName || ''}`.toLowerCase()
  const matching = Object.values(workspaceRegistry).find((config) =>
    source.includes(config.sceneId.toLowerCase()) || source.includes(config.name.toLowerCase()),
  )
  return matching?.sceneId || sceneCode
}

export function listWorkspaceConfigs(): SceneWorkspaceConfig[] {
  return Object.values(workspaceRegistry)
}
