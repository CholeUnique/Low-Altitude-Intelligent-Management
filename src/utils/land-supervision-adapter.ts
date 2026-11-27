import { landFlowDefinition, isLandFlow } from '@/utils/land-workflow'
import type { TaskWorkflow, WorkflowNode, WorkflowFile } from '@/api/task-workflow'
import { LAND_SCENE_CONFIG, LAND_WARNING_SCENE, type LandSceneCode, type LandGeometry, type LandTask, type LandHistory, type LandEvidence, type LandStatistics, type LandTopicObject, type LandStage } from '@/types/land-supervision'

export interface LandTaskDto {
  topicObjectId?:string
  id: string; taskNo: string; name: string; sceneCode: LandSceneCode; taskStatus: number; taskStatusDesc?: string
  description?: string; priority?: number; rangeArea?: number; geometryAvailable?: boolean
  createTime?: string; updateTime?: string; createBy?: string; assigneeName?: string
  rectifyDeadline?: string; mapServices?: Array<{id: string | number}>
}
export interface LandTopicStatisticsDto {
  sceneCode?: string; abnormalCount?: number | null
  metrics?: Array<{key: string; value?: number | null; valueMu?: number | null; unit?: string}>
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const read = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return undefined }
}
export function landPolygons(value: unknown): LandGeometry | undefined {
  const data = object(read(value))
  if (data.type === 'Feature') return landPolygons(data.geometry)
  if (data.type === 'FeatureCollection' || data.type === 'GeometryCollection') {
    const children = data.type === 'FeatureCollection' ? data.features : data.geometries
    const polygons = (Array.isArray(children) ? children : []).flatMap(child => {
      const geometry = landPolygons(child)
      return geometry ? geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates : []
    })
    return polygons.length ? {type:'MultiPolygon', coordinates:polygons} : undefined
  }
  const coordinates = data.coordinates
  const ring = (value: unknown) => Array.isArray(value) && value.length >= 4 && value.every(point => Array.isArray(point) && point.length >= 2 && point.slice(0,2).every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(point[0])<=180 && Math.abs(point[1])<=90) && value[0][0]===value[value.length-1][0] && value[0][1]===value[value.length-1][1]
  const polygon = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(ring)
  if (data.type === 'Polygon' && polygon(coordinates)) return data as unknown as GeoJSON.Polygon
  if (data.type === 'MultiPolygon' && Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(polygon)) return data as unknown as GeoJSON.MultiPolygon
  return undefined
}
export function landObjectsFromGeoJSON(value: unknown): LandTopicObject[] {
  const collection = object(read(value))
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('专题对象接口未返回有效的 GeoJSON FeatureCollection。')
  return collection.features.flatMap(raw => {
    const feature = object(raw), properties = object(feature.properties), geometry = landPolygons(feature.geometry)
    const id = properties.id ?? properties.objectId ?? feature.id
    const type = String(properties.objectType || '')
    const recognition = object(object(read(properties.remark)).landRecognition)
    if (id == null || !geometry || !['SCOPE','SUSPECT','CONFIRMED','PLOT'].includes(type)) return []
    return [{id:String(id),name:String(properties.name || properties.objectNo || id),geometry,objectType:type as LandTopicObject['objectType'],objectNo:properties.objectNo == null ? undefined : String(properties.objectNo),auditStatus:typeof properties.auditStatus === 'number' ? properties.auditStatus : undefined,remark:typeof recognition.description === 'string' ? recognition.description : typeof properties.remark === 'string' ? properties.remark : undefined}]
  })
}
export function landStatisticsFromTopic(scene: LandSceneCode, raw: LandTopicStatisticsDto): LandStatistics {
  if (raw.sceneCode && raw.sceneCode !== scene) throw new Error('后端统计所属场景与当前专题不一致。')
  const values: LandStatistics = {}
  for (const metric of LAND_SCENE_CONFIG[scene].metrics) {
    const found = raw.metrics?.find(item => item.key === metric.key)
    if (!found) continue
    const unit = found.unit?.trim()
    if (metric.unit === '亩') {
      if (found.valueMu != null) values[metric.key] = found.valueMu
      else if (unit === '亩') values[metric.key] = found.value
      else if (['m2','m²','㎡','平方米'].includes(unit || '') && typeof found.value === 'number') values[metric.key] = found.value / (2000/3)
    } else if (!unit || unit === metric.unit) values[metric.key] = found.value
  }
  // 同名的异常图斑数有明确语义；不能将异常面积冒充“已确认违占面积”。
  if (scene === LAND_WARNING_SCENE && values.abnormalCount === undefined && raw.abnormalCount != null) values.abnormalCount = raw.abnormalCount
  return values
}
function filesForNode(node: WorkflowNode): LandEvidence[] {
  const saved = object(node.resultData)
  const metadata = Array.isArray(saved.evidence) ? saved.evidence.map(object) : []
  return (node.files || []).map((file: WorkflowFile & {url?:string}) => {
    const meta = metadata.find(item => String(item.id) === String(file.id))
    const kind = ['PHOTO','AFTER_IMAGE','UAV_PHOTO'].includes(String(meta?.kind)) ? meta!.kind as LandEvidence['kind'] : 'PHOTO'
    return {id:String(file.id),name:file.fileName,url:file.url,kind,mediaId:meta?.mediaId == null ? undefined : String(meta.mediaId)}
  })
}
export function landTaskFromBackend(raw: LandTaskDto, options: {geometry?:unknown; flow?:TaskWorkflow; userId?:string; workflowError?:string; geometryError?:string} = {}): LandTask {
  if (!(raw.sceneCode in LAND_SCENE_CONFIG)) throw new Error('任务不属于当前两个违法用地场景。')
  const flow = options.flow
  const current = flow?.currentNode
  const supported = isLandFlow(raw.sceneCode, flow)
  const known = landFlowDefinition(raw.sceneCode).nodes.map(node => node.key)
  const stage: LandStage = raw.taskStatus === 5 ? 'CLOSED' : raw.taskStatus === 4 ? 'CANCELLED' : raw.taskStatus === 3 ? 'FAILED'
    : current ? supported && known.includes(current.nodeKey) ? current.nodeKey as LandStage : 'UNSUPPORTED'
      : flow && flow.status === 'FINISHED' ? 'CLOSED' : 'NOT_STARTED'
  const timeline = [...(flow?.timeline || [])]
  if (current && !timeline.some(node => node.id === current.id)) timeline.push(current)
  const history: LandHistory[] = timeline.filter(node => node.status === 'COMPLETED').map(node => {
    const data = object(node.resultData)
    return {id:node.id,nodeKey:node.nodeKey,action:'RECORD',actorId:node.assigneeId,actorName:node.assigneeName || '未返回办理人',time:node.submitTime || '',description:String(data.description || data.opinion || data.remark || ''),conclusion:data.conclusion === 'YES' || data.conclusion === 'NO' ? data.conclusion : data.result === 'PROBLEM' ? 'YES' : data.result === 'NO_PROBLEM' ? 'NO' : undefined,evidence:filesForNode(node)}
  })
  const collection = object(read(options.geometry))
  const features = Array.isArray(collection.features) ? collection.features.filter(feature => {
    const properties = object(object(feature).properties)
    const empty = (value: unknown) => value == null || value === '' || value === 'null' || value === 'undefined'
    return empty(properties.abnormalId) && empty(properties.resultId)
  }) : []
  const range = collection.type === 'FeatureCollection' ? {...collection,features} : collection
  const first = object(features.find(feature => landPolygons(feature)))
  const saved = object(object(first.properties).landSupervision)
  const taskImages=raw.mapServices||[]
  const workflowIssue = options.workflowError || (['CLOSED','CANCELLED','FAILED'].includes(stage) ? undefined : !flow ? '后端尚未启动场景工作流，请配置场景负责人及专用流程。'
    : flow.flowKey === 'DEFAULT_FLOW' ? '后端返回通用默认流程，尚未配置该场景的核查确认／整改审核流程。'
      : !supported ? '后端流程或节点与当前场景的流程配置不一致，当前只读。' : undefined)
  return {
    id:String(raw.id),taskNo:raw.taskNo,name:raw.name,sceneCode:raw.sceneCode,geometry:landPolygons(range),
    regionIds:Array.isArray(saved.regionIds) ? saved.regionIds.map(String) : [],
    description:raw.description || '',priority:raw.priority ?? 1,stage,version:Date.parse(raw.updateTime || raw.createTime || '') || 0,
    areaSqm:raw.rangeArea ?? NaN,createTime:raw.createTime || '',currentHandlerName:current?.assigneeName || '',deadline:raw.rectifyDeadline || current?.deadline,
    beforeImageId:saved.beforeImageId == null ? taskImages[0]?.id == null ? undefined : String(taskImages[0].id) : String(saved.beforeImageId),
    afterImageId:saved.afterImageId == null ? taskImages[taskImages.length-1]?.id == null ? undefined : String(taskImages[taskImages.length-1]!.id) : String(saved.afterImageId),
    resultTypeCode:raw.sceneCode === LAND_WARNING_SCENE ? 'SUSPECT_PATCH' : 'RECTIFY_PROGRESS',
    currentNode:current ? {id:current.id,key:current.nodeKey,assigneeName:current.assigneeName || '',canOperate:!!options.userId && supported && flow?.status === 'RUNNING' && current.status === 'PROCESSING' && current.assigneeId === options.userId && ![3,4,5].includes(raw.taskStatus)} : undefined,
    history,workflow:flow,taskStatus:raw.taskStatus,statusLabel:current?.status==='PROCESSING'&&![3,4,5].includes(raw.taskStatus)?`${current.nodeName}处理中`:raw.taskStatusDesc,workflowIssue,geometryIssue:options.geometryError,backendNodeKey:current?.nodeKey,
    workflowNodes:supported ? landFlowDefinition(raw.sceneCode).nodes.map(node => ({...node,instance:[...timeline].reverse().find(item=>item.nodeKey===node.key)})) : [...new Map(timeline.map(node => [node.nodeKey,{key:node.nodeKey,name:node.nodeName,instance:node}])).values()],
  }
}
