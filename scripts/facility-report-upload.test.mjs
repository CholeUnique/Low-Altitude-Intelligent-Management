import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

let request
const client = { post: async (...args) => { request = args; return { imageCount: 2 } } }
const source = readFileSync('src/api/facility.ts', 'utf8').replaceAll('import.meta.env.VITE_FACILITY_REPORT_URL', 'undefined')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled)(name => {
  assert.equal(name, './client')
  return { apiClient: client }
}, module, module.exports)
const images = [new File(['one'], 'one.jpg', { type: 'image/jpeg' }), new File(['two'], 'two.png', { type: 'image/png' })]
await module.exports.reportFacilityIssue({ facilityId: '2098236393237049344', reportContent: '问题', ts: 123, sign: 'signature', files: images })
assert.equal(request[0], '/v1/biz/facility/report')
assert(request[1] instanceof FormData)
assert.equal(request[1].get('facilityId'), '2098236393237049344')
assert.equal(request[1].get('ts'), '123')
assert.equal(request[1].get('sign'), 'signature')
assert.deepEqual(request[1].getAll('files').map(file => file.name), ['one.jpg', 'two.png'])
await module.exports.reportFacilityIssue({ facilityId: '1', reportContent: '无图片' })
assert.equal(request[1].getAll('files').length, 0)
assert.equal(request[1].has('sign'), false)
console.log('Facility report multipart: anonymous signature, multiple images and no-image submission passed')
