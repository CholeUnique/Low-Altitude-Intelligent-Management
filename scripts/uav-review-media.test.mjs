import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import {parse,compileScript} from '@vue/compiler-sfc'
function load(source,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(id=>{assert(id in deps,`Unexpected import ${id}`);return deps[id]},m,m.exports);return m.exports}
class ApiBusinessError extends Error{constructor(code,message){super(message);this.code=code}}
const calls=[];let response,fail
const api=load(readFileSync('src/api/uav-media-match.ts','utf8'),{'./client':{ApiBusinessError,parseJsonWithSafeIntegers:JSON.parse,apiClient:{post:async(...args)=>{calls.push(['post',...args]);if(fail)throw fail;return response},get:async(...args)=>{calls.push(['get',...args]);if(fail)throw fail;return response}}}})
const request={longitude:119.9,latitude:32.4},abort=new AbortController()
response={matched:false};assert.equal((await api.matchUavMedia(request,abort.signal)).matched,false);assert.deepEqual(calls.at(-1).slice(1,3),['/v1/uav/media/match',request]);assert.equal(calls.at(-1)[3].signal,abort.signal)
response={matched:true,mediaId:'9223372036854775801',fileName:'new.jpg'};await api.matchUavMedia(request)
response=new Blob([new Uint8Array([255,216,255,224,0,0])],{type:'application/octet-stream'})
const original=await api.getMatchedUavMediaImage('9223372036854775801');assert.equal(original.type,'image/jpeg');assert.equal(calls.at(-1)[1],'/v1/uav/media/file/9223372036854775801')
await api.matchUavMediaRaw(request);assert.equal(calls.at(-1)[1],'/v1/uav/media/match/raw');assert.equal(calls.at(-1)[3].responseType,'blob')
response=new Blob([JSON.stringify({code:'10222',msg:'没有匹配的图片'})],{type:'application/json'});await assert.rejects(api.matchUavMediaRaw(request),e=>e.code==='10222')
response=new Blob(['{"code":"403","msg":"无权限"}'],{type:'application/octet-stream'});await assert.rejects(api.getMatchedUavMediaImage('1'),e=>e.code==='403')
fail={response:{data:new Blob(['{"code":"10222","msg":"无图片"}'],{type:'application/json'})}};await assert.rejects(api.matchUavMediaRaw(request),e=>e.code==='10222');fail=undefined
response=new Blob(['<html>proxy failed</html>'],{type:'text/html'});await assert.rejects(api.matchUavMediaRaw(request),/不是可预览/)
assert.throws(()=>api.getMatchedUavMediaImage('https://third-party.invalid'),/无效/)
for(const invalid of [{longitude:NaN,latitude:32},{longitude:119,latitude:91},{...request,radiusMeters:0},{...request,radiusMeters:501},{...request,shootAfter:'bad'}])assert.throws(()=>api.validateUavMediaMatchRequest(invalid))
api.validateUavMediaMatchRequest({longitude:0,latitude:0,radiusMeters:500,shootAfter:'2026-11-13T08:30'})
const helper=load(readFileSync('src/utils/uav-review-photo.ts','utf8'))
const file=helper.matchedPhotoFile(original,{matched:true,mediaId:'1',fileName:'../wrong.png'});assert.equal(file.type,'image/jpeg');assert(file.name.endsWith('.jpg'));assert(!file.name.includes('/'))
assert.equal(helper.reviewPhotoContextMatches({taskId:'t',nodeId:'n',plotId:'p',editable:true},{taskId:'t',nodeId:'n',plotId:'p'}),true)
for(const change of [{taskId:'other'},{nodeId:'other'},{plotId:'other'},{editable:false}])assert.equal(helper.reviewPhotoContextMatches({taskId:'t',nodeId:'n',plotId:'p',editable:true,...change},{taskId:'t',nodeId:'n',plotId:'p'}),false)

// Execute the real panel setup: save original file, retain per-plot provenance, and never auto-submit the node.
const cleanups=[],scopes=[],events=[],uploads=[]
const oldWindow=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){},dispatchEvent(){}}
const node={id:'node',status:'PROCESSING',assigneeId:'user',nodeKey:'UAV_RECHECK',files:[]}
const backend={task:vue.ref({taskNo:'TEST'}),flow:vue.ref({currentNode:node,timeline:[node]}),selectedNode:vue.ref(undefined),abnormals:vue.ref([{id:'plot',title:'当前图斑',longitude:119.9,latitude:32.4},{id:'other',title:'另一图斑',longitude:119.8,latitude:32.3}]),loading:vue.ref(false),errors:vue.ref([]),load:async()=>{}}
let uploadFailure=false,previewGate,permission=true
const canOperate=(n,u)=>!!n&&n.status==='PROCESSING'&&n.assigneeId===u&&permission
const props=vue.reactive({taskId:'task',readonly:false})
const carries=load(readFileSync('src/utils/non-grain-carry-forward.ts','utf8'))
const deps={vue:{...vue,onMounted(){},onBeforeUnmount:fn=>cleanups.push(fn)},
  '@/stores/user':{useUserStore:()=>({currentUser:{id:'user'},name:'复核人'})},
  '@/workspace-components/shared/use-backend-task':{useBackendTaskData:()=>backend},
  '@/api/task-workflow':{getTaskWorkflow:async()=>backend.flow.value,uploadWorkflowFiles:async(id,files)=>{if(uploadFailure)throw Error('附件上传失败');uploads.push({id,files});node.files.push({id:`f${uploads.length}`,fileName:files[0].name})},submitWorkflowNode:()=>assert.fail('matching must never advance the workflow'),deleteWorkflowFile:async id=>{node.files=node.files.filter(f=>f.id!==id)}},
  '@/api/metadata':{getMetadataOptions:async()=>[]},'@/utils/task-workflow-state':{canOperateWorkflowNode:canOperate},
  '@/utils/uav-review-photo':{...helper,reviewPhotoPreview:async()=>{if(previewGate)await previewGate;return 'data:image/jpeg;base64,preview'}},
  '@/utils/non-grain-recheck':{recheckRoute(){}},'@/utils/non-grain-carry-forward':carries,
  '@/utils/inspection-files':{isInspectionImage:()=>true},'@/utils/task-imagery':{taskImageryService(){}},
  '@/utils/review-geotiff':{},'../shared/workbench-validation':{validateWorkbenchForm:()=>true},'./workspace.scss':{},
  ...Object.fromEntries(['@/workspace-components/shared/WorkbenchRequiredMark.vue','@/workspace-components/shared/PhotoBoundaryDialog.vue','@/workspace-components/shared/ImageGeoreferenceDialog.vue','@/workspace-components/shared/WorkflowAssigneePicker.vue','@/workspace-components/shared/WorkbenchFeedback.vue','@/workspace-components/spot-identification/SpotDistributionMap.vue','@/components/TaskRangeMap.vue','./UavReviewPhotoPicker.vue','./ReviewPhotoViewport.vue'].map(x=>[x,{}])),
}
const flush=async()=>{await vue.nextTick();await new Promise(r=>setImmediate(r));await vue.nextTick()}
try{
  const {descriptor}=parse(readFileSync('src/workspace-components/non-grain/NonGrainDroneReviewPanel.vue','utf8'))
  const component=load(compileScript(descriptor,{id:'uav-review-test'}).content,deps).default
  const scope=vue.effectScope();scopes.push(scope);const state=scope.run(()=>component.setup(props,{expose(){},emit:(...args)=>events.push(args)}));backend.selectedNode.value=node;await flush()
  state.openMediaMatch();assert.equal(state.pendingMatch.value.plotId,'plot')
  await state.useMatchedPhoto({file,match:{matched:true,mediaId:'1',shootTime:'2026-11-13T09:00:00',distanceMeters:7}})
  assert.equal(uploads.length,1);assert.equal(uploads[0].id,'node');assert.equal(uploads[0].files[0].size,file.size)
  assert.equal(state.active.value.matchedReview.mediaId,'1');assert.equal(state.active.value.matchedReview.shootTime,'2026-11-13T09:00:00');assert.deepEqual(state.active.value.attachment,['f1']);assert.equal(state.active.value.reviewImageId,'f1')
  assert.equal(state.draft.value[1].attachment.length,0,'evidence belongs only to the selected plot');assert.equal(events.length,0)
  state.openMediaMatch();await state.useMatchedPhoto({file,match:{matched:true,mediaId:'1'}});assert.equal(uploads.length,1,'same photo not uploaded twice for one plot')
  state.openMediaMatch();uploadFailure=true;await state.useMatchedPhoto({file,match:{matched:true,mediaId:'2'}});assert.match(state.matchError.value,/附件上传失败/);assert.equal(state.active.value.reviewImageId,'f1');uploadFailure=false
  state.toggleAttachment('f1',false);assert.equal(state.active.value.matchedReview,undefined);assert.equal(state.active.value.reviewImageId,'')
  state.openMediaMatch();let release;previewGate=new Promise(r=>release=r);const saving=state.useMatchedPhoto({file,match:{matched:true,mediaId:'3'}});props.taskId='changed';release();await saving;assert.equal(uploads.length,1,'stale task must not receive evidence');previewGate=undefined;props.taskId='task'
  await flush();state.openMediaMatch();props.readonly=true;await state.useMatchedPhoto({file,match:{matched:true,mediaId:'4'}});assert.equal(uploads.length,1,'read-only nodes cannot attach evidence');props.readonly=false
  // Saved node data is sufficient for a history preview without fetching the source media again.
  node.resultData={plotResults:[{abnormalId:'plot',reviewImageId:'f1',attachment:['f1'],matchedReview:{mediaId:'1',previewDataUrl:'data:image/jpeg;base64,saved',shootTime:'2026-11-13T09:00:00'}}]};node.status='COMPLETED';backend.selectedNode.value={...node};await flush();assert.equal(state.active.value.matchedReview.previewDataUrl,'data:image/jpeg;base64,saved');assert.equal(state.canEdit.value,false)
  console.log('UAV review media: metadata/raw contracts, binary errors, long IDs, per-plot attachment, provenance/history, stale context, read-only, upload failure and duplicate protection passed')
}finally{cleanups.forEach(fn=>fn());scopes.forEach(s=>s.stop());globalThis.window=oldWindow}
