<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const model = defineModel<string[]>({ default: () => [] })
const props = withDefaults(defineProps<{ theme?: 'dark' | 'light' }>(), { theme: 'dark' })

const popoverVisible = ref(false)
const visibleMonth = ref(firstDayOfMonth(new Date()))
const startDate = ref('')
const endDate = ref('')
const startTime = ref('08:00')
const endTime = ref('18:00')
let isApplyingModel = false

const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const hours = Array.from({ length: 24 }, (_, value) => String(value).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, value) => String(value).padStart(2, '0'))

function firstDayOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function toDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normaliseTime(value?: string, fallback = '00:00') {
  return /^\d{2}:\d{2}/.test(value || '') ? value!.slice(0, 5) : fallback
}

function hydrate(values: string[] = []) {
  const [start, end] = values
  startDate.value = start?.slice(0, 10) || ''
  endDate.value = end?.slice(0, 10) || ''
  startTime.value = normaliseTime(start?.slice(11), '08:00')
  endTime.value = normaliseTime(end?.slice(11), '18:00')
  const anchor = startDate.value || endDate.value
  if (anchor) visibleMonth.value = firstDayOfMonth(new Date(`${anchor}T00:00:00`))
}

watch(model, (values) => {
  if (isApplyingModel) {
    isApplyingModel = false
    return
  }
  hydrate(values || [])
}, { immediate: true, deep: true })

const monthLabel = computed(() => `${visibleMonth.value.getFullYear()} 年 ${visibleMonth.value.getMonth() + 1} 月`)
const dateStartText = computed(() => startDate.value ? startDate.value.replace(/-/g, '/') : '开始日期')
const dateEndText = computed(() => endDate.value ? endDate.value.replace(/-/g, '/') : '结束日期')
const startDateTimeText = computed(() => startDate.value ? `${dateStartText.value} ${startTime.value}` : '开始时间')
const endDateTimeText = computed(() => endDate.value ? `${dateEndText.value} ${endTime.value}` : '结束时间')
const hasCompleteRange = computed(() => Boolean(startDate.value && endDate.value))
const rangeIsValid = computed(() => {
  if (!hasCompleteRange.value) return false
  return `${startDate.value}T${startTime.value}` <= `${endDate.value}T${endTime.value}`
})
const rangeHint = computed(() => {
  if (!startDate.value) return '请选择开始日期'
  if (!endDate.value) return '请选择结束日期'
  if (!rangeIsValid.value) return '结束时间不能早于开始时间'
  return `${dateStartText.value} ${startTime.value} 至 ${dateEndText.value} ${endTime.value}`
})

const calendarDays = computed(() => {
  const month = visibleMonth.value
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const begin = new Date(first)
  begin.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(begin)
    day.setDate(begin.getDate() + index)
    return { key: toDateKey(day), label: day.getDate(), isCurrentMonth: day.getMonth() === month.getMonth() }
  })
})

function applyModel() {
  isApplyingModel = true
  if (!rangeIsValid.value) {
    model.value = []
    return
  }
  model.value = [`${startDate.value}T${startTime.value}:00`, `${endDate.value}T${endTime.value}:00`]
}

function selectDate(value: string) {
  if (!startDate.value || endDate.value) {
    startDate.value = value
    endDate.value = ''
  } else if (value < startDate.value) {
    endDate.value = startDate.value
    startDate.value = value
  } else {
    endDate.value = value
  }
  applyModel()
}

function isInRange(value: string) {
  return Boolean(startDate.value && endDate.value && value > startDate.value && value < endDate.value)
}

function moveMonth(offset: number) {
  visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + offset, 1)
}

function moveYear(offset: number) {
  visibleMonth.value = new Date(visibleMonth.value.getFullYear() + offset, visibleMonth.value.getMonth(), 1)
}

function handleMonthWheel(event: WheelEvent) {
  moveMonth(event.deltaY > 0 ? 1 : -1)
}

function setTime(target: 'start' | 'end', part: 'hour' | 'minute', event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const current = target === 'start' ? startTime : endTime
  const [hour = '00', minute = '00'] = current.value.split(':')
  current.value = part === 'hour' ? `${value}:${minute}` : `${hour}:${value}`
  applyModel()
}

function timePart(target: 'start' | 'end', part: 'hour' | 'minute') {
  const value = target === 'start' ? startTime.value : endTime.value
  return value.split(':')[part === 'hour' ? 0 : 1]
}

function clearSchedule() {
  startDate.value = ''
  endDate.value = ''
  startTime.value = '08:00'
  endTime.value = '18:00'
  applyModel()
}

function useCurrentRange() {
  const now = new Date()
  const later = new Date(now.getTime() + 60 * 60 * 1000)
  startDate.value = toDateKey(now)
  endDate.value = toDateKey(later)
  startTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  endTime.value = `${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`
  visibleMonth.value = firstDayOfMonth(now)
  applyModel()
}

function confirmSchedule() {
  if (!rangeIsValid.value) return
  applyModel()
  popoverVisible.value = false
}
</script>

<template>
  <div class="task-schedule-picker" :class="`is-${props.theme}`">
    <el-popover v-model:visible="popoverVisible" trigger="click" placement="bottom-start" :width="548" :popper-class="props.theme === 'light' ? 'task-schedule-popper task-schedule-popper--light' : 'task-schedule-popper'">
      <template #reference>
        <div class="schedule-trigger-group">
          <button type="button" class="schedule-trigger">
            <span class="schedule-trigger-icon">◷</span><span class="schedule-trigger-start">{{ startDateTimeText }}</span><span class="schedule-trigger-separator">-</span><span class="schedule-trigger-end">{{ endDateTimeText }}</span><span class="schedule-trigger-arrow">⌄</span>
          </button>
        </div>
      </template>

      <section class="schedule-range-panel">
        <div class="schedule-calendar" @wheel.prevent="handleMonthWheel">
          <div class="schedule-calendar__header">
            <button type="button" class="calendar-nav calendar-nav--year" title="上一年" @click="moveYear(-1)">‹‹</button><button type="button" class="calendar-nav" title="上个月" @click="moveMonth(-1)">‹</button><strong>{{ monthLabel }}</strong><button type="button" class="calendar-nav" title="下个月" @click="moveMonth(1)">›</button><button type="button" class="calendar-nav calendar-nav--year" title="下一年" @click="moveYear(1)">››</button>
          </div>
          <div class="schedule-calendar__weekdays"><span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span></div>
          <div class="schedule-calendar__days">
            <button v-for="day in calendarDays" :key="day.key" type="button" :class="{ 'is-other-month': !day.isCurrentMonth, 'is-range-start': day.key === startDate, 'is-range-end': day.key === endDate, 'is-in-range': isInRange(day.key) }" @click="selectDate(day.key)">{{ day.label }}</button>
          </div>
        </div>

        <aside class="schedule-time-panel">
          <strong>选择时间</strong>
          <div v-for="target in ['start', 'end'] as const" :key="target" class="range-time-row">
            <span>{{ target === 'start' ? '开始时间' : '结束时间' }}</span>
            <div>
              <select :value="timePart(target, 'hour')" :aria-label="`${target === 'start' ? '开始' : '结束'}小时`" @change="setTime(target, 'hour', $event)"><option v-for="hour in hours" :key="hour" :value="hour">{{ hour }}</option></select><b>:</b><select :value="timePart(target, 'minute')" :aria-label="`${target === 'start' ? '开始' : '结束'}分钟`" @change="setTime(target, 'minute', $event)"><option v-for="minute in minutes" :key="minute" :value="minute">{{ minute }}</option></select>
            </div>
            <em>{{ target === 'start' ? (dateStartText === '开始日期' ? '待选择日期' : dateStartText) : (dateEndText === '结束日期' ? '待选择日期' : dateEndText) }}</em>
          </div>
          <p :class="{ invalid: startDate && endDate && !rangeIsValid }">{{ rangeHint }}</p>
        </aside>

        <footer class="schedule-range-panel__footer">
          <button type="button" @click="clearSchedule">清空</button><span></span><button type="button" @click="useCurrentRange">现在</button><button type="button" class="calendar-confirm" :disabled="!rangeIsValid" @click="confirmSchedule">确认</button>
        </footer>
      </section>
    </el-popover>
  </div>
</template>

<style lang="scss">
.task-schedule-picker{width:100%}.schedule-trigger-group{display:block}.schedule-trigger{width:100%;min-width:0;min-height:38px;display:grid;grid-template-columns:18px minmax(0,1fr) 16px minmax(0,1fr) 14px;align-items:center;column-gap:7px;padding:8px 10px;color:#d8f5fb;text-align:left;background:#03182d;border:1px solid #155a7e;cursor:pointer;font:inherit}.schedule-trigger:hover,.schedule-trigger:focus-visible{border-color:#28a7db;background:#063452;outline:none}.schedule-trigger-icon{color:#47cbed}.schedule-trigger-start,.schedule-trigger-end{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.schedule-trigger-start{text-align:left}.schedule-trigger-end{text-align:right}.schedule-trigger-separator{color:#a7ccda;text-align:center}.schedule-trigger-arrow{color:#77b7ca;text-align:right}
.task-schedule-popper.el-popper{padding:0!important;color:#d7eff8;background:#282832!important;border:1px solid #4a4a56!important;border-radius:8px!important;box-shadow:0 14px 34px #0009!important}.task-schedule-popper.el-popper .el-popper__arrow::before{background:#282832!important;border-color:#4a4a56!important}.schedule-range-panel{display:grid;grid-template-columns:minmax(0,1fr) 205px;user-select:none}.schedule-calendar{padding:14px 15px 10px}.schedule-calendar__header{display:grid;grid-template-columns:30px 28px 1fr 28px 30px;align-items:center;gap:3px;margin-bottom:12px}.schedule-calendar__header strong{text-align:center;font-size:15px}.calendar-nav{height:27px;padding:0;color:#b9dce9;background:transparent;border:0;border-radius:4px;cursor:pointer;font-size:22px;line-height:1}.calendar-nav:hover{color:#3bd5ef;background:#183b4f}.calendar-nav--year{font-size:15px}.schedule-calendar__weekdays,.schedule-calendar__days{display:grid;grid-template-columns:repeat(7,1fr);text-align:center}.schedule-calendar__weekdays{margin-bottom:5px;padding-bottom:7px;color:#bed5df;border-bottom:1px solid #3d3d49;font-size:12px}.schedule-calendar__days button{height:32px;padding:0;color:#edf8fc;background:transparent;border:0;cursor:pointer;font-size:13px}.schedule-calendar__days button:hover{color:#fff;background:#1e6986;border-radius:4px}.schedule-calendar__days button.is-other-month{color:#777985}.schedule-calendar__days button.is-in-range{color:#fff;background:#275d73}.schedule-calendar__days button.is-range-start,.schedule-calendar__days button.is-range-end{color:#fff;background:#168fb4;border-radius:16px;font-weight:700}
.schedule-time-panel{padding:15px 14px;background:#22222b;border-left:1px solid #41414c}.schedule-time-panel>strong{display:block;margin-bottom:12px;font-size:14px}.range-time-row{margin-bottom:14px}.range-time-row>span,.range-time-row>em{display:block}.range-time-row>span{margin-bottom:6px;color:#a9c2cc;font-size:12px}.range-time-row>div{display:grid;grid-template-columns:1fr 12px 1fr;align-items:center;gap:4px}.range-time-row select{width:100%;height:34px;padding:0 7px;color:#e7f6fa;background:#30303a;border:1px solid #51515e;border-radius:4px;outline:none}.range-time-row select:focus{border-color:#27b8d7}.range-time-row b{text-align:center}.range-time-row>em{margin-top:5px;color:#758f9a;font-size:11px;font-style:normal}.schedule-time-panel>p{margin:6px 0 0;padding:8px;color:#81cedd;background:#163642;border-radius:4px;font-size:11px;line-height:1.45}.schedule-time-panel>p.invalid{color:#ff9a9f;background:#4b292d}
.schedule-range-panel__footer{grid-column:1/-1;display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:9px;padding:10px 14px;border-top:1px solid #41414c}.schedule-range-panel__footer button{min-width:58px;height:31px;padding:0 12px;color:#d9edf4;background:transparent;border:1px solid #545461;border-radius:4px;cursor:pointer}.schedule-range-panel__footer button:hover{border-color:#2eb6d5}.schedule-range-panel__footer .calendar-confirm{color:#fff;background:#168fb4;border-color:#2dbdd8;font-weight:600}.schedule-range-panel__footer .calendar-confirm:disabled{color:#7e939c;background:#30343b;border-color:#454b52;cursor:not-allowed}
.task-schedule-picker.is-light .schedule-trigger{color:#29475a;background:#fbfdfe;border-color:#c8dae4;border-radius:4px}.task-schedule-picker.is-light .schedule-trigger:hover,.task-schedule-picker.is-light .schedule-trigger:focus-visible{color:#fff;background:#075273;border-color:#1599c1;box-shadow:0 0 0 2px #189abd1c}.task-schedule-picker.is-light .schedule-trigger-icon{color:#1599c1}.task-schedule-picker.is-light .schedule-trigger:hover .schedule-trigger-icon,.task-schedule-picker.is-light .schedule-trigger:focus-visible .schedule-trigger-icon,.task-schedule-picker.is-light .schedule-trigger:hover .schedule-trigger-separator,.task-schedule-picker.is-light .schedule-trigger:focus-visible .schedule-trigger-separator,.task-schedule-picker.is-light .schedule-trigger:hover .schedule-trigger-arrow,.task-schedule-picker.is-light .schedule-trigger:focus-visible .schedule-trigger-arrow{color:#fff}.task-schedule-picker.is-light .schedule-trigger-separator{color:#7f96a3}.task-schedule-picker.is-light .schedule-trigger-arrow{color:#668696}
.task-schedule-popper--light.el-popper{color:#29475a;background:#fff!important;border-color:#35a9c7!important;box-shadow:0 14px 38px #08364b47!important}.task-schedule-popper--light.el-popper .el-popper__arrow::before{background:#fff!important;border-color:#35a9c7!important}.task-schedule-popper--light .schedule-calendar__header strong{color:#24485d}.task-schedule-popper--light .calendar-nav{color:#58798a}.task-schedule-popper--light .calendar-nav:hover{color:#087fa4;background:#e8f5f8}.task-schedule-popper--light .schedule-calendar__weekdays{color:#718895;border-color:#e1ebef}.task-schedule-popper--light .schedule-calendar__days button{color:#35576a}.task-schedule-popper--light .schedule-calendar__days button:hover{color:#fff;background:#1796b7}.task-schedule-popper--light .schedule-calendar__days button.is-other-month{color:#b6c3c9}.task-schedule-popper--light .schedule-calendar__days button.is-in-range{color:#147896;background:#e0f2f7}.task-schedule-popper--light .schedule-calendar__days button.is-range-start,.task-schedule-popper--light .schedule-calendar__days button.is-range-end{color:#fff;background:#0c91b8}.task-schedule-popper--light .schedule-time-panel{background:#f6fafb;border-color:#d6e4ea}.task-schedule-popper--light .schedule-time-panel>strong{color:#24485d}.task-schedule-popper--light .range-time-row>span{color:#607987}.task-schedule-popper--light .range-time-row select{color:#29475a;background:#fff;border-color:#bfd4de}.task-schedule-popper--light .range-time-row select:hover,.task-schedule-popper--light .range-time-row select:focus{color:#fff;background:#075273;border-color:#1599c1}.task-schedule-popper--light .range-time-row select option{color:#29475a;background:#fff}.task-schedule-popper--light .range-time-row>em{color:#8297a2}.task-schedule-popper--light .schedule-time-panel>p{color:#087f9e;background:#e3f4f8}.task-schedule-popper--light .schedule-time-panel>p.invalid{color:#b94c55;background:#fff0f1}.task-schedule-popper--light .schedule-range-panel__footer{background:#f3f8fa;border-color:#c8dae2}.task-schedule-popper--light .schedule-range-panel__footer button{color:#537481;background:#fff;border-color:#bfd3dc}.task-schedule-popper--light .schedule-range-panel__footer .calendar-confirm{color:#fff;background:#168fad;border-color:#168fad}.task-schedule-popper--light .schedule-range-panel__footer .calendar-confirm:disabled{color:#93a5ae;background:#eef3f5;border-color:#d7e1e6}
@media(max-width:640px){.schedule-trigger-group{grid-template-columns:1fr}.schedule-range-panel{grid-template-columns:1fr}.schedule-time-panel{border-top:1px solid #41414c;border-left:0}.task-schedule-popper.el-popper{max-width:calc(100vw - 16px)}}
</style>
