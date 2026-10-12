import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
function load(path, dependencies = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', code)(id => dependencies[id], module, module.exports)
  return module.exports
}
const state = load('src/utils/task-workflow-state.ts', { '../workspace/config/non-grain-workflow': load('src/workspace/config/non-grain-workflow.ts') })
const helpers = load('src/utils/default-workflow.ts', { './task-workflow-state': state })
const node = (nodeKey, status, id) => ({ nodeKey, status, id })
const owner = node('REVIEW_OWNER', 'COMPLETED', '1')
const inspect = node('RECTIFY_DEFAULT', 'PROCESSING', '2')
const flow = { timeline: [owner, inspect], currentNode: inspect }
assert.equal(helpers.isDefaultWorkflow(flow), true)
assert.equal(helpers.isDefaultWorkflow({ timeline: [node('REVIEW_CITY', 'PROCESSING', '3')] }), false, 'Scene-specific workflow is preserved')
assert.equal(helpers.isDefaultWorkflow(undefined), true)
assert.equal(helpers.isDefaultWorkflow({ ...flow, flowKey: 'NON_GRAIN_MONITOR' }), false, 'Explicit custom workflow key takes precedence')
const steps = helpers.defaultWorkflow(flow)
assert.deepEqual(steps.map(step => step.name), ['业务受理', '现场核查', '结案归档'])
assert.deepEqual(steps.map(step => step.viewable), [true, true, false])
assert.equal(steps[1].instance.id, '2')
assert.deepEqual(helpers.defaultSubmitResult('REVIEW_OWNER', ''), { result: 'FORWARD' })
assert.deepEqual(helpers.defaultSubmitResult('RECTIFY_DEFAULT', 'PROBLEM'), { result: 'DONE', assessment: 'PROBLEM' }, 'Business outcome does not override backend route')
assert.deepEqual(helpers.defaultSubmitResult('FINISH_DEFAULT', 'NO_PROBLEM'), { assessment: 'NO_PROBLEM' }, 'Final node does not invent a route')
assert.throws(() => helpers.defaultSubmitResult('UNKNOWN', 'PROBLEM'))
console.log('PASS: default workflow projection, specialized flow preservation, readonly steps and real submit routes')
