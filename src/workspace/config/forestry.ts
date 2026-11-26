import type { SceneWorkspaceConfig } from '@/types'
import { COMMON_DISCOVERY_NODES } from './common'

export const forestryConfig: SceneWorkspaceConfig = {
  sceneId: 'forestry-enforcement',
  name: '林业执法监管',
  modules: [
    { key: 'discovery', name: '低空巡查发现模块' },
    { key: 'governance', name: '治理模块' },
  ],
  nodes: [
    ...COMMON_DISCOVERY_NODES,
    {
      key: 'spot-identification',
      name: '图斑识别',
      shortName: '图斑识别',
      order: 3,
      module: 'governance',
      component: 'SpotIdentification',
      description: 'AI 识别与人工研判问题图斑',
    },
    {
      key: 'task-dispatch',
      name: '区县分局派发',
      shortName: '区县分局派发',
      order: 4,
      module: 'governance',
      component: 'TaskDispatch',
      description: '编制核查要求并下发至责任单位',
    },
    {
      key: 'section-dispatch', name: '科室派发', shortName: '科室派发', order: 5,
      module: 'governance', component: 'TaskDispatch', description: '指定现场核查办理人',
    },
    {
      key: 'field-inspection',
      name: '实地考察',
      shortName: '实地考察',
      order: 6,
      module: 'governance',
      component: 'FieldInspection',
      description: '现场核查图斑、取证并形成核查结论',
    },
    {
      key: 'section-audit', name: '科室审核', shortName: '科室审核', order: 7,
      module: 'governance', component: 'ScenePlaceholder', description: '审核现场核查结论',
    },
    {
      key: 'forest-rectify', name: '线下整改', shortName: '线下整改', order: 8,
      module: 'governance', component: 'ScenePlaceholder', description: '记录整改及材料',
    },
    {
      key: 'section-recheck', name: '科室复核', shortName: '科室复核', order: 9,
      module: 'governance', component: 'ScenePlaceholder', description: '复核整改结果',
    },
    {
      key: 'forest-finish', name: '结束', shortName: '结束', order: 10,
      module: 'governance', component: 'ScenePlaceholder', description: '确认结束任务',
    },
    {
      key: 'review-archive',
      name: '科室验收结案',
      shortName: '验收结案',
      order: 11,
      module: 'governance',
      component: 'ReviewArchive',
      description: '核验整改成果并形成案件档案',
    },
  ],
}
