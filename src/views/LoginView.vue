<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getDepartmentOptions, loginWithPassword, switchDepartment } from '@/api/auth'
import { ApiBusinessError } from '@/api/client'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const loading = ref(false)
const username = ref('admin')
const password = ref('')
const loginError = ref('')

async function submitReal() {
  if (!username.value.trim() || !password.value) {
    loginError.value = '请输入账号和密码'
    return
  }
  loading.value = true
  loginError.value = ''
  try {
    const result = await loginWithPassword(username.value.trim(), password.value)
    // 部分后端部署会在登录响应中给出部门 ID，但只有 /user/dept/switch 换签后的
    // token 才真正携带当前部门的数据权限。手动切换单位本来就走此流程，因此首次
    // 登录也在进入首页前完成同样的部门确认，避免首页首批统计请求处于无部门上下文。
    const initialDeptId = result.activeDeptId
      || result.userInfo.deptId
      || result.userInfo.deptList.find((department) => department.isDefault)?.deptId
    user.setRealSession(result.accessToken, result.userInfo, result.expiresIn, initialDeptId)
    // 与右上角“切换单位”使用完全相同的部门定位规则。登录响应里的 deptId 在
    // 部分部署中是用户所属根部门，不是业务数据所属的局级部门；必须以部门选项
    // 接口返回的实际 ID 为准，避免首屏按错误部门查询而切换一次后才恢复数据。
    let scopedDeptId = initialDeptId
    try {
      const departments = await getDepartmentOptions()
      const matcher = user.organizationId === 'agriculture-rural' ? /农业农村/ : /自然资源.*规划|自然资源/
      scopedDeptId = departments.find((department) => matcher.test(department.deptName))?.deptId || scopedDeptId
    } catch {
      // 没有部门选项权限时仍尝试使用登录接口返回的部门 ID。
    }
    if (scopedDeptId) {
      try {
        const scopedSession = await switchDepartment(scopedDeptId)
        user.setDepartmentSession(
          scopedSession.accessToken,
          scopedSession.expiresIn,
          scopedSession.activeDeptId || scopedDeptId,
        )
      } catch {
        // 普通账号或旧版后端可能不允许重复切换部门，保留登录接口已签发的 token。
      }
    }
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(target)
  } catch (error) {
    loginError.value = error instanceof ApiBusinessError || error instanceof Error
      ? error.message
      : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
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
        <span class="login-badge">账号密码登录</span>
        <h2>登录低空智慧服务</h2><p>密码通过一次性 RSA 公钥加密后传输</p>
        <label class="identity-label">登录账号</label>
        <input v-model="username" class="login-input" autocomplete="username" placeholder="请输入账号" @keyup.enter="submitReal" />
        <label class="identity-label">登录密码</label>
        <input v-model="password" class="login-input" type="password" autocomplete="current-password" placeholder="请输入密码" @keyup.enter="submitReal" />
        <p v-if="loginError" class="login-error">{{ loginError }}</p>
        <el-button type="primary" size="large" :loading="loading" class="login-button" @click="submitReal">安全登录</el-button>

      </div>
      <footer>低空智慧服务平台 v0.4 · 技术支持中心</footer>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-box { width: min(500px, 94%); }
.login-input { width: 100%; height: 44px; box-sizing: border-box; padding: 0 13px; color: #243e52; border: 1px solid #cddde7; border-radius: 6px; outline: 0; font-size: 14px; }
.login-input:focus { border-color: #1597b7; box-shadow: 0 0 0 3px #159bc015; }
.login-error { margin: 10px 0 0!important; color: #d94b5d!important; font-size: 12px!important; }
.identity-label { display: block; margin: 20px 0 9px; color: #344b5f; font-size: 13px; font-weight: bold; }
</style>
