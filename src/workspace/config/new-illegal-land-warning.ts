import type { SceneWorkspaceConfig } from '@/types'
import { landFlowDefinition } from '@/utils/land-workflow'
export const newIllegalLandWarningConfig: SceneWorkspaceConfig = {
  sceneId: 'new-illegal-land-warning', name: '新增违法违规用地智能预警',
  modules: [{ key: 'governance', name: '预警核查' }],
  nodes: [{key:'ACCEPTANCE',name:'任务受理'},...landFlowDefinition('ILLEGAL_LAND_EARLY_WARN').nodes].map((node,order)=>({key:node.key,name:node.name,shortName:node.name,order,module:'governance',component:'LandSupervision'})),
}
