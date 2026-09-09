import type { WorkspaceFieldConfig } from '@/types'

export const forestryConfig: WorkspaceFieldConfig = {
  field: 'forestry',
  name: '林业执法监管',
  modules: [
    { key: 'discovery', name: '低空巡查发现模块' },
    { key: 'governance', name: '治理模块' },
  ],
  nodes: [
    {
      key: 'route-flight-plan',
      name: '航线规划与飞行计划',
      shortName: '航线规划',
      order: 1,
      component: 'RouteFlightPlan',
      description: '规划巡查航线、航点与飞行计划',
      module: 'discovery',
    },
    {
      key: 'realtime-cruise',
      name: '实时巡航',
      shortName: '实时巡航',
      order: 2,
      component: 'RealtimeCruise',
      description: '监控无人机巡航与影像采集状态',
      module: 'discovery',
    },
    {
      key: 'spot-identification',
      name: '问题图斑识别',
      shortName: '图斑识别',
      order: 3,
      component: 'SpotIdentification',
      description: 'AI 识别与人工研判问题图斑',
      module: 'governance',
    },
    {
      key: 'task-dispatch',
      name: '核查任务下发',
      shortName: '任务下发',
      order: 4,
      component: 'TaskDispatch',
      description: '编制核查要求并下发至责任单位',
      module: 'governance',
    },
    {
      key: 'review-archive',
      name: '复核与归档',
      shortName: '复核归档',
      order: 5,
      component: 'ReviewArchive',
      description: '核验整改成果并形成案件档案',
      module: 'governance',
    },
  ],
}

export const WORKSPACE_NODE_KEYS = forestryConfig.nodes.map((node) => node.key)

export function resolveWorkspaceNodeKey(workflow?: { key: string; status: string }[]) {
  if (!workflow?.length) return forestryConfig.nodes[0]!.key
  const active = workflow.find((item) => item.status === 'active')
  if (active && WORKSPACE_NODE_KEYS.includes(active.key)) return active.key
  const done = [...workflow].reverse().find((item) => item.status === 'done' && WORKSPACE_NODE_KEYS.includes(item.key))
  return done?.key ?? forestryConfig.nodes[0]!.key
}

export function getWorkflowNodeStatus(workflow: { key: string; status: string }[] | undefined, key: string) {
  return workflow?.find((item) => item.key === key)?.status ?? 'pending'
}

/** 已完成与当前节点可进入；后续 pending 节点锁定 */
export function isWorkspaceNodeAccessible(workflow: { key: string; status: string }[] | undefined, key: string) {
  if (!WORKSPACE_NODE_KEYS.includes(key)) return false
  if (!workflow?.length) return key === forestryConfig.nodes[0]!.key
  const status = getWorkflowNodeStatus(workflow, key)
  return status === 'done' || status === 'active'
}
