import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('access_token') || '')
  const name = ref(localStorage.getItem('user_name') || '林业监管员')
  const permissions = ref<string[]>(['dashboard:view', 'task:view', 'workspace:view'])
  const isLoggedIn = computed(() => Boolean(token.value))

  function login(username: string) {
    token.value = `mock-token-${Date.now()}`
    name.value = username || '林业监管员'
    localStorage.setItem('access_token', token.value)
    localStorage.setItem('user_name', name.value)
  }

  function logout() {
    token.value = ''
    localStorage.removeItem('access_token')
  }

  function hasPermission(code: string) {
    return permissions.value.includes(code)
  }

  return { token, name, permissions, isLoggedIn, login, logout, hasPermission }
})
