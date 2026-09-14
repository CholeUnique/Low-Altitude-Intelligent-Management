import { createSceneWorkspaceConfig } from './common'

export const landSupplyInspectionConfig = createSceneWorkspaceConfig(
  'land-supply-inspection',
  '土地供后巡查与履约分析',
  [
    { key: 'supply-project-matching', name: '项目匹配', shortName: '项目匹配', description: '关联供地项目、合同与巡查范围' },
    { key: 'supply-performance-analysis', name: '履约分析', shortName: '履约分析', description: '分析开工、进度与合同履约情况' },
    { key: 'supply-anomaly-inspection', name: '异常核查', shortName: '异常核查', description: '核查项目进度偏差与异常用地', component: 'TaskDispatch' },
    { key: 'supply-disposal-archive', name: '处置归档', shortName: '处置归档', description: '记录处置结果并形成履约档案' },
  ],
)
