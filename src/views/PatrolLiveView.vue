<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlatformLayout from '@/layouts/PlatformLayout.vue'
import GlobalLiveCruisePanel from '@/workspace-components/realtime-cruise/GlobalLiveCruisePanel.vue'

const route = useRoute()
const router = useRouter()
const fullscreen = computed(() => route.query.fullscreen === 'first')
const flightMenu = [
  { label: '机队总览', path: '/flight/fleet', icon: '机' },
  { label: '航线规划', path: '/patrol/route-plan', icon: '线' },
  { label: '飞行计划', path: '/flight/plans', icon: '计' },
  { label: '实时巡航', path: '/patrol/live', icon: '巡' },
]

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
  <PlatformLayout v-else section="flight" title="飞行作业" subtitle="机队、航线、计划与实时巡航" :menu="flightMenu">
    <div class="embedded-flight-page"><GlobalLiveCruisePanel /></div>
  </PlatformLayout>
</template>

<style scoped>
.embedded-flight-page { height: calc(100vh - 106px); min-height: 620px; overflow: hidden; border-radius: 8px; box-shadow: 0 4px 18px #153a5117; }
</style>
