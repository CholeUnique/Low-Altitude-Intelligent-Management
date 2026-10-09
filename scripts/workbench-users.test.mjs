import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'
const requests = []
const people = Array.from({ length: 105 }, (_, index) => ({ id: index + 1, username: `user${index}`, realName: `普通用户${index}` }))
people[7] = { id: 8, username: 'hlqNYNCJ', realName: '海陵区农业农村局' }
people[8] = { id: 9, username: 'wgy01', realName: '九龙镇网格员' }
people[9] = { id: 10, username: 'ntjsg', realName: '农田建设股' }
people[104] = { id: 105, username: 'nyncKZ', realName: '农田建设科' }
const cache = new Map()
function load(file) {
  file = resolve(file)
  if (cache.has(file)) return cache.get(file)
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', source)(id => id === './client' ? { apiClient: { post: async (url, body) => {
    requests.push({ url, body })
    if (url === '/v1/dept/list') return [{ id: 1, name: '农业农村局', children: [{ id: 2, name: '其他部门' }] }, { id: 3, name: '不可访问部门' }]
    assert.equal(url, '/v1/user/dept/page')
    assert.equal(body.includeChild, false)
    assert.ok(body.pageSize <= 100)
    assert.equal(body.keyword, undefined, 'All users, no username/role filter')
    if (body.deptId === '3') throw Error('无权限访问')
    const members = body.deptId === '1' ? people : [{ id: 9, username: 'wgy01', realName: '九龙镇网格员' }, { id: 1000, username: 'ordinaryOtherDepartment', realName: '其他部门普通用户' }]
    return { records: members.slice((body.pageNum - 1) * body.pageSize, body.pageNum * body.pageSize), total: members.length }
  } } } : load(resolve(dirname(file), id + '.ts')), module, module.exports)
  cache.set(file, module.exports)
  return module.exports
}
const { getWorkbenchUsers, prioritizeWorkbenchUsers } = load('src/api/workbench-users.ts')
const result = await getWorkbenchUsers('1')
assert.equal(result.users.length, 106, 'Read all pages and deduplicate multi-department users')
assert.equal(result.warnings.length, 1, 'Report unavailable department without discarding accessible users')
assert.equal(result.users.find(person => person.id === '1000').deptId, '2', 'Keep real recipient department')
assert.equal(result.users.find(person => person.id === '9').deptId, '1', 'Prefer task department for multi-department membership')
assert.ok(requests.some(request => request.url === '/v1/user/dept/page' && request.body.pageNum === 2))
const before = result.users.map(person => person.id)
assert.equal(prioritizeWorkbenchUsers(result.users, { usernames: ['hlqNYNCJ'] })[0].username, 'hlqNYNCJ')
assert.equal(prioritizeWorkbenchUsers(result.users, { gridUsers: true })[0].username, 'wgy01')
assert.equal(prioritizeWorkbenchUsers(result.users, { usernames: ['ntjsg'] })[0].username, 'ntjsg')
assert.equal(prioritizeWorkbenchUsers(result.users, { ids: ['105', '10'] })[0].id, '105')
assert.deepEqual(result.users.map(person => person.id), before, 'Do not mutate backend records')
assert.equal(prioritizeWorkbenchUsers(result.users, { gridUsers: true }).length, 106, 'Recommended users must not filter out ordinary users')
const self = { id: '2000', username: 'self', realName: '当前登录人', deptList: [{ deptId: '2', deptName: '本人部门' }] }
const withSelf = await getWorkbenchUsers('1', self, '2')
assert.equal(withSelf.users.find(person => person.id === '2000').deptId, '2', 'Include authenticated user with their own real department even when picker API omits self')
assert.equal(withSelf.users.filter(person => person.id === '2000').length, 1)
const existingSelf = await getWorkbenchUsers('1', { ...self, id: '9' }, '2')
assert.equal(existingSelf.users.filter(person => person.id === '9').length, 1, 'Do not duplicate current user already returned by backend')
const { inspectionRoute } = load('src/utils/non-grain-inspection.ts')
const plot = { abnormalId: '1', result: 'NO_PROBLEM', landUse: '0101', description: '正常种植', noProblemReason: '水稻', attachment: [] }
const flow = { timeline: [], currentNode: { deptId: '1' } }
const target = { assigneeId: '1000', deptId: '2' }
assert.deepEqual(inspectionRoute([plot], flow, undefined, target), { result: 'NO_PROBLEM', assigneeId: '1000', deptId: '2', nextKey: 'FINISH' })
assert.equal(inspectionRoute([{ ...plot, result: 'PROBLEM', attachment: ['file'] }], flow, undefined, target).nextKey, 'RECTIFY')
const { recheckRoute } = load('src/utils/non-grain-recheck.ts')
assert.deepEqual(recheckRoute(['PROBLEM'], flow, target), { result: 'PROBLEM', assigneeId: '1000', deptId: '2', nextKey: 'RECTIFY' })
assert.equal(recheckRoute(['NO_PROBLEM'], flow, target).assigneeId, '1000')
console.log('PASS: all accessible users, pagination/deduplication, recommended ordering, ordinary users, cross-department recipients and workflow routing overrides')
