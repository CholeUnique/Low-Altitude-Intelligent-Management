import type { FlightPlanItem } from '@/mocks/route-planning'

export interface FlightCalendarItem extends FlightPlanItem {
  planId?: string
  taskId?: string
  planTitle?: string
  statusText?: string
  statusDetail?: string
}

export type FlightTaskRecord = Record<string, unknown>

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function executionDateTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number' || /^\d{10,13}$/.test(text(value))) {
    const number = Number(value)
    const date = new Date(number < 1e12 ? number * 1000 : number)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }
  const normalized = text(value).replace('T', ' ')
  return /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?/.test(normalized) ? normalized : ''
}

function value(task: FlightTaskRecord, camelCase: string, snakeCase: string): unknown {
  return task[camelCase] ?? task[snakeCase]
}

function hasTaskError(task: FlightTaskRecord): boolean {
  const errorCode = text(value(task, 'errorCode', 'error_code'))
  return Boolean(errorCode) && errorCode !== '0' && errorCode !== '200'
}

/**
 * 页面内部状态：0 待执行、1 执行中、2 已完成、3 已取消、4 执行失败、
 * 5 已挂起、6 部分执行、7 执行终止。
 *
 * 按大翼任务状态码展示每次执行；错误码仅补充说明，不替代任务状态。
 */
function taskStatus(task: FlightTaskRecord): Pick<FlightCalendarItem, 'status' | 'statusText' | 'statusDetail'> {
  const rawStatus = value(task, 'status', 'status')
  const code = rawStatus === null || rawStatus === undefined || rawStatus === '' ? NaN : Number(rawStatus)
  const errorCode = text(value(task, 'errorCode', 'error_code'))
  const errorDescription = text(value(task, 'errorCodeDesc', 'error_code_desc'))
  const statusDetail = hasTaskError(task)
    ? (errorDescription || `错误码 ${errorCode}`)
    : undefined

  const statuses: Record<number, number> = { 1: 0, 2: 1, 3: 5, 4: 2, 5: 6, 6: 4, 7: 7 }
  if (statuses[code] !== undefined) return { status: statuses[code], statusDetail }
  return { status: undefined, statusText: Number.isFinite(code) ? `状态 ${code}` : '状态未返回', statusDetail }
}

/** 大翼飞行计划 status：1 待执行、2 执行中、3 已完成。 */
function planStatus(plan: FlightPlanItem): Pick<FlightCalendarItem, 'status' | 'statusText'> {
  if (plan.status === 1) return { status: 0 }
  if (plan.status === 2) return { status: 1 }
  if (plan.status === 3) return { status: 2 }
  if (plan.status === undefined || Number.isNaN(plan.status)) return { status: undefined, statusText: '状态未返回' }
  return { status: undefined, statusText: `计划状态 ${plan.status}` }
}

/** 每条飞行任务对应一次日历排期；无任务的计划仍保留为计划排期。 */
export function toFlightCalendarItems(plans: FlightPlanItem[], tasks: FlightTaskRecord[]): FlightCalendarItem[] {
  const planById = new Map(plans.map((plan) => [plan.id, plan]))
  const linkedPlanIds = new Set<string>()
  const seenTaskIds = new Set<string>()
  const taskItems: FlightCalendarItem[] = []

  tasks.forEach((task, index) => {
    if (Number(task.deleted) === 1) return
    const taskId = text(task.id) || `unknown-${index}`
    if (seenTaskIds.has(taskId)) return
    seenTaskIds.add(taskId)

    const planId = text(task.planId)
    if (planId) linkedPlanIds.add(planId)
    const plan = planById.get(planId)
    // 创建时间不是飞行时间。计划执行时间只作为没有任务时的排期来源。
    const scheduledAt = executionDateTime(value(task, 'executeTime', 'execute_time') || value(task, 'startTime', 'start_time'))
    taskItems.push({
      id: `task:${taskId}`,
      planId: planId || undefined,
      taskId,
      projectId: text(task.projectId) || plan?.projectId,
      date: scheduledAt.slice(0, 10),
      start: scheduledAt.slice(11, 16) || '--:--',
      end: executionDateTime(value(task, 'endTime', 'end_time')).slice(11, 16),
      title: text(task.name) || text(task.planName) || plan?.title || `飞行任务 ${index + 1}`,
      planTitle: text(task.planName) || plan?.title || undefined,
      area: text(task.waylineName) || plan?.area || '-',
      routeId: text(task.waylineId) || plan?.routeId || '',
      sn: text(task.sn) || text(task.droneSn) || plan?.sn,
      deviceType: text(task.deviceType) || text(task.droneType) || plan?.deviceType,
      planType: text(task.planType) || plan?.planType,
      waylineType: text(task.waylineType) || plan?.waylineType,
      scheduledAt: scheduledAt || undefined,
      ...taskStatus(task),
    })
  })

  const plansWithoutTasks: FlightCalendarItem[] = plans
    .filter((plan) => !linkedPlanIds.has(plan.id))
    .map((plan) => ({ ...plan, id: `plan:${plan.id}`, planId: plan.id, ...planStatus(plan) }))
  return [...taskItems, ...plansWithoutTasks]
}
