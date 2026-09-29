<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { LiveStream } from '@/adapters/dasFly'
import {
  getLiveStreams,
  getUavDeviceAlarms,
  getUavDeviceOptions,
  getUavDeviceState,
  getUavDeviceSummary,
  getUavFlightSummary,
  getUavFlightTaskOptions,
  type UavDeviceAlarm,
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
const liveStreams = ref<LiveStream[]>([])
const liveLoaded = ref(false)
const loading = ref(true)
const errorMessage = ref('')
const selectedDeviceId = ref('')
const fullscreenStream = ref<LiveStream>()
const deviceStates = ref<Record<string, UavDeviceState>>({})
const deviceAlarms = ref<UavDeviceAlarm[]>([])
const alarmTotal = ref<number>()
const alarmsLoaded = ref(false)
const flightSummary = ref<UavFlightSummary>()
const deviceSummary = ref<UavDeviceSummary>()

const activeDevice = computed(() => devices.value.find((device) => device.id === selectedDeviceId.value) || devices.value[0])
const activeDeviceState = computed(() => activeDevice.value?.sn ? deviceStates.value[activeDevice.value.sn] : undefined)
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
const activeTask = computed(() => {
  const sn = activeDevice.value?.sn
  if (!sn) return undefined
  return flightTasks.value.find((task) => /执行|飞行|巡航|进行/.test(task.status) && task.deviceName.includes(sn))
})

function valueOf(value: number | undefined) { return value === undefined ? '--' : String(value) }
function flightHours(value?: number) { return value === undefined ? '--' : (value / 3600).toFixed(1) }
function deviceState(device?: UavDeviceOption) { return device ? (device.online ? '在线' : '离线') : '--' }
function taskState(task: UavFlightTaskOption) { return task.status || '--' }
function alarmLevel(alarm: UavDeviceAlarm) {
  if (alarm.imminent || (alarm.level !== undefined && alarm.level >= 2)) return '严重'
  if (alarm.level === 1) return '警告'
  return alarm.level === undefined ? '--' : '提示'
}
function alarmTime(value?: string) { return value ? value.replace('T', ' ').slice(0, 16) : '--' }
function liveLabel(stream: LiveStream) { return stream.aircraftName || stream.aircraftId || '未命名设备' }
function openLiveFullscreen(stream: LiveStream) { fullscreenStream.value = stream }
function closeLiveFullscreen() { fullscreenStream.value = undefined }

async function loadFleetData() {
  loading.value = true
  errorMessage.value = ''
  const [deviceResult, taskResult, liveResult, flightSummaryResult, deviceSummaryResult] = await Promise.allSettled([
    getUavDeviceOptions(),
    getUavFlightTaskOptions({ pageNum: 1, pageSize: 200 }),
    getLiveStreams(),
    getUavFlightSummary(),
    getUavDeviceSummary(),
  ])
  if (deviceResult.status === 'fulfilled') {
    devices.value = deviceResult.value
    devicesLoaded.value = true
    if (!selectedDeviceId.value) selectedDeviceId.value = devices.value[0]?.id || ''
  } else {
    devices.value = []
    devicesLoaded.value = false
  }
  if (deviceResult.status === 'fulfilled') {
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
  if (liveResult.status === 'fulfilled') {
    liveStreams.value = liveResult.value.list
    liveLoaded.value = true
    if (fullscreenStream.value) fullscreenStream.value = liveStreams.value.find((stream) => stream.id === fullscreenStream.value?.id)
  } else {
    liveStreams.value = []
    liveLoaded.value = false
    fullscreenStream.value = undefined
  }
  flightSummary.value = flightSummaryResult.status === 'fulfilled' ? flightSummaryResult.value : undefined
  deviceSummary.value = deviceSummaryResult.status === 'fulfilled' ? deviceSummaryResult.value : undefined
  if (!devicesLoaded.value && !tasksLoaded.value && !liveLoaded.value) errorMessage.value = '无人机数据暂不可用，请稍后重试。'
  loading.value = false
}

const refreshTimer = window.setInterval(() => void loadFleetData(), 60_000)
onMounted(() => void loadFleetData())
onBeforeUnmount(() => window.clearInterval(refreshTimer))
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
      <article class="panel map-panel"><header><b>设备分布与作业态势</b></header><div class="map-wrap"><FleetOverviewMap :devices="devicesWithLocation" /><div v-if="devicesLoaded && !devicesWithLocation.length" class="map-empty">--<small>暂无设备位置数据</small></div><div class="map-legend"><span><i class="online" />在线</span><span><i class="offline" />离线</span></div></div></article>
      <div class="status-column">
        <article class="panel health-panel"><header><b>设备健康详情</b><span>实时状态</span></header><div v-if="activeDevice" class="health-body"><div class="device-name"><i><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 13h10l3 4-3 2H11l-3-2 3-4Z"/><path d="M9 15 5 10m18 5 4-5M9 19l-4 4m18-4 4 4"/><circle cx="4.5" cy="9.5" r="3"/><circle cx="27.5" cy="9.5" r="3"/><circle cx="4.5" cy="23.5" r="3"/><circle cx="27.5" cy="23.5" r="3"/></svg></i><div><b>{{ activeDevice.label }}</b><small>{{ activeDevice.sn || '--' }} · {{ activeDevice.model || '--' }}</small></div><em :class="{ online: activeDevice.online }">{{ deviceState(activeDevice) }}</em></div><dl><div><dt>飞行电池</dt><dd>{{ activeDeviceState?.batteryPercent === undefined ? '--' : `${activeDeviceState.batteryPercent}%` }}</dd></div><div><dt>飞行高度</dt><dd>{{ activeDeviceState?.height === undefined ? '--' : `${activeDeviceState.height} m` }}</dd></div><div><dt>水平速度</dt><dd>{{ activeDeviceState?.horizontalSpeed === undefined ? '--' : `${activeDeviceState.horizontalSpeed} m/s` }}</dd></div><div><dt>定位状态</dt><dd>{{ activeDeviceState?.longitude !== undefined && activeDeviceState?.latitude !== undefined ? '已定位' : '--' }}</dd></div><div><dt>当前任务</dt><dd>{{ activeTask?.name || '--' }}</dd></div></dl></div><div v-else class="panel-empty">--<small>暂无设备数据</small></div></article>
        <article class="panel alarm-panel"><header><b>设备告警与维保</b><span>告警 {{ alarmsLoaded ? valueOf(alarmTotal) : '--' }} · 维保 --</span></header><div v-if="deviceAlarms.length" class="alarm-list"><article v-for="alarm in deviceAlarms" :key="alarm.id"><i :class="{ severe: alarm.imminent || (alarm.level !== undefined && alarm.level >= 2), recovered: Boolean(alarm.recoverTime) }">{{ alarmLevel(alarm) }}</i><div><b>{{ alarm.message || alarm.code || '--' }}</b><small>{{ alarm.sn }} · {{ alarmTime(alarm.createTime) }}</small></div><em>{{ alarm.recoverTime ? '已恢复' : '未恢复' }}</em></article></div><div v-else class="panel-empty">--<small>{{ alarmsLoaded ? '暂无设备告警，暂无维保数据' : '设备告警数据暂不可用' }}</small></div></article>
      </div>
      <article class="panel live-wall-panel">
        <header><b>多屏直播</b><span>{{ liveLoaded ? `${liveStreams.length} 路直播` : '--' }}</span></header>
        <div v-if="liveStreams.length" class="live-wall">
          <button v-for="stream in liveStreams" :key="stream.id" type="button" class="live-tile" :aria-label="`全屏查看 ${liveLabel(stream)}`" @click="openLiveFullscreen(stream)">
            <video v-if="stream.playUrl" :src="stream.playUrl" muted autoplay playsinline></video>
            <iframe v-else-if="stream.embedUrl" :src="stream.embedUrl" :title="`${liveLabel(stream)} 直播预览`" tabindex="-1" aria-hidden="true"></iframe>
            <span v-else class="live-placeholder"><i>⌁</i><small>{{ stream.status === 'ONLINE' ? '实时图传已连接' : '等待直播流接入' }}</small></span>
            <footer><b>{{ liveLabel(stream) }}</b><em :class="stream.status.toLowerCase()">● {{ stream.status }}</em></footer>
          </button>
        </div>
        <div v-else class="panel-empty">--<small>{{ liveLoaded ? '暂无在线直播画面' : '直播数据暂不可用' }}</small></div>
      </article>
      <article class="panel task-panel"><header><b>飞行任务列表</b><span>{{ tasksLoaded ? `${taskTotal} 个任务` : '--' }}</span></header><div v-if="flightTasks.length" class="task-list"><button v-for="task in flightTasks" :key="task.id" type="button"><i :class="{ running: /执行|飞行|巡航|进行/.test(task.status) }" /><div><b>{{ task.name }}</b><small>{{ task.deviceName || '--' }} · {{ task.createTime || '--' }}</small></div><em>{{ taskState(task) }}</em></button></div><div v-else class="panel-empty">--<small>{{ errorMessage || '暂无飞行任务数据' }}</small></div></article>
    </section>
    <section v-if="fullscreenStream" class="live-fullscreen" role="dialog" aria-modal="true" :aria-label="`${liveLabel(fullscreenStream)} 全屏直播`">
      <button type="button" class="live-fullscreen__close" @click="closeLiveFullscreen">退出全屏</button>
      <video v-if="fullscreenStream.playUrl" :src="fullscreenStream.playUrl" muted autoplay playsinline controls></video>
      <iframe v-else-if="fullscreenStream.embedUrl" :src="fullscreenStream.embedUrl" :title="`${liveLabel(fullscreenStream)} 实时直播`" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
      <div v-else class="live-fullscreen__empty">暂无可播放直播画面</div>
      <footer><b>{{ liveLabel(fullscreenStream) }}</b><span>● {{ fullscreenStream.status }}</span></footer>
    </section>
  </section>
</template>

<style scoped lang="scss">
.fleet-overview{box-sizing:border-box;height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px;overflow:hidden;padding:16px;background:#edf4f7;color:#23475d}.fleet-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.fleet-cards article{display:flex;align-items:center;gap:12px;min-height:68px;padding:9px 14px;background:#fff;border:1px solid #d5e2e9;border-radius:8px;box-shadow:0 2px 7px #23485a0c}.fleet-cards i{display:grid;width:38px;height:38px;place-items:center;color:#087b9b;background:#e3f5f8;border-radius:9px;font-style:normal;font-size:17px;font-weight:700}.fleet-cards span,.fleet-cards b,.fleet-cards em{display:block}.fleet-cards span{color:#6e8796;font-size:12px}.fleet-cards b{margin:2px 0;color:#163d54;font-size:23px;line-height:1}.fleet-cards b small{margin-left:4px;font-size:11px}.fleet-cards em{color:#5b899d;font-size:10px;font-style:normal}.fleet-grid{min-height:0;display:grid;grid-template-columns:minmax(0,2.35fr) minmax(260px,.75fr);grid-template-rows:minmax(0,1.2fr) minmax(0,.8fr);gap:10px}.panel{min-height:0;overflow:hidden;background:#fff;border:1px solid #d5e2e9;border-radius:8px;box-shadow:0 2px 7px #23485a0c}.panel>header{height:39px;flex:0 0 39px;display:flex;align-items:center;justify-content:space-between;padding:0 13px;border-bottom:1px solid #e4edf2}.panel>header b{color:#21465d;font-size:13px}.panel>header span{color:#7891a0;font-size:10px}.map-panel,.task-panel,.live-wall-panel{display:flex;flex-direction:column}.map-wrap{position:relative;flex:1;min-height:0}.map-empty{position:absolute;inset:0;display:grid;place-content:center;color:#638092;background:#dbe8dcaa;text-align:center;font-size:28px;pointer-events:none}.map-empty small,.panel-empty small{display:block;margin-top:7px;font-size:12px}.map-legend{position:absolute;right:12px;bottom:12px;display:flex;gap:12px;padding:7px 9px;color:#527080;background:#ffffffe8;border:1px solid #c7dbe3;border-radius:4px;font-size:11px}.map-legend i{display:inline-block;width:8px;height:8px;margin-right:4px;border-radius:50%}.map-legend .online{background:#14b89c}.map-legend .offline{background:#8295a1}.status-column{min-height:0;display:grid;grid-template-rows:minmax(180px,.85fr) minmax(150px,1.15fr);gap:10px}.health-body{height:calc(100% - 39px);overflow-y:auto;padding:10px 12px;box-sizing:border-box}.device-name{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:8px;align-items:center}.device-name>i{display:grid;width:34px;height:34px;place-items:center;color:#fff;background:#0e9bb8;border-radius:8px;font-style:normal}.device-name b,.device-name small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.device-name b{color:#20455d;font-size:12px}.device-name small{margin-top:3px;color:#7991a0;font-size:9px}.device-name em{padding:4px 6px;color:#748b96;background:#eff3f5;border-radius:4px;font-size:9px;font-style:normal}.device-name em.online{color:#168364;background:#e2f7ef}.health-body dl{margin:7px 0 0}.health-body dl>div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #edf2f5;font-size:10px}.health-body dt{color:#78909e}.health-body dd{max-width:65%;margin:0;overflow:hidden;color:#31556a;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.alarm-panel{display:flex;flex-direction:column}.alarm-list{min-height:0;flex:1;overflow-y:auto}.alarm-list>article{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #edf2f5}.alarm-list i{padding:3px 4px;color:#a07118;background:#fff3cf;border-radius:3px;font-size:9px;font-style:normal;text-align:center}.alarm-list i.severe{color:#b73737;background:#ffe5e5}.alarm-list i.recovered{color:#477663;background:#e9f5ef}.alarm-list b,.alarm-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.alarm-list b{color:#2b4c60;font-size:10px}.alarm-list small{margin-top:3px;color:#8297a3;font-size:9px}.alarm-list em{color:#718b98;font-size:9px;font-style:normal}.task-list{min-height:0;flex:1;overflow-y:auto}.task-list button{width:100%;display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 12px;color:#2b4c60;background:#fff;border:0;border-bottom:1px solid #edf2f5;text-align:left}.task-list i{width:7px;height:7px;border-radius:50%;background:#91a3ad}.task-list i.running{background:#13b895;box-shadow:0 0 5px #13b895}.task-list b,.task-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-list b{font-size:11px}.task-list small{margin-top:3px;color:#7b94a2;font-size:9px}.task-list em{color:#4f7d92;font-size:10px;font-style:normal}.panel-empty{display:grid;height:calc(100% - 39px);place-content:center;color:#7d96a4;text-align:center;font-size:26px}.live-wall{min-height:0;flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:7px;overflow-y:auto}.live-tile{position:relative;min-height:110px;overflow:hidden;padding:0;border:2px solid transparent;border-radius:5px;background:#06243a;cursor:pointer}.live-tile:hover,.live-tile:focus-visible{border-color:#19bce4;outline:0}.live-tile video,.live-tile iframe{width:100%;height:100%;display:block;border:0;object-fit:cover;background:#061724;pointer-events:none}.live-placeholder{height:100%;min-height:106px;display:grid;place-content:center;gap:5px;color:#8ed1e3;background:linear-gradient(145deg,#154764,#06243a)}.live-placeholder i{font-size:24px;font-style:normal}.live-placeholder small{font-size:10px}.live-tile footer{position:absolute;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:space-between;padding:6px 8px;color:#fff;background:#061724d9;font-size:10px;pointer-events:none}.live-tile footer b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.live-tile footer em{flex:0 0 auto;color:#9bb5c0;font-style:normal}.live-tile footer em.online{color:#55ecae}.live-tile footer em.starting{color:#f3cb5d}.live-fullscreen{position:fixed;z-index:2500;inset:0;display:grid;place-items:center;background:#020b12}.live-fullscreen video,.live-fullscreen iframe{width:100%;height:100%;display:block;border:0;object-fit:contain;background:#020b12}.live-fullscreen__close{position:absolute;z-index:2;top:22px;right:22px;padding:9px 16px;color:#effdff;border:1px solid #62dff3;border-radius:4px;background:#073a58e8;cursor:pointer}.live-fullscreen__close:hover{background:#09618a}.live-fullscreen__empty{color:#b9cbd2}.live-fullscreen>footer{position:absolute;right:0;bottom:0;left:0;display:flex;justify-content:space-between;padding:12px 18px;color:#fff;background:#02101bcf;pointer-events:none}.live-fullscreen>footer span{color:#57edb0}@media(max-width:1200px){.fleet-grid{grid-template-columns:minmax(0,1fr) minmax(230px,.72fr)}.live-wall{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-height:760px){.fleet-overview{gap:8px;padding:10px}.fleet-cards{gap:7px}.fleet-cards article{min-height:54px;padding:6px 10px}.fleet-cards i{width:32px;height:32px}.fleet-cards b{font-size:19px}.fleet-grid{gap:7px}.status-column{grid-template-rows:minmax(150px,.8fr) minmax(120px,1.2fr);gap:7px}.panel>header{height:34px;flex-basis:34px}.health-body{height:calc(100% - 34px);padding:7px 9px}.health-body dl>div{padding:3px 0}.live-tile{min-height:88px}.live-placeholder{min-height:84px}}
.fleet-overview{box-sizing:border-box;height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px;overflow:hidden;padding:16px;background:#edf4f7;color:#23475d}.fleet-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.fleet-cards article{display:flex;align-items:center;gap:12px;min-height:68px;padding:9px 14px;background:#fff;border:1px solid #d5e2e9;border-radius:8px;box-shadow:0 2px 7px #23485a0c}.fleet-cards i{display:grid;width:38px;height:38px;place-items:center;color:#087b9b;background:#e3f5f8;border-radius:9px;font-style:normal;font-size:17px;font-weight:700}.fleet-cards span,.fleet-cards b,.fleet-cards em{display:block}.fleet-cards span{color:#6e8796;font-size:12px}.fleet-cards b{margin:2px 0;color:#163d54;font-size:23px;line-height:1}.fleet-cards b small{margin-left:4px;font-size:11px}.fleet-cards em{color:#5b899d;font-size:10px;font-style:normal}.fleet-grid{min-height:0;display:grid;grid-template-columns:minmax(0,2.35fr) minmax(260px,.75fr);grid-template-rows:minmax(0,1.2fr) minmax(0,.8fr);gap:10px}.panel{min-height:0;overflow:hidden;background:#fff;border:1px solid #d5e2e9;border-radius:8px;box-shadow:0 2px 7px #23485a0c}.panel>header{height:39px;flex:0 0 39px;display:flex;align-items:center;justify-content:space-between;padding:0 13px;border-bottom:1px solid #e4edf2}.panel>header b{color:#21465d;font-size:13px}.panel>header span{color:#7891a0;font-size:10px}.map-panel,.task-panel,.live-wall-panel{display:flex;flex-direction:column}.map-panel>header b,.live-wall-panel>header b,.status-column .panel>header b,.task-panel>header b{font-size:15px}.map-wrap{position:relative;flex:1;min-height:0}.map-empty{position:absolute;inset:0;display:grid;place-content:center;color:#638092;background:#dbe8dcaa;text-align:center;font-size:28px;pointer-events:none}.map-empty small,.panel-empty small{display:block;margin-top:7px;font-size:12px}.map-legend{position:absolute;right:12px;bottom:12px;display:flex;gap:12px;padding:7px 9px;color:#527080;background:#ffffffe8;border:1px solid #c7dbe3;border-radius:4px;font-size:11px}.map-legend i{display:inline-block;width:8px;height:8px;margin-right:4px;border-radius:50%}.map-legend .online{background:#14b89c}.map-legend .offline{background:#8295a1}.status-column{min-height:0;display:grid;grid-template-rows:minmax(235px,1.05fr) minmax(120px,.95fr);gap:10px}.status-column .panel>header span,.task-panel>header span{font-size:12px}.health-body{height:calc(100% - 39px);overflow-y:auto;padding:11px 13px;box-sizing:border-box}.device-name{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:9px;align-items:center}.device-name>i{display:grid;width:36px;height:36px;place-items:center;color:#fff;background:#0e9bb8;border-radius:50%;font-style:normal}.device-name>i svg{width:25px;height:25px;fill:currentColor;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.device-name b,.device-name small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.device-name b{color:#20455d;font-size:14px}.device-name small{margin-top:3px;color:#7991a0;font-size:11px}.device-name em{padding:4px 7px;color:#748b96;background:#eff3f5;border-radius:4px;font-size:11px;font-style:normal}.device-name em.online{color:#168364;background:#e2f7ef}.health-body dl{margin:8px 0 0}.health-body dl>div{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #edf2f5;font-size:12px}.health-body dt{color:#78909e}.health-body dd{max-width:65%;margin:0;overflow:hidden;color:#31556a;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.alarm-panel{display:flex;flex-direction:column}.alarm-list{min-height:0;flex:1;overflow-y:auto}.alarm-list>article{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:9px;padding:9px 11px;border-bottom:1px solid #edf2f5}.alarm-list i{padding:4px;color:#a07118;background:#fff3cf;border-radius:3px;font-size:10px;font-style:normal;text-align:center}.alarm-list i.severe{color:#b73737;background:#ffe5e5}.alarm-list i.recovered{color:#477663;background:#e9f5ef}.alarm-list b,.alarm-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.alarm-list b{color:#2b4c60;font-size:12px}.alarm-list small{margin-top:3px;color:#8297a3;font-size:10px}.alarm-list em{color:#718b98;font-size:10px;font-style:normal}.task-list{min-height:0;flex:1;overflow-y:auto}.task-list button{width:100%;display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 12px;color:#2b4c60;background:#fff;border:0;border-bottom:1px solid #edf2f5;text-align:left}.task-list i{width:8px;height:8px;border-radius:50%;background:#91a3ad}.task-list i.running{background:#13b895;box-shadow:0 0 5px #13b895}.task-list b,.task-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-list b{font-size:12px}.task-list small{margin-top:3px;color:#7b94a2;font-size:10px}.task-list em{color:#4f7d92;font-size:11px;font-style:normal}.panel-empty{display:grid;height:calc(100% - 39px);place-content:center;color:#7d96a4;text-align:center;font-size:26px}.live-wall{min-height:0;flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:7px;overflow-y:auto}.live-tile{position:relative;min-height:110px;overflow:hidden;padding:0;border:2px solid transparent;border-radius:5px;background:#06243a;cursor:pointer}.live-tile:hover,.live-tile:focus-visible{border-color:#19bce4;outline:0}.live-tile video,.live-tile iframe{width:100%;height:100%;display:block;border:0;object-fit:cover;background:#061724;pointer-events:none}.live-placeholder{height:100%;min-height:106px;display:grid;place-content:center;gap:5px;color:#8ed1e3;background:linear-gradient(145deg,#154764,#06243a)}.live-placeholder i{font-size:24px;font-style:normal}.live-placeholder small{font-size:10px}.live-tile footer{position:absolute;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:space-between;padding:6px 8px;color:#fff;background:#061724d9;font-size:10px;pointer-events:none}.live-tile footer b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.live-tile footer em{flex:0 0 auto;color:#9bb5c0;font-style:normal}.live-tile footer em.online{color:#55ecae}.live-tile footer em.starting{color:#f3cb5d}.live-fullscreen{position:fixed;z-index:2500;inset:0;display:grid;place-items:center;background:#020b12}.live-fullscreen video,.live-fullscreen iframe{width:100%;height:100%;display:block;border:0;object-fit:contain;background:#020b12}.live-fullscreen__close{position:absolute;z-index:2;top:22px;right:22px;padding:9px 16px;color:#effdff;border:1px solid #62dff3;border-radius:4px;background:#073a58e8;cursor:pointer}.live-fullscreen__close:hover{background:#09618a}.live-fullscreen__empty{color:#b9cbd2}.live-fullscreen>footer{position:absolute;right:0;bottom:0;left:0;display:flex;justify-content:space-between;padding:12px 18px;color:#fff;background:#02101bcf;pointer-events:none}.live-fullscreen>footer span{color:#57edb0}@media(max-width:1200px){.fleet-grid{grid-template-columns:minmax(0,1fr) minmax(230px,.72fr)}.live-wall{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-height:760px){.fleet-overview{gap:8px;padding:10px}.fleet-cards{gap:7px}.fleet-cards article{min-height:54px;padding:6px 10px}.fleet-cards i{width:32px;height:32px}.fleet-cards b{font-size:19px}.fleet-grid{gap:7px}.status-column{grid-template-rows:minmax(195px,1.1fr) minmax(90px,.9fr);gap:7px}.panel>header{height:34px;flex-basis:34px}.health-body{height:calc(100% - 34px);padding:7px 9px}.health-body dl>div{padding:4px 0}.live-tile{min-height:88px}.live-placeholder{min-height:84px}}
</style>
