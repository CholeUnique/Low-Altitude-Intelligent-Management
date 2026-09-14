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

export function listWorkspaceConfigs(): SceneWorkspaceConfig[] {
  return Object.values(workspaceRegistry)
}
