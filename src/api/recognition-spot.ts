import { apiClient } from './client'
import type { MapServiceItem } from './map-service'
import type { TaskGeometryFeatureCollection } from './governance-task'

export type RecognitionAbnormalType =
  | 'ILLEGAL_OCCUPY'
  | 'FOREST_DAMAGE'
  | 'NON_GRAIN'
  | 'ABANDONED'
  | 'ILLEGAL_BUILD'
  | 'OTHER'

export interface RecognitionSpotAddInput {
  deptId?: string
  mapServiceIds: Array<string | number>
  sceneCode: string
  abnormalType: RecognitionAbnormalType
  geometryGeojson: string
  title?: string
  description?: string
  foundTime?: string
}

export interface RecognitionSpotCreateResult {
  count: number
  spotNos: string[]
}

export interface RecognitionSpotUploadPreviewInput {
  files: File[]
  sceneCode: string
  deptId?: string
}

export interface RecognitionSpotUploadPreviewField {
  name: string
  type?: string
  distinctValues: string[]
}

export interface RecognitionSpotUploadPreviewItem {
  seq: number
  geometryType?: string
  areaSqm?: number | null
  center?: number[]
  properties?: Record<string, unknown>
}

export interface RecognitionSpotUploadPreviewResult {
  batchNo: string
  featureCount: number
  fields: RecognitionSpotUploadPreviewField[]
  preview: RecognitionSpotUploadPreviewItem[]
}

export interface RecognitionSpotUploadConfirmInput {
  batchNo: string
  typeField: string
  typeMappings: Array<{ value: string; abnormalType: RecognitionAbnormalType }>
  mapServiceIds: Array<string | number>
  title?: string
  description?: string
  foundTime?: string
}

export interface RecognitionSpotPageQuery {
  deptId?: string
  mapServiceIds?: Array<string | number>
  sceneCode?: string
  abnormalType?: RecognitionAbnormalType
  spotSource?: 'MANUAL_UPLOAD' | 'MANUAL_DRAW' | 'API_IMPORT'
  handleStatus?: number
  keyword?: string
  pageNum: number
  pageSize: number
}

export interface RecognitionSpotItem {
  id: string
  spotNo: string
  spotSource: string
  mapServices: MapServiceItem[]
  taskId?: string
  sceneCode: string
  deptId?: string
  abnormalType: string
  abnormalTypeDesc: string
  title: string
  description: string
  area?: number
  longitude?: number
  latitude?: number
  handleStatus: number
  boundaryGeoJson?: TaskGeometryFeatureCollection
  foundTime?: string
  createTime?: string
  updateTime?: string
}

export interface RecognitionSpotPage {
  records: RecognitionSpotItem[]
  total: number
  pageNum: number
  pageSize: number
}

interface RecognitionSpotDto {
  id: string | number
  spotNo?: string
  spotSource?: string
  mapServices?: MapServiceItem[]
  taskId?: string | number
  sceneCode?: string
  deptId?: string | number
  abnormalType?: string
  abnormalTypeDesc?: string
  title?: string
  description?: string
  area?: number
  lng?: number | string
  lat?: number | string
  handleStatus?: number
  boundaryGeojson?: string | Record<string, unknown>
  foundTime?: string
  createTime?: string
  updateTime?: string
}

interface RecognitionSpotPageDto {
  records?: RecognitionSpotDto[]
  total?: number
  pageNum?: number
  pageSize?: number
}

function normalizeBoundary(value: RecognitionSpotDto['boundaryGeojson']): TaskGeometryFeatureCollection | undefined {
  if (!value) return
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) as Record<string, unknown> : value
    if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) return parsed as unknown as TaskGeometryFeatureCollection
    if (parsed.type === 'Feature') return { type: 'FeatureCollection', features: [parsed as never] }
    if (typeof parsed.type === 'string' && 'coordinates' in parsed) {
      return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: parsed as never, properties: {} }] }
    }
  } catch {
    return
  }
}

function normalizeSpot(item: RecognitionSpotDto): RecognitionSpotItem {
  const longitude = Number(item.lng)
  const latitude = Number(item.lat)
  return {
    id: String(item.id),
    spotNo: item.spotNo || String(item.id),
    spotSource: item.spotSource || '',
    mapServices: Array.isArray(item.mapServices) ? item.mapServices : [],
    taskId: item.taskId === undefined || item.taskId === null ? undefined : String(item.taskId),
    sceneCode: item.sceneCode || '',
    deptId: item.deptId === undefined || item.deptId === null ? undefined : String(item.deptId),
    abnormalType: item.abnormalType || 'OTHER',
    abnormalTypeDesc: item.abnormalTypeDesc || item.abnormalType || '其他',
    title: item.title || '识别图斑',
    description: item.description || '',
    area: item.area,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    handleStatus: Number(item.handleStatus) || 0,
    boundaryGeoJson: normalizeBoundary(item.boundaryGeojson),
    foundTime: item.foundTime,
    createTime: item.createTime,
    updateTime: item.updateTime,
  }
}

/** 手工圈画并新增识别图斑。 */
export async function addRecognitionSpot(input: RecognitionSpotAddInput) {
  return apiClient.post<never, RecognitionSpotCreateResult>('/v1/biz/recognition/spot/add', input)
}

/** 第一步：解析 Shapefile 并返回暂存 30 分钟的预览批次，不写入图斑。 */
export async function previewRecognitionSpotUpload(input: RecognitionSpotUploadPreviewInput) {
  const form = new FormData()
  input.files.forEach((file) => form.append('files', file))
  form.append('sceneCode', input.sceneCode)
  if (input.deptId) form.append('deptId', input.deptId)
  return apiClient.post<never, RecognitionSpotUploadPreviewResult>('/v1/biz/recognition/spot/upload/preview', form)
}

/** 第二步：提交完整的字段取值映射，确认后才正式落库。 */
export async function confirmRecognitionSpotUpload(input: RecognitionSpotUploadConfirmInput) {
  return apiClient.post<never, RecognitionSpotCreateResult>('/v1/biz/recognition/spot/upload/confirm', input)
}

/** 查询识别图斑，用于让手工新增结果立即进入问题图斑列表。 */
export async function getRecognitionSpotPage(query: RecognitionSpotPageQuery): Promise<RecognitionSpotPage> {
  const page = await apiClient.post<never, RecognitionSpotPageDto>('/v1/biz/recognition/spot/page', query)
  return {
    records: (page.records || []).map(normalizeSpot),
    total: Number(page.total) || 0,
    pageNum: Number(page.pageNum) || query.pageNum,
    pageSize: Number(page.pageSize) || query.pageSize,
  }
}
