<script setup lang="ts">
import TaskHistory from '@/components/task-center/TaskHistory.vue'
import { projectTaskListWorkflow } from '@/utils/task-list-workflow'
import { workflowNodeDisplayName } from '@/utils/task-workflow-state'
import { getTaskWorkflow, type TaskWorkflow } from '@/api/task-workflow'
import { taskImageryService } from '@/utils/task-imagery'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CockpitPageLayout from '@/layouts/CockpitPageLayout.vue'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import NewTaskDialog from '@/components/NewTaskDialog.vue'
import { cancelGovernanceTask, executeGovernanceTask, finishGovernanceTask, getGovernanceTaskDetail, getGovernanceTaskOperateLogs, getGovernanceTaskGeometry, getTaskAbnormalPage, taskPriorityLabel } from '@/api/governance-task'
import type { GovernanceTaskDetail, GovernanceTaskOperateLog, TaskAbnormal, TaskGeometryFeatureCollection } from '@/api/governance-task'

const route = useRoute()
const router = useRouter()
const detail = ref<GovernanceTaskDetail>()
const geometry = ref<TaskGeometryFeatureCollection>({ type: 'FeatureCollection', features: [] })
const loading = ref(false)
const error = ref('')
const abnormalRecords = ref<TaskAbnormal[]>([])
// 表格只保留当前页；地图单独保存当前任务的全部异常点，翻页不改变地图内容。
const mapAbnormalRecords = ref<TaskAbnormal[]>([])
const abnormalTotal = ref(0)
const abnormalPage = ref(1)
const abnormalLoading = ref(false)
const abnormalError = ref('')
const abnormalType = ref('')
const abnormalHandleStatus = ref<number | ''>('')
const abnormalKeyword = ref('')
const activeAbnormalId = ref('')
const taskMapView = ref<{ center: [number, number]; zoom: number }>()
// 只有任务范围和全部异常图斑均完成加载后才递增，作为地图联合缩放的明确触发信号。
const taskMapFitRequest = ref(0)
const previewAbnormal = ref<TaskAbnormal>()
const editVisible = ref(false)
const actionLoading = ref(false)
const actionError = ref('')
const pendingAction = ref<'execute' | 'cancel' | 'finish'>()
let mapAbnormalRequestVersion = 0
let taskRequestVersion = 0
let abnormalRequestVersion = 0
const task = computed(() => detail.value?.task)
const abnormalPageCount = computed(() => Math.max(1, Math.ceil(abnormalTotal.value / 10)))
const logs = ref<GovernanceTaskOperateLog[]>([])
const logsLoading = ref(false)
const logsError = ref('')
let logsRequestVersion = 0
const flow = ref<TaskWorkflow>()
const displayedTask = computed(() => task.value ? projectTaskListWorkflow(task.value, flow.value) : undefined)
const basicFields = computed<Array<[string, unknown]>>(() => [
  ['任务编号', task.value?.taskNo], ['所属部门', task.value?.deptName], ['业务场景', task.value?.sceneName],
  ['当前状态', displayedTask.value?.taskStatusDesc], ['任务说明', task.value?.description],
  ['当前节点', flow.value?.currentNode ? workflowNodeDisplayName(flow.value.currentNode, task.value?.sceneCode || '') : undefined],
  ['当前办理人', flow.value?.currentNode?.assigneeName], ['办理部门', flow.value?.currentNode?.deptName],
  ['办理期限', formatTime(flow.value?.currentNode?.deadline)],
  ['执行方式', task.value?.executeMode === 'AUTO' ? '自动执行' : '手动执行'],
  ['负责人', task.value?.assigneeName || (task.value?.assigneeId ? `用户 #${task.value.assigneeId}` : undefined)],
  ['联系人', task.value?.contactName], ['联系电话', task.value?.contactPhone],
  ['范围名称', task.value?.rangeName], ['范围面积', task.value?.rangeArea == null ? undefined : `${task.value.rangeArea} ${task.value.rangeAreaUnit || '㎡'}`],
  ['成果要求', task.value?.resultRequirements?.join('、')],
  ['关联类型', ({ NONE: '无关联', PLAN: '飞行计划', TASK: '飞行任务' } as Record<string, string>)[task.value?.refType || ''] || task.value?.refType],
  ['关联信息', detail.value?.refSummary], ['关联对象', task.value?.refId],
  ['计划开始', formatTime(task.value?.planStartTime)], ['计划结束', formatTime(task.value?.planEndTime)],
  ['实际开始', formatTime(task.value?.actualStartTime)], ['实际结束', formatTime(task.value?.actualEndTime)],
  ['创建时间', formatTime(task.value?.createTime)], ['更新时间', formatTime(task.value?.updateTime)],
  ['内部备注', detail.value?.process?.remark],
])
const editScenes = computed(() => task.value ? [{
  id: task.value.sceneCode,
  code: task.value.sceneCode,
  name: task.value.sceneName,
  shortName: task.value.sceneName,
  description: '',
  enabled: true,
}] : [])

function formatTime(value?: string) {
  return value ? value.replace('T', ' ').replace(/\.\d{3}Z?$/, '') : '-'
}

function statusClass(status?: number) {
  if (status === 5) return 'done'
  if (status === 0 || status === 2) return 'pending'
  if (status === 3 || status === 4) return 'failed'
  return 'running'
}

function abnormalStatusLabel(status: number) {
  return ['待核查', '核查中', '已处置', '已销号'][status] || '未知状态'
}

const actionLabels = { execute: '执行任务', cancel: '取消任务', finish: '核查完成' } as const
const actionMessages = {
  execute: '确认将任务状态从“待执行”变更为“执行中”？',
  cancel: '确认取消该任务？取消后不能再编辑或执行。',
  finish: '确认核查通过并完成该任务？完成后不能再编辑。',
} as const

function requestTaskAction(action: 'execute' | 'cancel' | 'finish') {
  if (!task.value || actionLoading.value) return
  actionError.value = ''
  pendingAction.value = action
}

async function runTaskAction() {
  const action = pendingAction.value
  if (!task.value || !action || actionLoading.value) return
  actionLoading.value = true
  actionError.value = ''
  try {
    if (action === 'execute') await executeGovernanceTask(task.value.id, undefined, task.value.deptId)
    if (action === 'cancel') await cancelGovernanceTask(task.value.id, task.value.deptId)
    if (action === 'finish') await finishGovernanceTask(task.value.id, task.value.deptId)
    await loadTask()
    pendingAction.value = undefined
  } catch (reason) {
    actionError.value = `${actionLabels[action]}失败：${reason instanceof Error ? reason.message : '请稍后重试。'}`
  } finally {
    actionLoading.value = false
  }
}

function handleTaskUpdated() {
  editVisible.value = false
  void loadTask()
}

async function loadTask() {
  const taskId = String(route.params.taskId || '')
  if (!taskId) return
  const version = ++taskRequestVersion
  abnormalRequestVersion += 1
  detail.value = undefined
  geometry.value = { type: 'FeatureCollection', features: [] }
  abnormalRecords.value = []; abnormalTotal.value = 0; abnormalPage.value = 1; activeAbnormalId.value = ''
  flow.value = undefined
  const logVersion = ++logsRequestVersion
  logs.value = []
  logsError.value = ''
  logsLoading.value = false
  mapAbnormalRequestVersion += 1
  mapAbnormalRecords.value = []
  // 从任务列表进入、或从工作台返回另一任务时，不能沿用上一任务的地图视野。
  taskMapView.value = undefined
  loading.value = true
  error.value = ''
  try {
    // 任务范围属于辅助地图数据，不能因其响应变慢而使整个任务详情页不可用。
    const [detailResult, geometryResult] = await Promise.allSettled([
      getGovernanceTaskDetail(taskId),
      getGovernanceTaskGeometry(taskId, undefined, false),
    ])
    if (version !== taskRequestVersion) return
    if (detailResult.status === 'rejected') throw detailResult.reason
    const nextDetail = detailResult.value
    detail.value = nextDetail
    geometry.value = geometryResult.status === 'fulfilled'
      ? geometryResult.value
      : { type: 'FeatureCollection', features: [] }
    if (!nextDetail) error.value = '未找到该任务或当前账号无查看权限。'
    else {
      if (logVersion === logsRequestVersion) void loadOperateLogs(taskId, nextDetail.task.deptId, logVersion)
      void loadAbnormals(taskId)
      void loadAllMapAbnormals(taskId)
    }
  } catch (reason) {
    if (version !== taskRequestVersion) return
    detail.value = undefined
    geometry.value = { type: 'FeatureCollection', features: [] }
    error.value = reason instanceof Error ? reason.message : '任务详情加载失败，请稍后重试。'
  } finally {
    if (version === taskRequestVersion) loading.value = false
  }
}

async function loadOperateLogs(taskId: string, deptId: string | undefined, version: number) {
  logsLoading.value = true
  try {
    const results = await Promise.allSettled([getGovernanceTaskOperateLogs(taskId, deptId), getTaskWorkflow(taskId)])
    if (version !== logsRequestVersion) return
    const [logResult, flowResult] = results
    if (logResult.status === 'fulfilled') logs.value = logResult.value
    if (flowResult.status === 'fulfilled') flow.value = flowResult.value
    logsError.value = results.flatMap((result, index) => result.status === 'rejected' ? [`${index ? '节点办理结果' : '操作留痕'}加载失败：${result.reason instanceof Error ? result.reason.message : '请稍后重试'}`] : []).join('；')
  } finally {
    if (version === logsRequestVersion) logsLoading.value = false
  }
}

/**
 * 地图不受下方表格分页限制：分批读取此任务的全部异常记录并合并点位。
 * 使用较小批次兼容后端可能存在的 pageSize 上限。
 */
async function loadAllMapAbnormals(taskId: string) {
  const requestVersion = ++mapAbnormalRequestVersion
  // 当前后端对该接口单次最多返回 10 条；按限制逐页拉取，避免整页请求失败导致地图没有图斑。
  const mapPageSize = 10
  try {
    const firstPage = await getTaskAbnormalPage({ bizTaskId: taskId, pageNum: 1, pageSize: mapPageSize })
    const pageCount = Math.ceil(firstPage.total / mapPageSize)
    const allRecords = [...firstPage.records]
    // 逐页而非并发拉取：部分后端对同一任务的连续分页查询会串行执行。
    // 某页异常不能丢弃此前已成功读取的异常图斑与地图点位。
    for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
      if (requestVersion !== mapAbnormalRequestVersion) return
      try {
        const page = await getTaskAbnormalPage({ bizTaskId: taskId, pageNum, pageSize: mapPageSize })
        allRecords.push(...page.records)
      } catch {
        // 保留已加载页；下次进入任务或刷新时会再次尝试该页。
      }
    }
    if (requestVersion !== mapAbnormalRequestVersion) return
    mapAbnormalRecords.value = allRecords
  } catch {
    if (requestVersion === mapAbnormalRequestVersion) mapAbnormalRecords.value = []
  } finally {
    // 先加载到任务范围是正常的；异常分页全部结束后，再以当前地图图层的真实边界强制重算。
    if (requestVersion === mapAbnormalRequestVersion) taskMapFitRequest.value += 1
  }
}

async function loadAbnormals(taskId = String(route.params.taskId || '')) {
  if (!taskId) return
  const version = ++abnormalRequestVersion
  abnormalLoading.value = true
  abnormalError.value = ''
  try {
    const page = await getTaskAbnormalPage({
      bizTaskId: taskId,
      pageNum: abnormalPage.value,
      pageSize: 10,
      abnormalType: abnormalType.value || undefined,
      handleStatus: abnormalHandleStatus.value === '' ? undefined : abnormalHandleStatus.value,
      keyword: abnormalKeyword.value || undefined,
    })
    if (version !== abnormalRequestVersion) return
    abnormalRecords.value = page.records
    abnormalTotal.value = page.total
    if (!page.records.some((item) => item.id === activeAbnormalId.value)) activeAbnormalId.value = ''
  } catch (reason) {
    if (version !== abnormalRequestVersion) return
    abnormalRecords.value = []
    abnormalTotal.value = 0
    abnormalError.value = reason instanceof Error ? reason.message : '异常图斑加载失败。'
  } finally {
    if (version === abnormalRequestVersion) abnormalLoading.value = false
  }
}

function selectAbnormal(item: TaskAbnormal) {
  activeAbnormalId.value = item.id
}

function syncTaskMapView(view: { center: [number, number]; zoom: number }) {
  taskMapView.value = view
}

watch([abnormalType, abnormalHandleStatus, abnormalKeyword], () => {
  abnormalPage.value = 1
  if (task.value) void loadAbnormals()
})

watch(() => route.params.taskId, () => {
  void loadTask()
})
onMounted(() => void loadTask())
</script>

<template>
  <CockpitPageLayout title="低空治理任务详情" back-to="/tasks/list">
    <div v-if="loading" class="task-not-found"><h2>正在加载真实任务详情…</h2></div>
    <div v-else-if="error || !task" class="task-not-found"><h2>{{ error || '未找到任务' }}</h2><button @click="router.push('/tasks/list')">返回任务列表</button></div>
    <div v-else class="detail-layout">
      <aside class="detail-left">
        <section class="detail-panel basic-info">
          <div class="detail-title">任务基本信息<button v-if="task.taskStatus !== 4 && task.taskStatus !== 5" @click="editVisible = true">编辑</button></div>
          <div class="basic-scroll" tabindex="0" aria-label="任务基本信息，可滚动查看"><h2>{{ task.name }}</h2><div class="basic-badges"><em>{{ taskPriorityLabel(task.priority) }}优先级</em><em :class="statusClass(displayedTask?.taskStatus)">{{ displayedTask?.taskStatusDesc }}</em></div>
          <dl><template v-for="[label, value] in basicFields" :key="label"><dt>{{ label }}</dt><dd>{{ value == null || value === '' ? '暂无数据' : value }}</dd></template></dl></div>
        </section>
      </aside>

      <main class="detail-main">
        <div class="detail-summary-row">
          <section class="metric-grid">
            <article><i>◷</i><span>任务状态<b>{{ displayedTask?.taskStatusDesc }}</b></span></article>
            <article><i>!</i><span>异常 / 图斑<b>{{ detail?.abnormalCount ?? 0 }}<small>个</small></b></span></article>
            <article><i>△</i><span>异常面积<b>{{ detail?.abnormalArea ?? 0 }}<small>㎡</small></b></span></article>
            <article><i>⌖</i><span>范围要素<b>{{ geometry.features.length }}<small>个</small></b></span></article>
          </section>
          <div class="task-action-toolbar"><button class="enter-workspace" @click="router.push('/tasks/list')">返回任务列表</button><template ><button v-if="task.taskStatus !== 4 && task.taskStatus !== 5" class="task-action-edit" @click="editVisible = true">编辑任务</button><button v-if="task.taskStatus === 0" class="task-action-primary" :disabled="actionLoading" @click="requestTaskAction('execute')">执行任务</button><button v-if="task.taskStatus === 0 || task.taskStatus === 1" class="task-action-danger" :disabled="actionLoading" @click="requestTaskAction('cancel')">取消任务</button><button v-if="task.taskStatus === 2" class="task-action-primary" :disabled="actionLoading" @click="requestTaskAction('finish')">核查完成</button></template></div>
        </div>
        <section class="map-info-grid">
          <article class="detail-panel task-map-panel"><div class="task-map-compare"><section class="task-map-compare__pane"><header>任务范围与异常图斑</header><TaskRangeMap :geo-json="geometry" :abnormal-points="mapAbnormalRecords" :active-abnormal-id="activeAbnormalId" :fit-abnormal-points="true" :auto-fit="false" :fit-request="taskMapFitRequest" show-dom-imagery :imagery-service="taskImageryService(task?.comparisonImages, 'history')" :view="taskMapView" @view-change="syncTaskMapView" /></section><section class="task-map-compare__pane"><header>异常图斑</header><TaskRangeMap :geo-json="geometry" :abnormal-points="mapAbnormalRecords" :active-abnormal-id="activeAbnormalId" :show-task-range="false" :abnormal-fill-opacity="0" :show-dom-imagery="true" :imagery-service="taskImageryService(task?.comparisonImages)" :auto-fit="false" :view="taskMapView" @view-change="syncTaskMapView" /></section></div></article>
        </section>
        <section class="detail-bottom">
          <section class="detail-panel abnormal-panel">
          <div class="abnormal-filters"><select v-model="abnormalType"><option value="">全部类型</option><option value="ILLEGAL_OCCUPY">违法占用</option><option value="FOREST_DAMAGE">林地破坏</option><option value="NON_GRAIN">非粮化</option><option value="ABANDONED">撂荒</option><option value="ILLEGAL_BUILD">违法建设</option><option value="OTHER">其他</option></select><select v-model="abnormalHandleStatus"><option value="">全部处置状态</option><option :value="0">待核查</option><option :value="1">核查中</option><option :value="2">已处置</option><option :value="3">已销号</option></select><input v-model="abnormalKeyword" placeholder="搜索图斑标题或描述" /><button @click="loadAbnormals()">查询</button></div>
          <div class="abnormal-table"><div class="abnormal-row abnormal-head"><span>异常图斑信息</span><span>类型 / 等级</span><span>面积（㎡）</span><span>处置状态</span><span>发现时间</span><span>关联影像</span></div><button v-for="(item, index) in abnormalRecords" :key="item.id" class="abnormal-row" :class="{ active: activeAbnormalId === item.id }" @click="selectAbnormal(item)"><span><b>{{ (abnormalPage - 1) * 10 + index + 1 }}. {{ item.title }}</b><small>{{ item.description || `图斑 #${item.id}` }}</small></span><span><em :class="`level-${item.abnormalLevel}`">{{ item.abnormalTypeDesc }}</em><small>{{ ['一般', '较重', '严重'][item.abnormalLevel - 1] || '一般' }}</small></span><span>{{ item.area ?? '-' }}</span><span>{{ abnormalStatusLabel(item.handleStatus) }}</span><span>{{ formatTime(item.foundTime) }}</span><span><img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.title" @click.stop="previewAbnormal = item" /><small v-else>暂无影像</small></span></button><div v-if="abnormalLoading" class="abnormal-empty">正在加载异常图斑…</div><div v-else-if="abnormalError" class="abnormal-empty table-error">异常图斑加载失败：{{ abnormalError }}</div><div v-else-if="!abnormalRecords.length" class="abnormal-empty">当前任务暂无异常图斑</div></div>
          <div class="abnormal-pagination"><span>共 {{ abnormalTotal }} 条</span><button :disabled="abnormalPage === 1" @click="abnormalPage -= 1; loadAbnormals()">上一页</button><b>{{ abnormalPage }} / {{ abnormalPageCount }}</b><button :disabled="abnormalPage >= abnormalPageCount" @click="abnormalPage += 1; loadAbnormals()">下一页</button></div>
          </section>
          <section class="detail-panel records-panel"><TaskHistory :task="task" :logs="logs" :flow="flow" :spots="mapAbnormalRecords" :loading="logsLoading" :error="logsError" dark /></section>
        </section>
      </main>
    </div>
    <p v-if="actionError" class="task-action-error">{{ actionError }}</p>
    <NewTaskDialog v-if="task" v-model="editVisible" :task="task" :scenes="editScenes" @updated="handleTaskUpdated" />
    <div v-if="pendingAction" class="action-confirm-mask" @click.self="!actionLoading && (pendingAction = undefined)">
      <section class="action-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="task-action-confirm-title">
        <header><i>{{ pendingAction === 'cancel' ? '!' : '✓' }}</i><span><b id="task-action-confirm-title">确认{{ actionLabels[pendingAction] }}</b><small>{{ task?.name }}</small></span></header>
        <p>{{ actionMessages[pendingAction] }}</p>
        <p v-if="actionError" class="action-confirm-error">{{ actionError }}</p>
        <footer><button :disabled="actionLoading" @click="pendingAction = undefined">取消</button><button :class="{ danger: pendingAction === 'cancel' }" :disabled="actionLoading" @click="runTaskAction">{{ actionLoading ? '正在提交…' : `确认${actionLabels[pendingAction]}` }}</button></footer>
      </section>
    </div>
    <div v-if="previewAbnormal" class="evidence-preview" @click.self="previewAbnormal = undefined"><article><button class="preview-close" @click="previewAbnormal = undefined">×</button><img v-if="previewAbnormal.imageUrl" :src="previewAbnormal.imageUrl" :alt="previewAbnormal.title" /><div><b>{{ previewAbnormal.title }}</b><small>{{ previewAbnormal.abnormalTypeDesc }} · {{ formatTime(previewAbnormal.foundTime) }}</small></div></article></div>
  </CockpitPageLayout>
</template>

<style scoped lang="scss">
.task-action-toolbar { min-width: 0; height: 100%; display: flex; align-items: stretch; gap: 6px; white-space: nowrap; }.enter-workspace,.enter-patrol,.task-action-edit,.task-action-primary,.task-action-danger { height: 100%; padding: 0 11px; color: white; border: 1px solid #2fa9ff; border-radius: 3px; cursor: pointer; font-size: 13px; }.enter-workspace,.task-action-primary { background: #087fe7; box-shadow: 0 0 8px #138deb55; }.enter-patrol { color: #bff8e9; background: #075d58; border-color: #22bfae; box-shadow: 0 0 8px #16bfa744; }.task-action-edit { color: #bdeeff; background: #063958; border-color: #2581a8; }.task-action-danger { color: #ffc1c8; background: #5d1b2b; border-color: #ba5260; }.task-action-toolbar button:disabled { opacity: .55; cursor: wait; }.task-action-error { margin: 7px 0 0; padding: 8px 12px; color: #ffb3ab; background: #4e19252e; border: 1px solid #893444; font-size: 13px; }
.action-confirm-mask { position: fixed; z-index: 3200; inset: 0; display: grid; place-items: center; padding: 20px; background: #00121acc; backdrop-filter: blur(3px); }.action-confirm-dialog { width: min(430px, calc(100vw - 40px)); overflow: hidden; color: #c7eaf5; background: linear-gradient(145deg,#063454,#031c33); border: 1px solid #1b92c2; border-radius: 5px; box-shadow: 0 14px 40px #000a1ee0, 0 0 24px #078fd060; }.action-confirm-dialog header { display: flex; gap: 11px; align-items: center; padding: 15px 18px; background: linear-gradient(90deg,#095982,#063455); border-bottom: 1px solid #1376a1; }.action-confirm-dialog header i { width: 33px; height: 33px; display: grid; place-items: center; color: #092d43; background: #4de0e9; border-radius: 50%; box-shadow: 0 0 12px #25d6e599; font-style: normal; font-weight: 800; }.action-confirm-dialog header span,.action-confirm-dialog header b,.action-confirm-dialog header small { min-width: 0; display: block; }.action-confirm-dialog header b { color: #e3fbff; font-size: 17px; }.action-confirm-dialog header small { margin-top: 3px; overflow: hidden; color: #8ec5d7; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.action-confirm-dialog>p { margin: 18px; color: #b0d7e4; font-size: 14px; line-height: 1.7; }.action-confirm-dialog footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; background: #03192d; border-top: 1px solid #0b5375; }.action-confirm-dialog footer button { min-width: 92px; padding: 8px 13px; color: #bce6f0; background: #073553; border: 1px solid #19759c; border-radius: 3px; cursor: pointer; }.action-confirm-dialog footer button:last-child { color: #fff; background: #087fe7; border-color: #36aeff; box-shadow: 0 0 9px #0b91e766; }.action-confirm-dialog footer button.danger { background: #922f42; border-color: #ec6678; box-shadow: 0 0 9px #d3425866; }.action-confirm-dialog footer button:disabled { opacity: .6; cursor: wait; }.action-confirm-dialog .action-confirm-error { margin: 0 18px 14px; padding: 8px 10px; color: #ffc0c7; background: #531927; border-left: 2px solid #f05d70; font-size: 13px; }
.detail-layout { height: 100%; min-height: 0; display: grid; grid-template-columns: clamp(240px, 22vw, 310px) minmax(0,1fr); gap: 7px; overflow: hidden; }.detail-left { display: grid; align-content: stretch; grid-template-rows: minmax(0,1fr); gap: 7px; min-height: 0; }.detail-main { min-width: 0; min-height: 0; display: grid; grid-template-rows: clamp(62px, 8vh, 76px) minmax(220px,1fr) minmax(260px,.85fr); gap: 7px; }
.detail-panel { min-width: 0; min-height: 0; overflow: hidden; background: linear-gradient(145deg,#042440,#03182d); border: 1px solid #0c557b; }.detail-title { height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; color: #bce7f2; background: #06385a; border-bottom: 1px solid #0b5477; font-size: 15px; font-weight: bold; }.detail-title button,.detail-title select { padding: 3px 8px; color: #74dcef; background: #052842; border: 1px solid #146284; font-size: 12px; }.detail-title span { color: #278db0; font-size: 12px; }
.basic-info { display:flex;flex-direction:column; }.basic-info>.detail-title{flex-shrink:0}.basic-scroll{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;padding-bottom:12px}.basic-badges{margin:0 12px 9px}.basic-info h2,.basic-info dd{overflow-wrap:anywhere;white-space:pre-wrap;min-width:0}.basic-info dl{grid-template-columns:75px minmax(0,1fr)!important;gap:0 8px}.basic-info h2 { margin: 13px 12px 7px; font-size: 15px; }.basic-info em { margin-right: 5px; padding: 3px 6px; color: #65dded; background: #07516c; border: 1px solid #14718e; font-size: 12px; font-style: normal; }.basic-info dl { display: grid; grid-template-columns: 65px 1fr; margin: 0 12px; }.basic-info dt,.basic-info dd { margin: 0; padding: 5px 0; border-bottom: 1px solid #0a3b56; font-size: 14px; line-height: 1.5; }.basic-info dt { color: #628b9d; }.basic-info dd { color: #b6d7e1; }
.detail-summary-row { min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(0,1fr) max-content; gap: 7px; }.metric-grid { min-width: 0; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 7px; }.metric-grid article { min-width: 0; display: flex; align-items: center; gap: 8px; padding: 8px 9px; background: linear-gradient(120deg,#07385a,#04243e); border: 1px solid #0b5982; }.metric-grid i { flex: 0 0 34px; width: 34px; height: 34px; display: grid; place-items: center; color: #58e7f1; background: #075274; border-radius: 50%; font-style: normal; }.metric-grid span,.metric-grid b { min-width: 0; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.metric-grid span { color: #78a4b5; font-size: 14px; }.metric-grid b { margin-top: 4px; color: #a4f4fb; font-size: 18px; }.metric-grid small { margin-left: 4px; color: #648d9d; font-size: 12px; }
.map-info-grid { min-height: 0; display: grid; grid-template-columns: 1fr; gap: 7px; }.task-map-panel { display: grid; grid-template-rows: minmax(0,1fr); }.task-map-compare { min-height: 0; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 2px; background: #0b6389; }.task-map-compare__pane { min-width: 0; min-height: 0; display: grid; grid-template-rows: 28px minmax(0,1fr); background: #031a31; }.task-map-compare__pane>header { display: flex; align-items: center; padding: 0 10px; color: #9bddea; background: #052d49; border-bottom: 1px solid #0d6287; font-size: 13px; font-weight: bold; }.task-map-compare__pane :deep(.task-range-map) { min-height: 0; }
.detail-bottom { min-height: 0; display: grid; grid-template-columns: minmax(0,2.2fr) minmax(300px,.85fr); gap: 7px; }.table-error { color: #ffb0a8!important; }
.progress-panel .detail-title { font-size: 18px; }.progress-panel .detail-title select { font-size: 15px; }.progress-item { display: grid; grid-template-columns: 15px 1fr; gap: 9px; padding: 10px 14px; }.progress-item>i { width: 9px; height: 9px; margin-top: 4px; background: #22cfab; border-radius: 50%; box-shadow: 0 0 7px #22cfab; }.progress-item b,.progress-item small { display: block; }.progress-item b { font-size: 16px; }.progress-item small { margin-top: 4px; color: #8caeba; font-size: 14px; }.task-not-found { padding: 100px; text-align: center; }.task-not-found button { padding: 8px 16px; color: white; background: #087ee0; border: 1px solid #24a4ed; }
.evidence-preview { position: fixed; z-index: 3000; inset: 0; display: grid; place-items: center; padding: 30px; background: #00121ae8; }.evidence-preview article { position: relative; width: min(900px, 90vw); max-height: 90vh; overflow: auto; padding: 14px; background: #05233d; border: 1px solid #2495c5; box-shadow: 0 0 30px #008dd766; }.evidence-preview img { width: 100%; max-height: calc(90vh - 90px); object-fit: contain; background: #031426; }.evidence-preview b,.evidence-preview small { display: block; }.evidence-preview b { margin-top: 9px; color: #d8f6ff; }.evidence-preview small { margin-top: 4px; color: #85aebe; }.preview-close { position: absolute; z-index: 1; right: 20px; top: 20px; width: 32px; height: 32px; color: white; background: #051b30cc; border: 1px solid #4eb8e2; border-radius: 50%; font-size: 22px; cursor: pointer; }
.abnormal-panel { display: grid; grid-template-rows: 42px minmax(0,1fr) 38px; min-height: 0; }.abnormal-panel .detail-title span { color: #c6effa; }.abnormal-filters { display: flex; gap: 7px; align-items: center; padding: 6px 9px; border-bottom: 1px solid #0a425f; }.abnormal-filters select,.abnormal-filters input { height: 28px; padding: 0 8px; color: #bfe4ef; background: #031a30; border: 1px solid #155a7e; font-size: 12px; outline: none; }.abnormal-filters input { flex: 1; }.abnormal-filters button,.abnormal-pagination button { padding: 5px 10px; color: #c9effa; background: #075177; border: 1px solid #1683aa; cursor: pointer; }.abnormal-table { min-height: 0; overflow: auto; }.abnormal-row { width: 100%; display: grid; grid-template-columns: 2fr 1fr .65fr .8fr .9fr .8fr; align-items: center; min-height: 46px; color: #b6d9e4; background: transparent; border: 0; border-bottom: 1px solid #0a3b55; text-align: left; cursor: pointer; }.abnormal-row>span { min-width: 0; padding: 6px 9px; font-size: 12px; }.abnormal-row b,.abnormal-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.abnormal-row b { color: #d1eff7; font-size: 13px; }.abnormal-row small { margin-top: 3px; color: #7699ac; }.abnormal-head { min-height: 29px; color: #b9e0eb; background: #063452; cursor: default; }.abnormal-head>span { font-size: 12px; }.abnormal-row:hover,.abnormal-row.active { background: #0875aa2e; }.abnormal-row em { display: inline-block; padding: 2px 5px; border: 1px solid #2b9dc1; color: #8de7f7; font-style: normal; }.abnormal-row em.level-2 { color: #ffd06b; border-color: #a97b21; }.abnormal-row em.level-3 { color: #ff9aa4; border-color: #b94a57; }.abnormal-row img { width: 46px; height: 29px; object-fit: cover; border: 1px solid #1b7095; cursor: zoom-in; }.abnormal-empty { display: grid; min-height: 110px; place-items: center; color: #7298aa; font-size: 13px; }.abnormal-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 0 10px; color: #8cacbc; font-size: 12px; }.abnormal-pagination span { margin-right: auto; }.abnormal-pagination button:disabled { opacity: .4; cursor: not-allowed; }
@media (max-width: 1100px) { .detail-layout { grid-template-columns: 205px minmax(0,1fr); }.detail-title { font-size: 14px; }.basic-info h2 { font-size: 14px; }.task-action-toolbar { gap: 4px; }.enter-workspace,.enter-patrol,.task-action-edit,.task-action-primary,.task-action-danger { padding-inline: 8px; font-size: 12px; } }

.detail-layout{font-family:inherit;font-size:13px;min-height:560px}.detail-layout input,.detail-layout select,.detail-layout button{font-family:inherit}.basic-info dt,.basic-info dd,.abnormal-row>span,.metric-grid span{font-size:13px}.detail-title{font-size:15px}.abnormal-row b,.abnormal-row small{white-space:normal;overflow-wrap:anywhere}.abnormal-filters{flex-wrap:wrap;height:auto}.abnormal-filters input{min-width:100px;width:100px}.abnormal-panel{grid-template-rows:auto minmax(0,1fr) 38px}.abnormal-table{overflow:auto;scrollbar-width:thin}.abnormal-row{min-width:660px}.records-panel{overflow:hidden}.task-action-toolbar{flex-wrap:wrap;white-space:normal}.detail-summary-row{grid-template-columns:minmax(0,1fr) auto}.task-action-toolbar button{height:auto;min-height:28px}.basic-info .basic-scroll h2{font-size:15px}
@media(max-width:900px){.detail-layout{height:auto;grid-template-columns:minmax(0,1fr);overflow:visible}.detail-left{height:360px}.detail-main{grid-template-rows:auto 360px auto}.detail-bottom{grid-template-columns:minmax(0,1fr)}.abnormal-panel,.records-panel{height:360px}.detail-summary-row{grid-template-columns:minmax(0,1fr)}.task-action-toolbar{min-height:34px}}
</style>
