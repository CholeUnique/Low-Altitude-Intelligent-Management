import type { SceneWorkspaceConfig } from '@/types'

/** 扫码报修以设施为中心，不经过无人机巡查与异常图斑节点。 */
export const FARMLAND_FACILITY_STEPS = [
  { key: 'task-acceptance', name: '任务受理', description: '核对扫码报修及设施信息' },
  { key: 'department-review', name: '部门审核', description: '核实责任、分级并派单' },
  { key: 'on-site-verification', name: '现场核查', description: '现场确认故障并记录维修处置' },
  { key: 'department-recheck', name: '部门复核', description: '核验维修结果或退回重修' },
  { key: 'case-archive', name: '结案归档', description: '汇总证据并固化处置记录' },
] as const

export const farmlandFacilitiesConfig: SceneWorkspaceConfig = {
  sceneId: 'farmland-facilities',
  name: '高标田工程设施管理',
  modules: [{ key: 'governance', name: '扫码报修处置' }],
  nodes: FARMLAND_FACILITY_STEPS.map((step, index) => ({
    ...step,
    shortName: step.name,
    order: index + 1,
    module: 'governance',
    component: 'FarmlandFacilities',
  })),
}
