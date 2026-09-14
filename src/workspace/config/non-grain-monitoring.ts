import { createSceneWorkspaceConfig } from './common'

export const nonGrainMonitoringConfig = createSceneWorkspaceConfig(
  'non-grain-monitoring',
  '耕地种植用途管控与“非粮化”动态监测',
  [
    { key: 'non-grain-change-identification', name: '用途变化识别', shortName: '变化识别', description: '识别耕地种植用途与非粮化变化', component: 'SpotIdentification' },
    { key: 'non-grain-assessment', name: '非粮化研判', shortName: '非粮化研判', description: '研判疑似图斑类型与影响范围' },
    { key: 'non-grain-rectification-dispatch', name: '整改下发', shortName: '整改下发', description: '下发核查整改要求和办理期限', component: 'TaskDispatch' },
    { key: 'non-grain-rectification-review', name: '整改复核', shortName: '整改复核', description: '复核整改成果并形成闭环记录', component: 'ReviewArchive' },
  ],
)
