import { apiClient } from './client'

export interface FacilityRecord {
  id: string | number
  facilityNo?: string | null
  name?: string | null
  regionCode?: string | null
  regionName?: string | null
  villageName?: string | null
  projectName?: string | null
  facilityType?: string | null
  typeName?: string | null
  bizStatus?: string | null
  bizStatusName?: string | null
  updateTime?: string | null
  geometryType?: string | null
  geometryJson?: string | null
  remark?: string | null
}
export interface FacilityOption { id: string | number; code: string; name: string; children?: FacilityOption[] }
export interface FacilityStatItem { key?: string | null; name?: string | null; count?: number | null; value?: number | null }
export interface FacilityStatistics {
  totalCount: number
  normalCount: number
  abnormalCount: number
  checkingCount: number
  discardedCount: number
  /** 按状态分组（后端随总体统计一并返回）。 */
  statusCounts?: FacilityStatItem[]
  /** 按设施类型分组。 */
  typeCounts?: FacilityStatItem[]
}
export interface FacilityRegionStat {
  regionCode?: string | null
  regionName?: string | null
  totalCount: number
  abnormalCount: number
  checkingCount: number
}
export interface FacilityPage { records: FacilityRecord[]; total: number; pageNum: number; pageSize: number }
export interface FacilityQuery { deptId: string; pageNum: number; pageSize: number; keyword?: string; facilityType?: string; bizStatus?: string }
export interface FacilityFormInput {
  deptId: string
  id?: string | number
  facilityNo: string
  name: string
  facilityType: string
  bizStatus: string
  /** 所属区划 adcode（字典 ADMIN_REGION）。后端只接收 regionCode，传 regionName 无效。 */
  regionCode?: string
  villageName?: string
  projectName?: string
  remark?: string
  geometryJson?: string
  /** 后端要求与 geometryJson 成对提供，取值为 GeoJSON 几何类型（Point/LineString/Polygon 等）。 */
  geometryType?: string
}

export const getFacilityPage = (query: FacilityQuery) => apiClient.post<never, FacilityPage>('/v1/biz/facility/page', query)
export const getFacilityDetail = (deptId: string, id: string | number) => apiClient.post<never, FacilityRecord>('/v1/biz/facility/detail', { deptId, id })
export const getFacilityStatistics = (deptId: string) => apiClient.post<never, FacilityStatistics>('/v1/biz/facility/statistics/overall', { deptId })
export const getFacilityRegionStatistics = (deptId: string) => apiClient.post<never, FacilityRegionStat[]>('/v1/biz/facility/statistics/by-region', { deptId })
export const getFacilityTypes = () => apiClient.post<never, FacilityOption[]>('/v1/biz/facility/type/options', {})
export const addFacility = (input: FacilityFormInput) => apiClient.post<never, FacilityRecord>('/v1/biz/facility/add', input)
export const updateFacility = (input: FacilityFormInput & { id: string | number }) => apiClient.post<never, void>('/v1/biz/facility/update', input)
export const deleteFacility = (deptId: string, id: string | number) => apiClient.post<never, void>('/v1/biz/facility/delete', { deptId, id })

/** 移动端问题上报页地址兜底：本地 localhost 生成二维码时手机无法访问，退回该部署地址。
 *  可通过构建变量 VITE_FACILITY_REPORT_URL 覆盖。 */
const configuredReportUrl = import.meta.env.VITE_FACILITY_REPORT_URL?.trim()
export const FACILITY_REPORT_PAGE_URL = configuredReportUrl || 'http://223.2.41.169:8080/facility-report'
/** 二维码里的上报页地址：优先取当前正在访问的站点（部署到哪都能扫），localhost 场景退回部署地址。 */
export function resolveFacilityReportUrl() {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  if (!origin || /^https?:\/\/(localhost|127\.)/i.test(origin)) return FACILITY_REPORT_PAGE_URL
  return `${origin}/facility-report`
}

export interface FacilityReportInput {
  facilityId: string | number
  reportContent: string
  reporterName?: string
  reporterPhone?: string
  /** 匿名扫码上报时由二维码携带。 */
  ts?: number
  sign?: string
  files?: File[]
}
export interface FacilityReportResult {
  taskId: string | number
  taskNo: string
  facilityId: string | number
  facilityBizStatus?: string
  facilityBizStatusName?: string
  imageCount?: number
}
/** 问题上报：后端会自动创建核查任务、触发工作流，并把设施置为异常。 */
export function reportFacilityIssue(input: FacilityReportInput) {
  const form = new FormData()
  for (const [key, value] of Object.entries(input)) {
    if (key === 'files') continue
    if (value !== undefined && value !== null) form.append(key, String(value))
  }
  input.files?.forEach(file => form.append('files', file))
  return apiClient.post<never, FacilityReportResult>('/v1/biz/facility/report', form)
}

export async function getFacilityReportImage(imageId: string, deptId?: string) {
  const blob = await apiClient.post<never, Blob>('/v1/biz/facility/report/image/view', { imageId, ...(deptId ? { deptId } : {}) }, { responseType: 'blob' })
  if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) {
    if (blob instanceof Blob) {
      try { const error = JSON.parse(await blob.text()); throw new Error(error.msg || '照片读取失败') } catch (error) { if (error instanceof Error && !(error instanceof SyntaxError)) throw error }
    }
    throw new Error('照片读取失败')
  }
  return blob
}

export interface FacilityQrcodeQuery { deptId: string; id: string | number; url?: string; size?: number }
/** 设施二维码（PNG 二进制；失败时后端仍返回 JSON 错误体）。 */
export const getFacilityQrcode = (query: FacilityQrcodeQuery) =>
  apiClient.post<never, Blob>('/v1/biz/facility/qrcode', { url: resolveFacilityReportUrl(), size: 360, ...query }, { responseType: 'blob' })
export const getFacilityGeoJson = (query: { deptId: string; minLng?: number; minLat?: number; maxLng?: number; maxLat?: number; bizStatus?: string }) => apiClient.post<never, GeoJSON.FeatureCollection>('/v1/biz/facility/geojson', query)
