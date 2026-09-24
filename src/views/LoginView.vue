<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getDepartmentOptions, getMyDepartments, loginWithPassword, switchDepartment } from '@/api/auth'
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
    // 补齐当前用户的全部所属部门：普通用户若归属多个部门，登录后也可切换部门身份。
    let memberships = result.userInfo.deptList
    try {
      const loadedMemberships = await getMyDepartments()
      if (loadedMemberships.length) {
        memberships = loadedMemberships
        user.setCurrentUser({ ...result.userInfo, deptList: loadedMemberships })
      }
    } catch {
      // 部门列表暂不可用时，继续使用登录响应中的 deptList。
    }

    const matcher = user.organizationId === 'agriculture-rural' ? /农业农村/ : /自然资源.*规划|自然资源/
    let scopedDeptId = memberships.find((department) => matcher.test(department.deptName))?.deptId
      || initialDeptId
      || memberships.find((department) => department.isDefault)?.deptId
      || (memberships.length === 1 ? memberships[0]?.deptId : undefined)

    // 管理员无所属部门时，从全部启用部门中解析当前单位对应的真实部门 ID。
    if (result.userInfo.role === 'ADMIN') {
      try {
        const departments = await getDepartmentOptions()
        scopedDeptId = departments.find((department) => matcher.test(department.deptName))?.deptId || scopedDeptId
      } catch (error) {
        if (!scopedDeptId) throw error
      }
    }
    if (!scopedDeptId) throw new Error(`当前账号未配置“${user.organization.name}”部门身份。`)

    try {
      const scopedSession = await switchDepartment(scopedDeptId)
      user.setDepartmentSession(
        scopedSession.accessToken,
        scopedSession.expiresIn,
        scopedSession.activeDeptId || scopedDeptId,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '部门切换接口请求失败'
      throw new Error(`部门身份初始化失败：${message}`)
    }
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(target)
  } catch (error) {
    user.logout()
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
