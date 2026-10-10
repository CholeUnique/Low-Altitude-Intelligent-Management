<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Calendar, CirclePlus, EditPen, Grid, Monitor, Promotion, Tickets, VideoCamera } from '@element-plus/icons-vue'
import PrimaryHeader from '@/components/PrimaryHeader.vue'
import RouteFlightPlanPanel from '@/workspace-components/route-flight-plan/RouteFlightPlanPanel.vue'
import FleetOverviewPanel from '@/workspace-components/fleet-overview/FleetOverviewPanel.vue'
import RequestTicketPanel from '@/workspace-components/request-ticket/RequestTicketPanel.vue'
import GlobalLiveCruisePanel from '@/workspace-components/realtime-cruise/GlobalLiveCruisePanel.vue'
import FlightPlanCalendarPanel from '@/workspace-components/flight-plan/FlightPlanCalendarPanel.vue'
import { useUserStore } from '@/stores/user'

type UavTab = 'fleet' | 'live' | 'ticket' | 'route' | 'plan' | 'schedule'
type RouteAction = 'create' | 'edit' | 'cockpit'
type RouteMenuAction = RouteAction | 'plan'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const tabs: UavTab[] = ['fleet', 'live', 'ticket', 'route', 'plan', 'schedule']
const routeActions: RouteAction[] = ['create', 'edit', 'cockpit']
const active = computed<UavTab>(() => tabs.includes(route.params.tab as UavTab) ? route.params.tab as UavTab : 'fleet')
const items = computed(() => [
  { key: 'fleet' as const, icon: Grid, label: '机队总览', permission: 'fleet-overview' as const },
  { key: 'ticket' as const, icon: Tickets, label: '需求工单', permission: 'request-ticket' as const },
].filter((item) => user.hasPermission(item.permission)))
const routeAction = computed<RouteAction>(() => routeActions.includes(route.query.action as RouteAction) ? route.query.action as RouteAction : 'create')
const routeSubItems = computed(() => [
  { key: 'create' as const, icon: CirclePlus, label: '创建航线' },
  { key: 'edit' as const, icon: EditPen, label: '编辑航线' },
  { key: 'cockpit' as const, icon: Monitor, label: '虚拟座舱' },
  ...(user.hasPermission('flight-plan') ? [{ key: 'plan' as const, icon: Promotion, label: '计划起飞' }] : []),
])
const routeFlightPlanPanel = ref<InstanceType<typeof RouteFlightPlanPanel>>()

async function syncRoutePanel(tab: UavTab) {
  if (tab !== 'route' && tab !== 'plan') return
  await nextTick()
  if (tab === 'plan') routeFlightPlanPanel.value?.openFlightPlanCreate()
  else if (routeAction.value === 'edit') routeFlightPlanPanel.value?.openWaylineEdit()
  else if (routeAction.value === 'cockpit') routeFlightPlanPanel.value?.openCockpit()
  else routeFlightPlanPanel.value?.openWaylineCreate()
}

function selectWorkspace(tab: UavTab) {
  if (active.value !== tab || (tab === 'route' && route.query.action)) void router.push({ name: 'uav-tasks', params: { tab } })
  else if (tab === 'route') void syncRoutePanel(tab)
}

function selectRouteAction(action: RouteAction) {
  if (active.value !== 'route' || routeAction.value !== action || !route.query.action) {
    void router.push({ name: 'uav-tasks', params: { tab: 'route' }, query: { action } })
  } else {
    void syncRoutePanel('route')
  }
}

function selectRouteMenuAction(action: RouteMenuAction) {
  if (action === 'plan') selectWorkspace('plan')
  else selectRouteAction(action)
}

function isRouteMenuActive(action: RouteMenuAction) {
  return action === 'plan' ? active.value === 'plan' : active.value === 'route' && routeAction.value === action
}

watch([active, routeAction], ([tab]) => void syncRoutePanel(tab), { flush: 'post', immediate: true })
</script>
<template>
  <div class="uav-page"><PrimaryHeader /><main><aside><button v-for="item in items" :key="item.key" :class="{ active: active === item.key }" @click="selectWorkspace(item.key)"><i class="nav-icon"><component :is="item.icon" /></i>{{ item.label }}</button><button v-if="user.hasPermission('route-planning')" :class="{ active: active === 'route' || active === 'plan' }" @click="selectWorkspace('route')"><i class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M7 18h3.5a3.5 3.5 0 0 0 0-7h-.5a2.5 2.5 0 0 1 0-5h7" /></svg></i>航线规划</button><div v-if="user.hasPermission('route-planning') && (active === 'route' || active === 'plan')" class="route-submenu"><button v-for="item in routeSubItems" :key="item.key" :class="{ active: isRouteMenuActive(item.key) }" @click="selectRouteMenuAction(item.key)"><i class="route-icon"><component :is="item.icon" /></i>{{ item.label }}</button></div><button v-if="user.hasPermission('flight-plan')" :class="{ active: active === 'schedule' }" @click="selectWorkspace('schedule')"><i class="nav-icon"><Calendar /></i>飞行计划</button><button v-if="user.hasPermission('live-monitoring')" :class="{ active: active === 'live' }" @click="selectWorkspace('live')"><i class="nav-icon"><VideoCamera /></i>实时作业</button></aside><section class="uav-content"><FleetOverviewPanel v-if="active === 'fleet'" /><GlobalLiveCruisePanel v-else-if="active === 'live'" /><RequestTicketPanel v-else-if="active === 'ticket'" /><FlightPlanCalendarPanel v-else-if="active === 'schedule'" /><RouteFlightPlanPanel v-else ref="routeFlightPlanPanel" :show-component-nav="false" /></section></main></div>
</template>
<style scoped lang="scss">
.uav-page { width:100%; height:100dvh; min-height:0; display:flex; flex-direction:column; background:#e8eef3; }.uav-page main { flex:1; min-height:0; display:grid; grid-template-columns:220px minmax(0,1fr); }.uav-page aside { min-height:0; display:flex; flex-direction:column; gap:7px; padding:15px 12px; overflow:auto; color:#c7d1dd; background:#292832; }.uav-page aside button { min-height:52px; display:flex; align-items:center; gap:12px; padding:10px 12px; border:0; border-radius:4px; color:#c7c4ce; background:transparent; cursor:pointer; text-align:left; font-size:17px; font-weight:600; }.uav-page aside button i { width:24px; flex:0 0 24px; color:#d7d4dd; font-style:normal; font-size:19px; text-align:center; }.uav-page aside button.active { color:#fff; background:linear-gradient(135deg,#4774e9,#527cf1); }.uav-page aside button.active i { color:#fff; }.route-submenu { display:grid; gap:3px; margin:-2px 0 2px 16px; padding:5px 0 5px 11px; border-left:1px solid #545365; }.uav-page aside .route-submenu button { min-height:36px; gap:9px; padding:7px 8px; color:#aeadba; font-size:14px; font-weight:500; }.uav-page aside .route-submenu button i { width:18px; flex-basis:18px; font-size:16px; }.uav-page aside .route-submenu button.active { background:#3d5dae; }.uav-content { min-width:0; min-height:0; overflow:hidden; }.uav-content>:deep(.route-flight-plan),.uav-content>:deep(.global-live-cruise),.uav-content>:deep(.flight-plan-calendar) { min-height:0; height:100%; }
.uav-page aside button .nav-icon { width:30px; height:30px; flex:0 0 30px; display:grid; place-items:center; color:#9eb9dc; border:1px solid #6380a044; border-radius:8px; background:#ffffff0b; transition:background .18s,border-color .18s,color .18s; }
.uav-page aside button .nav-icon svg { width:18px; height:18px; }
.uav-page aside button:hover:not(.active) .nav-icon { color:#e0f4ff; border-color:#7da8dc88; background:#5b83b033; }
.uav-page aside button.active .nav-icon { color:#fff; border-color:#ffffff78; background:#ffffff26; }
.uav-page aside .route-submenu button .route-icon { width:22px; height:22px; flex:0 0 22px; display:grid; place-items:center; color:#a9bddb; border:1px solid #8295b033; border-radius:6px; background:#ffffff0b; transition:background .18s,border-color .18s,color .18s; }
.uav-page aside .route-submenu button .route-icon svg { width:15px; height:15px; }
.uav-page aside .route-submenu button:hover:not(.active) .route-icon { color:#e2efff; border-color:#9bb9e977; background:#6584b033; }
.uav-page aside .route-submenu button.active .route-icon { color:#fff; border-color:#ffffff70; background:#ffffff26; }
@media(max-width:1200px){.uav-page main{grid-template-columns:190px minmax(0,1fr)}.uav-page aside{padding:12px 8px}.uav-page aside button{gap:10px;padding-inline:9px}}
</style>
