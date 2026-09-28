import type { SceneWorkspaceConfig } from '@/types'

export const nonGrainMonitoringConfig: SceneWorkspaceConfig = {
  sceneId: 'non-grain-monitoring',
  name: '耕地种植用途管控与“非粮化”动态监测',
  modules: [
    { key: 'governance', name: '非粮化闭环处置模块' },
  ],
  nodes: [
    { key: 'task-acceptance', name: '任务受理', shortName: '任务受理', order: 1, module: 'governance', component: 'ScenePlaceholder', description: '接收非粮化疑似任务并核验基础信息' },
    { key: 'section-preliminary-review', name: '科室初核', shortName: '科室初核', order: 2, module: 'governance', component: 'ScenePlaceholder', description: '由业务科室初核图斑和任务材料' },
    { key: 'department-confirmation', name: '部门确认', shortName: '部门确认', order: 3, module: 'governance', component: 'ScenePlaceholder', description: '确认问题性质、责任主体和办理要求' },
    { key: 'on-site-verification', name: '现场核查', shortName: '现场核查', order: 4, module: 'governance', component: 'ScenePlaceholder', description: '开展现场核查并记录地类、现状和影像' },
    { key: 'rectification-disposal', name: '整改处置', shortName: '整改处置', order: 5, module: 'governance', component: 'ScenePlaceholder', description: '跟踪责任主体整改处置及材料提交' },
    { key: 'drone-review', name: '无人机复核', shortName: '无人机复核', order: 6, module: 'governance', component: 'ScenePlaceholder', description: '通过无人机复飞核验整改结果' },
    { key: 'case-archive', name: '结案归档', shortName: '结案归档', order: 7, module: 'governance', component: 'ScenePlaceholder', description: '汇总全过程材料并完成结案归档' },
  ],
}
