import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const code = readFileSync('src/api/map-service.ts', 'utf8')
const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const calls = []
const records = [
  { id: 1, topicCode: null, status: 1, serviceUrl: 'https://example.test/1', deptIds: [] },
  { id: 2, topicCode: 'A', status: 1, serviceUrl: 'https://example.test/2', deptIds: ['7'] },
  { id: 3, topicCode: 'B', status: 1, serviceUrl: 'https://example.test/3', deptIds: [] },
  { id: 4, topicCode: '', status: 1, serviceUrl: 'https://example.test/4', deptIds: ['8'] },
  { id: 5, topicCode: '', status: 0, serviceUrl: 'https://example.test/5' },
]
const module = { exports: {} }
new Function('require', 'module', 'exports', js)(() => ({ isMockMode: () => false, apiClient: { post: async (path, query) => { calls.push({ path, query }); return records } } }), module, module.exports)
const result = await module.exports.listEnabledMapServices('7', 'A')
assert.deepEqual(result.map(item => item.id), [1, 2])
assert.deepEqual(calls[0].query, { deptId: '7', status: 1 })
assert.deepEqual((await module.exports.listEnabledMapServices('7', 'B')).map(item => item.id), [1, 3])
const analysis = await module.exports.listAnalysisMapServices('7', 'A')
assert.deepEqual(calls.at(-1).query, { deptId: '7' }, '智能研判请求全部状态')
assert.deepEqual(analysis.map(item => item.id), [1, 2, 5], '智能研判包含停用的部门通用服务并保留专题及部门过滤')
console.log('map-service-topic-filter: common and matching topic, department and status passed')
