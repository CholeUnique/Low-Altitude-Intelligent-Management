<script setup lang="ts">
import { computed, ref } from 'vue'
import DashboardFlipNumber from './DashboardFlipNumber.vue'
const props = defineProps<{ value: string | number; label: string; total?: number; items: Array<{ name: string; count?: number; color: string }> }>()
const active = ref('')
const segments = computed(() => {
  if (!props.items.length || props.total === undefined || !Number.isFinite(props.total) || props.total <= 0 || props.items.some(item => item.count === undefined || !Number.isFinite(item.count) || item.count < 0)) return []
  const sum = props.items.reduce((n, item) => n + (item.count || 0), 0)
  if (sum > props.total) return []
  const items = sum < props.total ? [...props.items, { name: '其他未列出（差额）', count: props.total - sum, color: '#64879b' }] : props.items
  let offset = 0
  return items.map(item => { const pct = (item.count || 0) / props.total! * 100; const segment = { ...item, pct, offset }; offset += pct; return segment }).filter(item => item.pct > 0)
})
const hovered = computed(() => segments.value.find(item => item.name === active.value))
</script>
<template>
  <div class="category-ring" role="group" :aria-label="`${label}：${value}`" :style="{ '--ring-number-size': `${134 / Math.max(String(value).length, 1)}cqw` }">
    <div v-if="hovered" class="category-tip" role="status"><i :style="{background: hovered.color}"/><span>{{ hovered.name }}</span><strong>{{ hovered.count }} 个</strong></div>
    <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="42" pathLength="100"/><circle v-for="item in segments" :key="item.name" class="segment" :class="{ hovered: active === item.name }" cx="50" cy="50" r="42" pathLength="100" :stroke="item.color" :stroke-dasharray="`${item.pct} ${100-item.pct}`" :stroke-dashoffset="-item.offset" tabindex="0" :aria-label="`${item.name}：${item.count} 个`" @mouseenter="active = item.name" @mouseleave="active = ''" @focus="active = item.name" @blur="active = ''" /></svg>
    <div class="center"><div v-if="$slots.default" class="emblem"><slot /></div><b><DashboardFlipNumber :value="value" /></b><span>{{ label }}</span></div>
  </div>
</template>
<style scoped>
.category-ring{position:relative;flex-shrink:0;width:var(--cockpit-ring-size,140px);height:var(--cockpit-ring-size,140px)}svg{width:100%;height:100%;overflow:visible;transform:rotate(-90deg)}circle{fill:none}.track{stroke:#32647d40;stroke-width:7.5}.segment{stroke-width:7.5;pointer-events:stroke;transition:stroke-width .18s}.segment.hovered,.segment:focus-visible{stroke-width:10;outline:none;filter:drop-shadow(0 0 3px currentColor)}.center{position:absolute;inset:17%;display:grid;grid-template-rows:18px minmax(0,1fr) 18px;gap:3px;align-items:center;justify-items:center;text-align:center;pointer-events:none}.center b{color:#65e9ed;font-size:max(12px, clamp(24px,1.7vw,34px));font-weight:600;line-height:1;white-space:nowrap}.center span{color:#a4bdd0;font-size:12px;line-height:18px;white-space:nowrap}.emblem{width:100%;height:18px;display:grid;place-items:center}.emblem :deep(svg){width:24px;height:18px;transform:none}.category-tip{position:absolute;z-index:10;top:-8px;left:0;display:flex;align-items:center;gap:8px;width:max-content;max-width:240px;padding:8px 12px;border:1px solid #4bbeef44;border-radius:6px;background:#092a42f5;color:#d7edf3;font-size:12px;box-shadow:0 6px 16px #00111e40;pointer-events:none}.category-tip i{width:7px;height:7px;flex:none;border-radius:50%}.category-tip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.category-tip strong{white-space:nowrap}
</style>
<style scoped>
.category-ring{container-type:inline-size}
.center{display:flex;flex-direction:column;justify-content:center;gap:4px;min-width:0}
.center b{max-width:100%;font-size:max(12px, min(32px,var(--ring-number-size)));font-variant-numeric:tabular-nums}
.center>span{font-size:12px;line-height:16px}
.center:has(.emblem){gap:2px}.center:has(.emblem) b{font-size:max(12px, min(28px,26cqw,var(--ring-number-size)))}.center:has(.emblem)>span{line-height:14px}.emblem{height:12px}.emblem :deep(svg){height:12px;width:20px}
</style>
