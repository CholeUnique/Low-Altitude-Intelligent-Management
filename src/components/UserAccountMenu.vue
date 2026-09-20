<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { logoutFromServer } from '@/api/auth'
import { useUserStore } from '@/stores/user'
import DashboardSymbol from '@/components/DashboardSymbol.vue'

withDefaults(defineProps<{ iconOnly?: boolean }>(), { iconOnly: false })
const user = useUserStore()
const router = useRouter()
const open = ref(false)
const loggingOut = ref(false)

async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    if (user.authMode === 'real') await logoutFromServer()
  } finally {
    user.logout()
    await router.replace('/login')
    loggingOut.value = false
  }
}
</script>

<template>
  <div class="user-account-menu">
    <button class="account-trigger" :class="{ 'account-trigger--icon': iconOnly }" type="button" aria-haspopup="menu" :aria-label="iconOnly ? '管理员账户菜单' : undefined" :aria-expanded="open" @click="open = !open">
      <DashboardSymbol v-if="iconOnly" name="avatar" />
      <template v-else>{{ user.name }} <span>⌄</span></template>
    </button>
    <div v-if="open" class="account-dropdown" role="menu">
      <p>{{ user.currentUser?.username || user.name }}</p>
      <button type="button" role="menuitem" :disabled="loggingOut" @click="logout">{{ loggingOut ? '正在退出…' : '退出系统' }}</button>
    </div>
  </div>
</template>

<style scoped>
.user-account-menu { position: relative; z-index: 40; }
.account-trigger { min-height: 34px; padding: 0 11px; color: #c9eaf4; background: #063957cc; border: 1px solid #1b6686; border-radius: 4px; font-size: 15px; cursor: pointer; white-space: nowrap; }.account-trigger:hover,.account-trigger[aria-expanded="true"] { color: #f0fcff; border-color: #2ba4cf; background: #075177; }.account-trigger span { margin-left: 5px; color: #77cce5; }
.account-trigger--icon { width: 34px; min-height: 34px; padding: 0; display: grid; place-items: center; background: transparent; border: 0; border-radius: 50%; }.account-trigger--icon:hover,.account-trigger--icon[aria-expanded="true"] { background: #07517788; border: 0; }.account-trigger--icon :deep(svg) { width: 29px; height: 29px; filter: drop-shadow(0 0 5px #2caef588); }
.account-dropdown { position: absolute; top: calc(100% + 8px); right: 0; width: 158px; padding: 7px; background: #042941f7; border: 1px solid #177fa9; border-radius: 5px; box-shadow: 0 8px 22px #001524aa; }.account-dropdown p { margin: 2px 7px 7px; overflow: hidden; color: #74a6ba; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.account-dropdown button { width: 100%; min-height: 34px; padding: 0 8px; color: #f5c4c9; background: transparent; border: 1px solid #7c3744; border-radius: 3px; font-size: 13px; text-align: left; cursor: pointer; }.account-dropdown button:hover { color: #fff; background: #a13b4c; }.account-dropdown button:disabled { cursor: wait; opacity: .7; }
</style>
