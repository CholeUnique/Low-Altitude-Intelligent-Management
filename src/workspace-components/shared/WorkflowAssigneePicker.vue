<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getWorkbenchUsers, prioritizeWorkbenchUsers, type WorkbenchUser } from '@/api/workbench-users'
import { useUserStore } from '@/stores/user'
const user = useUserStore()
const props = defineProps<{ deptId?: string; nodeId?: string; preferredIds?: string[]; preferredUsernames?: string[]; readonly?: boolean; savedName?: string; label?: string }>()
const selected = defineModel<WorkbenchUser>()
const users = ref<WorkbenchUser[]>([]), loading = ref(false), error = ref(''), keyword = ref('')
const options = computed(() => prioritizeWorkbenchUsers(users.value, { ids: props.preferredIds, usernames: props.preferredUsernames }).filter(person => `${person.realName || ''} ${person.nickname || ''} ${person.username} ${person.deptName || ''}`.toLowerCase().includes(keyword.value.trim().toLowerCase())))
let version = 0, loadedContext = '', activeContext = ''
onBeforeUnmount(() => { version++ })
watch(() => `${props.nodeId || ''}:${props.deptId || ''}`, context => {
  if (!props.nodeId) { version++; loading.value = false; return }
  if (context === activeContext) return
  activeContext = context; version++; loadedContext = ''; users.value = []; selected.value = undefined; keyword.value = ''; error.value = ''; loading.value = false
})
async function loadUsers() {
  const context = `${props.nodeId || ''}:${props.deptId || ''}`
  if (props.readonly || !props.nodeId || loadedContext === context) return
  activeContext = context
  const request = ++version; loading.value = true; error.value = ''
  try {
    const result = await getWorkbenchUsers(props.deptId, user.currentUser, user.activeDeptId)
    if (request !== version) return
    users.value = result.users; loadedContext = context
    error.value = result.warnings.length ? `部分部门用户未加载：${result.warnings.join('；')}` : ''
    const recommended = prioritizeWorkbenchUsers(result.users, { ids: props.preferredIds, usernames: props.preferredUsernames }).find(person => props.preferredIds?.includes(person.id) || props.preferredUsernames?.includes(person.username))
    if (!selected.value) selected.value = recommended
  } catch (reason) { if (request === version) error.value = reason instanceof Error ? reason.message : '选人列表读取失败' }
  finally { if (request === version) loading.value = false }
}
watch([() => props.nodeId, () => props.deptId, () => props.readonly], loadUsers, { immediate: true })
function choose(event: Event) { selected.value = users.value.find(person => person.id === (event.target as HTMLSelectElement).value) }
function recommended(person: WorkbenchUser) { return props.preferredIds?.includes(person.id) || props.preferredUsernames?.includes(person.username) }
</script>
<template>
  <section class="assignee-picker">
    <label class="assignee-label">* {{ label || '下一节点办理人' }}</label>
    <select v-if="readonly" disabled aria-label="下一节点办理人"><option>{{ savedName || selected?.realName || selected?.nickname || selected?.username || '未记录办理人' }}</option></select>
    <template v-else><input v-model="keyword" aria-label="搜索下发用户" placeholder="搜索姓名、账号" :disabled="loading" /><select :value="selected?.id || ''" required :aria-label="label || '下一节点办理人'" :disabled="loading" @change="choose"><option value="">{{ loading ? '正在读取用户…' : '请选择办理人' }}</option><option v-if="selected && !options.some(person => person.id === selected?.id)" :value="selected.id">{{ selected.realName || selected.nickname || selected.username }}（{{ selected.username }}）</option><option v-for="person in options" :key="person.id" :value="person.id">{{ recommended(person) ? '★ ' : '' }}{{ person.realName || person.nickname || person.username }}（{{ person.username }}）{{ person.id === String(user.currentUser?.id) ? ' · 我' : '' }}</option></select><small>原指定办理人优先显示，也可选择其他用户或自己。</small><p v-if="error" class="assignee-error" role="alert">{{ error }}</p><button v-if="error && !users.length" type="button" @click="loadUsers">重新读取用户</button></template>
  </section>
</template>
<style scoped>
.assignee-picker{display:grid;gap:8px;margin:12px 0;padding:12px;border:1px solid #d9e8f2;border-radius:5px;font-size:13px;color:#45677e}.assignee-picker input,.assignee-picker select{width:100%;min-width:0;box-sizing:border-box;padding:8px;font:inherit;border:1px solid #d9e8f2;border-radius:4px;background:#f9fcff;color:#254863}.assignee-picker small{font-size:12px;color:#718799}.saved-assignee,.assignee-error{margin:0;line-height:1.6;overflow-wrap:anywhere}.assignee-error{color:#b85b4c}.assignee-label{font-weight:600}
</style>
