<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  getUavDeviceAlarms,
  getUavDeviceFlightStatistics,
  getUavDeviceOptions,
  getUavDeviceState,
  getUavDeviceSummary,
  getUavFlightSummary,
  getUavFlightTaskOptions,
  type UavDeviceAlarm,
  type UavDeviceFlightStatistic,
  type UavDeviceOption,
  type UavDeviceState,
  type UavDeviceSummary,
  type UavFlightSummary,
  type UavFlightTaskOption,
} from '@/api/patrol'
import FleetOverviewMap from './FleetOverviewMap.vue'

const devices = ref<UavDeviceOption[]>([])
const flightTasks = ref<UavFlightTaskOption[]>([])
const taskTotal = ref<number>()
const devicesLoaded = ref(false)
const tasksLoaded = ref(false)
const loading = ref(true)
const errorMessage = ref('')
const selectedDeviceId = ref('')
const healthList = ref<HTMLElement>()
const inventoryList = ref<HTMLElement>()
const deviceStates = ref<Record<string, UavDeviceState>>({})
const deviceAlarms = ref<UavDeviceAlarm[]>([])
const alarmTotal = ref<number>()
const alarmsLoaded = ref(false)
const flightSummary = ref<UavFlightSummary>()
const deviceSummary = ref<UavDeviceSummary>()
const deviceFlightStatistics = ref<UavDeviceFlightStatistic[]>([])
const deviceStatisticsLoading = ref(false)
const deviceStatisticsError = ref('')
let deviceStatisticsRequestVersion = 0

const activeDevice = computed(() => devices.value.find((device) => device.id === selectedDeviceId.value) || devices.value[0])
const runningTasks = computed(() => flightTasks.value.filter((task) => /执行|飞行|巡航|进行/.test(task.status)).length)
const devicesWithLocation = computed(() => devices.value.map((device) => {
  const state = device.sn ? deviceStates.value[device.sn] : undefined
  return { ...device, longitude: state?.longitude ?? device.longitude, latitude: state?.latitude ?? device.latitude }
}).filter((device) => device.longitude !== undefined && device.latitude !== undefined))
const fleetAvailability = computed(() => {
  const total = deviceSummary.value?.totalCount
  const online = deviceSummary.value?.onlineCount
  if (total === undefined || online === undefined || total <= 0) return undefined
  return Math.round(online / total * 100)
})
const selectedDeviceMetrics = computed(() => deviceFlightStatistics.value.reduce((total, item) => ({
  flightCount: total.flightCount + (item.flightCount ?? 0),
  flightDistance: total.flightDistance + (item.flightDistance ?? 0),
  flightTime: total.flightTime + (item.flightTime ?? 0),
}), { flightCount: 0, flightDistance: 0, flightTime: 0 }))
const statisticsPeriod = computed(() => {
  const starts = deviceFlightStatistics.value.map((item) => item.statStartDate).filter((value): value is string => Boolean(value)).sort()
  const ends = deviceFlightStatistics.value.map((item) => item.statEndDate).filter((value): value is string => Boolean(value)).sort()
  if (!starts.length && !ends.length) return '--'
  return `${formatDate(starts[0])} 至 ${formatDate(ends[ends.length - 1])}`
})

function valueOf(value: number | undefined) { return value === undefined ? '--' : String(value) }
function flightHours(value?: number) { return value === undefined ? '--' : (value / 3600).toFixed(1) }
function deviceState(device?: UavDeviceOption) { return device ? (device.online ? '在线' : '离线') : '--' }
function stateFor(device: UavDeviceOption) { return device.sn ? deviceStates.value[device.sn] : undefined }
function taskForDevice(device: UavDeviceOption) {
  if (!device.sn) return undefined
  return flightTasks.value.find((task) => /执行|飞行|巡航|进行/.test(task.status) && task.deviceName.includes(device.sn!))
}
function alarmLevel(alarm: UavDeviceAlarm) {
  if (alarm.imminent || (alarm.level !== undefined && alarm.level >= 2)) return '严重'
  if (alarm.level === 1) return '警告'
  return alarm.level === undefined ? '--' : '提示'
}
function alarmTime(value?: string) { return value ? value.replace('T', ' ').slice(0, 16) : '--' }
function formatDate(value?: string) { return value ? value.replace('T', ' ').slice(0, 16) : '--' }
function formatDistance(value?: number) {
  if (value === undefined) return '--'
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`
}
function formatDuration(value?: number) {
  if (value === undefined) return '--'
  if (value >= 3600) return `${(value / 3600).toFixed(1)} 小时`
  return `${Math.round(value / 60)} 分钟`
}
function statisticLabel(value?: string) { return value?.trim() || '未分类' }

async function selectDevice(deviceId: string) {
  selectedDeviceId.value = deviceId
  await nextTick()
  const selector = `[data-device-id="${CSS.escape(deviceId)}"]`
  healthList.value?.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  inventoryList.value?.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function loadSelectedDeviceStatistics(sn?: string) {
  const requestVersion = ++deviceStatisticsRequestVersion
  deviceFlightStatistics.value = []
  deviceStatisticsError.value = ''
  if (!sn) return
  deviceStatisticsLoading.value = true
  try {
    const result = await getUavDeviceFlightStatistics(sn)
    if (requestVersion === deviceStatisticsRequestVersion) deviceFlightStatistics.value = result
  } catch (error) {
    if (requestVersion === deviceStatisticsRequestVersion) {
      deviceStatisticsError.value = error instanceof Error ? error.message : '设备飞行绩效加载失败。'
    }
  } finally {
    if (requestVersion === deviceStatisticsRequestVersion) deviceStatisticsLoading.value = false
  }
}

async function loadFleetData() {
  loading.value = true
  errorMessage.value = ''
  const [deviceResult, taskResult, flightSummaryResult, deviceSummaryResult] = await Promise.allSettled([
    getUavDeviceOptions(),
    getUavFlightTaskOptions({ pageNum: 1, pageSize: 200 }),
    getUavFlightSummary(),
    getUavDeviceSummary(),
  ])
  if (deviceResult.status === 'fulfilled') {
    devices.value = deviceResult.value
    devicesLoaded.value = true
    if (!devices.value.some((device) => device.id === selectedDeviceId.value)) selectedDeviceId.value = devices.value[0]?.id || ''
    const devicesWithSn = deviceResult.value.filter((device) => device.sn)
    const [stateResults, alarmResults] = await Promise.all([
      Promise.allSettled(devicesWithSn.map((device) => getUavDeviceState(device.sn!))),
      Promise.allSettled(devicesWithSn.map((device) => getUavDeviceAlarms(device.sn!))),
    ])
    deviceStates.value = Object.fromEntries(stateResults.flatMap((result, index) =>
      result.status === 'fulfilled' ? [[devicesWithSn[index]!.sn!, result.value] as const] : []))
    const successfulAlarms = alarmResults.filter((result): result is PromiseFulfilledResult<{ list: UavDeviceAlarm[]; total: number }> => result.status === 'fulfilled')
    deviceAlarms.value = successfulAlarms.flatMap((result) => result.value.list)
      .sort((left, right) => String(right.createTime || '').localeCompare(String(left.createTime || '')))
    alarmTotal.value = successfulAlarms.length ? successfulAlarms.reduce((sum, result) => sum + result.value.total, 0) : undefined
    alarmsLoaded.value = !devicesWithSn.length || successfulAlarms.length > 0
  } else {
    devices.value = []
    devicesLoaded.value = false
    deviceStates.value = {}
    deviceAlarms.value = []
    alarmTotal.value = undefined
    alarmsLoaded.value = false
  }
  if (taskResult.status === 'fulfilled') {
    flightTasks.value = taskResult.value.list
    taskTotal.value = taskResult.value.total
    tasksLoaded.value = true
  } else {
    flightTasks.value = []
    taskTotal.value = undefined
    tasksLoaded.value = false
  }
  flightSummary.value = flightSummaryResult.status === 'fulfilled' ? flightSummaryResult.value : undefined
  deviceSummary.value = deviceSummaryResult.status === 'fulfilled' ? deviceSummaryResult.value : undefined
  if (!devicesLoaded.value && !tasksLoaded.value) errorMessage.value = '无人机数据暂不可用，请稍后重试。'
  loading.value = false
}

watch(() => activeDevice.value?.sn, (sn) => void loadSelectedDeviceStatistics(sn), { immediate: true })

const refreshTimer = window.setInterval(() => void loadFleetData(), 60_000)
onMounted(() => {
  void loadFleetData()
})
onBeforeUnmount(() => {
  window.clearInterval(refreshTimer)
})
</script>

<template>
  <section class="fleet-overview">
    <section class="fleet-cards">
      <article><i>机</i><div><span>无人机总数</span><b>{{ valueOf(deviceSummary?.totalCount) }}<small>架</small></b><em>在线 {{ valueOf(deviceSummary?.onlineCount) }} · 离线 {{ valueOf(deviceSummary?.offlineCount) }}</em></div></article>
      <article><i>务</i><div><span>飞行任务</span><b>{{ tasksLoaded ? valueOf(taskTotal) : '--' }}<small>个</small></b><em>执行中 {{ tasksLoaded ? runningTasks : '--' }}</em></div></article>
      <article><i>时</i><div><span>累计飞行</span><b>{{ flightHours(flightSummary?.flightTime) }}<small>小时</small></b><em>累计 {{ valueOf(flightSummary?.flightCount) }} 架次 · {{ valueOf(flightSummary?.completedTaskCount) }} 个已完成任务</em></div></article>
      <article><i>率</i><div><span>机队可用率</span><b>{{ valueOf(fleetAvailability) }}<small>%</small></b><em>活跃告警 {{ valueOf(deviceSummary?.activeHmsCount) }} 条</em></div></article>
    </section>

    <section class="fleet-grid">
      <article class="panel map-panel">
        <header><b>设备分布与作业态势</b><span>{{ activeDevice ? `当前设备：${activeDevice.label}` : '' }}</span></header>
        <div class="map-wrap"><FleetOverviewMap :devices="devicesWithLocation" :selected-device-id="selectedDeviceId" @select-device="selectDevice" /><div v-if="devicesLoaded && !devicesWithLocation.length" class="map-empty">--<small>暂无设备位置数据</small></div><div class="map-legend"><span><i class="online" />在线</span><span><i class="offline" />离线</span></div></div>
      </article>

      <article class="panel health-panel">
        <header><b>设备健康详情</b><span>{{ activeDevice ? '当前选中设备' : '实时状态' }}</span></header>
        <div v-if="activeDevice" ref="healthList" class="health-single">
          <article :data-device-id="activeDevice.id" class="health-device health-device--active">
            <div class="device-name"><i><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 13h10l3 4-3 2H11l-3-2 3-4Z"/><path d="M9 15 5 10m18 5 4-5M9 19l-4 4m18-4 4 4"/><circle cx="4.5" cy="9.5" r="3"/><circle cx="27.5" cy="9.5" r="3"/><circle cx="4.5" cy="23.5" r="3"/><circle cx="27.5" cy="23.5" r="3"/></svg></i><div><b>{{ activeDevice.callsign || activeDevice.label }}</b><small>{{ activeDevice.sn || '--' }}</small><small>{{ activeDevice.model || '设备型号未提供' }}</small></div><em :class="{ online: activeDevice.online }">{{ deviceState(activeDevice) }}</em></div>
            <dl>
              <div><dt><i>电</i>飞行电池</dt><dd>{{ stateFor(activeDevice)?.batteryPercent === undefined ? '--' : `${stateFor(activeDevice)?.batteryPercent}%` }}</dd></div>
              <div><dt><i>高</i>飞行高度</dt><dd>{{ stateFor(activeDevice)?.height === undefined ? '--' : `${stateFor(activeDevice)?.height} m` }}</dd></div>
              <div><dt><i>速</i>水平速度</dt><dd>{{ stateFor(activeDevice)?.horizontalSpeed === undefined ? '--' : `${stateFor(activeDevice)?.horizontalSpeed} m/s` }}</dd></div>
              <div><dt><i>位</i>定位状态</dt><dd>{{ stateFor(activeDevice)?.longitude !== undefined && stateFor(activeDevice)?.latitude !== undefined ? '已定位' : '--' }}</dd></div>
              <div><dt><i>务</i>当前任务</dt><dd :title="taskForDevice(activeDevice)?.name || '--'">{{ taskForDevice(activeDevice)?.name || '--' }}</dd></div>
              <div><dt><i>时</i>状态时间</dt><dd>{{ alarmTime(stateFor(activeDevice)?.receiveTime) }}</dd></div>
            </dl>
          </article>
        </div>
        <div v-else class="panel-empty">--<small>暂无设备数据</small></div>
      </article>

      <section class="bottom-content">
        <article class="panel fleet-performance-panel">
          <header><b>机队设备与飞行绩效</b><span>{{ activeDevice ? `当前设备：${activeDevice.callsign || activeDevice.label} · ${activeDevice.sn || '--'}` : '请选择设备' }}</span></header>
          <div class="device-performance-layout">
            <aside class="inventory-column">
              <div v-if="devices.length" ref="inventoryList" class="device-inventory-list">
                <button v-for="device in devices" :key="device.id" :data-device-id="device.id" type="button" :class="{ selected: selectedDeviceId === device.id }" @click="selectDevice(device.id)">
                  <i :class="{ online: device.online }" />
                  <span><b>{{ device.callsign || device.label }}</b><small>设备编号：{{ device.sn || '--' }}</small><small>设备型号：{{ device.model || '未提供' }}</small><small v-if="device.cameraSummary">设备负载：{{ device.cameraSummary }}</small></span>
                  <em :class="{ online: device.online }">{{ deviceState(device) }}</em>
                </button>
              </div>
              <div v-else class="panel-empty compact">--<small>{{ errorMessage || '暂无机队设备数据' }}</small></div>
            </aside>

            <section class="performance-column">
              <div v-if="deviceStatisticsLoading" class="panel-empty panel-empty--small">…<small>正在读取设备飞行统计</small></div>
              <div v-else-if="deviceFlightStatistics.length" class="performance-body">
                <section class="performance-metrics">
                  <article><span>累计飞行架次</span><b>{{ selectedDeviceMetrics.flightCount }} 架次</b></article>
                  <article><span>累计飞行距离</span><b>{{ formatDistance(selectedDeviceMetrics.flightDistance) }}</b></article>
                  <article><span>累计飞行时长</span><b>{{ formatDuration(selectedDeviceMetrics.flightTime) }}</b></article>
                </section>
                <p class="statistics-period"><span>统计周期</span><b>{{ statisticsPeriod }}</b></p>
                <section class="statistics-table">
                  <header><span>任务类型</span><span>航线类型</span><span>架次</span><span>距离</span><span>时长</span></header>
                  <div class="statistics-rows">
                    <article v-for="(item, index) in deviceFlightStatistics" :key="item.id || `${item.sn}-${index}`">
                      <span :title="statisticLabel(item.taskType)">{{ statisticLabel(item.taskType) }}</span>
                      <span :title="statisticLabel(item.waylineType)">{{ statisticLabel(item.waylineType) }}</span>
                      <b>{{ valueOf(item.flightCount) }}</b>
                      <b>{{ formatDistance(item.flightDistance) }}</b>
                      <b>{{ formatDuration(item.flightTime) }}</b>
                    </article>
                  </div>
                </section>
              </div>
              <div v-else class="panel-empty">--<small>{{ deviceStatisticsError || (activeDevice?.sn ? '该设备暂无飞行统计数据' : '该设备未提供 SN，无法读取飞行统计') }}</small></div>
            </section>
          </div>
        </article>
      </section>

      <article class="panel alarm-panel">
        <header><b>设备告警与维保</b><span>告警 {{ alarmsLoaded ? valueOf(alarmTotal) : '--' }} · 维保 --</span></header>
        <div v-if="deviceAlarms.length" class="alarm-list"><article v-for="alarm in deviceAlarms" :key="alarm.id"><i :class="{ severe: alarm.imminent || (alarm.level !== undefined && alarm.level >= 2), recovered: Boolean(alarm.recoverTime) }">{{ alarmLevel(alarm) }}</i><div><b>{{ alarm.message || alarm.code || '--' }}</b><small>{{ alarm.sn }} · {{ alarmTime(alarm.createTime) }}</small></div><em>{{ alarm.recoverTime ? '已恢复' : '未恢复' }}</em></article></div>
        <div v-else class="panel-empty">--<small>{{ alarmsLoaded ? '暂无设备告警，暂无维保数据' : '设备告警数据暂不可用' }}</small></div>
      </article>
    </section>

  </section>
</template>

<style scoped lang="scss">
.fleet-overview{box-sizing:border-box;height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px;overflow:hidden;padding:16px;color:#23475d;background:#edf4f7}.fleet-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.fleet-cards article{min-height:68px;display:flex;align-items:center;gap:12px;padding:9px 14px;border:1px solid #d5e2e9;border-radius:8px;background:#fff;box-shadow:0 2px 7px #23485a0c}.fleet-cards i{width:38px;height:38px;display:grid;place-items:center;color:#087b9b;border-radius:9px;background:#e3f5f8;font-size:17px;font-style:normal;font-weight:700}.fleet-cards span,.fleet-cards b,.fleet-cards em{display:block}.fleet-cards span{color:#6e8796;font-size:12px}.fleet-cards b{margin:2px 0;color:#163d54;font-size:23px;line-height:1}.fleet-cards b small{margin-left:4px;font-size:11px}.fleet-cards em{color:#5b899d;font-size:10px;font-style:normal}.fleet-grid{min-height:0;display:grid;grid-template-columns:minmax(0,3.15fr) minmax(270px,.85fr);grid-template-rows:minmax(0,1.35fr) minmax(0,1fr);gap:10px}.panel{min-height:0;overflow:hidden;border:1px solid #d5e2e9;border-radius:8px;background:#fff;box-shadow:0 2px 7px #23485a0c}.panel>header{height:39px;flex:0 0 39px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 13px;border-bottom:1px solid #e4edf2}.panel>header b{color:#21465d;font-size:15px}.panel>header span{overflow:hidden;color:#7891a0;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.map-panel,.health-panel,.task-panel,.media-panel,.alarm-panel{display:flex;flex-direction:column}.map-wrap{position:relative;flex:1;min-height:0}.map-empty{position:absolute;inset:0;display:grid;place-content:center;color:#638092;background:#dbe8dcaa;text-align:center;font-size:28px;pointer-events:none}.map-empty small,.panel-empty small{display:block;margin-top:7px;font-size:12px}.map-legend{position:absolute;right:12px;bottom:12px;display:flex;gap:12px;padding:7px 9px;color:#527080;border:1px solid #c7dbe3;border-radius:4px;background:#ffffffe8;font-size:11px}.map-legend i{width:8px;height:8px;display:inline-block;margin-right:4px;border-radius:50%}.map-legend .online{background:#14b89c}.map-legend .offline{background:#8295a1}.health-list{min-height:0;flex:1;overflow-y:auto;padding:8px;scroll-behavior:smooth}.health-device{margin-bottom:7px;padding:9px;border:1px solid #e2ebef;border-radius:6px;background:#fbfdfe;cursor:pointer;transition:.18s}.health-device:hover{border-color:#7bc8dc}.health-device.selected{border-color:#16a7ca;background:#eaf8fc;box-shadow:inset 3px 0 #17acd1;outline:0}.device-name{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:8px;align-items:center}.device-name>i{width:34px;height:34px;display:grid;place-items:center;color:#fff;border-radius:50%;background:#0e9bb8}.device-name>i svg{width:24px;height:24px;fill:currentColor;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.device-name b,.device-name small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.device-name b{color:#20455d;font-size:12px}.device-name small{margin-top:3px;color:#7991a0;font-size:9px}.device-name em{padding:4px 6px;color:#748b96;border-radius:4px;background:#eff3f5;font-size:9px;font-style:normal}.device-name em.online{color:#168364;background:#e2f7ef}.health-device dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 10px;margin:7px 0 0}.health-device dl>div{min-width:0;display:flex;justify-content:space-between;gap:6px;padding:4px 0;border-bottom:1px solid #edf2f5;font-size:10px}.health-device dl>div:last-child{grid-column:1/-1}.health-device dt{color:#78909e}.health-device dd{min-width:0;margin:0;overflow:hidden;color:#31556a;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.bottom-content{width:100%;min-width:0;min-height:0;display:grid;grid-template-columns:clamp(400px,35%,560px) minmax(0,1fr);gap:10px;justify-self:stretch}.task-panel,.media-panel{min-width:0}.media-panel{width:100%}.task-list,.alarm-list{min-height:0;flex:1;overflow-y:auto}.task-list button{width:100%;display:grid;grid-template-columns:9px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 10px;color:#2b4c60;border:0;border-bottom:1px solid #edf2f5;background:#fff;text-align:left;cursor:pointer}.task-list button:hover{background:#f4fafc}.task-list button.selected{background:#e5f5fb;box-shadow:inset 3px 0 #159fc4}.task-list i{width:7px;height:7px;border-radius:50%;background:#91a3ad}.task-list i.running{background:#13b895;box-shadow:0 0 5px #13b895}.task-list b,.task-list small{display:block;overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere}.task-list b{font-size:11px}.task-list small{margin-top:3px;color:#7b94a2;font-size:9px;line-height:1.35}.task-list em{color:#4f7d92;font-size:10px;font-style:normal}.media-grid{min-height:0;flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));align-content:start;gap:8px;padding:8px;overflow:auto}.media-grid button{min-width:0;overflow:hidden;padding:0;color:#25495e;border:1px solid #d3e3ea;border-radius:5px;background:#f7fbfd;text-align:left;cursor:pointer}.media-grid button:hover{border-color:#1aa8cb;box-shadow:0 2px 8px #168eb82b}.media-grid img,.media-grid>button>i{width:100%;height:88px;display:grid;place-items:center;color:#8aa1ad;background:#e7eef2;object-fit:cover;font-size:11px;font-style:normal}.media-grid span{display:block;padding:6px 7px}.media-grid b,.media-grid small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.media-grid b{font-size:10px}.media-grid small{margin-top:3px;color:#7e96a3;font-size:9px}.media-error{margin:0;padding:5px 9px;color:#b35e66;background:#fff0f1;font-size:10px}.alarm-list>article{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #edf2f5}.alarm-list i{padding:3px 4px;color:#a07118;border-radius:3px;background:#fff3cf;font-size:9px;font-style:normal;text-align:center}.alarm-list i.severe{color:#b73737;background:#ffe5e5}.alarm-list i.recovered{color:#477663;background:#e9f5ef}.alarm-list b,.alarm-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.alarm-list b{color:#2b4c60;font-size:10px}.alarm-list small{margin-top:3px;color:#8297a3;font-size:9px}.alarm-list em{color:#718b98;font-size:9px;font-style:normal}.panel-empty{flex:1;display:grid;place-content:center;color:#7d96a4;text-align:center;font-size:26px}.panel-empty--small{font-size:20px}.media-fullscreen{position:fixed;z-index:2500;inset:0;display:grid;place-items:center;background:#02080def}.media-fullscreen img{width:100%;height:100%;display:block;object-fit:contain}.media-fullscreen__close{position:absolute;z-index:2;top:18px;right:20px;width:42px;height:42px;display:grid;place-items:center;padding:0;color:#fff;border:1px solid #a9eafa;border-radius:50%;background:#073a58e8;font-size:28px;line-height:1;cursor:pointer}.media-fullscreen__close:hover{background:#09618a}.media-fullscreen footer{position:absolute;right:0;bottom:0;left:0;display:flex;justify-content:space-between;padding:12px 18px;color:#fff;background:#02101bcf;pointer-events:none}.media-fullscreen footer span{color:#9fc4d2}@media(max-width:1280px){.fleet-grid{grid-template-columns:minmax(0,1fr) minmax(235px,.72fr)}.bottom-content{grid-template-columns:minmax(330px,34%) minmax(0,1fr)}.media-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}}@media(max-height:760px){.fleet-overview{gap:8px;padding:10px}.fleet-cards{gap:7px}.fleet-cards article{min-height:54px;padding:6px 10px}.fleet-cards i{width:32px;height:32px}.fleet-cards b{font-size:19px}.fleet-grid,.bottom-content{gap:7px}.panel>header{height:34px;flex-basis:34px}.health-list{padding:5px}.health-device{margin-bottom:5px;padding:6px}.health-device dl{margin-top:4px}.health-device dl>div{padding:2px 0}.media-grid img,.media-grid>button>i{height:66px}}
.media-fullscreen__nav {
  position: absolute;
  z-index: 2;
  top: 50%;
  width: 52px;
  height: 72px;
  display: grid;
  place-items: center;
  padding: 0;
  color: #fff;
  border: 1px solid #91d9eb;
  border-radius: 8px;
  background: #073a58c9;
  box-shadow: 0 4px 18px #0007;
  font-size: 42px;
  line-height: 1;
  cursor: pointer;
  transform: translateY(-50%);
  transition: background .16s, transform .16s;
}

.media-grid video {
  width: 100%;
  height: 124px;
  display: block;
  background: #0d1e27;
  object-fit: cover;
  pointer-events: none;
}

.media-grid button {
  position: relative;
}

.video-play {
  position: absolute;
  top: 62px;
  left: 50%;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  padding-left: 3px;
  color: #fff;
  border: 1px solid #ffffffb8;
  border-radius: 50%;
  background: #073a58c9;
  box-shadow: 0 2px 9px #0007;
  font-size: 15px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.media-grid small em {
  margin-right: 6px;
  padding: 1px 4px;
  color: #087c9f;
  border-radius: 3px;
  background: #dff4fa;
  font-size: 8px;
  font-style: normal;
}

.media-filter-note {
  flex: 0 0 auto;
  margin: 0;
  padding: 6px 10px;
  color: #688594;
  border-top: 1px solid #e4edf2;
  background: #f6fafc;
  font-size: 9px;
}

.media-fullscreen video {
  width: min(92vw, 1500px);
  max-height: calc(100vh - 96px);
  background: #000;
  box-shadow: 0 8px 36px #000b;
}

.media-fullscreen__status {
  position: absolute;
  z-index: 3;
  left: 50%;
  bottom: 82px;
  min-width: 300px;
  max-width: min(680px, 80vw);
  padding: 12px 16px;
  color: #dff8ff;
  border: 1px solid #4bb6d2;
  border-radius: 6px;
  background: #06334aee;
  text-align: center;
  transform: translateX(-50%);
}

.media-fullscreen__status.failed {
  color: #ffe9e9;
  border-color: #d77b7b;
  background: #4a1c22ee;
}

.media-fullscreen__status b,
.media-fullscreen__status small {
  display: block;
}

.media-fullscreen__status small {
  margin-top: 5px;
  line-height: 1.5;
}

.media-fullscreen__status a {
  display: inline-block;
  margin-top: 9px;
  padding: 5px 10px;
  color: #fff;
  border: 1px solid currentColor;
  border-radius: 4px;
  text-decoration: none;
}

.media-fullscreen__nav:hover,
.media-fullscreen__nav:focus-visible {
  background: #0879a5ed;
  outline: 2px solid #b7efff;
  transform: translateY(-50%) scale(1.04);
}

.media-fullscreen__nav--prev {
  left: 22px;
}

.media-fullscreen__nav--next {
  right: 22px;
}

.health-device dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}

.health-device dl > div {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 5px 0;
  line-height: 1.35;
}

.health-device dl > div:last-child {
  grid-column: auto;
  border-bottom: 0;
}

.health-device dt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.health-device dd {
  min-width: 0;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-grid {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  grid-auto-rows: max-content;
  align-content: start;
  gap: 12px;
  padding: 12px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.media-grid img,
.media-grid > button > i {
  height: 124px;
}

.bottom-content {
  display: block;
}

.fleet-performance-panel {
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.device-performance-layout {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(300px, 32%) minmax(0, 1fr);
  background: #f8fbfc;
}

.inventory-column,
.performance-column {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.inventory-column {
  border-right: 1px solid #dce8ed;
  background: #fff;
}

.performance-column {
  background: linear-gradient(135deg, #fbfdfe 0%, #f4f9fb 100%);
}

.subsection-title {
  min-height: 36px;
  flex: 0 0 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  color: #6f8795;
  border-bottom: 1px solid #e7eef2;
  background: #f8fbfc;
  font-size: 10px;
}

.subsection-title b {
  color: #31576d;
  font-size: 12px;
}

.performance-title > div {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.performance-title small {
  overflow: hidden;
  color: #8398a4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.performance-title em {
  padding: 3px 7px;
  color: #718690;
  border-radius: 9px;
  background: #e9eff2;
  font-style: normal;
}

.performance-title em.online {
  color: #08775d;
  background: #dcf6ec;
}

.panel-empty.compact {
  font-size: 20px;
}

.device-inventory-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.device-inventory-list button {
  width: 100%;
  min-height: 76px;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  color: #294d61;
  border: 0;
  border-bottom: 1px solid #edf2f5;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: background-color .16s, box-shadow .16s;
}

.device-inventory-list button:hover {
  background: #f3fafc;
}

.device-inventory-list button.selected {
  background: #e5f6fb;
  box-shadow: inset 3px 0 #149fc5;
}

.device-inventory-list button > i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #91a3ad;
}

.device-inventory-list button > i.online {
  background: #11b99a;
  box-shadow: 0 0 7px #11b99a99;
}

.device-inventory-list button > span,
.device-inventory-list b,
.device-inventory-list small {
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-inventory-list b {
  color: #1e445b;
  font-size: 12px;
}

.device-inventory-list small {
  margin-top: 3px;
  color: #78909e;
  font-size: 9px;
}

.device-inventory-list em {
  padding: 4px 7px;
  color: #738893;
  border-radius: 4px;
  background: #eef3f5;
  font-size: 9px;
  font-style: normal;
}

.device-inventory-list em.online {
  color: #08775d;
  background: #ddf7ed;
}

.performance-body {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
}

.performance-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.performance-metrics article {
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid #dbe8ee;
  border-radius: 6px;
  background: linear-gradient(135deg, #f7fcfd, #edf7fa);
}

.performance-metrics span,
.performance-metrics b,
.performance-metrics small {
  display: block;
}

.performance-metrics span {
  color: #738c9a;
  font-size: 10px;
}

.performance-metrics b {
  margin-top: 5px;
  overflow: hidden;
  color: #0d7898;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 18px;
}

.performance-metrics small {
  margin-top: -15px;
  margin-left: 37px;
  color: #78909e;
  font-size: 9px;
}

.statistics-period {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 0 2px;
  color: #78909e;
  font-size: 10px;
}

.statistics-period b {
  color: #365d72;
  font-weight: 600;
}

.statistics-table {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e0eaef;
  border-radius: 5px;
}

.statistics-table > header,
.statistics-rows article {
  display: grid;
  grid-template-columns: minmax(90px, 1.25fr) minmax(80px, 1fr) 52px 84px 82px;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  font-size: 10px;
}

.statistics-table > header {
  color: #668494;
  background: #edf5f8;
  font-weight: 600;
}

.statistics-rows {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.statistics-rows article {
  color: #31566b;
  border-top: 1px solid #edf2f5;
}

.statistics-rows article:first-child {
  border-top: 0;
}

.statistics-rows span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.statistics-rows b {
  color: #3d6275;
  font-weight: 500;
}

.health-single {
  min-height: 0;
  flex: 1;
  padding: 10px;
  background: linear-gradient(180deg, #f8fcfd, #fff 38%);
}

.health-device--active {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 14px;
  border-color: #28a8c8;
  background: linear-gradient(145deg, #e9f8fb 0%, #f9fdfe 58%, #eef8fa 100%);
  box-shadow: none;
  cursor: default;
}

.health-device--active:hover {
  border-color: #28a8c8;
}

.health-device--active .device-name {
  grid-template-columns: 50px minmax(0, 1fr) auto;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #cfe5eb;
}

.health-device--active .device-name > i {
  width: 50px;
  height: 50px;
  background: linear-gradient(145deg, #0b93b4, #24b5ca);
  box-shadow: 0 6px 15px #0795b633;
}

.health-device--active .device-name > i svg {
  width: 34px;
  height: 34px;
}

.health-device--active .device-name b {
  font-size: 16px;
  line-height: 1.25;
}

.health-device--active .device-name small {
  margin-top: 4px;
  font-size: 11px;
}

.health-device--active .device-name em {
  padding: 6px 9px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.health-device--active dl {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: repeat(6, minmax(0, 1fr));
  margin: 8px 0 0;
}

.health-device--active dl > div,
.health-device--active dl > div:last-child {
  min-height: 0;
  grid-column: auto;
  display: grid;
  grid-template-columns: minmax(105px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 7px 3px;
  border-bottom: 1px solid #dbe9ed;
  font-size: 13px;
}

.health-device--active dl > div:last-child {
  border-bottom: 0;
}

.health-device--active dt {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #587786;
}

.health-device--active dt i {
  width: 27px;
  height: 27px;
  flex: 0 0 27px;
  display: grid;
  place-items: center;
  color: #0c8eaf;
  border-radius: 7px;
  background: #d9f0f5;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}

.health-device--active dd {
  color: #173f56;
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 1280px) {
  .media-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
}

@media (max-height: 760px) {
  .media-grid {
    gap: 9px;
    padding: 9px;
  }

  .media-grid img,
  .media-grid > button > i,
  .media-grid video {
    height: 100px;
  }

  .video-play {
    top: 50px;
  }
}

/* 告警面板信息密度较高，单独提高字号和行距，避免影响其他列表。 */
.alarm-panel > header {
  height: 46px;
  flex-basis: 46px;
  padding: 0 15px;
}

.alarm-panel > header b {
  font-size: 17px;
  letter-spacing: .2px;
}

.alarm-panel > header span {
  font-size: 12px;
}

.alarm-list > article {
  min-height: 54px;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 11px;
  box-sizing: border-box;
  padding: 9px 12px;
  transition: background .15s ease;
}

.alarm-list > article:hover {
  background: #f3f9fb;
}

.alarm-list i {
  min-width: 42px;
  box-sizing: border-box;
  padding: 5px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}

.alarm-list b {
  color: #1f4359;
  font-size: 13px;
  line-height: 1.35;
}

.alarm-list small {
  margin-top: 4px;
  color: #708b99;
  font-size: 11px;
  line-height: 1.3;
}

.alarm-list em {
  min-width: 40px;
  color: #587786;
  font-size: 11px;
  font-weight: 600;
  text-align: right;
}

@media (max-height: 760px) {
  .alarm-panel > header {
    height: 42px;
    flex-basis: 42px;
  }

  .alarm-list > article {
    min-height: 49px;
    padding-block: 7px;
  }
}

/* 机队总览统一采用告警面板的字号层级：17px 标题、13px 主信息、11-12px 辅助信息。 */
.panel > header {
  height: 46px;
  flex-basis: 46px;
  padding-inline: 15px;
}

.panel > header b {
  font-size: 17px;
  letter-spacing: .2px;
}

.panel > header span {
  font-size: 12px;
}

.fleet-cards article {
  min-height: 78px;
  gap: 14px;
  padding: 11px 16px;
}

.fleet-cards i {
  width: 42px;
  height: 42px;
  font-size: 18px;
}

.fleet-cards span {
  font-size: 13px;
  line-height: 1.3;
}

.fleet-cards b {
  margin: 3px 0;
  font-size: 25px;
}

.fleet-cards b small,
.fleet-cards em {
  font-size: 11px;
  line-height: 1.3;
}

.map-legend {
  padding: 8px 11px;
  font-size: 12px;
}

.subsection-title {
  min-height: 43px;
  flex-basis: 43px;
  padding-inline: 14px;
  font-size: 12px;
}

.subsection-title b {
  font-size: 14px;
}

.performance-title small,
.performance-title em {
  font-size: 11px;
}

.device-inventory-list button {
  min-height: 84px;
  gap: 11px;
  padding: 10px 14px;
}

.device-inventory-list b {
  font-size: 13px;
  line-height: 1.35;
}

.device-inventory-list small {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.35;
}

.device-inventory-list em {
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 600;
}

.performance-body {
  gap: 10px;
  padding: 12px 14px;
}

.performance-metrics {
  gap: 10px;
}

.performance-metrics article {
  padding: 11px 13px;
}

.performance-metrics span {
  font-size: 12px;
}

.performance-metrics b {
  margin-top: 6px;
  font-size: 21px;
}

.performance-metrics small {
  font-size: 11px;
}

.statistics-period {
  padding: 1px 3px;
  font-size: 12px;
}

.statistics-table > header,
.statistics-rows article {
  grid-template-columns: minmax(95px, 1.25fr) minmax(90px, 1fr) 58px 92px 88px;
  gap: 9px;
  padding: 7px 10px;
  font-size: 11px;
  line-height: 1.35;
}

.statistics-table > header {
  font-size: 12px;
}

.health-single {
  padding: 12px;
}

.health-device--active {
  padding: 16px;
}

.health-device--active .device-name b {
  font-size: 17px;
}

.health-device--active .device-name small,
.health-device--active .device-name em {
  font-size: 12px;
}

.health-device--active dl > div,
.health-device--active dl > div:last-child,
.health-device--active dd {
  font-size: 13px;
}

.health-device--active dt i {
  font-size: 12px;
}

.panel-empty small {
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 1280px) {
  .statistics-table > header,
  .statistics-rows article {
    grid-template-columns: minmax(80px, 1.2fr) minmax(75px, 1fr) 48px 76px 72px;
    gap: 6px;
    padding-inline: 7px;
  }
}

@media (max-height: 760px) {
  .panel > header {
    height: 42px;
    flex-basis: 42px;
  }

  .fleet-cards article {
    min-height: 64px;
    padding-block: 8px;
  }

  .device-inventory-list button {
    min-height: 70px;
    padding-block: 7px;
  }

  .performance-body {
    gap: 7px;
    padding-block: 8px;
  }

  .statistics-table > header,
  .statistics-rows article {
    padding-block: 5px;
  }
}
</style>
