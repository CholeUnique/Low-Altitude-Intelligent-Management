import type { WorkspaceNodeConfig } from '@/types'

/** 平台公共巡查能力：航线规划 → 实时巡航 */
export const COMMON_DISCOVERY_NODES: WorkspaceNodeConfig[] = [
  {
    key: 'route-flight-plan',
    name: '航线规划',
    shortName: '航线规划',
    order: 1,
    module: 'discovery',
    component: 'RouteFlightPlan',
    description: '规划巡查航线、航点与飞行计划',
    externalRoute: '/patrol/route-plan',
  },
  {
    key: 'realtime-cruise',
    name: '实时巡航',
    shortName: '实时巡航',
    order: 2,
    module: 'discovery',
    component: 'RealtimeCruise',
    description: '监控无人机巡航与影像采集状态',
    externalRoute: '/patrol/live',
  },
]
