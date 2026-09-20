<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const model = defineModel<string[]>({ default: () => [] })

const datePopoverVisible = ref(false)
const timePopoverVisible = ref(false)
const visibleMonth = ref(firstDayOfMonth(new Date()))
const startDate = ref('')
const endDate = ref('')
const startTime = ref('08:00')
const endTime = ref('18:00')
let isApplyingModel = false

const weekdays = ['日', '一', '二', '三', '四', '五', '六']
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

function normaliseTime(value?: string) {
  return /^\d{2}:\d{2}/.test(value || '') ? value!.slice(0, 5) : '00:00'
}

function hydrate(values: string[] = []) {
  const [start, end] = values
  startDate.value = start?.slice(0, 10) || ''
  endDate.value = end?.slice(0, 10) || ''
  startTime.value = normaliseTime(start?.slice(11))
  endTime.value = normaliseTime(end?.slice(11))
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
const timeDisabled = computed(() => !startDate.value || !endDate.value)
const dateStartText = computed(() => startDate.value ? startDate.value.replace(/-/g, '/') : '开始日期')
const dateEndText = computed(() => endDate.value ? endDate.value.replace(/-/g, '/') : '结束日期')

const calendarDays = computed(() => {
  const month = visibleMonth.value
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const begin = new Date(first)
  begin.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(begin)
    day.setDate(begin.getDate() + index)
    return {
      key: toDateKey(day),
      label: day.getDate(),
      isCurrentMonth: day.getMonth() === month.getMonth(),
    }
  })
})

function applyModel() {
  isApplyingModel = true
  if (!startDate.value || !endDate.value) {
    model.value = []
    return
  }
  model.value = [
    `${startDate.value}T${startTime.value}:00`,
    `${endDate.value}T${endTime.value}:00`,
  ]
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

function setTime(target: 'start' | 'end', part: 'hour' | 'minute', value: string) {
  const current = target === 'start' ? startTime : endTime
  const [hour, minute] = current.value.split(':')
  current.value = part === 'hour' ? `${value}:${minute}` : `${hour}:${value}`
  applyModel()
}

function isTimeSelected(target: 'start' | 'end', part: 'hour' | 'minute', value: string) {
  const current = target === 'start' ? startTime.value : endTime.value
  return current.split(':')[part === 'hour' ? 0 : 1] === value
}

function clearSchedule() {
  startDate.value = ''
  endDate.value = ''
  startTime.value = '08:00'
  endTime.value = '18:00'
  isApplyingModel = true
  model.value = []
}
</script>

<template>
  <div class="task-schedule-picker">
    <el-popover v-model:visible="datePopoverVisible" trigger="click" placement="bottom-start" :width="318" popper-class="task-calendar-popper">
      <template #reference>
        <button type="button" class="schedule-trigger schedule-date-trigger">
          <span class="schedule-trigger-icon">▣</span>
          <span class="schedule-trigger-start">{{ dateStartText }}</span>
          <span class="schedule-trigger-separator">至</span>
          <span class="schedule-trigger-end">{{ dateEndText }}</span>
          <span class="schedule-trigger-arrow">⌄</span>
        </button>
      </template>

      <section class="schedule-calendar" @wheel.prevent="handleMonthWheel">
        <div class="schedule-calendar__header">
          <button type="button" class="calendar-nav calendar-nav--year" title="上一年" @click="moveYear(-1)">‹‹</button>
          <button type="button" class="calendar-nav" title="上个月" @click="moveMonth(-1)">‹</button>
          <strong>{{ monthLabel }}</strong>
          <button type="button" class="calendar-nav" title="下个月" @click="moveMonth(1)">›</button>
          <button type="button" class="calendar-nav calendar-nav--year" title="下一年" @click="moveYear(1)">››</button>
        </div>
        <div class="schedule-calendar__weekdays"><span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span></div>
        <div class="schedule-calendar__days">
          <button v-for="day in calendarDays" :key="day.key" type="button" :class="{ 'is-other-month': !day.isCurrentMonth, 'is-range-start': day.key === startDate, 'is-range-end': day.key === endDate, 'is-in-range': isInRange(day.key) }" @click="selectDate(day.key)">
            {{ day.label }}
          </button>
        </div>
        <div class="schedule-calendar__footer">
          <button type="button" @click="clearSchedule">清空</button>
          <button type="button" class="calendar-confirm" @click="datePopoverVisible = false">确定</button>
        </div>
      </section>
    </el-popover>

    <el-popover v-model:visible="timePopoverVisible" trigger="click" placement="bottom-start" :width="388" popper-class="task-time-popper" :disabled="timeDisabled">
      <template #reference>
        <button type="button" class="schedule-trigger schedule-time-trigger" :disabled="timeDisabled">
          <span class="schedule-trigger-icon">◷</span>
          <span class="schedule-trigger-start">{{ timeDisabled ? '开始时间' : startTime }}</span>
          <span class="schedule-trigger-separator">－</span>
          <span class="schedule-trigger-end">{{ timeDisabled ? '结束时间' : endTime }}</span>
          <span class="schedule-trigger-arrow">⌄</span>
        </button>
      </template>

      <section class="schedule-time-picker">
        <div v-for="target in ['start', 'end'] as const" :key="target" class="time-column">
          <strong>{{ target === 'start' ? '开始时间' : '结束时间' }}</strong>
          <div class="time-wheels">
            <div class="time-wheel" aria-label="小时">
              <button v-for="hour in hours" :key="hour" type="button" :class="{ active: isTimeSelected(target, 'hour', hour) }" @click="setTime(target, 'hour', hour)">{{ hour }}</button>
            </div>
            <div class="time-wheel" aria-label="分钟">
              <button v-for="minute in minutes" :key="minute" type="button" :class="{ active: isTimeSelected(target, 'minute', minute) }" @click="setTime(target, 'minute', minute)">{{ minute }}</button>
            </div>
          </div>
        </div>
        <div class="schedule-time-picker__footer">
          <button type="button" @click="timePopoverVisible = false">取消</button>
          <button type="button" class="calendar-confirm" @click="timePopoverVisible = false">确定</button>
        </div>
      </section>
    </el-popover>
  </div>
</template>

<style lang="scss">
.task-schedule-picker { display: grid; gap: 7px; }
.schedule-trigger { width: 100%; min-height: 38px; display: grid; grid-template-columns: 18px minmax(0, 1fr) 24px minmax(0, 1fr) 14px; align-items: center; column-gap: 6px; padding: 8px 10px; color: #d8f5fb; text-align: left; background: #03182d; border: 1px solid #155a7e; cursor: pointer; font: inherit; }
.schedule-trigger:hover,.schedule-trigger:focus-visible { border-color: #28a7db; background: #063452; outline: none; }.schedule-trigger:disabled { color: #658b9b; cursor: not-allowed; opacity: .8; }.schedule-trigger-icon { color: #47cbed; }.schedule-trigger-start { min-width: 0; text-align: left; white-space: nowrap; }.schedule-trigger-separator { color: #a7ccda; text-align: center; }.schedule-trigger-end { min-width: 0; text-align: right; white-space: nowrap; }.schedule-trigger-arrow { color: #77b7ca; text-align: right; }
.task-calendar-popper.el-popper,.task-time-popper.el-popper { padding: 0!important; color: #d7eff8; background: #282832!important; border: 1px solid #4a4a56!important; box-shadow: 0 12px 24px #0009!important; }.task-calendar-popper.el-popper .el-popper__arrow::before,.task-time-popper.el-popper .el-popper__arrow::before { background: #282832!important; border-color: #4a4a56!important; }
.schedule-calendar { padding: 12px 14px 0; user-select: none; }.schedule-calendar__header { display: grid; grid-template-columns: 30px 28px 1fr 28px 30px; align-items: center; gap: 3px; margin-bottom: 12px; }.schedule-calendar__header strong { text-align: center; font-size: 15px; }.calendar-nav { height: 26px; padding: 0; color: #b9dce9; background: transparent; border: 0; cursor: pointer; font-size: 22px; line-height: 1; }.calendar-nav:hover { color: #3bd5ef; background: #183b4f; }.calendar-nav--year { color: #ff9a9a; font-size: 15px; }.schedule-calendar__weekdays,.schedule-calendar__days { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; }.schedule-calendar__weekdays { margin-bottom: 5px; padding-bottom: 7px; color: #bed5df; border-bottom: 1px solid #3d3d49; font-size: 13px; }.schedule-calendar__days button { position: relative; height: 32px; z-index: 0; padding: 0; color: #edf8fc; background: transparent; border: 0; cursor: pointer; font-size: 13px; }.schedule-calendar__days button:hover { color: white; background: #1e6986; }.schedule-calendar__days button.is-other-month { color: #777985; }.schedule-calendar__days button.is-in-range { color: #fff; background: #275d73; }.schedule-calendar__days button.is-range-start,.schedule-calendar__days button.is-range-end { color: #fff; background: #2683ef; border-radius: 16px; font-weight: bold; }.schedule-calendar__footer,.schedule-time-picker__footer { display: flex; justify-content: flex-end; gap: 14px; margin: 9px -14px 0; padding: 10px 14px; border-top: 1px solid #41414c; }.schedule-calendar__footer button,.schedule-time-picker__footer button { padding: 3px 8px; color: #d9edf4; background: transparent; border: 0; cursor: pointer; }.schedule-calendar__footer .calendar-confirm,.schedule-time-picker__footer .calendar-confirm { color: #49b9ff; }
.schedule-time-picker { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; padding: 14px 14px 0; }.time-column { min-width: 0; }.time-column>strong { display: block; margin-bottom: 9px; color: #f0f8fb; text-align: center; font-size: 14px; }.time-wheels { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }.time-wheel { height: 168px; overflow-y: auto; border: 1px solid #464653; scrollbar-color: #617888 #25252e; scroll-snap-type: y mandatory; }.time-wheel button { display: block; width: 100%; min-height: 28px; padding: 0; color: #b9c7ce; background: transparent; border: 0; cursor: pointer; scroll-snap-align: center; }.time-wheel button:hover { color: #fff; background: #3c5662; }.time-wheel button.active { color: #fff; background: #3e3e49; font-weight: bold; }.schedule-time-picker__footer { grid-column: 1 / -1; }
</style>
