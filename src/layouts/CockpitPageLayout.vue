<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

defineProps<{ title: string; subtitle?: string; backTo?: string; variant?: 'default' | 'repository'; centerSubtitle?: boolean }>()
const router = useRouter()
const user = useUserStore()
const now = ref(new Date())
const timer = window.setInterval(() => { now.value = new Date() }, 1000)
const clock = computed(() => now.value.toLocaleString('zh-CN', { hour12: false }))
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div class="cockpit-page" :class="{ 'cockpit-page--repository': variant === 'repository', 'cockpit-page--center-subtitle': centerSubtitle }">
    <header class="cockpit-page-header">
      <button class="back-button" @click="router.push(backTo || '/dashboard')">〈 返回</button>
      <span class="page-logo">◆</span>
      <div class="page-title"><h1>{{ title }}</h1><small>{{ subtitle || '数字赋能 · 精准监管 · 安全有序 · 低空更美好' }}</small></div>
      <div class="header-spacer"></div>
      <span class="system-state"><i></i>系统运行正常</span><time>{{ clock }}</time><span class="header-user">●　{{ user.name }}　⌄</span>
      <slot name="action" />
    </header>
    <main class="cockpit-page-body"><slot /></main>
  </div>
</template>

<style scoped lang="scss">
.cockpit-page { min-width: 1180px; min-height: 100vh; color: #d6f4ff; background: radial-gradient(circle at 50% -15%, #0a4265, transparent 38%), linear-gradient(#031a31, #010b18); }
.cockpit-page-header { position: relative; height: 54px; display: flex; align-items: center; gap: 12px; padding: 0 10px; background: linear-gradient(180deg, #06385a, #031d37); border-bottom: 1px solid #0b648e; box-shadow: 0 3px 14px #0009; }
.back-button { padding: 5px 13px; color: #8dc5d8; background: #062a47; border: 1px solid #15597a; cursor: pointer; }.page-logo { color: #38e3f4; font-size: 20px; text-shadow: 0 0 8px #27d9eb; }.page-title h1 { display: inline; margin: 0; font-size: 20px; letter-spacing: 2px; }.page-title small { position: absolute; top: 50%; left: 50%; margin: 0; color: #588398; font-size: 14px; transform: translate(-50%, -50%); white-space: nowrap; }.header-spacer { flex: 1; }.system-state { display: flex; align-items: center; gap: 7px; color: #55eac3; font-size: 14px; white-space: nowrap; }.system-state i { width: 9px; height: 9px; border-radius: 50%; background: #25e0b0; box-shadow: 0 0 8px #25e0b0; }.cockpit-page-header time,.header-user { color: #739eb0; font-size: 14px; }.cockpit-page-body { padding: 8px; }
.cockpit-page--repository { background: radial-gradient(circle at 50% -20%, #0873bd66, transparent 35%), linear-gradient(135deg, #020f25, #031c38 58%, #03142d); }.cockpit-page--repository .cockpit-page-header { height: 78px; gap: 16px; padding: 0 32px; border-bottom-color: #1685c5; background: linear-gradient(90deg, #032b59, #064f8d 50%, #022b57); box-shadow: 0 3px 18px #0088ff55; }.cockpit-page--repository .back-button { padding: 7px 13px; border-color: #3695cf; border-radius: 4px; color: #d9edff; background: transparent; font-size: 16px; }.cockpit-page--repository .page-logo { font-size: 30px; }.cockpit-page--repository .page-title h1 { color: #fff; font-size: 28px; }.cockpit-page--repository .page-title small { position: static; margin-left: 18px; color: #93c7ec; font-size: 14px; letter-spacing: 1px; transform: none; }.cockpit-page--repository .system-state { color: #e5f6ff; font-size: 16px; }.cockpit-page--repository .cockpit-page-header time { padding: 0 12px; border-right: 1px solid #4c93c8; border-left: 1px solid #4c93c8; color: #b5d6ec; font-size: 16px; white-space: nowrap; }.cockpit-page--repository .header-user { color: #b5d6ec; font-size: 16px; white-space: nowrap; }.cockpit-page--repository .cockpit-page-body { padding: 18px 32px 20px; }
.cockpit-page--center-subtitle .page-title small { position: absolute; top: 50%; left: 50%; margin: 0; transform: translate(-50%, -50%); white-space: nowrap; }
</style>
