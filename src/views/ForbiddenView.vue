<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PrimaryHeader from '@/components/PrimaryHeader.vue'

const route = useRoute()
const router = useRouter()
const blockedPath = computed(() => typeof route.query.from === 'string' ? route.query.from : '')
</script>

<template>
  <div class="forbidden-page">
    <PrimaryHeader />
    <main>
      <div class="forbidden-symbol">!</div>
      <h1>无权限访问</h1>
      <p>当前身份未被管理员授予该功能权限，请联系管理员调整当前部门下的功能权限。</p>
      <small v-if="blockedPath">受限地址：{{ blockedPath }}</small>
      <button type="button" @click="router.back()">返回上一页</button>
    </main>
  </div>
</template>

<style scoped>
.forbidden-page{height:100dvh;display:flex;flex-direction:column;background:#edf3f7}.forbidden-page main{flex:1;display:grid;place-content:center;justify-items:center;padding:30px;color:#244b60;text-align:center}.forbidden-symbol{width:72px;height:72px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#168fac,#0a6787);border-radius:50%;box-shadow:0 12px 30px #0b789044;font-size:42px;font-weight:800}.forbidden-page h1{margin:22px 0 8px;font-size:28px}.forbidden-page p{max-width:620px;margin:0;color:#66818f;font-size:15px;line-height:1.8}.forbidden-page small{margin-top:10px;color:#91a2aa}.forbidden-page button{min-width:120px;height:40px;margin-top:24px;color:#fff;background:#168eae;border:0;border-radius:5px;font-size:14px;font-weight:700;cursor:pointer}
</style>
