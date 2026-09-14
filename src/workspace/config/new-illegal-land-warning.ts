import { createSceneWorkspaceConfig } from './common'

export const newIllegalLandWarningConfig = createSceneWorkspaceConfig(
  'new-illegal-land-warning',
  '新增违法违规用地智能预警',
  [
    { key: 'land-warning-identification', name: '新增用地识别', shortName: '用地识别', description: '识别新增建设与疑似违法用地', component: 'SpotIdentification' },
    { key: 'land-warning-assessment', name: '预警研判', shortName: '预警研判', description: '研判预警真实性与风险等级' },
    { key: 'land-warning-inspection', name: '核查处置', shortName: '核查处置', description: '组织疑似问题现场核查与处置', component: 'TaskDispatch' },
    { key: 'land-warning-closeout', name: '复核销号', shortName: '复核销号', description: '复核处置结果并完成销号', component: 'ReviewArchive' },
  ],
)
