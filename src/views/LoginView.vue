<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { portalData } from '@/mocks/portal'
import type { OrganizationId, RoleId } from '@/types'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const loading = ref(false)
const organizationId = ref<OrganizationId>('natural-resources')
const roleId = ref<RoleId>('admin')

async function submit() {
  loading.value = true
  await new Promise((resolve) => setTimeout(resolve, 450))
  user.login(organizationId.value, roleId.value)
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
        <span class="login-badge">身份演示入口</span>
        <h2>选择登录身份</h2><p>系统将按单位和职级加载对应场景与业务数据</p>
        <label class="identity-label">所属单位</label>
        <div class="organization-options">
          <button v-for="item in portalData.organizations" :key="item.id" :class="{ active: organizationId === item.id }" @click="organizationId = item.id">
            <i>{{ item.id === 'natural-resources' ? '规' : '农' }}</i>
            <span><b>{{ item.name }}</b><small>{{ item.description }}</small></span>
          </button>
        </div>
        <label class="identity-label">职级身份</label>
        <div class="role-options">
          <button v-for="item in portalData.roles" :key="item.id" :class="{ active: roleId === item.id }" @click="roleId = item.id">
            <b>{{ item.name }}</b><small>{{ item.description }}</small>
          </button>
        </div>
        <el-button type="primary" size="large" :loading="loading" class="login-button" @click="submit">进入系统</el-button>
        <div class="mock-tip">当前演示阶段管理员与员工权限相同，后续可通过权限配置独立控制</div>
      </div>
      <footer>低空智慧服务平台 v0.4 · 技术支持中心</footer>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-box { width: min(500px, 94%); }
.identity-label { display: block; margin: 20px 0 9px; color: #344b5f; font-size: 13px; font-weight: bold; }
.organization-options { display: grid; gap: 9px; }
.organization-options button { display: flex; align-items: center; gap: 12px; padding: 13px; border: 1px solid #d9e5ec; border-radius: 7px; color: #30485c; background: #fff; text-align: left; cursor: pointer; transition: .2s; }
.organization-options button:hover,.organization-options button.active { border-color: #158db2; background: #eef9fc; box-shadow: 0 0 0 2px #159bc015; }
.organization-options i { width: 38px; height: 38px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 6px; color: white; background: linear-gradient(135deg, #0c789d, #14abc0); font-style: normal; font-weight: bold; }
.organization-options span,.organization-options b,.organization-options small { display: block; }.organization-options b { font-size: 14px; }.organization-options small { margin-top: 5px; color: #8495a3; font-size: 10px; }
.role-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 22px; }.role-options button { padding: 12px; border: 1px solid #d9e5ec; border-radius: 6px; color: #40566a; background: white; cursor: pointer; }.role-options button.active { color: #075a80; border-color: #1597b7; background: #eef9fc; }.role-options b,.role-options small { display: block; }.role-options small { margin-top: 5px; color: #8b99a5; font-size: 9px; }
</style>
