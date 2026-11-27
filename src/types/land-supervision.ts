export const LAND_WARNING_SCENE = 'ILLEGAL_LAND_EARLY_WARN'
export const LAND_RECTIFICATION_SCENE = 'STOCK_ILLEGAL_LAND_RECTIFY'
export type LandSceneCode = typeof LAND_WARNING_SCENE | typeof LAND_RECTIFICATION_SCENE
/** Keep these dictionaries identical to the configured backend metricJson. */
export const LAND_SCENE_CONFIG = {
  [LAND_WARNING_SCENE]: {
    metrics: [
      { key: 'abnormalCount', name: '疑似违法图斑数', unit: '个' },
      { key: 'violationArea', name: '违占面积', unit: '亩' },
      { key: 'earlyWarnCount', name: '预警下发数', unit: '个' },
    ],
    resultTypes: [{ code: 'SUSPECT_PATCH', name: '疑似违法图斑', geometryType: 'POLYGON' }],
  },
  [LAND_RECTIFICATION_SCENE]: {
    metrics: [
      { key: 'stockCount', name: '存量地块数', unit: '个' },
      { key: 'rectifiedCount', name: '整改达标数', unit: '个' },
      { key: 'canceledCount', name: '销号数', unit: '个' },
    ],
    resultTypes: [
      { code: 'RECTIFY_PROGRESS', name: '整改进度影像', geometryType: 'POLYGON' },
      { code: 'RECTIFY_POINT', name: '整改核查点位', geometryType: 'POINT' },
    ],
  },
} as const
export type LandMetricKey = (typeof LAND_SCENE_CONFIG)[LandSceneCode]['metrics'][number]['key']
export type LandResultTypeCode = (typeof LAND_SCENE_CONFIG)[LandSceneCode]['resultTypes'][number]['code']
/** A verification point is a supplemental result, not the polygon of a task. */
export type LandSceneResult =
  | { id: string; code: 'SUSPECT_PATCH' | 'RECTIFY_PROGRESS'; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon }
  | { id: string; code: 'RECTIFY_POINT'; geometry: GeoJSON.Point }
export type LandStage = 'DISTRICT_DISPATCH' | 'SECTION_DISPATCH' | 'FIELD_COLLECT' | 'FIELD_RECTIFY' | 'SECTION_AUDIT' | 'FINISH_EARLYWARN' | 'FINISH_RECTIFY' | 'DISPATCH' | 'INSPECTION' | 'CONFIRM' | 'RECTIFY' | 'REVIEW' | 'TRANSFERRED' | 'CLOSED' | 'NOT_STARTED' | 'UNSUPPORTED' | 'FAILED' | 'CANCELLED'
export type LandAction = 'DISPATCH' | 'SUBMIT_INSPECTION' | 'RETURN_INSPECTION' | 'CONFIRM_CLOSE' | 'CONFIRM_TRANSFER' | 'SUBMIT_RECTIFICATION' | 'RETURN_RECTIFICATION' | 'APPROVE_CLOSE'
export type LandGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon
export interface SupervisionRegion { id: string; name: string; geometry: LandGeometry; areaSqm?: number }
export interface LandEvidence { id: string; name: string; url?: string; kind: 'PHOTO' | 'AFTER_IMAGE' | 'UAV_PHOTO'; mediaId?: string }
export interface LandHistory { id: string; nodeKey: string; action: LandAction | 'CREATE' | 'RECORD'; actorId?: string; actorName: string; time: string; description: string; conclusion?: 'YES' | 'NO'; evidence: LandEvidence[] }
export interface LandTask {
  topicObject?: {id:string;name:string;objectNo:string;objectType:string;description:string;abnormalType:string;foundTime?:string;auditStatus:number;areaSqm?:number}
  topicObjectIssue?:string
  id: string; taskNo: string; name: string; sceneCode: LandSceneCode; regionIds: string[]; geometry?: LandGeometry
  description: string; priority: number; stage: LandStage; version: number; areaSqm: number
  createTime: string; currentHandlerName: string; deadline?: string; conclusion?: 'YES' | 'NO'
  sourceTaskId?: string; linkedTaskId?: string; beforeImageId?: string; afterImageId?: string
  resultTypeCode?: Exclude<LandResultTypeCode, 'RECTIFY_POINT'>; results?: LandSceneResult[]
  /** Real operations are granted by the server, never inferred from visibility or ADMIN. */
  currentNode?: { id: string; key: string; assigneeName: string; canOperate: boolean }
  history: LandHistory[]
  taskStatus?: number; statusLabel?: string; workflowIssue?: string; geometryIssue?: string
  /** Backend node key is retained for diagnostics; no unknown node is assigned a local operation. */
  backendNodeKey?: string
  workflowNodes?: Array<{key:string;name:string;instance?:import('@/api/task-workflow').WorkflowNode}>
  workflow?: import('@/api/task-workflow').TaskWorkflow
}
export interface LandTaskCreate {
  sourceObjectId?: string
  sceneCode: LandSceneCode; name: string; description: string; priority: number; regionIds: string[]
  geometry: LandGeometry; beforeImageId?: string; afterImageId?: string; requestId: string
  resultTypeCode: Exclude<LandResultTypeCode, 'RECTIFY_POINT'>
}
export interface LandTaskAction {
  taskId: string; nodeInstId: string; expectedVersion: number; action: LandAction; requestId: string
  description: string; assigneeId?: string; assigneeName?: string; deadline?: string
  conclusion?: 'YES' | 'NO'; evidenceIds?: string[]
}
/** Values are already in the units of metricJson; missing values are not zero. */
export type LandStatistics = Partial<Record<LandMetricKey, number | null>>
export interface LandTaskPage { records: LandTask[]; total: number; pageNum: number; pageSize: number; statistics: LandStatistics; statisticsScope?: 'SCENE' | 'REGIONS'; warnings?: string[] }
export interface LandTopicObject extends SupervisionRegion {
  objectNo?: string; objectType: 'SCOPE' | 'SUSPECT' | 'CONFIRMED' | 'PLOT'; auditStatus?: number; remark?: string
}
