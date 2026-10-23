import type { FlightPlanItem } from '@/mocks/route-planning'

export interface FlightCalendarItem extends FlightPlanItem {
  planId?: string
  taskId?: string
  planTitle?: string
  statusText?: string
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

function taskStatus(task: FlightTaskRecord): Pick<FlightCalendarItem, 'status' | 'statusText'> {
  const code = task.status === null || task.status === undefined || task.status === '' ? NaN : Number(task.status)
  if (Number(task.progressing) === 1) return { status: 1 }
  if (code === 1) return { status: 0 }
  if (code === 6) return { status: 2 }
  if (text(task.errorCode)) return { status: 4 }
  return { statusText: Number.isFinite(code) ? `状态 ${code}` : '状态未返回' }
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
    const scheduledAt = executionDateTime(task.executeTime || task.startTime)
    taskItems.push({
      id: `task:${taskId}`,
      planId: planId || undefined,
      taskId,
      projectId: text(task.projectId) || plan?.projectId,
      date: scheduledAt.slice(0, 10),
      start: scheduledAt.slice(11, 16) || '--:--',
      end: executionDateTime(task.endTime).slice(11, 16),
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
    .map((plan) => ({ ...plan, id: `plan:${plan.id}`, planId: plan.id }))
  return [...taskItems, ...plansWithoutTasks]
}
