<script setup lang="ts">
import { computed } from 'vue'
import { MapLocation, VideoCamera } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { firstAccessiblePath } from '@/utils/access-control'

const props = defineProps<{
  activeNode: 'route-plan' | 'live'
  /** 全局直播总览可覆盖巡查模块默认标题。 */
  title?: string
  subtitle?: string
  showFlow?: boolean
  centerTitle?: boolean
}>()

const router = useRouter()
const route = useRoute()
const user = useUserStore()

const nodes = computed(() => [
  ...(user.hasPermission('route-planning') ? [{ key: 'route-plan' as const, label: '航线规划', path: '/patrol/route-plan', icon: MapLocation }] : []),
  ...(user.hasPermission('live-monitoring') ? [{ key: 'live' as const, label: '实时巡航', path: '/patrol/live', icon: VideoCamera }] : []),
])

function goBack() {
  const returnTo = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''
  router.push(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : firstAccessiblePath(user.hasPermission))
}

function goNode(path: string) {
  router.push({ path, query: { ...router.currentRoute.value.query } })
}
</script>

<template>
  <div class="patrol-layout">
    <section class="patrol-context" aria-label="巡查操作">
      <button class="back-button" type="button" @click="goBack">〈 返回</button>
      <div class="context-title"><b>{{ title || '低空巡查发现模块' }}</b><small>{{ subtitle || '航线规划 · 实时巡航' }}</small></div>
      <nav v-if="showFlow !== false" class="patrol-flow" aria-label="巡查导航">
        <button v-for="node in nodes" :key="node.key" type="button" :class="{ active: node.key === activeNode }" @click="goNode(node.path)"><i><component :is="node.icon" /></i><span>{{ node.label }}</span></button>
      </nav>
    </section>
    <main class="patrol-body">
      <slot />
    </main>
  </div>
</template>

<style scoped lang="scss">
.patrol-layout { width:100%;height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;color:#d6f4ff;background:#031a31; }
.patrol-context { min-height:56px;flex-shrink:0;display:flex;align-items:center;gap:16px;padding:8px 18px;box-sizing:border-box;background:#08283c;border-bottom:1px solid #23495c; }
.back-button { height:32px;padding:0 12px;border:1px solid #2e6078;border-radius:5px;color:#d6edf5;background:#0a354c;cursor:pointer; }
.context-title { min-width:0;display:flex;align-items:baseline;gap:12px; }.context-title b { font-size:15px; }.context-title small { color:#7dabbf;font-size:12px; }
.patrol-flow { margin-left:auto;display:flex;align-items:center;gap:8px; }.patrol-flow button { display:flex;align-items:center;gap:8px;height:34px;padding:0 12px;color:#94b4c3;background:transparent;border:1px solid transparent;border-radius:5px;cursor:pointer; }.patrol-flow button.active,.patrol-flow button:hover { color:#e5f9ff;border-color:#296b8c;background:#0c3c56; }.patrol-flow i { display:grid;place-items:center; }.patrol-flow svg { width:18px;height:18px; }
.patrol-body { flex:1;min-height:0;overflow:hidden;background:#eef3f6;color:#1f3d52; }
</style>
