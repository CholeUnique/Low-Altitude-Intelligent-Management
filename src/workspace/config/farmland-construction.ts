import { createSceneWorkspaceConfig } from './common'

export const farmlandConstructionConfig = createSceneWorkspaceConfig(
  'farmland-construction',
  '高标准农田在建工程巡查',
  [
    { key: 'construction-progress-identification', name: '进度识别', shortName: '进度识别', description: '识别在建工程实际进度与范围' },
    { key: 'construction-quality-safety', name: '质量安全检查', shortName: '质量安全', description: '检查工程质量与施工安全风险' },
    { key: 'construction-rectification-dispatch', name: '整改下发', shortName: '整改下发', description: '下发质量安全问题整改任务', component: 'TaskDispatch' },
    { key: 'construction-acceptance-archive', name: '验收归档', shortName: '验收归档', description: '验收整改成果并归集工程档案', component: 'ReviewArchive' },
  ],
)
