<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PrimaryHeader from '@/components/PrimaryHeader.vue'
import RouteFlightPlanPanel from '@/workspace-components/route-flight-plan/RouteFlightPlanPanel.vue'
import GlobalLiveCruisePanel from '@/workspace-components/realtime-cruise/GlobalLiveCruisePanel.vue'
import FleetOverviewPanel from '@/workspace-components/fleet-overview/FleetOverviewPanel.vue'

type UavTab = 'fleet' | 'route' | 'live' | 'plan'
type RouteAction = 'create' | 'edit' | 'cockpit' | 'playback'

const route = useRoute()
const router = useRouter()
const tabs: UavTab[] = ['fleet', 'route', 'live', 'plan']
const routeActions: RouteAction[] = ['create', 'edit', 'cockpit', 'playback']
const active = computed<UavTab>(() => tabs.includes(route.params.tab as UavTab) ? route.params.tab as UavTab : 'fleet')
const items = [{ key: 'fleet' as const, icon: '▦', label: '机队总览' }, { key: 'route' as const, icon: '⌁', label: '航线规划' }, { key: 'live' as const, icon: '◉', label: '实时巡航' }]
const routeAction = computed<RouteAction>(() => routeActions.includes(route.query.action as RouteAction) ? route.query.action as RouteAction : 'create')
const routeSubItems = [
  { key: 'create' as const, icon: '⌁', label: '创建航线' },
  { key: 'edit' as const, icon: '✎', label: '编辑航线' },
  { key: 'cockpit' as const, icon: '▣', label: '进入虚拟座舱' },
  { key: 'playback' as const, icon: '↻', label: '轨迹回放' },
]
const routeFlightPlanPanel = ref<InstanceType<typeof RouteFlightPlanPanel>>()

async function syncRoutePanel(tab: UavTab) {
  if (tab !== 'route' && tab !== 'plan') return
  await nextTick()
  if (tab === 'plan') routeFlightPlanPanel.value?.openFlightPlanCreate()
  else if (routeAction.value === 'edit') routeFlightPlanPanel.value?.openWaylineEdit()
  else if (routeAction.value === 'cockpit') routeFlightPlanPanel.value?.openCockpit()
  else if (routeAction.value === 'playback') routeFlightPlanPanel.value?.openTrajectoryPlayback()
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

watch([active, routeAction], ([tab]) => void syncRoutePanel(tab), { flush: 'post', immediate: true })
</script>
<template>
  <div class="uav-page"><PrimaryHeader /><main><aside><button v-for="item in items.slice(0, 1)" :key="item.key" :class="{ active: active === item.key }" @click="selectWorkspace(item.key)"><i>{{ item.icon }}</i>{{ item.label }}</button><button class="flight-create" :class="{ active: active === 'plan' }" @click="selectWorkspace('plan')"><i>✈</i>飞行计划</button><button :class="{ active: active === 'route' }" @click="selectWorkspace('route')"><i>⌁</i>航线规划</button><div v-if="active === 'route'" class="route-submenu"><button v-for="item in routeSubItems" :key="item.key" :class="{ active: routeAction === item.key }" @click="selectRouteAction(item.key)"><i>{{ item.icon }}</i>{{ item.label }}</button></div><button :class="{ active: active === 'live' }" @click="selectWorkspace('live')"><i>◉</i>实时巡航</button></aside><section class="uav-content"><FleetOverviewPanel v-if="active === 'fleet'" /><RouteFlightPlanPanel v-else-if="active === 'route' || active === 'plan'" ref="routeFlightPlanPanel" :show-component-nav="false" /><GlobalLiveCruisePanel v-else /></section></main></div>
</template>
<style scoped lang="scss">
.uav-page { width:100%; height:100dvh; min-height:0; display:flex; flex-direction:column; background:#e8eef3; }.uav-page main { flex:1; min-height:0; display:grid; grid-template-columns:180px minmax(0,1fr); }.uav-page aside { min-height:0; display:flex; flex-direction:column; gap:7px; padding:12px 8px; overflow:auto; color:#c7d1dd; background:#292832; }.uav-page aside button { display:flex; align-items:center; gap:11px; padding:10px 9px; border:0; border-radius:4px; color:#c7c4ce; background:transparent; cursor:pointer; text-align:left; font-weight:600; }.uav-page aside button i { width:20px; color:#d7d4dd; font-style:normal; font-size:18px; }.uav-page aside button.flight-create { gap:8px; margin-bottom:5px; white-space:nowrap; }.uav-page aside button.flight-create:hover { color:#e2eaff; background:#343e5d; }.uav-page aside button.active { color:#fff; background:linear-gradient(135deg,#4774e9,#527cf1); }.uav-page aside button.active i { color:#fff; }.route-submenu { display:grid; gap:3px; margin:-2px 0 2px 13px; padding:5px 0 5px 9px; border-left:1px solid #545365; }.uav-page aside .route-submenu button { min-height:31px; gap:8px; padding:7px 7px; color:#aeadba; font-size:13px; font-weight:500; }.uav-page aside .route-submenu button i { width:16px; font-size:15px; }.uav-page aside .route-submenu button.active { background:#3d5dae; }.uav-content { min-width:0; min-height:0; overflow:hidden; }.uav-content>:deep(.route-flight-plan),.uav-content>:deep(.global-live-cruise) { min-height:0; height:100%; }
</style>
