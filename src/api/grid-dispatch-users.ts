import { getDeptUserPage } from './account-management'
import { collectPages } from './pagination'
import { ApiBusinessError } from './client'

/** 在任务所属部门读取真实网格员，不能用本地账号列表替代接口权限。 */
export async function getGridDispatchUsers(deptId?: string) {
  if (!deptId) throw new Error('任务未提供所属部门，无法读取可下发网格员。')
  try {
    const members = await collectPages((pageNum, pageSize) => getDeptUserPage({ deptId, pageNum, pageSize }))
    return members.filter(person => /网格员/.test(`${person.realName || ''} ${person.nickname || ''}`) || /^wgy/i.test(person.username))
  } catch (error) {
    if (error instanceof ApiBusinessError && error.code === '403' || (error as { response?: { status?: number } })?.response?.status === 403) {
      throw new Error('当前账号无法读取网格员列表，请联系管理员开通下发对象查询权限。')
    }
    throw error
  }
}
