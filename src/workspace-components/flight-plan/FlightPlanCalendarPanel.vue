<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getFlightPlans } from '@/api/patrol'
import { useUserStore } from '@/stores/user'
import type { FlightPlanItem } from '@/mocks/route-planning'

const user = useUserStore()
const plans = ref<FlightPlanItem[]>([])
const loading = ref(false)
const error = ref('')
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
function statusLabel(status?: number) {
  if (status === undefined) return '状态未返回'
  return statusMeta[status]?.label || `状态 ${status}`
}
function statusTone(status?: number) {
  return status === undefined ? 'unknown' : statusMeta[status]?.tone || 'unknown'
}
function planTime(plan: FlightPlanItem) {
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
const unscheduledCount = computed(() => filteredPlans.value.filter((plan) => !/^\d{4}-\d{2}-\d{2}$/.test(plan.date)).length)
const selectedPlans = computed(() => filteredPlans.value.filter((plan) => plan.date === selectedDate.value)
  .sort((left, right) => left.start.localeCompare(right.start)))
const calendarDays = computed(() => {
  const first = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
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

async function loadPlans() {
  loading.value = true
  error.value = ''
  try {
    const first = await getFlightPlans({ pageNum: 1, pageSize: 200, deptId: user.activeDeptId })
    const all = [...first.list]
    const pageCount = Math.ceil(first.total / 200)
    for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
      const page = await getFlightPlans({ pageNum, pageSize: 200, deptId: user.activeDeptId })
      all.push(...page.list)
    }
    plans.value = all
  } catch (reason) {
    plans.value = []
    error.value = reason instanceof Error ? reason.message : '飞行计划读取失败。'
  } finally {
    loading.value = false
  }
}

onMounted(() => void loadPlans())
</script>

<template>
  <div class="flight-plan-calendar">
    <section class="metric-grid">
      <article><span>本月计划</span><b>{{ monthlyStats.total }}<small>架次</small></b><em>来自飞行计划接口</em></article>
      <article><span>待执行</span><b>{{ monthlyStats.pending }}<small>架次</small></b><em>等待计划起飞</em></article>
      <article><span>执行中</span><b>{{ monthlyStats.running }}<small>架次</small></b><em>当前执行计划</em></article>
      <article><span>已完成</span><b>{{ monthlyStats.done }}<small>架次</small></b><em>本月完成计划</em></article>
    </section>

    <section class="toolbar">
      <div class="month-switch"><button @click="moveMonth(-1)">‹</button><b>{{ monthTitle }}</b><button @click="moveMonth(1)">›</button><button class="today" @click="goToday">今天</button></div>
      <div class="filters"><input v-model="keyword" placeholder="搜索计划、航线或设备" /><label>执行状态<select v-model="statusFilter"><option value="">全部状态</option><option v-for="status in availableStatuses" :key="status" :value="status">{{ statusLabel(status) }}</option></select></label><label>执行设备<select v-model="deviceFilter"><option value="">全部设备</option><option v-for="device in availableDevices" :key="device" :value="device">{{ device }}</option></select></label><div class="mode-switch"><button :class="{ active: displayMode === 'calendar' }" @click="displayMode = 'calendar'">日历</button><button :class="{ active: displayMode === 'list' }" @click="displayMode = 'list'">列表</button></div></div>
    </section>

    <div v-if="loading" class="state-layer">正在读取真实飞行计划…</div>
    <div v-else-if="error" class="state-layer error"><span>{{ error }}</span><button @click="loadPlans">重新读取</button></div>
    <section v-else-if="displayMode === 'calendar'" class="calendar-layout">
      <div class="calendar-panel">
        <div class="weekday"><b v-for="day in ['周一','周二','周三','周四','周五','周六','周日']" :key="day">{{ day }}</b></div>
        <div class="calendar-grid">
          <button v-for="day in calendarDays" :key="day.key" class="day-cell" :class="{ muted: !day.currentMonth, selected: selectedDate === day.key, today: day.today }" @click="selectDay(day.key)">
            <span>{{ day.day }}</span>
            <i v-for="plan in day.plans.slice(0,3)" :key="plan.id" :class="statusTone(plan.status)"><em>{{ planTime(plan) }}</em>{{ plan.title }}</i>
            <small v-if="day.plans.length > 3">另有 {{ day.plans.length - 3 }} 项计划</small>
          </button>
        </div>
      </div>
      <aside class="daily-panel"><header><div><b>{{ selectedDate.replace(/-/g, ' / ') }}</b><span>当日计划</span></div><em>{{ selectedPlans.length }} 项</em></header><div class="daily-list"><article v-for="plan in selectedPlans" :key="plan.id"><time>{{ planTime(plan) }}</time><i :class="statusTone(plan.status)"></i><div><b>{{ plan.title }}</b><span>{{ plan.area }}</span><small>{{ plan.sn || '未返回设备 SN' }}<template v-if="plan.deviceType"> · {{ plan.deviceType }}</template></small></div><em :class="statusTone(plan.status)">{{ statusLabel(plan.status) }}</em></article><div v-if="!selectedPlans.length" class="empty">当日暂无飞行计划</div></div><footer>未解析到执行日期的计划：{{ unscheduledCount }} 项</footer></aside>
    </section>

    <section v-else class="plan-list-panel"><header><span>计划名称</span><span>执行时间</span><span>航线</span><span>设备</span><span>状态</span></header><div><article v-for="plan in filteredPlans" :key="plan.id"><span><b>{{ plan.title }}</b><small>ID：{{ plan.id }}</small></span><span>{{ plan.date || '日期未返回' }} {{ planTime(plan) }}</span><span>{{ plan.area }}</span><span>{{ plan.sn || '-' }}<small>{{ plan.deviceType || '' }}</small></span><span><em :class="statusTone(plan.status)">{{ statusLabel(plan.status) }}</em></span></article><div v-if="!filteredPlans.length" class="empty">暂无符合条件的飞行计划</div></div></section>
  </div>
</template>

<style scoped lang="scss">
.flight-plan-calendar{height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:14px;background:#edf3f6;color:#193e53}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric-grid article{min-height:82px;box-sizing:border-box;padding:13px 17px;background:#fff;border:1px solid #d3e0e6;border-radius:7px;box-shadow:0 2px 8px #163b4d0b}.metric-grid span,.metric-grid em{display:block;color:#708995;font-size:11px;font-style:normal}.metric-grid b{display:inline-block;margin-top:8px;font-size:26px}.metric-grid b small{margin-left:4px;font-size:11px}.metric-grid em{float:right;margin-top:15px;color:#40918d}.toolbar{min-height:54px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 12px;background:#fff;border:1px solid #d3e0e6;border-radius:7px}.month-switch,.filters,.filters label,.mode-switch{display:flex;align-items:center}.month-switch{gap:10px}.month-switch button,.mode-switch button{height:34px;min-width:34px;color:#496978;background:#f7fafb;border:1px solid #ccdae1;border-radius:4px;cursor:pointer}.month-switch b{min-width:100px;text-align:center}.month-switch button.today{padding:0 12px}.filters{gap:12px}.filters>input,.filters select{height:34px;box-sizing:border-box;padding:0 9px;color:#3f6171;background:#fff;border:1px solid #cadbe2;border-radius:4px;outline:none}.filters>input{width:190px}.filters label{gap:6px;color:#66818f;font-size:11px}.mode-switch{margin-left:2px}.mode-switch button{padding:0 12px;border-radius:0}.mode-switch button:first-child{border-radius:4px 0 0 4px}.mode-switch button:last-child{margin-left:-1px;border-radius:0 4px 4px 0}.mode-switch button.active{color:#fff;background:#168dab;border-color:#168dab}.state-layer{flex:1;display:grid;place-items:center;color:#728a96;background:#fff;border:1px solid #d2e0e6;border-radius:7px}.state-layer.error{align-content:center;gap:10px;color:#b44552}.state-layer button{padding:7px 12px;color:#fff;background:#168dab;border:0;border-radius:4px;cursor:pointer}.calendar-layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px}.calendar-panel,.daily-panel,.plan-list-panel{min-height:0;background:#fff;border:1px solid #d1dfe6;border-radius:7px;overflow:hidden}.calendar-panel{display:grid;grid-template-rows:43px minmax(0,1fr)}.weekday{display:grid;grid-template-columns:repeat(7,1fr);background:#f4f7f9;border-bottom:1px solid #d7e3e9}.weekday b{display:grid;place-items:center;color:#708692;font-size:12px}.calendar-grid{min-height:0;display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(6,1fr)}.day-cell{position:relative;min-width:0;min-height:0;overflow:hidden;padding:8px 7px;color:#355669;background:#fff;border:0;border-right:1px solid #dfe8ec;border-bottom:1px solid #dfe8ec;text-align:left;cursor:pointer}.day-cell:nth-child(7n){border-right:0}.day-cell.muted{color:#aab9c0;background:#fafcfd}.day-cell.selected{box-shadow:inset 0 0 0 2px #18a0bd;background:#f3fbfd}.day-cell.today>span{display:grid;width:25px;height:25px;place-items:center;margin:-3px 0 3px -3px;color:#fff;background:#18a0bd;border-radius:50%}.day-cell>span{display:block;height:22px;font-size:11px;font-weight:700}.day-cell>i{display:block;overflow:hidden;margin:3px 0 0;padding:4px 5px;color:#367187;background:#e3f4f7;border-left:3px solid #22a7c3;font-size:9px;font-style:normal;text-overflow:ellipsis;white-space:nowrap}.day-cell>i em{margin-right:5px;font-style:normal}.day-cell>i.pending{color:#856a27;background:#fff5d9;border-color:#e6b747}.day-cell>i.running{color:#247389;background:#e2f5f9;border-color:#18a4c2}.day-cell>i.done{color:#2f775e;background:#e3f5ed;border-color:#2cad7e}.day-cell>i.cancelled,.day-cell>i.failed{color:#8b6570;background:#f5e9ed;border-color:#b78191}.day-cell>small{display:block;margin-top:4px;color:#8096a0;font-size:9px}.daily-panel{display:flex;flex-direction:column}.daily-panel>header{height:55px;display:flex;align-items:center;justify-content:space-between;padding:0 15px;border-bottom:1px solid #d8e4e9}.daily-panel header b,.daily-panel header span{display:block}.daily-panel header b{font-size:15px}.daily-panel header span{margin-top:3px;color:#7c929c;font-size:10px}.daily-panel header>em{color:#718a96;font-size:11px;font-style:normal}.daily-list{flex:1;min-height:0;overflow:auto;padding:0 13px}.daily-list article{display:grid;grid-template-columns:44px 10px minmax(0,1fr) auto;align-items:start;gap:8px;padding:15px 0;border-bottom:1px solid #e3eaee}.daily-list time{color:#315b70;font-size:11px;font-weight:700}.daily-list>article>i{width:8px;height:8px;margin-top:2px;background:#8ca0aa;border-radius:50%}.daily-list>article>i.pending{background:#e6b747}.daily-list>article>i.running{background:#17a5c3}.daily-list>article>i.done{background:#29ac7c}.daily-list article div b,.daily-list article div span,.daily-list article div small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.daily-list article div b{font-size:12px}.daily-list article div span{margin-top:5px;color:#6c8490;font-size:10px}.daily-list article div small{margin-top:3px;color:#8a9da6;font-size:9px}.daily-list article>em,.plan-list-panel article>span>em{padding:4px 6px;color:#657d88;background:#edf2f4;border-radius:9px;font-size:9px;font-style:normal}.daily-list article>em.pending,.plan-list-panel em.pending{color:#8b691e;background:#fff3cd}.daily-list article>em.running,.plan-list-panel em.running{color:#14758d;background:#dcf3f8}.daily-list article>em.done,.plan-list-panel em.done{color:#197155;background:#dcf4e9}.daily-panel>footer{padding:10px 14px;color:#7e929c;background:#f7fafb;border-top:1px solid #dce6eb;font-size:10px}.empty{min-height:130px;display:grid;place-items:center;color:#8498a2;font-size:12px}.plan-list-panel{flex:1;display:grid;grid-template-rows:42px minmax(0,1fr)}.plan-list-panel>header,.plan-list-panel article{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr .7fr;align-items:center}.plan-list-panel>header{padding:0 15px;color:#657f8c;background:#f1f6f8;border-bottom:1px solid #d5e2e8;font-size:11px;font-weight:700}.plan-list-panel>div{min-height:0;overflow:auto}.plan-list-panel article{min-height:58px;padding:0 15px;border-bottom:1px solid #e1eaee;font-size:11px}.plan-list-panel article>span{min-width:0;padding-right:10px}.plan-list-panel article b,.plan-list-panel article small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plan-list-panel article b{font-size:12px}.plan-list-panel article small{margin-top:4px;color:#80949e;font-size:9px}@media(max-width:1280px){.calendar-layout{grid-template-columns:minmax(0,1fr) 310px}.filters>input{display:none}.flight-plan-calendar{padding:10px}.day-cell{padding:5px 4px}.day-cell>i{padding-inline:3px}}@media(max-width:980px){.metric-grid{grid-template-columns:repeat(2,1fr)}.calendar-layout{grid-template-columns:1fr}.daily-panel{display:none}.filters label{display:none}}
</style>
