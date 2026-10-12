<script setup lang="ts">

defineProps<{ title: string; subtitle?: string; backTo?: string; variant?: 'default' | 'repository'; centerSubtitle?: boolean }>()
</script>

<template>
  <div class="cockpit-page" :class="{ 'cockpit-page--repository': variant === 'repository', 'cockpit-page--center-subtitle': centerSubtitle }">
    <div v-if="$slots.action" class="cockpit-page-actions"><slot name="action" /></div>
    <main class="cockpit-page-body"><slot /></main>
  </div>
</template>

<style scoped lang="scss">
.cockpit-page { width: 100%; min-width: 0; min-height: 100dvh; height: 100dvh; display: flex; flex-direction: column; color: #d6f4ff; background: radial-gradient(circle at 50% -15%, #0a4265, transparent 38%), linear-gradient(#031a31, #010b18); }
.cockpit-page-body { flex:1;min-height:0;overflow:auto;padding:8px; }
.cockpit-page--repository { background:radial-gradient(circle at 50% -20%,#0873bd66,transparent 35%),linear-gradient(135deg,#020f25,#031c38 58%,#03142d); }
.cockpit-page--repository .cockpit-page-body { padding:18px 32px 20px; }
.cockpit-page-actions { position:absolute; z-index:5; top:8px; right:12px; }
</style>
