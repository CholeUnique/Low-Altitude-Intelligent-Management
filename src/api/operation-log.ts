import { apiClient } from './client'

export interface OperationLog {
  id: string | number
  module?: string
  moduleDesc?: string
  moduleName?: string
  operateType?: string
  operateTypeDesc?: string
  operateTypeName?: string
  targetType?: string
  targetId?: string
  targetDesc?: string
  detailJson?: string
  operatorName?: string
  operatorIp?: string
  success?: number | boolean
  errorMsg?: string
  createTime?: string
}

export interface OperationLogQuery {
  pageNum: number
  pageSize: number
  module?: string
  operateType?: string
  operatorName?: string
  targetId?: string
  startTime?: string
  endTime?: string
}

export function getOperationLogs(query: OperationLogQuery) {
  return apiClient.post<never, { records: OperationLog[]; total: number }>('/v1/oper-log/page', query)
}
