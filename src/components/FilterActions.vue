<script setup lang="ts">
defineEmits<{ query: []; reset: [] }>()
</script>

<template>
  <div class="filter-actions">
    <button type="button" class="filter-actions__query" @click="$emit('query')">查询</button>
    <button type="button" class="filter-actions__reset" @click="$emit('reset')">重置</button>
  </div>
</template>

<style scoped>
.filter-actions { display: flex; align-items: end; gap: 8px; white-space: nowrap; }
.filter-actions button { height: 36px; min-width: 60px; padding: 0 14px; border: 1px solid var(--ui-border); border-radius: 5px; background: var(--ui-input); color: var(--ui-body); font: inherit; font-size: 13px; cursor: pointer; }
.filter-actions .filter-actions__query { color: #fff; background: #168db5; border-color: #168db5; }
.filter-actions button:hover { filter: brightness(1.15); }
.filter-actions button:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
</style>
