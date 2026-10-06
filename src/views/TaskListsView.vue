<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TaskCenterLayout from '@/layouts/TaskCenterLayout.vue'
import NewTaskDialog from '@/components/NewTaskDialog.vue'
import TaskRangeThumbnail from '@/components/TaskRangeThumbnail.vue'
import TaskWorkflowProgress from '@/components/task-center/TaskWorkflowProgress.vue'
import { collectPages } from '@/api/pagination'
import { getTaskWorkflow } from '@/api/task-workflow'
import { projectTaskListWorkflow } from '@/utils/task-list-workflow'
import { deleteGovernanceTask, getGovernanceTaskGeometry, getGovernanceTaskPage } from '@/api/governance-task'
import { getDepartmentList, type DepartmentInfo } from '@/api/account-management'
import { getSceneDictionary } from '@/api/scene'
import { useUserStore } from '@/stores/user'
import type { GovernanceTask, GovernanceTaskStatus, TaskGeometryFeatureCollection } from '@/api/governance-task'
import type { SceneDictionaryItem } from '@/api/scene'
import { findOrganizationScene, isTaskVisibleForOrganization } from '@/utils/scene-visibility'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const keyword = ref('')
const status = ref<GovernanceTaskStatus | ''>('')
const priority = ref<number | ''>('')
const parentDeptId = ref('')
const childDeptId = ref('')
const departments = ref<DepartmentInfo[]>([])
const departmentLoading = ref(false)
const departmentError = ref('')
const sceneFilter = ref(typeof route.query.sceneId === 'string' ? route.query.sceneId : '')
const initialSceneCode = typeof route.query.sceneCode === 'string' ? route.query.sceneCode : ''
const newTaskVisible = ref(false)
const selectedIds = ref<string[]>([])
const deleteConfirmVisible = ref(false)
const deleteLoading = ref(false)
const deleteError = ref('')
const taskTable = ref<HTMLElement>()
const maximumRows = ref(8)
const currentPage = ref(1)
const gotoPage = ref('1')
const taskRows = ref<GovernanceTask[]>([])
const taskTotal = ref(0)
const taskLoading = ref(false)
const taskError = ref('')
const workflowError = ref('')
const sceneOptions = ref<SceneDictionaryItem[]>([])
const sceneLoading = ref(true)
const sceneError = ref('')
const taskRangeGeometries = ref<Record<string, TaskGeometryFeatureCollection>>({})
const taskRangePreviewLoading = ref(false)
let latestRequest = 0
let latestSceneRequest = 0
let latestRangePreviewRequest = 0

const selectedScene = computed(() => sceneOptions.value.find((scene) => scene.id === sceneFilter.value))
const selectedOrganizationSceneId = computed(() => selectedScene.value
  ? findOrganizationScene(user.organization, selectedScene.value.code, selectedScene.value.name)?.id
  : undefined)
const rootDepartments = computed(() => {
  const ids = new Set(departments.value.map((item) => item.id))
  return departments.value.filter((item) => !item.parentId || item.parentId === '0' || !ids.has(item.parentId))
})
const childDepartments = computed(() =>
  departments.value.filter((item) => item.parentId === parentDeptId.value))
const selectedDeptId = computed(() => childDeptId.value || parentDeptId.value || user.activeDeptId)
const requestPageSize = computed(() => Math.min(Math.max(maximumRows.value, 5), 50))
const pageCount = computed(() => Math.max(1, Math.ceil(taskTotal.value / requestPageSize.value)))
const paginationItems = computed<(number | 'ellipsis')[]>(() => {
  const total = pageCount.value
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const numbers = new Set([1, total, currentPage.value - 2, currentPage.value - 1, currentPage.value, currentPage.value + 1, currentPage.value + 2])
  const pages = [...numbers].filter((page) => page > 0 && page <= total).sort((a, b) => a - b)
  return pages.flatMap((page, index) => index && page - pages[index - 1]! > 1 ? ['ellipsis', page] : [page]) as (number | 'ellipsis')[]
})
const allSelected = computed({
  get: () => {
    const selectableTasks = taskRows.value
    return Boolean(selectableTasks.length) && selectableTasks.every((task) => selectedIds.value.includes(task.id))
  },
  set: (value: boolean) => {
    const pageIds = taskRows.value.map((task) => task.id)
    selectedIds.value = value ? [...new Set([...selectedIds.value, ...pageIds])] : selectedIds.value.filter((id) => !pageIds.includes(id))
  },
})
const selectedTaskNames = computed(() => taskRows.value
  .filter((task) => selectedIds.value.includes(task.id))
  .map((task) => task.name))

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), pageCount.value)
  gotoPage.value = String(currentPage.value)
}

function applyGoToPage() {
  const page = Number.parseInt(gotoPage.value, 10)
  setPage(Number.isFinite(page) ? page : currentPage.value)
}

function formatTime(value?: string) {
  return value ? value.replace('T', ' ').replace(/\.\d{3}Z?$/, '') : '-'
}

function taskStatusClass(task: GovernanceTask) {
  if (task.taskStatus === 5) return 'done'
  if (task.taskStatus === 0 || task.taskStatus === 2) return 'pending'
  if (task.taskStatus === 3 || task.taskStatus === 4) return 'failed'
  return 'running'
}

function hasTaskRangeGeometry(geometry: TaskGeometryFeatureCollection) {
  return geometry.features.some((feature) => Boolean(feature.geometry?.type && feature.geometry.coordinates))
}

async function loadTaskRangePreviews(tasks: GovernanceTask[], taskRequestId: number) {
  const previewRequestId = ++latestRangePreviewRequest
  taskRangePreviewLoading.value = Boolean(tasks.length)
  taskRangeGeometries.value = {}
  const results = await Promise.allSettled(tasks.map(async (task) => [
    task.id,
    await getGovernanceTaskGeometry(task.id, undefined, false),
  ] as const))
  if (taskRequestId !== latestRequest || previewRequestId !== latestRangePreviewRequest) return
  const geometries: Record<string, TaskGeometryFeatureCollection> = {}
  results.forEach((result) => {
    if (result.status !== 'fulfilled') return
    const [taskId, geometry] = result.value
    if (hasTaskRangeGeometry(geometry)) geometries[taskId] = geometry
  })
  taskRangeGeometries.value = geometries
  taskRangePreviewLoading.value = false
}

function filteredTaskRecords(apiRecords: GovernanceTask[], filterStatus = true) {
  const normalizedKeyword = keyword.value.trim().toLocaleLowerCase()
  const selectedPriority = priority.value === '' ? undefined : Number(priority.value)
  return apiRecords.filter((task) =>
    isTaskVisibleForOrganization(user.organization, task, selectedDeptId.value)
    && (selectedPriority === undefined || task.priority === selectedPriority)
    && (!filterStatus || status.value === '' || task.taskStatus === status.value)
    && (!normalizedKeyword || `${task.name} ${task.taskNo} ${task.sceneName} ${task.deptName}`.toLocaleLowerCase().includes(normalizedKeyword))
    && (!selectedScene.value || task.sceneCode === selectedScene.value.code
      || (selectedOrganizationSceneId.value && findOrganizationScene(user.organization, task.sceneCode, task.sceneName)?.id === selectedOrganizationSceneId.value)))
}

function applyTaskRecords(records: GovernanceTask[], requestId: number) {
  const visibleRecords = filteredTaskRecords(records)
  taskTotal.value = visibleRecords.length
  const start = (currentPage.value - 1) * requestPageSize.value
  taskRows.value = visibleRecords.slice(start, start + requestPageSize.value)
  selectedIds.value = []
  void loadTaskRangePreviews(taskRows.value, requestId)
  if (currentPage.value > Math.max(1, Math.ceil(visibleRecords.length / requestPageSize.value))) setPage(1)
}

async function loadTasks() {
  const requestId = ++latestRequest
  taskLoading.value = true
  taskError.value = ''
  workflowError.value = ''
  try {
    const selectedPriority = priority.value === '' ? undefined : Number(priority.value)
    const records = await collectPages((pageNum, pageSize) => getGovernanceTaskPage({
      // 场景编码在统计接口和任务接口之间不完全一致，先取当前部门任务，
      // 再以统一场景映射在前端筛选，避免点击统计卡片后查不到任务。
      pageNum,
      pageSize,
      keyword: keyword.value || undefined,
      // 流程已启动时业务 taskStatus 可能仍为 0，状态筛选须在合并流程后执行。
      priority: selectedPriority,
      deptId: selectedDeptId.value,
      organizationId: user.organizationId,
    }))
    if (requestId !== latestRequest) return
    // 后端切换部门后仍可能返回历史跨单位任务；前端按当前单位场景再做一层隔离。
    const candidates = filteredTaskRecords(records, false)
    const projected = [...candidates]
    const failures: string[] = []
    let next = 0
    await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, async () => {
      while (next < candidates.length && requestId === latestRequest) {
        const index = next++
        const task = candidates[index]!
        try { projected[index] = projectTaskListWorkflow(task, await getTaskWorkflow(task.id)) }
        catch (error) { failures.push(`${task.taskNo}：${error instanceof Error ? error.message : '读取失败'}`) }
      }
    }))
    if (requestId !== latestRequest) return
    if (failures.length) workflowError.value = `部分任务流程读取失败，相关任务暂按业务状态显示：${failures.join('；')}`
    applyTaskRecords(projected, requestId)
  } catch (error) {
    if (requestId !== latestRequest) return
    applyTaskRecords([], requestId)
    taskError.value = error instanceof Error ? error.message : '真实任务加载失败，请重试。'
  } finally {
    if (requestId === latestRequest) taskLoading.value = false
  }
}

async function loadSceneDictionary() {
  const requestId = ++latestSceneRequest
  sceneLoading.value = true
  sceneError.value = ''
  try {
    const scenes = await getSceneDictionary(user.organization.scenes, user.activeDeptId)
    if (requestId !== latestSceneRequest) return
    sceneOptions.value = scenes
    if (!sceneFilter.value && initialSceneCode) {
      sceneFilter.value = sceneOptions.value.find((scene) =>
        scene.code === initialSceneCode
        || findOrganizationScene(user.organization, scene.code, scene.name)?.id
          === findOrganizationScene(user.organization, initialSceneCode)?.id,
      )?.id || ''
    }
  } catch (error) {
    if (requestId !== latestSceneRequest) return
    sceneOptions.value = []
    sceneError.value = error instanceof Error ? error.message : '场景字典加载失败，请稍后重试。'
  } finally {
    if (requestId === latestSceneRequest) sceneLoading.value = false
  }
}

async function loadDepartments() {
  departmentLoading.value = true
  departmentError.value = ''
  try {
    departments.value = await getDepartmentList({ deptId: user.activeDeptId })
    const selected = departments.value.find((item) => item.id === user.activeDeptId)
    if (selected?.parentId && departments.value.some((item) => item.id === selected.parentId)) {
      parentDeptId.value = selected.parentId
      childDeptId.value = selected.id
    } else {
      parentDeptId.value = selected?.id || ''
      childDeptId.value = ''
    }
  } catch (error) {
    departments.value = []
    parentDeptId.value = ''
    childDeptId.value = ''
    departmentError.value = error instanceof Error ? error.message : '部门列表加载失败'
  } finally {
    departmentLoading.value = false
  }
}

function updateMaximumRows() {
  if (!taskTable.value) return
  const header = taskTable.value.querySelector<HTMLElement>('.task-table-head')
  const record = taskTable.value.querySelector<HTMLElement>('.task-table-row:not(.task-table-head)')
  const rowHeight = record?.getBoundingClientRect().height || 72
  const headerHeight = header?.getBoundingClientRect().height || 42
  const paginationHeight = 64
  const safeGap = 24
  maximumRows.value = Math.max(5, Math.floor((window.innerHeight - taskTable.value.getBoundingClientRect().top - headerHeight - paginationHeight - safeGap) / rowHeight))
}

function handleCreated(task: { id: string; sceneCode?: string }) {
  if (task.sceneCode && ['CULTIVATED_LAND_USE_CONTROL', 'NON_GRAIN', 'NON_GRAIN_MONITORING'].includes(task.sceneCode)) {
    void router.push({ name: 'workspace', params: { sceneId: task.sceneCode, taskId: task.id } })
  } else {
    void router.push(`/tasks/${task.id}`)
  }
}

function openTask(task: GovernanceTask) {
  router.push(`/tasks/${task.id}`)
}

function requestBatchDelete() {
  deleteError.value = ''
  if (!selectedIds.value.length) {
    deleteError.value = '请先勾选至少一个任务。'
    return
  }
  deleteConfirmVisible.value = true
}

async function confirmBatchDelete() {
  const taskIds = [...selectedIds.value]
  if (!taskIds.length || deleteLoading.value) return
  deleteLoading.value = true
  deleteError.value = ''
  const failed: string[] = []
  try {

      for (const taskId of taskIds) {
        try {
          await deleteGovernanceTask(taskId, user.activeDeptId)
        } catch {
          failed.push(taskId)
        }
      }
    selectedIds.value = []
    await loadTasks()
    if (failed.length) {
      deleteError.value = `${failed.length} 个任务删除失败，其余任务已删除。请确认任务状态和当前部门权限后重试。`
      return
    }
    deleteConfirmVisible.value = false
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '批量删除失败，请稍后重试。'
  } finally {
    deleteLoading.value = false
  }
}

watch([keyword, status, priority, sceneFilter, parentDeptId, childDeptId], () => {
  if (currentPage.value !== 1) setPage(1)
  else void loadTasks()
})
watch(parentDeptId, () => {
  if (!childDepartments.value.some((item) => item.id === childDeptId.value)) childDeptId.value = ''
})
watch([currentPage, requestPageSize], () => void loadTasks())
watch(selectedScene, () => {
  if (sceneFilter.value) void loadTasks()
})
watch([() => user.organizationId, () => user.activeDeptId], async () => {
  // 切换单位后不能保留上一个部门的场景编码，否则会导致列表为空或串场景。
  sceneFilter.value = ''
  currentPage.value = 1
  await Promise.all([loadSceneDictionary(), loadDepartments()])
  void loadTasks()
})
watch(pageCount, () => setPage(currentPage.value))

onMounted(async () => {
  await Promise.all([loadSceneDictionary(), loadDepartments()])
  void loadTasks()
  await nextTick()
  updateMaximumRows()
  window.addEventListener('resize', updateMaximumRows)
})
onBeforeUnmount(() => window.removeEventListener('resize', updateMaximumRows))
</script>

<template>
  <TaskCenterLayout title="任务列表" :subtitle="`${user.organization.name} · ${sceneFilter ? selectedScene?.name || '已选场景' : '全部场景'}`">
    <template #actions>
      <div class="heading-actions">
        <button class="batch-delete" :disabled="!selectedIds.length || deleteLoading" @click="requestBatchDelete">
          批量删除<span v-if="selectedIds.length">（{{ selectedIds.length }}）</span>
        </button>
        <button v-if="user.currentUser?.role === 'ADMIN'" class="primary-action" @click="newTaskVisible = true">＋ 新增任务</button>
      </div>
    </template>
    <section class="task-filters">
      <label class="search-filter">搜索任务<div class="search-box">⌕<input v-model="keyword" placeholder="请输入任务名称、编号或关键词" /></div></label>
      <label>所属场景<select v-model="sceneFilter" :disabled="sceneLoading"><option value="">{{ sceneLoading ? '场景字典加载中…' : '全部场景' }}</option><option v-for="scene in sceneOptions" :key="scene.id" :value="scene.id">{{ scene.shortName }}</option></select></label>
      <label>任务状态<select v-model="status"><option value="">全部状态</option><option :value="0">待执行</option><option :value="1">执行中</option><option :value="2">待核查</option><option :value="3">已失败</option><option :value="4">已取消</option><option :value="5">已完成</option></select></label>
      <label>所属部门
        <div class="department-filter">
          <select v-model="parentDeptId" :disabled="departmentLoading">
            <option value="">{{ departmentLoading ? '部门加载中…' : '全部一级部门' }}</option>
            <option v-for="item in rootDepartments" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <select v-model="childDeptId" :disabled="departmentLoading || !parentDeptId || !childDepartments.length">
            <option value="">全部二级部门</option>
            <option v-for="item in childDepartments" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </div>
      </label>
      <label>优先级<select v-model.number="priority"><option value="">全部优先级</option><option :value="2">高</option><option :value="1">中</option><option :value="0">低</option></select></label>
    </section>
    <p v-if="sceneError" class="scene-dictionary-error">场景字典加载失败：{{ sceneError }}。请检查登录状态与网络后刷新页面。</p>
    <p v-if="departmentError" class="scene-dictionary-error">部门列表加载失败：{{ departmentError }}。筛选将使用当前登录部门。</p>
    <p v-if="deleteError" class="scene-dictionary-error">{{ deleteError }}</p>
    <p v-if="workflowError" class="scene-dictionary-error" role="alert">{{ workflowError }}</p>

    <section ref="taskTable" class="task-table">
      <div class="task-table-row task-table-head">
        <span><input v-model="allSelected" type="checkbox" /></span><span>任务名称</span><span>所属场景</span><span>当前状态</span><span>创建单位 / 负责人</span><span>创建时间</span><span>任务范围</span><span>任务进度</span><span>操作</span>
      </div>
      <div v-for="task in taskRows" :key="task.id" class="task-table-row">
        <span><input v-model="selectedIds" type="checkbox" :value="task.id" /></span>
        <span class="task-name"><b>{{ task.name }}</b><small>{{ task.taskNo }}</small></span>
        <span><em class="scene-tag">{{ task.sceneName }}</em></span>
        <span><em class="status-tag" :class="taskStatusClass(task)">{{ task.taskStatusDesc }}</em></span>
        <span class="task-owner"><b>{{ task.deptName }}</b><small v-if="task.assigneeName || task.assigneeId">{{ task.assigneeName || `负责人 #${task.assigneeId}` }}</small></span>
        <span class="task-created">{{ formatTime(task.createTime) }}</span>
        <span class="task-range">
          <TaskRangeThumbnail v-if="taskRangeGeometries[task.id]" :geo-json="taskRangeGeometries[task.id]!" />
          <i v-else class="range-thumb range-thumb--empty" :title="taskRangePreviewLoading ? '正在读取真实任务范围' : '暂无任务范围'">{{ taskRangePreviewLoading ? '…' : '—' }}</i>
        </span>
        <span><TaskWorkflowProgress :task="task" compact /></span>
        <span class="task-actions"><button @click="openTask(task)">查看</button></span>
      </div>
      <div v-if="taskLoading" class="empty-tasks">正在加载真实任务数据…</div>
      <div v-if="taskError" class="empty-tasks task-load-error">{{ taskError }}</div>
      <div v-else-if="!taskRows.length" class="empty-tasks">当前筛选条件下暂无任务</div>
    </section>
    <footer class="task-pagination"><span>共 <b>{{ taskTotal }}</b> 条记录　每页显示 <b>{{ requestPageSize }}</b> 条</span><div class="page-controls"><button :disabled="currentPage === 1" @click="setPage(currentPage - 1)">‹</button><template v-for="(item, index) in paginationItems" :key="`${item}-${index}`"><span v-if="item === 'ellipsis'">…</span><button v-else :class="{ active: currentPage === item }" @click="setPage(item)">{{ item }}</button></template><button :disabled="currentPage === pageCount" @click="setPage(currentPage + 1)">›</button><label>前往 <input v-model="gotoPage" inputmode="numeric" @keyup.enter="applyGoToPage" @blur="applyGoToPage" /> 页</label></div></footer>
    <NewTaskDialog v-model="newTaskVisible" :scene-id="sceneFilter || undefined" :scenes="sceneOptions" @created="handleCreated" />
    <div v-if="deleteConfirmVisible" class="delete-confirm-mask" @click.self="!deleteLoading && (deleteConfirmVisible = false)">
      <section class="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title">
        <h3 id="delete-confirm-title">确认批量删除</h3>
        <p>将永久删除已勾选的 <b>{{ selectedIds.length }}</b> 个任务及其关联范围、影像关联信息。此操作无法恢复。</p>
        <ul><li v-for="name in selectedTaskNames.slice(0, 5)" :key="name">{{ name }}</li><li v-if="selectedTaskNames.length > 5">另有 {{ selectedTaskNames.length - 5 }} 个任务</li></ul>
        <p v-if="deleteError" class="dialog-delete-error">{{ deleteError }}</p>
        <footer><button :disabled="deleteLoading" @click="deleteConfirmVisible = false">取消</button><button class="confirm-danger" :disabled="deleteLoading" @click="confirmBatchDelete">{{ deleteLoading ? '正在删除…' : '确认删除' }}</button></footer>
      </section>
    </div>
  </TaskCenterLayout>
</template>

<style scoped lang="scss">
.primary-action { padding: 9px 18px; color: white; background: #087fe7; border: 1px solid #2fa9ff; box-shadow: 0 0 10px #138deb66; cursor: pointer; }
.task-filters { height: 58px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)) auto; gap: 10px; align-items: end; padding: 7px 10px; background: linear-gradient(90deg,#04233d,#031a30); border: 1px solid #0c5278; }.task-filters label { display: grid; gap: 4px; color: #7fa7b7; font-size: 14px; }.task-filters select,.task-filters input { height: 29px; padding: 0 8px; color: #bfe3ed; background: #03182d; border: 1px solid #124e70; outline: 0; font-size: 14px; }.search-box { height: 29px; display: flex; align-items: center; gap: 7px; padding: 0 9px; color: #5bd9eb; background: #03182d; border: 1px solid #155a7e; }.search-box input { flex: 1; border: 0; padding: 0; }.filter-action { align-self: end; height: 29px; white-space: nowrap; }
.task-table { margin-top: 6px; border: 1px solid #0b5278; background: #031a30; }.task-table-row { min-height: 61px; display: grid; grid-template-columns: 30px 1.45fr .85fr .65fr 1fr .7fr .9fr 1.35fr 1.05fr; align-items: center; border-bottom: 1px solid #0a405e; }.task-table-row>span { min-width: 0; padding: 6px 8px; color: #8eb4c2; font-size: 14px; }.task-table-head { min-height: 34px; color: #a9cfdb; background: #074166; }.task-name b,.task-name small,.task-owner b,.task-owner small,.task-table-row>span>small { display: block; }.task-name b,.task-owner b { overflow: hidden; color: #d0edf4; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }.task-name small,.task-owner small,.task-table-row>span>small { margin-top: 4px; color: #557f91; font-size: 12px; }.scene-tag,.status-tag { padding: 4px 6px; color: #70e4f1; background: #07516c; border: 1px solid #0b718c; font-style: normal; font-size: 12px; }.status-tag.done { color: #51eab8; border-color: #16795f; background: #075643; }.status-tag.pending { color: #ffd06c; border-color: #93691b; background: #63470d; }.range-thumb { width: 42px; height: 29px; float: left; margin-right: 5px; background: linear-gradient(145deg,#156c78,#173c4d); border: 1px solid #167492; }.range-thumb--empty { display: grid; place-items: center; color: #5e8ca1; font-style: normal; font-size: 16px; }.workflow-mini { display: flex; align-items: center; gap: 5px; }.workflow-mini i { width: 10px; height: 10px; border: 1px solid #38647a; border-radius: 50%; }.workflow-mini i.done { background: #20d8b0; border-color: #20d8b0; }.workflow-mini i.active { background: #168ff0; border-color: #58baff; box-shadow: 0 0 6px #168ff0; }.task-actions { display: flex; gap: 5px; }.task-actions button { padding: 5px 8px; color: #bdeeff; background: #087dd4; border: 1px solid #259ef0; font-size: 12px; cursor: pointer; }.task-actions button+button { background: #063354; }.empty-tasks { padding: 60px; color: #628ca0; text-align: center; }
.task-pagination { display: flex; justify-content: space-between; align-items: center; padding: 12px 8px; color: #7199aa; font-size: 14px; }.task-pagination button { width: 24px; height: 24px; margin-left: 4px; color: #74a7bb; background: #04213b; border: 1px solid #145170; }.task-pagination button.active { color: white; background: #087ee0; border-color: #25a1f0; }

/* Repository-inspired controls, card rhythm, and readable task records. */
.primary-action { height: 42px; padding: 0 22px; border-radius: 4px; font-size: 16px; font-weight: 700; background: linear-gradient(135deg, #526aff, #00a6fc); box-shadow: 0 0 13px #008dff88; }.task-filters { height: 84px; grid-template-columns: repeat(3, minmax(0, 1fr)) 220px minmax(0, 1fr) auto; gap: 14px; align-items: end; padding: 14px 18px; border-color: #0d79b9; border-radius: 5px; background: #071d3de0; box-shadow: inset 0 0 24px #0563aa20; }.task-filters label { gap: 6px; color: #b3d5ef; font-size: 15px; }.task-filters select,.task-filters label>input,.search-box { height: 36px; border-color: #238dd1; border-radius: 4px; font-size: 15px; }.task-filters select,.task-filters label>input { padding-inline: 10px; }.search-box { gap: 9px; padding-inline: 12px; }.search-box input { height: 100%; padding: 0; border: 0; background: transparent; }.search-box:first-letter { font-size: 23px; }.task-filters .filter-action { height: 36px; padding-inline: 18px; font-size: 15px; }
.task-table { margin-top: 12px; overflow: hidden; border-color: #1477b2; border-radius: 5px; background: #071d3de0; }.task-table-row { min-height: 72px; grid-template-columns: 30px 1.35fr 1.1fr .65fr .8fr .75fr .75fr 2.05fr 1.1fr; }.task-table-row>span { padding: 8px 10px; color: #b6d4e4; font-size: 15px; }.task-table-head { min-height: 42px; color: #d8efff; background: linear-gradient(90deg, #074b78, #06365f); font-size: 16px; }.task-name b,.task-owner b { font-size: 16px; }.task-name small,.task-owner small,.task-table-row>span>small { font-size: 13px; }.task-created { white-space: nowrap; }.task-range { display: flex; align-items: center; gap: 7px; }.task-range .range-thumb { float: none; flex: 0 0 auto; margin: 0; }.task-range small { margin-top: 0; }.scene-tag,.status-tag { padding: 5px 8px; border-radius: 3px; font-size: 13px; }.scene-tag { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }.flight-association { display: inline-block; white-space: nowrap; }.range-thumb { width: 45px; height: 31px; }.task-actions { gap: 7px; }.task-actions button { padding: 7px 9px; border-radius: 3px; font-size: 13px; }
.workflow-mini { position: relative; min-width: 0; display: grid; align-items: start; gap: 0; padding-top: 2px; }.workflow-step { position: relative; min-width: 0; display: grid; grid-template-rows: 19px auto; justify-items: center; color: #7598ad; }.workflow-step:not(:first-child)::before { content: ""; position: absolute; z-index: 0; top: 8px; right: calc(50% + 8.5px); width: calc(100% - 17px); height: 2px; background: #3c6680; }.workflow-step.done::before { background: #20d8b0; box-shadow: 0 0 5px #20d8b088; }.workflow-step.active::before { background: linear-gradient(90deg, #20d8b0, #239eff); }.workflow-step i { position: relative; z-index: 1; width: 17px; height: 17px; display: grid; place-items: center; border: 2px solid #6589a2; border-radius: 50%; color: #fff; background: #09233d; font-size: 10px; font-style: normal; line-height: 1; }.workflow-step.done i { border-color: #21dbb1; background: #21dbb1; box-shadow: 0 0 7px #21dbb188; }.workflow-step.active i { border-color: #5bc9ff; background: #168ff0; box-shadow: 0 0 8px #168ff0; }.workflow-step small { width: calc(100% - 2px); margin-top: 4px; overflow: hidden; color: inherit; font-size: 11px; line-height: 1.15; text-align: center; text-overflow: ellipsis; white-space: nowrap; }.workflow-step.done small,.workflow-step.active small { color: #d3f3ff; }
.task-pagination { padding: 16px 4px; color: #a9c6db; font-size: 15px; }.task-pagination button { width: 31px; height: 31px; border-radius: 4px; font-size: 14px; }
.task-pagination b { color: #37cbff; }.task-pagination select { min-height: 31px; margin: 0 5px; padding: 0 26px 0 9px; border: 1px solid #28587f; border-radius: 4px; color: #e7f7ff; background: #0b294a; font-size: 14px; }.task-pagination button:disabled { opacity: .4; cursor: not-allowed; }.page-controls { display: flex; align-items: center; }.page-controls label { margin-left: 18px; }.page-controls input { width: 38px; height: 29px; margin: 0 4px; border: 1px solid #2d6693; border-radius: 3px; color: white; background: #0a2949; font-size: 14px; text-align: center; }
.scene-dictionary-error { margin: 8px 2px 0; color: #ffb3a7; font-size: 13px; }
.batch-box { position: relative; }.batch-box button:disabled { opacity: .55; cursor: wait; }.batch-error { position: absolute; top: calc(100% + 5px); right: 0; z-index: 4; width: max-content; max-width: 270px; padding: 5px 7px; color: #ffd0d4; background: #4a1523; border: 1px solid #a34859; font-size: 11px; line-height: 1.4; }.delete-confirm-mask { position: fixed; z-index: 2100; inset: 0; display: grid; place-items: center; background: #000a16aa; backdrop-filter: blur(2px); }.delete-confirm-dialog { width: min(440px, calc(100vw - 32px)); padding: 0; overflow: hidden; color: #ccecf5; background: #052540; border: 1px solid #168bbc; border-radius: 5px; box-shadow: 0 12px 36px #000b1fe0, 0 0 20px #078ac44d; }.delete-confirm-dialog h3 { margin: 0; padding: 15px 19px; color: #effbff; background: linear-gradient(90deg, #124e78, #07385e); border-bottom: 1px solid #176f98; font-size: 17px; }.delete-confirm-dialog p,.delete-confirm-dialog ul { margin: 14px 19px; color: #9fc6d4; font-size: 14px; line-height: 1.7; }.delete-confirm-dialog p b { color: #ff8d9b; }.delete-confirm-dialog ul { max-height: 116px; padding-left: 20px; overflow-y: auto; color: #d0ebf3; }.delete-confirm-dialog li+li { margin-top: 4px; }.delete-confirm-dialog footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 19px; border-top: 1px solid #115672; }.delete-confirm-dialog footer button { min-width: 86px; padding: 8px 14px; color: #b9dce8; background: #062943; border: 1px solid #196181; cursor: pointer; }.delete-confirm-dialog footer .confirm-danger { color: #fff; background: #b7344a; border-color: #f16276; box-shadow: 0 0 9px #d63c5366; }.delete-confirm-dialog footer button:disabled { opacity: .6; cursor: wait; }.dialog-delete-error { color: #ffadb7!important; background: #4a1523; border-left: 2px solid #ec5266; }
.task-date-filter { width: 220px !important; min-width: 220px; }.task-date-filter.el-date-editor { height: 36px; background: transparent; border: 0; border-radius: 4px; box-shadow: none; }.task-date-filter .el-input__wrapper { min-height: 36px; padding: 0 10px; background: #03182d; border: 1px solid #238dd1; border-radius: 4px; box-shadow: inset 0 0 12px #086ba51c; }.task-date-filter.el-date-editor:hover .el-input__wrapper,.task-date-filter.el-date-editor.is-focus .el-input__wrapper { border-color: #41b7f0; box-shadow: 0 0 0 1px #41b7f044, inset 0 0 12px #086ba51c; }.task-date-filter .el-input__inner,.task-date-filter .el-input__prefix,.task-date-filter .el-input__suffix,.task-date-filter .el-input__icon { color: #bfe3ed; }.task-date-filter .el-input__inner::placeholder { color: #7496a8; }.task-date-filter .el-input__clear { color: #6fa9c0; }.task-date-filter .el-input__clear:hover { color: #63e0f1; }
:global(.task-date-popper.el-picker__popper) { color: #c8ecf7; background: #052540; border: 1px solid #168bbd; border-radius: 5px; box-shadow: 0 10px 30px #00111ee0, inset 0 0 24px #0878b21f; }
:global(.task-date-popper .el-picker-panel) { color: #c8ecf7; background: transparent; }
:global(.task-date-popper .el-picker-panel__content) { margin: 10px 14px; }
:global(.task-date-popper .el-date-picker__header) { margin: 12px; }
:global(.task-date-popper .el-date-picker__header-label),:global(.task-date-popper .el-picker-panel__icon-btn) { color: #d7f7ff; }
:global(.task-date-popper .el-picker-panel__icon-btn:hover),:global(.task-date-popper .el-date-picker__header-label:hover) { color: #4fddfa; }
:global(.task-date-popper .el-date-table th) { color: #70aebe; border-bottom-color: #146184; }
:global(.task-date-popper .el-date-table td),:global(.task-date-popper .el-date-table td.available) { color: #bfe5ef; }
:global(.task-date-popper .el-date-table td.prev-month),:global(.task-date-popper .el-date-table td.next-month) { color: #47788d; }
:global(.task-date-popper .el-date-table td.available:hover) { color: #fff; }
:global(.task-date-popper .el-date-table td.available:hover .el-date-table-cell__text) { background: #0d6d9c; }
:global(.task-date-popper .el-date-table td.today .el-date-table-cell__text) { color: #54e4f7; }
:global(.task-date-popper .el-date-table td.current:not(.disabled) .el-date-table-cell__text) { color: #001a2c; background: #3dd6ed; box-shadow: 0 0 9px #35d9ef99; }
:global(.task-date-popper .el-date-table-cell) { height: 34px; }
:global(.task-date-popper .el-date-table-cell__text) { width: 28px; height: 28px; line-height: 28px; }
:global(.task-date-popper .el-picker__popper-arrow::before) { background: #052540; border-color: #168bbd; }
.task-progress { display: flex; align-items: center; gap: 8px; color: #88adc1; }.task-progress i { width: 10px; height: 10px; border: 1px solid #6589a2; border-radius: 50%; }.task-progress.running i { background: #168ff0; border-color: #5bc9ff; box-shadow: 0 0 7px #168ff0; }.task-progress.done i { background: #21dbb1; border-color: #21dbb1; }.task-progress.pending i { background: #d59a24; border-color: #ffc85a; }.task-progress.failed i { background: #ff6574; border-color: #ff8d99; }.task-progress small { font-size: 13px; }.task-actions button:disabled { opacity: .45; cursor: not-allowed; }
@media (max-height: 820px) { .task-table-row { min-height: 51px; }.task-filters { height: auto; } }
/* Tables keep their data columns readable; horizontal overflow belongs to the table, not the page. */
.task-table { overflow: auto; }
.task-table-row { min-width: 1000px; }
@media (max-width: 1180px) {
  .task-filters { height: auto; grid-template-columns: repeat(3, minmax(0,1fr)); align-items: end; }.task-filters .search-box { grid-column: span 3; }
  .task-pagination { gap: 10px; flex-wrap: wrap; }.page-controls { flex-wrap: wrap; }
}

/* TaskCenterLayout light, compact list treatment. */
.heading-actions { display: flex; align-items: center; gap: 10px; }
.primary-action { height: 34px; padding: 0 15px; border: 1px solid #1880c8; border-radius: 4px; background: #2389d3; box-shadow: none; font-size: 13px; }
.batch-delete { height: 34px; padding: 0 14px; color: #b65454; background: #fff; border: 1px solid #e2b8b8; border-radius: 4px; cursor: pointer; }
.batch-delete:disabled { opacity: .45; cursor: not-allowed; }
.task-filters { height: auto; grid-template-columns: 1.35fr repeat(4, minmax(150px, 1fr)); gap: 12px; padding: 14px 16px; background: #fff; border: 1px solid #e1e7ed; border-radius: 6px; box-shadow: 0 2px 10px #2449690a; }
.task-filters label { color: #65788b; font-size: 12px; }
.task-filters select, .task-filters input, .search-box { height: 34px; color: #32485e; background: #fff; border-color: #d8e0e7; border-radius: 4px; font-size: 12px; }
.task-filters select { color-scheme: light; }
.task-filters select option { color: #32485e; background: #fff; }
.task-filters select:not(:disabled):hover { color: #32485e !important; background-color: #fff !important; }
.search-box { color: #7e91a4; }
.department-filter { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.department-filter select { min-width: 0; width: 100%; }
.task-table { margin-top: 14px; border-color: #dfe6ec; background: #fff; border-radius: 6px; box-shadow: 0 2px 10px #2449690a; }
.task-table-row { min-height: 62px; border-bottom-color: #edf1f4; }
.task-table-row > span { color: #5f7184; font-size: 12px; }
.task-table-head { min-height: 40px; color: #526579; background: #f5f8fa; }
.task-name b, .task-owner b { color: #32485e; font-size: 13px; }
.task-name small, .task-owner small, .task-table-row > span > small { color: #99a6b2; font-size: 11px; }
.scene-tag { color: #397cae; background: #edf6fc; border-color: #c6e1f3; }
.status-tag { max-width: 100%; box-sizing: border-box; display: inline-block; color: #367eb5; background: #edf6fc; border-color: #c6e1f3; line-height: 1.4; white-space: normal; overflow-wrap: anywhere; }
.task-table-row > span:nth-child(4) { min-width: 0; overflow: hidden; white-space: normal; }
.status-tag.done { color: #258965; background: #eaf7f1; border-color: #bfe7d7; }
.status-tag.pending { color: #b4772d; background: #fff6e8; border-color: #f0d6ad; }
.task-actions button { color: #277ebd; background: #fff; border-color: #bcd8eb; border-radius: 4px; }
.task-actions button:hover { color: #fff; background: #2789cf; border-color: #2789cf; }
.task-pagination { color: #758699; }
.task-pagination b { color: #2c85c6; }
.task-pagination button { color: #617488; background: #fff; border-color: #d6dfe7; }
.task-pagination button.active { color: #fff; background: #318ed3; border-color: #318ed3; }
.page-controls input { color: #344a60; background: #fff; border-color: #d6dfe7; }
.empty-tasks { color: #95a2af; }
.scene-dictionary-error { color: #b75a5a; }
.delete-confirm-dialog { color: #53677a; background: #fff; border-color: #d9e2e9; box-shadow: 0 14px 40px #253c5030; }
.delete-confirm-dialog h3 { color: #2e4358; background: #f5f8fa; border-bottom-color: #e1e8ee; }
.delete-confirm-dialog p, .delete-confirm-dialog ul { color: #65788b; }
.delete-confirm-dialog footer { border-top-color: #e7edf2; }
.delete-confirm-dialog footer button { color: #607386; background: #fff; border-color: #d5dfe7; }
@media (max-width: 1320px) {
  .task-filters { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>
