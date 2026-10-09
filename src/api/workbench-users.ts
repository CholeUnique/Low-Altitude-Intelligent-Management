import { getDepartmentList, getDeptUserPage, type UserOption } from './account-management'
import { collectPages } from './pagination'
import type { CurrentUser } from '@/types'

export interface WorkbenchUser extends UserOption { deptId: string; deptName?: string }
export interface UserPreference { ids?: string[]; usernames?: string[]; gridUsers?: boolean }
export function prioritizeWorkbenchUsers(users: WorkbenchUser[], preference: UserPreference = {}) {
  const rank = (person: WorkbenchUser) => preference.ids?.includes(person.id) ? preference.ids.indexOf(person.id) / (preference.ids.length + 1) : preference.usernames?.includes(person.username) ? 1 + preference.usernames.indexOf(person.username) / (preference.usernames.length + 1) : preference.gridUsers && (/网格员/.test(`${person.realName || ''} ${person.nickname || ''}`) || /^wgy/i.test(person.username)) ? 2 : 3
  return users.map((person, index) => ({ person, index })).sort((a, b) => rank(a.person) - rank(b.person) || a.index - b.index).map(item => item.person)
}
/** 只使用选人接口，读取可访问部门的完整分页；不使用管理员 user/page。 */
export async function getWorkbenchUsers(deptId?: string, self?: CurrentUser | null, activeDeptId?: string) {
  let departments: Array<{ id: string; name?: string }> = []
  const warnings: string[] = []
  try {
    type Department = { id: string | number; name?: string; children?: Department[] }
    const append = (items: Department[]) => {
      for (const item of items) {
        const id = String(item.id)
        if (!departments.some(dept => dept.id === id)) departments.push({ id, name: item.name })
        if (item.children?.length) append(item.children)
      }
    }
    append(await getDepartmentList({ status: 1 }))
  }
  catch {
    if (!deptId) throw new Error('无法读取部门列表，且任务未提供所属部门。')
    warnings.push('部门列表读取失败，当前仅查询任务所属部门用户。')
  }
  if (deptId && !departments.some(item => item.id === deptId)) departments.unshift({ id: deptId })
  // 当前任务部门优先，保证多部门成员的默认关联仍与当前任务一致。
  departments.sort((a, b) => Number(b.id === deptId) - Number(a.id === deptId))
  const users: WorkbenchUser[] = []
  for (const dept of departments) {
    try {
      const records = await collectPages((pageNum, pageSize) => getDeptUserPage({ deptId: dept.id, includeChild: false, pageNum, pageSize }))
      for (const person of records) if (!users.some(item => item.id === person.id)) users.push({ ...person, deptId: dept.id, deptName: dept.name })
    } catch (error) { warnings.push(`${dept.name || '部门 #' + dept.id}：${error instanceof Error ? error.message : '用户读取失败'}`) }
  }
  // 部门选人接口可能省略本人，使用真实登录资料补全，不虚构用户或部门。
  if (self && !users.some(person => person.id === String(self.id))) {
    const ownDeptId = activeDeptId || self.deptId || self.defaultDeptId || self.deptList?.[0]?.deptId
    if (ownDeptId) users.push({ id: String(self.id), username: self.username, realName: self.realName, nickname: self.nickname, deptId: String(ownDeptId), deptName: self.deptList?.find(dept => String(dept.deptId) === String(ownDeptId))?.deptName || self.deptName })
  }
  if (!users.length && warnings.length) throw new Error(warnings.join('；'))
  return { users, departments, warnings }
}
