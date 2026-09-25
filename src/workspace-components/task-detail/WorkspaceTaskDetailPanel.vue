<script setup lang="ts">
import type { PortalTask, WorkspaceNodeConfig } from '@/types'

defineProps<{ task?: PortalTask; sceneName?: string; node?: WorkspaceNodeConfig }>()

const plots = [
  { id: 'TB-20260921-001', type: '疑似林地违建', area: '1,286 ㎡', level: '高风险', color: '#ef6b5f' },
  { id: 'TB-20260921-002', type: '林木异常采伐', area: '864 ㎡', level: '待核查', color: '#f4b644' },
  { id: 'TB-20260921-003', type: '林地用途变化', area: '522 ㎡', level: '中风险', color: '#37bfa0' },
  { id: 'TB-20260921-004', type: '临时堆料占地', area: '318 ㎡', level: '待核查', color: '#6b9cf4' },
]
</script>

<template>
  <section class="task-detail-workbench">
    <header class="detail-titlebar">
      <div><small>FORESTRY SUPERVISION TASK</small><h1>{{ task?.name || '林业监管重点区域智能巡查任务' }}</h1><p>任务编号：{{ task?.id || 'LY-2026-0921-01' }}　·　兴化市戴南镇 / 千垛镇交界区域</p></div>
      <div class="title-actions"><span>智能识别已完成</span><button>导出任务简报</button></div>
    </header>

    <div class="metric-row">
      <article><i>斑</i><span>问题图斑<strong>12</strong><small>高风险 3 处</small></span></article>
      <article><i>域</i><span>巡查范围<strong>18.6</strong><small>平方公里</small></span></article>
      <article><i>面</i><span>疑似占地<strong>4,380</strong><small>平方米</small></span></article>
      <article><i>识</i><span>平均置信度<strong>91.8%</strong><small>较上次 +2.4%</small></span></article>
      <article><i>片</i><span>影像成果<strong>326</strong><small>正射 / 变焦照片</small></span></article>
    </div>

    <div class="detail-main-grid">
      <article class="map-card">
        <header><b>任务区域与问题图斑分布</b><span>卫星影像　▾　图斑边界 ✓　行政区划 ✓</span></header>
        <div class="forestry-map">
          <div class="river"></div><div class="road road-a"></div><div class="road road-b"></div>
          <div class="region region-a"><span>A-01<br>重点巡查区</span></div><div class="region region-b"><span>A-02<br>一般巡查区</span></div>
          <button v-for="(plot,index) in plots" :key="plot.id" class="plot-marker" :style="{ '--x': `${24 + index * 18}%`, '--y': `${62 - (index % 2) * 31}%`, '--c': plot.color }">{{ index + 1 }}<small>{{ plot.type }}</small></button>
          <div class="map-scale">0　500m　1km</div><div class="north">N<br>↑</div>
        </div>
      </article>

      <aside class="task-profile">
        <header><b>任务基本信息</b><span>详情</span></header>
        <dl><div><dt>所属场景</dt><dd>{{ sceneName || '林业执法监管' }}</dd></div><div><dt>任务来源</dt><dd>AI 变化检测自动生成</dd></div><div><dt>巡查批次</dt><dd>2026 年第 38 周</dd></div><div><dt>采集时间</dt><dd>2026-09-21 08:35—10:12</dd></div><div><dt>飞行设备</dt><dd>大疆 M350 RTK / H20T</dd></div><div><dt>责任单位</dt><dd>市自然资源和规划局林业处</dd></div><div><dt>处置时限</dt><dd class="warn">2026-09-25 18:00 前</dd></div></dl>
        <section class="recognition-summary"><b>智能识别结论</b><p>共发现 12 个变化图斑，其中疑似林地违建 3 处、异常采伐 4 处、用途变化 3 处、其他问题 2 处。建议优先核查 1、2、7 号图斑。</p><div><span>林地违建 <b>3</b></span><span>异常采伐 <b>4</b></span><span>用途变化 <b>3</b></span></div></section>
      </aside>
    </div>

    <article class="plot-table-card">
      <header><b>问题图斑清单</b><span>共 12 条　已展示重点 4 条</span><button>查看全部图斑</button></header>
      <div class="plot-table head"><span>图斑编号</span><span>识别类型</span><span>疑似面积</span><span>行政区域</span><span>风险等级</span><span>置信度</span><span>建议处置</span></div>
      <div v-for="(plot,index) in plots" :key="plot.id" class="plot-table"><span><i :style="{background:plot.color}"></i>{{ plot.id }}</span><span>{{ plot.type }}</span><span>{{ plot.area }}</span><span>{{ index % 2 ? '千垛镇' : '戴南镇' }}</span><span><em :class="{danger:index===0}">{{ plot.level }}</em></span><span>{{ 96 - index * 3 }}%</span><span><button>定位</button><button>查看影像</button></span></div>
    </article>
  </section>
</template>

<style scoped lang="scss">
.task-detail-workbench{height:100%;min-height:0;display:grid;grid-template-rows:auto 86px minmax(300px,1fr) 224px;gap:10px;padding:12px 16px 16px;color:#27485b;background:#edf3f6}.detail-titlebar{display:flex;justify-content:space-between;align-items:center}.detail-titlebar small{color:#2288a4;font-size:9px;letter-spacing:1.8px}.detail-titlebar h1{margin:4px 0;color:#153e53;font-size:21px}.detail-titlebar p{margin:0;color:#768d99;font-size:11px}.title-actions{display:flex;align-items:center;gap:10px}.title-actions span{padding:7px 12px;color:#118a67;background:#e6f7f1;border:1px solid #a8ddcb;border-radius:16px;font-size:11px}.title-actions button,.plot-table-card header button{padding:8px 13px;color:#fff;background:#087ca7;border:0;border-radius:4px}.metric-row{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.metric-row article{display:flex;align-items:center;gap:12px;padding:12px;background:#fff;border:1px solid #d6e4ea;border-radius:7px;box-shadow:0 3px 10px #183d5110}.metric-row i{width:38px;height:38px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#25bdb5,#0a7eac);border-radius:8px;font-style:normal}.metric-row span,.metric-row strong,.metric-row small{display:block}.metric-row span{color:#607985;font-size:11px}.metric-row strong{margin:3px 0;color:#123e54;font-size:20px}.metric-row small{color:#91a2aa;font-size:9px}.detail-main-grid{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:10px}.map-card,.task-profile,.plot-table-card{min-height:0;overflow:hidden;background:#fff;border:1px solid #d4e2e9;border-radius:7px;box-shadow:0 3px 12px #183d5110}.map-card>header,.task-profile>header,.plot-table-card>header{height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 13px;border-bottom:1px solid #e5edf1}.map-card header b,.task-profile header b,.plot-table-card header b{font-size:13px}.map-card header span,.task-profile header span,.plot-table-card header span{color:#78909c;font-size:10px}.forestry-map{position:relative;height:calc(100% - 40px);overflow:hidden;background:repeating-linear-gradient(125deg,#7e9a5d 0 38px,#6f8e51 38px 67px,#96a96a 67px 91px);isolation:isolate}.forestry-map:after{content:"";position:absolute;inset:0;background:linear-gradient(#d6e7d61b,#133a263b),repeating-linear-gradient(45deg,transparent 0 31px,#fff0 31px 32px)}.river{position:absolute;z-index:1;left:-5%;right:-5%;top:15%;height:17%;background:#65a8b9;transform:rotate(-7deg);box-shadow:0 0 0 4px #a4cbd2}.road{position:absolute;z-index:2;background:#d1c2a2;border:2px solid #8f836e}.road-a{width:130%;height:8px;left:-15%;top:62%;transform:rotate(14deg)}.road-b{width:8px;height:120%;left:52%;top:-10%;transform:rotate(8deg)}.region{position:absolute;z-index:3;border:3px solid #56f3dc;background:#18a68521;box-shadow:0 0 0 1px #004e4d}.region span{position:absolute;padding:4px 6px;color:#eaffff;background:#075a64d9;font-size:9px}.region-a{left:12%;top:34%;width:34%;height:45%;clip-path:polygon(8% 4%,92% 0,100% 72%,66% 100%,0 80%)}.region-b{right:11%;top:18%;width:28%;height:58%;border-color:#64bcff;background:#2178bd20;clip-path:polygon(12% 0,95% 12%,88% 96%,0 78%)}.plot-marker{position:absolute;z-index:6;left:var(--x);top:var(--y);width:26px;height:26px;color:#fff;background:var(--c);border:2px solid #fff;border-radius:50%;box-shadow:0 2px 8px #001a3f88;font-weight:700}.plot-marker small{display:none;position:absolute;left:30px;top:0;width:max-content;padding:4px 6px;color:#fff;background:#173c4de6;font-size:9px;font-weight:400}.plot-marker:hover small{display:block}.map-scale,.north{position:absolute;z-index:8;padding:5px 8px;color:#fff;background:#173949cc;font-size:9px}.map-scale{left:12px;bottom:10px}.north{right:12px;top:12px;text-align:center}.task-profile dl{margin:0;padding:5px 13px}.task-profile dl>div{display:grid;grid-template-columns:78px 1fr;padding:6px 0;border-bottom:1px dashed #e1eaee;font-size:10px}.task-profile dt{color:#82949e}.task-profile dd{margin:0;color:#274d60}.task-profile dd.warn{color:#d85b48}.recognition-summary{margin:4px 12px;padding:10px;background:#edf7fa;border-left:3px solid #18a3b5}.recognition-summary>b{font-size:11px}.recognition-summary p{margin:6px 0;color:#607984;font-size:9px;line-height:1.6}.recognition-summary div{display:flex;gap:5px}.recognition-summary div span{flex:1;padding:5px;background:#fff;color:#748a95;font-size:8px}.recognition-summary div b{display:block;color:#0a809d;font-size:13px}.plot-table-card header{justify-content:flex-start;gap:12px}.plot-table-card header span{margin-right:auto}.plot-table-card header button{padding:5px 10px;font-size:10px}.plot-table{min-height:34px;display:grid;grid-template-columns:1.25fr 1fr .7fr .7fr .7fr .55fr 1fr;align-items:center;border-bottom:1px solid #edf1f3;font-size:9px}.plot-table.head{min-height:30px;color:#607985;background:#f1f7f9;font-weight:700}.plot-table>span{padding:5px 10px}.plot-table>span:first-child{display:flex;align-items:center;gap:6px}.plot-table i{width:7px;height:7px;border-radius:50%}.plot-table em{padding:3px 5px;color:#b37b15;background:#fff4d9;border-radius:3px;font-style:normal}.plot-table em.danger{color:#c64b40;background:#ffebe8}.plot-table button{margin-right:5px;padding:3px 6px;color:#087da6;background:#eef8fb;border:1px solid #b9d9e4;border-radius:3px;font-size:9px}
</style>
