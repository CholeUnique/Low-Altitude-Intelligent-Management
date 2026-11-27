import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const calls=[],scene='ILLEGAL_LAND_EARLY_WARN'
const polygon={type:'Polygon',coordinates:[[[119,32],[119.1,32],[119.1,32.1],[119,32]]]}
let raw={id:'9223372036854775801',topicCode:scene,objectNo:'TO-001',objectType:'SUSPECT',name:'演示',auditStatus:0,geometryJson:JSON.stringify(polygon),remark:JSON.stringify({landRecognition:{description:'演示说明',mapServiceIds:['1','6'],beforeImageId:'1',afterImageId:'6',regionIds:['scope']}})},linked=[],createCount=0,unknownSave=false
const module={exports:{}}
const source=ts.transpileModule(readFileSync('src/api/land-recognition.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
new Function('require','module','exports',source)(name=>({
  './client':{apiClient:{post:async(path,body)=>{calls.push({path,body});if(path.endsWith('/object/delete'))return null;if(path.endsWith('/object/draw'))return unknownSave?{}:raw;if(path.endsWith('/object/detail'))return raw;if(path.endsWith('/object/page'))return {records:[raw],total:1};if(path.endsWith('/object/audit')){raw={...raw,auditStatus:1};return raw}if(path.endsWith('/task/page'))return {records:linked,total:linked.length};assert.fail(path)}}},
  './land-shp-upload':{uploadedLandGeometryIssue:()=>undefined},
  './land-supervision':{getLandTask:async(deptId,id)=>({id,sceneCode:scene}),createLandTask:async(deptId,input,existingId)=>{calls.push({path:'createLandTask',body:input,existingId});createCount++;return {id:existingId||'2660',sceneCode:scene}}},
  '@/utils/land-supervision-adapter':{landPolygons:value=>typeof value==='string'?JSON.parse(value):value},
})[name],module,module.exports)
const api=module.exports,input={deptId:'2',sceneCode:scene,title:'演示',geometryGeojson:JSON.stringify(polygon),mapServiceIds:['1','6'],abnormalType:'OTHER'}
const saved=await api.saveLandRecognition(input)
assert.equal(saved.id,raw.id);assert.equal(saved.handleStatus,-1)
assert.equal(calls[0].path,'/v1/biz/topic/object/draw');assert.equal(calls[0].body.objectType,'SUSPECT')
assert(!calls.some(c=>c.path.includes('/recognition/spot')),'The backend explicitly forbids generic recognition writes for these scenes')
unknownSave=true;await assert.rejects(api.saveLandRecognition(input),/保存已受理.*编号或场景无效/);unknownSave=false
await assert.rejects(api.createLandRecognitionTask('2',scene,saved.id,1),/先通过/)
await assert.rejects(api.reviewLandRecognition('2','STOCK_ILLEGAL_LAND_RECTIFY',saved.id),/不属于当前场景/)
await api.reviewLandRecognition('2',scene,saved.id)
assert.equal(calls.find(c=>c.path.endsWith('/audit')).body.pass,true)
const created=await api.createLandRecognitionTask('2',scene,saved.id,2)
assert.equal(created.id,'2660')
const request=calls.find(c=>c.path==='createLandTask').body
assert.equal(request.sourceObjectId,saved.id);assert.equal(request.requestId,'topic-object:'+saved.id);assert.equal(request.priority,2);assert.equal(request.beforeImageId,'1');assert.equal(request.afterImageId,'6');assert.equal(request.name,'演示 · TO-001');assert.match(request.description,/专题对象:/)
linked=[{id:'2660',sceneCode:scene,description:request.description,geometryAvailable:true}]
const page=await api.getLandRecognitionPage({deptId:'2',sceneCode:scene,pageNum:1,pageSize:10})
assert.equal(page.records[0].taskId,'2660','Task links are recovered from persisted data after reloading')
assert.equal((await api.createLandRecognitionTask('2',scene,saved.id,2)).id,'2660');assert.equal(createCount,1,'Never create another task for a source with a known task')
linked[0].geometryAvailable=false
await api.createLandRecognitionTask('2',scene,saved.id,2)
assert.equal(calls.filter(c=>c.path==='createLandTask')[1].existingId,'2660','Resume geometry for the known task instead of creating another')
linked.push({...linked[0],id:'OTHER'})
await assert.rejects(api.createLandRecognitionTask('2',scene,saved.id,1),/已关联多条任务/)
raw={...raw,topicCode:'STOCK_ILLEGAL_LAND_RECTIFY',objectType:'CONFIRMED',auditStatus:-1};linked=[]
assert.equal((await api.saveLandRecognition({...input,sceneCode:raw.topicCode})).handleStatus,0)
assert.equal(calls.filter(c=>c.path.endsWith('/draw')).at(-1).body.objectType,'CONFIRMED')
await assert.rejects(api.reviewLandRecognition('2',raw.topicCode,saved.id),/只有待审核/)
raw={...raw,sourceType:'UPLOAD'};linked=[]
await assert.rejects(api.createLandRecognitionTask('2',raw.topicCode,saved.id,1,'  '),/任务名称不能为空/)
await api.createLandRecognitionTask('2',raw.topicCode,saved.id,1,'  自定义整改任务标题  ',{beforeImageId:'selected-before',afterImageId:'selected-after'})
assert.equal(calls.filter(call=>call.path==='createLandTask').at(-1).body.name,'自定义整改任务标题','Persist the user title rather than rebuilding a title from the source patch')
assert.equal(calls.filter(call=>call.path==='createLandTask').at(-1).body.beforeImageId,'selected-before')
assert.equal(calls.filter(call=>call.path==='createLandTask').at(-1).body.afterImageId,'selected-after','Persist the current comparison choices for an uploaded patch too')
assert(calls.filter(call=>call.path.endsWith('/task/page')).every(call=>call.body.keyword===undefined),'Recover associations from source markers even when a custom task title omits the patch number')
await api.deleteUploadedLandObject('2',raw.topicCode,saved.id)
assert.deepEqual(calls.find(item=>item.path.endsWith('/object/delete')).body,{ids:[saved.id]})
linked=[{id:'2660',sceneCode:raw.topicCode,description:'[专题对象:'+saved.id+']'}]
await assert.rejects(api.deleteUploadedLandObject('2',raw.topicCode,saved.id),/已生成任务/)
console.log('PASS: topic-only endpoints, separate object IDs, scene isolation, warning review vs confirmed rectification, source/imagery persistence, existing-task recovery and duplicate prevention')
