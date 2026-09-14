import { createSceneWorkspaceConfig } from './common'

export const landReclamationConfig = createSceneWorkspaceConfig(
  'land-reclamation',
  '土地复垦全流程监管',
  [
    { key: 'reclamation-monitoring', name: '复垦监测', shortName: '复垦监测', description: '监测复垦工程范围与实施状态' },
    { key: 'reclamation-assessment', name: '完成度评估', shortName: '完成度评估', description: '评估工程完成度与植被恢复情况' },
    { key: 'reclamation-acceptance', name: '验收核查', shortName: '验收核查', description: '开展复垦成果验收与现场核查' },
    { key: 'reclamation-archive', name: '复核归档', shortName: '复核归档', description: '复核验收结果并归集项目档案', component: 'ReviewArchive' },
  ],
)
