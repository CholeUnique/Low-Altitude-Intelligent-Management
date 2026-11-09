import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['src/utils/farmland-facility-workflow.ts'], bundle: true, platform: 'node', format: 'esm', write: false, tsconfig: 'tsconfig.app.json' })
const { FACILITY_CHECK_RESULTS, FACILITY_RECHECK_RESULTS, canOperateFacilityWorkflowNode, facilityArchiveConclusion, facilityHandoff, facilityNodeKey, facilityRequiredFields, facilityWorkflow, facilitySubmission, isFacilityRepairFlow } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const node = (id, nodeKey, nodeName, status, assigneeId = '7') => ({ id, bizTaskId: '1', nodeKey, nodeName, nodeType: 'REVIEW', status, assigneeId })

assert.equal(facilityNodeKey(node('1', 'DEPT_REVIEW', '部门审核', 'PROCESSING')), 'department-review')
assert.equal(facilityNodeKey(node('1', 'REVIEW_COUNTY', '区县分局审核', 'PROCESSING')), 'department-review')
assert.equal(facilityNodeKey(node('1', 'CUSTOM_UNKNOWN', '其他未知节点', 'PROCESSING')), undefined)
assert.equal(facilityNodeKey(node('1', 'CUSTOM', '现场核查', 'PROCESSING')), 'on-site-verification')
const checkRepair = node('combined-node', 'CUSTOM_CHECK_REPAIR', '现场核查修复', 'PROCESSING')
assert.equal(facilityNodeKey(checkRepair), 'on-site-verification', 'Reported check/repair display name maps without changing the backend key')
assert.equal(facilityNodeKey({...checkRepair,nodeName:' 现场核查修复 '}), 'on-site-verification')
assert.equal(facilityNodeKey({...checkRepair,nodeName:'未知核查修复',nodeType:'IMPLEMENT'}), undefined, 'Node type alone cannot identify an unknown business stage')
assert.equal(facilityNodeKey({...checkRepair,nodeName:undefined}), undefined, 'Missing display names preserve unknown-node handling')
assert.equal(facilityNodeKey({...checkRepair,nodeKey:'RECTIFY'}), 'facility-repair', 'Known backend keys take precedence over display aliases')
const checkRepairFlow = {flowInstanceId:'combined-flow',status:'RUNNING',timeline:[{...checkRepair,id:'previous-node',status:'COMPLETED'}],currentNode:checkRepair}
assert.equal(facilityWorkflow(checkRepairFlow).find(step=>step.key==='on-site-verification').instance.id, 'combined-node')
assert.equal(facilitySubmission(checkRepair,{faultConfirmed:'属实',faultCause:'管道破裂'},{id:'7',name:'本地测试办理人'}).nodeInstId,'combined-node','Submission uses the original backend instance')
const flow = { flowInstanceId: '1', status: 'RUNNING', currentNode: node('3', 'ON_SITE_VERIFICATION', '现场核查', 'PROCESSING'), timeline: [node('1', 'TASK_ACCEPTANCE', '任务受理', 'COMPLETED'), node('2', 'DEPARTMENT_REVIEW', '部门审核', 'COMPLETED')] }
const steps = facilityWorkflow(flow)
assert.deepEqual(steps.map(step => step.name), ['任务受理', '部门审核', '现场核查', '部门复核', '结案归档'])
assert.deepEqual(steps.map(step => step.status), ['completed', 'completed', 'active', 'pending', 'pending'])
assert.deepEqual(steps.map(step => step.viewable), [true, true, true, false, false])
assert.equal(steps[2].instance?.assigneeId, '7')
assert.equal(canOperateFacilityWorkflowNode(flow.currentNode,flow,'7',0),true)
assert.equal(canOperateFacilityWorkflowNode(flow.timeline[1],flow,'7',0),false,'已完成历史节点只能查看')
assert.equal(canOperateFacilityWorkflowNode(flow.currentNode,{...flow,status:'FINISHED'},'7',0),false,'已结束流程即使保留旧当前节点也不可修改')
assert.equal(canOperateFacilityWorkflowNode(flow.currentNode,flow,'7',5),false,'已完成任务禁止办理')
assert.equal(canOperateFacilityWorkflowNode(flow.currentNode,flow,'other',0),false,'不能修改其他人的当前节点')
assert.equal(facilityWorkflow()[0].viewable, false)
const target={id:'7',deptId:'1',name:'测试办理人'}
for(const [backend,form,expected] of [
  ['REVIEW_COUNTY',{reviewOpinion:'同意派单'},'FORWARD'],
  ['IMPLEMENT',{faultConfirmed:'属实',faultCause:'管道接口破裂'},'PROBLEM'],
  ['IMPLEMENT',{faultConfirmed:'不属实',faultCause:'现场运行正常'},'NO_PROBLEM'],
  ['RECTIFY',{repairAction:'更换接口',testResult:'通水无渗漏'},'DONE'],
  ['UAV_RECHECK',{repairResult:'通过',recheckOpinion:'维修合格'},'NO_PROBLEM'],
  ['UAV_RECHECK',{repairResult:'退回重修',recheckOpinion:'仍有渗漏'},'PROBLEM'],
]){
  const input=facilitySubmission(node('real-instance',backend,'真实节点','PROCESSING'),form,target)
  assert.equal(input.nodeInstId,'real-instance');assert.equal(input.resultData.result,expected)
  assert.equal(input.targetAssigneeId,'7');assert.equal(input.targetDeptId,'1')
  assert(!('plotResults' in input.resultData),'Facility submissions must not invent non-grain plots')
}
assert.throws(()=>facilitySubmission(node('1','REVIEW_COUNTY','','PROCESSING'),{reviewOpinion:'同意'}),/办理人/)
assert.throws(()=>facilitySubmission(node('1','IMPLEMENT','','PROCESSING'),{faultConfirmed:'需补充核查'},target),/明确/)
const archive=facilitySubmission(node('1','FINISH','','PROCESSING'),{closureConclusion:'完成检修',closureSummary:'已恢复运行'})
assert.equal(archive.targetAssigneeId,undefined);assert.equal(archive.resultData.closureConclusion,'完成检修')
const realFlow={status:'RUNNING',flowInstanceId:'f',timeline:[node('1','REVIEW_COUNTY','区县分局审核','COMPLETED'),node('2','IMPLEMENT','现场核查','COMPLETED')],currentNode:node('3','RECTIFY','整改处置','PROCESSING')}
assert.equal(facilityWorkflow(realFlow).length,6,'Only a real repair node adds the repair stage')
assert.equal(facilityWorkflow(realFlow).find(step=>step.key==='facility-repair').instance.id,'3')

// Confirmed FACILITY_REPAIR_FLOW contract: merged check/repair, review, automatic finish.
const fieldCheck={...node('field-check','FIELD_CHECK','现场核查修复','PROCESSING'),nodeType:'IMPLEMENT',files:[{id:'evidence-1',fileName:'现场核查.jpg'}]}
const recheck={...node('recheck','RECHECK_AUDIT','区县分局复核','PROCESSING'),nodeType:'REVIEW'}
const finish={...node('finish','FINISH_FACILITY','结束','COMPLETED'),nodeType:'FINISH',assigneeId:undefined}
const preset={flowInstanceId:'facility-flow',flowKey:'FACILITY_REPAIR_FLOW',status:'RUNNING',timeline:[],currentNode:fieldCheck}
assert(isFacilityRepairFlow(preset))
assert(isFacilityRepairFlow({...preset,flowKey:undefined}))
assert.equal(facilityNodeKey({...fieldCheck,nodeName:'不依赖显示名称'}),'on-site-verification')
assert.equal(facilityNodeKey({...recheck,nodeName:'不依赖显示名称'}),'department-recheck')
assert.equal(facilityNodeKey(finish),'case-archive')
assert.equal(facilityWorkflow(preset).length,5,'The merged preset never invents a separate repair stage')
assert.equal(facilityWorkflow(preset)[2].name,'现场核查修复')
const detailed=facilityWorkflow({...preset,timeline:[{...fieldCheck,resultData:{result:'NO_PROBLEM',faultCause:'现场正常'}}],currentNode:{...fieldCheck,files:[],resultData:undefined}}).find(step=>step.key==='on-site-verification').instance
assert.equal(detailed.files.length,1,'A current-node summary must preserve evidence from the detailed timeline entry')
assert.equal(detailed.resultData.result,'NO_PROBLEM')
assert.doesNotThrow(()=>facilitySubmission(detailed,{result:'NO_PROBLEM',faultCause:'现场正常'},target,undefined,preset))
assert.throws(()=>facilitySubmission(node('unexpected-repair','RECTIFY','维修','PROCESSING'),{repairAction:'措施',testResult:'正常'},target,undefined,preset),/不存在独立维修/)
assert.deepEqual(FACILITY_CHECK_RESULTS.map(option=>option.value),['REPAIRED','NO_PROBLEM','APPLY_DISCARD'])
assert.deepEqual(FACILITY_RECHECK_RESULTS.map(option=>option.value),['NO_PROBLEM','REPAIRED','APPLY_DISCARD','NOT_PASS'])
const mergedDraft={faultCause:'现场核查完成',repairAction:'更换接口',testResult:'通水无渗漏',materials:'密封圈',discardReason:'设施损坏且无法修复'}
for(const result of ['REPAIRED','NO_PROBLEM','APPLY_DISCARD']){
  const draft={...mergedDraft,result}
  const input=facilitySubmission(fieldCheck,draft,target,undefined,preset)
  assert.equal(input.nodeInstId,fieldCheck.id)
  assert.equal(input.resultData.result,result)
  assert.equal(input.targetAssigneeId,target.id)
  assert.equal(facilityHandoff(fieldCheck,draft,preset).label,'区县分局复核办理人','All check outcomes go to review, never another repair/archive recipient')
  if(result!=='REPAIRED')assert(!('repairAction' in input.resultData)&&!('testResult' in input.resultData))
  if(result!=='APPLY_DISCARD')assert(!('discardReason' in input.resultData))
}
for(const result of ['PROBLEM','DONE','PASS']){
  assert.throws(()=>facilitySubmission(fieldCheck,{...mergedDraft,result},target,undefined,preset),/核查处置结论/)
  assert.throws(()=>facilitySubmission(recheck,{result,recheckOpinion:'复核意见'},target,undefined,preset),/复核结论/)
}
assert.throws(()=>facilitySubmission(fieldCheck,{...mergedDraft,faultConfirmed:'属实'},target,undefined,preset),/核查处置结论/,'Never infer repair completion from the legacy fault confirmation')
assert.throws(()=>facilitySubmission(fieldCheck,{result:'REPAIRED',faultCause:'故障属实'},target,undefined,preset),/完成维修/)
assert.throws(()=>facilitySubmission(fieldCheck,{result:'APPLY_DISCARD',faultCause:'设施损坏'},target,undefined,preset),/废弃原因/)
assert.throws(()=>facilitySubmission({...fieldCheck,files:[]},{result:'NO_PROBLEM',faultCause:'现场正常'},target,undefined,preset),/证据材料/)
assert(facilityRequiredFields(fieldCheck,{result:'REPAIRED'},preset).includes('testResult'))
assert(facilityRequiredFields(fieldCheck,{result:'APPLY_DISCARD'},preset).includes('discardReason'))
assert.deepEqual(facilityRequiredFields(recheck,{},preset),['result','recheckOpinion'])
for(const result of ['NO_PROBLEM','REPAIRED','APPLY_DISCARD','NOT_PASS']){
  const input=facilitySubmission(recheck,{result,recheckOpinion:'复核意见',targetAssigneeId:'stale-user',targetAssigneeName:'旧办理人',targetDeptId:'stale-dept',deadline:'old-date'},target,'2099-01-01T12:00:00',preset)
  assert.equal(input.resultData.result,result)
  assert.equal(facilityHandoff(recheck,{result},preset).required,false)
  for(const field of ['targetAssigneeId','targetDeptId','deadline'])assert(!(field in input),`${result}: auto routing must omit ${field}`)
  for(const field of ['targetAssigneeId','targetAssigneeName','targetDeptId','deadline'])assert(!(field in input.resultData))
  assert.doesNotThrow(()=>facilitySubmission(recheck,{result,recheckOpinion:'已复核'},undefined,undefined,preset))
}
assert.throws(()=>facilitySubmission(finish,{},undefined,undefined,preset),/自动结束/)
const rework={...fieldCheck,id:'field-check-rework',assigneeId:'original-inspector'}
const reworkSteps=facilityWorkflow({...preset,timeline:[{...fieldCheck,status:'COMPLETED'},{...recheck,status:'COMPLETED',resultData:{result:'NOT_PASS'}}],currentNode:rework})
assert.equal(reworkSteps.find(step=>step.key==='on-site-verification').instance.id,'field-check-rework')
assert.equal(reworkSteps.find(step=>step.key==='on-site-verification').instance.assigneeId,'original-inspector')
const emptyRework=facilityWorkflow({...preset,timeline:[{...fieldCheck,status:'COMPLETED'}],currentNode:{...rework,files:[]}}).find(step=>step.key==='on-site-verification').instance
assert.equal(emptyRework.files.length,0,'A new rework instance cannot inherit evidence from a different node instance')
const approved={...recheck,status:'COMPLETED',resultData:{result:'REPAIRED'}}
const final={...finish,prevNodeInstId:recheck.id}
assert.equal(facilityArchiveConclusion(final,{...preset,timeline:[approved,final]}),'REPAIRED','Automatic finish without a form shows its actual predecessor review conclusion')
assert.equal(facilityArchiveConclusion({...final,resultData:{result:'APPLY_DISCARD'}},{...preset,timeline:[approved,final]}),'APPLY_DISCARD','A conclusion stored on the finish node takes precedence')
assert.equal(facilityArchiveConclusion({...final,prevNodeInstId:undefined},{...preset,timeline:[approved,final]}),'REPAIRED','Ordered timeline is used when the engine omits predecessor IDs')
assert.equal(facilityArchiveConclusion({...final,prevNodeInstId:'missing'},{...preset,timeline:[approved,final]}),undefined,'An explicit broken link must not select an unrelated successful review')
assert.equal(facilityArchiveConclusion({...final,prevNodeInstId:undefined},{...preset,timeline:[approved,{...approved,id:'rejected',resultData:{result:'NOT_PASS'}},final]}),undefined,'Never skip a later rejection and reuse an old approval')
assert.equal(facilityArchiveConclusion(final,{...preset,timeline:[{...approved,status:'PROCESSING'},final]}),undefined,'An unfinished review cannot supply a final conclusion')
console.log('farmland-facility-workflow: ok')
