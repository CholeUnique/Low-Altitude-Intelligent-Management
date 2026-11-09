<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  getFacilityPage,
  getFacilityRegionStatistics,
  getFacilityStatistics,
  type FacilityRecord,
  type FacilityRegionStat,
  type FacilityStatItem,
  type FacilityStatistics,
} from '@/api/facility'
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'
import { FACILITIES_TOPIC_ID } from '@/stores/geographic-topics'

const user = useUserStore()
const router = useRouter()
function openCard(label: string) {
  if (label === '设施总数' || label === '正常') {
    void router.push({ name: 'recognition', params: { tab: 'topics' }, query: { topic: FACILITIES_TOPIC_ID, view: 'map' } })
  } else if (label === '异常' || label === '核查中') {
    void router.push({ name: 'task-list', query: { sceneCode: 'farmland-facilities' } })
  }
}
function cardDestination(label: string) {
  return label === '设施总数' || label === '正常' ? '工程设施地图' : label === '异常' || label === '核查中' ? '工程设施任务列表' : ''
}
const statistics = ref<FacilityStatistics>()
const regions = ref<FacilityRegionStat[]>([])
const recent = ref<FacilityRecord[]>([])
const loading = ref(false)
const error = ref('')
const refreshedAt = ref('')

const STATUS_META = [
  { key: 'NORMAL', label: '正常', color: '#4bd6a0' },
  { key: 'ABNORMAL', label: '异常', color: '#ff8f7a' },
  { key: 'CHECKING', label: '核查中', color: '#ffc65c' },
  { key: 'DISCARDED', label: '废弃', color: '#8fa6b6' },
] as const
const TYPE_COLORS = ['#62d6df', '#6fa8ff', '#a98bff', '#f0a45c', '#5ed3a8', '#ef8fb8', '#8fd0f0', '#c7d96a']

const total = computed(() => statistics.value?.totalCount || 0)
const statusCards = computed(() => [
  { label: '设施总数', value: statistics.value?.totalCount, note: '台账内全部设施', color: '#62d6df' },
  { label: '正常', value: statistics.value?.normalCount, note: '运行正常', color: '#4bd6a0' },
  { label: '异常', value: statistics.value?.abnormalCount, note: '存在问题待处理', color: '#ff8f7a' },
  { label: '核查中', value: statistics.value?.checkingCount, note: '现场核查进行中', color: '#ffc65c' },
  { label: '废弃', value: statistics.value?.discardedCount, note: '已停用归档', color: '#8fa6b6' },
])
function share(value?: number | null) {
  if (!total.value || !value) return 0
  return Math.round((value / total.value) * 1000) / 10
}
const statusItems = computed(() => {
  const counts = new Map<string, number>()
  ;(statistics.value?.statusCounts || []).forEach((item: FacilityStatItem) => {
    const key = String(item.key || item.name || '').toUpperCase()
    if (key) counts.set(key, Number(item.count) || 0)
  })
  const fallback: Record<string, number | undefined> = {
    NORMAL: statistics.value?.normalCount,
    ABNORMAL: statistics.value?.abnormalCount,
    CHECKING: statistics.value?.checkingCount,
    DISCARDED: statistics.value?.discardedCount,
  }
  return STATUS_META.map(meta => {
    const count = counts.get(meta.key) ?? counts.get(meta.label) ?? fallback[meta.key] ?? 0
    return { ...meta, count, percent: total.value ? (count / total.value) * 100 : 0 }
  })
})
const donutStyle = computed(() => {
  const items = statusItems.value.filter(item => item.count > 0)
  if (!items.length) return { background: 'conic-gradient(#1d3f52 0turn 1turn)' }
  let cursor = 0
  const stops = items.map(item => {
    const from = cursor
    cursor += item.percent / 100
    return `${item.color} ${from}turn ${cursor}turn`
  })
  return { background: `conic-gradient(${stops.join(',')})` }
})
const typeItems = computed(() => {
  const list = (statistics.value?.typeCounts || []).map((item, index) => ({
    label: item.name || item.key || '未分类',
    count: Number(item.count) || 0,
    color: TYPE_COLORS[index % TYPE_COLORS.length]!,
  }))
  const max = Math.max(1, ...list.map(item => item.count))
  return list.sort((left, right) => right.count - left.count).slice(0, 8).map(item => ({ ...item, width: Math.round((item.count / max) * 100) }))
})
const regionItems = computed(() => {
  const list = [...regions.value].sort((left, right) => right.totalCount - left.totalCount).slice(0, 8)
  const max = Math.max(1, ...list.map(item => item.totalCount))
  return list.map(item => ({ ...item, width: Math.round((item.totalCount / max) * 100) }))
})
const abnormalRate = computed(() => {
  if (!total.value) return '—'
  return `${share(statistics.value?.abnormalCount)}%`
})

function statusClass(status?: string | null) {
  return `is-${String(status || '').toLowerCase()}`
}
function statusText(record: FacilityRecord) {
  return record.bizStatusName || record.bizStatus || '未知'
}
function updateTime(record: FacilityRecord) {
  return record.updateTime ? record.updateTime.replace('T', ' ').slice(0, 16) : '—'
}

async function loadData() {
  const deptId = user.activeDeptId
  if (!deptId) { error.value = '当前未选择部门，无法统计数据。'; return }
  loading.value = true
  error.value = ''
  try {
    const [overall, regionStats, page] = await Promise.all([
      getFacilityStatistics(deptId),
      getFacilityRegionStatistics(deptId).catch(() => []),
      getFacilityPage({ deptId, pageNum: 1, pageSize: 6 }).catch(() => ({ records: [], total: 0, pageNum: 1, pageSize: 6 })),
    ])
    statistics.value = overall
    regions.value = Array.isArray(regionStats) ? regionStats : []
    recent.value = Array.isArray(page.records) ? page.records : []
    refreshedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '设施统计读取失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => void loadData())
watch(() => user.activeDeptId, () => void loadData())
</script>

<template>
  <section class="facility-dashboard">
    <header class="dashboard-heading">
      <div>
        <div class="eyebrow">专题分析 / 高标准农田工程设施管理 / 工程设施总览</div>
      </div>
      <div class="heading-actions">
        <span v-if="refreshedAt">更新于 {{ refreshedAt }}</span>
        <button type="button" :disabled="loading" @click="loadData">{{ loading ? '加载中…' : '刷新数据' }}</button>
      </div>
    </header>

    <div v-if="error" class="notice" role="alert">{{ error }}<button type="button" @click="loadData">重试</button></div>

    <div class="kpi-grid">
      <component :is="cardDestination(card.label) ? 'button' : 'article'" v-for="card in statusCards" :key="card.label" class="kpi-card" :class="{ 'kpi-card--link': cardDestination(card.label) }" :style="{ '--tone': card.color }" :type="cardDestination(card.label) ? 'button' : undefined" :aria-label="cardDestination(card.label) ? `${card.label}，查看${cardDestination(card.label)}` : undefined" @click="openCard(card.label)">
        <span>{{ card.label }}</span>
        <strong>{{ loading && card.label !== '设施总数' ? '—' : (card.value ?? 0).toLocaleString() }}</strong>
        <div class="kpi-track"><i :style="{ width: card.label === '设施总数' ? '100%' : `${share(card.value)}%` }" /></div>
        <small>{{ card.note }}{{ card.label === '设施总数' ? '' : ` · 占比 ${share(card.value)}%` }}</small>
      </component>
    </div>

    <div class="board-grid">
      <section class="panel status-panel">
        <header><div><h2>状态构成</h2><p>异常率 {{ abnormalRate }}</p></div><em>单位：个</em></header>
        <div class="status-body">
          <div class="donut" :style="donutStyle"><div class="donut-hole"><strong>{{ total.toLocaleString() }}</strong><span>设施总数</span></div></div>
          <ul class="legend-list">
            <li v-for="item in statusItems" :key="item.key">
              <i :style="{ background: item.color }" />
              <span>{{ item.label }}</span>
              <b>{{ item.count.toLocaleString() }}</b>
              <small>{{ item.percent.toFixed(1) }}%</small>
            </li>
          </ul>
        </div>
      </section>

      <section class="panel type-panel">
        <header><div><h2>设施类型分布</h2><p>按设施类型统计，仅展示前 8 类</p></div></header>
        <ul class="bar-list">
          <li v-for="item in typeItems" :key="item.label">
            <span :title="item.label">{{ item.label }}</span>
            <div><i :style="{ width: `${item.width}%`, background: item.color }" /></div>
            <b>{{ item.count.toLocaleString() }}</b>
          </li>
          <li v-if="!typeItems.length" class="empty">暂无类型统计数据</li>
        </ul>
      </section>
    </div>

    <div class="board-grid bottom">
      <section class="panel region-panel">
        <header><div><h2>行政区划分布</h2><p>按所属区划统计，标注异常数量</p></div></header>
        <ul class="bar-list region">
          <li v-for="item in regionItems" :key="item.regionCode || item.regionName || 'unknown'">
            <span :title="item.regionName || item.regionCode || '未判定'">{{ item.regionName || item.regionCode || '未判定' }}</span>
            <div><i :style="{ width: `${item.width}%` }" /></div>
            <b>{{ item.totalCount.toLocaleString() }}</b>
            <em v-if="item.abnormalCount">异常 {{ item.abnormalCount }}</em>
          </li>
          <li v-if="!regionItems.length" class="empty">暂无区划统计数据</li>
        </ul>
      </section>

      <section class="panel recent-panel">
        <header><div><h2>最近更新设施</h2><p>按更新时间取最新 6 条</p></div></header>
        <ul class="recent-list">
          <li v-for="record in recent" :key="String(record.id)">
            <div class="recent-main">
              <b :title="record.name || ''">{{ record.name || '未命名设施' }}</b>
              <small>{{ record.typeName || record.facilityType || '未分类' }} · {{ record.regionName || '区划未判定' }}</small>
            </div>
            <span class="pill" :class="statusClass(record.bizStatus)">{{ statusText(record) }}</span>
            <time>{{ updateTime(record) }}</time>
          </li>
          <li v-if="!recent.length" class="empty">暂无设施记录</li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
/* 与首页驾驶舱一致的面板语言：玻璃拟态渐变 + 细描边 + 顶部高光线 + 底部水波纹 */
.facility-dashboard{--panel-border:rgba(105,182,217,.20);--panel-bg:radial-gradient(ellipse at 12% 0%,rgba(107,183,215,.10),transparent 62%),linear-gradient(135deg,rgba(8,37,58,.71),rgba(5,24,41,.49));--panel-shadow:0 12px 36px #00101d55,0 2px 6px #00111e26,inset 0 1px 0 #c2ebff18;--muted:#8fb0c2;height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;gap:16px;padding:22px 24px;overflow:hidden;background:radial-gradient(circle at 16% -10%,#103a52 0,transparent 42%),#081c2b;color:#d7edf3}
.dashboard-heading{flex:none;display:flex;align-items:flex-end;justify-content:space-between;gap:16px}
.eyebrow{font-size:12px;color:#9cc3d6;letter-spacing:.5px}
.heading-actions{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px}
.heading-actions button{padding:7px 14px;border:1px solid #2b7fa3;border-radius:6px;background:linear-gradient(135deg,#12789c,#1aa4bd);color:#effcff;font:inherit;font-size:12px;cursor:pointer;transition:filter .18s ease,box-shadow .18s ease}
.heading-actions button:hover:not(:disabled){filter:brightness(1.12);box-shadow:0 3px 12px #0a7d9c33}
.heading-actions button:disabled{opacity:.55;cursor:default}
.notice{flex:none;padding:9px 12px;border:1px solid #8a4d48;border-radius:6px;background:#482d31;color:#ffb6ad;font-size:12px}
.notice button{margin-left:8px;border:0;background:none;color:#9ce4ed;cursor:pointer;font:inherit}
.kpi-card,.panel{position:relative;overflow:hidden;border:1px solid var(--panel-border);border-radius:12px;background:var(--panel-bg);box-shadow:var(--panel-shadow);backdrop-filter:blur(14px) saturate(1.08);-webkit-backdrop-filter:blur(14px) saturate(1.08)}
.kpi-card::before,.panel::before{position:absolute;top:0;left:18px;right:18px;height:1px;background:linear-gradient(90deg,transparent,#c4f4ff70 25%,#56bed736 70%,transparent);content:"";pointer-events:none}
.kpi-grid{flex:none;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}
.kpi-card{position:relative;display:flex;flex-direction:column;gap:7px;padding:15px 17px 14px 20px;transition:transform .18s ease,border-color .18s ease}
.kpi-card--link{width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer}.kpi-card--link:hover{border-color:var(--tone);box-shadow:var(--panel-shadow),0 0 0 1px var(--tone)}.kpi-card--link:focus-visible{outline:2px solid var(--tone);outline-offset:3px}
.kpi-card:hover{transform:translateY(-2px);border-color:#7dc8e55c}
.kpi-card::after{position:absolute;top:16px;bottom:16px;left:0;width:3px;border-radius:3px;background:var(--tone);content:"";opacity:.9}
.kpi-card span{color:#a9c8d8;font-size:12px;letter-spacing:.3px}
.kpi-card strong{color:var(--tone);font-size:30px;line-height:1.05;font-variant-numeric:tabular-nums;text-shadow:0 2px 10px #00121e55}
.kpi-track{height:5px;border-radius:3px;background:#0a2231;overflow:hidden}
.kpi-track i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,var(--tone),#d8fbff66);opacity:.9;transition:width .4s ease}
.kpi-card small{color:var(--muted);font-size:12px}
.board-grid{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:16px}
.board-grid.bottom{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.panel{display:flex;flex-direction:column;min-height:0}
.panel::after{position:absolute;right:0;bottom:0;left:0;height:30px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 36'%3E%3Cg fill='none' stroke='%2324dceb' stroke-opacity='.2'%3E%3Cpath d='M0 35Q60 0 120 26T240 22T360 30M0 30Q60 -5 120 21T240 17T360 25M0 25Q60 -10 120 16T240 12T360 20'/%3E%3C/g%3E%3C/svg%3E") center bottom/100% auto no-repeat;opacity:.18;content:"";pointer-events:none}
.panel>header{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px 11px;border-bottom:1px solid #77cef21c}
.panel>header div{display:flex;align-items:baseline;gap:8px}
.panel h2{position:relative;margin:0;padding-left:13px;font-size:17px;font-weight:600;letter-spacing:.4px;color:#eaf8ff}
.panel h2::before{position:absolute;top:2px;bottom:2px;left:0;width:4px;border-radius:2px;background:linear-gradient(180deg,#38e6f2,#1f8fd0);content:""}
.panel header p{margin:0;color:var(--muted);font-size:12px}
.panel header em{color:var(--muted);font-size:12px;font-style:normal}
.status-body{flex:1;min-height:0;display:flex;align-items:center;gap:24px;padding:16px 18px}
.donut{flex:none;width:138px;height:138px;border-radius:50%;display:grid;place-items:center;position:relative;box-shadow:0 0 0 6px #0d2c3d88,0 10px 26px #00131f55}
.donut-hole{width:92px;height:92px;border-radius:50%;background:radial-gradient(circle at 40% 30%,#16425a,#0d2a3c);display:grid;place-items:center;gap:3px;box-shadow:inset 0 1px 0 #ffffff14}
.donut-hole strong{font-size:22px;color:#eaf9fd;line-height:1;font-variant-numeric:tabular-nums}
.donut-hole span{color:var(--muted);font-size:12px}
.legend-list{flex:1;min-width:0;display:grid;gap:10px;margin:0;padding:0;list-style:none}
.legend-list li{display:grid;grid-template-columns:10px minmax(0,1fr) auto auto;align-items:center;gap:10px;font-size:12px;color:#c3dce6}
.legend-list li i{width:10px;height:10px;border-radius:3px;box-shadow:0 0 6px #00131f55}
.legend-list li b{color:#f0fbff;font-variant-numeric:tabular-nums;font-size:14px}
.legend-list li small{color:var(--muted);font-size:12px;min-width:44px;text-align:right}
.bar-list{flex:1;min-height:0;display:grid;align-content:start;gap:11px;margin:0;padding:14px 16px;list-style:none;overflow:auto}
.bar-list li{display:grid;grid-template-columns:minmax(64px,96px) minmax(0,1fr) auto;align-items:center;gap:11px;font-size:12px;color:#c3dce6}
.bar-list li>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-list li>div{height:8px;border-radius:5px;background:#0a2231;box-shadow:inset 0 1px 2px #0006;overflow:hidden}
.bar-list li>div i{display:block;height:100%;border-radius:5px;transition:width .4s ease;box-shadow:0 0 10px #24dceb22}
.bar-list li>b{color:#f0fbff;font-variant-numeric:tabular-nums}
.bar-list.region li{grid-template-columns:minmax(64px,96px) minmax(0,1fr) auto auto}
.bar-list.region li em{padding:1px 7px;border:1px solid #8a4d48;border-radius:999px;color:#ffb0a0;background:#3c2629;font-size:12px;font-style:normal}
.recent-list{flex:1;min-height:0;display:grid;align-content:start;gap:8px;margin:0;padding:12px;list-style:none;overflow:auto}
.recent-list li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:10px 12px;border:1px solid #1f4a60;border-radius:8px;background:linear-gradient(135deg,#0f2f42cc,#0c2536cc);transition:border-color .16s ease,background .16s ease}
.recent-list li:hover{border-color:#3f8ca6;background:linear-gradient(135deg,#124158cc,#0e2c40cc)}
.recent-main{min-width:0;display:grid;gap:4px}
.recent-main b{font-size:14px;color:#eaf8ff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.recent-main small{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.recent-list time{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.pill{padding:3px 10px;border-radius:999px;font-size:12px;white-space:nowrap;border:1px solid}
.pill.is-normal{color:#6ff0bd;border-color:#2f7f66;background:#123f34}
.pill.is-abnormal{color:#ffb0a0;border-color:#8a4d48;background:#482d31}
.pill.is-checking{color:#ffd48a;border-color:#8a6b34;background:#42351c}
.pill.is-discarded,.pill.is-{color:#a9c0cc;border-color:#3b5b6b;background:#17313f}
li.empty{display:grid;place-items:center;padding:26px;color:var(--muted);font-size:12px}
@media(max-width:1500px){.kpi-grid{gap:11px}.kpi-card strong{font-size:26px}.status-body{gap:16px}}
@media(max-width:1180px){.board-grid,.board-grid.bottom{grid-template-columns:minmax(0,1fr)}.kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style>

