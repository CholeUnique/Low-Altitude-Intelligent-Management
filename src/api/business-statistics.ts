import { apiClient, isMockMode } from './client'

export interface BusinessStatisticsQuery {
  deptId?: string
  sceneCode?: string
  startTime?: string
  endTime?: string
  days?: number
}

export interface BusinessStatItem {
  key: string
  name: string
  count: number
  value?: number | null
}

export interface BusinessOverview {
  sceneCount: number
  taskCount: number
  taskPending: number
  taskExecuting: number
  taskPendingVerify: number
  taskFailed: number
  taskCanceled: number
  taskFinished: number
  abnormalCount: number
  abnormalPendingCount: number
  /** 异常图斑总面积，单位 m²。 */
  abnormalArea: number
  resultCount: number
  geometryCount: number
  abnormalTypeCounts: BusinessStatItem[]
  abnormalLevelCounts: BusinessStatItem[]
}

export interface BusinessSceneMetric {
  key: string
  name: string
  value: number
  unit?: string
}

export interface BusinessSceneStat {
  sceneId: string
  sceneCode: string
  sceneName: string
  category?: string
  taskCount: number
  abnormalCount: number
  /** 异常图斑总面积，单位 m²。 */
  abnormalArea: number
  resultCount: number
  metrics: BusinessSceneMetric[]
}

export interface BusinessTaskSummary {
  total: number
  pending: number
  executing: number
  pendingVerify: number
  failed: number
  canceled: number
  finished: number
}

export interface BusinessAbnormalSummary {
  total: number
  /** 异常图斑总面积，单位 m²。 */
  areaTotal: number
  typeCounts: BusinessStatItem[]
  levelCounts: BusinessStatItem[]
  handleStatusCounts: BusinessStatItem[]
}

export interface BusinessTrendItem {
  date: string
  taskCount: number
  abnormalCount: number
}

export interface BusinessTrend {
  days: number
  items: BusinessTrendItem[]
}

export interface BusinessDashboardStatistics {
  overview: BusinessOverview
  sceneStats: BusinessSceneStat[]
  taskSummary: BusinessTaskSummary
  abnormalSummary: BusinessAbnormalSummary
  trend: BusinessTrend
}

const mockStatistics: BusinessDashboardStatistics = {
  overview: {
    sceneCount: 5, taskCount: 126, taskPending: 19, taskExecuting: 47, taskPendingVerify: 18,
    taskFailed: 2, taskCanceled: 1, taskFinished: 39, abnormalCount: 86, abnormalPendingCount: 24,
    abnormalArea: 358.6, resultCount: 142, geometryCount: 319,
    abnormalTypeCounts: [], abnormalLevelCounts: [],
  },
  sceneStats: [
    { sceneId: 'forestry-enforcement', sceneCode: 'FOREST_LAW_ENFORCE', sceneName: '林业执法监管', taskCount: 36, abnormalCount: 28, abnormalArea: 112.4, resultCount: 44, metrics: [] },
    { sceneId: 'illegal-land', sceneCode: 'ILLEGAL_LAND_ALERT', sceneName: '新增用地预警', taskCount: 29, abnormalCount: 21, abnormalArea: 87.3, resultCount: 31, metrics: [] },
    { sceneId: 'land-rectification', sceneCode: 'LAND_RECTIFICATION', sceneName: '存量用地整改', taskCount: 25, abnormalCount: 16, abnormalArea: 68.7, resultCount: 26, metrics: [] },
    { sceneId: 'land-reclamation', sceneCode: 'LAND_RECLAMATION', sceneName: '土地复垦', taskCount: 18, abnormalCount: 9, abnormalArea: 42.1, resultCount: 19, metrics: [] },
  ],
  taskSummary: { total: 126, pending: 19, executing: 47, pendingVerify: 18, failed: 2, canceled: 1, finished: 39 },
  abnormalSummary: {
    total: 86, areaTotal: 358.6,
    typeCounts: [
      { key: 'ILLEGAL_OCCUPY', name: '疑似违法占用', count: 34, value: 148.2 },
      { key: 'FOREST_DAMAGE', name: '疑似毁林', count: 28, value: 112.4 },
      { key: 'NON_GRAIN', name: '疑似非粮化', count: 24, value: 97.9 },
    ],
    levelCounts: [],
    handleStatusCounts: [
      { key: '0', name: '待核查', count: 24 },
      { key: '1', name: '核查中', count: 31 },
      { key: '2', name: '已处置', count: 22 },
      { key: '3', name: '已销号', count: 9 },
    ],
  },
  trend: {
    days: 7,
    items: [
      { date: '2026-09-09', taskCount: 16, abnormalCount: 8 }, { date: '2026-09-10', taskCount: 21, abnormalCount: 13 },
      { date: '2026-09-11', taskCount: 18, abnormalCount: 9 }, { date: '2026-09-12', taskCount: 24, abnormalCount: 15 },
      { date: '2026-09-13', taskCount: 19, abnormalCount: 11 }, { date: '2026-09-14', taskCount: 14, abnormalCount: 7 },
      { date: '2026-09-15', taskCount: 14, abnormalCount: 6 },
    ],
  },
}

/**
 * 首页业务统计。真实模式下五个接口必须全部成功，调用失败交给页面明确展示，绝不回退为 Mock 数据。
 */
export async function getBusinessDashboardStatistics(query: BusinessStatisticsQuery = {}): Promise<BusinessDashboardStatistics> {
  if (isMockMode()) return mockStatistics
  // 真实模式绝不允许省略部门条件，否则后端可能返回跨单位汇总。
  if (!query.deptId) throw new Error('未获取到当前单位标识，无法加载单位统计数据。')

  const trendQuery = { ...query, days: query.days ?? 7 }
  const [overview, sceneStats, taskSummary, abnormalSummary, trend] = await Promise.all([
    apiClient.post<never, BusinessOverview>('/v1/biz/statistics/overview', query),
    apiClient.post<never, BusinessSceneStat[]>('/v1/biz/statistics/scene-stat', query),
    apiClient.post<never, BusinessTaskSummary>('/v1/biz/statistics/task-summary', query),
    apiClient.post<never, BusinessAbnormalSummary>('/v1/biz/statistics/abnormal-summary', query),
    apiClient.post<never, BusinessTrend>('/v1/biz/statistics/trend', trendQuery),
  ])

  return { overview, sceneStats, taskSummary, abnormalSummary, trend }
}
