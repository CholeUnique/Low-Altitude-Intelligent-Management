<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getGovernanceTaskGeometry, type TaskGeometryFeatureCollection } from '@/api/governance-task'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import WorkbenchHeader from '@/workspace-components/shared/WorkbenchHeader.vue'
import { useUserStore } from '@/stores/user'

const props = defineProps<{ taskId: string; taskName?: string; deptId?: string }>()
const router = useRouter()
const user = useUserStore()
const geometry = ref<TaskGeometryFeatureCollection>({ type: 'FeatureCollection', features: [] })
const error = ref(''), loading = ref(false)
const nodes = ref(Array.from({ length: 4 }, (_, index) => ({ name: `监测节点 ${index + 1}`, time: '' })))
const invalidInterval = computed(() => {
  const dates = nodes.value.map(node => node.time ? new Date(node.time).getTime() : NaN)
  return dates.some((date, index) => index > 0 && Number.isFinite(date) && Number.isFinite(dates[index - 1]) && date - dates[index - 1]! <= 7 * 86400000)
})
async function load() {
  loading.value = true; error.value = ''
  try { geometry.value = await getGovernanceTaskGeometry(props.taskId, undefined, false, props.deptId) }
  catch (e) { error.value = e instanceof Error ? e.message : '监测范围读取失败' }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <div class="supply-monitor">
    <WorkbenchHeader title="土地供后巡查监测" :task-name="taskName" :user-id="String(user.currentUser?.id || '')" :show-back="user.hasPermission('task-todo')" @back="router.push('/tasks/todo')" />
    <main>
      <section class="card"><h2>监测范围</h2><TaskRangeMap v-if="geometry.features.length" :geo-json="geometry" show-dom-imagery /><p v-else>{{ loading ? '正在读取监测范围…' : error || '该任务暂无监测范围' }}</p></section>
      <section class="card nodes"><h2>监测时间节点</h2><p>设置各期监测时间，相邻节点间隔须超过 7 天。</p><div v-for="(node, index) in nodes" :key="index" class="node"><input v-model.trim="node.name" :aria-label="`第 ${index + 1} 个节点名称`" maxlength="40" /><input v-model="node.time" type="datetime-local" :aria-label="`第 ${index + 1} 个节点时间`" /><button type="button" :disabled="nodes.length <= 1" @click="nodes.splice(index, 1)">移除</button></div><button type="button" class="add" @click="nodes.push({ name: `监测节点 ${nodes.length + 1}`, time: '' })">＋ 添加节点</button><p v-if="invalidInterval" class="error" role="alert">节点时间须按顺序排列，且相邻节点间隔超过 7 天。</p><p class="notice" role="status">时间节点仅为当前页面草稿。监测任务的保存、自动拉取、暂停和恢复功能需要后端提供供后监测接口。</p></section>
    </main>
  </div>
</template>

<style scoped>
.supply-monitor{height:100%;display:flex;flex-direction:column;background:#edf3f7;color:#29475a}.supply-monitor main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(300px,1.2fr) minmax(340px,1fr);gap:12px;padding:12px}.card{min-height:0;padding:16px;background:#fff;border:1px solid #d8e5ed;border-radius:7px;overflow:auto}.card h2{margin:0 0 12px;font-size:16px}.card :deep(.task-range-map){height:calc(100% - 36px);min-height:300px}.nodes p{font-size:13px;color:#688394}.node{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin:10px 0}.node input{min-width:0;padding:9px;border:1px solid #c9dbe5;border-radius:4px;font:inherit}.node button,.add{padding:8px 12px;border:1px solid #b7d1df;border-radius:4px;background:white;color:#28799e;cursor:pointer}.node button:disabled{opacity:.5}.nodes .error{color:#bc4545}.nodes .notice{margin-top:20px;padding:12px;border-radius:5px;background:#fff8e5;color:#8e6a27;line-height:1.6}@media(max-width:900px){.supply-monitor main{grid-template-columns:1fr;overflow:auto}.card{min-height:300px}}
</style>
