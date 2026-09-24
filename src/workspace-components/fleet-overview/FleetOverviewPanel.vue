<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getUavDeviceOptions, getUavFlightTaskOptions, type UavDeviceOption, type UavFlightTaskOption } from '@/api/patrol'
import FleetOverviewMap from './FleetOverviewMap.vue'

const devices = ref<UavDeviceOption[]>([])
const flightTasks = ref<UavFlightTaskOption[]>([])
const taskTotal = ref<number>()
const devicesLoaded = ref(false)
const tasksLoaded = ref(false)
const loading = ref(true)
const errorMessage = ref('')
const selectedDeviceId = ref('')

const onlineDevices = computed(() => devices.value.filter((device) => device.online))
const activeDevice = computed(() => devices.value.find((device) => device.id === selectedDeviceId.value) || devices.value[0])
const runningTasks = computed(() => flightTasks.value.filter((task) => /执行|飞行|巡航|进行/.test(task.status)).length)
const devicesWithLocation = computed(() => devices.value.filter((device) => device.longitude !== undefined && device.latitude !== undefined))

function valueOf(value: number | undefined) { return value === undefined ? '--' : String(value) }
function deviceState(device?: UavDeviceOption) { return device ? (device.online ? '在线' : '离线') : '--' }
function taskState(task: UavFlightTaskOption) { return task.status || '--' }

async function loadFleetData() {
  loading.value = true
  errorMessage.value = ''
  const [deviceResult, taskResult] = await Promise.allSettled([
    getUavDeviceOptions(),
    getUavFlightTaskOptions({ pageNum: 1, pageSize: 200 }),
  ])
  if (deviceResult.status === 'fulfilled') {
    devices.value = deviceResult.value
    devicesLoaded.value = true
    if (!selectedDeviceId.value) selectedDeviceId.value = devices.value[0]?.id || ''
  } else {
    devices.value = []
    devicesLoaded.value = false
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
  if (!devicesLoaded.value && !tasksLoaded.value) errorMessage.value = '无人机数据暂不可用，请稍后重试。'
  loading.value = false
}

const refreshTimer = window.setInterval(() => void loadFleetData(), 60_000)
onMounted(() => void loadFleetData())
onBeforeUnmount(() => window.clearInterval(refreshTimer))
</script>

<template>
  <section class="fleet-overview">
    <header class="fleet-heading"><div><h1>机队总览</h1><p>设备在线、飞行任务与设备状态的统一运行视图</p></div><div><span>{{ loading ? '正在刷新…' : '设备状态实时刷新' }}</span><button type="button" @click="loadFleetData">刷新</button></div></header>
    <section class="fleet-cards">
      <article><i>机</i><div><span>无人机总数</span><b>{{ devicesLoaded ? valueOf(devices.length) : '--' }}<small>架</small></b><em>在线 {{ devicesLoaded ? onlineDevices.length : '--' }} · 离线 {{ devicesLoaded ? devices.length - onlineDevices.length : '--' }}</em></div></article>
      <article><i>务</i><div><span>飞行任务</span><b>{{ tasksLoaded ? valueOf(taskTotal) : '--' }}<small>个</small></b><em>执行中 {{ tasksLoaded ? runningTasks : '--' }}</em></div></article>
      <article><i>时</i><div><span>今日飞行</span><b>--<small>小时</small></b><em>暂无真实飞行时长数据</em></div></article>
      <article><i>率</i><div><span>机队可用率</span><b>--<small>%</small></b><em>暂无真实可用率数据</em></div></article>
    </section>
    <section class="fleet-grid">
      <article class="panel map-panel"><header><b>设备分布与作业态势</b><span>默认范围：泰州市</span></header><div class="map-wrap"><FleetOverviewMap :devices="devicesWithLocation" /><div v-if="devicesLoaded && !devicesWithLocation.length" class="map-empty">--<small>暂无设备位置数据</small></div><div class="map-legend"><span><i class="online" />在线</span><span><i class="offline" />离线</span></div></div></article>
      <article class="panel health-panel"><header><b>设备健康详情</b><span>实时状态</span></header><div v-if="activeDevice" class="health-body"><div class="device-name"><i>✦</i><div><b>{{ activeDevice.label }}</b><small>{{ activeDevice.sn || '--' }} · {{ activeDevice.model || '--' }}</small></div><em :class="{ online: activeDevice.online }">{{ deviceState(activeDevice) }}</em></div><div class="health-score"><b>--</b><span>健康评分</span></div><dl><div><dt>飞行电池</dt><dd>--</dd></div><div><dt>图传链路</dt><dd>--</dd></div><div><dt>机身温度</dt><dd>--</dd></div><div><dt>定位状态</dt><dd>--</dd></div><div><dt>当前任务</dt><dd>--</dd></div></dl></div><div v-else class="panel-empty">--<small>暂无设备数据</small></div></article>
      <article class="panel task-panel"><header><b>飞行任务列表</b><span>{{ tasksLoaded ? `${taskTotal} 个任务` : '--' }}</span></header><div v-if="flightTasks.length" class="task-list"><button v-for="task in flightTasks.slice(0, 7)" :key="task.id" type="button"><i :class="{ running: /执行|飞行|巡航|进行/.test(task.status) }" /><div><b>{{ task.name }}</b><small>{{ task.deviceName || '--' }} · {{ task.createTime || '--' }}</small></div><em>{{ taskState(task) }}</em></button></div><div v-else class="panel-empty">--<small>{{ errorMessage || '暂无飞行任务数据' }}</small></div></article>
      <article class="panel event-panel"><header><b>设备告警与维保</b><span>全部记录</span></header><div class="panel-empty">--<small>暂无真实告警与维保数据</small></div></article>
    </section>
  </section>
</template>

<style scoped lang="scss">
.fleet-overview{height:100%;min-height:0;overflow:auto;padding:22px;background:#edf4f7;color:#23475d}.fleet-heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:17px}.fleet-heading h1{margin:0;color:#173f57;font-size:26px}.fleet-heading p{margin:6px 0 0;color:#6c8798;font-size:13px}.fleet-heading>div:last-child{display:flex;align-items:center;gap:10px;color:#7190a0;font-size:12px}.fleet-heading button{height:28px;padding:0 11px;color:#19799a;background:#fff;border:1px solid #9fcfdf;border-radius:4px;cursor:pointer}.fleet-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.fleet-cards article{display:flex;align-items:center;gap:14px;min-height:82px;padding:12px 17px;background:#fff;border:1px solid #d5e2e9;border-radius:8px;box-shadow:0 2px 7px #23485a0c}.fleet-cards i{display:grid;width:42px;height:42px;place-items:center;color:#087b9b;background:#e3f5f8;border-radius:9px;font-style:normal;font-size:18px;font-weight:700}.fleet-cards span,.fleet-cards b,.fleet-cards em{display:block}.fleet-cards span{color:#6e8796;font-size:13px}.fleet-cards b{margin:4px 0;color:#163d54;font-size:27px}.fleet-cards b small{margin-left:4px;font-size:12px}.fleet-cards em{color:#5b899d;font-size:11px;font-style:normal}.fleet-grid{display:grid;grid-template-columns:minmax(0,2.35fr) minmax(280px,.75fr);grid-template-rows:minmax(315px,1.2fr) minmax(195px,.8fr);gap:13px;margin-top:13px}.panel{min-height:0;overflow:hidden;background:#fff;border:1px solid #d5e2e9;border-radius:8px;box-shadow:0 2px 7px #23485a0c}.panel>header{height:43px;display:flex;align-items:center;justify-content:space-between;padding:0 15px;border-bottom:1px solid #e4edf2}.panel>header b{color:#21465d;font-size:14px}.panel>header span{color:#7891a0;font-size:11px}.map-panel{display:flex;flex-direction:column}.map-wrap{position:relative;flex:1;min-height:0}.map-empty{position:absolute;inset:0;display:grid;place-content:center;color:#638092;background:#dbe8dcaa;text-align:center;font-size:28px;pointer-events:none}.map-empty small,.panel-empty small{display:block;margin-top:7px;font-size:12px}.map-legend{position:absolute;right:12px;bottom:12px;display:flex;gap:12px;padding:7px 9px;color:#527080;background:#ffffffe8;border:1px solid #c7dbe3;border-radius:4px;font-size:11px}.map-legend i{display:inline-block;width:8px;height:8px;margin-right:4px;border-radius:50%}.map-legend .online{background:#14b89c}.map-legend .offline{background:#8295a1}.health-body{padding:16px}.device-name{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:9px;align-items:center}.device-name>i{display:grid;width:38px;height:38px;place-items:center;color:#fff;background:#0e9bb8;border-radius:8px;font-style:normal}.device-name b,.device-name small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.device-name b{color:#20455d;font-size:13px}.device-name small{margin-top:4px;color:#7991a0;font-size:10px}.device-name em{padding:4px 6px;color:#748b96;background:#eff3f5;border-radius:4px;font-size:10px;font-style:normal}.device-name em.online{color:#168364;background:#e2f7ef}.health-score{display:grid;place-content:center;width:112px;height:112px;margin:18px auto;border:8px solid #dcecf0;border-top-color:#14b89c;border-right-color:#14b89c;border-radius:50%;text-align:center}.health-score b{color:#618191;font-size:25px}.health-score span{color:#7893a0;font-size:10px}.health-body dl{margin:0}.health-body dl>div{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #edf2f5;font-size:11px}.health-body dt{color:#78909e}.health-body dd{margin:0;color:#31556a;font-weight:600}.task-list{max-height:100%;overflow:auto}.task-list button{width:100%;display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px 14px;color:#2b4c60;background:#fff;border:0;border-bottom:1px solid #edf2f5;text-align:left}.task-list i{width:7px;height:7px;border-radius:50%;background:#91a3ad}.task-list i.running{background:#13b895;box-shadow:0 0 5px #13b895}.task-list b,.task-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-list b{font-size:12px}.task-list small{margin-top:4px;color:#7b94a2;font-size:10px}.task-list em{color:#4f7d92;font-size:11px;font-style:normal}.panel-empty{display:grid;height:calc(100% - 43px);place-content:center;color:#7d96a4;text-align:center;font-size:28px}.event-panel{display:flex;flex-direction:column}@media(max-width:1200px){.fleet-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.fleet-grid{grid-template-columns:minmax(0,1fr);grid-template-rows:380px auto auto auto}.health-panel{min-height:300px}}
</style>
