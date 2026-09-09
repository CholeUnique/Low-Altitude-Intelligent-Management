<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const loading = ref(false)
const form = reactive({ username: '林业监管员', password: '123456' })

async function submit() {
  if (!form.username || !form.password) return
  loading.value = true
  await new Promise((resolve) => setTimeout(resolve, 450))
  user.login(form.username)
  const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
  await router.replace(target)
}
</script>

<template>
  <div class="login-page">
    <div class="login-visual">
      <div class="login-brand"><span class="brand-mark">翼</span><b>低空智慧服务</b></div>
      <div class="radar radar-one"></div><div class="radar radar-two"></div>
      <div class="login-copy">
        <span class="eyebrow">LOW-ALTITUDE GOVERNANCE</span>
        <h1>以数字之翼<br>守护每一寸绿水青山</h1>
        <p>融合无人机巡查、智能识别与闭环处置能力，构建全域感知、协同高效的低空智慧治理体系。</p>
        <div class="feature-row"><span>全域感知</span><span>智能研判</span><span>闭环监管</span></div>
      </div>
    </div>
    <div class="login-panel">
      <div class="login-box">
        <span class="login-badge">政务专网</span>
        <h2>欢迎登录</h2><p>请输入您的系统账号和密码</p>
        <el-form label-position="top" @submit.prevent="submit">
          <el-form-item label="账号"><el-input v-model="form.username" size="large" placeholder="请输入账号" /></el-form-item>
          <el-form-item label="密码"><el-input v-model="form.password" size="large" type="password" show-password placeholder="请输入密码" @keyup.enter="submit" /></el-form-item>
          <div class="login-help"><el-checkbox>记住账号</el-checkbox><a>联系管理员</a></div>
          <el-button type="primary" size="large" :loading="loading" class="login-button" @click="submit">登录系统</el-button>
        </el-form>
        <div class="mock-tip">演示环境：任意非空账号密码均可登录</div>
      </div>
      <footer>低空智慧服务平台 v0.4 · 技术支持中心</footer>
    </div>
  </div>
</template>
