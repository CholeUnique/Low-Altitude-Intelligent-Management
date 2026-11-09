import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { build } from 'esbuild'

function evaluate(source, dependencies) {
  const module={exports:{}}
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  new Function('require','module','exports',code)(name=>{
    assert(name in dependencies,`Unexpected dependency: ${name}`)
    return dependencies[name]
  },module,module.exports)
  return module.exports
}
const load=(file,deps={})=>evaluate(readFileSync(file,'utf8'),deps)
const bundle=await build({entryPoints:['src/utils/farmland-facility-workflow.ts'],bundle:true,platform:'node',format:'esm',write:false,tsconfig:'tsconfig.app.json'})
const workflow=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const context=load('src/workspace-components/farmland-facilities/use-facility-context.ts',{vue,'@/utils/facility-task':load('src/utils/facility-task.ts')})
const emptyGeometry={type:'FeatureCollection',features:[]}
const facility={id:1419,name:'test2',bizStatus:'CHECKING',geometryJson:JSON.stringify({type:'Point',coordinates:[119.9,32.4]})}
const task={id:'2162',sceneCode:'HIGH_STANDARD_FARMLAND_FACILITY',deptId:'1',facilityId:'1419',name:'本地流程联调',refType:'NONE'}
const field={id:'field',bizTaskId:task.id,nodeKey:'FIELD_CHECK',nodeName:'现场核查修复',nodeType:'IMPLEMENT',status:'PROCESSING',assigneeId:'7',files:[{id:'proof',fileName:'核查证据.jpg'}]}
const review={...field,id:'review',nodeKey:'RECHECK_AUDIT',nodeName:'区县分局复核',nodeType:'REVIEW'}
const finish={...field,id:'finish',nodeKey:'FINISH_FACILITY',nodeName:'结束',nodeType:'FINISH',status:'COMPLETED',assigneeId:undefined}
let backend={flowInstanceId:'flow',flowKey:'FACILITY_REPAIR_FLOW',status:'RUNNING',timeline:[field],currentNode:{...field,files:[]}}
let linkedFacility=facility
let serial=0, failRefresh=false, submittedBeforeRefresh=false
const user=vue.reactive({currentUser:{id:'7'},activeDeptId:'1'})
const submitted=[],cleanup=[]
const route=vue.reactive({query:{}})
globalThis.window={dispatchEvent(){}}
const {descriptor}=parse(readFileSync('src/workspace-components/farmland-facilities/FarmlandFacilitiesWorkspace.vue','utf8'))
const component=evaluate(compileScript(descriptor,{id:'facility-form-test'}).content,{
  vue:{...vue,onBeforeUnmount:callback=>cleanup.push(callback)},
  'vue-router':{useRoute:()=>route,useRouter:()=>({replace:async({query})=>{route.query=query},push(){}})},
  '@/stores/user':{useUserStore:()=>user},
  '@/api/governance-task':{getGovernanceTaskDetail:async()=>({task,facilityId:'1419',facility:linkedFacility,reportImages:[]}),getGovernanceTaskGeometry:async()=>emptyGeometry,getGovernanceTaskOperateLogs:async()=>[],taskPriorityLabel:()=>''},
  '@/api/governance-result':{getTaskEvidenceImages:async()=>[]},
  '@/api/task-workflow':{getTaskWorkflow:async()=>{
    if(failRefresh&&submittedBeforeRefresh)throw new Error('流程刷新暂时失败')
    return backend
  },submitWorkflowNode:async input=>{
    const active=backend.currentNode
    assert.equal(input.nodeInstId,active.id,'Submission must use the active backend instance')
    assert.equal(user.currentUser.id,active.assigneeId,'Only the actual current actor can submit')
    submitted.push(input)
    submittedBeforeRefresh=true
    const completed={...active,status:'COMPLETED',resultData:input.resultData}
    const timeline=[...backend.timeline.filter(node=>node.id!==active.id),completed]
    if(active.nodeKey==='FIELD_CHECK'){
      assert(['REPAIRED','NO_PROBLEM','APPLY_DISCARD'].includes(input.resultData.result))
      assert(input.targetAssigneeId)
      backend={...backend,timeline,currentNode:{...review,id:`review-${++serial}`,prevNodeInstId:active.id,assigneeId:input.targetAssigneeId,files:[]}}
    }else{
      assert.equal(active.nodeKey,'RECHECK_AUDIT')
      assert(!('targetAssigneeId'in input))
      if(input.resultData.result==='NOT_PASS'){
        const inspector=[...timeline].reverse().find(node=>node.nodeKey==='FIELD_CHECK').assigneeId
        backend={...backend,timeline,currentNode:{...field,id:`field-rework-${++serial}`,prevNodeInstId:active.id,assigneeId:inspector,files:[],resultData:undefined}}
      }else{
        assert(['REPAIRED','NO_PROBLEM','APPLY_DISCARD'].includes(input.resultData.result))
        const final={...finish,id:`finish-${++serial}`,prevNodeInstId:active.id}
        backend={...backend,status:'FINISHED',timeline:[...timeline,final],currentNode:undefined}
        linkedFacility={...facility,bizStatus:input.resultData.result==='APPLY_DISCARD'?'DISCARDED':'NORMAL'}
      }
    }
  }},
  '@/api/my-workflow-tasks':{getMyWorkflowTasks:async()=>({records:[],warnings:[]})},
  '@/utils/task-todo-state':load('src/utils/task-todo-state.ts'),
  '@/utils/task-workflow-state':{canOperateWorkflowNode:(node,id)=>node?.status==='PROCESSING'&&node.assigneeId===id,isNodeMine:(node,id)=>node?.assigneeId===id},
  '@/utils/farmland-facility-workflow':workflow,
  '@/utils/inspection-files':load('src/utils/inspection-files.ts'),
  './use-facility-context':context,
  ...Object.fromEntries(['@/workspace-components/shared/WorkbenchTaskNotice.vue','@/components/WorkflowActorBadge.vue','./FacilityGeometryMap.vue','@/components/FacilityReportImageGallery.vue','@/workspace-components/shared/WorkflowAssigneePicker.vue','@/workspace-components/shared/WorkbenchRequiredMark.vue'].map(name=>[name,{default:{}}])),
}).default
const scope=vue.effectScope()
const state=scope.run(()=>component.setup({taskId:task.id},{expose(){}}))
const flush=async()=>{await vue.nextTick();await new Promise(resolve=>setImmediate(resolve));await vue.nextTick()}
try{
  await flush()
  assert.equal(state.selectedKey.value,'on-site-verification')
  assert.equal(state.mergedFlow.value,true)
  assert.equal(state.canEdit.value,true)
  assert.equal(state.nodeFiles.value.length,1,'The form uses timeline evidence when currentNode contains only summary fields')
  const conclusions=state.visibleFields.value.find(field=>field.key==='result')
  assert.deepEqual(conclusions.options.map(option=>option.value),['REPAIRED','NO_PROBLEM','APPLY_DISCARD'])
  assert(!state.visibleFields.value.some(field=>field.key==='faultConfirmed'))
  state.draft.value.result='APPLY_DISCARD'
  await flush()
  assert(state.visibleFields.value.some(field=>field.key==='discardReason'))
  assert(!state.visibleFields.value.some(field=>field.key==='testResult'))
  state.draft.value={result:'REPAIRED',faultCause:'接口渗漏',repairAction:'更换密封圈',testResult:'通水正常'}
  await flush()
  assert(state.visibleFields.value.some(field=>field.key==='testResult'))
  assert.equal(state.requiredField('testResult'),true)
  assert.equal(state.recipientLabel.value,'区县分局复核办理人')
  state.recipient.value={id:'8',deptId:'1',username:'reviewer'}
  await state.submit()
  await flush()
  assert.equal(state.submitError.value,'')
  assert.equal(state.selectedKey.value,'department-recheck')
  assert.equal(state.canEdit.value,false,'The inspector cannot edit the node assigned to another reviewer')
  user.currentUser.id='8'
  await flush()
  assert.equal(state.canEdit.value,true)
  assert.equal(state.handoff.value.required,false)
  assert.deepEqual(state.visibleFields.value.find(field=>field.key==='result').options.map(option=>option.value),['NO_PROBLEM','REPAIRED','APPLY_DISCARD','NOT_PASS'])
  state.draft.value={result:'NOT_PASS',recheckOpinion:'补充现场核查材料'}
  await flush()
  assert.equal(state.handoff.value.required,false)
  assert.match(state.handoff.value.label,/原现场核查办理人/)
  state.draft.value={result:'REPAIRED',recheckOpinion:'现场复核通过'}
  await state.submit()
  await flush()
  assert.equal(state.submitError.value,'')
  assert.equal(state.selectedKey.value,'case-archive')
  assert.equal(state.canEdit.value,false)
  assert.equal(state.resultData.value.result,'REPAIRED','Automatic archive recovers the linked review conclusion, without inventing a finish-node form')
  assert.equal(state.facility.value.bizStatus,'NORMAL','Dossier refresh uses the status returned by the server')
  assert.equal(submitted.length,2)
  assert.equal(submitted[0].targetAssigneeId,'8')
  assert(!('targetAssigneeId'in submitted[1]))
  assert(!submitted.some(input=>['PROBLEM','DONE','PASS'].includes(input.resultData.result)))

  async function reset(){
    backend={flowInstanceId:`flow-${++serial}`,flowKey:'FACILITY_REPAIR_FLOW',status:'RUNNING',timeline:[field],currentNode:{...field,files:[]}}
    linkedFacility=facility;user.currentUser.id='7';route.query={};failRefresh=false;submittedBeforeRefresh=false
    await state.load();await flush()
  }
  async function submitField(result){
    state.draft.value={result,faultCause:'已现场核查',repairAction:'更换密封圈',testResult:'通水正常',discardReason:'损坏严重且无法修复'}
    state.recipient.value={id:'8',deptId:'1',username:'reviewer'}
    await state.submit();await flush()
    assert.equal(state.submitError.value,'')
    assert.equal(state.selectedKey.value,'department-recheck')
    assert.equal(state.canEdit.value,false)
    user.currentUser.id='8';await flush()
    assert.equal(state.canEdit.value,true)
  }
  async function submitReview(result){
    state.draft.value={result,recheckOpinion:'已核对现场及材料'}
    await state.submit();await flush()
    assert.equal(state.submitError.value,'')
  }

  await reset()
  await submitField('NO_PROBLEM')
  await submitReview('NO_PROBLEM')
  assert.equal(state.resultData.value.result,'NO_PROBLEM')
  assert.equal(state.facility.value.bizStatus,'NORMAL')

  await reset()
  await submitField('APPLY_DISCARD')
  await submitReview('NOT_PASS')
  assert.equal(state.selectedKey.value,'on-site-verification')
  assert.equal(state.node.value.assigneeId,'7')
  assert.equal(state.canEdit.value,false,'The reviewer cannot edit the returned inspector node')
  assert.equal(state.facility.value.bizStatus,'CHECKING','Rejecting review must not update the facility status')
  user.currentUser.id='7';await flush()
  assert.equal(state.canEdit.value,true)
  assert.equal(state.draft.value.result,'','A new return instance must require a new conclusion')
  assert.equal(state.nodeFiles.value.length,0,'The new instance cannot reuse old evidence implicitly')
  await submitField('APPLY_DISCARD')
  await submitReview('APPLY_DISCARD')
  assert.equal(state.selectedKey.value,'case-archive')
  assert.equal(state.resultData.value.result,'APPLY_DISCARD')
  assert.equal(state.facility.value.bizStatus,'DISCARDED')
  assert.equal(state.canEdit.value,false)

  // The submit is committed, but its follow-up read fails. Do not invent a finished flow.
  await reset()
  await submitField('REPAIRED')
  submittedBeforeRefresh=false;failRefresh=true
  await submitReview('REPAIRED')
  assert.match(state.error.value,/流程刷新暂时失败/)
  assert.equal(route.query.node,'department-recheck','A failed follow-up read cannot route to archive')
  assert.equal(state.flow.value,undefined)
  assert.equal(state.canEdit.value,false)
  assert.match(state.message.value,/节点已提交.*读取失败/)
  const count=submitted.length
  failRefresh=false
  await state.load();await flush()
  state.selectStep('case-archive');await flush()
  assert.equal(state.resultData.value.result,'REPAIRED')
  assert.equal(submitted.length,count,'Retrying data load must not resubmit a business node')
  console.log('facility workbench form: all conclusions, actor handoffs, return/rework, automatic archive and post-submit refresh failures passed')
}finally{for(const callback of cleanup)callback();scope.stop()}
