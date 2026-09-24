<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DashboardSymbol from '@/components/DashboardSymbol.vue'
import OrganizationSwitcher from '@/components/OrganizationSwitcher.vue'
import UserAccountMenu from '@/components/UserAccountMenu.vue'

const router = useRouter()
const route = useRoute()
const now = ref(new Date())
const clock = window.setInterval(() => { now.value = new Date() }, 1000)
const dateText = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(now.value))
const timeText = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))
onBeforeUnmount(() => window.clearInterval(clock))

const entries = [
  { label: '单位总览', path: '/dashboard', match: ['dashboard', 'dashboard-scene'] },
  { label: '飞行作业', path: '/uav-tasks', match: ['uav-tasks', 'patrol-route-plan', 'patrol-live'] },
  { label: '智能研判', path: '/recognition', match: ['recognition', 'algorithms', 'data-results'] },
  { label: '任务中心', path: '/tasks', match: ['tasks', 'task-detail', 'workspace'] },
]
</script>

<template>
  <header class="primary-header">
    <button class="primary-brand" type="button" @click="router.push('/dashboard')">
      <span class="primary-logo"><DashboardSymbol name="brand" /></span>
      <h1>海陵区自然资源综合监管平台</h1>
    </button>
    <nav class="primary-nav" aria-label="一级导航">
      <button v-for="entry in entries" :key="entry.path" type="button" :class="{ active: entry.match.includes(String(route.name)) }" @click="router.push(entry.path)">{{ entry.label }}</button>
    </nav>
    <div class="primary-user">
      <time>{{ dateText }}　{{ timeText }}</time>
      <button class="notice" type="button" aria-label="消息通知"><DashboardSymbol name="notification" /><b>3</b></button>
      <OrganizationSwitcher />
      <UserAccountMenu icon-only />
    </div>
  </header>
</template>

<style scoped lang="scss">
.primary-header { position:relative; z-index:1000; flex:0 0 72px; height:72px; display:grid; grid-template-columns:minmax(320px,1fr) auto minmax(430px,1fr); align-items:center; padding:0 18px; color:#d8f4ff; border-bottom:1px solid #0b5c83; background:linear-gradient(180deg,#06385a,#031d37 76%,#042741); box-shadow:0 4px 18px #000a,inset 0 -1px #13b8de22; }
.primary-brand { min-width:0; display:flex; align-items:center; gap:12px; padding:0; overflow:hidden; color:#e6f9ff; text-align:left; background:transparent; border:0; cursor:pointer; }
.primary-logo { width:38px; height:38px; flex:0 0 38px; display:grid; place-items:center; background:radial-gradient(circle,#0d568566,transparent 68%); box-shadow:0 0 15px #19d5f044; }.primary-logo :deep(svg) { width:36px; height:36px; filter:drop-shadow(0 0 8px #19d5f0aa); }
.primary-brand h1 { margin:0; overflow:hidden; font-size:30px; letter-spacing:2px; text-overflow:ellipsis; text-shadow:0 0 12px #2abfe899; white-space:nowrap; }
.primary-nav { height:100%; display:flex; align-items:center; gap:8px; }.primary-nav button { position:relative; height:100%; padding:0 4px; color:#779daf; font-size:18px; letter-spacing:1px; white-space:nowrap; background:transparent; border:0; cursor:pointer; }.primary-nav button + button::before { position:absolute; top:50%; right:calc(100% + 4px); width:4px; height:4px; content:''; background:#5d91aa; border-radius:50%; box-shadow:0 0 5px #33d7f177; transform:translateY(-50%); }.primary-nav button:hover,.primary-nav button.active { color:#d5f9ff; text-shadow:0 0 10px #48d8ef; }.primary-nav button.active::after { position:absolute; right:25%; bottom:0; left:25%; height:2px; content:''; background:#1ce5f5; box-shadow:0 0 8px #1ce5f5; }
.primary-user { display:flex; justify-content:flex-end; align-items:center; gap:9px; color:#7199ac; font-size:16px; }.primary-user time { padding:0 10px; white-space:nowrap; border-right:1px solid #17506b; border-left:1px solid #17506b; }.notice { position:relative; width:30px; height:30px; padding:0; display:grid; place-items:center; color:#9ec6d5; background:transparent; border:0; cursor:pointer; }.notice :deep(svg) { width:25px; height:25px; filter:drop-shadow(0 0 5px #1ce5f577); }.notice b { position:absolute; top:0; right:-2px; min-width:15px; height:15px; padding:0 3px; color:#fff; font-size:10px; line-height:15px; text-align:center; background:#f04d62; border-radius:9px; box-shadow:0 0 7px #f04d62; }
@media (max-width:1450px) { .primary-header { grid-template-columns:minmax(280px,1fr) auto minmax(360px,1fr); padding-inline:14px; }.primary-brand h1 { font-size:26px; }.primary-nav { gap:5px; }.primary-nav button { font-size:16px; }.primary-user { gap:6px; font-size:14px; } }
@media (max-width:1180px) { .primary-header { grid-template-columns:minmax(230px,1fr) auto minmax(105px,auto); gap:6px; padding-inline:9px; }.primary-brand { gap:7px; }.primary-logo { width:31px; height:31px; flex-basis:31px; }.primary-logo :deep(svg) { width:29px; height:29px; }.primary-brand h1 { font-size:21px; letter-spacing:1px; }.primary-nav { gap:1px; }.primary-nav button { padding-inline:4px; font-size:14px; }.primary-user time { display:none; } }
</style>
