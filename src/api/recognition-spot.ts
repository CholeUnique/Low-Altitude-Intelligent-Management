import { apiClient } from './client'
import type { MapServiceItem } from './map-service'
import type { TaskGeometryFeatureCollection } from './governance-task'

/** 异常类型由后端按场景动态配置，不在前端限定固定枚举。 */
export type RecognitionAbnormalType = string

export interface RecognitionAbnormalTypeOption {
  code: string
  name: string
}

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

export interface RecognitionSpotBatchInput {
  deptId: string
  ids: string[]
}

export interface RecognitionSpotBatchResult {
  count: number
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
  /** 异常类型编码取自当前场景启用的元数据选项。 */
  typeMappings: Array<{ value: string; abnormalType: string }>
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

export interface RecognitionSpotDetailQuery {
  id: string
  deptId?: string
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

/** 读取指定启用场景当前可用的异常类型，供手工圈画、核查筛选和线下上传使用。 */
export function getRecognitionSpotTypes(sceneCode: string) {
  return apiClient.post<never, RecognitionAbnormalTypeOption[]>('/v1/biz/recognition/spot/type/list', { sceneCode })
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

/** 按图斑 ID 读取完整详情；分页记录只用于列表摘要，详情面板应使用此接口的数据。 */
export async function getRecognitionSpotDetail(query: RecognitionSpotDetailQuery): Promise<RecognitionSpotItem> {
  const item = await apiClient.post<never, RecognitionSpotDto>('/v1/biz/recognition/spot/detail', query)
  return normalizeSpot(item)
}

/** 待人工审核（-1）的识别图斑审核通过后转为待核查（0）。 */
export async function reviewRecognitionSpots(input: RecognitionSpotBatchInput) {
  return apiClient.post<never, RecognitionSpotBatchResult>('/v1/biz/recognition/spot/review', input)
}

/** 将待人工审核（-1）或待核查（0）的识别图斑标记为已忽略（4）。 */
export async function ignoreRecognitionSpots(input: RecognitionSpotBatchInput) {
  return apiClient.post<never, RecognitionSpotBatchResult>('/v1/biz/recognition/spot/ignore', input)
}

/** 撤销未派生核查任务的识别图斑，并清理其业务边界及影像关联。 */
export async function revokeRecognitionSpots(input: RecognitionSpotBatchInput) {
  return apiClient.post<never, RecognitionSpotBatchResult>('/v1/biz/recognition/spot/revoke', input)
}
