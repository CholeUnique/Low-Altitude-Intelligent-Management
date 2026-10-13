<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getFlightPlans, getFlightTaskPage } from '@/api/patrol'
import { isMockMode } from '@/api/client'
import { useUserStore } from '@/stores/user'
import type { FlightPlanItem } from '@/mocks/route-planning'
import { toFlightCalendarItems } from '@/utils/flight-calendar'
import type { FlightCalendarItem, FlightTaskRecord } from '@/utils/flight-calendar'

const user = useUserStore()
const plans = ref<FlightCalendarItem[]>([])
const loading = ref(false)
const error = ref('')
const warning = ref('')
let loadSequence = 0
const keyword = ref('')
const statusFilter = ref<number | ''>('')
const deviceFilter = ref('')
const displayMode = ref<'calendar' | 'list'>('calendar')
const now = new Date()
const cursor = ref(new Date(now.getFullYear(), now.getMonth(), 1))
const selectedDate = ref(dateKey(now))

const statusMeta: Record<number, { label: string; tone: string }> = {
  0: { label: '待执行', tone: 'pending' },
  1: { label: '执行中', tone: 'running' },
  2: { label: '已完成', tone: 'done' },
  3: { label: '已取消', tone: 'cancelled' },
  4: { label: '执行失败', tone: 'failed' },
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
function statusLabel(status?: number, fallback?: string) {
  if (status === undefined) return fallback || '状态未返回'
  return statusMeta[status]?.label || `状态 ${status}`
}
function statusTone(status?: number) {
  return status === undefined ? 'unknown' : statusMeta[status]?.tone || 'unknown'
}
function planTime(plan: FlightCalendarItem) {
  return plan.start && plan.start !== '--:--' ? plan.start : '时间未定'
}

const monthKey = computed(() => `${cursor.value.getFullYear()}-${String(cursor.value.getMonth() + 1).padStart(2, '0')}`)
const monthTitle = computed(() => `${cursor.value.getFullYear()} 年 ${cursor.value.getMonth() + 1} 月`)
const availableStatuses = computed(() => [...new Set(plans.value.map((plan) => plan.status).filter((value): value is number => value !== undefined))].sort((a, b) => a - b))
const availableDevices = computed(() => [...new Set(plans.value.map((plan) => plan.sn).filter((value): value is string => Boolean(value)))].sort())
const filteredPlans = computed(() => plans.value.filter((plan) => {
  const search = `${plan.title} ${plan.area} ${plan.sn || ''} ${plan.deviceType || ''}`.toLowerCase()
  return (!keyword.value.trim() || search.includes(keyword.value.trim().toLowerCase()))
    && (statusFilter.value === '' || plan.status === statusFilter.value)
    && (!deviceFilter.value || plan.sn === deviceFilter.value)
}))
const monthPlans = computed(() => filteredPlans.value.filter((plan) => plan.date.startsWith(monthKey.value)))
const scheduledDays = computed(() => new Set(monthPlans.value.map((plan) => plan.date)).size)
const unscheduledCount = computed(() => filteredPlans.value.filter((plan) => !/^\d{4}-\d{2}-\d{2}$/.test(plan.date)).length)
const selectedPlans = computed(() => filteredPlans.value.filter((plan) => plan.date === selectedDate.value)
  .sort((left, right) => left.start.localeCompare(right.start)))
const selectedDateLabel = computed(() => {
  const [year, month, day] = selectedDate.value.split('-').map(Number)
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(year!, month! - 1, day!).getDay()]
  return { date: `${month}月${day}日`, weekday }
})
const calendarDays = computed(() => {
  const first = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - mondayOffset)
  const daysInMonth = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + 1, 0).getDate()
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7
  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = dateKey(date)
    return {
      key,
      day: date.getDate(),
      currentMonth: date.getMonth() === cursor.value.getMonth(),
      today: key === dateKey(now),
      plans: monthPlans.value.filter((plan) => plan.date === key).sort((a, b) => a.start.localeCompare(b.start)),
    }
  })
})
const monthlyStats = computed(() => ({
  total: monthPlans.value.length,
  pending: monthPlans.value.filter((plan) => plan.status === 0).length,
  running: monthPlans.value.filter((plan) => plan.status === 1).length,
  done: monthPlans.value.filter((plan) => plan.status === 2).length,
}))

function moveMonth(offset: number) {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + offset, 1)
  selectedDate.value = dateKey(cursor.value)
}
function goToday() {
  cursor.value = new Date(now.getFullYear(), now.getMonth(), 1)
  selectedDate.value = dateKey(now)
}
function selectDay(key: string) {
  selectedDate.value = key
}

async function loadAllPlans(deptId?: string): Promise<FlightPlanItem[]> {
  const first = await getFlightPlans({ pageNum: 1, pageSize: 200, deptId })
  const all = [...first.list]
  for (let pageNum = 2; pageNum <= Math.ceil(first.total / 200); pageNum += 4) {
    const pages = await Promise.all(Array.from(
      { length: Math.min(4, Math.ceil(first.total / 200) - pageNum + 1) },
      (_, index) => getFlightPlans({ pageNum: pageNum + index, pageSize: 200, deptId }),
    ))
    all.push(...pages.flatMap((page) => page.list))
  }
  return all
}

function taskPage(payload: unknown): { records: FlightTaskRecord[]; total: number; pageSize: number } {
  if (!payload || typeof payload !== 'object') throw new Error('飞行任务接口未返回分页数据')
  const page = payload as Record<string, unknown>
  if (!Array.isArray(page.records)) throw new Error('飞行任务接口未返回任务列表')
  const total = Number(page.total ?? page.records.length)
  const pageSize = Number(page.pageSize ?? 200)
  return {
    records: page.records as FlightTaskRecord[],
    total: Number.isFinite(total) ? total : page.records.length,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 200,
  }
}

async function loadAllTasks(deptId?: string): Promise<FlightTaskRecord[]> {
  const first = taskPage(await getFlightTaskPage({ pageNum: 1, pageSize: 200, deptId }))
  const all = [...first.records]
  const pageCount = Math.ceil(first.total / first.pageSize)
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 4) {
    const pages = await Promise.all(Array.from(
      { length: Math.min(4, pageCount - pageNum + 1) },
      (_, index) => getFlightTaskPage({ pageNum: pageNum + index, pageSize: first.pageSize, deptId }).then(taskPage),
    ))
    all.push(...pages.flatMap((page) => page.records))
  }
  return all
}

async function loadPlans() {
  const sequence = ++loadSequence
  loading.value = true
  error.value = ''
  warning.value = ''
  try {
    const mock = isMockMode()
    const [planResult, taskResult] = await Promise.allSettled([
      loadAllPlans(user.activeDeptId),
      mock ? Promise.resolve([] as FlightTaskRecord[]) : loadAllTasks(user.activeDeptId),
    ])
    if (sequence !== loadSequence) return
    if (planResult.status === 'rejected' && taskResult.status === 'rejected') {
      throw planResult.reason instanceof Error ? planResult.reason : new Error('飞行排期读取失败')
    }
    const planList = planResult.status === 'fulfilled' ? planResult.value : []
    const taskList = taskResult.status === 'fulfilled' ? taskResult.value : []
    plans.value = toFlightCalendarItems(planList, taskList)
    if (planResult.status === 'rejected') warning.value = '飞行计划读取失败，当前仅显示飞行任务。'
    else if (taskResult.status === 'rejected') warning.value = '飞行任务读取失败，当前仅显示计划排期。'
  } catch (reason) {
    if (sequence !== loadSequence) return
    plans.value = []
    error.value = reason instanceof Error ? reason.message : '飞行排期读取失败。'
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

onMounted(() => void loadPlans())
watch(() => user.activeDeptId, () => void loadPlans())
</script>

<template>
  <div class="flight-plan-calendar">
    <section class="metric-grid" aria-label="本月飞行排期概览">
      <article class="metric-card metric-card--total"><span>本月排期</span><b>{{ monthlyStats.total }}<small>架次</small></b><em>覆盖 {{ scheduledDays }} 个日期</em></article>
      <article class="metric-card metric-card--pending"><span>待执行</span><b>{{ monthlyStats.pending }}<small>架次</small></b><em>等待计划起飞</em></article>
      <article class="metric-card metric-card--running"><span>执行中</span><b>{{ monthlyStats.running }}<small>架次</small></b><em>正在执行的任务</em></article>
      <article class="metric-card metric-card--done"><span>已完成</span><b>{{ monthlyStats.done }}<small>架次</small></b><em>本月完成计划</em></article>
    </section>

    <section class="toolbar">
      <div class="toolbar-leading">
        <div class="toolbar-title"><b>飞行排期</b><span>查看每日计划与执行进度</span></div>
        <div class="month-switch"><button type="button" aria-label="上个月" @click="moveMonth(-1)">‹</button><b>{{ monthTitle }}</b><button type="button" aria-label="下个月" @click="moveMonth(1)">›</button><button type="button" class="today" @click="goToday">今天</button></div>
      </div>
      <div class="filters"><input v-model="keyword" aria-label="搜索飞行计划" placeholder="搜索计划、航线或设备" /><label>状态<select v-model="statusFilter"><option value="">全部状态</option><option v-for="status in availableStatuses" :key="status" :value="status">{{ statusLabel(status) }}</option></select></label><label>设备<select v-model="deviceFilter"><option value="">全部设备</option><option v-for="device in availableDevices" :key="device" :value="device">{{ device }}</option></select></label><div class="mode-switch"><button type="button" :class="{ active: displayMode === 'calendar' }" @click="displayMode = 'calendar'">日历</button><button type="button" :class="{ active: displayMode === 'list' }" @click="displayMode = 'list'">列表</button></div></div>
    </section>

    <div v-if="warning" class="data-warning" role="status">{{ warning }}</div>
    <div v-if="loading" class="state-layer">正在读取真实飞行排期…</div>
    <div v-else-if="error" class="state-layer error"><span>{{ error }}</span><button @click="loadPlans">重新读取</button></div>
    <section v-else-if="displayMode === 'calendar'" class="calendar-layout">
      <div class="calendar-panel">
        <div class="weekday"><b v-for="day in ['周一','周二','周三','周四','周五','周六','周日']" :key="day">{{ day }}</b></div>
        <div class="calendar-grid" :style="{ '--week-count': calendarDays.length / 7 }">
          <button v-for="day in calendarDays" :key="day.key" class="day-cell" :class="{ muted: !day.currentMonth, selected: selectedDate === day.key, today: day.today }" @click="selectDay(day.key)">
            <span class="day-cell__heading"><strong>{{ day.day }}</strong><small v-if="day.plans.length">{{ day.plans.length }} 架次</small></span>
            <i v-for="plan in day.plans.slice(0,3)" :key="plan.id" :class="statusTone(plan.status)"><em>{{ planTime(plan) }}</em><span>{{ plan.title }}</span></i>
            <small v-if="day.plans.length > 3" class="day-cell__more">还有 {{ day.plans.length - 3 }} 架次</small>
          </button>
        </div>
      </div>
      <aside class="daily-panel">
        <header><div><span>当日飞行</span><b>{{ selectedDateLabel.date }} <small>{{ selectedDateLabel.weekday }}</small></b></div><em>{{ selectedPlans.length }} 架次</em></header>
        <div class="daily-list">
          <article v-for="plan in selectedPlans" :key="plan.id">
            <div class="daily-list__top"><time>{{ planTime(plan) }}</time><em :class="statusTone(plan.status)">{{ statusLabel(plan.status, plan.statusText) }}</em></div>
            <b>{{ plan.title }}</b><span>{{ plan.area }}</span><small>{{ plan.sn || '未返回设备 SN' }}<template v-if="plan.deviceType"> · {{ plan.deviceType }}</template></small>
          </article>
          <div v-if="!selectedPlans.length" class="empty"><i>◇</i><b>当天没有飞行安排</b><span>选择其他日期查看对应计划</span></div>
        </div>
        <footer v-if="unscheduledCount">另有 {{ unscheduledCount }} 条记录未解析到执行日期</footer>
      </aside>
    </section>

    <section v-else class="plan-list-panel"><header><span>计划名称</span><span>执行时间</span><span>航线</span><span>设备</span><span>状态</span></header><div><article v-for="plan in filteredPlans" :key="plan.id"><span><b>{{ plan.title }}</b><small>{{ plan.taskId ? `任务 ID：${plan.taskId}` : `计划 ID：${plan.planId}` }}</small></span><span>{{ plan.date || '日期未返回' }} {{ planTime(plan) }}</span><span>{{ plan.area }}</span><span>{{ plan.sn || '-' }}<small>{{ plan.deviceType || '' }}</small></span><span><em :class="statusTone(plan.status)">{{ statusLabel(plan.status, plan.statusText) }}</em></span></article><div v-if="!filteredPlans.length" class="empty">暂无符合条件的飞行排期</div></div></section>
  </div>
</template>

<style scoped lang="scss">
.flight-plan-calendar{height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:14px;background:#edf3f6;color:#193e53}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric-grid article{min-height:82px;box-sizing:border-box;padding:13px 17px;background:#fff;border:1px solid #d3e0e6;border-radius:7px;box-shadow:0 2px 8px #163b4d0b}.metric-grid span,.metric-grid em{display:block;color:#708995;font-size:11px;font-style:normal}.metric-grid b{display:inline-block;margin-top:8px;font-size:26px}.metric-grid b small{margin-left:4px;font-size:11px}.metric-grid em{float:right;margin-top:15px;color:#40918d}.toolbar{min-height:54px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 12px;background:#fff;border:1px solid #d3e0e6;border-radius:7px}.month-switch,.filters,.filters label,.mode-switch{display:flex;align-items:center}.month-switch{gap:10px}.month-switch button,.mode-switch button{height:34px;min-width:34px;color:#496978;background:#f7fafb;border:1px solid #ccdae1;border-radius:4px;cursor:pointer}.month-switch b{min-width:100px;text-align:center}.month-switch button.today{padding:0 12px}.filters{gap:12px}.filters>input,.filters select{height:34px;box-sizing:border-box;padding:0 9px;color:#3f6171;background:#fff;border:1px solid #cadbe2;border-radius:4px;outline:none}.filters>input{width:190px}.filters label{gap:6px;color:#66818f;font-size:11px}.mode-switch{margin-left:2px}.mode-switch button{padding:0 12px;border-radius:0}.mode-switch button:first-child{border-radius:4px 0 0 4px}.mode-switch button:last-child{margin-left:-1px;border-radius:0 4px 4px 0}.mode-switch button.active{color:#fff;background:#168dab;border-color:#168dab}.state-layer{flex:1;display:grid;place-items:center;color:#728a96;background:#fff;border:1px solid #d2e0e6;border-radius:7px}.state-layer.error{align-content:center;gap:10px;color:#b44552}.state-layer button{padding:7px 12px;color:#fff;background:#168dab;border:0;border-radius:4px;cursor:pointer}.calendar-layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px}.calendar-panel,.daily-panel,.plan-list-panel{min-height:0;background:#fff;border:1px solid #d1dfe6;border-radius:7px;overflow:hidden}.calendar-panel{display:grid;grid-template-rows:43px minmax(0,1fr)}.weekday{display:grid;grid-template-columns:repeat(7,1fr);background:#f4f7f9;border-bottom:1px solid #d7e3e9}.weekday b{display:grid;place-items:center;color:#708692;font-size:12px}.calendar-grid{min-height:0;display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(6,1fr)}.day-cell{position:relative;min-width:0;min-height:0;overflow:hidden;padding:8px 7px;color:#355669;background:#fff;border:0;border-right:1px solid #dfe8ec;border-bottom:1px solid #dfe8ec;text-align:left;cursor:pointer}.day-cell:nth-child(7n){border-right:0}.day-cell.muted{color:#aab9c0;background:#fafcfd}.day-cell.selected{box-shadow:inset 0 0 0 2px #18a0bd;background:#f3fbfd}.day-cell.today>span{display:grid;width:25px;height:25px;place-items:center;margin:-3px 0 3px -3px;color:#fff;background:#18a0bd;border-radius:50%}.day-cell>span{display:block;height:22px;font-size:11px;font-weight:700}.day-cell>i{display:block;overflow:hidden;margin:3px 0 0;padding:4px 5px;color:#367187;background:#e3f4f7;border-left:3px solid #22a7c3;font-size:9px;font-style:normal;text-overflow:ellipsis;white-space:nowrap}.day-cell>i em{margin-right:5px;font-style:normal}.day-cell>i.pending{color:#856a27;background:#fff5d9;border-color:#e6b747}.day-cell>i.running{color:#247389;background:#e2f5f9;border-color:#18a4c2}.day-cell>i.done{color:#2f775e;background:#e3f5ed;border-color:#2cad7e}.day-cell>i.cancelled,.day-cell>i.failed{color:#8b6570;background:#f5e9ed;border-color:#b78191}.day-cell>small{display:block;margin-top:4px;color:#8096a0;font-size:9px}.daily-panel{display:flex;flex-direction:column}.daily-panel>header{height:55px;display:flex;align-items:center;justify-content:space-between;padding:0 15px;border-bottom:1px solid #d8e4e9}.daily-panel header b,.daily-panel header span{display:block}.daily-panel header b{font-size:15px}.daily-panel header span{margin-top:3px;color:#7c929c;font-size:10px}.daily-panel header>em{color:#718a96;font-size:11px;font-style:normal}.daily-list{flex:1;min-height:0;overflow:auto;padding:0 13px}.daily-list article{display:grid;grid-template-columns:44px 10px minmax(0,1fr) auto;align-items:start;gap:8px;padding:15px 0;border-bottom:1px solid #e3eaee}.daily-list time{color:#315b70;font-size:11px;font-weight:700}.daily-list>article>i{width:8px;height:8px;margin-top:2px;background:#8ca0aa;border-radius:50%}.daily-list>article>i.pending{background:#e6b747}.daily-list>article>i.running{background:#17a5c3}.daily-list>article>i.done{background:#29ac7c}.daily-list article div b,.daily-list article div span,.daily-list article div small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.daily-list article div b{font-size:12px}.daily-list article div span{margin-top:5px;color:#6c8490;font-size:10px}.daily-list article div small{margin-top:3px;color:#8a9da6;font-size:9px}.daily-list article>em,.plan-list-panel article>span>em{padding:4px 6px;color:#657d88;background:#edf2f4;border-radius:9px;font-size:9px;font-style:normal}.daily-list article>em.pending,.plan-list-panel em.pending{color:#8b691e;background:#fff3cd}.daily-list article>em.running,.plan-list-panel em.running{color:#14758d;background:#dcf3f8}.daily-list article>em.done,.plan-list-panel em.done{color:#197155;background:#dcf4e9}.daily-panel>footer{padding:10px 14px;color:#7e929c;background:#f7fafb;border-top:1px solid #dce6eb;font-size:10px}.empty{min-height:130px;display:grid;place-items:center;color:#8498a2;font-size:12px}.plan-list-panel{flex:1;display:grid;grid-template-rows:42px minmax(0,1fr)}.plan-list-panel>header,.plan-list-panel article{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr .7fr;align-items:center}.plan-list-panel>header{padding:0 15px;color:#657f8c;background:#f1f6f8;border-bottom:1px solid #d5e2e8;font-size:11px;font-weight:700}.plan-list-panel>div{min-height:0;overflow:auto}.plan-list-panel article{min-height:58px;padding:0 15px;border-bottom:1px solid #e1eaee;font-size:11px}.plan-list-panel article>span{min-width:0;padding-right:10px}.plan-list-panel article b,.plan-list-panel article small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plan-list-panel article b{font-size:12px}.plan-list-panel article small{margin-top:4px;color:#80949e;font-size:9px}@media(max-width:1280px){.calendar-layout{grid-template-columns:minmax(0,1fr) 310px}.filters>input{display:none}.flight-plan-calendar{padding:10px}.day-cell{padding:5px 4px}.day-cell>i{padding-inline:3px}}@media(max-width:980px){.metric-grid{grid-template-columns:repeat(2,1fr)}.calendar-layout{grid-template-columns:1fr}.daily-panel{display:none}.filters label{display:none}}
.filters>input:focus::placeholder{color:transparent}
.filters select:hover,.filters select:focus{color:#fff;background-color:#315f91;border-color:#315f91}
.filters select option{color:#3f6171;background:#fff}
.data-warning{padding:8px 12px;color:#856a27;background:#fff7df;border:1px solid #efd791;border-radius:6px;font-size:12px}

/* Flight schedule visual hierarchy */
.flight-plan-calendar{gap:13px;padding:16px;background:#edf3f7}
.metric-grid{gap:13px}
.metric-grid article{position:relative;display:flex;min-height:102px;flex-direction:column;justify-content:center;overflow:hidden;padding:15px 21px;border-color:#d9e5ec;border-radius:10px;box-shadow:0 5px 17px #183d5110}
.metric-grid article::before{position:absolute;top:17px;bottom:17px;left:0;width:4px;border-radius:0 4px 4px 0;background:var(--metric-accent);content:''}
.metric-card--total{--metric-accent:#168faa}.metric-card--pending{--metric-accent:#e5aa42}.metric-card--running{--metric-accent:#468dce}.metric-card--done{--metric-accent:#2cad82}
.metric-grid span{color:#688390;font-size:13px;font-weight:700}
.metric-grid b{margin:7px 0 4px;color:#1a4158;font-size:34px;font-weight:750;line-height:1}
.metric-grid b small{margin-left:7px;color:#678391;font-size:12px;font-weight:600}
.metric-grid em{float:none;margin:0;color:#8197a2;font-size:12px;line-height:1.35}

.toolbar{min-height:76px;padding:11px 16px;border-color:#d9e5ec;border-radius:10px;box-shadow:0 3px 13px #183d510b}
.toolbar-leading{display:flex;min-width:0;align-items:center;gap:18px}
.toolbar-title{display:flex;min-width:140px;flex-direction:column;gap:3px;padding-right:18px;border-right:1px solid #e0eaf0}
.toolbar-title b{color:#21495e;font-size:17px;line-height:1.2}
.toolbar-title span{color:#8ba0aa;font-size:11px;white-space:nowrap}
.month-switch{gap:7px}
.month-switch b{min-width:119px;color:#22495e;font-size:16px;white-space:nowrap}
.month-switch button,.mode-switch button{height:36px;border-color:#d2e2e9;border-radius:6px;transition:background .18s ease,border-color .18s ease,color .18s ease,transform .18s ease}
.month-switch button:hover,.mode-switch button:not(.active):hover{color:#138eac;background:#eaf7fa;border-color:#8bd0df}
.month-switch button:active,.mode-switch button:active{transform:translateY(1px)}
.month-switch button.today{margin-left:5px;color:#138aa7;background:#eaf7fa;border-color:#cae6ed;font-weight:700}
.filters{gap:10px}
.filters>input,.filters select{height:36px;border-color:#d0e0e8;border-radius:6px;font-size:12px}
.filters>input{width:205px;padding-left:12px}
.filters label{gap:7px;color:#718b98;font-size:12px;white-space:nowrap}
.filters>input:focus,.filters select:focus{border-color:#24a3bf;box-shadow:0 0 0 3px #1d9fbb1d}
.mode-switch{padding:3px;border:1px solid #d6e5eb;border-radius:7px;background:#f2f7f9}
.mode-switch button,.mode-switch button:first-child,.mode-switch button:last-child{height:30px;min-width:46px;margin:0;padding:0 12px;border:0;border-radius:5px;background:transparent;font-size:12px}
.mode-switch button.active{color:#fff;background:#168eac;box-shadow:0 2px 7px #168eac33}

.calendar-layout{gap:13px;grid-template-columns:minmax(0,1fr) 350px}
.calendar-panel,.daily-panel,.plan-list-panel{border-color:#d5e3ea;border-radius:10px;box-shadow:0 5px 18px #153c4e0d}
.calendar-panel{grid-template-rows:46px minmax(0,1fr)}
.weekday{background:#f5f9fb;border-color:#dce8ed}
.weekday b{color:#708997;font-size:12px;font-weight:700;letter-spacing:.04em}
.weekday b:nth-last-child(-n+2){color:#8b9da7}
.calendar-grid{grid-template-rows:repeat(var(--week-count),minmax(0,1fr))}
.day-cell{padding:10px 9px;border-color:#e5edf1;transition:background .18s ease,box-shadow .18s ease}
.day-cell:hover{background:#f4fafc}
.day-cell.muted{color:#b0c0c8;background:#f9fbfc}
.day-cell.muted:hover{background:#f1f6f8}
.day-cell.selected,.day-cell.selected:hover{z-index:1;background:#eef9fc;box-shadow:inset 0 0 0 2px #31a9c4}
.day-cell .day-cell__heading{display:flex;height:29px;align-items:flex-start;justify-content:space-between;gap:4px;font-size:14px}
.day-cell.today>.day-cell__heading{display:flex;width:auto;height:29px;margin:0;border-radius:0;color:inherit;background:transparent}
.day-cell__heading strong{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;font-size:13px;font-weight:700}
.day-cell.today .day-cell__heading strong{color:#fff;background:#169fbb}
.day-cell__heading small{padding:3px 6px;border-radius:10px;color:#47839a;background:#eaf4f7;font-size:10px;font-weight:700;white-space:nowrap}
.day-cell.muted .day-cell__heading small{display:none}
.day-cell>i{display:flex;min-width:0;align-items:center;gap:7px;margin-top:5px;padding:6px 7px;border-left-width:3px;border-radius:4px;font-size:11px;line-height:1.2}
.day-cell>i em{flex:none;margin:0;font-size:10px;font-weight:700}
.day-cell>i span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.day-cell>small.day-cell__more{margin:6px 0 0 4px;color:#5b8393;font-size:11px;font-weight:600}

.daily-panel>header{height:83px;flex:none;padding:0 18px;border-color:#e0ebef;background:linear-gradient(110deg,#f5fbfd,#fff)}
.daily-panel header span{margin:0;color:#72909e;font-size:11px;font-weight:700;letter-spacing:.04em}
.daily-panel header b{margin-top:6px;color:#1d475c;font-size:20px;line-height:1.1}
.daily-panel header b small{margin-left:5px;color:#6b8a99;font-size:12px;font-weight:600}
.daily-panel header>em{padding:6px 9px;border-radius:12px;color:#138ba9;background:#e4f5f9;font-size:12px;font-weight:700}
.daily-list{padding:13px}
.daily-list article{display:block;margin-bottom:10px;padding:14px;border:1px solid #e0ebf0;border-left:3px solid #39a5bd;border-radius:7px;background:#fbfdfe;transition:border-color .18s ease,box-shadow .18s ease}
.daily-list article:hover{border-color:#a9dce7;box-shadow:0 4px 13px #1b78931c}
.daily-list__top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
.daily-list time{color:#168eac;font-size:13px}
.daily-list article>b,.daily-list article>span,.daily-list article>small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daily-list article>b{color:#254c61;font-size:13px;line-height:1.4}
.daily-list article>span{margin-top:6px;color:#698491;font-size:11px}
.daily-list article>small{margin-top:4px;color:#90a4ae;font-size:10px}
.daily-list .daily-list__top>em{padding:4px 8px;border-radius:12px;color:#657d88;background:#edf2f4;font-size:10px;font-style:normal;white-space:nowrap}
.daily-list .daily-list__top>em.pending{color:#916f23;background:#fff3d4}
.daily-list .daily-list__top>em.running{color:#157a91;background:#ddf3f8}
.daily-list .daily-list__top>em.done{color:#1c785b;background:#def5ea}
.daily-panel>footer{padding:11px 15px;color:#728c99;background:#f7fafb;font-size:11px}
.daily-list .empty{display:flex;min-height:260px;flex-direction:column;align-items:center;justify-content:center;gap:7px;text-align:center}
.daily-list .empty i{display:grid;width:46px;height:46px;place-items:center;margin-bottom:3px;border:1px solid #d6e9ee;border-radius:50%;color:#3a9fba;background:#edf8fa;font-size:24px;font-style:normal}
.daily-list .empty b{color:#5b7988;font-size:14px}
.daily-list .empty span{color:#9baeb7;font-size:11px}

.plan-list-panel{grid-template-rows:48px minmax(0,1fr)}
.plan-list-panel>header{padding:0 19px;font-size:12px}
.plan-list-panel article{min-height:70px;padding:0 19px;font-size:12px}
.plan-list-panel article:hover{background:#f7fbfd}
.plan-list-panel article b{font-size:13px}
.plan-list-panel article small{font-size:10px}
@media(max-width:1500px){.toolbar{flex-wrap:wrap}.toolbar-leading,.filters{width:100%}.filters{justify-content:flex-end}.calendar-layout{grid-template-columns:minmax(0,1fr) 315px}}
@media(max-width:1280px){.filters>input{display:block}.day-cell{padding:7px 5px}.day-cell>i{gap:4px;padding:5px 4px;font-size:10px}.day-cell>i em{font-size:9px}}
@media(max-width:980px){.calendar-layout{grid-template-columns:1fr;grid-template-rows:minmax(400px,1fr) 240px;overflow:auto}.daily-panel{display:flex}.daily-list{padding:8px}.daily-list .empty{min-height:130px}.filters{flex-wrap:wrap;justify-content:flex-start}.filters label{display:flex}}
</style>
