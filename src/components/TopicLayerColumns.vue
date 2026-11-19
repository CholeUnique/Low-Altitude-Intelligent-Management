<script setup lang="ts">
defineProps<{split:boolean}>()
</script>
<template>
  <div class="legend-layer-list legend-columns" :class="{'is-split':split}">
    <div v-if="split" class="legend-column-headings"><h3>原始图层</h3><h3>结果图层</h3></div>
    <section class="legend-column original-column" :aria-label="split?'原始图层':'图层列表'"><slot name="original" /></section>
    <section class="legend-column result-column" aria-label="结果图层"><slot name="results" /></section>
  </div>
</template>
<style scoped>
.legend-columns{display:flex;flex-direction:column;gap:8px;min-height:0}.legend-columns:not(.is-split)>.legend-column{display:contents}.legend-columns.is-split{container-type:inline-size;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:8px 10px;height:100%;overflow:hidden;animation:legend-split-in .2s ease-out}.is-split>.legend-column{display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:none}.legend-column::-webkit-scrollbar{display:none}.legend-column-headings{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.legend-column-headings h3{margin:0;padding:4px 12px 10px;border-bottom:1px solid #79c5dc38;background:transparent;text-align:center;color:#c6e7f0;font-size:13px;font-weight:700;line-height:20px}.legend-column-headings h3+ h3{padding-left:22px;border-left:1px solid #79c5dc29}.is-split>.result-column{padding-left:10px;border-left:1px solid #79c5dc29}.is-split :deep(.layer-card-heading){flex-wrap:wrap}.is-split :deep(.layer-card-selection){margin-left:auto}.is-split :deep(.layer-display-mode){flex-wrap:wrap;gap:8px}.is-split :deep(.layer-color-picker){margin-left:0}.is-split :deep(.analysis-group-switch){align-items:flex-start;flex-wrap:wrap}.is-split :deep(.analysis-group-switch>span){min-width:0;overflow-wrap:anywhere}.is-split :deep(.admin-region-row){flex-wrap:wrap}.is-split :deep(.region-actions){margin-left:auto}.is-split :deep(.topic-category){flex-wrap:wrap}.is-split :deep(.category-mode){flex-wrap:wrap;margin-left:0}.is-split :deep(.admin-villages){padding-left:6px}.is-split :deep(.layer-card-actions){gap:8px}.is-split :deep(.overlay-result-row){min-width:0;overflow-wrap:anywhere}.is-split :deep(.overlay-result-row>div){padding-left:0;flex-wrap:wrap}.is-split :deep(.result-summary dl){grid-template-columns:minmax(0,1fr)}
.is-split :deep(.analysis-result-children){margin-left:0;padding-left:0;border-left:0}.is-split :deep(.analysis-layer-item>.layer-display-mode){padding-left:0}
@container(max-width:420px){.is-split :deep(.layer-card-toggle){flex-basis:100%}.is-split :deep(.region-visible){flex-basis:calc(100% - 24px)}}
@keyframes legend-split-in{from{opacity:.7;transform:translateX(-4px)}to{opacity:1;transform:translateX(0)}}@media(prefers-reduced-motion:reduce){.legend-columns.is-split{animation:none}}
</style>
