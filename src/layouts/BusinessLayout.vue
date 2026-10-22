<script setup lang="ts">
import PrimaryHeader from '@/components/PrimaryHeader.vue'
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div class="business-layout">
    <PrimaryHeader v-if="!route.meta.hidePrimaryHeader" />
    <div class="business-layout-content"><slot /></div>
  </div>
</template>

<style lang="scss">
.business-layout { height:100dvh;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:#061625; }
.business-layout-content { flex:1;min-height:0;min-width:0;overflow:auto;position:relative; }
// Route roots fill the space below the shared header, including nested workbenches.
.business-layout .business-layout-content > :first-child { height:100%;min-height:0; }
</style>
