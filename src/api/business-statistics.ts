import { apiClient } from './client'

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

export interface CustomStatMetric {
  name: string
  value: string
  unit: string
}

export interface CustomStatGroup {
  code?: string
  serviceId?: string
  serviceName?: string
  name: string
  items: CustomStatMetric[]
}

function statText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function statMetrics(value: unknown): CustomStatMetric[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const name = statText(record, ['itemName', 'name', 'title', 'label', 'metricName', 'statName'])
    const metricValue = statText(record, ['itemValue', 'value', 'statValue', 'metricValue', 'count'])
    if (!name && !metricValue) return []
    return [{
      name: name || '指标',
      value: metricValue || '—',
      unit: statText(record, ['unit', 'itemUnit', 'valueUnit']),
    }]
  })
}

/**
 * 部门视角定制统计。农业农村局返回九龙镇高标准农田指标；其他部门返回空 groups。
 */
export async function getCustomDepartmentStatistics(deptId?: string): Promise<CustomStatGroup[]> {
  const payload = await apiClient.post<never, unknown>('/v1/biz/statistics/custom-stat', deptId ? { deptId } : {})
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const groups = Array.isArray(payload) ? payload : root.groups ?? root.groupList ?? root.list
  if (!Array.isArray(groups)) return []
  return groups.flatMap((group) => {
    if (!group || typeof group !== 'object') return []
    const record = group as Record<string, unknown>
    const items = statMetrics(record.items ?? record.metrics ?? record.statItems ?? record.children)
    if (!items.length) return []
    return [{
      code: statText(record, ['groupCode', 'code']),
      serviceId: statText(record, ['mapServiceId', 'serviceId']),
      serviceName: statText(record, ['mapServiceName', 'serviceName', 'layerName']),
      name: statText(record, ['groupName', 'name', 'title', 'sceneName']) || '定制统计',
      items,
    }]
  })
}

export interface BusinessDashboardStatistics {
  overview: BusinessOverview
  sceneStats: BusinessSceneStat[]
  taskSummary: BusinessTaskSummary
  abnormalSummary: BusinessAbnormalSummary
  trend: BusinessTrend
}

/**
 * 首页业务统计。真实模式下五个接口必须全部成功，调用失败交给页面明确展示，绝不回退为 Mock 数据。
 */
export async function getBusinessDashboardStatistics(query: BusinessStatisticsQuery = {}): Promise<BusinessDashboardStatistics> {
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
