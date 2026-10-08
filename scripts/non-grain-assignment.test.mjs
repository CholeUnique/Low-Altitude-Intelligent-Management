import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const calls = []
let users = [{ id: 9, username: 'other-admin', role: 'ADMIN', status: 1 }, { id: 1, username: 'admin', role: 'ADMIN', status: 1 }]
let node = { id: 'n', nodeKey: 'section-preliminary-review', nodeName: '科室初核', status: 'PROCESSING', assigneeId: '1' }
class ApiBusinessError extends Error { constructor(code) { super(code); this.code = code } }
let duplicate = false
const dependencies = {
  './account-management': {
    getUserPage: async query => { calls.push(['users', query]); return { records: users, total: users.length, pageSize: 200 } },
    getUserDetail: async () => ({ deptList: [{ deptId: 1 }] }),
  },
  './client': { ApiBusinessError, apiClient: { post: async (path, input) => {
    calls.push([path, input])
    if (path.endsWith('/start') && duplicate) throw new ApiBusinessError('10508')
    if (path.endsWith('/reassign')) node = { ...node, assigneeId: input.targetUserId }
  } } },
  './task-workflow': { getTaskWorkflow: async () => ({ currentNode: node }) },
  '@/utils/task-workflow-state': { nonGrainNodeKey: value => value.nodeKey },
}
globalThis.window = { dispatchEvent: event => calls.push(['event', event.type]) }
const module = { exports: {} }
const source = ts.transpileModule(readFileSync('src/api/non-grain-assignment.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
new Function('require', 'module', 'exports', source)(id => dependencies[id], module, module.exports)
const api = module.exports
assert.equal(await api.getNonGrainReviewerId(), '1', '必须选择准确的 admin 账号')
assert.equal(await api.getNonGrainReviewerId('1'), '1')
await assert.rejects(api.getNonGrainReviewerId('2'), /未关联/)
await api.assignNonGrainReview('900', '1', '1')
assert.deepEqual(calls.find(([path]) => path.endsWith('/start'))[1], { bizTaskId: '900', deptId: '1', assigneeId: '1' })
assert.ok(calls.some(([path]) => path === 'event'))
duplicate = true
node = { ...node, assigneeId: '2' }
await api.assignNonGrainReview('900', '1', '1')
assert.equal(node.assigneeId, '1', '已启动的初核节点应改派给 admin')
node = { ...node, nodeKey: 'task-acceptance', nodeName: '任务受理' }
const eventsBefore = calls.filter(([path]) => path === 'event').length
await assert.rejects(api.assignNonGrainReview('900', '1', '1'), /首节点配置/)
assert.equal(calls.filter(([path]) => path === 'event').length, eventsBefore, '错误节点不能伪装分派成功')
users = []
await assert.rejects(api.getNonGrainReviewerId(), /未找到/)
console.log('PASS: exact admin lookup, workflow start, reassignment, and configuration failure')
