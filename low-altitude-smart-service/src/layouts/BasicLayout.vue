<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

function logout() {
  user.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">翼</span>
        <div><b>低空智慧服务</b><small>INTELLIGENT AIRSPACE</small></div>
      </div>
      <nav>
        <router-link to="/dashboard" :class="{ active: route.path === '/dashboard' }"><span>◈</span>运行中枢</router-link>
        <router-link to="/taskLists" :class="{ active: route.path === '/taskLists' }"><span>▤</span>任务总览</router-link>
        <router-link to="/workspace/forestry/LY-20260908-001"><span>⌖</span>林业监管</router-link>
      </nav>
      <div class="sidebar-foot">系统运行正常<br><small>Mock 服务已启用</small></div>
    </aside>
    <main class="main-shell">
      <header class="topbar">
        <div><b>{{ route.meta.title || '低空治理运行中枢' }}</b><small>Low-altitude Governance Center</small></div>
        <div class="top-actions"><span class="live-dot"></span>系统在线 <span class="divider"></span> {{ user.name }} <button @click="logout">退出</button></div>
      </header>
      <section class="page-content"><slot /></section>
    </main>
  </div>
</template>
