<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
}>(), { modelValue: '', placeholder: '请选择日期和时间' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const anchor = ref<HTMLElement>()
const panel = ref<HTMLElement>()
const open = ref(false)
const draft = ref(new Date())
const viewYear = ref(new Date().getFullYear())
const viewMonth = ref(new Date().getMonth())
const panelStyle = ref<Record<string, string>>({})
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const hours = Array.from({ length: 24 }, (_, index) => index)
const minutes = Array.from({ length: 60 }, (_, index) => index)

function pad(value: number) { return String(value).padStart(2, '0') }
function parseValue(value?: string) {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}
function outputValue(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:00`
}
const displayValue = computed(() => {
  if (!props.modelValue) return ''
  const value = parseValue(props.modelValue)
  return `${value.getFullYear()}/${pad(value.getMonth() + 1)}/${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`
})
const monthLabel = computed(() => `${viewYear.value} 年 ${viewMonth.value + 1} 月`)
const cells = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(viewYear.value, viewMonth.value, 1 - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return { date, current: date.getMonth() === viewMonth.value }
  })
})

function isSelected(date: Date) {
  return date.getFullYear() === draft.value.getFullYear()
    && date.getMonth() === draft.value.getMonth()
    && date.getDate() === draft.value.getDate()
}
function isToday(date: Date) {
  const today = new Date()
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()
}
function changeMonth(offset: number) {
  const next = new Date(viewYear.value, viewMonth.value + offset, 1)
  viewYear.value = next.getFullYear(); viewMonth.value = next.getMonth()
}
function selectDate(date: Date) {
  const next = new Date(draft.value)
  next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
  draft.value = next
  viewYear.value = date.getFullYear(); viewMonth.value = date.getMonth()
}
function setHour(event: Event) {
  const next = new Date(draft.value); next.setHours(Number((event.target as HTMLSelectElement).value)); draft.value = next
}
function setMinute(event: Event) {
  const next = new Date(draft.value); next.setMinutes(Number((event.target as HTMLSelectElement).value)); draft.value = next
}
function locatePanel() {
  const rect = anchor.value?.getBoundingClientRect()
  if (!rect) return
  const width = Math.min(446, window.innerWidth - 16)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  panelStyle.value = { top: `${rect.bottom + 6}px`, left: `${left}px`, width: `${width}px` }
}
async function showPanel() {
  draft.value = parseValue(props.modelValue)
  viewYear.value = draft.value.getFullYear(); viewMonth.value = draft.value.getMonth()
  open.value = true
  await nextTick(); locatePanel()
}
function confirm() { emit('update:modelValue', outputValue(draft.value)); open.value = false }
function clearValue(event: MouseEvent) { event.stopPropagation(); emit('update:modelValue', ''); open.value = false }
function useNow() {
  draft.value = new Date(); viewYear.value = draft.value.getFullYear(); viewMonth.value = draft.value.getMonth()
}
function closeFromOutside(event: PointerEvent) {
  const target = event.target as Node
  if (!anchor.value?.contains(target) && !panel.value?.contains(target)) open.value = false
}
function reposition() { if (open.value) locatePanel() }

watch(() => props.modelValue, (value) => { if (!open.value && value) draft.value = parseValue(value) })
onMounted(() => {
  document.addEventListener('pointerdown', closeFromOutside)
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeFromOutside)
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
})
</script>

<template>
  <div ref="anchor" class="spot-datetime">
    <button class="spot-datetime__input" type="button" :class="{ open, empty: !displayValue }" @click="showPanel">
      <span class="spot-datetime__clock">◷</span><span>{{ displayValue || placeholder }}</span>
      <i v-if="displayValue" title="清除" @click="clearValue">×</i>
    </button>
    <Teleport to="body">
      <section v-if="open" ref="panel" class="spot-datetime-panel" :style="panelStyle" @pointerdown.stop>
        <div class="spot-datetime-panel__body">
          <div class="spot-calendar">
            <header><button type="button" @click="changeMonth(-1)">‹</button><b>{{ monthLabel }}</b><button type="button" @click="changeMonth(1)">›</button></header>
            <div class="spot-calendar__week"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
            <div class="spot-calendar__days">
              <button v-for="cell in cells" :key="cell.date.toISOString()" type="button" :class="{ muted: !cell.current, today: isToday(cell.date), selected: isSelected(cell.date) }" @click="selectDate(cell.date)">{{ cell.date.getDate() }}</button>
            </div>
          </div>
          <div class="spot-time">
            <b>选择时间</b><small>小时</small><select :value="draft.getHours()" @change="setHour"><option v-for="hour in hours" :key="hour" :value="hour">{{ pad(hour) }}</option></select>
            <small>分钟</small><select :value="draft.getMinutes()" @change="setMinute"><option v-for="minute in minutes" :key="minute" :value="minute">{{ pad(minute) }}</option></select>
            <strong>{{ pad(draft.getHours()) }} : {{ pad(draft.getMinutes()) }}</strong>
          </div>
        </div>
        <footer><button type="button" @click="useNow">现在</button><button class="primary" type="button" @click="confirm">确认</button></footer>
      </section>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.spot-datetime{width:100%;min-width:0}.spot-datetime__input{width:100%;height:35px;display:grid;grid-template-columns:18px minmax(0,1fr) 18px;align-items:center;gap:5px;padding:0 8px;color:#294b5d;background:#fff;border:1px solid #c4d7e0;border-radius:5px;text-align:left;cursor:pointer}.spot-datetime__input:hover,.spot-datetime__input.open{border-color:#1597bc;box-shadow:0 0 0 2px #1597bc1c}.spot-datetime__input.empty{color:#8299a4}.spot-datetime__clock{color:#4095ad;font-size:15px}.spot-datetime__input>span:nth-child(2){overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.spot-datetime__input i{display:grid;width:18px;height:18px;place-items:center;color:#718a96;border-radius:50%;font-size:15px;font-style:normal}.spot-datetime__input i:hover{color:#fff;background:#8197a1}
</style>

<style lang="scss">
.spot-datetime-panel{position:fixed;z-index:5000;box-sizing:border-box;overflow:hidden;color:#294b5d;background:#fff;border:2px solid #35a9c7;border-radius:8px;box-shadow:0 14px 38px #08364b47;font-family:"Microsoft YaHei",sans-serif}.spot-datetime-panel__body{display:grid;grid-template-columns:minmax(0,1fr) 128px}.spot-calendar{padding:10px 12px 8px;border-right:1px solid #d6e4ea}.spot-calendar header{height:30px;display:grid;grid-template-columns:30px 1fr 30px;align-items:center;text-align:center}.spot-calendar header b{font-size:13px}.spot-calendar header button,.spot-calendar__days button{border:0;background:transparent;cursor:pointer}.spot-calendar header button{color:#2b7188;font-size:22px}.spot-calendar__week,.spot-calendar__days{display:grid;grid-template-columns:repeat(7,1fr)}.spot-calendar__week span{height:25px;display:grid;place-items:center;color:#78909b;font-size:10px}.spot-calendar__days button{height:27px;color:#34596a;border-radius:4px;font-size:11px}.spot-calendar__days button:hover{color:#087d9c;background:#e5f4f8}.spot-calendar__days button.muted{color:#b0bec5}.spot-calendar__days button.today{color:#0787a7;font-weight:800}.spot-calendar__days button.selected{color:#fff;background:#1597b8;box-shadow:0 2px 6px #1597b84a}.spot-time{display:flex;flex-direction:column;gap:7px;padding:13px 12px;background:#f6fafb}.spot-time>b{margin-bottom:3px;color:#234b60;font-size:13px}.spot-time small{color:#718a96;font-size:10px}.spot-time select{width:100%;height:31px;padding:0 7px;color:#294b5d;background:#fff;border:1px solid #bfd4de;border-radius:4px;outline:none}.spot-time select:hover,.spot-time select:focus{color:#fff;background:#075273;border-color:#1599c1}.spot-time select option{color:#294b5d;background:#fff}.spot-time strong{margin-top:4px;padding:8px 2px;color:#087f9e;background:#e3f4f8;border-radius:4px;font-size:16px;text-align:center}.spot-datetime-panel footer{height:46px;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 12px;background:#f3f8fa;border-top:1px solid #c8dae2}.spot-datetime-panel footer button{min-width:64px;height:31px;color:#537481;background:#fff;border:1px solid #bfd3dc;border-radius:4px;cursor:pointer}.spot-datetime-panel footer button.primary{color:#fff;background:#168fad;border-color:#168fad;font-weight:700}@media(max-width:520px){.spot-datetime-panel__body{grid-template-columns:1fr}.spot-calendar{border-right:0;border-bottom:1px solid #d6e4ea}.spot-time{display:grid;grid-template-columns:1fr 1fr}.spot-time>b,.spot-time strong{grid-column:1/-1}}
</style>
