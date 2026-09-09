<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CockpitPageLayout from '@/layouts/CockpitPageLayout.vue'
import NewTaskDialog from '@/components/NewTaskDialog.vue'
import { getScene, getTasks } from '@/mocks/portal'
import { useUserStore } from '@/stores/user'
import type { PortalTask } from '@/types'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const keyword = ref('')
const status = ref('')
const priority = ref('')
const sceneFilter = ref(typeof route.query.sceneId === 'string' ? route.query.sceneId : '')
const newTaskVisible = ref(false)
const revision = ref(0)
const selectedIds = ref<string[]>([])
const sourceTasks = computed(() => {
  void revision.value
  return getTasks(user.organizationId, sceneFilter.value || undefined)
})
const filteredTasks = computed(() => sourceTasks.value.filter((item) =>
  (!keyword.value || `${item.name}${item.id}${item.area}${item.owner}`.includes(keyword.value))
  && (!status.value || item.status === status.value)
  && (!priority.value || item.priority === priority.value),
))
const summary = computed(() => ({
  total: sourceTasks.value.length,
  running: sourceTasks.value.filter((task) => task.status === '进行中').length,
  completed: sourceTasks.value.filter((task) => task.status === '已完成').length,
  pending: sourceTasks.value.filter((task) => task.status.includes('待')).length,
  archived: sourceTasks.value.filter((task) => task.progress === 100).length,
}))
const allSelected = computed({
  get: () => Boolean(filteredTasks.value.length) && selectedIds.value.length === filteredTasks.value.length,
  set: (value: boolean) => { selectedIds.value = value ? filteredTasks.value.map((task) => task.id) : [] },
})

function handleCreated(task: PortalTask) {
  revision.value += 1
  router.push(`/tasks/${task.id}`)
}
</script>

<template>
  <CockpitPageLayout title="低空治理任务总览" :subtitle="`${user.organization.name} · ${sceneFilter ? getScene(user.organization, sceneFilter)?.name : '全部场景'}`">
    <template #action><button class="primary-action" @click="newTaskVisible = true">＋ 新增任务</button></template>
    <section class="task-filters">
      <div class="search-box">⌕<input v-model="keyword" placeholder="请输入任务名称、编号、责任单位或关键词" /></div>
      <label>所属场景<select v-model="sceneFilter"><option value="">全部场景</option><option v-for="scene in user.organization.scenes" :key="scene.id" :value="scene.id">{{ scene.shortName }}</option></select></label>
      <label>任务状态<select v-model="status"><option value="">全部状态</option><option>进行中</option><option>待处理</option><option>待复核</option><option>已完成</option></select></label>
      <label>时间范围<input type="date" /></label>
      <label>责任单位<select><option>全部单位</option><option v-for="owner in [...new Set(sourceTasks.map(item => item.owner))]" :key="owner">{{ owner }}</option></select></label>
      <label>优先级<select v-model="priority"><option value="">全部优先级</option><option>高</option><option>中</option><option>低</option></select></label>
    </section>

    <section class="task-summary">
      <div><i>▣</i><span>任务总数<b>{{ summary.total }}</b><small>较上月 +12%</small></span></div>
      <div><i>▶</i><span>进行中<b>{{ summary.running }}</b><small>较上月 +8%</small></span></div>
      <div><i>✓</i><span>已完成<b>{{ summary.completed }}</b><small>较上月 +16%</small></span></div>
      <div><i>◷</i><span>待处理<b>{{ summary.pending }}</b><small>动态更新</small></span></div>
      <div><i>▰</i><span>已归档<b>{{ summary.archived }}</b><small>闭环任务</small></span></div>
      <div class="batch-box"><b>批量管理</b><button>⇩ 批量导出</button><button>▣ 批量归档</button><button class="danger">♲ 批量删除</button></div>
    </section>

    <section class="task-table">
      <div class="task-table-row task-table-head">
        <span><input v-model="allSelected" type="checkbox" /></span><span>任务名称</span><span>所属场景</span><span>当前状态</span><span>创建单位 / 负责人</span><span>创建时间</span><span>任务范围</span><span>任务进度</span><span>操作</span>
      </div>
      <div v-for="task in filteredTasks" :key="task.id" class="task-table-row">
        <span><input v-model="selectedIds" type="checkbox" :value="task.id" /></span>
        <span class="task-name"><b>{{ task.name }}</b><small>{{ task.id }}</small></span>
        <span><em class="scene-tag">{{ getScene(user.organization, task.sceneId)?.shortName }}</em></span>
        <span><em class="status-tag" :class="task.status === '已完成' ? 'done' : task.status.includes('待') ? 'pending' : 'running'">{{ task.status }}</em></span>
        <span class="task-owner"><b>{{ task.owner }}</b><small>{{ task.assignee }}</small></span>
        <span>{{ task.createdAt.slice(0,10) }}<small>{{ task.createdAt.slice(11) }}</small></span>
        <span><i class="range-thumb"></i><small>{{ task.area }}<br>约{{ task.areaSize }}km²</small></span>
        <span class="workflow-mini"><i v-for="node in task.workflow.slice(0,5)" :key="node.key" :class="node.status"></i><small>{{ task.progress }}%</small></span>
        <span class="task-actions"><button @click="router.push(`/tasks/${task.id}`)">查看</button><button @click="router.push(`/workspace/${task.sceneId}/${task.id}`)">进入工作台</button></span>
      </div>
      <div v-if="!filteredTasks.length" class="empty-tasks">当前条件下暂无任务</div>
    </section>
    <footer class="task-pagination"><span>共 {{ filteredTasks.length }} 条记录　每页显示 10 条</span><div><button>‹</button><button class="active">1</button><button>2</button><button>3</button><button>›</button></div></footer>
    <NewTaskDialog v-model="newTaskVisible" :scene-id="sceneFilter || undefined" @created="handleCreated" />
  </CockpitPageLayout>
</template>

<style scoped lang="scss">
.primary-action { padding: 9px 18px; color: white; background: #087fe7; border: 1px solid #2fa9ff; box-shadow: 0 0 10px #138deb66; cursor: pointer; }
.task-filters { height: 58px; display: grid; grid-template-columns: 1.5fr repeat(5, 1fr); gap: 10px; align-items: end; padding: 7px 10px; background: linear-gradient(90deg,#04233d,#031a30); border: 1px solid #0c5278; }.task-filters label { display: grid; gap: 4px; color: #7fa7b7; font-size: 8px; }.task-filters select,.task-filters input { height: 29px; padding: 0 8px; color: #bfe3ed; background: #03182d; border: 1px solid #124e70; outline: 0; font-size: 9px; }.search-box { height: 29px; display: flex; align-items: center; gap: 7px; padding: 0 9px; color: #5bd9eb; background: #03182d; border: 1px solid #155a7e; }.search-box input { flex: 1; border: 0; padding: 0; }
.task-summary { height: 73px; display: grid; grid-template-columns: repeat(5, minmax(120px,1fr)) 1.35fr; gap: 5px; margin-top: 6px; }.task-summary>div { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: linear-gradient(110deg,#06375b,#042441); border: 1px solid #0b5c87; }.task-summary i { width: 36px; height: 36px; display: grid; place-items: center; color: #55e6f2; background: #075276; border: 1px solid #147fa1; border-radius: 50%; font-style: normal; }.task-summary span,.task-summary span b,.task-summary span small { display: block; }.task-summary span { color: #8db4c3; font-size: 8px; }.task-summary span b { margin-top: 2px; color: #8deff9; font-size: 20px; }.task-summary span small { color: #4c7d91; font-size: 7px; }.batch-box { display: grid!important; grid-template-columns: repeat(3,1fr); gap: 5px!important; }.batch-box>b { grid-column: 1/4; font-size: 9px; }.batch-box button { padding: 5px; color: #7ddcf0; background: #06365a; border: 1px solid #12678e; font-size: 7px; }.batch-box button.danger { color: #ff8290; border-color: #7c3040; }
.task-table { margin-top: 6px; border: 1px solid #0b5278; background: #031a30; }.task-table-row { min-height: 61px; display: grid; grid-template-columns: 30px 1.45fr .85fr .65fr 1fr .7fr .9fr 1.35fr 1.05fr; align-items: center; border-bottom: 1px solid #0a405e; }.task-table-row>span { min-width: 0; padding: 6px 8px; color: #8eb4c2; font-size: 8px; }.task-table-head { min-height: 34px; color: #a9cfdb; background: #074166; }.task-name b,.task-name small,.task-owner b,.task-owner small,.task-table-row>span>small { display: block; }.task-name b,.task-owner b { overflow: hidden; color: #d0edf4; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.task-name small,.task-owner small,.task-table-row>span>small { margin-top: 4px; color: #557f91; font-size: 7px; }.scene-tag,.status-tag { padding: 4px 6px; color: #70e4f1; background: #07516c; border: 1px solid #0b718c; font-style: normal; font-size: 7px; }.status-tag.done { color: #51eab8; border-color: #16795f; background: #075643; }.status-tag.pending { color: #ffd06c; border-color: #93691b; background: #63470d; }.range-thumb { width: 42px; height: 29px; float: left; margin-right: 5px; background: linear-gradient(145deg,#156c78,#173c4d); border: 1px solid #167492; }.workflow-mini { display: flex; align-items: center; gap: 5px; }.workflow-mini i { width: 10px; height: 10px; border: 1px solid #38647a; border-radius: 50%; }.workflow-mini i.done { background: #20d8b0; border-color: #20d8b0; }.workflow-mini i.active { background: #168ff0; border-color: #58baff; box-shadow: 0 0 6px #168ff0; }.task-actions { display: flex; gap: 5px; }.task-actions button { padding: 5px 8px; color: #bdeeff; background: #087dd4; border: 1px solid #259ef0; font-size: 7px; cursor: pointer; }.task-actions button+button { background: #063354; }.empty-tasks { padding: 60px; color: #628ca0; text-align: center; }
.task-pagination { display: flex; justify-content: space-between; align-items: center; padding: 12px 8px; color: #7199aa; font-size: 8px; }.task-pagination button { width: 24px; height: 24px; margin-left: 4px; color: #74a7bb; background: #04213b; border: 1px solid #145170; }.task-pagination button.active { color: white; background: #087ee0; border-color: #25a1f0; }
@media (max-height: 820px) { .task-table-row { min-height: 51px; }.task-summary { height: 65px; }.task-filters { height: 52px; } }
</style>
