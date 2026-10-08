/** 回看节点时，独立附件接口的访问限制不影响已授权的任务详情与流程记录。 */
export function shouldShowTaskDataError(index: number, error: unknown, readOnly: boolean) {
  if (!readOnly || ![2, 3].includes(index)) return true
  const value = error as { message?: string; response?: { status?: number } } | null
  const forbidden = value?.response?.status === 403 || /无权限访问|没有.*权限|无.*查看权限|权限不足|无权访问|forbidden|access denied/i.test(value?.message || '')
  return !forbidden
}
