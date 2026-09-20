<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PatrolLayout from '@/layouts/PatrolLayout.vue'
import GlobalLiveCruisePanel from '@/workspace-components/realtime-cruise/GlobalLiveCruisePanel.vue'

const route = useRoute()
const router = useRouter()
const fullscreen = computed(() => route.query.fullscreen === 'first')

function exitFullscreen() {
  const returnTo = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''
  router.replace({
    path: '/patrol/live',
    query: returnTo.startsWith('/') && !returnTo.startsWith('//') ? { returnTo } : {},
  })
}
</script>

<template>
  <GlobalLiveCruisePanel v-if="fullscreen" fullscreen @exit-fullscreen="exitFullscreen" />
  <PatrolLayout
    v-else
    active-node="live"
    title="实时巡航总览"
    subtitle="多路直播、设备与任务航线联动"
    :show-flow="false"
    center-title
  >
    <GlobalLiveCruisePanel />
  </PatrolLayout>
</template>
