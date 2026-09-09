import type { WorkspaceFieldConfig } from '@/types'

export const forestryConfig: WorkspaceFieldConfig = {
  field: 'forestry',
  name: '林业执法监管',
  nodes: [
    { key: 'route-planning', name: '地理底图与航线规划', shortName: '航线规划', order: 1, component: 'RoutePlanning', description: '规划巡查区域、航点与安全航线' },
    { key: 'cruise-capture', name: '无人机巡航与影像采集', shortName: '巡航采集', order: 2, component: 'CruiseCapture', description: '监控飞行状态与实时影像采集' },
    { key: 'change-detection', name: '多期影像变化监测', shortName: '变化监测', order: 3, component: 'ChangeDetection', description: '对比多期影像并提取变化图斑' },
    { key: 'spot-identification', name: '问题图斑识别', shortName: '图斑识别', order: 4, component: 'SpotIdentification', description: 'AI 识别与人工研判问题图斑' },
    { key: 'task-dispatch', name: '核查任务下发', shortName: '任务下发', order: 5, component: 'TaskDispatch', description: '编制核查要求并下发至责任单位' },
    { key: 'review-archive', name: '复核与归档', shortName: '复核归档', order: 6, component: 'ReviewArchive', description: '核验整改成果并形成案件档案' },
  ],
}
