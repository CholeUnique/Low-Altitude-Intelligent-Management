import { createSceneWorkspaceConfig } from './common'

/**
 * 土地供后巡查与履约分析。
 *
 * 前端目前只有任务、地块范围、影像、图斑与成果接口可用；
 * 供地合同、开工/竣工里程碑、履约分析结论需要后端补充接口（见交付说明），
 * 因此「项目匹配」「履约分析」只展示已核实的后端数据，缺失字段明确标注。
 */
export const landSupplyInspectionConfig = createSceneWorkspaceConfig(
  'land-supply-inspection',
  '土地供后巡查与履约分析',
  [
    { key: 'supply-project-matching', name: '项目匹配', shortName: '项目匹配', description: '关联供地项目、地块范围与巡查影像', component: 'SupplyProjectMatching' },
    { key: 'supply-performance-analysis', name: '履约分析', shortName: '履约分析', description: '核对开工、竣工时间与合同履约情况', component: 'SupplyPerformance' },
    { key: 'supply-inspection-dispatch', name: '核查下发', shortName: '核查下发', description: '对进度偏差地块下发现场核查' },
    { key: 'supply-on-site-verification', name: '现场核查', shortName: '现场核查', description: '现场核实建设进度与用地现状，上传影像' },
    { key: 'supply-disposal-archive', name: '处置归档', shortName: '处置归档', description: '记录处置结果并形成履约档案' },
  ],
)
