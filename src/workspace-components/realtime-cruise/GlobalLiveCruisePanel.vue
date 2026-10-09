<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LiveStream } from '@/adapters/dasFly'
import { isMockMode } from '@/api/client'
import { getLiveStreams, getRoutes, getUavComponentUrl, getUavFlightTaskOptions, type UavFlightTaskOption } from '@/api/patrol'
import { useUserStore } from '@/stores/user'
import { getTasks } from '@/mocks/portal'
import { createRoutesForTask, type FlightRoute } from '@/mocks/route-planning'

const props = withDefaults(defineProps<{ fullscreen?: boolean; initialDeviceId?: string }>(), { fullscreen: false, initialDeviceId: '' })
const emit = defineEmits<{ 'exit-fullscreen': [] }>()

const user = useUserStore()
const loading = ref(false)
const error = ref('')
const routes = ref<FlightRoute[]>([])
const streams = ref<LiveStream[]>([])
type PlaybackFlightTask = UavFlightTaskOption & {
  availability: 'checking' | 'available' | 'unavailable'
  componentUrl?: string
  unavailableReason?: string
}
const flightTasks = ref<PlaybackFlightTask[]>([])
const activeDeviceId = ref('')
const selectedFlightTaskId = ref('')
const flightTaskKeyword = ref('')
const playbackUrl = ref('')
const playbackLoading = ref(false)
const playbackError = ref('')
const playbackPanel = ref<HTMLElement>()
const playbackFullscreen = ref(false)
const fullscreenHintVisible = ref(false)
const previewDeviceId = ref('')
let flightTaskValidationVersion = 0
let fullscreenHintTimer: ReturnType<typeof window.setTimeout> | undefined

const selectedDevice = computed(() => streams.value.find((item) => item.id === activeDeviceId.value))
const previewDevice = computed(() => streams.value.find((item) => item.id === previewDeviceId.value))
const previewDeviceIndex = computed(() => streams.value.findIndex((item) => item.id === previewDeviceId.value))
const selectedFlightTask = computed(() => flightTasks.value.find((item) => item.id === selectedFlightTaskId.value))
const filteredFlightTasks = computed(() => {
  const keyword = flightTaskKeyword.value.trim().toLowerCase()
  const source = keyword
    ? flightTasks.value.filter((item) => `${item.name}${item.waylineName}${item.deviceName}${item.id}${item.status}${item.unavailableReason || ''}`.toLowerCase().includes(keyword))
    : flightTasks.value
  const rank = { available: 0, checking: 1, unavailable: 2 }
  return [...source].sort((left, right) => rank[left.availability] - rank[right.availability])
})
const playbackEmbedUrl = computed(() => {
  if (!playbackUrl.value) return ''
  try {
    const source = new URL(playbackUrl.value)
    if (source.hostname !== 'fly-api.get3d.cn') return source.toString()
    const componentPage = new URL('https://fly.get3d.cn')
    componentPage.pathname = source.pathname
    componentPage.search = source.search
    componentPage.hash = source.hash
    return componentPage.toString()
  } catch {
    return playbackUrl.value
  }
})
const playbackStateText = computed(() => playbackError.value
  || (selectedFlightTask.value
    ? `已选择“${selectedFlightTask.value.name}”，点击右上角“进入轨迹回放”加载对应开放组件。`
    : '请选择具有有效飞行任务 ID 的任务，确认后将进入对应的开放组件。'))

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

function prepareFlightTasks(items: UavFlightTaskOption[]) {
  return items.filter((item) => Boolean(item.id?.trim())).map<PlaybackFlightTask>((item) => ({
    ...item,
    availability: 'checking',
  }))
}

function updateFlightTask(id: string, patch: Partial<PlaybackFlightTask>) {
  flightTasks.value = flightTasks.value.map((item) => item.id === id ? { ...item, ...patch } : item)
}

async function validateFlightTasks(items: PlaybackFlightTask[], version: number) {
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const task = items[nextIndex++]
      if (!task || version !== flightTaskValidationVersion) return
      try {
        const componentUrl = await getUavComponentUrl('TRAJECTORY_PLAYBACK', { flightTaskId: task.id })
        if (version !== flightTaskValidationVersion) return
        updateFlightTask(task.id, { availability: 'available', componentUrl, unavailableReason: undefined })
      } catch (reason) {
        if (version !== flightTaskValidationVersion) return
        const unavailableReason = reason instanceof Error ? reason.message : '无法获取轨迹回放授权。'
        updateFlightTask(task.id, { availability: 'unavailable', componentUrl: undefined, unavailableReason })
        if (selectedFlightTaskId.value === task.id) selectedFlightTaskId.value = ''
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, () => worker()))
  if (version !== flightTaskValidationVersion) return
  const firstAvailable = filteredFlightTasks.value.find((item) => item.availability === 'available')
  const currentAvailable = flightTasks.value.some((item) => item.id === selectedFlightTaskId.value && item.availability === 'available')
  if (!currentAvailable && firstAvailable) {
    selectedFlightTaskId.value = firstAvailable.id
    await enterTrajectoryPlayback()
  }
}

async function loadOverview() {
  const validationVersion = ++flightTaskValidationVersion
  loading.value = true
  error.value = ''
  try {
    if (isMockMode()) {
      const mockTasks = getTasks(user.organizationId)
      routes.value = mockTasks.flatMap((task) => createRoutesForTask(task))
      streams.value = mockStreams(routes.value)
      flightTasks.value = prepareFlightTasks((await getUavFlightTaskOptions({ pageNum: 1, pageSize: 200 })).list)
    } else {
      const [routePage, streamPage, flightTaskPage] = await Promise.all([
        getRoutes({ pageNum: 1, pageSize: 500 }),
        getLiveStreams(),
        getUavFlightTaskOptions({ pageNum: 1, pageSize: 200 }),
      ])
      routes.value = routePage.list
      streams.value = streamPage.list
      flightTasks.value = prepareFlightTasks(flightTaskPage.list)
    }
    const preferredDeviceId = props.initialDeviceId.trim()
    if (preferredDeviceId && streams.value.some((item) => item.id === preferredDeviceId)) activeDeviceId.value = preferredDeviceId
    else if (!activeDeviceId.value || !streams.value.some((item) => item.id === activeDeviceId.value)) activeDeviceId.value = streams.value[0]?.id || ''
    if (previewDeviceId.value && !streams.value.some((item) => item.id === previewDeviceId.value)) previewDeviceId.value = ''
    if (selectedFlightTaskId.value && !flightTasks.value.some((task) => task.id === selectedFlightTaskId.value)) {
      selectedFlightTaskId.value = ''
      playbackUrl.value = ''
    }
    void validateFlightTasks([...flightTasks.value], validationVersion)
  } catch (reason) {
    routes.value = []
    streams.value = []
    flightTasks.value = []
    error.value = reason instanceof Error ? reason.message : '实时巡航数据加载失败'
  } finally {
    loading.value = false
  }
}

async function selectFlightTask(taskId: string) {
  const task = flightTasks.value.find((item) => item.id === taskId)
  if (task?.availability !== 'available') return
  if (selectedFlightTaskId.value === taskId && playbackEmbedUrl.value) return
  playbackUrl.value = ''
  selectedFlightTaskId.value = taskId
  playbackError.value = ''
  await enterTrajectoryPlayback()
}

async function enterTrajectoryPlayback() {
  playbackUrl.value = ''
  playbackError.value = ''
  const task = selectedFlightTask.value
  if (!task?.id?.trim() || task.availability !== 'available') {
    playbackError.value = '请选择具有有效飞行任务 ID 的任务，确认后将进入对应的开放组件。'
    return
  }
  playbackLoading.value = true
  try {
    playbackUrl.value = task.componentUrl || await getUavComponentUrl('TRAJECTORY_PLAYBACK', { flightTaskId: task.id })
  } catch (reason) {
    playbackError.value = reason instanceof Error ? reason.message : '轨迹回放开放组件加载失败，请重新选择飞行任务后重试。'
    updateFlightTask(task.id, { availability: 'unavailable', componentUrl: undefined, unavailableReason: playbackError.value })
    selectedFlightTaskId.value = ''
  } finally {
    playbackLoading.value = false
  }
}

function handleFullscreenChange() {
  playbackFullscreen.value = document.fullscreenElement === playbackPanel.value
  if (!playbackFullscreen.value) {
    fullscreenHintVisible.value = false
    if (fullscreenHintTimer !== undefined) window.clearTimeout(fullscreenHintTimer)
    fullscreenHintTimer = undefined
  }
}

async function showPlaybackFullscreen() {
  if (document.fullscreenElement === playbackPanel.value) {
    await document.exitFullscreen()
    return
  }
  if (!playbackPanel.value || !playbackEmbedUrl.value) return
  try {
    await playbackPanel.value.requestFullscreen()
    fullscreenHintVisible.value = true
    if (fullscreenHintTimer !== undefined) window.clearTimeout(fullscreenHintTimer)
    fullscreenHintTimer = window.setTimeout(() => {
      fullscreenHintVisible.value = false
      fullscreenHintTimer = undefined
    }, 3000)
  } catch (reason) {
    playbackError.value = reason instanceof Error ? reason.message : '无法进入全屏模式。'
  }
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
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  void loadOverview()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handlePreviewKeydown)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  if (fullscreenHintTimer !== undefined) window.clearTimeout(fullscreenHintTimer)
})
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

      <section ref="playbackPanel" class="overview-panel map-panel" :class="{ 'is-playback-fullscreen': playbackFullscreen }">
        <div class="panel-title playback-titlebar"><button type="button" :disabled="!playbackFullscreen && (!playbackEmbedUrl || playbackLoading)" @click="showPlaybackFullscreen">{{ playbackFullscreen ? '退出全屏' : '全屏显示' }}</button></div>
        <div v-if="playbackLoading" class="playback-state"><i>↻</i><b>正在获取轨迹回放授权…</b><span>请稍候，正在加载对应飞行任务。</span></div>
        <iframe v-else-if="playbackEmbedUrl" class="playback-frame" :src="playbackEmbedUrl" :title="`${selectedFlightTask?.name || '飞行任务'}轨迹回放`" allow="fullscreen; clipboard-read; clipboard-write; geolocation" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        <div v-else class="playback-state" :class="{ error: playbackError }"><i>⌁</i><b>{{ playbackError ? '暂未进入轨迹回放' : selectedFlightTask ? '等待进入轨迹回放' : '请选择关联飞行任务' }}</b><span>{{ playbackStateText }}</span></div>
        <button v-if="playbackFullscreen" type="button" class="playback-fullscreen-exit" aria-label="退出轨迹回放全屏" title="退出全屏（Esc）" @click="showPlaybackFullscreen">退出全屏</button>
        <Transition name="fullscreen-hint"><div v-if="fullscreenHintVisible" class="fullscreen-hint">已进入全屏，按 Esc 键退出全屏</div></Transition>
      </section>

      <aside class="overview-panel route-panel">
        <div class="panel-title route-panel-title"><b>选择任务航线</b><span>{{ flightTasks.filter(item => item.availability === 'available').length }} 条可用</span></div>
        <input v-model="flightTaskKeyword" class="flight-task-search" placeholder="搜索任务名称、航线、设备或 ID" />
        <button v-for="task in filteredFlightTasks" :key="task.id" type="button" class="route-row flight-task-row" :class="{ active: selectedFlightTaskId === task.id, checking: task.availability === 'checking', unavailable: task.availability === 'unavailable' }" :disabled="task.availability !== 'available'" :title="task.unavailableReason || ''" @click="selectFlightTask(task.id)">
          <span><b>{{ task.name }}</b><small>{{ task.waylineName || '未关联航线' }} · {{ task.deviceName || '未关联设备' }}</small><small>飞行任务 ID：{{ task.id }}</small><small v-if="task.availability === 'unavailable'" class="unavailable-reason">{{ task.unavailableReason || '该任务无法进入轨迹回放' }}</small></span><em>{{ task.availability === 'checking' ? '验证中' : task.availability === 'unavailable' ? '不可用' : (task.status || '可用') }}</em>
        </button>
        <div v-if="loading" class="empty-state">正在读取飞行任务…</div>
        <div v-else-if="!filteredFlightTasks.length" class="empty-state">{{ flightTaskKeyword ? '没有匹配的飞行任务' : '暂无可选择飞行任务' }}</div>
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
.playback-titlebar { gap: 14px; }.playback-titlebar button { margin-left: auto; }.playback-titlebar button { min-height: 28px; flex: 0 0 auto; padding: 0 11px; color: #0876b6; background: #fff; border: 1px solid #1785c0; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; }.playback-titlebar button:hover { color: #fff; background: #168fc2; }.playback-titlebar button:disabled { color: #9aaab2; background: #f1f4f5; border-color: #d2dce1; cursor: not-allowed; }
.route-panel-title { height: 48px; flex-basis: 48px; padding-inline: 13px; }.route-panel-title b { color: #123b54; font-size: 18px; letter-spacing: .2px; }.route-panel-title button { min-height: 32px; padding: 0 12px; color: #fff; background: #168fc2; border: 1px solid #34acd5; border-radius: 5px; box-shadow: 0 2px 7px #168fc22c; cursor: pointer; font-size: 13px; font-weight: 600; }.route-panel-title button:hover { background: #0879aa; }.route-panel-title button:disabled { cursor: wait; opacity: .65; }
.panel-tip { margin: 0; padding: 8px 10px; color: #7a8f9e; border-bottom: 1px solid #eef3f6; font-size: 10px; }
.flight-task-search { height: 40px; flex: 0 0 40px; box-sizing: border-box; margin: 10px 11px; padding: 0 12px; color: #294b5d; background: #f9fcfd; border: 1px solid #c8dbe4; border-radius: 5px; outline: none; font-size: 14px; }.flight-task-search:hover,.flight-task-search:focus { border-color: #168fc2; box-shadow: 0 0 0 2px #168fc21c; }.flight-task-search:focus::placeholder { color: transparent; }
.device-row, .route-row { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 10px; border: 0; border-bottom: 1px solid #eef3f6; color: #385669; background: #fff; text-align: left; cursor: pointer; }.device-row:hover, .route-row:hover, .device-row.active, .route-row.active { background: #e9f7ff; }.device-row.active, .route-row.active { box-shadow: inset 3px 0 #168bd0; }.device-row > span, .route-row > span { min-width: 0; flex: 1; }.device-row b, .route-row b, .device-row small, .route-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.device-row b, .route-row b { color: #1f3d52; font-size: 12px; }.device-row small, .route-row small { margin-top: 3px; color: #7a8f9e; font-size: 10px; }.device-row em, .route-row em { color: #0b81bd; font-style: normal; font-size: 10px; }.device-row i { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: #98a8b4; }.device-row i.online { background: #20bd70; box-shadow: 0 0 7px #20bd7090; }.device-row i.starting { background: #e6a72c; }.selected-device { margin: auto 8px 8px; padding: 9px; border-radius: 4px; color: #427084; background: #f0f8fc; font-size: 10px; }.selected-device b, .selected-device span, .selected-device small { display: block; }.selected-device span { margin: 3px 0; color: #0b6f9a; font-size: 12px; font-weight: 700; }
.playback-frame { width: 100%; min-height: 0; flex: 1; border: 0; background: #51585d; }.playback-state { min-height: 0; flex: 1; display: grid; place-content: center; justify-items: center; gap: 8px; padding: 28px; color: #eef3f5; background: #666d72; text-align: center; }.playback-state i { width: 48px; height: 48px; display: grid; place-items: center; color: #eef4f6; border: 1px solid #aab3b8; border-radius: 50%; font-size: 25px; font-style: normal; }.playback-state b { font-size: 16px; }.playback-state span { max-width: none; color: #d5dcdf; font-size: 12px; line-height: 1.7; white-space: nowrap; }.playback-state.error { background: #69686a; }.playback-state.error i { color: #ffd0d0; border-color: #d7abab; }.map-panel:fullscreen { width: 100vw; height: 100vh; border: 0; border-radius: 0; background: #20272c; }.map-panel:fullscreen .panel-title { height: 48px; flex-basis: 48px; padding-inline: 18px; color: #eefaff; background: #082b42; border-color: #174d68; font-size: 16px; }.map-panel:fullscreen .playback-titlebar button { min-height: 34px; color: #eefaff; background: #10445f; border-color: #54b6d8; }.map-panel:fullscreen .playback-titlebar button:hover { background: #168fc2; }.fullscreen-hint { position: absolute; z-index: 5; top: 64px; left: 50%; padding: 10px 18px; color: #fff; background: #092d46e8; border: 1px solid #54d5ee; border-radius: 5px; box-shadow: 0 7px 22px #0007; font-size: 14px; transform: translateX(-50%); pointer-events: none; }.fullscreen-hint-enter-active,.fullscreen-hint-leave-active { transition: opacity .2s, transform .2s; }.fullscreen-hint-enter-from,.fullscreen-hint-leave-to { opacity: 0; transform: translate(-50%,-7px); }
.map-panel:fullscreen .playback-titlebar { display: none; }
.playback-fullscreen-exit { position: absolute; z-index: 6; top: 64px; right: 18px; min-height: 34px; padding: 0 13px; color: #eefaff; background: #10445fe8; border: 1px solid #54b6d8; border-radius: 5px; box-shadow: 0 4px 14px #00142199; cursor: pointer; font-size: 13px; font-weight: 700; }
.playback-fullscreen-exit:hover,.playback-fullscreen-exit:focus-visible { color: #fff; background: #168fc2; outline: 2px solid #a2efff; outline-offset: 2px; }
.route-panel { overflow-y: auto; }.route-row { flex: 0 0 auto; }.route-row em { min-width: 20px; height: 20px; display: grid; place-items: center; border-radius: 10px; color: #0876b6; background: #e3f3fc; font-weight: 700; }.flight-task-row { align-items: flex-start; }.flight-task-row span small+small { margin-top: 2px; color: #4c91ad; }.flight-task-row em { width: auto; min-width: 44px; height: auto; min-height: 22px; padding: 2px 6px; border-radius: 11px; text-align: center; white-space: nowrap; }.flight-task-row.checking,.flight-task-row.unavailable,.flight-task-row.checking:hover,.flight-task-row.unavailable:hover { box-shadow: none; cursor: not-allowed; }.flight-task-row.checking { background: #f5f8fa; opacity: .72; }.flight-task-row.unavailable { background: #f5f5f5; opacity: .62; }.flight-task-row.unavailable b,.flight-task-row.unavailable small { color: #89979e; }.flight-task-row.unavailable em { color: #a85b61; background: #f5e5e7; }.flight-task-row.checking em { color: #728a96; background: #e8eef1; }.flight-task-row .unavailable-reason { color: #b06a6f!important; white-space: normal; line-height: 1.35; }.empty-state { padding: 24px 10px; color: #91a4b0; text-align: center; font-size: 12px; }
.video-wall-panel { min-height: 0; display: flex; flex-direction: column; }.video-wall-title { justify-content: flex-start; gap: 18px; }.video-wall-title > span { margin-left: auto; }.video-wall { min-height: 0; flex: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 8px; overflow: auto; }.video-screen { position: relative; min-height: 125px; overflow: hidden; padding: 0; border: 2px solid transparent; border-radius: 5px; background: #082e47; cursor: pointer; transform: translateY(0); transition: transform .18s, border-color .18s, box-shadow .18s; }.video-screen:hover,.video-screen:focus-visible { z-index: 2; border-color: #49d9f2; box-shadow: 0 10px 22px #06304b55, 0 0 0 2px #11baf038; outline: none; transform: translateY(-5px); }.video-screen.active { border-color: #11baf0; box-shadow: 0 0 0 2px #11baf040; }.video-screen video, .video-screen iframe { width: 100%; height: 100%; border: 0; background: #061724; object-fit: cover; pointer-events: none; }.video-placeholder { height: 100%; min-height: 121px; display: grid; place-content: center; gap: 5px; color: #9fd7e8; background: linear-gradient(145deg, #154764, #06243a); }.video-placeholder i { color: #39cde1; font-size: 28px; font-style: normal; }.video-placeholder span { color: #f2d86d; font-size: 11px; }.video-placeholder small { color: #74b6ca; font-size: 10px; }.video-screen footer { position: absolute; right: 0; bottom: 0; left: 0; display: flex; justify-content: space-between; padding: 6px 8px; color: #fff; background: #061724bf; font-size: 10px; pointer-events: none; }.video-screen footer span.online { color: #55ecae; }.video-screen footer span.starting { color: #f3cb5d; }.video-empty { flex: 1; display: grid; place-items: center; color: #91a4b0; font-size: 12px; }
.live-preview-overlay { position:fixed; z-index:5000; inset:0; display:grid; place-items:center; overflow:hidden; color:#fff; background:#02080df5; backdrop-filter:blur(5px) }.live-preview-stage { position:absolute; inset:0; overflow:hidden; background:#02080d }.live-preview-stage>video,.live-preview-stage>iframe { width:100%; height:100%; display:block; border:0; background:#02080d; object-fit:contain; pointer-events:auto }.live-preview-stage>footer { position:absolute; z-index:2; right:0; bottom:0; left:0; display:flex; align-items:center; gap:16px; padding:14px 20px; color:#fff; background:#02101bcf; font-size:14px; pointer-events:none }.live-preview-stage>footer span.online{color:#55ecae}.live-preview-stage>footer span.starting{color:#f3cb5d}.live-preview-stage>footer small{margin-left:auto;color:#a9c4d0;font-size:12px}.live-preview-close { position:absolute; z-index:6; top:58px; right:24px; height:38px; padding:0 16px; color:#fff; background:#073a58e8; border:1px solid #76e9fb; border-radius:5px; box-shadow:0 5px 18px #0007; font-size:14px; font-weight:700; cursor:pointer }.live-preview-close:hover,.live-preview-close:focus-visible{background:#09618a;outline:2px solid #a2efff;outline-offset:2px}.live-preview-nav { position:absolute; z-index:5; top:50%; width:52px; height:78px; padding:0; color:#fff; background:#092c46b8; border:1px solid #ffffff55; border-radius:8px; box-shadow:0 8px 22px #0006; font-size:48px; line-height:1; cursor:pointer; transform:translateY(-50%); transition:background .16s,transform .16s }.live-preview-nav:hover,.live-preview-nav:focus-visible{background:#0b749c;outline:none;transform:translateY(-50%) scale(1.05)}.live-preview-nav--prev{left:22px}.live-preview-nav--next{right:22px}
.global-live-cruise:not(.is-fullscreen) { gap: 10px; padding: 10px; }.overview-main { grid-template-columns: 270px minmax(460px, 1fr) 290px; gap: 10px; }.overview-panel { border-color: #bfd3df; border-radius: 8px; box-shadow: 0 3px 12px #1c3b5218; }.panel-title { height: 42px; flex-basis: 42px; padding: 0 14px; color: #123b54; background: linear-gradient(90deg, #fbfdff, #f3f9fc); font-size: 16px; }.panel-title span { font-size: 12px; }.panel-tip { padding: 11px 14px; font-size: 13px; line-height: 1.45; }.device-row,.route-row { gap: 10px; padding: 12px 14px; }.device-row b,.route-row b { font-size: 14px; }.device-row small,.route-row small { margin-top: 4px; font-size: 12px; }.device-row em,.route-row em { font-size: 12px; }.device-row i { width: 10px; height: 10px; flex-basis: 10px; }.selected-device { margin: auto 10px 10px; padding: 12px; border: 1px solid #cfe5ef; font-size: 12px; }.selected-device span { font-size: 14px; }.map-legend { left: 14px; bottom: 14px; padding: 8px 12px; font-size: 12px; }.route-row em { min-width: 24px; height: 24px; border-radius: 12px; }.empty-state { padding: 30px 14px; font-size: 14px; }.video-wall { gap: 10px; padding: 10px; }.video-screen { min-height: 156px; border-radius: 7px; }.video-placeholder { min-height: 152px; gap: 7px; }.video-placeholder span { font-size: 13px; }.video-placeholder small { font-size: 12px; }.video-screen footer { padding: 9px 11px; font-size: 13px; }.video-empty { font-size: 14px; }.overview-actions { gap: 10px; font-size: 12px; }.overview-actions button { padding: 6px 13px; font-size: 13px; }
@media (max-width: 1350px) { .overview-main { grid-template-columns: 220px minmax(360px, 1fr) 230px; }.video-wall { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1120px) { .overview-main { grid-template-columns: clamp(190px,21vw,220px) minmax(330px,1fr) clamp(205px,22vw,230px); gap: 7px; }.global-live-cruise:not(.is-fullscreen) { gap: 7px; padding: 7px; }.panel-title { padding-inline: 9px; font-size: 14px; }.video-wall { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; padding: 7px; } }
</style>
