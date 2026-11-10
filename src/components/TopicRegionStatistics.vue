<script setup lang="ts">
import type { RegionStatisticRow } from '@/utils/region-statistics'
import { formatSquareMetresAsMu } from '@/utils/topic-area'
defineProps<{rows:RegionStatisticRow[];activeId?:string}>()
const emit=defineEmits<{select:[id:string]}>()
const areas=[['areaSqm','区域总面积'],['permanentAreaSqm','永农面积'],['highAreaSqm','高标田面积'],['overlapAreaSqm','永农中的高标田'],['overlapAreaSqm','高标田中的永农'],['onlyHighAreaSqm','仅高标面积'],['onlyPermanentAreaSqm','仅永农面积']] as const
</script>
<template>
  <div class="region-statistics">
    <section v-for="row in rows" :key="row.id" :class="{active:activeId===row.id}">
      <button type="button" :aria-pressed="activeId===row.id" :title="`定位并高亮${row.name}`" @click="emit('select',row.id)">{{ row.name }}<span>定位 ↗</span></button>
      <p v-if="row.status==='RUNNING'" role="status">正在计算区域内面积…</p>
      <p v-else-if="row.status==='FAILED'" role="alert">{{ row.error }}</p>
      <dl v-else-if="row.value"><div v-for="[key,label] in areas" :key="label"><dt>{{ label }}</dt><dd><b>{{ formatSquareMetresAsMu(row.value[key]) }}</b><small>亩</small></dd></div><div><dt>差异率</dt><dd><b>{{ row.value.diffRate==null?'—':(row.value.diffRate*100).toFixed(2) }}</b><small v-if="row.value.diffRate!=null">%</small></dd></div></dl>
    </section>
    <p class="region-stat-note">面积由后端按行政边界精确计算；差异率＝差异面积÷高标田面积。</p>
  </div>
</template>
<style scoped>
.region-statistics{overflow:auto;min-height:0;scrollbar-width:none;-ms-overflow-style:none;overscroll-behavior:contain}
.region-statistics::-webkit-scrollbar{display:none}
.region-statistics section+section{border-top:1px solid #8eb9c42c;margin-top:14px;padding-top:12px}
.region-statistics section>button{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:4px 0 8px;border:0;background:transparent;color:#e1f0f3;text-align:left;font:600 14px/1.6 var(--ui-font);cursor:pointer}
.region-statistics button span{font-size:12px;font-weight:400;color:#82c7d3;white-space:nowrap}
.region-statistics .active>button,.region-statistics button:hover{color:#ffe077}
.region-statistics dl{display:grid;grid-template-columns:repeat(2,minmax(max-content,1fr));gap:12px 14px;margin:0}
.region-statistics dt{font-size:12px;color:#a3c3cf;line-height:1.6}
.region-statistics dd{display:flex;align-items:baseline;gap:5px;margin:3px 0 0;white-space:nowrap}
.region-statistics dd b{font-size:21px;font-weight:700;color:#7ce4df;font-variant-numeric:tabular-nums}
.region-statistics dd small{font-size:12px;color:#a3c3cf}
.region-statistics dd b,.region-statistics dd small{flex:none;white-space:nowrap;overflow-wrap:normal}
.region-statistics p{font-size:12px;color:#a3c3cf;line-height:1.7;max-width:460px}
.region-statistics p[role=alert]{color:#ffb79b}
.region-stat-note{margin-top:14px}
@media(max-width:700px){.region-statistics dl{grid-template-columns:minmax(max-content,1fr)}}
</style>