<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import TaskCenterLayout from '@/layouts/TaskCenterLayout.vue'
import TaskWorkflowProgress, { getTaskWorkflowSteps, isNonGrainTask } from '@/components/task-center/TaskWorkflowProgress.vue'
import { getGovernanceTaskPage, type GovernanceTask, type GovernanceTaskStatus } from '@/api/governance-task'
import { useUserStore } from '@/stores/user'
import { isTaskVisibleForOrganization } from '@/utils/scene-visibility'
import { createNonGrainDemoTasks, isNonGrainDemoTaskId, NON_GRAIN_VIEWER_NODE_KEY } from '@/mocks/non-grain-workspace'

type TodoCategory = 'all' | 'pending' | 'handled'
type DeadlineSort = 'asc' | 'desc'

const user = useUserStore()
const router = useRouter()
const tasks = ref<GovernanceTask[]>([])
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const category = ref<TodoCategory>('all')
const processType = ref<GovernanceTaskStatus | ''>('')
const deadlineSort = ref<DeadlineSort>('asc')
let requestVersion = 0

const currentUserId = computed(() =>
  String(user.currentUser?.id || user.currentUser?.username || 'non-grain-demo-user'))
const demoTasks = computed(() =>
  createNonGrainDemoTasks(currentUserId.value, user.activeDeptId, '海陵区农业农村局'))
const displayTasks = computed(() => [
  ...demoTasks.value,
  ...tasks.value.filter((task) => !isNonGrainDemoTaskId(task.id)),
])
type MyWorkState = 'pending' | 'handled'

function myWorkState(task: GovernanceTask): MyWorkState | undefined {
  if (isNonGrainTask(task)) {
    const myNode = getTaskWorkflowSteps(task).find((node) => node.key === NON_GRAIN_VIEWER_NODE_KEY)
    if (myNode?.status === 'active') return 'pending'
    if (myNode?.status === 'done') return 'handled'
    return undefined
  }
  if (task.assigneeId !== currentUserId.value) return undefined
  return [3, 4, 5].includes(task.taskStatus) ? 'handled' : 'pending'
}

const myWorkTasks = computed(() => displayTasks.value.filter((task) => Boolean(myWorkState(task))))

function deadlineTime(task: GovernanceTask) {
  if (!task.planEndTime) return Number.POSITIVE_INFINITY
  const value = new Date(task.planEndTime).getTime()
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

function isDueSoon(task: GovernanceTask) {
  const deadline = deadlineTime(task)
  const remaining = deadline - Date.now()
  return remaining >= 0 && remaining <= 3 * 24 * 60 * 60 * 1000
}

function isOverdue(task: GovernanceTask) {
  return deadlineTime(task) < Date.now()
}

const categoryCounts = computed(() => ({
  all: myWorkTasks.value.length,
  pending: myWorkTasks.value.filter((task) => myWorkState(task) === 'pending').length,
  handled: myWorkTasks.value.filter((task) => myWorkState(task) === 'handled').length,
}))

const visibleTasks = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLocaleLowerCase()
  return myWorkTasks.value
    .filter((task) => {
      if (category.value !== 'all' && myWorkState(task) !== category.value) return false
      if (processType.value !== '' && task.taskStatus !== processType.value) return false
      return !normalizedKeyword
        || `${task.name} ${task.taskNo} ${task.sceneName} ${task.deptName}`.toLocaleLowerCase().includes(normalizedKeyword)
    })
    .sort((left, right) => {
      const leftTime = deadlineTime(left)
      const rightTime = deadlineTime(right)
      if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0
      if (!Number.isFinite(leftTime)) return 1
      if (!Number.isFinite(rightTime)) return -1
      return deadlineSort.value === 'asc' ? leftTime - rightTime : rightTime - leftTime
    })
})

const workload = computed(() => ({
  pending: myWorkTasks.value.filter((task) => myWorkState(task) === 'pending').length,
  handled: myWorkTasks.value.filter((task) => myWorkState(task) === 'handled').length,
  dueSoon: myWorkTasks.value.filter((task) => myWorkState(task) === 'pending' && isDueSoon(task)).length,
  overdue: myWorkTasks.value.filter((task) => myWorkState(task) === 'pending' && isOverdue(task)).length,
}))

function formatTime(value?: string) {
  if (!value) return '未设置'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value.replace('T', ' ')
    : date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function priorityLabel(priority: number) {
  return priority === 2 ? '高' : priority === 1 ? '中' : '低'
}

function openWorkspace(task: GovernanceTask) {
  router.push({
    name: 'workspace',
    params: { sceneId: task.sceneCode, taskId: task.id },
    query: { node: isNonGrainTask(task) ? NON_GRAIN_VIEWER_NODE_KEY : undefined },
  })
}

async function loadTasks() {
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const page = await getGovernanceTaskPage({
      pageNum: 1,
      pageSize: 200,
      deptId: user.activeDeptId,
      organizationId: user.organizationId,
    })
    if (version !== requestVersion) return
    tasks.value = page.records.filter((task) =>
      isTaskVisibleForOrganization(user.organization, task, user.activeDeptId))
  } catch (reason) {
    if (version !== requestVersion) return
    tasks.value = []
    error.value = reason instanceof Error ? reason.message : '待办任务加载失败，请稍后重试。'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

watch([() => user.organizationId, () => user.activeDeptId], () => void loadTasks())
onMounted(() => void loadTasks())
</script>

<template>
  <TaskCenterLayout title="我的待办" :subtitle="`${user.organization.name} · 展示待我处理及我已处理的任务`">
    <template #actions>
      <button class="refresh-button" :disabled="loading" @click="loadTasks">{{ loading ? '加载中…' : '刷新待办' }}</button>
    </template>

    <section class="todo-tabs" aria-label="待办分类">
      <button :class="{ active: category === 'all' }" @click="category = 'all'">全部相关 <b>{{ categoryCounts.all }}</b></button>
      <button :class="{ active: category === 'pending' }" @click="category = 'pending'">待我处理 <b>{{ categoryCounts.pending }}</b></button>
      <button :class="{ active: category === 'handled' }" @click="category = 'handled'">我已处理 <b>{{ categoryCounts.handled }}</b></button>
    </section>

    <div class="todo-layout">
      <main class="todo-main">
        <section class="todo-filters">
          <label class="search-control">搜索任务<div><span>⌕</span><input v-model="keyword" placeholder="任务名称、编号、场景或部门" /></div></label>
          <label>处理类型<select v-model="processType"><option value="">全部类型</option><option :value="0">待执行</option><option :value="1">执行中</option><option :value="2">待核查</option></select></label>
          <label>截止时间<select v-model="deadlineSort"><option value="asc">由近到远</option><option value="desc">由远到近</option></select></label>
        </section>

        <p v-if="error" class="todo-warning">真实待办加载失败：{{ error }}。已保留非粮监管演示任务供工作台查看。</p>
        <section class="todo-list">
          <article v-for="task in visibleTasks" :key="task.id" class="todo-item">
            <div class="task-meta">
              <div class="task-title">
                <span class="priority" :class="`priority-${task.priority}`">{{ priorityLabel(task.priority) }}</span>
                <div><h2>{{ task.name }} <em class="work-state" :class="myWorkState(task)">{{ myWorkState(task) === 'handled' ? '我已处理' : '待我处理' }}</em></h2><p>{{ task.taskNo }} · {{ task.sceneName }}</p></div>
              </div>
              <div class="deadline" :class="{ overdue: isOverdue(task), soon: isDueSoon(task) }">
                <span>{{ isOverdue(task) ? '已逾期' : isDueSoon(task) ? '即将到期' : '截止时间' }}</span>
                <strong>{{ formatTime(task.planEndTime) }}</strong>
              </div>
            </div>
            <div class="task-body">
              <dl><div><dt>所属部门</dt><dd>{{ task.deptName || '-' }}</dd></div><div><dt>当前状态</dt><dd>{{ task.taskStatusDesc }}</dd></div><div><dt>创建时间</dt><dd>{{ formatTime(task.createTime) }}</dd></div></dl>
              <TaskWorkflowProgress :task="task" />
              <button class="workspace-button" @click="openWorkspace(task)">{{ myWorkState(task) === 'handled' ? '查看我的办理' : '进入工作台' }}</button>
            </div>
          </article>

          <div v-if="loading && !visibleTasks.length" class="todo-empty">正在加载真实待办任务…</div>
          <div v-else-if="!myWorkTasks.length" class="todo-empty"><b>暂无与我相关的任务</b><p>任务尚未到达我的办理节点，或当前用户没有相关办理记录。</p></div>
          <div v-else-if="!visibleTasks.length" class="todo-empty"><b>当前分类暂无任务</b><p>可调整分类、关键词或处理类型后查看。</p></div>
        </section>
      </main>

      <aside class="workload-panel">
        <header><h2>我的工作负载</h2><p>当前用户 #{{ currentUserId || '-' }}</p></header>
        <div class="workload-total"><strong>{{ myWorkTasks.length }}</strong><span>与我相关的任务</span></div>
        <ul>
          <li><span><i class="blue"></i>待我处理</span><b>{{ workload.pending }}</b></li>
          <li><span><i class="cyan"></i>我已处理</span><b>{{ workload.handled }}</b></li>
          <li><span><i class="orange"></i>即将到期</span><b>{{ workload.dueSoon }}</b></li>
          <li><span><i class="red"></i>已逾期</span><b>{{ workload.overdue }}</b></li>
        </ul>
        <p class="workload-note">工作负载包含固定非粮监管演示任务及当前部门接口返回的前 200 条任务。</p>
      </aside>
    </div>
  </TaskCenterLayout>
</template>

<style scoped lang="scss">
.refresh-button { height: 34px; padding: 0 15px; color: #fff; background: #2389d3; border: 1px solid #1880c8; border-radius: 4px; cursor: pointer; }
.refresh-button:disabled { opacity: .6; cursor: wait; }
.todo-tabs { height: 48px; display: flex; align-items: stretch; padding: 0 16px; background: #fff; border: 1px solid #e1e7ed; border-radius: 6px 6px 0 0; }
.todo-tabs button { min-width: 120px; padding: 0 18px; color: #718295; background: transparent; border: 0; border-bottom: 3px solid transparent; cursor: pointer; font-size: 13px; }
.todo-tabs button.active { color: #267fbe; border-bottom-color: #2d8fd4; font-weight: 600; }
.todo-tabs b { min-width: 20px; display: inline-block; margin-left: 5px; padding: 1px 6px; color: #718295; background: #eef2f5; border-radius: 9px; font-size: 10px; }
.todo-tabs button.active b { color: #267fbe; background: #e7f3fb; }
.todo-layout { display: grid; grid-template-columns: minmax(0, 1fr) 245px; gap: 14px; margin-top: 14px; }
.todo-main { min-width: 0; }
.todo-filters { display: grid; grid-template-columns: minmax(260px, 1fr) 160px 160px; gap: 12px; padding: 13px 15px; background: #fff; border: 1px solid #e1e7ed; border-radius: 6px; }
.todo-filters label { display: grid; gap: 6px; color: #65788b; font-size: 12px; }
.todo-filters input, .todo-filters select, .search-control > div { height: 34px; color: #33495e; background: #fff; border: 1px solid #d8e0e7; border-radius: 4px; outline: 0; }
.todo-filters select { padding: 0 9px; }
.todo-filters select:not(:disabled):hover,
.todo-filters select:not(:disabled):focus-visible {
  color: #fff !important;
  background-color: #176f9f !important;
  border-color: #2aa9df !important;
}
.search-control > div { display: flex; align-items: center; gap: 8px; padding: 0 10px; }
.search-control span { color: #8c9aa8; }
.search-control input { min-width: 0; flex: 1; height: 30px; padding: 0; border: 0; }
.todo-list { margin-top: 12px; }
.todo-warning { margin: 12px 0 0; padding: 9px 12px; color: #9a681d; background: #fff8e8; border: 1px solid #efd9a9; border-radius: 5px; font-size: 12px; }
.todo-item { margin-bottom: 10px; overflow: hidden; background: #fff; border: 1px solid #e0e7ed; border-radius: 6px; box-shadow: 0 2px 10px #24496909; }
.task-meta { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 10px 16px; border-bottom: 1px solid #edf1f4; }
.task-title { min-width: 0; display: flex; align-items: center; gap: 11px; }
.task-title h2, .task-title p { margin: 0; }
.task-title h2 { overflow: hidden; color: #30465c; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.work-state { margin-left: 6px; padding: 2px 6px; color: #277fbf; background: #eaf5fd; border-radius: 9px; font-size: 9px; font-style: normal; font-weight: 500; vertical-align: 2px; }
.work-state.handled { color: #248263; background: #e7f7f0; }
.task-title p { margin-top: 5px; color: #97a4b1; font-size: 10px; }
.priority { width: 26px; height: 26px; flex: 0 0 26px; display: grid; place-items: center; color: #738396; background: #edf1f4; border-radius: 50%; font-size: 10px; }
.priority-2 { color: #c95353; background: #fff0ef; }.priority-1 { color: #bd7a2b; background: #fff5e7; }
.deadline { text-align: right; }.deadline span, .deadline strong { display: block; }.deadline span { color: #9aa6b2; font-size: 10px; }.deadline strong { margin-top: 3px; color: #5f7184; font-size: 12px; }.deadline.soon strong { color: #d0842d; }.deadline.overdue strong { color: #c95454; }
.task-body { display: grid; grid-template-columns: minmax(270px, .9fr) minmax(370px, 1.45fr) 105px; align-items: center; gap: 18px; min-height: 74px; padding: 11px 16px; }
.task-body dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 0; }
.task-body dl div { min-width: 0; }.task-body dt { color: #a0abb6; font-size: 10px; }.task-body dd { margin: 5px 0 0; overflow: hidden; color: #596d80; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.workspace-button { height: 32px; color: #fff; background: #2c8bcf; border: 1px solid #2180c3; border-radius: 4px; cursor: pointer; font-size: 12px; }
.workspace-button:hover { background: #227dbb; }
.todo-empty { min-height: 220px; display: grid; align-content: center; justify-items: center; gap: 8px; padding: 30px; color: #8f9dab; background: #fff; border: 1px solid #e1e7ed; border-radius: 6px; text-align: center; }
.todo-empty b { color: #5d7083; font-size: 14px; }.todo-empty p { margin: 0; font-size: 12px; }.todo-empty.error { color: #b45858; }.todo-empty button { padding: 6px 13px; color: #2d83c1; background: #fff; border: 1px solid #bcd8eb; border-radius: 4px; cursor: pointer; }
.workload-panel { align-self: start; overflow: hidden; background: #fff; border: 1px solid #e1e7ed; border-radius: 6px; box-shadow: 0 2px 10px #24496909; }
.workload-panel header { padding: 17px 18px; border-bottom: 1px solid #edf1f4; }.workload-panel h2, .workload-panel p { margin: 0; }.workload-panel h2 { color: #354b61; font-size: 15px; }.workload-panel header p { margin-top: 5px; color: #a1acb7; font-size: 10px; }
.workload-total { padding: 20px 18px; text-align: center; background: #f8fbfd; }.workload-total strong, .workload-total span { display: block; }.workload-total strong { color: #2b89cc; font-size: 32px; }.workload-total span { margin-top: 3px; color: #8795a4; font-size: 11px; }
.workload-panel ul { margin: 0; padding: 10px 18px; list-style: none; }.workload-panel li { height: 35px; display: flex; align-items: center; justify-content: space-between; color: #687a8c; border-bottom: 1px dashed #e9eef2; font-size: 12px; }.workload-panel li:last-child { border-bottom: 0; }.workload-panel li span { display: flex; align-items: center; gap: 8px; }.workload-panel li i { width: 7px; height: 7px; border-radius: 50%; background: #318fd4; }.workload-panel li i.cyan { background: #28a5b3; }.workload-panel li i.purple { background: #7468d3; }.workload-panel li i.orange { background: #df8b32; }.workload-panel li i.red { background: #d45d5d; }.workload-panel li b { color: #43586d; }
.workload-note { padding: 0 18px 16px; color: #a2adb8; font-size: 10px; line-height: 1.6; }
@media (max-width: 1280px) {
  .todo-layout { grid-template-columns: minmax(0, 1fr) 210px; }
  .task-body { grid-template-columns: 230px minmax(330px, 1fr) 100px; gap: 12px; }
}
</style>
