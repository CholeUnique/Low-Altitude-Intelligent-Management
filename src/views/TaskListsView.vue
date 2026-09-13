<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const createdDate = ref('')
const sceneFilter = ref(typeof route.query.sceneId === 'string' ? route.query.sceneId : '')
const newTaskVisible = ref(false)
const revision = ref(0)
const selectedIds = ref<string[]>([])
const taskTable = ref<HTMLElement>()
const maximumRows = ref(8)
const currentPage = ref(1)
const gotoPage = ref('1')
const sourceTasks = computed(() => {
  void revision.value
  return getTasks(user.organizationId, sceneFilter.value || undefined)
})
const filteredTasks = computed(() => sourceTasks.value.filter((item) =>
  (!keyword.value || `${item.name}${item.id}${item.area}${item.owner}`.includes(keyword.value))
  && (!status.value || item.status === status.value)
  && (!priority.value || item.priority === priority.value)
  && (!createdDate.value || item.createdAt.startsWith(createdDate.value)),
))
const summary = computed(() => ({
  total: sourceTasks.value.length,
  running: sourceTasks.value.filter((task) => task.status === '进行中').length,
  completed: sourceTasks.value.filter((task) => task.status === '已完成').length,
  pending: sourceTasks.value.filter((task) => task.status.includes('待')).length,
  archived: sourceTasks.value.filter((task) => task.progress === 100).length,
}))
const displayPageSize = computed(() => filteredTasks.value.length ? Math.min(maximumRows.value, filteredTasks.value.length) : 0)
const paginationPageSize = computed(() => Math.max(1, displayPageSize.value))
const pageCount = computed(() => Math.max(1, Math.ceil(filteredTasks.value.length / paginationPageSize.value)))
const pagedTasks = computed(() => {
  const start = (currentPage.value - 1) * paginationPageSize.value
  return filteredTasks.value.slice(start, start + paginationPageSize.value)
})
const paginationItems = computed<(number | 'ellipsis')[]>(() => {
  const total = pageCount.value
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const numbers = new Set([1, total, currentPage.value - 2, currentPage.value - 1, currentPage.value, currentPage.value + 1, currentPage.value + 2])
  const pages = [...numbers].filter((page) => page > 0 && page <= total).sort((a, b) => a - b)
  return pages.flatMap((page, index) => index && page - pages[index - 1]! > 1 ? ['ellipsis', page] : [page]) as (number | 'ellipsis')[]
})
const allSelected = computed({
  get: () => Boolean(pagedTasks.value.length) && pagedTasks.value.every((task) => selectedIds.value.includes(task.id)),
  set: (value: boolean) => {
    const pageIds = pagedTasks.value.map((task) => task.id)
    selectedIds.value = value ? [...new Set([...selectedIds.value, ...pageIds])] : selectedIds.value.filter((id) => !pageIds.includes(id))
  },
})

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), pageCount.value)
  gotoPage.value = String(currentPage.value)
}

function applyGoToPage() {
  const page = Number.parseInt(gotoPage.value, 10)
  setPage(Number.isFinite(page) ? page : currentPage.value)
}

watch([keyword, status, priority, createdDate, sceneFilter], () => setPage(1))
watch(pageCount, () => setPage(currentPage.value))

function updateMaximumRows() {
  if (!taskTable.value) return
  const header = taskTable.value.querySelector<HTMLElement>('.task-table-head')
  const record = taskTable.value.querySelector<HTMLElement>('.task-table-row:not(.task-table-head)')
  const rowHeight = record?.getBoundingClientRect().height || 72
  const headerHeight = header?.getBoundingClientRect().height || 42
  const paginationHeight = 64
  const safeGap = 24
  maximumRows.value = Math.max(1, Math.floor((window.innerHeight - taskTable.value.getBoundingClientRect().top - headerHeight - paginationHeight - safeGap) / rowHeight))
}

onMounted(() => {
  void nextTick(updateMaximumRows)
  window.addEventListener('resize', updateMaximumRows)
})
onBeforeUnmount(() => window.removeEventListener('resize', updateMaximumRows))

function handleCreated(task: PortalTask) {
  revision.value += 1
  router.push(`/tasks/${task.id}`)
}
</script>

<template>
  <CockpitPageLayout center-subtitle variant="repository" title="低空治理任务总览" :subtitle="`${user.organization.name} · ${sceneFilter ? getScene(user.organization, sceneFilter)?.name : '全部场景'}`">
    <template #action><button class="primary-action" @click="newTaskVisible = true">＋ 新增任务</button></template>
    <section class="task-filters">
      <div class="search-box">⌕<input v-model="keyword" placeholder="请输入任务名称、编号或关键词" /></div>
      <label>所属场景<select v-model="sceneFilter"><option value="">全部场景</option><option v-for="scene in user.organization.scenes" :key="scene.id" :value="scene.id">{{ scene.shortName }}</option></select></label>
      <label>任务状态<select v-model="status"><option value="">全部状态</option><option>进行中</option><option>待处理</option><option>待复核</option><option>已完成</option></select></label>
      <label>创建日期<input v-model="createdDate" type="date" /></label>
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

    <section ref="taskTable" class="task-table">
      <div class="task-table-row task-table-head">
        <span><input v-model="allSelected" type="checkbox" /></span><span>任务名称</span><span>所属场景</span><span>当前状态</span><span>创建单位 / 负责人</span><span>创建时间</span><span>任务范围</span><span>任务进度</span><span>操作</span>
      </div>
      <div v-for="task in pagedTasks" :key="task.id" class="task-table-row">
        <span><input v-model="selectedIds" type="checkbox" :value="task.id" /></span>
        <span class="task-name"><b>{{ task.name }}</b><small>{{ task.id }}</small></span>
        <span><em class="scene-tag">{{ getScene(user.organization, task.sceneId)?.shortName }}</em></span>
        <span><em class="status-tag" :class="task.status === '已完成' ? 'done' : task.status.includes('待') ? 'pending' : 'running'">{{ task.status }}</em></span>
        <span class="task-owner"><b>{{ task.owner }}/{{ task.assignee }}</b></span>
        <span class="task-created">{{ task.createdAt.slice(0,10) }}/{{ task.createdAt.slice(11) }}</span>
        <span class="task-range"><i class="range-thumb"></i><small>{{ task.area }}<br>约{{ task.areaSize }}km²</small></span>
        <span class="workflow-mini" :aria-label="`任务进度 ${task.progress}%`"><span v-for="node in task.workflow.slice(0,5)" :key="node.key" class="workflow-step" :class="node.status"><i>{{ node.status === 'pending' ? '' : '✓' }}</i><small>{{ node.name }}</small></span></span>
        <span class="task-actions"><button @click="router.push(`/tasks/${task.id}`)">查看</button><button @click="router.push(`/workspace/${task.sceneId}/${task.id}`)">进入工作台</button></span>
      </div>
      <div v-if="!filteredTasks.length" class="empty-tasks">当前条件下暂无任务</div>
    </section>
    <footer class="task-pagination"><span>共 <b>{{ filteredTasks.length }}</b> 条记录　每页显示 <b>{{ displayPageSize }}</b> 条</span><div class="page-controls"><button :disabled="currentPage === 1" @click="setPage(currentPage - 1)">‹</button><template v-for="(item, index) in paginationItems" :key="`${item}-${index}`"><span v-if="item === 'ellipsis'">…</span><button v-else :class="{ active: currentPage === item }" @click="setPage(item)">{{ item }}</button></template><button :disabled="currentPage === pageCount" @click="setPage(currentPage + 1)">›</button><label>前往 <input v-model="gotoPage" inputmode="numeric" @keyup.enter="applyGoToPage" @blur="applyGoToPage" /> 页</label></div></footer>
    <NewTaskDialog v-model="newTaskVisible" :scene-id="sceneFilter || undefined" @created="handleCreated" />
  </CockpitPageLayout>
</template>

<style scoped lang="scss">
.primary-action { padding: 9px 18px; color: white; background: #087fe7; border: 1px solid #2fa9ff; box-shadow: 0 0 10px #138deb66; cursor: pointer; }
.task-filters { height: 58px; display: grid; grid-template-columns: 1.5fr repeat(4, 1fr); gap: 10px; align-items: end; padding: 7px 10px; background: linear-gradient(90deg,#04233d,#031a30); border: 1px solid #0c5278; }.task-filters label { display: grid; gap: 4px; color: #7fa7b7; font-size: 14px; }.task-filters select,.task-filters input { height: 29px; padding: 0 8px; color: #bfe3ed; background: #03182d; border: 1px solid #124e70; outline: 0; font-size: 14px; }.search-box { height: 29px; display: flex; align-items: center; gap: 7px; padding: 0 9px; color: #5bd9eb; background: #03182d; border: 1px solid #155a7e; }.search-box input { flex: 1; border: 0; padding: 0; }
.task-summary { height: 73px; display: grid; grid-template-columns: repeat(5, minmax(120px,1fr)) 1.35fr; gap: 5px; margin-top: 6px; }.task-summary>div { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: linear-gradient(110deg,#06375b,#042441); border: 1px solid #0b5c87; }.task-summary i { width: 36px; height: 36px; display: grid; place-items: center; color: #55e6f2; background: #075276; border: 1px solid #147fa1; border-radius: 50%; font-style: normal; }.task-summary span,.task-summary span b,.task-summary span small { display: block; }.task-summary span { color: #8db4c3; font-size: 14px; }.task-summary span b { margin-top: 2px; color: #8deff9; font-size: 20px; }.task-summary span small { color: #4c7d91; font-size: 12px; }.batch-box { display: grid!important; grid-template-columns: repeat(3,1fr); gap: 5px!important; }.batch-box>b { grid-column: 1/4; font-size: 14px; }.batch-box button { padding: 5px; color: #7ddcf0; background: #06365a; border: 1px solid #12678e; font-size: 12px; }.batch-box button.danger { color: #ff8290; border-color: #7c3040; }
.task-table { margin-top: 6px; border: 1px solid #0b5278; background: #031a30; }.task-table-row { min-height: 61px; display: grid; grid-template-columns: 30px 1.45fr .85fr .65fr 1fr .7fr .9fr 1.35fr 1.05fr; align-items: center; border-bottom: 1px solid #0a405e; }.task-table-row>span { min-width: 0; padding: 6px 8px; color: #8eb4c2; font-size: 14px; }.task-table-head { min-height: 34px; color: #a9cfdb; background: #074166; }.task-name b,.task-name small,.task-owner b,.task-owner small,.task-table-row>span>small { display: block; }.task-name b,.task-owner b { overflow: hidden; color: #d0edf4; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }.task-name small,.task-owner small,.task-table-row>span>small { margin-top: 4px; color: #557f91; font-size: 12px; }.scene-tag,.status-tag { padding: 4px 6px; color: #70e4f1; background: #07516c; border: 1px solid #0b718c; font-style: normal; font-size: 12px; }.status-tag.done { color: #51eab8; border-color: #16795f; background: #075643; }.status-tag.pending { color: #ffd06c; border-color: #93691b; background: #63470d; }.range-thumb { width: 42px; height: 29px; float: left; margin-right: 5px; background: linear-gradient(145deg,#156c78,#173c4d); border: 1px solid #167492; }.workflow-mini { display: flex; align-items: center; gap: 5px; }.workflow-mini i { width: 10px; height: 10px; border: 1px solid #38647a; border-radius: 50%; }.workflow-mini i.done { background: #20d8b0; border-color: #20d8b0; }.workflow-mini i.active { background: #168ff0; border-color: #58baff; box-shadow: 0 0 6px #168ff0; }.task-actions { display: flex; gap: 5px; }.task-actions button { padding: 5px 8px; color: #bdeeff; background: #087dd4; border: 1px solid #259ef0; font-size: 12px; cursor: pointer; }.task-actions button+button { background: #063354; }.empty-tasks { padding: 60px; color: #628ca0; text-align: center; }
.task-pagination { display: flex; justify-content: space-between; align-items: center; padding: 12px 8px; color: #7199aa; font-size: 14px; }.task-pagination button { width: 24px; height: 24px; margin-left: 4px; color: #74a7bb; background: #04213b; border: 1px solid #145170; }.task-pagination button.active { color: white; background: #087ee0; border-color: #25a1f0; }

/* Repository-inspired controls, card rhythm, and readable task records. */
.primary-action { height: 42px; padding: 0 22px; border-radius: 4px; font-size: 16px; font-weight: 700; background: linear-gradient(135deg, #526aff, #00a6fc); box-shadow: 0 0 13px #008dff88; }.task-filters { height: 84px; gap: 14px; align-items: end; padding: 14px 18px; border-color: #0d79b9; border-radius: 5px; background: #071d3de0; box-shadow: inset 0 0 24px #0563aa20; }.task-filters label { gap: 6px; color: #b3d5ef; font-size: 15px; }.task-filters select,.task-filters label>input,.search-box { height: 36px; border-color: #238dd1; border-radius: 4px; font-size: 15px; }.task-filters select,.task-filters label>input { padding-inline: 10px; }.search-box { gap: 9px; padding-inline: 12px; }.search-box input { height: 100%; padding: 0; border: 0; background: transparent; }.search-box:first-letter { font-size: 23px; }
.task-summary { height: 92px; gap: 10px; margin-top: 12px; }.task-summary>div { gap: 12px; padding: 10px 14px; border-color: #1477b2; border-radius: 5px; background: linear-gradient(135deg, #082b50, #04213f); box-shadow: inset 0 0 16px #0875b51f; }.task-summary i { width: 42px; height: 42px; flex: 0 0 auto; font-size: 18px; }.task-summary span { font-size: 16px; }.task-summary span b { font-size: 26px; }.task-summary span small { font-size: 13px; }.batch-box>b { font-size: 16px; }.batch-box button { border-radius: 4px; font-size: 13px; }
.task-table { margin-top: 12px; overflow: hidden; border-color: #1477b2; border-radius: 5px; background: #071d3de0; }.task-table-row { min-height: 72px; grid-template-columns: 30px 1.35fr .75fr .65fr .8fr .75fr .75fr 2.4fr 1.1fr; }.task-table-row>span { padding: 8px 10px; color: #b6d4e4; font-size: 15px; }.task-table-head { min-height: 42px; color: #d8efff; background: linear-gradient(90deg, #074b78, #06365f); font-size: 16px; }.task-name b,.task-owner b { font-size: 16px; }.task-name small,.task-owner small,.task-table-row>span>small { font-size: 13px; }.task-created { white-space: nowrap; }.task-range { display: flex; align-items: center; gap: 7px; }.task-range .range-thumb { float: none; flex: 0 0 auto; margin: 0; }.task-range small { margin-top: 0; }.scene-tag,.status-tag { padding: 5px 8px; border-radius: 3px; font-size: 13px; }.range-thumb { width: 45px; height: 31px; }.task-actions { gap: 7px; }.task-actions button { padding: 7px 9px; border-radius: 3px; font-size: 13px; }
.workflow-mini { position: relative; min-width: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: start; gap: 0; padding-top: 2px; }.workflow-step { position: relative; min-width: 0; display: grid; grid-template-rows: 19px auto; justify-items: center; color: #7598ad; }.workflow-step:not(:first-child)::before { content: ""; position: absolute; z-index: 0; top: 8px; right: calc(50% + 8.5px); width: calc(100% - 17px); height: 2px; background: #3c6680; }.workflow-step.done::before { background: #20d8b0; box-shadow: 0 0 5px #20d8b088; }.workflow-step.active::before { background: linear-gradient(90deg, #20d8b0, #239eff); }.workflow-step i { position: relative; z-index: 1; width: 17px; height: 17px; display: grid; place-items: center; border: 2px solid #6589a2; border-radius: 50%; color: #fff; background: #09233d; font-size: 11px; font-style: normal; line-height: 1; }.workflow-step.done i { border-color: #21dbb1; background: #21dbb1; box-shadow: 0 0 7px #21dbb188; }.workflow-step.active i { border-color: #5bc9ff; background: #168ff0; box-shadow: 0 0 8px #168ff0; }.workflow-step small { width: 100%; margin-top: 4px; overflow: hidden; color: inherit; font-size: 12px; line-height: 1.15; text-align: center; text-overflow: ellipsis; white-space: nowrap; }.workflow-step.done small,.workflow-step.active small { color: #d3f3ff; }
.task-pagination { padding: 16px 4px; color: #a9c6db; font-size: 15px; }.task-pagination button { width: 31px; height: 31px; border-radius: 4px; font-size: 14px; }
.task-pagination b { color: #37cbff; }.task-pagination select { min-height: 31px; margin: 0 5px; padding: 0 26px 0 9px; border: 1px solid #28587f; border-radius: 4px; color: #e7f7ff; background: #0b294a; font-size: 14px; }.task-pagination button:disabled { opacity: .4; cursor: not-allowed; }.page-controls { display: flex; align-items: center; }.page-controls label { margin-left: 18px; }.page-controls input { width: 38px; height: 29px; margin: 0 4px; border: 1px solid #2d6693; border-radius: 3px; color: white; background: #0a2949; font-size: 14px; text-align: center; }
@media (max-height: 820px) { .task-table-row { min-height: 51px; }.task-summary { height: 65px; }.task-filters { height: 52px; } }
</style>
