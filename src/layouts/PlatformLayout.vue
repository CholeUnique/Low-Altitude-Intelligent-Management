<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OrganizationSwitcher from '@/components/OrganizationSwitcher.vue'
import UserAccountMenu from '@/components/UserAccountMenu.vue'

type MenuItem = { label: string; path: string; icon: string }
const props = defineProps<{ section: 'flight' | 'recognition' | 'task' | 'asset'; title: string; subtitle: string; menu: MenuItem[] }>()
const route = useRoute()
const router = useRouter()
const nav = [
  { label: '单位总览', path: '/dashboard', section: 'dashboard' },
  { label: '飞行作业', path: '/flight/fleet', section: 'flight' },
  { label: '识别研判', path: '/recognition/intelligent', section: 'recognition' },
  { label: '任务中心', path: '/task-center/overview', section: 'task' },
  { label: '成果资产', path: '/assets/map-services', section: 'asset' },
]
const activeMenu = computed(() => props.menu.find(item => route.path === item.path)?.path || '')
</script>

<template>
  <div class="platform-shell">
    <header class="platform-topbar">
      <button class="platform-brand" type="button" @click="router.push('/dashboard')">
        <span>翼</span><b>海陵区自然资源综合监管平台<small>HAILING NATURAL RESOURCES · INTEGRATED SUPERVISION</small></b>
      </button>
      <nav class="platform-nav">
        <button v-for="item in nav" :key="item.path" :class="{ active: item.section === section }" @click="router.push(item.path)">{{ item.label }}</button>
      </nav>
      <div class="platform-account"><i></i>系统运行正常 <OrganizationSwitcher /><UserAccountMenu icon-only /></div>
    </header>
    <div class="platform-main">
      <aside class="platform-side">
        <div class="side-heading"><small>业务模块</small><h1>{{ title }}</h1><p>{{ subtitle }}</p></div>
        <nav>
          <button v-for="item in menu" :key="item.path" :class="{ active: activeMenu === item.path }" @click="router.push(item.path)"><i>{{ item.icon }}</i><span>{{ item.label }}<small>{{ item.path === activeMenu ? '当前页面' : '查看详情' }}</small></span><b>›</b></button>
        </nav>
        <div class="side-health"><i></i><span>平台服务正常<small>数据更新于 1 分钟前</small></span></div>
      </aside>
      <main class="platform-content"><slot /></main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.platform-shell{height:100vh;min-height:700px;display:flex;flex-direction:column;color:#19384b;background:#edf3f7}.platform-topbar{height:66px;flex:0 0 66px;display:grid;grid-template-columns:320px 1fr 315px;align-items:center;padding:0 18px;color:#d9f3fa;background:linear-gradient(90deg,#062f4c,#07597b 52%,#043752);border-bottom:1px solid #1382a6;box-shadow:0 2px 14px #002b4666}.platform-brand{display:flex;align-items:center;gap:10px;padding:0;border:0;color:white;background:transparent;text-align:left}.platform-brand>span{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;background:linear-gradient(145deg,#2ed3df,#0876bd);font-size:20px;font-weight:800;box-shadow:0 0 16px #38dbe766}.platform-brand b{font-size:17px;letter-spacing:1px}.platform-brand small{display:block;margin-top:2px;color:#73afc5;font-size:7px;letter-spacing:.8px}.platform-nav{height:100%;display:flex;justify-content:center}.platform-nav button{position:relative;min-width:106px;padding:0 18px;border:0;color:#8fb9c9;background:transparent;font-size:15px}.platform-nav button.active{color:#fff;background:linear-gradient(180deg,#0b739444,#0b779b22)}.platform-nav button.active:after{content:"";position:absolute;left:22%;right:22%;bottom:0;height:3px;background:#52e7ef;box-shadow:0 0 10px #52e7ef}.platform-account{display:flex;justify-content:flex-end;align-items:center;gap:10px;color:#9cc8d5;font-size:12px;white-space:nowrap}.platform-account>i{width:7px;height:7px;border-radius:50%;background:#2ae4a8;box-shadow:0 0 7px #2ae4a8}.platform-main{flex:1;min-height:0;display:grid;grid-template-columns:188px 1fr}.platform-side{position:relative;padding:22px 12px;color:#b8d3dd;background:linear-gradient(180deg,#043450,#02283f)}.side-heading{padding:0 8px 20px;border-bottom:1px solid #1a5c75}.side-heading small{color:#65a2b7;font-size:10px}.side-heading h1{margin:7px 0 6px;color:#fff;font-size:21px}.side-heading p{margin:0;color:#6d9aad;font-size:10px;line-height:1.7}.platform-side nav{display:grid;gap:7px;margin-top:14px}.platform-side nav button{width:100%;display:grid;grid-template-columns:30px 1fr 10px;align-items:center;gap:8px;padding:10px 9px;border:1px solid transparent;border-radius:5px;color:#9fc1ce;background:transparent;text-align:left}.platform-side nav button>i{width:27px;height:27px;display:grid;place-items:center;border-radius:5px;color:#69dbe8;background:#0a526d;font-style:normal;font-size:13px}.platform-side nav button span{font-size:13px;font-weight:600}.platform-side nav button small{display:block;margin-top:3px;color:#4f8296;font-size:9px;font-weight:400}.platform-side nav button>b{font-size:18px;font-weight:400}.platform-side nav button.active{color:#fff;border-color:#22bfd2;background:linear-gradient(90deg,#0b718d88,#07526c33);box-shadow:inset 3px 0 #4de7ed,0 0 12px #0cd2e329}.platform-side nav button.active small{color:#75d4df}.side-health{position:absolute;left:20px;right:18px;bottom:22px;display:flex;align-items:center;gap:9px;color:#9fc0ca;font-size:11px}.side-health>i{width:8px;height:8px;border-radius:50%;background:#25dfa5}.side-health small{display:block;margin-top:3px;color:#59869a;font-size:9px}.platform-content{min-width:0;min-height:0;overflow:auto;padding:18px 20px 22px}.platform-content :deep(.page-head){display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px}.platform-content :deep(.page-head h2){margin:0;color:#12384d;font-size:23px}.platform-content :deep(.page-head p){margin:6px 0 0;color:#788d9a;font-size:12px}.platform-content :deep(.update){color:#77909e;font-size:11px}.platform-content :deep(.surface){background:#fff;border:1px solid #d9e5eb;border-radius:8px;box-shadow:0 3px 12px #173b5010}
@media(max-width:1300px){.platform-topbar{grid-template-columns:290px 1fr 220px}.platform-brand b{font-size:15px}.platform-nav button{min-width:88px;padding:0 10px}.platform-main{grid-template-columns:172px 1fr}.platform-content{padding:14px}}
</style>
