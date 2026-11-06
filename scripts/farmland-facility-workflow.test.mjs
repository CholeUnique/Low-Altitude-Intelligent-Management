import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['src/utils/farmland-facility-workflow.ts'], bundle: true, platform: 'node', format: 'esm', write: false, tsconfig: 'tsconfig.app.json' })
const { facilityNodeKey, facilityWorkflow, facilitySubmission } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const node = (id, nodeKey, nodeName, status, assigneeId = '7') => ({ id, bizTaskId: '1', nodeKey, nodeName, nodeType: 'REVIEW', status, assigneeId })

assert.equal(facilityNodeKey(node('1', 'DEPT_REVIEW', '部门审核', 'PROCESSING')), 'department-review')
assert.equal(facilityNodeKey(node('1', 'REVIEW_COUNTY', '区县分局审核', 'PROCESSING')), 'department-review')
assert.equal(facilityNodeKey(node('1', 'CUSTOM_UNKNOWN', '其他未知节点', 'PROCESSING')), undefined)
assert.equal(facilityNodeKey(node('1', 'CUSTOM', '现场核查', 'PROCESSING')), 'on-site-verification')
const flow = { flowInstanceId: '1', status: 'RUNNING', currentNode: node('3', 'ON_SITE_VERIFICATION', '现场核查', 'PROCESSING'), timeline: [node('1', 'TASK_ACCEPTANCE', '任务受理', 'COMPLETED'), node('2', 'DEPARTMENT_REVIEW', '部门审核', 'COMPLETED')] }
const steps = facilityWorkflow(flow)
assert.deepEqual(steps.map(step => step.name), ['任务受理', '部门审核', '现场核查', '部门复核', '结案归档'])
assert.deepEqual(steps.map(step => step.status), ['completed', 'completed', 'active', 'pending', 'pending'])
assert.deepEqual(steps.map(step => step.viewable), [true, true, true, false, false])
assert.equal(steps[2].instance?.assigneeId, '7')
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
console.log('farmland-facility-workflow: ok')
