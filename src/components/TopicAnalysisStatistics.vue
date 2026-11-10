<script setup lang="ts">
import type { AnalysisStatistics } from '@/utils/farmland-analysis'
import { formatSquareMetresAsMu } from '@/utils/topic-area'
defineProps<{items:AnalysisStatistics[]}>()
const rate = (value:number|null|undefined) => value == null ? '—' : (value*100).toLocaleString('zh-CN',{maximumFractionDigits:2})
</script>
<template>
  <div class="analysis-statistics" aria-label="分析统计列表">
    <section v-for="item in items" :key="item.id" :aria-label="item.title">
      <h3>{{ item.title }}</h3><p>{{ item.sources.join(' · ') }}</p>
      <dl><div v-for="metric in item.metrics" :key="metric.label" :class="{'ratio-row':metric.areaSqm===undefined}"><dt>{{ metric.label }}</dt><dd><strong>{{ metric.areaSqm===undefined ? rate(metric.ratio) : formatSquareMetresAsMu(metric.areaSqm) }}</strong><small v-if="metric.areaSqm!==undefined || metric.ratio!=null">{{ metric.areaSqm===undefined?'%':'亩' }}</small></dd></div></dl>
    </section>
  </div>
</template>
<style scoped>
.analysis-statistics dl{grid-template-columns:repeat(2,minmax(max-content,1fr))}.analysis-statistics dd{white-space:nowrap}.analysis-statistics strong{flex:none;min-width:max-content;white-space:nowrap;overflow-wrap:normal}.analysis-statistics :is(h3,p){max-width:460px}@media(max-width:700px){.analysis-statistics dl{grid-template-columns:minmax(max-content,1fr)}}
.analysis-statistics{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:none}.analysis-statistics::-webkit-scrollbar{display:none}section+section{margin-top:16px;padding-top:16px;border-top:1px solid #719dad38}h3{margin:0 0 6px;font-size:15px;line-height:1.6;color:#dceff3}p{margin:0 0 12px;font-size:12px;line-height:1.7;color:#8faebb;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:repeat(2,minmax(max-content,1fr));gap:14px 12px;margin:0}dt{font-size:12px;line-height:1.6;color:#a5bfca}dd{display:flex;align-items:baseline;gap:5px;margin:4px 0 0;font-variant-numeric:tabular-nums}strong{font-size:18px;line-height:1.4;font-weight:600;color:#8ae8e4;overflow-wrap:normal;min-width:max-content;white-space:nowrap;flex:none}small{font-size:12px;color:#91afba;flex:none}.ratio-row{grid-column:1/-1;display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-top:1px solid #719dad29;padding-top:12px}.ratio-row dd{margin:0}
</style>
