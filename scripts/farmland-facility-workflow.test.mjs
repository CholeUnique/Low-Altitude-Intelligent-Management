import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['src/utils/farmland-facility-workflow.ts'], bundle: true, platform: 'node', format: 'esm', write: false, tsconfig: 'tsconfig.app.json' })
const { facilityNodeKey, facilityWorkflow } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const node = (id, nodeKey, nodeName, status, assigneeId = '7') => ({ id, bizTaskId: '1', nodeKey, nodeName, nodeType: 'REVIEW', status, assigneeId })

assert.equal(facilityNodeKey(node('1', 'DEPT_REVIEW', '部门审核', 'PROCESSING')), 'department-review')
assert.equal(facilityNodeKey(node('1', 'REVIEW_OWNER', '场景负责人审核', 'PROCESSING')), undefined)
assert.equal(facilityNodeKey(node('1', 'CUSTOM', '现场核查', 'PROCESSING')), 'on-site-verification')
const flow = { flowInstanceId: '1', status: 'RUNNING', currentNode: node('3', 'ON_SITE_VERIFICATION', '现场核查', 'PROCESSING'), timeline: [node('1', 'TASK_ACCEPTANCE', '任务受理', 'COMPLETED'), node('2', 'DEPARTMENT_REVIEW', '部门审核', 'COMPLETED')] }
const steps = facilityWorkflow(flow)
assert.deepEqual(steps.map(step => step.name), ['任务受理', '部门审核', '现场核查', '部门复核', '结案归档'])
assert.deepEqual(steps.map(step => step.status), ['completed', 'completed', 'active', 'pending', 'pending'])
assert.deepEqual(steps.map(step => step.viewable), [true, true, true, false, false])
assert.equal(steps[2].instance?.assigneeId, '7')
assert.equal(facilityWorkflow()[0].viewable, false)
console.log('farmland-facility-workflow: ok')
