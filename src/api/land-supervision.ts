import { apiClient, ApiBusinessError } from './client'
import { getTaskWorkflow, uploadWorkflowFiles, submitWorkflowNode } from './task-workflow'
import type { LandEvidence, LandSceneCode, LandTask, LandTaskAction, LandTaskCreate, LandTaskPage, SupervisionRegion, LandTopicObject } from '@/types/land-supervision'
import { landObjectsFromGeoJSON, landTaskFromBackend, landStatisticsFromTopic, type LandTaskDto, type LandTopicStatisticsDto } from '@/utils/land-supervision-adapter'

/** The backend exposes topic objects + shared business tasks, not /land-supervision. */
export const landSupervisionEnabled = import.meta.env.VITE_LAND_SUPERVISION_ENABLED === 'true'
const topic = '/v1/biz/topic'
const message = (error: unknown) => error instanceof Error ? error.message : '接口读取失败'
export async function listLandObjects(deptId: string, sceneCode: LandSceneCode): Promise<LandTopicObject[]> {
  return landObjectsFromGeoJSON(await apiClient.post(`${topic}/object/geojson`, { deptId, topicCode: sceneCode }))
}
export async function listSupervisionRegions(deptId: string, sceneCode: LandSceneCode): Promise<SupervisionRegion[]> {
  // SUSPECT / CONFIRMED 是问题对象，不能冒充监管边界。
  return (await listLandObjects(deptId, sceneCode)).filter(item => item.objectType === 'SCOPE')
}
export function drawLandObject(deptId: string, sceneCode: LandSceneCode, name: string, geometry: LandTaskCreate['geometry'], remark?: string) {
  return apiClient.post(`${topic}/object/draw`, { deptId, topicCode: sceneCode, objectType: sceneCode === 'ILLEGAL_LAND_EARLY_WARN' ? 'SUSPECT' : 'CONFIRMED', name, geometryGeojson: JSON.stringify(geometry), remark })
}
export function auditLandObject(deptId: string, id: string, pass: boolean, opinion?: string) {
  // 对象审核独立于任务工作流；不能用它替代负责人核查确认或自动转整改。
  return apiClient.post(`${topic}/object/audit`, { deptId, id, pass, opinion })
}
async function taskGeometry(deptId: string, taskId: string) {
  return apiClient.post('/v1/biz/task/geometry/geojson', { deptId, bizTaskId: taskId, includeAbnormalPoints: false })
}
/** Map ranges are independent of the task list's filters and pagination. No workflow fan-out. */
export async function listAllLandTaskRanges(deptId:string,sceneCode:LandSceneCode):Promise<LandTask[]> {
  const rows:LandTaskDto[]=[]
  for(let pageNum=1;;pageNum++){
    const page=await apiClient.post<never,{records:LandTaskDto[];total:number}>(`${topic}/task/page`,{deptId,sceneCode,pageNum,pageSize:100})
    if(!Number.isInteger(Number(page.total))||Number(page.total)<0)throw new Error('任务范围列表未返回有效总数。')
    if(page.records.some(item=>item.sceneCode!==sceneCode))throw new Error('任务范围包含其他场景数据，已停止展示。')
    if(!page.records.length&&rows.length<Number(page.total))throw new Error('任务范围分页不完整，请刷新重试。')
    rows.push(...page.records)
    if(new Set(rows.map(item=>String(item.id))).size!==rows.length)throw new Error('任务范围分页返回重复任务，请刷新重试。')
    if(rows.length>=Number(page.total))break
  }
  const tasks=rows.map(raw=>landTaskFromBackend(raw))
  let next=0
  await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{
    for(let index=next++;index<rows.length;index=next++){
      const raw=rows[index]!
      if(!raw.geometryAvailable)continue
      try{tasks[index]=landTaskFromBackend(raw,{geometry:await taskGeometry(deptId,String(raw.id))})}
      catch(reason){tasks[index]=landTaskFromBackend(raw,{geometryError:message(reason)})}
    }
  }))
  return tasks
}
export async function listLandTasks(query: { deptId: string; sceneCode: LandSceneCode; regionIds: string[]; keyword: string; stage?: string; pageNum: number; pageSize: number }): Promise<LandTaskPage> {
  const { deptId, sceneCode, keyword, pageNum, pageSize } = query
  if (query.stage && !/^[0-5]$/.test(query.stage)) throw new Error('专题任务接口当前只支持任务状态筛选，不支持按工作流阶段筛选。')
  const [pageResult, statsResult] = await Promise.allSettled([
    apiClient.post<never, {records:LandTaskDto[];total:number;pageNum:number;pageSize:number}>(`${topic}/task/page`, { deptId, sceneCode, keyword:keyword || undefined, taskStatus:query.stage ? Number(query.stage) : undefined, pageNum, pageSize }),
    apiClient.post<never, LandTopicStatisticsDto>(`${topic}/stats`, { deptId, topicCode:sceneCode }),
  ])
  if (pageResult.status === 'rejected') throw pageResult.reason
  const page = pageResult.value
  if(page.records.some(raw=>raw.sceneCode!==sceneCode))throw new Error('后端任务列表包含其他场景的数据，请核对专题隔离。')
  const warnings = ['当前接口不支持按监管片区筛选任务和统计，以下为本场景全量口径。']
  const records = page.records.map(raw => landTaskFromBackend(raw))
  let next = 0
  await Promise.all(Array.from({length:Math.min(4,records.length)}, async () => {
    for (let index = next++; index < records.length; index = next++) {
      const raw = page.records[index]!
      const [geometry,flow] = await Promise.allSettled([
        raw.geometryAvailable ? taskGeometry(deptId,String(raw.id)) : Promise.resolve(undefined),
        getTaskWorkflow(String(raw.id)),
      ])
      records[index] = landTaskFromBackend(raw, {
        geometry:geometry.status==='fulfilled'?geometry.value:undefined,
        flow:flow.status==='fulfilled'?flow.value:undefined,
        geometryError:geometry.status==='rejected'?message(geometry.reason):undefined,
        workflowError:flow.status==='rejected'?message(flow.reason):undefined,
      })
    }
  }))
  if (statsResult.status === 'rejected') warnings.push(`场景统计：${message(statsResult.reason)}`)
  else if (!statsResult.value.metrics?.length) warnings.push('后端尚未返回场景特色指标值（metrics 为空）；缺失数值显示“—”。')
  return {records,total:Number(page.total),pageNum:page.pageNum,pageSize:page.pageSize,statistics:statsResult.status === 'fulfilled' ? landStatisticsFromTopic(sceneCode,statsResult.value) : {},statisticsScope:'SCENE',warnings}
}
export async function getLandTask(deptId: string, taskId: string, userId?: string): Promise<LandTask> {
  const [detail, geometry, flow] = await Promise.allSettled([
    apiClient.post<never, {task:LandTaskDto}>('/v1/biz/task/detail', {deptId,id:taskId}),
    taskGeometry(deptId,taskId), getTaskWorkflow(taskId),
  ])
  if (detail.status === 'rejected') throw detail.reason
  if(String(detail.value.task.id)!==taskId)throw new Error('后端任务详情与请求的任务编号不一致。')
  const task = landTaskFromBackend(detail.value.task, {
    userId,
    geometry:geometry.status === 'fulfilled' ? geometry.value : undefined,
    geometryError:geometry.status === 'rejected' ? message(geometry.reason) : undefined,
    flow:flow.status === 'fulfilled' ? flow.value : undefined,
    workflowError:flow.status === 'rejected' ? message(flow.reason) : undefined,
  })
  // The task geometry endpoint currently drops custom feature properties. Resolve the actual topic source separately.
  const sourceId=detail.value.task.topicObjectId||detail.value.task.description?.match(/^\[专题对象:(\d+)\]/)?.[1]
  if(sourceId){
    try{
      const source=await apiClient.post<never,{id:string|number;topicCode:string;name:string;objectNo:string;objectType:string;remark?:string;createTime?:string;auditStatus:number;area?:number}>(`${topic}/object/detail`,{deptId,id:sourceId})
      if(source.topicCode!==task.sceneCode)throw new Error('任务来源专题对象所属场景不一致。')
      let meta:Record<string,unknown>={}
      try{meta=JSON.parse(source.remark||'{}').landRecognition||{}}catch{/* Legacy remarks are plain text. */}
      task.topicObject={id:String(source.id),name:source.name,objectNo:source.objectNo,objectType:source.objectType,description:typeof meta.description==='string'?meta.description:source.remark||'',abnormalType:String(meta.abnormalTypeName||meta.abnormalType||source.objectType),foundTime:String(meta.foundTime||source.createTime||''),auditStatus:source.auditStatus,areaSqm:source.area??detail.value.task.rangeArea}
      const taskImageIds=new Set((detail.value.task.mapServices||[]).map(item=>String(item.id)))
      // Source metadata restores order, but must not overwrite different imagery selected for this task.
      const matchesTaskImages=!taskImageIds.size||[meta.beforeImageId,meta.afterImageId].filter(Boolean).every(id=>taskImageIds.has(String(id)))
      if(matchesTaskImages){
        task.beforeImageId=meta.beforeImageId?String(meta.beforeImageId):task.beforeImageId
        task.afterImageId=meta.afterImageId?String(meta.afterImageId):task.afterImageId
      }
      if(Array.isArray(meta.regionIds))task.regionIds=meta.regionIds.map(String)
      task.description=task.description.replace(/^\[专题对象:\d+\]\s*/,'')
    }catch(error){task.topicObjectIssue=message(error)}
  }
  return task
}
// 通用创建与保存范围是两个请求。同一次页面会话重试只补做未成功步骤，避免再建一条任务。
const creations = new Map<string, {payload:string;id?:string;saved?:boolean;uncertain?:boolean;pending?:Promise<LandTask>}>()
export function clearLandSession() { creations.clear() }
export function createLandTask(deptId: string, input: LandTaskCreate, existingTaskId?:string): Promise<LandTask> {
  const key = `${deptId}:${input.sceneCode}:${input.requestId}`, payload = JSON.stringify(input)
  let job = creations.get(key)
  if (job && job.payload !== payload) return Promise.reject(new Error('创建内容已变化，请重新圈定图斑后提交。'))
  if (!job) { job = {payload}; creations.set(key,job) }
  if (job.uncertain) return Promise.reject(new Error('上次创建请求未取得明确结果，请先到任务中心核对，避免重复生成任务。'))
  if (job.pending) return job.pending
  const current = job
  if(existingTaskId&&!current.id)current.id=existingTaskId
  current.pending = (async () => {
    if (!current.id) {
      try {
        const raw = await apiClient.post<never, LandTaskDto>('/v1/biz/task/create', {deptId,sceneCode:input.sceneCode,name:input.name,description:input.description,priority:input.priority,refType:'NONE',executeMode:'MANUAL',mapServiceIds:[...new Set([input.beforeImageId,input.afterImageId].filter(Boolean))]})
        if(!raw||!/^\d+$/.test(String(raw.id))||raw.sceneCode!==input.sceneCode)throw new Error('创建接口未返回对应场景的有效任务编号，请先到任务中心核对。')
        current.id = String(raw.id)
      } catch(error) {
        if(error instanceof ApiBusinessError)creations.delete(key)
        else current.uncertain=true
        throw error
      }
    }
    if (!current.saved) {
      await apiClient.post('/v1/biz/task/geometry/upsert', {deptId,bizTaskId:current.id,coordinateSystem:'EPSG:4326',geometryType:'POLYGON',rangeName:input.name,geometry:{type:'FeatureCollection',features:[{type:'Feature',geometry:input.geometry,properties:{landSupervision:{sourceObjectId:input.sourceObjectId,regionIds:input.regionIds,beforeImageId:input.beforeImageId,afterImageId:input.afterImageId,resultTypeCode:input.resultTypeCode}}}]}})
      current.saved = true
    }
    return getLandTask(deptId,current.id)
  })().catch(error => { throw new Error(`${current.id ? `任务 ${current.id} 已创建；重试将补充范围或重新读取，不会再次创建。` : ''}${message(error)}`) }).finally(() => { current.pending = undefined })
  return current.pending
}
/** 已接通通用提交入口；result 的业务路由值须由场景工作流契约确认，不能猜测。 */
export const submitLandWorkflowNode = submitWorkflowNode
export async function actOnLandTask(deptId: string, input: LandTaskAction): Promise<LandTask> {
  const latest = await getLandTask(deptId,input.taskId)
  throw new Error(latest.workflowIssue || '后端尚未提供本场景节点动作与 result 的对应契约，暂不能提交。')
}
export async function uploadLandEvidence(_deptId: string, taskId: string, nodeInstId: string, file: File, kind: LandEvidence['kind'], mediaId?: string): Promise<LandEvidence> {
  const before = await getTaskWorkflow(taskId)
  if (before?.currentNode?.id !== nodeInstId) throw new Error('当前办理节点已变化，请刷新后重新上传。')
  const existing = new Set([...before.timeline, ...(before.currentNode ? [before.currentNode] : [])].flatMap(node => node.files || []).map(item => item.id))
  await uploadWorkflowFiles(nodeInstId,[file])
  const after = await getTaskWorkflow(taskId)
  const candidates = [...(after?.timeline || []), ...(after?.currentNode ? [after.currentNode] : [])].filter(node => node.id === nodeInstId)
  const saved = candidates.flatMap(node => node.files || []).find(item => !existing.has(item.id) && item.fileName === file.name)
  if (!saved) throw new Error('附件已上传，但后端未返回新附件编号，请刷新节点核对，勿重复上传。')
  return {id:saved.id,name:saved.fileName,kind,mediaId,url:URL.createObjectURL(file)}
}
