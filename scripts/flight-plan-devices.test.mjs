import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const calls = []
const client = { post: async (path, payload) => {
  calls.push({ path, payload })
  if (path.endsWith('/devices')) return payload.planIds.map(planId => ({ planId, devices: [{ droneSn: 'drone-1', droneName: 'M4D', gatewaySn: 'dock-1' }] }))
  if (path.endsWith('/flight-plan/page')) return { records: [{ id: '212039846837891900' }], total: 1, pageSize: 200 }
  return { records: [], total: 42, pageSize: 1 }
} }
const source = ts.transpileModule(readFileSync('src/api/flight-review.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', source)(name => { assert.equal(name, './client'); return { apiClient: client } }, module, module.exports)
const ids = Array.from({ length: 201 }, (_, index) => `2120398468378919${String(index).padStart(2, '0')}`)
const result = await module.exports.getFlightPlanDevices(ids, 'dept')
assert.deepEqual(calls.map(call => call.payload.planIds.length), [200, 1])
assert.equal(calls[0].payload.planIds[0], ids[0], 'Long IDs remain exact strings')
assert.equal(result[ids[200]][0].droneName, 'M4D')
assert.equal(result[ids[200]][0].gatewaySn, 'dock-1')
assert.equal(await module.exports.getFlightReviewPlanMediaTotal(ids[0], 'dept'), 42)
assert.deepEqual(calls[2].payload, { planId: ids[0], pageNum: 1, pageSize: 1, deptId: 'dept' })
const planPage = await module.exports.getFlightReviewPlans('dept', 1)
assert.equal(calls[3].path, '/v1/uav/flight-plan/page')
assert.equal(planPage.records[0].id, '212039846837891900')
console.log('Plan device batching and plan media totals passed')
