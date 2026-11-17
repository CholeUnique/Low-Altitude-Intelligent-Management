import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const calls = []
const services = [
  { id: '1', status: 1, serviceUrl: '/a', topicCode: 'HIGH_STANDARD_FARMLAND', deptIds: ['dept-a'] },
  { id: '2', status: 1, serviceUrl: '/b', topicCode: 'HIGH_STANDARD_FACILITIES' },
  { id: '3', status: 1, serviceUrl: '/c', topicCode: null },
  { id: '4', status: 0, serviceUrl: '/d', topicCode: 'HIGH_STANDARD_FARMLAND' },
  { id: '5', status: 1, serviceUrl: '/e', topicCode: 'HIGH_STANDARD_FARMLAND', deptIds: ['dept-b'] },
]
const client = { post: async (path, body) => { calls.push({ path, body }); return services } }
const source = ts.transpileModule(readFileSync('src/api/map-service.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', source)(name => { assert.equal(name, './client'); return { apiClient: client, isMockMode: () => false } }, module, module.exports)
const result = await module.exports.listEnabledMapServices('dept-a', 'HIGH_STANDARD_FARMLAND')
assert.deepEqual(calls[0].body, { deptId: 'dept-a', status: 1, topicCode: 'HIGH_STANDARD_FARMLAND' })
assert.deepEqual(result.map(item => item.id), ['1'], 'Only the matching enabled topic and department may appear')
const unscoped = await module.exports.listEnabledMapServices('dept-a')
assert.deepEqual(unscoped.map(item => item.id), ['1', '2', '3'], 'Other pages retain their department-wide behavior')
console.log('Map topic query, enabled and department filtering passed')
