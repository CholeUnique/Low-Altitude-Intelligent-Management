import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const load=(file,deps={})=>{const module={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{assert(id in deps,`Unexpected dependency ${id}`);return deps[id]},module,module.exports);return module.exports}
const types=load('src/types/land-supervision.ts')
const workflow=load('src/utils/land-workflow.ts',{'@/types/land-supervision':types})
const adapter=load('src/utils/land-supervision-adapter.ts',{'@/types/land-supervision':types,'@/utils/land-workflow':workflow})
const fixture=JSON.parse(readFileSync('scripts/fixtures/land-workflow-nodes.json','utf8'))
for(const [scene,id] of [[types.LAND_WARNING_SCENE,5],[types.LAND_RECTIFICATION_SCENE,6]]){
  const nodes=fixture.filter(node=>node.flow_id===id).sort((a,b)=>a.seq-b.seq)
  const config=workflow.landFlowDefinition(scene)
  assert.deepEqual(config.nodes,nodes.map(node=>({key:node.node_key,name:node.node_name})))
  for(const definition of nodes){
    const node={id:'node-1',nodeKey:definition.node_key,nodeName:definition.node_name,assigneeId:'owner',status:'PROCESSING',files:[{id:'file-1'}]}
    const flow={flowKey:config.key,status:'RUNNING',currentNode:node,timeline:[]}
    const raw={id:'1',sceneCode:scene,taskStatus:1}
    assert.equal(adapter.landTaskFromBackend(raw,{flow,userId:'owner'}).currentNode.canOperate,true)
    assert.equal(adapter.landTaskFromBackend(raw,{flow,userId:'admin'}).currentNode.canOperate,false)
    const returned={...flow,timeline:[{...node,id:'old',status:'COMPLETED'},node]}
    assert.equal(adapter.landTaskFromBackend(raw,{flow:returned,userId:'owner'}).workflowNodes.find(item=>item.key===node.nodeKey).instance.id,'node-1','A return creates a new active instance; do not display the old completed instance')
    const routes=definition.route?.routes||{finish:{}}
    for(const [result,route] of Object.entries(routes)){
      const draft={result,checkTime:'2026-11-27',checker:'现场办理人',description:'现场说明',opinion:'审核说明',attachment:['file-1'],target:{id:'next-user',deptId:'2'},deadline:'2099-01-01T12:00',inDeadline:id===6&&node.nodeKey==='SECTION_AUDIT'?'YES':undefined}
      const request=workflow.landNodeSubmission(scene,flow,node.id,'owner',draft)
      if(result==='finish')assert.deepEqual(request.resultData,{},'No invented routing value for a FINISH node')
      else {
        assert.equal(request.resultData.result,result)
        assert.equal(config.routes[node.nodeKey][result].next,route.next)
        const next=nodes.find(item=>item.node_key===route.next)
        const assignee=route.defaultAssignee||next?.assign?.defaultAssignee
        assert.equal(request.targetAssigneeId,assignee==='manual'?'next-user':undefined,'Finish and prevAssignee return must not overwrite the backend assignee')
      }
      assert.throws(()=>workflow.landNodeSubmission(scene,flow,'stale','owner',draft),/节点已变化/)
      assert.throws(()=>workflow.landNodeSubmission(scene,flow,node.id,'admin',draft),/指定办理人/)
      assert.throws(()=>workflow.landNodeSubmission(scene,{...flow,status:'FINISHED'},node.id,'owner',draft),/节点已变化/)
      if(node.nodeKey.startsWith('FIELD_')){
        for(const required of definition.form.filter(item=>item.required)){
          assert.throws(()=>workflow.landNodeSubmission(scene,flow,node.id,'owner',{...draft,[required.key]:required.key==='attachment'?[]:''}),undefined,`${required.key} must be validated before a write`)
        }
        assert.throws(()=>workflow.landNodeSubmission(scene,flow,node.id,'owner',{...draft,attachment:['foreign-node-file']}),/附件须属于当前节点/)
      }
      if(node.nodeKey==='SECTION_DISPATCH'&&id===6)assert.throws(()=>workflow.landNodeSubmission(scene,flow,node.id,'owner',{...draft,deadline:''}),/整改期限/)
    }
  }
}
const calls=[];let failImport=false,placementLng=119.9,hasExisting=false
const sampleShape={type:'Polygon',coordinates:[[[119.9,32.5],[119.901,32.5],[119.9,32.501],[119.9,32.5]]]}
class BusinessError extends Error{}
const api=load('src/api/land-shp-upload.ts',{'@/utils/geometry-location':load('src/utils/geometry-location.ts'),'@/assets/geo/hailing-township-labels.json':{default:JSON.parse(readFileSync('src/assets/geo/hailing-township-labels.json','utf8'))},'@/types/land-supervision':types,'./client':{apiClient:{post:async(path,body)=>{calls.push({path,body});if(path.endsWith('/shp/upload'))return {id:'9223372036854775801',datasetNo:'UP-TEST',featureCount:2,topicCode:body.get('topicCode')};if(path.endsWith('/import-from-dataset')){if(failImport)throw new BusinessError('Import unavailable');return 2}if(path.endsWith('/upload/page'))return {records:[],total:0};if(path.endsWith('/upload/delete'))return null;if(path.endsWith('/object/page'))return {records:hasExisting?[{id:'object-1',sourceDatasetId:'9223372036854775801',lng:placementLng,lat:32.5}]:[],total:hasExisting?1:0};if(path.endsWith('/object/detail'))return {geometryJson:JSON.stringify(sampleShape)};throw Error(path)}}}})
const files=[new File(['shape'],'问题.shp'),new File(['attributes'],'问题.dbf'),new File(['projection'],'问题.prj')]
assert.throws(()=>api.landShpFiles([files[0]]),/同名/)
assert.throws(()=>api.landShpFiles([files[0],new File(['dbf'],'其他.dbf')]),/同名/)
assert.throws(()=>api.landShpFiles([...files,files[0]]),/重复/)
assert.throws(()=>api.landShpFiles([new File(['zip'],'问题.zip')]),/不支持压缩包/)
for(const [scene,objectType] of [[types.LAND_WARNING_SCENE,'SUSPECT'],[types.LAND_RECTIFICATION_SCENE,'CONFIRMED']]){
  const dataset=await api.uploadLandShp('2',scene,files,'问题范围')
  const upload=calls.at(-1)
  assert.equal(upload.body.get('shareScope'),'TOPIC');assert.equal(upload.body.get('topicCode'),scene);assert.equal(upload.body.get('deptId'),'2');assert.equal(upload.body.getAll('files').length,3)
  failImport=true;await assert.rejects(api.importLandDataset('2',scene,dataset.id,'名称'),/Import unavailable/)
  failImport=false;await api.importLandDataset('2',scene,dataset.id,'名称')
  const imports=calls.filter(call=>call.path.endsWith('/import-from-dataset')).slice(-2)
  assert(imports.every(call=>call.body.datasetId===dataset.id&&call.body.topicCode===scene&&call.body.objectType===objectType&&call.body.nameField==='名称'))
}
assert.equal(calls.filter(call=>call.path.endsWith('/shp/upload')).length,2,'Import retry uses the already persisted dataset ID')
assert(!calls.some(call=>call.path.includes('/recognition/spot')),'Do not use generic recognition upload or create tasks implicitly')
assert.equal(api.landObjectType(types.LAND_WARNING_SCENE,'SCOPE'),'SCOPE')
await api.importLandDataset('2',types.LAND_WARNING_SCENE,'9223372036854775801','名称','SCOPE')
assert.equal(calls.filter(call=>call.path.endsWith('/import-from-dataset')).at(-1).body.objectType,'SCOPE','Regulatory uploads must not become suspect patches')
await api.deleteLandDataset('9223372036854775801')
assert.deepEqual(calls.at(-1).body,{ids:['9223372036854775801']})
hasExisting=true
await assert.rejects(api.importLandDataset('2',types.LAND_WARNING_SCENE,'9223372036854775801'),/已有专题图斑/)
await api.verifyLandDatasetPlacement('2',types.LAND_WARNING_SCENE,'9223372036854775801',1,{west:119.89,east:119.91,south:32.49,north:32.51})
placementLng=115.514121
await assert.rejects(api.verifyLandDatasetPlacement('2',types.LAND_WARNING_SCENE,'9223372036854775801',1,{west:119.89,east:119.91,south:32.49,north:32.51}),/位置与原图斑范围不一致/)
console.log('PASS: supplied flow 5/6 routes, forms, owner/stale checks, repeat-node history, previous-assignee return, and persisted SHP topic classification/import retries')
