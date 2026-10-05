<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LiveStream } from '@/adapters/dasFly'
import { isMockMode } from '@/api/client'
import { getGovernanceTaskPage, type GovernanceTask } from '@/api/governance-task'
import { getLiveStreams, getRoutes } from '@/api/patrol'
import { useUserStore } from '@/stores/user'
import { getTasks } from '@/mocks/portal'
import { createRoutesForTask, type FlightRoute } from '@/mocks/route-planning'
import LiveCruiseMap from './LiveCruiseMap.vue'

const props = withDefaults(defineProps<{ fullscreen?: boolean; initialDeviceId?: string }>(), { fullscreen: false, initialDeviceId: '' })
const emit = defineEmits<{ 'exit-fullscreen': [] }>()

const user = useUserStore()
const loading = ref(false)
const error = ref('')
const tasks = ref<GovernanceTask[]>([])
const routes = ref<FlightRoute[]>([])
const streams = ref<LiveStream[]>([])
const activeDeviceId = ref('')
const selectedTaskId = ref('')
const previewDeviceId = ref('')

const selectedDevice = computed(() => streams.value.find((item) => item.id === activeDeviceId.value))
const previewDevice = computed(() => streams.value.find((item) => item.id === previewDeviceId.value))
const previewDeviceIndex = computed(() => streams.value.findIndex((item) => item.id === previewDeviceId.value))
const routeGroups = computed(() => {
  const counts = new Map<string, number>()
  routes.value.forEach((route) => counts.set(route.taskId || '__unassigned__', (counts.get(route.taskId || '__unassigned__') || 0) + 1))
  const knownTasks = tasks.value.map((task) => ({
    id: task.id,
    name: task.name,
    scene: task.sceneName,
    status: task.taskStatusDesc,
    count: counts.get(task.id) || 0,
  })).filter((task) => task.count > 0)
  const unassigned = counts.get('__unassigned__') || 0
  if (unassigned) knownTasks.push({ id: '__unassigned__', name: '未关联任务', scene: '后端未返回 taskId', status: '待归属', count: unassigned })
  return knownTasks
})
const visibleRouteCount = computed(() => selectedTaskId.value
  ? routes.value.filter((route) => (route.taskId || '__unassigned__') === selectedTaskId.value).length
  : routes.value.length)

function mockStreams(mockRoutes: FlightRoute[]): LiveStream[] {
  const devices = new Map<string, FlightRoute>()
  mockRoutes.forEach((route) => {
    if (!devices.has(route.aircraft)) devices.set(route.aircraft, route)
  })
  return [...devices.values()].map((route, index) => ({
    id: `mock-live-${index + 1}`,
    flightId: route.taskId,
    aircraftId: `UAV-D3-${String(index + 1).padStart(3, '0')}`,
    aircraftName: route.aircraft,
    status: index === 0 ? 'ONLINE' : 'STARTING',
    protocol: 'HLS',
    playUrl: '',
  }))
}

async function loadOverview() {
  loading.value = true
  error.value = ''
  try {
    if (isMockMode()) {
      const mockTasks = getTasks(user.organizationId)
      tasks.value = mockTasks.map((task) => ({
        id: task.id,
        taskNo: task.id,
        sceneCode: task.sceneId,
        sceneName: task.sceneId,
        name: task.name,
        deptName: user.organization.shortName,
        refType: task.refType || 'NONE',
        refId: task.refId,
        executeMode: 'MANUAL',
        taskStatus: task.status === '已完成' ? 5 : task.status.includes('进行') ? 1 : 0,
        taskStatusDesc: task.status,
        priority: 0,
      }))
      routes.value = mockTasks.flatMap((task) => createRoutesForTask(task))
      streams.value = mockStreams(routes.value)
    } else {
      const [taskPage, routePage, streamPage] = await Promise.all([
        getGovernanceTaskPage({ pageNum: 1, pageSize: 200, deptId: user.activeDeptId }),
        getRoutes({ pageNum: 1, pageSize: 500 }),
        getLiveStreams(),
      ])
      tasks.value = taskPage.records
      routes.value = routePage.list
      streams.value = streamPage.list
    }
    const preferredDeviceId = props.initialDeviceId.trim()
    if (preferredDeviceId && streams.value.some((item) => item.id === preferredDeviceId)) activeDeviceId.value = preferredDeviceId
    else if (!activeDeviceId.value || !streams.value.some((item) => item.id === activeDeviceId.value)) activeDeviceId.value = streams.value[0]?.id || ''
    if (previewDeviceId.value && !streams.value.some((item) => item.id === previewDeviceId.value)) previewDeviceId.value = ''
    if (selectedTaskId.value && !routeGroups.value.some((task) => task.id === selectedTaskId.value)) selectedTaskId.value = ''
  } catch (reason) {
    tasks.value = []
    routes.value = []
    streams.value = []
    error.value = reason instanceof Error ? reason.message : '实时巡航数据加载失败'
  } finally {
    loading.value = false
  }
}

function selectTask(taskId: string) {
  selectedTaskId.value = selectedTaskId.value === taskId ? '' : taskId
}

function deviceLabel(stream: LiveStream) {
  return stream.aircraftName || stream.aircraftId || '未命名设备'
}

function openPreview(stream: LiveStream) {
  activeDeviceId.value = stream.id
  previewDeviceId.value = stream.id
}

function closePreview() {
  previewDeviceId.value = ''
}

function switchPreview(step: number) {
  if (streams.value.length < 2 || previewDeviceIndex.value < 0) return
  const nextIndex = (previewDeviceIndex.value + step + streams.value.length) % streams.value.length
  const next = streams.value[nextIndex]
  if (!next) return
  previewDeviceId.value = next.id
  activeDeviceId.value = next.id
}

function handlePreviewKeydown(event: KeyboardEvent) {
  if (!previewDevice.value) return
  if (event.key === 'Escape') closePreview()
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') switchPreview(-1)
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') switchPreview(1)
  else return
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', handlePreviewKeydown)
  void loadOverview()
})
onBeforeUnmount(() => window.removeEventListener('keydown', handlePreviewKeydown))
watch(() => user.activeDeptId, () => void loadOverview())
</script>

<template>
  <div class="global-live-cruise" :class="{ 'is-fullscreen': props.fullscreen }">
    <p v-if="error" class="overview-error">{{ error }}</p>

    <section v-if="props.fullscreen" class="fullscreen-live">
      <button type="button" class="fullscreen-exit" @click="emit('exit-fullscreen')">退出全屏</button>
      <div v-if="loading" class="fullscreen-empty">正在加载首路直播画面…</div>
      <div v-else-if="!selectedDevice" class="fullscreen-empty">暂无直播画面</div>
      <article v-else class="fullscreen-screen">
        <video v-if="selectedDevice.playUrl" :src="selectedDevice.playUrl" muted autoplay playsinline controls></video>
        <iframe v-else-if="selectedDevice.embedUrl" :src="selectedDevice.embedUrl" :title="`${deviceLabel(selectedDevice)} 实时直播`" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
        <div v-else class="fullscreen-empty">暂无可播放直播画面</div>
        <footer><b>{{ deviceLabel(selectedDevice) }}</b><span>● {{ selectedDevice.status }}</span></footer>
      </article>
    </section>

    <section v-if="!props.fullscreen" class="overview-main">
      <aside class="overview-panel device-panel">
        <div class="panel-title">直播设备 <span>{{ streams.length }} 台</span></div>
        <p class="panel-tip">点选设备名称，高亮对应直播小屏。</p>
        <div v-if="loading" class="empty-state">加载中…</div>
        <button
          v-for="stream in streams"
          :key="stream.id"
          type="button"
          class="device-row"
          :class="{ active: activeDeviceId === stream.id }"
          @click="activeDeviceId = stream.id"
        >
          <i :class="stream.status.toLowerCase()"></i>
          <span><b>{{ deviceLabel(stream) }}</b><small>{{ stream.aircraftId || '设备编号待同步' }}</small></span>
          <em>{{ stream.status === 'ONLINE' ? '直播中' : stream.status === 'STARTING' ? '连接中' : '离线' }}</em>
        </button>
        <div v-if="!loading && !streams.length" class="empty-state">暂无在线直播设备</div>
        <div v-if="selectedDevice" class="selected-device"><b>当前设备</b><span>{{ deviceLabel(selectedDevice) }}</span><small>{{ selectedDevice.protocol }} · {{ selectedDevice.status }}</small></div>
      </aside>

      <section class="overview-panel map-panel">
        <div class="panel-title">巡航区域地图 <span>{{ selectedTaskId ? '当前仅显示选中任务航线' : '当前显示全部任务航线' }}</span></div>
        <LiveCruiseMap :routes="routes" :selected-task-id="selectedTaskId" />
        <div class="map-legend"><i></i> 每种颜色代表一条航线 · {{ visibleRouteCount }} 条可见</div>
      </section>

      <aside class="overview-panel route-panel">
        <div class="panel-title">任务航线 <span>{{ routeGroups.length }} 个任务</span></div>
        <p class="panel-tip">点选任务后，地图仅显示该任务的航线。</p>
        <button type="button" class="route-row all-routes" :class="{ active: !selectedTaskId }" @click="selectedTaskId = ''"><span><b>全部任务航线</b><small>恢复显示所有任务</small></span><em>{{ routes.length }}</em></button>
        <button v-for="task in routeGroups" :key="task.id" type="button" class="route-row" :class="{ active: selectedTaskId === task.id }" @click="selectTask(task.id)">
          <span><b>{{ task.name }}</b><small>{{ task.scene }} · {{ task.status }}</small></span><em>{{ task.count }}</em>
        </button>
        <div v-if="!loading && !routeGroups.length" class="empty-state">暂无可绘制航线</div>
      </aside>
    </section>

    <section v-if="!props.fullscreen" class="video-wall-panel overview-panel">
      <div class="panel-title video-wall-title">
        <b>多屏直播</b>
        <div class="overview-actions"><span>{{ streams.length }} 路直播 · {{ routes.length }} 条航线</span><button type="button" @click="loadOverview">刷新</button></div>
        <span>悬停小屏查看状态，点击进入全屏直播</span>
      </div>
      <div v-if="loading" class="video-empty">正在加载直播设备…</div>
      <div v-else-if="!streams.length" class="video-empty">暂无在线直播画面</div>
      <div v-else class="video-wall">
        <article v-for="stream in streams" :key="stream.id" class="video-screen" :class="{ active: activeDeviceId === stream.id }" role="button" tabindex="0" :aria-label="`全屏预览${deviceLabel(stream)}`" @click="openPreview(stream)" @keydown.enter.prevent="openPreview(stream)" @keydown.space.prevent="openPreview(stream)">
          <video v-if="stream.playUrl" :src="stream.playUrl" muted autoplay playsinline controls></video>
          <iframe v-else-if="stream.embedUrl" :src="stream.embedUrl" :title="`${deviceLabel(stream)} 实时直播`" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
          <div v-else class="video-placeholder"><i>⌁</i><span>LIVE · {{ stream.aircraftId || '未命名设备' }}</span><small>{{ stream.status === 'ONLINE' ? '实时图传已连接' : '等待直播流接入' }}</small></div>
          <footer><b>{{ deviceLabel(stream) }}</b><span :class="stream.status.toLowerCase()">● {{ stream.status }}</span></footer>
        </article>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="previewDevice" class="live-preview-overlay" role="dialog" aria-modal="true" :aria-label="`${deviceLabel(previewDevice)} 全屏直播`" @click.self="closePreview">
        <button type="button" class="live-preview-close" aria-label="退出全屏" title="退出全屏（Esc）" @click="closePreview">退出全屏</button>
        <button v-if="streams.length > 1" type="button" class="live-preview-nav live-preview-nav--prev" aria-label="上一个直播" title="上一个直播（← / ↑）" @click="switchPreview(-1)">‹</button>
        <article class="live-preview-stage">
          <video v-if="previewDevice.playUrl" :key="previewDevice.id" :src="previewDevice.playUrl" muted autoplay playsinline controls></video>
          <iframe v-else-if="previewDevice.embedUrl" :key="previewDevice.id" :src="previewDevice.embedUrl" :title="`${deviceLabel(previewDevice)} 实时直播`" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
          <div v-else class="fullscreen-empty">暂无可播放直播画面</div>
          <footer><b>{{ deviceLabel(previewDevice) }}</b><span :class="previewDevice.status.toLowerCase()">● {{ previewDevice.status }}</span><small v-if="streams.length > 1">{{ previewDeviceIndex + 1 }} / {{ streams.length }}　方向键切换</small></footer>
        </article>
        <button v-if="streams.length > 1" type="button" class="live-preview-nav live-preview-nav--next" aria-label="下一个直播" title="下一个直播（→ / ↓）" @click="switchPreview(1)">›</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.global-live-cruise { height: 100%; min-height: 0; display: grid; grid-template-rows: minmax(300px, 1fr) minmax(190px, .56fr); gap: 8px; padding: 8px; background: #e8eef3; color: #1f3d52; }
.global-live-cruise.is-fullscreen { height: 100vh; padding: 0; display: block; background: #06121c; }.fullscreen-live { position: relative; width: 100%; height: 100%; display: grid; place-items: center; background: #3f494f; }.fullscreen-screen { position: relative; width: 100%; height: 100%; overflow: hidden; background: #3f494f; }.fullscreen-screen video,.fullscreen-screen iframe { width: 100%; height: 100%; display: block; border: 0; object-fit: contain; background: #3f494f; }.fullscreen-screen footer { position: absolute; right: 0; bottom: 0; left: 0; display: flex; justify-content: space-between; padding: 11px 16px; color: #fff; background: #02101bbf; font-size: 14px; pointer-events: none; }.fullscreen-screen footer span { color: #57edb0; }.fullscreen-exit { position: absolute; z-index: 3; top: 76px; right: 22px; padding: 9px 15px; border: 1px solid #76e9fb; border-radius: 4px; color: #e9fcff; background: #073a58e8; cursor: pointer; font-size: 14px; }.fullscreen-exit:hover { background: #09618a; }.fullscreen-empty { width: 100%; height: 100%; display: grid; place-items: center; color: #dce4e8; background: #58636b; font-size: 16px; }
.overview-actions { display: flex; align-items: center; gap: 8px; color: #6f8393; font-size: 11px; }.overview-actions button { padding: 4px 10px; border: 1px solid #1785c0; border-radius: 3px; color: #0876b6; background: #fff; cursor: pointer; }
.overview-error { position: absolute; z-index: 2; top: 72px; left: 50%; transform: translateX(-50%); margin: 0; padding: 7px 12px; color: #a85143; background: #fff2f0; border: 1px solid #f2b7ae; border-radius: 4px; font-size: 12px; }
.overview-main { min-height: 0; display: grid; grid-template-columns: 250px minmax(420px, 1fr) 270px; gap: 8px; }
.overview-panel { overflow: hidden; border: 1px solid #d5e0e8; border-radius: 6px; background: #fff; box-shadow: 0 2px 8px #1c3b5210; }.device-panel, .route-panel { display: flex; flex-direction: column; min-height: 0; }.map-panel { position: relative; display: flex; flex-direction: column; min-height: 0; }
.panel-title { height: 34px; flex: 0 0 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; color: #1f3d52; border-bottom: 1px solid #e6eef3; font-size: 12px; font-weight: 700; }.panel-title span { color: #7a8f9e; font-size: 10px; font-weight: 500; }
.panel-tip { margin: 0; padding: 8px 10px; color: #7a8f9e; border-bottom: 1px solid #eef3f6; font-size: 10px; }
.device-row, .route-row { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 10px; border: 0; border-bottom: 1px solid #eef3f6; color: #385669; background: #fff; text-align: left; cursor: pointer; }.device-row:hover, .route-row:hover, .device-row.active, .route-row.active { background: #e9f7ff; }.device-row.active, .route-row.active { box-shadow: inset 3px 0 #168bd0; }.device-row > span, .route-row > span { min-width: 0; flex: 1; }.device-row b, .route-row b, .device-row small, .route-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.device-row b, .route-row b { color: #1f3d52; font-size: 12px; }.device-row small, .route-row small { margin-top: 3px; color: #7a8f9e; font-size: 10px; }.device-row em, .route-row em { color: #0b81bd; font-style: normal; font-size: 10px; }.device-row i { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: #98a8b4; }.device-row i.online { background: #20bd70; box-shadow: 0 0 7px #20bd7090; }.device-row i.starting { background: #e6a72c; }.selected-device { margin: auto 8px 8px; padding: 9px; border-radius: 4px; color: #427084; background: #f0f8fc; font-size: 10px; }.selected-device b, .selected-device span, .selected-device small { display: block; }.selected-device span { margin: 3px 0; color: #0b6f9a; font-size: 12px; font-weight: 700; }
.map-panel :deep(.live-map) { flex: 1; min-height: 0; }.map-legend { position: absolute; left: 12px; bottom: 12px; padding: 6px 9px; color: #e7f7ff; background: #0a2d46dc; border-radius: 3px; font-size: 10px; }.map-legend i { display: inline-block; width: 14px; border-top: 3px solid #20c6d8; vertical-align: middle; }
.route-panel { overflow-y: auto; }.route-row { flex: 0 0 auto; }.route-row em { min-width: 20px; height: 20px; display: grid; place-items: center; border-radius: 10px; color: #0876b6; background: #e3f3fc; font-weight: 700; }.route-row.all-routes { background: #f8fbfd; }.empty-state { padding: 24px 10px; color: #91a4b0; text-align: center; font-size: 12px; }
.video-wall-panel { min-height: 0; display: flex; flex-direction: column; }.video-wall-title { justify-content: flex-start; gap: 18px; }.video-wall-title > span { margin-left: auto; }.video-wall { min-height: 0; flex: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 8px; overflow: auto; }.video-screen { position: relative; min-height: 125px; overflow: hidden; padding: 0; border: 2px solid transparent; border-radius: 5px; background: #082e47; cursor: pointer; transform: translateY(0); transition: transform .18s, border-color .18s, box-shadow .18s; }.video-screen:hover,.video-screen:focus-visible { z-index: 2; border-color: #49d9f2; box-shadow: 0 10px 22px #06304b55, 0 0 0 2px #11baf038; outline: none; transform: translateY(-5px); }.video-screen.active { border-color: #11baf0; box-shadow: 0 0 0 2px #11baf040; }.video-screen video, .video-screen iframe { width: 100%; height: 100%; border: 0; background: #061724; object-fit: cover; pointer-events: none; }.video-placeholder { height: 100%; min-height: 121px; display: grid; place-content: center; gap: 5px; color: #9fd7e8; background: linear-gradient(145deg, #154764, #06243a); }.video-placeholder i { color: #39cde1; font-size: 28px; font-style: normal; }.video-placeholder span { color: #f2d86d; font-size: 11px; }.video-placeholder small { color: #74b6ca; font-size: 10px; }.video-screen footer { position: absolute; right: 0; bottom: 0; left: 0; display: flex; justify-content: space-between; padding: 6px 8px; color: #fff; background: #061724bf; font-size: 10px; pointer-events: none; }.video-screen footer span.online { color: #55ecae; }.video-screen footer span.starting { color: #f3cb5d; }.video-empty { flex: 1; display: grid; place-items: center; color: #91a4b0; font-size: 12px; }
.live-preview-overlay { position:fixed; z-index:5000; inset:0; display:grid; place-items:center; overflow:hidden; color:#fff; background:#02080df5; backdrop-filter:blur(5px) }.live-preview-stage { position:absolute; inset:0; overflow:hidden; background:#02080d }.live-preview-stage>video,.live-preview-stage>iframe { width:100%; height:100%; display:block; border:0; background:#02080d; object-fit:contain; pointer-events:auto }.live-preview-stage>footer { position:absolute; z-index:2; right:0; bottom:0; left:0; display:flex; align-items:center; gap:16px; padding:14px 20px; color:#fff; background:#02101bcf; font-size:14px; pointer-events:none }.live-preview-stage>footer span.online{color:#55ecae}.live-preview-stage>footer span.starting{color:#f3cb5d}.live-preview-stage>footer small{margin-left:auto;color:#a9c4d0;font-size:12px}.live-preview-close { position:absolute; z-index:6; top:58px; right:24px; height:38px; padding:0 16px; color:#fff; background:#073a58e8; border:1px solid #76e9fb; border-radius:5px; box-shadow:0 5px 18px #0007; font-size:14px; font-weight:700; cursor:pointer }.live-preview-close:hover,.live-preview-close:focus-visible{background:#09618a;outline:2px solid #a2efff;outline-offset:2px}.live-preview-nav { position:absolute; z-index:5; top:50%; width:52px; height:78px; padding:0; color:#fff; background:#092c46b8; border:1px solid #ffffff55; border-radius:8px; box-shadow:0 8px 22px #0006; font-size:48px; line-height:1; cursor:pointer; transform:translateY(-50%); transition:background .16s,transform .16s }.live-preview-nav:hover,.live-preview-nav:focus-visible{background:#0b749c;outline:none;transform:translateY(-50%) scale(1.05)}.live-preview-nav--prev{left:22px}.live-preview-nav--next{right:22px}
.global-live-cruise:not(.is-fullscreen) { gap: 10px; padding: 10px; }.overview-main { grid-template-columns: 270px minmax(460px, 1fr) 290px; gap: 10px; }.overview-panel { border-color: #bfd3df; border-radius: 8px; box-shadow: 0 3px 12px #1c3b5218; }.panel-title { height: 42px; flex-basis: 42px; padding: 0 14px; color: #123b54; background: linear-gradient(90deg, #fbfdff, #f3f9fc); font-size: 16px; }.panel-title span { font-size: 12px; }.panel-tip { padding: 11px 14px; font-size: 13px; line-height: 1.45; }.device-row,.route-row { gap: 10px; padding: 12px 14px; }.device-row b,.route-row b { font-size: 14px; }.device-row small,.route-row small { margin-top: 4px; font-size: 12px; }.device-row em,.route-row em { font-size: 12px; }.device-row i { width: 10px; height: 10px; flex-basis: 10px; }.selected-device { margin: auto 10px 10px; padding: 12px; border: 1px solid #cfe5ef; font-size: 12px; }.selected-device span { font-size: 14px; }.map-legend { left: 14px; bottom: 14px; padding: 8px 12px; font-size: 12px; }.route-row em { min-width: 24px; height: 24px; border-radius: 12px; }.empty-state { padding: 30px 14px; font-size: 14px; }.video-wall { gap: 10px; padding: 10px; }.video-screen { min-height: 156px; border-radius: 7px; }.video-placeholder { min-height: 152px; gap: 7px; }.video-placeholder span { font-size: 13px; }.video-placeholder small { font-size: 12px; }.video-screen footer { padding: 9px 11px; font-size: 13px; }.video-empty { font-size: 14px; }.overview-actions { gap: 10px; font-size: 12px; }.overview-actions button { padding: 6px 13px; font-size: 13px; }
@media (max-width: 1350px) { .overview-main { grid-template-columns: 220px minmax(360px, 1fr) 230px; }.video-wall { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1120px) { .overview-main { grid-template-columns: clamp(190px,21vw,220px) minmax(330px,1fr) clamp(205px,22vw,230px); gap: 7px; }.global-live-cruise:not(.is-fullscreen) { gap: 7px; padding: 7px; }.panel-title { padding-inline: 9px; font-size: 14px; }.video-wall { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; padding: 7px; } }
</style>
