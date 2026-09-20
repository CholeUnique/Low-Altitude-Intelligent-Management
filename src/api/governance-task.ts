import { apiClient, isMockMode } from './client'
import { getOrganization, getScene, getTask, getTasks } from '@/mocks/portal'
import type { OrganizationId, PortalTask, TaskWorkflowNode } from '@/types'

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
  createTime?: string
  updateTime?: string
  /** Mock 展示层保留字段；真实接口未提供时不会伪造。 */
  area?: string
  areaSize?: number
  workflow?: TaskWorkflowNode[]
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
  /** 仅 Mock 模式使用，真实请求不会发送。 */
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
  /** 创建时可一并关联的无人机素材 ID。 */
  mediaIds?: string[]
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
  createTime?: string
}

export interface GovernanceTaskDetail {
  task: GovernanceTask
  refSummary?: string
  abnormalCount?: number
  /** 当前任务异常图斑总面积，单位 m²。 */
  abnormalArea?: number
  results: GovernanceTaskResultBrief[]
  process?: {
    remark?: string
    logs?: GovernanceTaskOperateLog[]
  } | null
}

export interface TaskAbnormal {
  id: string
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
  createTime?: string
  updateTime?: string
}

interface BizTaskDetailDto {
  task: BizTaskDto
  refSummary?: string
  abnormalCount?: number
  abnormalArea?: number
  results?: Array<Record<string, unknown>>
  process?: {
    remark?: string
    logs?: Array<Record<string, unknown>>
  } | null
}

interface BizAbnormalDto {
  id: string | number
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

const mockStatusByName: Record<string, GovernanceTaskStatus> = {
  '待处理': 0,
  '进行中': 1,
  '待复核': 2,
  '已完成': 5,
}

const mockStatusText: Record<GovernanceTaskStatus, string> = {
  0: '待执行',
  1: '执行中',
  2: '待核查',
  3: '已失败',
  4: '已取消',
  5: '已完成',
}

function toPriorityValue(priority: PortalTask['priority']) {
  return priority === '高' ? 2 : priority === '中' ? 1 : 0
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
    taskStatusDesc: item.taskStatusDesc || mockStatusText[status],
    priority: normalizePriority(item.priority),
    planStartTime: item.planStartTime,
    planEndTime: item.planEndTime,
    actualStartTime: item.actualStartTime,
    actualEndTime: item.actualEndTime,
    assigneeId: optionalValue(item.assigneeId),
    createTime: item.createTime,
    updateTime: item.updateTime,
  }
}

function toMockGovernanceTask(task: PortalTask): GovernanceTask {
  const organization = getOrganization(task.organizationId)
  const scene = getScene(organization, task.sceneId)
  const status = mockStatusByName[task.status] ?? 0
  return {
    id: task.id,
    taskNo: task.id,
    sceneCode: task.sceneId,
    sceneName: scene?.name || task.sceneId,
    name: task.name,
    deptName: organization.shortName,
    refType: 'NONE',
    executeMode: 'MANUAL',
    taskStatus: status,
    taskStatusDesc: task.status,
    priority: toPriorityValue(task.priority),
    planStartTime: task.plannedStart,
    planEndTime: task.plannedEnd,
    createTime: task.createdAt,
    updateTime: task.updatedAt,
    area: task.area,
    areaSize: task.areaSize,
    workflow: task.workflow,
  }
}

function priorityMatches(value: number, priority?: number) {
  return priority === undefined || value === priority
}

function getMockTaskPage(query: GovernanceTaskPageQuery): GovernanceTaskPage {
  const records = getTasks(query.organizationId || 'natural-resources').map(toMockGovernanceTask).filter((task) =>
    (!query.keyword || `${task.name}${task.taskNo}`.includes(query.keyword))
    && (!query.sceneCode || task.sceneCode === query.sceneCode)
    && (query.taskStatus === undefined || task.taskStatus === query.taskStatus)
    && priorityMatches(task.priority, query.priority),
  )
  const start = (query.pageNum - 1) * query.pageSize
  return {
    records: records.slice(start, start + query.pageSize),
    total: records.length,
    pageNum: query.pageNum,
    pageSize: query.pageSize,
  }
}

function toOperateLog(item: Record<string, unknown>): GovernanceTaskOperateLog {
  return {
    id: String(item.id || ''),
    operateType: String(item.operateType || ''),
    operateTypeDesc: String(item.operateTypeDesc || item.operateType || '任务操作'),
    operateDesc: String(item.operateDesc || '-'),
    operatorId: item.operatorId === undefined ? undefined : String(item.operatorId),
    operatorName: typeof item.operatorName === 'string' ? item.operatorName : undefined,
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
    imageMediaId: item.imageMediaId === undefined ? undefined : String(item.imageMediaId),
    imageUrl: item.imageUrl,
    handleStatus: item.handleStatus ?? 0,
    foundTime: item.foundTime,
    createTime: item.createTime,
    updateTime: item.updateTime,
  }
}

export async function getGovernanceTaskPage(query: GovernanceTaskPageQuery): Promise<GovernanceTaskPage> {
  if (isMockMode()) return getMockTaskPage(query)
  const { organizationId: _organizationId, ...request } = query
  const page = await apiClient.post<never, { records?: BizTaskDto[]; total?: number | string; pageNum?: number; pageSize?: number }>('/v1/biz/task/page', request)
  return {
    records: (page.records || []).map(toGovernanceTask),
    total: Number(page.total || 0),
    pageNum: page.pageNum || query.pageNum,
    pageSize: page.pageSize || query.pageSize,
  }
}

/** 创建真实业务任务；Mock 模式的临时任务仍由 NewTaskDialog 在前端会话内处理。 */
export async function createGovernanceTask(input: GovernanceTaskCreateInput): Promise<GovernanceTask> {
  if (isMockMode()) throw new Error('Mock 模式不调用真实任务创建接口。')
  const data = await apiClient.post<never, BizTaskDto>('/v1/biz/task/create', input)
  return toGovernanceTask(data)
}

/** 保存任务范围；后端要求传入 WGS84 的 GeoJSON FeatureCollection。 */
export async function upsertGovernanceTaskGeometry(input: GovernanceTaskGeometryUpsertInput): Promise<void> {
  if (isMockMode()) throw new Error('Mock 模式不调用真实任务范围保存接口。')
  await apiClient.post('/v1/biz/task/geometry/upsert', input)
}

/** 批量关联已存在的无人机影像素材，重复提交由后端自动去重。 */
export async function bindGovernanceTaskMedia(input: GovernanceTaskMediaBindInput): Promise<void> {
  if (isMockMode()) throw new Error('Mock 模式不调用真实任务影像关联接口。')
  await apiClient.post('/v1/biz/task/media/bind', input)
}

export async function setGovernanceTaskMediaCover(input: {
  deptId?: string
  bizTaskId: string
  mediaId: string
}): Promise<void> {
  if (isMockMode()) throw new Error('Mock 模式不调用真实任务封面设置接口。')
  await apiClient.post('/v1/biz/task/media/set-cover', input)
}

/** 修改真实业务任务的当前 Swagger 已支持字段。 */
export async function updateGovernanceTask(input: GovernanceTaskUpdateInput): Promise<void> {
  if (isMockMode()) throw new Error('Mock 模式不调用真实任务修改接口。')
  await apiClient.post('/v1/biz/task/update', input)
}

export async function executeGovernanceTask(id: string, remark?: string, deptId?: string): Promise<void> {
  if (isMockMode()) throw new Error('Mock 模式不调用真实任务执行接口。')
  await apiClient.post('/v1/biz/task/execute', { id, deptId, remark: remark || undefined })
}

export async function cancelGovernanceTask(id: string, deptId?: string): Promise<void> {
  if (isMockMode()) throw new Error('Mock 模式不调用真实任务取消接口。')
  await apiClient.post('/v1/biz/task/cancel', { id, deptId })
}

/** 删除单个业务任务；批量删除由前端按已勾选任务逐项调用该接口。 */
export async function deleteGovernanceTask(id: string, deptId?: string): Promise<void> {
  if (isMockMode()) throw new Error('Mock 模式不调用真实任务删除接口。')
  await apiClient.post('/v1/biz/task/delete', { id, deptId })
}

/** Swagger 中的完成接口路径为 /biz/task/finish。仅允许待核查任务完成。 */
export async function finishGovernanceTask(id: string, deptId?: string): Promise<void> {
  if (isMockMode()) throw new Error('Mock 模式不调用真实任务完成接口。')
  await apiClient.post('/v1/biz/task/finish', { id, deptId })
}

export async function getGovernanceTaskDetail(taskId: string): Promise<GovernanceTaskDetail | undefined> {
  if (isMockMode()) {
    const task = getTask(taskId)
    return task ? {
      task: toMockGovernanceTask(task),
      abnormalCount: task.metrics.issues,
      results: [],
      process: { logs: [] },
    } : undefined
  }
  const detail = await apiClient.post<never, BizTaskDetailDto>('/v1/biz/task/detail', { id: taskId })
  return {
    task: toGovernanceTask(detail.task),
    refSummary: detail.refSummary,
    abnormalCount: detail.abnormalCount,
    abnormalArea: detail.abnormalArea,
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

export async function getGovernanceTaskGeometry(taskId: string, resultId?: string, includeAbnormalPoints = true): Promise<TaskGeometryFeatureCollection> {
  if (isMockMode()) {
    const task = getTask(taskId)
    if (!task?.coordinates.length) return { type: 'FeatureCollection', features: [] }
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...task.coordinates, task.coordinates[0]]] },
        properties: { taskId: task.id, name: task.name },
      }],
    }
  }
  const data = await apiClient.post<never, unknown>('/v1/biz/task/geometry/geojson', {
    bizTaskId: taskId,
    resultId,
    includeAbnormalPoints,
  })
  return toFeatureCollection(data)
}

export async function getTaskAbnormalPage(query: TaskAbnormalPageQuery): Promise<TaskAbnormalPage> {
  if (isMockMode()) return { records: [], total: 0, pageNum: query.pageNum, pageSize: query.pageSize }
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
  const discoveryWorkflow: TaskWorkflowNode[] = [
    {
      key: 'route-flight-plan',
      name: '航线规划',
      status: task.taskStatus >= 1 && task.taskStatus !== 4 ? 'done' : 'active',
      time: task.planStartTime || task.createTime,
    },
    {
      key: 'realtime-cruise',
      name: '实时巡航',
      status: task.taskStatus >= 2 && task.taskStatus !== 4 ? 'done' : task.taskStatus === 1 ? 'active' : 'pending',
      time: task.actualStartTime,
    },
  ]
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
    assignee: task.assigneeId ? `负责人 #${task.assigneeId}` : '未指派负责人',
    createdAt: task.createTime || '',
    updatedAt: task.updateTime || task.createTime || '',
    plannedStart: task.planStartTime || '',
    plannedEnd: task.planEndTime || '',
    progress: task.taskStatus >= 2 ? 100 : task.taskStatus === 1 ? 50 : 0,
    description: `真实业务任务：${task.taskNo}`,
    contact: '',
    phone: '',
    resultRequirements: [],
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
