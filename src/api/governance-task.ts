import { apiClient } from './client'
import type { OrganizationId, PortalTask, TaskWorkflowNode } from '@/types'
import type { MapServiceItem } from '@/api/map-service'

export type GovernanceTaskStatus = 0 | 1 | 2 | 3 | 4 | 5

export interface GovernanceTask {
  id: string
  taskNo: string
  sceneCode: string
  sceneName: string
  name: string
  deptId?: string
  deptName: string
  refType: string
  refId?: string
  executeMode: string
  taskStatus: GovernanceTaskStatus
  taskStatusDesc: string
  priority: number
  planStartTime?: string
  planEndTime?: string
  actualStartTime?: string
  actualEndTime?: string
  assigneeId?: string
  assigneeName?: string
  description?: string
  contactName?: string
  contactPhone?: string
  resultRequirements?: string[]
  rangeName?: string
  rangeArea?: number
  rangeAreaUnit?: string
  geometryAvailable?: boolean
  coverImageUrl?: string
  coverImageThumbnailUrl?: string
  imageCount?: number
  createBy?: string
  createTime?: string
  updateTime?: string
  /** 任务分页接口直接返回的对比影像；智能研判以此为准，不再自行推断任务影像。 */
  comparisonImages?: GovernanceTaskComparisonImage[]
  /** 任务范围和后端节点信息；缺失时不推断。 */
  area?: string
  areaSize?: number
  workflow?: TaskWorkflowNode[]
}

export interface GovernanceTaskComparisonImage {
  id: string
  label: string
  imageUrl?: string
  captureTime?: string
  mapService?: MapServiceItem
}

export interface GovernanceTaskPageQuery {
  pageNum: number
  pageSize: number
  keyword?: string
  sceneCode?: string
  taskStatus?: GovernanceTaskStatus
  priority?: number
  startTime?: string
  endTime?: string
  /** 当前业务视角部门；真实接口由后端按此字段隔离数据。 */
  deptId?: string
  /** 前端业务视角参数，不发送给后端。 */
  organizationId?: OrganizationId
}

export interface GovernanceTaskPage {
  records: GovernanceTask[]
  total: number
  pageNum: number
  pageSize: number
}

/** 与当前 Swagger 的 /biz/task/create 请求体保持一致。 */
export interface GovernanceTaskCreateInput {
  deptId?: string
  sceneCode: string
  name: string
  refType?: 'PLAN' | 'TASK' | 'NONE'
  refId?: string
  executeMode?: 'MANUAL' | 'AUTO'
  priority?: number
  planStartTime?: string
  planEndTime?: string
  assigneeId?: string
  remark?: string
  description?: string
  resultRequirements?: string[]
  contactName?: string
  contactPhone?: string
  /** 创建时可一并关联的无人机素材 ID。 */
  mediaIds?: string[]
  /** 创建时关联后端地图服务，供任务详情和工作台读取。 */
  mapServiceIds?: string[]
}

export interface GovernanceTaskGeometryUpsertInput {
  deptId?: string
  bizTaskId: string
  geometry: TaskGeometryFeatureCollection
  coordinateSystem: 'EPSG:4326'
  geometryType?: 'POINT' | 'LINESTRING' | 'POLYGON'
  rangeName?: string
}

export interface GovernanceTaskMediaBindInput {
  deptId?: string
  bizTaskId: string
  mediaIds: string[]
}

export interface AbnormalTaskCreateInput {
  deptId?: string
  abnormalIds: string[]
  merge?: boolean
  priority?: number
  startFlow?: boolean
  flowAssigneeId?: string
  flowDeptId?: string
  deadline?: string
}

/** 与当前 Swagger 的 /biz/task/update 请求体保持一致。 */
export interface GovernanceTaskUpdateInput {
  id: string
  deptId?: string
  name?: string
  refType?: 'PLAN' | 'TASK' | 'NONE'
  refId?: string
  priority?: number
  planStartTime?: string
  planEndTime?: string
  assigneeId?: string
  remark?: string
  description?: string
  resultRequirements?: string[]
  contactName?: string
  contactPhone?: string
}

export interface GovernanceTaskResultBrief {
  id?: string
  resultType?: string
  collectTime?: string
  operator?: string
  fileCount?: number
  parseStatusDesc?: string
  createTime?: string
}

export interface GovernanceTaskOperateLog {
  id: string
  operateType: string
  operateTypeDesc: string
  operateDesc: string
  operatorId?: string
  operatorName?: string
  detailJson?: string
  createTime?: string
}

export interface GovernanceTaskDetail {
  task: GovernanceTask
  refSummary?: string
  abnormalCount?: number
  /** 当前任务异常图斑总面积，单位 m²。 */
  abnormalArea?: number
  statistics?: {
    flightCount?: number
    flightHours?: number | null
    patrolArea?: number
    patrolAreaUnit?: string
    abnormalCount?: number
    abnormalArea?: number
  }
  results: GovernanceTaskResultBrief[]
  process?: {
    remark?: string
    logs?: GovernanceTaskOperateLog[]
  } | null
}

export interface TaskAbnormal {
  id: string
  /** 识别图斑接口返回的业务编号；任务异常接口可能没有该字段。 */
  spotNo?: string
  spotSource?: string
  bizTaskId: string
  sceneCode: string
  abnormalType: string
  abnormalTypeDesc: string
  abnormalLevel: number
  title: string
  description: string
  /** 后端异常图斑面积，单位 m²。 */
  area?: number
  /** 后端返回的图斑边界；无边界时为 undefined，前端回退显示中心点。 */
  boundaryGeoJson?: TaskGeometryFeatureCollection
  longitude?: number
  latitude?: number
  imageMediaId?: string
  imageUrl?: string
  handleStatus: number
  foundTime?: string
  createTime?: string
  updateTime?: string
}

export interface TaskAbnormalPageQuery {
  deptId?: string
  bizTaskId: string
  pageNum: number
  pageSize: number
  abnormalType?: string
  handleStatus?: number
  keyword?: string
  startTime?: string
  endTime?: string
}

export interface TaskAbnormalPage {
  records: TaskAbnormal[]
  total: number
  pageNum: number
  pageSize: number
}

export interface TaskGeometryFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: string; coordinates: unknown } | null
    properties?: Record<string, unknown>
  }>
}

interface BizTaskDto {
  id: string | number
  taskNo?: string
  sceneCode?: string
  sceneName?: string
  name?: string
  deptId?: string | number
  deptName?: string
  refType?: string
  refId?: string | number
  executeMode?: string
  taskStatus?: number
  taskStatusDesc?: string
  priority?: number | string
  planStartTime?: string
  planEndTime?: string
  actualStartTime?: string
  actualEndTime?: string
  assigneeId?: string | number
  createBy?: string | number
  createTime?: string
  updateTime?: string
  /** 后端任务分页响应中的参考影像服务列表（biz_task_map_service）。 */
  mapServices?: MapServiceItem[]
  /** 后端字段仍在联调，保留扩展字段以兼容对比影像单对象和数组响应。 */
  [key: string]: unknown
}

interface BizTaskDetailDto {
  task: BizTaskDto
  refSummary?: string
  abnormalCount?: number
  abnormalArea?: number
  statistics?: GovernanceTaskDetail['statistics']
  results?: Array<Record<string, unknown>>
  process?: {
    remark?: string
    logs?: Array<Record<string, unknown>>
  } | null
}

interface BizAbnormalDto {
  id: string | number
  spotNo?: string
  spotSource?: string
  bizTaskId?: string | number
  sceneCode?: string
  abnormalType?: string
  abnormalTypeDesc?: string
  abnormalLevel?: number
  title?: string
  description?: string
  area?: number
  boundaryGeojson?: unknown
  lng?: number | string
  lat?: number | string
  longitude?: number | string
  latitude?: number | string
  lon?: number | string
  imageMediaId?: string | number
  imageUrl?: string
  handleStatus?: number
  foundTime?: string
  createTime?: string
  updateTime?: string
}

const taskStatusText: Record<GovernanceTaskStatus, string> = {
  0: '待执行',
  1: '执行中',
  2: '待核查',
  3: '已失败',
  4: '已取消',
  5: '已完成',
}

function normalizePriority(priority: unknown) {
  const value = Number(priority)
  return Number.isFinite(value) ? value : 0
}

/** 后端可选字段有时会返回 null 或字符串 "null"，前端统一视作未填写。 */
function optionalValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).trim()
  return normalized && normalized.toLowerCase() !== 'null' ? normalized : undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function firstString(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = optionalValue(item[key])
    if (value) return value
  }
}

function inferMapServiceType(url: string, value?: string) {
  if (value) return value
  if (/\/ImageServer(?:\?|$)/i.test(url)) return 'ARCGIS_IMAGESERVER'
  if (/\/MapServer(?:\?|$)/i.test(url)) return 'ARCGIS_MAPSERVER'
  if (/\bWMTS\b/i.test(url)) return 'WMTS'
  if (/\bWMS\b/i.test(url)) return 'WMS'
  return 'ARCGIS_MAPSERVER'
}

function normalizeComparisonImage(value: unknown, index: number): GovernanceTaskComparisonImage | undefined {
  if (typeof value === 'string') {
    const url = optionalValue(value)
    return url ? { id: `comparison-image-${index}`, label: `对比影像 ${index + 1}`, imageUrl: url } : undefined
  }
  const raw = recordValue(value)
  if (!raw) return undefined
  const nestedService = recordValue(raw.mapService)
    || recordValue(raw.mapServiceObject)
    || recordValue(raw.imageryService)
    || recordValue(raw.imageService)
    || recordValue(raw.service)
  const service = nestedService || raw
  const serviceUrl = firstString(service, ['serviceUrl', 'mapServiceUrl', 'imageServiceUrl', 'layerUrl', 'serviceAddress', 'url'])
  const explicitServiceUrl = firstString(service, ['serviceUrl', 'mapServiceUrl', 'imageServiceUrl', 'layerUrl', 'serviceAddress'])
  const looksLikeMapService = Boolean(explicitServiceUrl || (serviceUrl && /\/(?:MapServer|ImageServer)(?:\?|$)|\bWMS\b|\bWMTS\b/i.test(serviceUrl)))
  const id = firstString(raw, ['id', 'mediaId', 'fileId', 'serviceId', 'mapServiceId'])
    || firstString(service, ['id', 'serviceId', 'mapServiceId'])
    || `comparison-image-${index}`
  const label = firstString(raw, ['label', 'name', 'imageName', 'fileName', 'title', 'serviceName'])
    || firstString(service, ['name', 'serviceName', 'mapServiceName', 'label'])
    || `对比影像 ${index + 1}`
  const captureTime = firstString(raw, ['shootTime', 'captureTime', 'collectTime', 'imageTime'])
  if (looksLikeMapService && serviceUrl) {
    return {
      id,
      label,
      captureTime,
      mapService: {
        id: firstString(service, ['id', 'serviceId', 'mapServiceId']) || id,
        name: firstString(service, ['name', 'serviceName', 'mapServiceName', 'label']) || label,
        serviceUrl,
        type: inferMapServiceType(serviceUrl, firstString(service, ['type', 'serviceType', 'mapServiceType'])),
        status: Number(service.status ?? 1),
        sort: Number(service.sort ?? index),
        preset: service.preset === undefined ? undefined : Number(service.preset),
        remark: firstString(service, ['remark']),
      },
    }
  }
  const imageUrl = firstString(raw, ['imageUrl', 'originalUrl', 'previewUrl', 'thumbnailUrl', 'url'])
  return imageUrl ? { id, label, imageUrl, captureTime } : undefined
}

function comparisonImageSources(item: BizTaskDto) {
  const explicitKeys = [
    'mapServices',
    'comparisonImage', 'comparisonImages', 'compareImage', 'compareImages',
    'contrastImage', 'contrastImages', 'comparisonImagery', 'compareImagery',
    'comparisonImageObject', 'compareImageObject', 'comparisonService',
    'compareService', 'comparisonMapService', 'compareMapService',
  ]
  const values: unknown[] = explicitKeys.flatMap((key) => item[key] === undefined ? [] : [item[key]])
  for (const [key, value] of Object.entries(item)) {
    if (explicitKeys.includes(key)) continue
    if (/(?:comparison|compare|contrast).*(?:image|imagery|service)|(?:image|imagery|service).*(?:comparison|compare|contrast)/i.test(key)) values.push(value)
  }
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value
    const wrapper = recordValue(value)
    const list = wrapper && (wrapper.records || wrapper.list || wrapper.items)
    return Array.isArray(list) ? list : [value]
  })
}

function normalizeComparisonImages(item: BizTaskDto) {
  const seen = new Set<string>()
  return comparisonImageSources(item)
    .map(normalizeComparisonImage)
    .filter((image): image is GovernanceTaskComparisonImage => {
      if (!image) return false
      const identity = image.mapService?.serviceUrl || image.imageUrl || image.id
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
}

function toGovernanceTask(item: BizTaskDto): GovernanceTask {
  const status = Number.isInteger(item.taskStatus) && item.taskStatus! >= 0 && item.taskStatus! <= 5
    ? item.taskStatus as GovernanceTaskStatus
    : 0
  return {
    id: String(item.id),
    taskNo: item.taskNo || String(item.id),
    sceneCode: item.sceneCode || '',
    sceneName: item.sceneName || '未配置场景',
    name: item.name || '未命名任务',
    deptId: optionalValue(item.deptId),
    deptName: item.deptName || '-',
    refType: item.refType || 'NONE',
    refId: optionalValue(item.refId),
    executeMode: item.executeMode || 'MANUAL',
    taskStatus: status,
    taskStatusDesc: item.taskStatusDesc || taskStatusText[status],
    priority: normalizePriority(item.priority),
    planStartTime: item.planStartTime,
    planEndTime: item.planEndTime,
    actualStartTime: item.actualStartTime,
    actualEndTime: item.actualEndTime,
    assigneeId: optionalValue(item.assigneeId),
    assigneeName: optionalValue(item.assigneeName),
    description: optionalValue(item.description),
    contactName: optionalValue(item.contactName),
    contactPhone: optionalValue(item.contactPhone),
    resultRequirements: Array.isArray(item.resultRequirements) ? item.resultRequirements.filter((value): value is string => typeof value === 'string') : undefined,
    rangeName: optionalValue(item.rangeName),
    rangeArea: typeof item.rangeArea === 'number' ? item.rangeArea : undefined,
    rangeAreaUnit: optionalValue(item.rangeAreaUnit),
    geometryAvailable: typeof item.geometryAvailable === 'boolean' ? item.geometryAvailable : undefined,
    coverImageUrl: optionalValue(item.coverImageUrl),
    coverImageThumbnailUrl: optionalValue(item.coverImageThumbnailUrl),
    imageCount: typeof item.imageCount === 'number' ? item.imageCount : undefined,
    area: optionalValue(item.rangeName),
    areaSize: typeof item.rangeArea === 'number' ? item.rangeArea : undefined,
    createBy: optionalValue(item.createBy),
    createTime: item.createTime,
    updateTime: item.updateTime,
    comparisonImages: normalizeComparisonImages(item),
  }
}

function toOperateLog(item: Record<string, unknown>): GovernanceTaskOperateLog {
  return {
    id: String(item.id || ''),
    operateType: String(item.operateType || ''),
    operateTypeDesc: String(item.operateTypeDesc || item.operateType || '任务操作'),
    operateDesc: String(item.operateDesc || '-'),
    operatorId: item.operatorId == null ? undefined : String(item.operatorId),
    operatorName: typeof item.operatorName === 'string' ? item.operatorName : undefined,
    detailJson: typeof item.detailJson === 'string' ? item.detailJson : undefined,
    createTime: typeof item.createTime === 'string' ? item.createTime : undefined,
  }
}

function toFeatureCollection(data: unknown): TaskGeometryFeatureCollection {
  if (data && typeof data === 'object') {
    const value = data as { type?: unknown; features?: unknown; geometry?: unknown; coordinates?: unknown }
    if (value.type === 'FeatureCollection') {
      const features = Array.isArray(value.features)
        ? value.features as TaskGeometryFeatureCollection['features']
        : []
      return { type: 'FeatureCollection', features }
    }
    // 个别后端版本会直接返回单个 GeoJSON Feature 或 Geometry；统一包装后供地图渲染。
    if (value.type === 'Feature' && value.geometry && typeof value.geometry === 'object') {
      return { type: 'FeatureCollection', features: [value as TaskGeometryFeatureCollection['features'][number]] }
    }
    if (typeof value.type === 'string' && value.coordinates !== undefined) {
      return {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: value.type, coordinates: value.coordinates } }],
      }
    }
  }
  return { type: 'FeatureCollection', features: [] }
}

function parseAbnormalBoundary(value: unknown): TaskGeometryFeatureCollection | undefined {
  if (value === undefined || value === null || value === '') return undefined
  try {
    // 正常响应是 GeoJSON 字符串；少数序列化链路会将该字符串再包装一次。
    // 连续解码两次，兼容两种返回形式，避免有效面边界被降级为中心点。
    let raw = value
    for (let attempt = 0; attempt < 2 && typeof raw === 'string'; attempt += 1) raw = JSON.parse(raw)
    const collection = toFeatureCollection(raw)
    return collection.features.length ? collection : undefined
  } catch {
    // 边界字段格式异常时不能影响异常列表；地图会自动回退到中心点。
    return undefined
  }
}

function toTaskAbnormal(item: BizAbnormalDto): TaskAbnormal {
  const coordinate = (...values: unknown[]) => {
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return undefined
  }
  return {
    id: String(item.id),
    spotNo: item.spotNo,
    spotSource: item.spotSource,
    bizTaskId: item.bizTaskId === undefined ? '' : String(item.bizTaskId),
    sceneCode: item.sceneCode || '',
    abnormalType: item.abnormalType || 'OTHER',
    abnormalTypeDesc: item.abnormalTypeDesc || item.abnormalType || '其他异常',
    abnormalLevel: item.abnormalLevel || 1,
    title: item.title || '未命名图斑',
    description: item.description || '',
    area: item.area,
    boundaryGeoJson: parseAbnormalBoundary(item.boundaryGeojson),
    // 不同版本接口曾使用 lng/lat、longitude/latitude 与 lon/lat，统一兼容。
    longitude: coordinate(item.lng, item.longitude, item.lon),
    latitude: coordinate(item.lat, item.latitude),
    imageMediaId: optionalValue(item.imageMediaId),
    imageUrl: item.imageUrl,
    handleStatus: item.handleStatus ?? 0,
    foundTime: item.foundTime,
    createTime: item.createTime,
    updateTime: item.updateTime,
  }
}

export async function getGovernanceTaskPage(query: GovernanceTaskPageQuery): Promise<GovernanceTaskPage> {
  const { organizationId: _organizationId, ...request } = query
  const page = await apiClient.post<never, { records?: BizTaskDto[]; total?: number | string; pageNum?: number; pageSize?: number }>('/v1/biz/task/page', request)
  return {
    records: (page.records || []).map(toGovernanceTask),
    total: Number(page.total || 0),
    pageNum: page.pageNum || query.pageNum,
    pageSize: page.pageSize || query.pageSize,
  }
}

/** 当前登录人负责的未完结业务任务；由后端决定可见范围。 */
export async function getMyTodoTaskPage(query: { pageNum: number; pageSize: number; deptId?: string; taskStatus?: 0 | 1 | 2 }): Promise<GovernanceTaskPage> {
  const page = await apiClient.post<never, { records?: BizTaskDto[]; total?: number | string; pageNum?: number; pageSize?: number }>('/v1/biz/task/my-todo/page', query)
  return { records: (page.records || []).map(toGovernanceTask), total: Number(page.total || 0), pageNum: page.pageNum || query.pageNum, pageSize: page.pageSize || query.pageSize }
}

/** 独立查询任务全流程留痕，不依赖详情内嵌日志。 */
export async function getGovernanceTaskOperateLogs(id: string, deptId?: string): Promise<GovernanceTaskOperateLog[]> {
  const data = await apiClient.post<never, Array<Record<string, unknown>>>('/v1/biz/task/operate-log', { id, deptId })
  return (data || []).map(toOperateLog)
}

/** 创建后端业务任务。 */
export async function createGovernanceTask(input: GovernanceTaskCreateInput): Promise<GovernanceTask> {
  const data = await apiClient.post<never, BizTaskDto>('/v1/biz/task/create', input)
  return toGovernanceTask(data)
}

/** 将同场景、同部门的疑似异常图斑批量派生为核查任务。 */
export async function createTasksFromAbnormals(input: AbnormalTaskCreateInput): Promise<GovernanceTask[]> {
  const data = await apiClient.post<never, BizTaskDto[]>('/v1/biz/task/abnormal/create', input)
  return (Array.isArray(data) ? data : []).map(toGovernanceTask)
}

/** 保存任务范围；后端要求传入 WGS84 的 GeoJSON FeatureCollection。 */
export async function upsertGovernanceTaskGeometry(input: GovernanceTaskGeometryUpsertInput): Promise<void> {
  await apiClient.post('/v1/biz/task/geometry/upsert', input)
}

/** 批量关联已存在的无人机影像素材，重复提交由后端自动去重。 */
export async function bindGovernanceTaskMedia(input: GovernanceTaskMediaBindInput): Promise<void> {
  await apiClient.post('/v1/biz/task/media/bind', input)
}

export async function setGovernanceTaskMediaCover(input: {
  deptId?: string
  bizTaskId: string
  mediaId: string
}): Promise<void> {
  await apiClient.post('/v1/biz/task/media/set-cover', input)
}

/** 修改真实业务任务的当前 Swagger 已支持字段。 */
export async function updateGovernanceTask(input: GovernanceTaskUpdateInput): Promise<void> {
  await apiClient.post('/v1/biz/task/update', input)
}

export async function executeGovernanceTask(id: string, remark?: string, deptId?: string): Promise<void> {
  await apiClient.post('/v1/biz/task/execute', { id, deptId, remark: remark || undefined })
}

export async function cancelGovernanceTask(id: string, deptId?: string): Promise<void> {
  await apiClient.post('/v1/biz/task/cancel', { id, deptId })
}

/** 删除单个业务任务；批量删除由前端按已勾选任务逐项调用该接口。 */
export async function deleteGovernanceTask(id: string, deptId?: string): Promise<void> {
  await apiClient.post('/v1/biz/task/delete', { id, deptId })
}

/** Swagger 中的完成接口路径为 /biz/task/finish。仅允许待核查任务完成。 */
export async function finishGovernanceTask(id: string, deptId?: string): Promise<void> {
  await apiClient.post('/v1/biz/task/finish', { id, deptId })
}

export async function getGovernanceTaskDetail(taskId: string): Promise<GovernanceTaskDetail | undefined> {
  const detail = await apiClient.post<never, BizTaskDetailDto>('/v1/biz/task/detail', { id: taskId })
  return {
    task: toGovernanceTask(detail.task),
    refSummary: detail.refSummary,
    abnormalCount: detail.abnormalCount,
    abnormalArea: detail.abnormalArea,
    statistics: detail.statistics,
    results: (detail.results || []).map((item) => ({
      id: item.id === undefined ? undefined : String(item.id),
      resultType: typeof item.resultType === 'string' ? item.resultType : undefined,
      collectTime: typeof item.collectTime === 'string' ? item.collectTime : undefined,
      operator: typeof item.operator === 'string' ? item.operator : undefined,
      fileCount: typeof item.fileCount === 'number' ? item.fileCount : undefined,
      parseStatusDesc: typeof item.parseStatusDesc === 'string' ? item.parseStatusDesc : undefined,
      createTime: typeof item.createTime === 'string' ? item.createTime : undefined,
    })),
    process: detail.process ? {
      remark: detail.process.remark,
      logs: (detail.process.logs || []).map(toOperateLog),
    } : null,
  }
}

export async function getGovernanceTaskGeometry(taskId: string, resultId?: string, includeAbnormalPoints = true, deptId?: string): Promise<TaskGeometryFeatureCollection> {
  const data = await apiClient.post<never, unknown>('/v1/biz/task/geometry/geojson', {
    bizTaskId: taskId,
    deptId,
    resultId,
    includeAbnormalPoints,
  })
  return toFeatureCollection(data)
}

export async function getTaskAbnormalPage(query: TaskAbnormalPageQuery): Promise<TaskAbnormalPage> {
  const page = await apiClient.post<never, {
    records?: BizAbnormalDto[]
    total?: number | string
    pageNum?: number
    pageSize?: number
  }>('/v1/biz/task/abnormal/page', query)
  return {
    records: (page.records || []).map(toTaskAbnormal),
    total: Number(page.total || 0),
    pageNum: page.pageNum || query.pageNum,
    pageSize: page.pageSize || query.pageSize,
  }
}

export function taskPriorityLabel(priority: number) {
  return priority >= 2 ? '高' : priority === 1 ? '中' : '低'
}

/**
 * 将真实业务任务投影为巡查发现模块所需的统一任务上下文。
 * 该映射只用于页面展示和流程导航，不会向后端写入任何 Mock 字段。
 */
export function toPatrolTask(task: GovernanceTask): PortalTask {
  const discoveryWorkflow = task.workflow || []
  const completedNodes = discoveryWorkflow.filter((node) => node.status === 'done').length

  return {
    id: task.id,
    organizationId: 'natural-resources',
    sceneId: task.sceneCode,
    name: task.name,
    refType: task.refType,
    refId: task.refId,
    status: task.taskStatusDesc,
    priority: taskPriorityLabel(task.priority),
    area: task.area || '后端暂未关联任务范围',
    areaSize: task.areaSize || 0,
    owner: task.deptName,
    assignee: task.assigneeName || (task.assigneeId ? `负责人 #${task.assigneeId}` : '未指派负责人'),
    createdAt: task.createTime || '',
    updatedAt: task.updateTime || task.createTime || '',
    plannedStart: task.planStartTime || '',
    plannedEnd: task.planEndTime || '',
    progress: discoveryWorkflow.length ? Math.round(completedNodes / discoveryWorkflow.length * 100) : 0,
    description: task.description || '',
    contact: task.contactName || '',
    phone: task.contactPhone || '',
    resultRequirements: task.resultRequirements || [],
    coordinates: [],
    workflow: discoveryWorkflow,
    metrics: {
      flights: 0,
      flightHours: 0,
      patrolArea: 0,
      issues: 0,
      completedNodes,
      totalNodes: discoveryWorkflow.length,
    },
  }
}
