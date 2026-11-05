<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useFarmlandComparisonStore } from '@/stores/farmland-comparison'
import { loadDefaultFarmlandComparison } from '@/utils/default-farmland-comparison'
import { getFacilityStatistics, type FacilityStatistics } from '@/api/facility'
import { HIGH_STANDARD_TOPIC_ID, FACILITIES_TOPIC_ID } from '@/stores/geographic-topics'
import { isAgricultureTopicDepartment } from '@/utils/topic-access'
import { squareMetresToMu } from '@/utils/topic-area'
import DashboardFlipNumber from './DashboardFlipNumber.vue'

const user = useUserStore()
const router = useRouter()
const comparison = useFarmlandComparisonStore()
const facilities = ref<FacilityStatistics>()
const pending = ref({ farmland: false, facilities: false })
const errors = ref({ farmland: '', facilities: '' })
const canOpen = computed(() => isAgricultureTopicDepartment(user) && user.hasPermission('special-analysis'))
const canLoad = computed(() => canOpen.value && Boolean(user.token && user.activeDeptId))
const farmlandMetrics = computed(() => {
  const summary = comparison.latest
  const area = (value: number | undefined) => value == null ? '—' : Math.round(squareMetresToMu(value)).toLocaleString('zh-CN')
  return [
    { label: '高标田面积', value: area(summary?.areaA), unit: '亩', title: summary?.sourceA.layerName || '暂无对比统计' },
    { label: '永农面积', value: area(summary?.areaB), unit: '亩', title: summary?.sourceB.layerName || '暂无对比统计' },
    { label: '差异率', value: summary?.diffRate == null ? '—' : (summary.diffRate * 100).toLocaleString('zh-CN', { maximumFractionDigits: 1 }), unit: '%', title: '与高标田与永农对比分析采用同一统计口径' },
  ]
})
const farmlandDescription = computed(() => comparison.latest ? `${comparison.latest.sourceA.layerName} / ${comparison.latest.sourceB.layerName}` : '高标田与永农对比统计')
function count(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN') : '—'
}
const facilityMetrics = computed(() => [
  { label: '设施总数', value: facilities.value?.totalCount, tone: 'total' },
  { label: '异常设施', value: facilities.value?.abnormalCount, tone: 'abnormal' },
  { label: '核查中', value: facilities.value?.checkingCount, tone: 'checking' },
])
const facilityStates = computed(() => [
  { name: '正常', value: facilities.value?.normalCount, color: '#55dfb4' },
  { name: '异常', value: facilities.value?.abnormalCount, color: '#ff917f' },
  { name: '核查中', value: facilities.value?.checkingCount, color: '#ffd16b' },
  { name: '废弃', value: facilities.value?.discardedCount, color: '#7f9aaa' },
].map(item => ({ ...item, width: facilities.value?.totalCount ? Math.min(100, Math.max(0, (item.value || 0) / facilities.value.totalCount * 100)) : 0 })))
const stateDescription = computed(() => facilityStates.value.map(item => `${item.name} ${count(item.value)} 个`).join('，'))
let version = 0
let defaultController: AbortController | undefined
async function load(section?: 'farmland' | 'facilities') {
  if (!canLoad.value) return
  const request = version
  const deptId = user.activeDeptId!
  const sections = section ? [section] : ['farmland', 'facilities'] as const
  await Promise.all(sections.map(async key => {
    if (pending.value[key] || (key === 'farmland' && comparison.latest)) return
    pending.value[key] = true
    errors.value[key] = ''
    try {
      if (key === 'farmland') {
        const expectedScope = comparison.scope
        const abort = new AbortController(); defaultController = abort
        const result = await loadDefaultFarmlandComparison(deptId, abort.signal)
        if (request === version && !abort.signal.aborted && !comparison.remember(result, 'default', expectedScope) && !comparison.latest) throw new Error('对比统计不完整')
      } else {
        const result = await getFacilityStatistics(deptId)
        if (request === version) facilities.value = result
      }
    } catch {
      if (request !== version) return
      if (key === 'facilities') facilities.value = undefined
      errors.value[key] = '统计暂不可用'
    } finally {
      if (request === version) pending.value[key] = false
    }
  }))
}
watch([() => user.token, () => user.activeDeptId, () => user.organizationId, canOpen, () => comparison.scope], () => {
  version++
  defaultController?.abort(); facilities.value = undefined
  errors.value = { farmland: '', facilities: '' }; pending.value = { farmland: false, facilities: false }
  void load()
}, { immediate: true, flush: 'post' })
const refreshTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 60_000)
onBeforeUnmount(() => { version++; defaultController?.abort(); window.clearInterval(refreshTimer) })
function openTopic(id: string, view?: 'overview' | 'map') {
  if (!canOpen.value) return
  void router.push({ name: 'recognition', params: { tab: 'topics' }, query: { topic: id, ...(view ? { view } : {}) } })
}
</script>

<template>
  <div class="dashboard-topics" aria-label="农业农村局专题摘要">
    <section class="topic-brief farmland-brief" aria-labelledby="dashboard-farmland-title" :aria-busy="pending.farmland">
      <header class="brief-heading">
        <h3 id="dashboard-farmland-title" :title="farmlandDescription">高标准农田管理 <small v-if="comparison.latest && /九龙镇/.test(comparison.latest.sourceA.serviceName)" class="brief-scope">九龙镇</small></h3>
        <button v-if="canOpen" type="button" class="topic-link" aria-label="进入高标准农田管理专题" @click="openTopic(HIGH_STANDARD_TOPIC_ID)">地图 <span aria-hidden="true">↗</span></button>
      </header>
      <p v-if="!canOpen" class="brief-status">暂无专题分析权限</p>
      <p v-else-if="errors.farmland && !comparison.latest" class="brief-status" role="alert">{{ errors.farmland }}<button type="button" @click="load('farmland')">重试</button></p>
      <dl v-else class="brief-metrics">
        <div v-for="metric in farmlandMetrics" :key="metric.label" :title="metric.title"><dt>{{ metric.label }}</dt><dd><DashboardFlipNumber :value="metric.value" /><small>{{ metric.unit }}</small></dd></div>
      </dl>
    </section>
    <section class="topic-brief facility-brief" aria-labelledby="dashboard-facilities-title" :aria-busy="pending.facilities">
      <header class="brief-heading">
        <h3 id="dashboard-facilities-title">高标准农田工程设施管理</h3>
        <div v-if="canOpen" class="topic-links"><button type="button" class="topic-link" aria-label="进入工程设施总览" @click="openTopic(FACILITIES_TOPIC_ID, 'overview')">总览 <span aria-hidden="true">↗</span></button><button type="button" class="topic-link" aria-label="进入工程设施地图" @click="openTopic(FACILITIES_TOPIC_ID, 'map')">地图 <span aria-hidden="true">↗</span></button></div>
      </header>
      <p v-if="!canOpen" class="brief-status">暂无专题分析权限</p>
      <p v-else-if="errors.facilities" class="brief-status" role="alert">{{ errors.facilities }}<button type="button" @click="load('facilities')">重试</button></p>
      <template v-else>
        <dl class="brief-metrics">
          <div v-for="metric in facilityMetrics" :key="metric.label" :class="`metric-${metric.tone}`"><dt>{{ metric.label }}</dt><dd><DashboardFlipNumber :value="count(metric.value)" /><small>个</small></dd></div>
        </dl>
        <div v-if="facilities" class="facility-composition" role="img" :aria-label="`设施状态构成：${stateDescription}`" :title="stateDescription">
          <div class="status-track"><i v-for="state in facilityStates" :key="state.name" :style="{ width: `${state.width}%`, background: state.color }" /></div>
          <div class="status-legend"><span v-for="state in facilityStates" :key="state.name"><i :style="{ background: state.color }" />{{ state.name }}</span></div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.dashboard-topics{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;gap:10px;overflow:auto;scrollbar-width:none;container-type:inline-size}.dashboard-topics::-webkit-scrollbar{display:none}
.topic-brief{flex:none;min-width:0}.topic-brief+.topic-brief{padding-top:10px;border-top:1px solid #77cef223}.brief-heading{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:0 0 7px;padding:0;border:0;background:transparent}.brief-heading h3{margin:0;color:#e0f4f7;font-size:12px;font-weight:600;line-height:20px}.brief-scope{margin-left:4px;color:#91b1c3;font-size:10px;font-weight:400}.topic-links{display:flex;gap:8px;flex:none}.topic-link{padding:0;border:0;color:#84d8e9;background:transparent;font:inherit;font-size:11px;line-height:20px;white-space:nowrap;cursor:pointer}.topic-link:hover{color:#fff}.topic-link:focus-visible,.brief-status button:focus-visible{outline:1px solid #84d8e9;outline-offset:3px;border-radius:2px}.topic-link span{font-size:12px}
.brief-metrics{display:grid;grid-template-columns:1.1fr 1.1fr .8fr;gap:8px;margin:0}.brief-metrics>div{min-width:0}.brief-metrics dt{color:#a4bdd0;font-size:11px;line-height:17px;white-space:nowrap}.brief-metrics dd{display:flex;align-items:baseline;gap:3px;margin:3px 0 0;color:#7ce4e6;font-size:clamp(16px,6cqi,22px);font-weight:600;line-height:25px;font-variant-numeric:tabular-nums;white-space:nowrap}.brief-metrics small{color:#a4bdd0;font-size:10px;font-weight:400}.facility-brief .brief-metrics{grid-template-columns:1fr 1fr 1fr}.metric-abnormal dd{color:#ffad98}.metric-checking dd{color:#ffd16b}.facility-composition{margin-top:8px}.status-track{display:flex;height:4px;border-radius:3px;overflow:hidden;background:#7095a329}.status-track i{display:block;height:100%;transition:width .4s ease}.status-legend{display:flex;justify-content:space-between;gap:6px;margin-top:5px;color:#91b1c3;font-size:10px;line-height:15px}.status-legend span{display:inline-flex;align-items:center;gap:4px}.status-legend i{width:5px;height:5px;border-radius:1px}.brief-status{margin:0;color:#a4bdd0;font-size:12px;line-height:24px}.brief-status button{border:0;padding:0 0 0 8px;background:transparent;color:#84d8e9;font:inherit;cursor:pointer}
@container(max-width:225px){.facility-brief .brief-heading{flex-wrap:wrap;gap:1px}.facility-brief .topic-links{width:100%;justify-content:flex-end}}
@media(max-height:780px){.facility-brief .topic-link span{display:none}.dashboard-topics{gap:8px}.topic-brief+.topic-brief{padding-top:8px}.brief-heading{margin-bottom:5px}.brief-metrics dd{font-size:16px;line-height:22px;margin-top:2px}.facility-composition{margin-top:6px}.status-legend{margin-top:4px}}
@media(prefers-reduced-motion:reduce){.status-track i{transition:none}}
</style>
