import { apiClient } from './client'
import { createLandTask, getLandTask } from './land-supervision'
import type { MapServiceItem } from './map-service'
import type { RecognitionSpotAddInput } from './recognition-spot'
import type { LandSceneCode, LandTask, LandTaskCreate } from '@/types/land-supervision'
import { landPolygons } from '@/utils/land-supervision-adapter'
import { uploadedLandGeometryIssue } from './land-shp-upload'

export interface LandRecognitionItem {
  sourceType?:string;sourceDatasetId?:string;geometryIssue?:string
  id:string;spotNo:string;sceneCode:string;title:string;description:string;abnormalType:string;abnormalTypeDesc:string
  area?:number;foundTime?:string;handleStatus:number;auditStatus:number;taskId?:string
  boundaryGeoJson?:unknown;mapServices:MapServiceItem[];regionIds:string[];beforeImageId?:string;afterImageId?:string
}
interface TopicObject {
  sourceType?:string;sourceDatasetId?:string|number
  id:string|number;objectNo?:string;topicCode:string;objectType:string;name:string;remark?:string;geometryJson?:string
  area?:number;auditStatus:number;createTime?:string
}
const prefix='/v1/biz/topic/object'
const links=new Map<string,string>()
const key=(deptId:string,scene:string,id:string)=>`${deptId}:${scene}:${id}`
function normalize(raw:TopicObject,deptId:string):LandRecognitionItem {
  let metadata:Record<string,unknown>={}
  try{metadata=JSON.parse(raw.remark||'{}').landRecognition||{}}catch{/* Legacy remarks remain plain text. */}
  const ids=Array.isArray(metadata.mapServiceIds)?metadata.mapServiceIds.map(String):[]
  return {geometryIssue:raw.sourceType==='UPLOAD'&&raw.geometryJson?uploadedLandGeometryIssue(landPolygons(raw.geometryJson)):undefined,sourceType:raw.sourceType,sourceDatasetId:raw.sourceDatasetId==null?undefined:String(raw.sourceDatasetId),id:String(raw.id),spotNo:raw.objectNo||String(raw.id),sceneCode:raw.topicCode,title:raw.name,
    description:typeof metadata.description==='string'?metadata.description:raw.remark||'',
    abnormalType:String(metadata.abnormalType||''),abnormalTypeDesc:String(metadata.abnormalTypeName||metadata.abnormalType||(raw.objectType==='CONFIRMED'?'确认违规用地':'疑似违规用地')),
    area:raw.area,foundTime:String(metadata.foundTime||raw.createTime||''),auditStatus:raw.auditStatus,
    handleStatus:raw.auditStatus===0?-1:raw.auditStatus===2?4:0,
    boundaryGeoJson:landPolygons(raw.geometryJson),mapServices:ids.map(id=>({id} as MapServiceItem)),
    regionIds:Array.isArray(metadata.regionIds)?metadata.regionIds.map(String):[],
    beforeImageId:metadata.beforeImageId?String(metadata.beforeImageId):undefined,afterImageId:metadata.afterImageId?String(metadata.afterImageId):undefined,
    taskId:links.get(key(deptId,raw.topicCode,String(raw.id))),
  }
}
function assertScene(spot:LandRecognitionItem,scene:LandSceneCode){if(spot.sceneCode!==scene)throw new Error('专题对象不属于当前场景，已停止操作。')}
export async function getLandRecognitionDetail(query:{deptId?:string;id:string}){
  return normalize(await apiClient.post<never,TopicObject>(`${prefix}/detail`,query),query.deptId||'')
}
export async function getLandRecognitionPage(query:{deptId?:string;sceneCode:LandSceneCode;keyword?:string;handleStatus?:number;pageNum:number;pageSize:number}){
  const page=await apiClient.post<never,{records:TopicObject[];total:number}>(`${prefix}/page`,{
    deptId:query.deptId,topicCode:query.sceneCode,objectType:query.sceneCode==='ILLEGAL_LAND_EARLY_WARN'?'SUSPECT':'CONFIRMED',
    keyword:query.keyword,auditStatus:query.handleStatus===-1?0:query.handleStatus===0?query.sceneCode==='ILLEGAL_LAND_EARLY_WARN'?1:-1:query.handleStatus===4?2:undefined,
    pageNum:query.pageNum,pageSize:query.pageSize,
  })
  const records=page.records.map(item=>normalize(item,query.deptId||''))
  // The published object model has no taskId. Recover links from the persisted task source marker.
  const taskLinks=records.length?await listTaskLinks(query.deptId||'',query.sceneCode):[]
  await Promise.all(records.map(async item=>{const task=await findTask(query.deptId||'',query.sceneCode,item,taskLinks);if(task){item.taskId=String(task.id);if(item.area==null)item.area=task.rangeArea;links.set(key(query.deptId||'',query.sceneCode,item.id),item.taskId)}else{item.taskId=undefined;links.delete(key(query.deptId||'',query.sceneCode,item.id))}}))
  return {...page,records}
}
export async function saveLandRecognition(input:RecognitionSpotAddInput & {abnormalTypeName?:string;regionIds?:string[];beforeImageId?:string;afterImageId?:string}):Promise<LandRecognitionItem>{
  const raw=await apiClient.post<never,TopicObject>(`${prefix}/draw`,{deptId:input.deptId,topicCode:input.sceneCode,
    objectType:input.sceneCode==='ILLEGAL_LAND_EARLY_WARN'?'SUSPECT':'CONFIRMED',name:input.title,geometryGeojson:input.geometryGeojson,
    remark:JSON.stringify({landRecognition:{description:input.description,abnormalType:input.abnormalType,abnormalTypeName:input.abnormalTypeName,foundTime:input.foundTime,mapServiceIds:input.mapServiceIds,regionIds:input.regionIds,beforeImageId:input.beforeImageId,afterImageId:input.afterImageId}}),
  })
  if(raw?.id==null||raw.topicCode!==input.sceneCode)throw new Error('专题对象保存已受理，但返回编号或场景无效，请刷新核对，勿重复保存。')
  return normalize(raw,input.deptId||'')
}
export async function reviewLandRecognition(deptId:string,scene:LandSceneCode,id:string){
  const spot=await getLandRecognitionDetail({deptId,id});assertScene(spot,scene)
  if(spot.geometryIssue)throw new Error(spot.geometryIssue)
  if(scene!=='ILLEGAL_LAND_EARLY_WARN'||spot.auditStatus!==0)throw new Error('只有待审核的预警专题对象可以审核。')
  await apiClient.post(`${prefix}/audit`,{deptId,id,pass:true,opinion:'人工判读通过，提交场景负责人后续核查。以工作台现场核查及负责人确认结论为准。'})
}
export async function deleteUploadedLandObject(deptId:string,scene:LandSceneCode,id:string){
  const spot=await getLandRecognitionDetail({deptId,id});assertScene(spot,scene)
  if(spot.sourceType!=='UPLOAD')throw new Error('此入口仅删除上传的图斑。')
  if(await findTask(deptId,scene,spot))throw new Error('图斑已生成任务，请先在任务中心处理关联业务，不能直接删除。')
  return apiClient.post('/v1/biz/topic/object/delete',{ids:[id]})
}
interface TaskLink {id:string|number;sceneCode:string;description?:string;geometryAvailable?:boolean;rangeArea?:number}
async function listTaskLinks(deptId:string,scene:LandSceneCode):Promise<TaskLink[]>{
  // Task keyword searches names/numbers only; a custom title need not contain the source patch number.
  const records:TaskLink[]=[]
  for(let pageNum=1;;pageNum++){
    const page=await apiClient.post<never,{records:TaskLink[];total:number}>('/v1/biz/topic/task/page',{deptId,sceneCode:scene,pageNum,pageSize:200})
    if(!Number.isInteger(Number(page.total))||Number(page.total)<0||(!page.records.length&&records.length<Number(page.total)))throw new Error('关联任务分页不完整，暂不能确认是否已生成任务。')
    if(page.records.some(item=>item.sceneCode!==scene))throw new Error('关联任务所属场景不一致。')
    records.push(...page.records)
    if(new Set(records.map(item=>String(item.id))).size!==records.length)throw new Error('关联任务分页重复，请刷新后重试。')
    if(records.length>=Number(page.total))return records
  }
}
async function findTask(deptId:string,scene:LandSceneCode,spot:LandRecognitionItem,knownTasks?:TaskLink[]):Promise<TaskLink|undefined>{
  const matches=(knownTasks||await listTaskLinks(deptId,scene)).filter(item=>item.sceneCode===scene&&item.description?.includes(`[专题对象:${spot.id}]`))
  if(matches.length>1)throw new Error(`专题对象 ${spot.spotNo} 已关联多条任务，请由后台核对，停止再次创建。`)
  return matches[0]
}
export async function createLandRecognitionTask(deptId:string,scene:LandSceneCode,id:string,priority:number,taskName?:string,comparison?:{beforeImageId?:string;afterImageId?:string}):Promise<LandTask>{
  if(taskName!==undefined&&(!taskName.trim()||taskName.trim().length>200))throw new Error('任务名称不能为空，且不能超过 200 字。')
  const spot=await getLandRecognitionDetail({deptId,id});assertScene(spot,scene)
  if(spot.geometryIssue)throw new Error(spot.geometryIssue)
  if(spot.auditStatus===0||spot.auditStatus===2)throw new Error('请先通过预警专题对象审核后再生成任务。')
  const geometry=landPolygons(spot.boundaryGeoJson)
  if(!geometry)throw new Error('专题对象没有有效面几何，不能生成任务。')
  const found=await findTask(deptId,scene,spot)
  if(found?.geometryAvailable){links.set(key(deptId,scene,id),String(found.id));return getLandTask(deptId,String(found.id))}
  const input:LandTaskCreate={sceneCode:scene,name:taskName?.trim()||`${spot.title.slice(0,140)} · ${spot.spotNo}`,description:`[专题对象:${spot.id}] ${spot.description}`.slice(0,1000),
    priority,geometry,regionIds:spot.regionIds,beforeImageId:comparison?.beforeImageId||spot.beforeImageId||String(spot.mapServices[0]?.id||''),afterImageId:comparison?.afterImageId||spot.afterImageId||String(spot.mapServices[spot.mapServices.length-1]?.id||''),
    sourceObjectId:spot.id,resultTypeCode:scene==='ILLEGAL_LAND_EARLY_WARN'?'SUSPECT_PATCH':'RECTIFY_PROGRESS',requestId:`topic-object:${spot.id}`}
  const task=await createLandTask(deptId,input,found?String(found.id):undefined)
  links.set(key(deptId,scene,id),task.id)
  return task
}
