import { createSceneWorkspaceConfig } from './common'

export const farmlandFacilitiesConfig = createSceneWorkspaceConfig(
  'farmland-facilities',
  '高标准农田设施常态化巡检',
  [
    { key: 'facility-identification', name: '设施识别', shortName: '设施识别', description: '识别沟渠、道路等农田设施' },
    { key: 'facility-status-assessment', name: '状态评估', shortName: '状态评估', description: '评估设施完好度与运行状态' },
    { key: 'facility-repair-dispatch', name: '维修下发', shortName: '维修下发', description: '下发设施维修与养护任务', component: 'TaskDispatch' },
    { key: 'facility-repair-review', name: '复核归档', shortName: '复核归档', description: '复核维修成果并更新设施档案', component: 'ReviewArchive' },
  ],
)
