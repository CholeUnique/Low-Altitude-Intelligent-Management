import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toFlightCalendarItems } from '../src/utils/flight-calendar.ts'

const snapshot = JSON.parse(readFileSync(new URL('../docs/backend-task-snapshot/flight-tasks.json', import.meta.url), 'utf8'))
const octoberTasks = snapshot.data.records.filter((task) => task.executeTime?.startsWith('2026-10-'))
const planIds = [...new Set(octoberTasks.map((task) => task.planId))]
const plans = planIds.map((id) => ({ id, title: `计划 ${id}`, date: '', start: '--:--', end: '', area: '-', routeId: '' }))
const events = toFlightCalendarItems(plans, octoberTasks)

assert.equal(octoberTasks.length, 6)
assert.equal(planIds.length, 5)
assert.equal(events.length, 6, '同一计划的多次执行必须分别显示')
assert.equal(events.filter((event) => event.date === '2026-10-05').length, 2)
assert.equal(events.filter((event) => event.date === '2026-10-06').length, 2)

const october13Plan = { id: 'plan-13', title: '计划飞行_202610131242', date: '', start: '--:--', end: '', area: '-', routeId: '', createTime: '2026-10-13T12:51:01' }
const october13Tasks = [
  { id: 'task-1', planId: 'plan-13', planName: october13Plan.title, executeTime: '2026-10-13T12:42:53', status: 1 },
  { id: 'task-2', planId: 'plan-13', planName: october13Plan.title, executeTime: '2026-10-13T13:30:24', status: 6 },
]
const october13Events = toFlightCalendarItems([october13Plan], october13Tasks)
assert.deepEqual(october13Events.map((event) => event.start), ['12:42', '13:30'])
assert.ok(october13Events.every((event) => event.date === '2026-10-13'))
assert.equal(october13Events.length, 2, '已有飞行任务时不能再重复显示一条计划')

const unscheduled = toFlightCalendarItems([october13Plan], [])
assert.equal(unscheduled[0].date, '', '不能把计划创建时间当作飞行日期')
const orphan = toFlightCalendarItems([{ ...october13Plan, date: '2026-10-14' }], [])
assert.equal(orphan[0].date, '2026-10-14', '尚无飞行任务的计划应保留原有排期')
const startedWithoutSchedule = toFlightCalendarItems([], [{ id: 'started', executeTime: '', startTime: '2026-10-15T09:20:00', status: null }])
assert.equal(startedWithoutSchedule[0].date, '2026-10-15', '执行时间为空时应使用实际起飞时间')
assert.equal(startedWithoutSchedule[0].statusText, '状态未返回')

console.log('flight-calendar tests passed')
