<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ title: string; count?: number; checked: boolean; indeterminate?: boolean; disabled?: boolean }>(), { count: 0 })
const emit = defineEmits<{ change: [checked: boolean] }>()
const label = computed(() => props.count > 1 ? '全选' : '打开')
function change(event: Event) {
  const selected = props.indeterminate ? true : (event.target as HTMLInputElement).checked
  emit('change', selected)
}
</script>
<template>
  <label class="topic-selection-checkbox"><input type="checkbox" :checked="checked" :indeterminate="indeterminate" :disabled="disabled" :aria-label="`${title}${label}`" @change="change" />{{ label }}</label>
</template>
<style scoped>
.topic-selection-checkbox{display:inline-flex;align-items:center;gap:4px;font-size:10px;line-height:18px;cursor:pointer;white-space:nowrap}.topic-selection-checkbox input{margin:0;width:12px;height:12px;flex:none;accent-color:#39c7d5}.topic-selection-checkbox:has(input:disabled){opacity:.4;cursor:default}
</style>
