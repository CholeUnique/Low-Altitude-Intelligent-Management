<script setup lang="ts">
import { computed } from 'vue'
import { MapLocation, VideoCamera } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

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
  { key: 'route-plan' as const, label: '航线规划', path: '/patrol/route-plan', icon: MapLocation },
  { key: 'live' as const, label: '实时巡航', path: '/patrol/live', icon: VideoCamera },
])

function goBack() {
  const returnTo = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''
  router.push(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard')
}

function goNode(path: string) {
  router.push({ path, query: { ...router.currentRoute.value.query } })
}
</script>

<template>
  <div class="patrol-layout">
    <header class="patrol-header" :class="{ 'without-flow': showFlow === false, 'center-title': centerTitle }">
      <div class="header-left">
        <button class="back-button" type="button" @click="goBack">〈 返回</button>
        <template v-if="!centerTitle">
          <span class="page-logo">◆</span>
          <div class="page-title">
            <h1>{{ title || '低空巡查发现模块' }}</h1>
            <small>{{ subtitle || '航线规划 · 实时巡航' }}</small>
          </div>
        </template>
      </div>
      <div v-if="centerTitle" class="centered-title">
        <span class="page-logo">◆</span>
        <div class="page-title">
          <h1>{{ title || '低空巡查发现模块' }}</h1>
          <small>{{ subtitle || '航线规划 · 实时巡航' }}</small>
        </div>
      </div>

      <nav v-if="showFlow !== false" class="patrol-flow">
        <button
          v-for="node in nodes"
          :key="node.key"
          type="button"
          :class="{ active: node.key === activeNode }"
          @click="goNode(node.path)"
        >
          <i><component :is="node.icon" /></i>
          <span>{{ node.label }}</span>
        </button>
      </nav>

      <div class="header-right">
        <span class="system-state"><i></i>系统运行正常</span>
        <span class="header-user">●　{{ user.name }}</span>
      </div>
    </header>
    <main class="patrol-body">
      <slot />
    </main>
  </div>
</template>

<style scoped lang="scss">
.patrol-layout {
  height: 100vh;
  min-height: 720px;
  min-width: 1180px;
  display: flex;
  flex-direction: column;
  color: #d6f4ff;
  background: radial-gradient(circle at 50% -15%, #0a4265, transparent 38%), linear-gradient(#031a31, #010b18);
}
.patrol-header {
  flex: 0 0 64px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 14px;
  background: linear-gradient(180deg, #06385a, #031d37);
  border-bottom: 1px solid #0b648e;
  box-shadow: 0 3px 14px #0009;
}
.patrol-header.without-flow { grid-template-columns: 1fr auto; }
.centered-title {
  position: absolute;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  transform: translateX(-50%);
}
.centered-title .page-title { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
.centered-title .page-title small { margin-top: 0; }
.header-left,
.header-right {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-right { justify-content: flex-end; }
.back-button {
  padding: 5px 13px;
  color: #8dc5d8;
  background: #062a47;
  border: 1px solid #15597a;
  cursor: pointer;
}
.page-logo {
  color: #38e3f4;
  font-size: 20px;
  text-shadow: 0 0 8px #27d9eb;
}
.page-title h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 1px;
}
.page-title small {
  display: block;
  margin-top: 2px;
  color: #588398;
  font-size: 12px;
}
.patrol-flow {
  display: flex;
  align-items: center;
  justify-self: center;
  gap: 0;
}
.patrol-flow button {
  position: relative;
  min-width: 108px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 4px;
  padding: 0 8px;
  border: 0;
  color: #94b4c3;
  background: transparent;
  cursor: pointer;
}
.patrol-flow button:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 12px;
  left: calc(50% + 16px);
  width: calc(100% - 32px);
  border-top: 1px solid #54788a;
}
.patrol-flow i {
  z-index: 1;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 1px solid #66899a;
  border-radius: 50%;
  background: #174e68;
  font-style: normal;
  font-size: 11px;
}
.patrol-flow i svg { width: 13px; height: 13px; }
.patrol-flow span { font-size: 12px; }
.patrol-flow button.active { color: #fff; }
.patrol-flow button.active i {
  border-color: #3dd2e0;
  background: #13a6bb;
  box-shadow: 0 0 0 4px #37d3df1d;
}
.system-state {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #55eac3;
  font-size: 13px;
  white-space: nowrap;
}
.system-state i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #25e0b0;
  box-shadow: 0 0 8px #25e0b0;
}
.header-user {
  color: #739eb0;
  font-size: 13px;
  white-space: nowrap;
}
.patrol-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #eef3f6;
  color: #1f3d52;
}
</style>
