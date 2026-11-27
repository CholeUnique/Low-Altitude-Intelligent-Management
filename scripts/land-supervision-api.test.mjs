import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const load=(file,deps={})=>{const module={exports:{}};const source=readFileSync(file,'utf8').replaceAll('import.meta.env.VITE_LAND_SUPERVISION_ENABLED',"'true'");new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{assert(id in deps,`Unexpected dependency ${id}`);return deps[id]},module,module.exports);return module.exports}
const types=load('src/types/land-supervision.ts')
const workflow=load('src/utils/land-workflow.ts',{'@/types/land-supervision':types})
const adapter=load('src/utils/land-supervision-adapter.ts',{'@/types/land-supervision':types,'@/utils/land-workflow':workflow})
const warning=types.LAND_WARNING_SCENE,rectification=types.LAND_RECTIFICATION_SCENE
const polygon={type:'Polygon',coordinates:[[[119,32],[119.1,32],[119.1,32.1],[119,32.1],[119,32]],[[119.01,32.01],[119.02,32.01],[119.02,32.02],[119.01,32.01]]]}
const second={type:'MultiPolygon',coordinates:[[[[120,33],[120.1,33],[120,33.1],[120,33]]]]}
const collection={type:'FeatureCollection',features:[{type:'Feature',geometry:polygon,properties:{id:'9223372036854775801',objectType:'SCOPE',name:'监管范围'}},{type:'Feature',geometry:second,properties:{id:'9223372036854775802',objectType:'SUSPECT',name:'疑似图斑'}}]}
assert.equal(adapter.landPolygons(collection).coordinates.length,2,'Preserve disconnected polygons')
assert.equal(adapter.landPolygons(collection).coordinates[0].length,2,'Preserve holes')
assert.equal(adapter.landPolygons({type:'Point',coordinates:[119,32]}),undefined,'A point must not become a fake task boundary')
assert.equal(adapter.landPolygons({type:'Polygon',coordinates:[[[1,1],[2,1],[2,2],[1,2]]]}),undefined,'Unclosed polygons are not rendered')
assert.deepEqual(adapter.landObjectsFromGeoJSON(collection).map(o=>o.id),['9223372036854775801','9223372036854775802'])
assert.deepEqual(adapter.landStatisticsFromTopic(warning,{sceneCode:warning,abnormalCount:1,metrics:[]}),{abnormalCount:1},'Do not fabricate missing specialty metrics or reinterpret all abnormal area as confirmed violations')
assert.deepEqual(adapter.landStatisticsFromTopic(warning,{metrics:[{key:'violationArea',unit:'平方米',value:2000,valueMu:3},{key:'earlyWarnCount',unit:'个',value:0}]}),{violationArea:3,earlyWarnCount:0},'Respect units and an explicit zero')
assert.equal(adapter.landStatisticsFromTopic(warning,{metrics:[{key:'violationArea',unit:'亩',value:3}]}).violationArea,3,'No double area conversion')
assert.throws(()=>adapter.landStatisticsFromTopic(warning,{sceneCode:rectification}),/不一致/)
const raw={id:'9223372036854775803',taskNo:'TEST',name:'接口测试',sceneCode:warning,taskStatus:1,geometryAvailable:true,rangeArea:2000}
const flow={flowInstanceId:'flow',flowKey:'DEFAULT_FLOW',status:'RUNNING',currentNode:{id:'node',nodeKey:'REVIEW_OWNER',nodeName:'业务受理',status:'PROCESSING',assigneeId:'admin'},timeline:[]}
const normalized=adapter.landTaskFromBackend(raw,{geometry:collection,flow,userId:'admin'})
const rangeOnly=adapter.landTaskFromBackend(raw,{geometry:{...collection,features:[collection.features[0],{...collection.features[1],properties:{abnormalId:'spot'}}]}})
assert.equal(rangeOnly.geometry.coordinates.length,1,'Analysis and abnormal geometries must not enlarge the task range')
assert.equal(normalized.currentNode.canOperate,false,'Do not grant operations merely because an admin can see a task')
assert.equal(normalized.stage,'UNSUPPORTED','A default REVIEW node is not the business inspection-confirmation flow')
assert.match(normalized.workflowIssue,/默认流程/)
assert.equal(normalized.backendNodeKey,'REVIEW_OWNER')
assert.equal(adapter.landTaskFromBackend({...raw,taskStatus:5},{flow}).currentNode.canOperate,false)
assert.equal(adapter.landTaskFromBackend({...raw,taskStatus:5},{flow}).stage,'CLOSED')
assert.equal(adapter.landTaskFromBackend(raw).geometry,undefined)
const taskImagery=adapter.landTaskFromBackend({...raw,mapServices:[{id:'old-image'},{id:'new-image'}]})
assert.equal(taskImagery.beforeImageId,'old-image');assert.equal(taskImagery.afterImageId,'new-image','Legacy tasks recover their creation-time imagery even when geometry properties were dropped')
const savedImagery=adapter.landTaskFromBackend({...raw,mapServices:[{id:'fallback-1'},{id:'fallback-2'}]},{geometry:{type:'FeatureCollection',features:[{type:'Feature',geometry:polygon,properties:{landSupervision:{beforeImageId:'chosen-before',afterImageId:'chosen-after'}}}]}})
assert.equal(savedImagery.beforeImageId,'chosen-before');assert.equal(savedImagery.afterImageId,'chosen-after','Explicit comparison choices take precedence over the task service list')

const calls=[];let failStats=false,failGeometry=false,detailFailure=false,createTimeout=false
const apiClient={post:async(path,body)=>{
  calls.push({path,body})
  if(path==='/v1/biz/topic/object/geojson')return collection
  if(path==='/v1/biz/topic/object/detail')return {id:'2',topicCode:warning,name:'来源专题对象',objectNo:'TO-2',objectType:'SUSPECT',auditStatus:1,area:null,remark:JSON.stringify({landRecognition:{description:'真实判读说明',beforeImageId:'1',afterImageId:'6',regionIds:['scope']}})}
  if(path==='/v1/biz/topic/task/page')return {records:[raw],total:1,pageNum:body.pageNum,pageSize:body.pageSize}
  if(path==='/v1/biz/topic/stats'){if(failStats)throw Error('stats failed');return {sceneCode:warning,abnormalCount:1,metrics:[]}}
  if(path==='/v1/biz/task/geometry/geojson'){if(failGeometry)throw Error('geometry failed');return collection}
  if(path==='/v1/biz/task/create'){if(createTimeout)throw Error('timeout');return raw}
  if(path==='/v1/biz/task/geometry/upsert'){if(failGeometry)throw Error('save geometry failed');return null}
  if(path==='/v1/biz/task/detail'){if(detailFailure)throw Error('detail failed');return {task:raw}}
  throw Error('Unexpected endpoint '+path)
}}
class ApiBusinessError extends Error {}
let currentFlow=flow,suppressFileRefresh=false
const uploads=[]
const api=load('src/api/land-supervision.ts',{'./client':{apiClient,ApiBusinessError},'./task-workflow':{
  getTaskWorkflow:async()=>currentFlow,
  uploadWorkflowFiles:async(node,files)=>{uploads.push({node,files});if(!suppressFileRefresh)currentFlow={...currentFlow,timeline:[{...currentFlow.currentNode,files:[{id:'new-file-'+uploads.length,fileName:files[0].name}]}]}},
  submitWorkflowNode:()=>assert.fail('Unconfirmed routing must never be submitted'),
},'@/utils/land-supervision-adapter':adapter})
assert.equal((await api.listSupervisionRegions('2',warning)).length,1,'Suspect objects must not masquerade as supervision boundaries')
const query={deptId:'2',sceneCode:warning,regionIds:['region'],keyword:'search',stage:'1',pageNum:2,pageSize:10}
let page=await api.listLandTasks(query)
const pageCall=calls.find(c=>c.path.endsWith('task/page'))
assert.deepEqual(pageCall.body,{deptId:'2',sceneCode:warning,keyword:'search',taskStatus:1,pageNum:2,pageSize:10})
assert.equal(calls.find(c=>c.path.endsWith('/stats')).body.keyword,undefined,'Search must not change global statistics')
assert.equal(page.statisticsScope,'SCENE','Do not pretend the unscoped backend statistics are region-filtered')
assert(page.warnings.some(w=>w.includes('metrics')))
assert.equal(page.records[0].geometry.type,'MultiPolygon')
assert(!calls.some(c=>c.path.includes('/land-supervision')),'Every live request must use an actually published endpoint')
failStats=true;failGeometry=true
page=await api.listLandTasks(query)
assert.equal(page.total,1,'Independent statistics/geometry failures must not hide the task list')
assert.equal(page.records[0].geometry,undefined)
assert(page.records[0].geometryIssue.includes('geometry failed'))
assert(page.warnings.some(w=>w.includes('stats failed')))
failStats=false;failGeometry=false
await assert.rejects(api.listLandTasks({...query,stage:'INSPECTION'}),/只支持任务状态/)
await assert.rejects(api.actOnLandTask('2',{taskId:raw.id}),/默认流程/)
const input={sceneCode:warning,name:'测试',description:'测试说明',priority:1,geometry:polygon,regionIds:['region'],resultTypeCode:'SUSPECT_PATCH',requestId:'once'}
calls.length=0;failGeometry=true
await assert.rejects(api.createLandTask('2',input),/已创建.*补充范围/)
failGeometry=false
const [created,duplicate]=await Promise.all([api.createLandTask('2',input),api.createLandTask('2',input)])
assert.equal(created.id,raw.id);assert.equal(duplicate.id,raw.id)
assert.equal(calls.filter(c=>c.path.endsWith('/task/create')).length,1,'Retrying a failed geometry save or double clicking must not create another task')
assert.equal(calls.find(c=>c.path.endsWith('/task/create')).body.refType,'NONE')
assert.equal(calls.find(c=>c.path.endsWith('/geometry/upsert')).body.geometry.features[0].geometry.type,'Polygon')
assert.equal(calls.find(c=>c.path.endsWith('/geometry/upsert')).body.coordinateSystem,'EPSG:4326')
await assert.rejects(api.createLandTask('2',{...input,name:'changed'}),/内容已变化/)
calls.length=0;createTimeout=true
const uncertain={...input,requestId:'uncertain'}
await assert.rejects(api.createLandTask('2',uncertain),/timeout/)
await assert.rejects(api.createLandTask('2',uncertain),/任务中心核对/)
assert.equal(calls.filter(c=>c.path.endsWith('/task/create')).length,1,'An ambiguous create timeout must never be automatically reissued')
const photo=new File(['photo'],'evidence.jpg',{type:'image/jpeg'})
const saved=await api.uploadLandEvidence('2',raw.id,'node',photo,'UAV_PHOTO','9223372036854775804')
assert.equal(uploads.length,1);assert.equal(uploads[0].node,'node');assert.equal(uploads[0].files[0],photo)
assert.equal(saved.id,'new-file-1');assert.equal(saved.kind,'UAV_PHOTO');assert.equal(saved.mediaId,'9223372036854775804')
URL.revokeObjectURL(saved.url)
await assert.rejects(api.uploadLandEvidence('2',raw.id,'stale-node',photo,'PHOTO'),/节点已变化/)
assert.equal(uploads.length,1,'Do not upload into a stale workflow node')
suppressFileRefresh=true
await assert.rejects(api.uploadLandEvidence('2',raw.id,'node',photo,'PHOTO'),/附件已上传.*勿重复上传/)
assert.equal(uploads.length,2,'A missing refreshed file ID must not automatically upload twice')
raw.description='[专题对象:2] 真实判读说明'
const topicTask=await api.getLandTask('2',raw.id)
assert.equal(topicTask.topicObject.id,'2','A topic object is read using its own ID, never as an abnormal ID')
assert.equal(topicTask.topicObject.areaSqm,2000,'When object area is absent, retain the backend task range area')
assert.equal(topicTask.beforeImageId,'1');assert.equal(topicTask.afterImageId,'6')
assert.deepEqual(topicTask.regionIds,['scope'],'Recover source metadata even when geometry responses discard custom properties')
assert.equal(topicTask.description,'真实判读说明','Internal source markers are not displayed as business descriptions')
raw.mapServices=[{id:'selected-before'},{id:'selected-after'}]
const changedImages=await api.getLandTask('2',raw.id)
assert.equal(changedImages.beforeImageId,'selected-before');assert.equal(changedImages.afterImageId,'selected-after','Task creation imagery must take precedence over different older source metadata')
raw.mapServices=[{id:'6'},{id:'1'}]
const orderedImages=await api.getLandTask('2',raw.id)
assert.equal(orderedImages.beforeImageId,'1');assert.equal(orderedImages.afterImageId,'6','Matching source metadata restores before/after order independently of service ordering')
delete raw.mapServices
const initialPost=apiClient.post
const mapRows=Array.from({length:105},(_,index)=>({...raw,id:String(index+1),description:'任务范围 '+index}))
let inFlight=0,maximum=0,pages=[]
apiClient.post=async(path,body)=>{
  if(path==='/v1/biz/topic/task/page'){
    pages.push(body)
    return {records:mapRows.slice((body.pageNum-1)*100,body.pageNum*100),total:105}
  }
  assert.equal(path,'/v1/biz/task/geometry/geojson','The all-ranges loader must not fan out statistics/detail requests')
  inFlight++;maximum=Math.max(maximum,inFlight)
  await new Promise(resolve=>setTimeout(resolve,1));inFlight--
  if(body.bizTaskId==='6')throw new Error('range unavailable')
  return collection
}
const mapTasks=await api.listAllLandTaskRanges('2',warning)
assert.equal(mapTasks.length,105,'Map coverage includes every task beyond the first page')
assert.equal(mapTasks.filter(task=>task.geometry).length,104,'One bad geometry must not hide all remaining ranges')
assert.match(mapTasks[5].geometryIssue,/range unavailable/)
assert.deepEqual(pages.map(page=>page.pageNum),[1,2]);assert(maximum<=4)
assert(pages.every(page=>page.sceneCode===warning&&!page.keyword&&!page.taskStatus),'List filtering must not remove other task ranges from the map')
apiClient.post=async()=>({records:[mapRows[0],mapRows[0]],total:2})
await assert.rejects(api.listAllLandTaskRanges('2',warning),/重复任务/)
apiClient.post=initialPost
console.log('Land API integration: published contracts, geometry/holes, long IDs, statistics units/scope, partial errors, default-flow read-only and resumable task creation passed')
