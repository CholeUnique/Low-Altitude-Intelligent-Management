import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'

async function loadUtility(path) {
  const source = await readFile(resolve(path), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(output)}`)
}

const { formatBeijingDateTime } = await loadUtility('src/utils/date-time.ts')
assert.equal(formatBeijingDateTime('2026-10-21T21:38:40'), '2026-10-21 21:38:40')
assert.equal(formatBeijingDateTime('2026-10-21T13:38:40Z'), '2026-10-21 21:38:40')
assert.equal(formatBeijingDateTime('2026-10-21T22:38:40+09:00'), '2026-10-21 21:38:40')
assert.equal(formatBeijingDateTime(null), '-')

const { isDepartmentAdmin, hasDepartmentAdminRole, hasVerifiedDepartmentRole, needsDepartmentRoleLookup, mergeUserDepartmentIdentity, canDepartmentAdminManageUser, userRoleLabel, preferredDepartmentAdminId } = await loadUtility('src/utils/user-role.ts')
const user = { role: 'USER', deptList: [{ deptId: '101', isDeptAdmin: true }, { deptId: '102', isDeptAdmin: false }] }
assert.equal(isDepartmentAdmin(user, '101'), true)
assert.equal(isDepartmentAdmin(user, '102'), false)
assert.equal(hasDepartmentAdminRole(user), true)
assert.equal(userRoleLabel(user), '部门管理员')
assert.equal(hasVerifiedDepartmentRole(user), true)
assert.equal(hasVerifiedDepartmentRole({ role: 'USER', deptList: [{ deptId: '101', isDeptAdmin: false }] }), true)
assert.equal(hasVerifiedDepartmentRole({ role: 'USER', deptList: [{ deptId: '101' }] }), false)
assert.equal(needsDepartmentRoleLookup({ role: 'USER', deptList: [{ deptId: '101', isDeptAdmin: false }] }, true), true)
assert.equal(needsDepartmentRoleLookup({ role: 'USER', deptList: [{ deptId: '101', isDeptAdmin: false }] }, false), false)
assert.equal(needsDepartmentRoleLookup(user, true), false)
const peerFromPage = { id: '2', role: 'USER', deptList: [{ deptId: '101', isDeptAdmin: false }] }
const peerFromDetail = { id: '2', role: 'USER', deptList: [{ deptId: '101', isDeptAdmin: true }] }
const resolvedPeer = mergeUserDepartmentIdentity(peerFromPage, peerFromDetail)
assert.equal(userRoleLabel(resolvedPeer), '部门管理员')
assert.equal(canDepartmentAdminManageUser(resolvedPeer, '1', ['101']), false)
assert.equal(mergeUserDepartmentIdentity(peerFromDetail, { ...peerFromDetail, deptList: [{ deptId: '101' }] }).deptList[0].isDeptAdmin, true)
assert.equal(canDepartmentAdminManageUser({ id: '2', role: 'USER', deptList: [{ deptId: '101' }] }, '1', ['101']), true)
assert.equal(canDepartmentAdminManageUser({ id: '2', role: 'USER', deptList: [{ deptId: '101', isDeptAdmin: true }] }, '1', ['101']), false)
assert.equal(canDepartmentAdminManageUser({ id: '1', role: 'USER', deptList: [{ deptId: '101' }] }, '1', ['101']), false)
assert.equal(canDepartmentAdminManageUser({ id: '2', role: 'USER', deptList: [{ deptId: '102' }] }, '1', ['101']), false)
assert.equal(userRoleLabel({ ...user, role: 'ADMIN' }), '系统管理员')
assert.equal(preferredDepartmentAdminId(user.deptList, '102'), '101')
assert.equal(preferredDepartmentAdminId(user.deptList, '101'), '101')
console.log('Admin user role and Beijing timestamp checks passed.')
