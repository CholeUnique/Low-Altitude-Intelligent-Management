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
      name: '任务下发',
      shortName: '任务下发',
      order: 4,
      module: 'governance',
      component: 'TaskDispatch',
      description: '编制核查要求并下发至责任单位',
    },
    {
      key: 'review-archive',
      name: '复核归档',
      shortName: '复核归档',
      order: 5,
      module: 'governance',
      component: 'ReviewArchive',
      description: '核验整改成果并形成案件档案',
    },
  ],
}
