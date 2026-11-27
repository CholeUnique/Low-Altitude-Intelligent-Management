import { apiClient } from './client'
import { LAND_WARNING_SCENE, LAND_RECTIFICATION_SCENE, type LandSceneCode } from '@/types/land-supervision'
import { geometryLocation } from '@/utils/geometry-location'
import hailing from '@/assets/geo/hailing-township-labels.json'
const topicBounds=geometryLocation({type:'GeometryCollection',geometries:hailing.regions.map(item=>item.geometry)})
export function uploadedLandGeometryIssue(geometry:unknown) {
  const actual=geometryLocation(geometry)
  if(!actual)return '上传图斑没有有效几何，请核对原文件后重新上传。'
  if(!topicBounds||actual.west<topicBounds.west-0.00002||actual.east>topicBounds.east+0.00002||actual.south<topicBounds.south-0.00002||actual.north>topicBounds.north+0.00002)return '上传图斑位置超出海陵区范围，可能存在源坐标系误读；请删除异常对象并重新上传，当前不能审核或生成任务。'
  return undefined
}

export interface LandUploadDataset {
  id:string;datasetNo:string;datasetName:string;featureCount:number;topicCode?:string
  shareScope?:string;convertTime?:string;convertTarget?:string;uploadTime?:string
  hasTopicObjects?:boolean;importStateUnknown?:boolean
}
export function landObjectType(scene:LandSceneCode, purpose?:'SCOPE') {
  if(purpose==='SCOPE'&&(scene===LAND_WARNING_SCENE||scene===LAND_RECTIFICATION_SCENE))return 'SCOPE'
  if(scene===LAND_WARNING_SCENE)return 'SUSPECT'
  if(scene===LAND_RECTIFICATION_SCENE)return 'CONFIRMED'
  throw new Error('不支持的违法用地专题。')
}
export function landShpFiles(files:File[]) {
  const parts=new Map<string,File>(),names=new Set<string>()
  for(const file of files){
    const match=file.name.match(/^(.+)\.(shp|dbf|shx|prj|cpg)$/i)
    if(!match)throw new Error('请选择 .shp、.dbf、.shx、.prj、.cpg 组件文件，不支持压缩包。')
    const ext=match[2]!.toLowerCase();names.add(match[1]!.toLowerCase())
    if(parts.has(ext))throw new Error(`重复的 .${ext} 文件，请只选择一组同名文件。`)
    parts.set(ext,file)
  }
  if(names.size!==1||!parts.has('shp')||!parts.has('dbf'))throw new Error('须选择同名的 .shp 与 .dbf 文件，可同时附带其他组件。')
  if(files.reduce((sum,file)=>sum+file.size,0)>50*1024*1024)throw new Error('文件组总大小不能超过 50MB。')
  return parts
}
export async function uploadLandShp(deptId:string,scene:LandSceneCode,files:File[],datasetName:string):Promise<LandUploadDataset> {
  landObjectType(scene);landShpFiles(files)
  const form=new FormData()
  files.forEach(file=>form.append('files',file))
  form.append('shareScope','TOPIC');form.append('topicCode',scene)
  if(deptId)form.append('deptId',deptId)
  if(datasetName.trim())form.append('datasetName',datasetName.trim())
  const result=await apiClient.post<never,LandUploadDataset>('/v1/biz/upload/shp/upload',form,{timeout:120000})
  if(!result?.id||!Number.isInteger(result.featureCount)||result.featureCount<1)throw new Error('上传已受理，但未返回有效的数据集编号／要素数，请先核对已保存数据，勿重复上传。')
  if(result.topicCode&&result.topicCode!==scene)throw new Error('数据已保存，但返回的专题不一致，已停止导入，请联系后端核对。')
  return {...result,id:String(result.id)}
}
export async function importLandDataset(deptId:string,scene:LandSceneCode,datasetId:string,nameField?:string,purpose?:'SCOPE') {
  if(!/^\d+$/.test(datasetId))throw new Error('无效的数据集编号。')
  // Topic import does not reliably set the generic upload convertTime. Check actual source references.
  let read=0
  for(let pageNum=1;;pageNum++){
    const page=await apiClient.post<never,{records:Array<{sourceDatasetId?:string}>;total:number}>('/v1/biz/topic/object/page',{deptId,topicCode:scene,pageNum,pageSize:200})
    if(!Number.isInteger(Number(page.total))||Number(page.total)<0)throw new Error('专题对象列表未返回有效总数，已停止读取。')
    if(page.records.some(item=>String(item.sourceDatasetId)===datasetId))throw new Error('该数据集已有专题图斑，请在识别列表核对；为避免重复记录，不能再次导入。')
    if(!page.records.length&&read<Number(page.total))throw new Error('关联图斑列表不完整，暂不能确认是否重复导入。')
    read+=page.records.length;if(read>=Number(page.total))break
  }
  return apiClient.post<never,number>('/v1/biz/topic/object/import-from-dataset',{deptId,datasetId,topicCode:scene,objectType:landObjectType(scene,purpose),nameField:nameField||undefined},{timeout:120000})
}
export async function savedLandDatasets(deptId:string,scene:LandSceneCode) {
  landObjectType(scene)
  const page=await apiClient.post<never,{records:LandUploadDataset[];total:number}>('/v1/biz/upload/page',{deptId,shareScope:'TOPIC',topicCode:scene,pageNum:1,pageSize:200})
  try{
    const recent=await apiClient.post<never,{records:Array<{sourceDatasetId?:string}>}>('/v1/biz/topic/object/page',{deptId,topicCode:scene,pageNum:1,pageSize:200})
    const imported=new Set(recent.records.map(item=>String(item.sourceDatasetId)))
    return {...page,records:page.records.map(item=>({...item,hasTopicObjects:imported.has(String(item.id))}))}
  }catch{return {...page,records:page.records.map(item=>({...item,importStateUnknown:true}))}}
}
/** Dataset deletion does not claim to delete the separately imported topic objects. */
export function deleteLandDataset(datasetId:string) {
  if(!/^\d+$/.test(datasetId))throw new Error('无效的数据集编号。')
  return apiClient.post('/v1/biz/upload/delete',{ids:[datasetId]})
}
export async function verifyLandDatasetPlacement(deptId:string,scene:LandSceneCode,datasetId:string,featureCount:number,expected?:ReturnType<typeof geometryLocation>,purpose?:'SCOPE') {
  const bounds=expected||topicBounds
  if(!bounds)throw new Error('无法取得位置核验范围。')
  const records:Array<{id:string;lng?:number;lat?:number}>=[]
  let read=0
  for(let pageNum=1;;pageNum++){
    const page=await apiClient.post<never,{records:Array<{id:string;sourceDatasetId?:string;lng?:number;lat?:number}>;total:number}>('/v1/biz/topic/object/page',{deptId,topicCode:scene,objectType:landObjectType(scene,purpose),pageNum,pageSize:200})
    if(!Number.isInteger(Number(page.total))||Number(page.total)<0)throw new Error('专题对象列表未返回有效总数，无法核验位置。')
    if(!page.records.length&&read<Number(page.total))throw new Error('专题对象列表不完整，无法核验上传位置。')
    records.push(...page.records.filter(item=>String(item.sourceDatasetId)===datasetId));read+=page.records.length
    if(read>=Number(page.total))break
  }
  if(records.length!==featureCount||new Set(records.map(item=>String(item.id))).size!==featureCount)throw new Error(`专题对象数量核验失败：预期 ${featureCount}，实际 ${records.length}。请核对已保存记录，勿重复导入。`)
  const inside=(lng:unknown,lat:unknown)=>typeof lng==='number'&&typeof lat==='number'&&Number.isFinite(lng)&&Number.isFinite(lat)&&lng>=bounds.west-0.00002&&lng<=bounds.east+0.00002&&lat>=bounds.south-0.00002&&lat<=bounds.north+0.00002
  if(records.some(item=>(item.lng!=null||item.lat!=null)&&!inside(item.lng,item.lat)))throw new Error('后端保存位置与原图斑范围不一致，可能误用了源坐标系。数据已经入库，请删除异常专题对象后重新上传，勿继续生成任务。')
  const sample=await apiClient.post<never,{geometryJson?:string}>('/v1/biz/topic/object/detail',{deptId,id:records[0]!.id})
  let shape:unknown
  try{shape=JSON.parse(sample.geometryJson||'null')}catch{throw new Error('后端返回的图斑几何无法解析。')}
  const actual=geometryLocation(shape)
  if(!actual||!inside(actual.west,actual.south)||!inside(actual.east,actual.north))throw new Error('后端返回的实际几何超出上传范围，已停止后续操作，请核对坐标转换。')
}
