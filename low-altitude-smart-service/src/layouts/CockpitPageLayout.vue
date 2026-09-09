<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

defineProps<{ title: string; subtitle?: string; backTo?: string }>()
const router = useRouter()
const user = useUserStore()
const now = ref(new Date())
const timer = window.setInterval(() => { now.value = new Date() }, 1000)
const clock = computed(() => now.value.toLocaleString('zh-CN', { hour12: false }))
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div class="cockpit-page">
    <header class="cockpit-page-header">
      <button class="back-button" @click="router.push(backTo || '/dashboard')">〈 返回</button>
      <span class="page-logo">◆</span>
      <div class="page-title"><h1>{{ title }}</h1><small>{{ subtitle || '数字赋能 · 精准监管 · 安全有序 · 低空更美好' }}</small></div>
      <div class="header-spacer"></div>
      <span class="system-state">●　系统运行正常</span><time>{{ clock }}</time><span class="header-user">●　{{ user.name }}　⌄</span>
      <slot name="action" />
    </header>
    <main class="cockpit-page-body"><slot /></main>
  </div>
</template>

<style scoped lang="scss">
.cockpit-page { min-width: 1180px; min-height: 100vh; color: #d6f4ff; background: radial-gradient(circle at 50% -15%, #0a4265, transparent 38%), linear-gradient(#031a31, #010b18); }
.cockpit-page-header { height: 54px; display: flex; align-items: center; gap: 12px; padding: 0 10px; background: linear-gradient(180deg, #06385a, #031d37); border-bottom: 1px solid #0b648e; box-shadow: 0 3px 14px #0009; }
.back-button { padding: 5px 13px; color: #8dc5d8; background: #062a47; border: 1px solid #15597a; cursor: pointer; }.page-logo { color: #38e3f4; font-size: 20px; text-shadow: 0 0 8px #27d9eb; }.page-title h1 { display: inline; margin: 0; font-size: 20px; letter-spacing: 2px; }.page-title small { margin-left: 18px; color: #588398; font-size: 8px; }.header-spacer { flex: 1; }.system-state { color: #55eac3; font-size: 8px; }.cockpit-page-header time,.header-user { color: #739eb0; font-size: 8px; }.cockpit-page-body { padding: 8px; }
</style>
