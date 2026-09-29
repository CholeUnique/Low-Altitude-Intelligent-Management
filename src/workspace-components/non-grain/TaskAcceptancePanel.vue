<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import NonGrainTaskSummary from './NonGrainTaskSummary.vue'
import './workspace.scss'

defineProps<{ context: NonGrainWorkspaceContext; readonly: boolean; disabledReason: string }>()
const emit = defineEmits<{ advance: [] }>()
const selectedPlot = ref(0)
const compareMode = ref<'side' | 'swipe'>('side')
const swipePosition = ref(50)
const mapScale = ref(1)

function zoom(delta: number) {
  mapScale.value = Math.min(1.8, Math.max(1, Number((mapScale.value + delta).toFixed(1))))
}
</script>

<template>
  <div class="ng-page ng-page-acceptance">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '该节点已完成，当前为只读状态' }}</div>
    <div class="ng-grid">
      <NonGrainTaskSummary class="span-12" :context="context" />
      <section class="ng-card span-4 ng-map-panel">
        <h3><i>历</i>历史影像 <small class="ng-sub-time">2025-06-18</small></h3>
        <div class="ng-map-viewport">
          <div class="ng-map-figure img-paddy has-boundary" data-label="历史为连续耕地（水稻种植）" :style="{ transform: `scale(${mapScale})` }" />
          <aside class="ng-map-tools"><button type="button" title="放大影像" @click="zoom(.2)">＋</button><button type="button" title="缩小影像" @click="zoom(-.2)">－</button><button type="button" title="复位影像" @click="mapScale = 1">⌖</button></aside>
        </div>
      </section>
      <section class="ng-card span-4 ng-map-panel">
        <header class="ng-card-head"><h3><i>今</i>当前影像 <small class="ng-sub-time">2026-09-22</small></h3><div class="ng-tabs compact"><button :class="{ active: compareMode === 'side' }" @click="compareMode = 'side'">并排对比</button><button :class="{ active: compareMode === 'swipe' }" @click="compareMode = 'swipe'">卷帘对比</button></div></header>
        <div v-if="compareMode === 'side'" class="ng-map-figure img-nursery has-boundary" data-label="当前为规则苗木种植，疑似非粮化" />
        <div v-else class="ng-swipe-compare" aria-label="历史影像与当前影像卷帘对比">
          <div class="ng-swipe-layer img-paddy" />
          <div class="ng-swipe-layer ng-swipe-current img-nursery" :style="{ width: `${swipePosition}%` }" />
          <div class="ng-swipe-handle" :style="{ left: `${swipePosition}%` }"><i>↔</i></div>
          <input v-model.number="swipePosition" type="range" min="5" max="95" aria-label="拖动卷帘对比位置">
          <span class="ng-swipe-label before">当前影像</span><span class="ng-swipe-label after">历史影像</span>
        </div>
      </section>
      <section class="ng-card span-4 ng-side-diagnosis">
        <div class="ng-detail-block"><h3><i>详</i>疑似图斑详情</h3><ul class="ng-list dense"><li><span>图斑编号</span><b>{{ context.plots[selectedPlot]?.id }}</b></li><li><span>图斑面积</span><b>{{ context.plots[selectedPlot]?.area }} 亩</b></li><li><span>所属区域</span><b>{{ context.plots[selectedPlot]?.location }}</b></li><li><span>原始地类</span><b>水田</b></li><li><span>当前识别类型</span><b>{{ context.plots[selectedPlot]?.landType }}种植</b></li><li><span>疑似类型</span><b class="ng-danger-text">非粮化</b></li></ul></div>
        <div class="ng-ai-block"><h4>系统智能判读</h4><div class="ng-ai-row"><span>判读结论</span><b>非粮化</b></div><div class="ng-confidence"><span>AI 置信度</span><strong>89.4%</strong><div><i /></div></div><ol><li>历史影像纹理规则，判读为水稻。</li><li>当前影像出现规则成行苗木种植特征。</li><li>该区域与永久基本农田范围部分重叠。</li></ol></div>
      </section>
      <section class="ng-card span-4 ng-issue-panel">
        <h3><i>列</i>问题图斑列表 <small>（共 {{ context.plots.length }} 个）</small></h3>
        <div class="ng-plots ng-plot-thumbs"><article v-for="(plot, index) in context.plots" :key="plot.id" class="ng-plot clickable" :class="{ active: selectedPlot === index }" @click="selectedPlot = index"><div class="ng-thumb" :class="['img-nursery', 'img-orchard', 'img-pond'][index]"><i>{{ index + 1 }}</i></div><b>图斑{{ index + 1 }}</b><small>{{ plot.landType === '养殖坑塘' ? plot.landType : `${plot.landType}种植` }}</small><em>{{ plot.area }} 亩</em></article></div>
      </section>
      <section class="ng-card span-4 ng-analysis-panel">
        <h3><i>析</i>变化分析</h3><div class="ng-change-flow"><div><i>前</i><span>变化前<small>2025年6月18日</small></span></div><b>→</b><div class="after"><i>后</i><span>变化后<small>2026年9月22日</small></span></div></div><div class="ng-accept-kpi"><p><span>变化面积</span><b>8.42 亩</b></p><p><span>变化类型</span><b>种植结构变化</b></p><p><span>变化比例</span><b>100%</b></p></div>
      </section>
      <section class="ng-card span-4 ng-explain-panel">
        <h3><i>据</i>判读依据 / 监测说明</h3><ol class="ng-desc-list"><li>本页面展示疑似图斑详细信息，用于辅助研判。</li><li>任务包含多个疑似图斑，需结合其他图斑一并初判。</li><li>最终认定结果需结合现场核查及业务数据综合判断。</li></ol><div class="ng-actions"><button class="primary" :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && emit('advance')">受理并进入初核</button></div>
      </section>
    </div>
  </div>
</template>
