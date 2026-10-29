<script setup lang="ts">
import { computed, useId } from 'vue'
import DashboardFlipNumber from './DashboardFlipNumber.vue'
const props = withDefaults(defineProps<{ value: string | number; label: string; rate?: number; tone?: 'cyan' | 'blue' | 'mint'; title?: string }>(), { tone: 'cyan' })
const gradientId = `dashboard-ring-${useId().replace(/:/g, '')}`
const progress = computed(() => Math.min(100, Math.max(0, props.rate ?? 0)))
</script>
<template>
  <div class="dashboard-ring" :class="`dashboard-ring--${tone}`" :title="title" role="img" :aria-label="`${label}：${value}${rate === undefined ? '' : `，${rate}%`}`">
    <svg class="ring-chart" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient :id="gradientId" x1="0" y1="100%" x2="100%" y2="0"><stop class="ring-start" /><stop offset=".65" class="ring-mid" /><stop offset="1" class="ring-end" /></linearGradient></defs><circle class="ring-orbit" cx="60" cy="60" r="55" /><circle class="ring-track" cx="60" cy="60" r="48" /><circle class="ring-track-edge" cx="60" cy="60" r="43" /><circle v-if="rate !== undefined" class="ring-progress" cx="60" cy="60" r="48" pathLength="100" :stroke="`url(#${gradientId})`" :stroke-dasharray="`${progress} ${100-progress}`" transform="rotate(-90 60 60)" /></svg>
    <div class="ring-value"><div class="ring-emblem"><slot /></div><b><DashboardFlipNumber :value="value" /></b><span>{{ label }}</span></div>
  </div>
</template>
<style scoped>
.dashboard-ring {
  --ring-start:#298fff; --ring-mid:#24dceb; --ring-end:#91f5ed;
  position:relative; width:var(--cockpit-ring-size,140px); height:var(--cockpit-ring-size,140px);
  flex-shrink:0; color:#32e7ef;
}
.dashboard-ring--blue { --ring-start:#657afa; --ring-mid:#2fbdff; --ring-end:#8beeff; }
.dashboard-ring--mint { --ring-start:#1693b6; --ring-mid:#43d5bd; --ring-end:#b4f8df; }
.ring-chart { display:block; width:100%; height:100%; overflow:visible; }
.ring-chart circle { fill:none; }
.ring-start { stop-color:var(--ring-start); }.ring-mid { stop-color:var(--ring-mid); }.ring-end { stop-color:var(--ring-end); }
.ring-orbit { stroke:#93ddf320; stroke-width:.6; }
.ring-track { stroke:#32647d45; stroke-width:8; }
.ring-track-edge { stroke:#8bdcee12; stroke-width:.7; }
.ring-progress { stroke-width:8; stroke-linecap:round; filter:drop-shadow(0 1px 3px #24dceb28); transition:stroke-dasharray .24s ease; }
.ring-value { position:absolute; inset:17%; display:grid; grid-template-rows:18px minmax(0,1fr) 18px; gap:3px; align-items:center; justify-items:center; border-radius:50%; background:radial-gradient(ellipse at 45% 30%,#67e4ee0c,transparent 72%); text-align:center; }
.ring-value b { color:#65e9ed; font-size:clamp(24px,1.7vw,34px); font-weight:600; line-height:1; font-variant-numeric:tabular-nums; letter-spacing:-.6px; white-space:nowrap; }
.ring-value span { color:#a4bdd0; font-size:11px; line-height:18px; white-space:nowrap; }
.ring-emblem { width:100%; height:18px; display:grid; place-items:center; }
.ring-emblem :deep(svg) { display:block; width:24px; height:18px; }
@media(prefers-reduced-motion:reduce) { .ring-progress { transition:none; } }
</style>
