<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, use, type EChartsType } from 'echarts/core'
import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import TaskCenterLayout from '@/layouts/TaskCenterLayout.vue'
import { getBusinessDashboardStatistics, type BusinessDashboardStatistics } from '@/api/business-statistics'
import { getGovernanceTaskPage, type GovernanceTask } from '@/api/governance-task'
import { collectPages } from '@/api/pagination'
import { useUserStore } from '@/stores/user'
import { isTaskVisibleForOrganization } from '@/utils/scene-visibility'

use([LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const user = useUserStore()
const statistics = ref<BusinessDashboardStatistics>()
const tasks = ref<GovernanceTask[]>([])
const statisticsLoading = ref(true)
const tasksLoading = ref(true)
const statisticsError = ref('')
const tasksError = ref('')
const refreshedAt = ref('')
const trendContainer = ref<HTMLElement>()
const statusContainer = ref<HTMLElement>()
let trendChart: EChartsType | undefined
let statusChart: EChartsType | undefined
let requestVersion = 0
let resizeObserver: ResizeObserver | undefined

const taskSummary = computed(() => statistics.value?.taskSummary)
const kpis = computed(() => [
  { label: '任务总数', value: taskSummary.value?.total, icon: '▣', tone: 'blue', note: '全部治理任务' },
  { label: '执行中', value: taskSummary.value?.executing, icon: '▶', tone: 'cyan', note: '正在办理任务' },
  { label: '待执行', value: taskSummary.value?.pending, icon: '◷', tone: 'orange', note: '等待启动任务' },
  { label: '待核查', value: taskSummary.value?.pendingVerify, icon: '⌕', tone: 'purple', note: '等待核查确认' },
  { label: '已完成', value: taskSummary.value?.finished, icon: '✓', tone: 'green', note: '已办结任务' },
])
const trendItems = computed(() => statistics.value?.trend.items ?? [])
const statusItems = computed(() => {
  const summary = taskSummary.value
  if (!summary) return []
  return [
    { name: '待执行', value: summary.pending, itemStyle: { color: '#f6a548' } },
    { name: '执行中', value: summary.executing, itemStyle: { color: '#2e92df' } },
    { name: '待核查', value: summary.pendingVerify, itemStyle: { color: '#7a6de3' } },
    { name: '已完成', value: summary.finished, itemStyle: { color: '#39b889' } },
    { name: '已失败', value: summary.failed, itemStyle: { color: '#e6606a' } },
    { name: '已取消', value: summary.canceled, itemStyle: { color: '#9ba8b4' } },
  ].filter((item) => item.value > 0)
})
const sceneRanking = computed(() => [...(statistics.value?.sceneStats ?? [])]
  .sort((left, right) => right.taskCount - left.taskCount)
  .slice(0, 5))
const maxSceneTasks = computed(() => Math.max(1, ...sceneRanking.value.map((item) => item.taskCount)))
const sceneStatusBreakdown = computed(() => {
  const grouped = new Map<string, { pending: number; processing: number; closed: number }>()
  for (const task of tasks.value) {
    const current = grouped.get(task.sceneName) ?? { pending: 0, processing: 0, closed: 0 }
    if (task.taskStatus === 5) current.closed += 1
    else if (task.taskStatus === 0) current.pending += 1
    else current.processing += 1
    grouped.set(task.sceneName, current)
  }
  return grouped
})

const completedTasks = computed(() => tasks.value.filter((task) => task.taskStatus === 5))
const timedCompletedTasks = computed(() => completedTasks.value.filter((task) => task.actualEndTime && task.planEndTime))
const onTimeTasks = computed(() => timedCompletedTasks.value.filter((task) =>
  new Date(task.actualEndTime!).getTime() <= new Date(task.planEndTime!).getTime()))
const durations = computed(() => completedTasks.value.flatMap((task) => {
  if (!task.actualStartTime || !task.actualEndTime) return []
  const hours = (new Date(task.actualEndTime).getTime() - new Date(task.actualStartTime).getTime()) / 3_600_000
  return Number.isFinite(hours) && hours >= 0 ? [hours] : []
}))
const overdueCount = computed(() => tasks.value.filter((task) =>
  task.taskStatus !== 5
  && task.taskStatus !== 4
  && task.planEndTime
  && new Date(task.planEndTime).getTime() < Date.now()).length)
const efficiencyItems = computed(() => [
  {
    label: '任务办结率',
    value: percent(taskSummary.value?.finished, taskSummary.value?.total),
    note: `${taskSummary.value?.finished ?? 0} / ${taskSummary.value?.total ?? 0} 个`,
    tone: 'blue',
  },
  {
    label: '按时完成率',
    value: timedCompletedTasks.value.length ? percent(onTimeTasks.value.length, timedCompletedTasks.value.length) : '—',
    note: timedCompletedTasks.value.length ? `${onTimeTasks.value.length} / ${timedCompletedTasks.value.length} 个` : '暂无完整计划时间',
    tone: 'green',
  },
  {
    label: '平均办理时长',
    value: durations.value.length
      ? `${(durations.value.reduce((sum, value) => sum + value, 0) / durations.value.length).toFixed(1)}h`
      : '—',
    note: `基于 ${durations.value.length} 个完整样本`,
    tone: 'purple',
  },
  {
    label: '当前逾期任务',
    value: String(overdueCount.value),
    note: `基于当前部门 ${tasks.value.length} 条任务`,
    tone: overdueCount.value ? 'orange' : 'green',
  },
])

function percent(value = 0, total = 0) {
  return total > 0 ? `${Math.round(value / total * 100)}%` : '0%'
}

function renderTrendChart() {
  if (!trendChart || !trendItems.value.length) {
    trendChart?.clear()
    return
  }
  trendChart.setOption({
    animationDuration: 450,
    grid: { top: 28, right: 24, bottom: 30, left: 42 },
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#dbe4ec', textStyle: { color: '#34485e' } },
    legend: { top: 0, right: 14, itemWidth: 18, itemHeight: 8, textStyle: { color: '#738396', fontSize: 11 }, data: ['任务数', '异常图斑'] },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trendItems.value.map((item) => item.date.slice(5).replace('-', '/')),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#dfe6ed' } },
      axisLabel: { color: '#8997a7' },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#8997a7' },
      splitLine: { lineStyle: { color: '#edf1f5', type: 'dashed' } },
    },
    series: [
      {
        name: '任务数',
        type: 'line',
        smooth: false,
        symbol: 'circle',
        symbolSize: 7,
        data: trendItems.value.map((item) => item.taskCount),
        lineStyle: { width: 3, color: '#2d8ed9' },
        itemStyle: { color: '#2d8ed9', borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: '#2d8ed918' },
      },
      {
        name: '异常图斑',
        type: 'line',
        smooth: false,
        symbol: 'circle',
        symbolSize: 6,
        data: trendItems.value.map((item) => item.abnormalCount),
        lineStyle: { width: 2, color: '#f2a24c' },
        itemStyle: { color: '#f2a24c' },
      },
    ],
  }, true)
}

function renderStatusChart() {
  if (!statusChart || !statusItems.value.length) {
    statusChart?.clear()
    return
  }
  statusChart.setOption({
    animationDuration: 450,
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 个（{d}%）' },
    legend: { orient: 'vertical', right: 8, top: 'middle', itemWidth: 10, itemHeight: 10, textStyle: { color: '#6e7f91', fontSize: 11 } },
    series: [{
      name: '任务状态',
      type: 'pie',
      radius: ['53%', '73%'],
      center: ['38%', '51%'],
      avoidLabelOverlap: true,
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
      data: statusItems.value,
    }],
  }, true)
}

async function loadData() {
  const version = ++requestVersion
  statisticsLoading.value = true
  tasksLoading.value = true
  statisticsError.value = ''
  tasksError.value = ''
  const deptId = user.activeDeptId
  const organizationId = user.organizationId
  const [statisticsResult, tasksResult] = await Promise.allSettled([
    getBusinessDashboardStatistics({ deptId, days: 7 }),
    collectPages((pageNum, pageSize) => getGovernanceTaskPage({ pageNum, pageSize, deptId, organizationId })),
  ])
  if (version !== requestVersion) return

  if (statisticsResult.status === 'fulfilled') statistics.value = statisticsResult.value
  else {
    statistics.value = undefined
    statisticsError.value = statisticsResult.reason instanceof Error ? statisticsResult.reason.message : '任务统计加载失败'
  }
  statisticsLoading.value = false

  if (tasksResult.status === 'fulfilled') {
    tasks.value = tasksResult.value.filter((task) =>
      isTaskVisibleForOrganization(user.organization, task, deptId))
  } else {
    tasks.value = []
    tasksError.value = tasksResult.reason instanceof Error ? tasksResult.reason.message : '任务明细加载失败'
  }
  tasksLoading.value = false
  refreshedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
  await nextTick()
  renderTrendChart()
  renderStatusChart()
}

function initializeCharts() {
  if (trendContainer.value) trendChart = init(trendContainer.value)
  if (statusContainer.value) statusChart = init(statusContainer.value)
  resizeObserver = new ResizeObserver(() => {
    trendChart?.resize()
    statusChart?.resize()
  })
  if (trendContainer.value) resizeObserver.observe(trendContainer.value)
  if (statusContainer.value) resizeObserver.observe(statusContainer.value)
}

watch([() => user.organizationId, () => user.activeDeptId], () => void loadData())
watch([trendItems, statusItems], () => {
  renderTrendChart()
  renderStatusChart()
}, { deep: true })
onMounted(() => {
  initializeCharts()
  void loadData()
})
onBeforeUnmount(() => {
  requestVersion++
  resizeObserver?.disconnect()
  trendChart?.dispose()
  statusChart?.dispose()
})
</script>

<template>
  <TaskCenterLayout title="任务总览" :subtitle="`${user.organization.name} · 任务运行与办理效能概览`">
    <template #actions>
      <div class="overview-actions">
        <span v-if="refreshedAt">更新于 {{ refreshedAt }}</span>
        <button type="button" :disabled="statisticsLoading || tasksLoading" @click="loadData">
          {{ statisticsLoading || tasksLoading ? '加载中…' : '刷新数据' }}
        </button>
      </div>
    </template>

    <div v-if="statisticsError || tasksError" class="error-banner" role="alert">
      <span>部分数据加载失败：{{ [statisticsError, tasksError].filter(Boolean).join('；') }}</span>
      <button type="button" @click="loadData">重新加载</button>
    </div>

    <section class="kpi-grid" aria-label="任务关键指标">
      <article v-for="kpi in kpis" :key="kpi.label" class="kpi-card" :class="`is-${kpi.tone}`">
        <i>{{ kpi.icon }}</i>
        <div><span>{{ kpi.label }}</span><strong>{{ statisticsLoading ? '—' : (kpi.value ?? 0) }}</strong><small>{{ kpi.note }}</small></div>
      </article>
    </section>

    <section class="overview-grid">
      <article class="panel trend-panel">
        <header><div><h2>任务趋势</h2><p>近 {{ statistics?.trend.days ?? 7 }} 日任务与异常变化</p></div><em>单位：个</em></header>
        <div class="chart-wrap">
          <div ref="trendContainer" class="chart"></div>
          <div v-if="statisticsLoading" class="panel-state">正在加载趋势数据…</div>
          <div v-else-if="statisticsError" class="panel-state error">趋势数据暂不可用</div>
          <div v-else-if="!trendItems.length" class="panel-state">暂无任务趋势数据</div>
        </div>
      </article>

      <article class="panel status-panel">
        <header><div><h2>任务状态分布</h2><p>当前任务全生命周期状态</p></div></header>
        <div class="chart-wrap">
          <div ref="statusContainer" class="chart"></div>
          <div v-if="statisticsLoading" class="panel-state">正在加载状态统计…</div>
          <div v-else-if="statisticsError" class="panel-state error">状态统计暂不可用</div>
          <div v-else-if="!statusItems.length" class="panel-state">暂无任务状态数据</div>
        </div>
      </article>

      <article class="panel ranking-panel">
        <header><div><h2>场景任务排行</h2><p>按任务总数由高到低排列</p></div></header>
        <div v-if="statisticsLoading" class="panel-state standalone">正在加载场景数据…</div>
        <div v-else-if="statisticsError" class="panel-state standalone error">场景排行暂不可用</div>
        <div v-else-if="!sceneRanking.length" class="panel-state standalone">暂无场景任务数据</div>
        <ol v-else class="ranking-list">
          <li v-for="(scene, index) in sceneRanking" :key="scene.sceneId || scene.sceneCode">
            <b>{{ index + 1 }}</b>
            <div>
              <span><strong>{{ scene.sceneName }}</strong><em>{{ scene.taskCount }} 个任务</em></span>
              <i><u :style="{ width: `${scene.taskCount / maxSceneTasks * 100}%` }"></u></i>
              <small v-if="sceneStatusBreakdown.get(scene.sceneName)" class="scene-statuses">
                <span>未处理 {{ sceneStatusBreakdown.get(scene.sceneName)?.pending }}</span>
                <span>处理中 {{ sceneStatusBreakdown.get(scene.sceneName)?.processing }}</span>
                <span>已结案 {{ sceneStatusBreakdown.get(scene.sceneName)?.closed }}</span>
              </small>
            </div>
          </li>
        </ol>
      </article>

      <article class="panel efficiency-panel">
        <header><div><h2>办理效能</h2><p>结合任务统计与前 100 条任务明细计算</p></div></header>
        <div v-if="tasksLoading && !statistics" class="panel-state standalone">正在计算办理效能…</div>
        <div v-else-if="tasksError && statisticsError" class="panel-state standalone error">办理效能暂不可用</div>
        <div v-else-if="!tasksLoading && !tasks.length && !taskSummary?.total" class="panel-state standalone">暂无可统计的任务</div>
        <div v-else class="efficiency-grid">
          <div v-for="item in efficiencyItems" :key="item.label" :class="`is-${item.tone}`">
            <span>{{ item.label }}</span><strong>{{ tasksLoading ? '—' : item.value }}</strong><small>{{ tasksLoading ? '任务明细加载中' : item.note }}</small>
          </div>
        </div>
      </article>
    </section>
  </TaskCenterLayout>
</template>

<style scoped lang="scss">
.overview-actions { display: flex; align-items: center; gap: 14px; }
.overview-actions span { color: #8997a7; font-size: 12px; }
.overview-actions button, .error-banner button {
  height: 34px;
  padding: 0 15px;
  color: #fff;
  background: #2389d3;
  border: 1px solid #1880c8;
  border-radius: 4px;
  cursor: pointer;
}
.overview-actions button:disabled { opacity: .6; cursor: wait; }
.error-banner {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
  padding: 8px 13px;
  color: #a74e4e;
  background: #fff4f3;
  border: 1px solid #f0cfcb;
  border-radius: 5px;
  font-size: 13px;
}
.error-banner button { height: 28px; color: #b04b4b; background: #fff; border-color: #e1aaa5; }
.kpi-grid { display: grid; grid-template-columns: repeat(5, minmax(150px, 1fr)); gap: 14px; }
.kpi-card {
  min-height: 112px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  background: #fff;
  border: 1px solid #e3e9ef;
  border-radius: 6px;
  box-shadow: 0 3px 12px #2449690b;
}
.kpi-card > i {
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  display: grid;
  place-items: center;
  color: #2f8bd1;
  background: #e9f5fd;
  border-radius: 50%;
  font-size: 20px;
  font-style: normal;
}
.kpi-card span, .kpi-card strong, .kpi-card small { display: block; }
.kpi-card span { color: #758598; font-size: 13px; }
.kpi-card strong { margin: 3px 0 2px; color: #263b52; font-size: 27px; line-height: 1.15; }
.kpi-card small { color: #a2aebb; font-size: 11px; }
.kpi-card.is-cyan > i { color: #1a9daf; background: #e5f7f7; }
.kpi-card.is-orange > i { color: #dc8a2f; background: #fff3e4; }
.kpi-card.is-purple > i { color: #7264d6; background: #f0edff; }
.kpi-card.is-green > i { color: #2eaa7c; background: #e6f7f0; }
.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(320px, .85fr);
  gap: 14px;
  margin-top: 14px;
}
.panel {
  min-height: 300px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e3e9ef;
  border-radius: 6px;
  box-shadow: 0 3px 12px #2449690b;
}
.panel > header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid #edf1f4;
}
.panel h2, .panel p { margin: 0; }
.panel h2 { color: #2a3d52; font-size: 16px; font-weight: 600; }
.panel p { margin-top: 5px; color: #99a5b2; font-size: 11px; }
.panel header > em { color: #a3afba; font-size: 11px; font-style: normal; }
.chart-wrap { position: relative; height: 246px; }
.chart { width: 100%; height: 100%; }
.panel-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #9aa7b4;
  background: #fff;
  font-size: 13px;
}
.panel-state.error { color: #bd6565; }
.panel-state.standalone { position: static; min-height: 220px; }
.ranking-list { margin: 0; padding: 15px 20px 10px; list-style: none; }
.ranking-list li { display: flex; align-items: center; gap: 11px; min-height: 42px; }
.ranking-list li > b {
  width: 23px;
  height: 23px;
  flex: 0 0 23px;
  display: grid;
  place-items: center;
  color: #7e8d9d;
  background: #eef2f5;
  border-radius: 50%;
  font-size: 11px;
}
.ranking-list li:nth-child(-n+3) > b { color: #fff; background: #318ed3; }
.ranking-list li > div { min-width: 0; flex: 1; }
.ranking-list span { display: flex; justify-content: space-between; gap: 8px; }
.ranking-list strong { overflow: hidden; color: #526477; font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.ranking-list em { color: #8f9dac; font-size: 11px; font-style: normal; white-space: nowrap; }
.ranking-list i { height: 5px; display: block; margin-top: 6px; overflow: hidden; background: #eef2f5; border-radius: 3px; }
.ranking-list u { height: 100%; display: block; min-width: 3px; background: linear-gradient(90deg, #46a9df, #2684cb); border-radius: 3px; }
.scene-statuses { display: flex!important; gap: 9px; margin-top: 5px; color: #8b99a7; font-size: 9px; }
.scene-statuses span { display: inline; }
.efficiency-grid { min-height: 220px; display: grid; grid-template-columns: repeat(4, 1fr); align-items: center; padding: 20px 18px; }
.efficiency-grid > div { min-width: 0; padding: 12px 18px; text-align: center; border-right: 1px solid #edf1f4; }
.efficiency-grid > div:last-child { border-right: 0; }
.efficiency-grid span, .efficiency-grid strong, .efficiency-grid small { display: block; }
.efficiency-grid span { color: #77889a; font-size: 12px; }
.efficiency-grid strong { margin: 10px 0 8px; color: #2f8bd1; font-size: 27px; }
.efficiency-grid small { overflow: hidden; color: #a0acb8; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.efficiency-grid .is-green strong { color: #31a779; }
.efficiency-grid .is-purple strong { color: #7467d4; }
.efficiency-grid .is-orange strong { color: #df8b31; }
@media (max-width: 1280px) {
  .kpi-grid { gap: 9px; }
  .kpi-card { gap: 9px; padding: 14px 11px; }
  .kpi-card > i { width: 38px; height: 38px; flex-basis: 38px; }
  .overview-grid { grid-template-columns: minmax(0, 1.4fr) minmax(290px, .8fr); }
}
@media (max-height: 820px) {
  .kpi-card { min-height: 92px; }
  .panel { min-height: 265px; }
  .chart-wrap { height: 210px; }
  .panel-state.standalone, .efficiency-grid { min-height: 185px; }
}
</style>
