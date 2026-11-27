import type { SceneWorkspaceConfig } from '@/types'
import { landFlowDefinition } from '@/utils/land-workflow'
export const existingIllegalLandRectificationConfig: SceneWorkspaceConfig = {
  sceneId: 'existing-illegal-land-rectification', name: '全称监测违法违规用地整改',
  modules: [{ key: 'governance', name: '整改销号' }],
  nodes: [{key:'ACCEPTANCE',name:'任务受理'},...landFlowDefinition('STOCK_ILLEGAL_LAND_RECTIFY').nodes].map((node,order)=>({key:node.key,name:node.name,shortName:node.name,order,module:'governance',component:'LandSupervision'})),
}
