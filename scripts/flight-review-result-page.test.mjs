import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const calls = []
const payload = { records: [{ id: '212039846837891912', name: '计划', mediaFileCount: 1133, resultCount: 0, finishTime: '2026-11-11T15:08:00' }], total: 18, pageNum: 1, pageSize: 16 }
const apiClient = { post: async (path, body) => { calls.push({ path, body }); return payload } }
const module = { exports: {} }
const source = readFileSync('src/api/flight-review.ts', 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
new Function('require', 'module', 'exports', code)(name => {
  assert.equal(name, './client')
  return { apiClient }
}, module, module.exports)
const query = { deptId: '7', pageNum: 1, pageSize: 16, droneSn: 'drone', mediaType: 'photo' }
const result = await module.exports.getFlightReviewResultPage(query)
assert.deepEqual(calls, [{ path: '/v1/uav/flight-plan/result/page', body: query }])
assert.equal(result.total, 18)
assert.equal(result.records[0].id, '212039846837891912')
assert.equal(result.records[0].mediaFileCount, 1133)
assert.equal(result.records[0].resultCount, 0)
assert.equal(result.records[0].finishTime, '2026-11-11T15:08:00')
delete payload.records[0].mediaFileCount
await assert.rejects(() => module.exports.getFlightReviewResultPage(query), /素材文件数量/)
console.log('Flight review result pagination checks passed')
