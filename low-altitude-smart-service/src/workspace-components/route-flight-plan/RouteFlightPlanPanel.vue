<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PortalTask } from '@/types'
import {
  buildRouteMetrics,
  createDefaultWaypoints,
  createFlightPlans,
  createHistoryRoutes,
  createRoutesForTask,
  planningAlerts,
  type FlightPlanItem,
  type FlightRoute,
} from '@/mocks/route-planning'
import NewRouteDialog from './NewRouteDialog.vue'
import RouteWorkspaceMap from './RouteWorkspaceMap.vue'

const props = defineProps<{ task?: PortalTask }>()

const routes = ref<FlightRoute[]>(createRoutesForTask(props.task))
const historyRoutes = ref<FlightRoute[]>(createHistoryRoutes(props.task))
const plans = ref<FlightPlanItem[]>(createFlightPlans(routes.value))
const activeRouteId = ref(routes.value[0]?.id || '')
const routeKeyword = ref('')
const statusFilter = ref('')
const newRouteVisible = ref(false)
const selectedDate = ref('2026-09-09')
const layerTab = ref<'base' | 'theme'>('base')
const layers = ref({
  satellite: true,
  vector: false,
  forest: true,
  reserve: false,
  admin: false,
  label: true,
})

watch(
  () => props.task?.id,
  () => {
    routes.value = createRoutesForTask(props.task)
    historyRoutes.value = createHistoryRoutes(props.task)
    plans.value = createFlightPlans(routes.value)
    activeRouteId.value = routes.value[0]?.id || ''
  },
)

const activeRoute = computed(() => routes.value.find((item) => item.id === activeRouteId.value) || routes.value[0])
const filteredRoutes = computed(() =>
  routes.value.filter((route) =>
    (!routeKeyword.value || `${route.name}${route.id}${route.area}`.includes(routeKeyword.value))
    && (!statusFilter.value || route.status === statusFilter.value),
  ),
)
const dayPlans = computed(() => plans.value.filter((item) => item.date === selectedDate.value))
const calendarDays = computed(() => {
  const year = 2026
  const month = 8
  const first = new Date(year, month, 1).getDay()
  const total = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - first + 1
    if (day < 1 || day > total) return { label: '', value: '' }
    const value = `2026-09-${String(day).padStart(2, '0')}`
    return { label: String(day), value }
  })
})
const metrics = computed(() => {
  const route = activeRoute.value
  if (!route) return { waypoints: 0, lengthKm: 0, durationMin: 0, coverageKm2: 0, photoEstimate: 0 }
  const built = buildRouteMetrics(route.waypoints, route.speed)
  return {
    waypoints: route.waypoints.length,
    lengthKm: route.lengthKm || built.lengthKm,
    durationMin: route.durationMin || built.durationMin,
    coverageKm2: built.coverageKm2,
    photoEstimate: route.photoEstimate || built.photoEstimate,
  }
})

function selectRoute(id: string) {
  activeRouteId.value = id
}

function onRouteCreated(route: FlightRoute) {
  routes.value.unshift(route)
  activeRouteId.value = route.id
}

function reuseHistory(route: FlightRoute) {
  const cloned: FlightRoute = {
    ...route,
    id: `RT-REUSE-${Date.now().toString().slice(-5)}`,
    name: `${route.name}-复用`,
    status: '草稿',
    createdAt: new Date().toISOString().slice(0, 10),
  }
  routes.value.unshift(cloned)
  activeRouteId.value = cloned.id
}

function autoPlan() {
  if (!activeRoute.value) return
  const waypoints = createDefaultWaypoints(activeRoute.value.polygon)
  const built = buildRouteMetrics(waypoints, activeRoute.value.speed)
  activeRoute.value.waypoints = waypoints
  activeRoute.value.lengthKm = built.lengthKm
  activeRoute.value.durationMin = built.durationMin
  activeRoute.value.photoEstimate = built.photoEstimate
  activeRoute.value.status = '已规划'
}

function clearRoute() {
  if (!activeRoute.value) return
  activeRoute.value.waypoints = []
  activeRoute.value.lengthKm = 0
  activeRoute.value.durationMin = 0
  activeRoute.value.photoEstimate = 0
  activeRoute.value.status = '草稿'
}

function addPlan() {
  if (!activeRoute.value) return
  plans.value.push({
    id: `FP-${Date.now()}`,
    date: selectedDate.value,
    start: '15:00',
    end: '16:00',
    title: `${activeRoute.value.name}补充计划`,
    area: activeRoute.value.area,
    routeId: activeRoute.value.id,
  })
}
</script>

<template>
  <div class="route-flight-plan">
    <section class="map-stage">
      <aside class="left-float">
        <div class="panel">
          <div class="panel-head">
            <button :class="{ active: layerTab === 'base' }" @click="layerTab = 'base'">底图</button>
            <button :class="{ active: layerTab === 'theme' }" @click="layerTab = 'theme'">专题图层</button>
          </div>
          <div v-if="layerTab === 'base'" class="layer-list">
            <label><input v-model="layers.satellite" type="checkbox" />卫星影像</label>
            <label><input v-model="layers.vector" type="checkbox" />电子地图</label>
            <label><input v-model="layers.label" type="checkbox" />地名注记</label>
          </div>
          <div v-else class="layer-list">
            <label><input v-model="layers.forest" type="checkbox" />林地小班</label>
            <label><input v-model="layers.reserve" type="checkbox" />保护区</label>
            <label><input v-model="layers.admin" type="checkbox" />行政区划</label>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">航线规划工具</div>
          <div class="tool-grid">
            <button @click="newRouteVisible = true">＋ 新建航线</button>
            <button @click="autoPlan">⟳ 自动规划</button>
            <button @click="newRouteVisible = true">⇧ 导入航线</button>
            <button @click="historyRoutes[0] && reuseHistory(historyRoutes[0])">↺ 复用历史</button>
            <button @click="activeRoute && (activeRoute.status = '已规划')">✎ 编辑航点</button>
            <button @click="clearRoute">× 清除</button>
          </div>
          <div class="route-filter">
            <input v-model="routeKeyword" placeholder="筛选当前航线…" />
            <select v-model="statusFilter">
              <option value="">全部状态</option>
              <option>草稿</option>
              <option>已规划</option>
              <option>已下发</option>
              <option>已完成</option>
            </select>
          </div>
          <div class="route-list">
            <button
              v-for="route in filteredRoutes"
              :key="route.id"
              :class="{ active: route.id === activeRouteId }"
              @click="selectRoute(route.id)"
            >
              <b>{{ route.name }}</b>
              <small>{{ route.routeTypeLabel }} · {{ route.status }}</small>
            </button>
          </div>
        </div>
      </aside>

      <RouteWorkspaceMap :routes="routes" :active-route-id="activeRouteId" />

      <aside class="right-panel">
        <div class="panel">
          <div class="panel-title">任务与航线信息</div>
          <dl>
            <dt>任务名称</dt><dd>{{ task?.name || '未绑定任务' }}</dd>
            <dt>作业区域</dt><dd>{{ activeRoute?.area || '-' }}</dd>
            <dt>飞行器</dt><dd>{{ activeRoute?.aircraft || '-' }}</dd>
            <dt>飞手</dt><dd>{{ task?.assignee || '-' }}</dd>
            <dt>计划时间</dt><dd>{{ task?.plannedStart?.slice(0, 16) || '-' }}</dd>
          </dl>
        </div>
        <div class="panel">
          <div class="panel-title">航线参数</div>
          <dl v-if="activeRoute">
            <dt>飞行高度</dt><dd><input v-model.number="activeRoute.height" type="number" /> m</dd>
            <dt>飞行速度</dt><dd><input v-model.number="activeRoute.speed" type="number" /> m/s</dd>
            <dt>航向重叠</dt><dd><input v-model.number="activeRoute.overlapFront" type="number" /> %</dd>
            <dt>旁向重叠</dt><dd><input v-model.number="activeRoute.overlapSide" type="number" /> %</dd>
            <dt>航线类型</dt><dd>{{ activeRoute.routeTypeLabel }}</dd>
            <dt>返航点</dt><dd>起降点 H</dd>
          </dl>
        </div>
        <div class="panel">
          <div class="panel-title">规划结果</div>
          <div class="metrics">
            <div><b>{{ metrics.waypoints }}</b><span>航点</span></div>
            <div><b>{{ metrics.lengthKm }}</b><span>公里</span></div>
            <div><b>{{ metrics.durationMin }}</b><span>分钟</span></div>
            <div><b>{{ metrics.coverageKm2 }}</b><span>km²</span></div>
            <div><b>{{ metrics.photoEstimate }}</b><span>预计照片</span></div>
          </div>
        </div>
        <div class="actions">
          <button class="ghost">保存草稿</button>
          <button class="primary">下发任务</button>
        </div>
      </aside>
    </section>

    <section class="bottom-grid">
      <div class="panel">
        <div class="panel-title">历史航线 / 任务</div>
        <table>
          <thead>
            <tr><th>#</th><th>航线名称</th><th>区域</th><th>日期</th><th>航点</th><th>长度</th><th>状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="(route, index) in historyRoutes" :key="route.id">
              <td>{{ index + 1 }}</td>
              <td>{{ route.name }}</td>
              <td>{{ route.area }}</td>
              <td>{{ route.createdAt }}</td>
              <td>{{ route.waypoints.length }}</td>
              <td>{{ route.lengthKm }} km</td>
              <td><em class="done">● 已完成</em></td>
              <td>
                <button class="link" @click="reuseHistory(route)">复用</button>
                <button class="link" @click="selectRoute(route.id); routes.unshift(route)">查看</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-title">规划说明 / 告警</div>
        <div v-for="item in planningAlerts" :key="item.text" class="alert-row" :class="item.level">
          <i>{{ item.level === 'success' ? '✓' : item.level === 'warning' ? '!' : 'i' }}</i>
          <span>{{ item.text }}</span>
        </div>
      </div>
      <div class="panel calendar-panel">
        <div class="panel-title">飞行计划日历</div>
        <div class="calendar-layout">
          <div class="calendar">
            <div class="cal-head">2026年9月</div>
            <div class="cal-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
            <div class="cal-grid">
              <button
                v-for="(day, index) in calendarDays"
                :key="index"
                :disabled="!day.value"
                :class="{ active: day.value === selectedDate, has: plans.some((p) => p.date === day.value) }"
                @click="day.value && (selectedDate = day.value)"
              >
                {{ day.label }}
              </button>
            </div>
          </div>
          <div class="plan-list">
            <div v-for="item in dayPlans" :key="item.id" class="plan-item">
              <b>{{ item.start }}-{{ item.end }}</b>
              <span>{{ item.title }}</span>
              <small>{{ item.area }}</small>
            </div>
            <button class="add-plan" @click="addPlan">＋ 新增计划</button>
          </div>
        </div>
      </div>
    </section>

    <NewRouteDialog v-model="newRouteVisible" @created="onRouteCreated" />
  </div>
</template>

<style scoped lang="scss">
.route-flight-plan {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(360px, 1.45fr) minmax(210px, 0.9fr);
  gap: 8px;
  padding: 8px;
  background: #e8eef3;
}
.map-stage {
  position: relative;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 8px;
}
.left-float {
  position: absolute;
  z-index: 400;
  top: 8px;
  left: 8px;
  width: 160px;
  display: grid;
  gap: 8px;
}
.right-panel {
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 8px;
}
.panel {
  overflow: hidden;
  background: #fff;
  border: 1px solid #d5e0e8;
  border-radius: 6px;
  box-shadow: 0 2px 8px #1c3b5210;
}
.panel-title {
  height: 34px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-bottom: 1px solid #e6eef3;
  color: #1f3d52;
  font-size: 12px;
  font-weight: 700;
}
.panel-head {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid #e6eef3;
}
.panel-head button {
  height: 32px;
  border: 0;
  color: #6f8393;
  background: #f5f8fa;
  cursor: pointer;
  font-size: 10px;
}
.panel-head button.active {
  color: #0b6f9a;
  background: #fff;
  font-weight: 700;
}
.layer-list {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  font-size: 10px;
  color: #445868;
}
.tool-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 8px;
}
.tool-grid button {
  padding: 7px 4px;
  color: #2d5368;
  background: #f3f8fb;
  border: 1px solid #d3e2eb;
  border-radius: 4px;
  font-size: 9px;
  cursor: pointer;
}
.tool-grid button:hover { background: #e7f4fb; border-color: #8fc5de; }
.route-filter {
  display: grid;
  gap: 6px;
  padding: 0 8px 8px;
}
.route-filter input,
.route-filter select {
  height: 28px;
  padding: 0 8px;
  border: 1px solid #d3e2eb;
  border-radius: 4px;
  font-size: 10px;
}
.route-list {
  max-height: 120px;
  overflow: auto;
  border-top: 1px solid #e6eef3;
}
.route-list button {
  width: 100%;
  padding: 8px;
  border: 0;
  border-bottom: 1px solid #eef3f6;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.route-list button.active { background: #eaf6fc; }
.route-list b,
.route-list small { display: block; }
.route-list b { color: #1f3d52; font-size: 10px; }
.route-list small { margin-top: 3px; color: #7a8f9e; font-size: 8px; }
.right-panel dl {
  display: grid;
  grid-template-columns: 72px 1fr;
  margin: 0;
  padding: 6px 10px 10px;
}
.right-panel dt,
.right-panel dd {
  margin: 0;
  padding: 6px 0;
  border-bottom: 1px solid #eef3f6;
  font-size: 10px;
}
.right-panel dt { color: #7a8f9e; }
.right-panel dd { color: #1f3d52; text-align: right; }
.right-panel input {
  width: 54px;
  height: 22px;
  margin-right: 4px;
  border: 1px solid #d3e2eb;
  border-radius: 3px;
  text-align: right;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 8px 10px 12px;
}
.metrics > div {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: #f4f8fb;
  border-radius: 4px;
}
.metrics b { color: #0b6f9a; font-size: 14px; }
.metrics span { color: #7a8f9e; font-size: 8px; }
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.actions button {
  height: 36px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.actions .ghost {
  color: #2d5368;
  background: #fff;
  border: 1px solid #c5d6e1;
}
.actions .primary {
  color: #fff;
  background: #1f7fe0;
  border: 1px solid #3d95ef;
}
.bottom-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 1.35fr 0.85fr 1.1fr;
  gap: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}
th, td {
  padding: 7px 8px;
  border-bottom: 1px solid #eef3f6;
  text-align: left;
  color: #445868;
}
th { color: #6f8393; background: #f7fafc; }
.done { color: #1fbf6a; font-style: normal; }
.link {
  margin-right: 6px;
  padding: 0;
  color: #1f7fe0;
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 10px;
}
.alert-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border-bottom: 1px solid #eef3f6;
  color: #445868;
  font-size: 10px;
}
.alert-row i {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-style: normal;
  font-size: 9px;
}
.alert-row.success i { color: #fff; background: #1fbf6a; }
.alert-row.info i { color: #fff; background: #1f7fe0; }
.alert-row.warning i { color: #fff; background: #e2a12b; }
.calendar-layout {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  min-height: 0;
  height: calc(100% - 34px);
}
.calendar { padding: 8px; border-right: 1px solid #eef3f6; }
.cal-head { margin-bottom: 6px; color: #1f3d52; font-size: 11px; font-weight: 700; text-align: center; }
.cal-week, .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-week span, .cal-grid button {
  height: 22px;
  display: grid;
  place-items: center;
  color: #6f8393;
  font-size: 9px;
}
.cal-grid button {
  border: 0;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
}
.cal-grid button.active { color: #fff; background: #1f7fe0; }
.cal-grid button.has:not(.active) { background: #e8f3fb; color: #1f7fe0; }
.plan-list {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 8px;
}
.plan-item {
  padding: 7px 8px;
  background: #f4f8fb;
  border-radius: 4px;
}
.plan-item b, .plan-item span, .plan-item small { display: block; }
.plan-item b { color: #1f7fe0; font-size: 10px; }
.plan-item span { margin-top: 3px; color: #1f3d52; font-size: 10px; }
.plan-item small { margin-top: 2px; color: #7a8f9e; font-size: 8px; }
.add-plan {
  height: 32px;
  color: #1f7fe0;
  background: #fff;
  border: 1px dashed #8fc5de;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
@media (max-width: 1450px) {
  .map-stage { grid-template-columns: 1fr 250px; }
  .left-float { width: 148px; }
}
</style>
