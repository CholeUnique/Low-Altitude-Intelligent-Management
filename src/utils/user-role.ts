import type { CurrentUser, UserDepartment } from '@/types'

/** 兼容后端将布尔标志序列化为 0/1 或字符串的部署版本。 */
export function departmentAdminFlag(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return undefined
}

export function preferredDepartmentAdminId(departments: UserDepartment[], initialDeptId?: string): string | undefined {
  const selected = departments.find((department) => String(department.deptId) === String(initialDeptId) && departmentAdminFlag(department.isDeptAdmin) === true)
    || departments.find((department) => departmentAdminFlag(department.isDeptAdmin) === true)
  return selected ? String(selected.deptId) : undefined
}

/** 部门管理员是用户在某个一级部门的身份，并非独立的 user.role。 */
export function isDepartmentAdmin(user: CurrentUser | null | undefined, activeDeptId?: string): boolean {
  if (!user || user.role === 'ADMIN') return false
  if (!activeDeptId) return false
  const membership = (user.deptList || []).find((dept) => String(dept.deptId) === String(activeDeptId))
  if (departmentAdminFlag(membership?.isDeptAdmin) === true) return true
  // 旧会话没有部门管理员标志时，只在其自身当前部门兼容旧 role，不能跨部门继承管理权。
  return departmentAdminFlag(membership?.isDeptAdmin) == null && user.role === 'DEPT_ADMIN'
    && String(user.deptId || user.defaultDeptId || '') === String(activeDeptId)
}

export function hasDepartmentAdminRole(user: CurrentUser | null | undefined): boolean {
  return !!user && user.role !== 'ADMIN' && (user.role === 'DEPT_ADMIN' || (user.deptList || []).some((dept) => departmentAdminFlag(dept.isDeptAdmin) === true))
}

/** 分页结果若未带 isDeptAdmin，就不能据此断定目标是普通用户。 */
export function hasVerifiedDepartmentRole(user: CurrentUser | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'ADMIN' || user.role === 'DEPT_ADMIN') return true
  return Array.isArray(user.deptList) && user.deptList.length > 0
    && user.deptList.every((dept) => departmentAdminFlag(dept.isDeptAdmin) !== undefined)
}

/** 管理员视角的 false 也可能只是分页接口的缺省值，需尝试用详情复核。 */
export function needsDepartmentRoleLookup(user: CurrentUser, viewerIsDepartmentAdmin: boolean): boolean {
  return !hasDepartmentAdminRole(user) && (viewerIsDepartmentAdmin || !hasVerifiedDepartmentRole(user))
}

export function mergeUserDepartmentIdentity(row: CurrentUser, detail: CurrentUser): CurrentUser {
  const departmentsById = new Map((row.deptList || []).map((dept) => [String(dept.deptId), dept]))
  for (const dept of detail.deptList || []) {
    const id = String(dept.deptId)
    departmentsById.set(id, { ...departmentsById.get(id), ...dept,
      isDeptAdmin: departmentAdminFlag(dept.isDeptAdmin) ?? departmentAdminFlag(departmentsById.get(id)?.isDeptAdmin) })
  }
  return { ...row, ...detail, deptList: [...departmentsById.values()] }
}

/** 仅根据已返回的身份与部门范围筛选可管理用户；最终授权仍由后端执行。 */
export function canDepartmentAdminManageUser(user: CurrentUser, actorId: string, managedDeptIds: readonly string[]): boolean {
  if (String(user.id) === String(actorId) || user.role !== 'USER' || hasDepartmentAdminRole(user)) return false
  const ids = new Set(managedDeptIds.map(String))
  return ids.has(String(user.deptId || '')) || ids.has(String(user.defaultDeptId || ''))
    || (user.deptList || []).some((dept) => ids.has(String(dept.deptId)))
}

export function userRoleLabel(user: CurrentUser | null | undefined): string {
  return user?.role === 'ADMIN' ? '系统管理员' : hasDepartmentAdminRole(user) ? '部门管理员' : '普通用户'
}
