<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PortalTask } from '@/types'
import { problemSpots, spotTimeline } from '@/mocks/governance'
import SpotDistributionMap from './SpotDistributionMap.vue'

defineProps<{ task?: PortalTask }>()
const keyword = ref('')
const status = ref('')
const source = ref('')
const risk = ref('')
const activeId = ref(problemSpots[0]!.id)
const periods = ref(3)
const remark = ref('')
const message = ref('')
const filtered = computed(() => problemSpots.filter((item) =>
  (!keyword.value || `${item.id}${item.type}`.includes(keyword.value))
  && (!status.value || item.status === status.value)
  && (!source.value || item.source === source.value)
  && (!risk.value || item.risk === risk.value),
))
const active = computed(() => problemSpots.find((item) => item.id === activeId.value) || problemSpots[0]!)
function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  message.value = file ? `已载入人工变化图片：${file.name}` : ''
}
function judge(result: string) {
  message.value = `${active.value.id} 已${result}${remark.value ? `：${remark.value}` : ''}`
}
</script>

<template>
  <div class="governance-page spot-page">
    <aside class="panel spot-list">
      <div class="panel-title">问题图斑列表 <small>{{ filtered.length }} 处</small></div>
      <div class="filters">
        <input v-model="keyword" placeholder="搜索编号或类型" />
        <select v-model="status"><option value="">全部状态</option><option>待研判</option><option>已确认</option><option>已排除</option></select>
        <select v-model="source"><option value="">全部来源</option><option>无人机巡查发现</option><option>卫片疑似问题</option><option>AI 自动识别</option><option>森林督查图斑</option><option>多期变化检测</option></select>
        <select v-model="risk"><option value="">全部风险</option><option>高</option><option>中</option><option>低</option></select>
      </div>
      <button v-for="item in filtered" :key="item.id" class="spot-item" :class="{ active: item.id === activeId }" @click="activeId = item.id">
        <i></i><span><b>{{ item.type }}</b><small>{{ item.id }} · {{ item.source }}</small></span>
        <em :class="`risk-${item.risk}`">{{ item.risk }}风险</em>
      </button>
    </aside>

    <section class="center-column">
      <div class="panel map-panel">
        <div class="panel-title">图斑分布 <small>泰州市 · 林业专题</small></div>
        <SpotDistributionMap :spots="filtered" :active-id="activeId" @select="activeId = $event" />
      </div>
      <div class="panel analysis">
        <div class="panel-title">多期影像 / 变化分析</div>
        <div class="periods">
          <button v-for="n in [2,3,4,5]" :key="n" :class="{ active: periods === n }" @click="periods = n">{{ n }} 期影像</button>
          <button>AI 自动识别</button><button>执行变化检测</button>
          <label>上传人工发现变化图片<input type="file" accept="image/*" @change="upload" /></label>
        </div>
        <div class="imagery">
          <div v-for="n in periods" :key="n" :class="`image image-${n}`"><b>第 {{ n }} 期</b><small>2026-0{{ 4 + n }}-15</small></div>
        </div>
      </div>
    </section>

    <aside class="right-column">
      <div class="panel detail">
        <div class="panel-title">图斑详细信息</div>
        <dl><dt>图斑编号</dt><dd>{{ active.id }}</dd><dt>疑似类型</dt><dd>{{ active.type }}</dd><dt>置信度</dt><dd>{{ active.confidence }}%</dd><dt>风险等级</dt><dd>{{ active.risk }}</dd><dt>面积</dt><dd>{{ active.area }} ha</dd><dt>来源</dt><dd>{{ active.source }}</dd><dt>发现时间</dt><dd>{{ active.discoveredAt }}</dd></dl>
        <p>{{ active.description }}</p>
      </div>
      <div class="panel timeline">
        <div class="panel-title">历史时间轴</div>
        <div v-for="event in spotTimeline" :key="event.time" class="timeline-item"><i></i><div><b>{{ event.name }}</b><small>{{ event.time }} · {{ event.operator }}</small></div></div>
      </div>
      <div class="panel judgment">
        <div class="panel-title">人工研判</div>
        <textarea v-model="remark" placeholder="填写研判意见"></textarea>
        <div><button class="ghost" @click="judge('排除')">排除问题</button><button class="primary" @click="judge('确认入库')">确认入库</button></div>
        <small v-if="message">{{ message }}</small>
      </div>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.governance-page { height: 100%; min-height: 0; display: grid; grid-template-columns: 270px 1fr 310px; gap: 8px; padding: 8px; background: #e8eef3; color: #29475a; }
.panel { min-height: 0; overflow: hidden; background: #fff; border: 1px solid #d5e0e8; border-radius: 6px; box-shadow: 0 2px 8px #1c3b5210; }
.panel-title { height: 36px; display: flex; align-items: center; justify-content: space-between; padding: 0 11px; border-bottom: 1px solid #e6eef3; color: #1f3d52; font-size: 13px; font-weight: 700; }
.panel-title small { color: #7a8f9e; font-weight: 500; }
.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 8px; }
.filters input { grid-column: 1/-1; }.filters input,.filters select { min-width: 0; height: 30px; padding: 0 7px; border: 1px solid #d3e2eb; border-radius: 4px; font-size: 11px; }
.spot-list { overflow: auto; }.spot-item { width: 100%; display: grid; grid-template-columns: 48px 1fr auto; gap: 8px; align-items: center; padding: 9px; border: 0; border-top: 1px solid #eef3f6; background: #fff; text-align: left; cursor: pointer; }
.spot-item.active { background: #eaf6fc; border-left: 3px solid #1399bd; }.spot-item>i { width: 48px; height: 38px; background: linear-gradient(145deg,#49764e,#8a7651); border-radius: 3px; }.spot-item b,.spot-item small { display:block; }.spot-item b { font-size: 12px; }.spot-item small { margin-top:4px;color:#7a8f9e;font-size:9px; }.spot-item em { padding:3px 5px;border-radius:3px;font-style:normal;font-size:9px; }.risk-高{color:#d94242;background:#fdeaea}.risk-中{color:#b67815;background:#fff3dc}.risk-低{color:#197ba5;background:#e5f4fb}
.center-column { min-width:0;display:grid;grid-template-rows:minmax(300px,1fr) 190px;gap:8px; }.map-panel{display:flex;flex-direction:column}.map-panel :deep(.spot-map){flex:1}.right-column{min-height:0;display:grid;grid-template-rows:auto 1fr auto;gap:8px}
.analysis .periods{display:flex;gap:6px;padding:8px}.periods button,.periods label{padding:7px 9px;color:#426478;background:#f3f8fb;border:1px solid #d3e2eb;border-radius:4px;font-size:10px;cursor:pointer}.periods button.active{color:#fff;background:#178db5}.periods input{display:none}.imagery{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:0 8px 8px}.image{height:94px;padding:8px;display:grid;align-content:end;color:#fff;background:linear-gradient(#0002,#0009),linear-gradient(145deg,#345e40,#9a8b59);border-radius:4px}.image b,.image small{font-size:10px}.image small{margin-top:3px}
dl{display:grid;grid-template-columns:80px 1fr;margin:0;padding:8px 11px}dt,dd{margin:0;padding:6px 0;border-bottom:1px solid #edf2f5;font-size:11px}dt{color:#7a8f9e}dd{text-align:right;font-weight:600}.detail p{margin:0 11px 10px;padding:9px;color:#6a7e8c;background:#f5f8fa;font-size:10px;line-height:1.6}.timeline{overflow:auto}.timeline-item{display:grid;grid-template-columns:12px 1fr;gap:7px;margin-left:15px;padding:9px 10px;border-left:1px solid #cddde7}.timeline-item i{width:7px;height:7px;margin-left:-14px;border-radius:50%;background:#17a7bd}.timeline-item b,.timeline-item small{display:block;font-size:10px}.timeline-item small{margin-top:3px;color:#8496a3}
.judgment textarea{width:calc(100% - 20px);height:50px;box-sizing:border-box;margin:9px 10px;padding:7px;border:1px solid #d3e2eb;resize:none}.judgment>div{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:0 10px 9px}.judgment button{height:32px;border-radius:4px;cursor:pointer}.ghost{color:#557080;background:#fff;border:1px solid #cbdbe5}.primary{color:#fff;background:#168bd2;border:1px solid #168bd2}.judgment>small{display:block;padding:0 10px 9px;color:#1c9961}
</style>
