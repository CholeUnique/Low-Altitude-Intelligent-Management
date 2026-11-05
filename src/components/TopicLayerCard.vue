<script setup lang="ts">
withDefaults(defineProps<{title:string;subtitle?:string;expanded?:boolean;checked:boolean;indeterminate?:boolean;disabled?:boolean}>(),{expanded:false})
const emit=defineEmits<{'update:expanded':[expanded:boolean];select:[checked:boolean];invert:[]}>()
</script>
<template>
  <section class="topic-layer-card" :aria-label="title">
    <div class="layer-card-heading">
      <button type="button" class="layer-card-toggle" :aria-expanded="expanded" :aria-label="`${expanded?'收起':'展开'}${title}`" :title="subtitle?`${title} / ${subtitle}`:title" @click="emit('update:expanded',!expanded)">
        <i class="layer-card-disclosure" :class="{expanded}" aria-hidden="true"></i><span><b>{{ title }}</b><small v-if="subtitle">{{ subtitle }}</small></span>
      </button>
      <div class="layer-card-selection" role="group" :aria-label="`${title}分类选择`">
        <label><input type="checkbox" :checked="checked" :indeterminate="indeterminate" :disabled="disabled" :aria-label="`${title}全选`" @change="emit('select',($event.target as HTMLInputElement).checked)" />全选</label>
        <label><input type="checkbox" :checked="false" :disabled="disabled" :aria-label="`${title}反选`" @change="($event.target as HTMLInputElement).checked=false;emit('invert')" />反选</label>
      </div>
    </div>
    <div v-show="expanded" class="layer-card-body">
      <slot />
      <div v-if="$slots.actions" class="layer-card-actions"><slot name="actions" /></div>
    </div>
  </section>
</template>
<style scoped>
.topic-layer-card{flex:none;min-width:0;overflow:hidden;border:1px solid #719dad29;border-radius:7px;background:#14374670;color:#d7eaf0}.layer-card-heading{display:flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;padding:10px;background:#153746;transition:background .18s ease}.layer-card-heading:hover{background:#1b4353}.layer-card-toggle{display:flex;align-items:center;gap:8px;flex:1;min-width:0;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}.layer-card-toggle>span{display:grid;gap:2px;flex:1;min-width:0}.layer-card-toggle b{font-size:12px;font-weight:500;line-height:1.6;overflow-wrap:anywhere}.layer-card-toggle small{font-size:9px;line-height:14px;color:#81a7b5;overflow-wrap:anywhere}.layer-card-toggle:hover{color:#8ae8e4}.layer-card-toggle:focus-visible{outline:1px solid #62c8d9;outline-offset:4px;border-radius:2px}.layer-card-disclosure{width:0;height:0;flex:none;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:5px solid #8db9c9;transition:rotate .18s ease}.layer-card-disclosure.expanded{rotate:90deg}.layer-card-selection{display:flex;gap:8px;flex:none}.layer-card-selection label{display:flex;align-items:center;gap:4px;font-size:10px;line-height:18px;cursor:pointer;white-space:nowrap}.layer-card-selection input{margin:0;width:12px;height:12px;flex:none;accent-color:#39c7d5}.layer-card-selection label:has(input:disabled){opacity:.4;cursor:default}.layer-card-body{padding:12px}.layer-card-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:12px;padding-top:8px;border-top:1px solid #719dad20}.topic-layer-card .layer-card-actions :slotted(button){border:0;background:none;color:#79d4df;font:inherit;font-size:11px;line-height:18px;cursor:pointer;padding:2px 0}.topic-layer-card .layer-card-actions :slotted(button:disabled){opacity:.4;cursor:default}@media(prefers-reduced-motion:reduce){.layer-card-disclosure,.layer-card-heading{transition:none}}
</style>
