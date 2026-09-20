<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CockpitPageLayout from '@/layouts/CockpitPageLayout.vue'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import NewTaskDialog from '@/components/NewTaskDialog.vue'
import { isMockMode } from '@/api/client'
import { cancelGovernanceTask, executeGovernanceTask, finishGovernanceTask, getGovernanceTaskDetail, getGovernanceTaskGeometry, getTaskAbnormalPage, taskPriorityLabel } from '@/api/governance-task'
import { getGovernanceResultDetail, getGovernanceResultPage, getTaskEvidenceImages } from '@/api/governance-result'
import type { GovernanceTaskDetail, TaskAbnormal, TaskGeometryFeatureCollection } from '@/api/governance-task'
import type { GovernanceResult, TaskEvidenceImage } from '@/api/governance-result'

const route = useRoute()
const router = useRouter()
const detail = ref<GovernanceTaskDetail>()
const geometry = ref<TaskGeometryFeatureCollection>({ type: 'FeatureCollection', features: [] })
const loading = ref(false)
const error = ref('')
const resultRecords = ref<GovernanceResult[]>([])
const resultTotal = ref(0)
const selectedResult = ref<GovernanceResult>()
const resultLoading = ref(false)
const resultError = ref('')
const evidenceImages = ref<TaskEvidenceImage[]>([])
const evidenceLoading = ref(false)
const evidenceError = ref('')
const previewImage = ref<TaskEvidenceImage>()
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
const task = computed(() => detail.value?.task)
const abnormalPageCount = computed(() => Math.max(1, Math.ceil(abnormalTotal.value / 10)))
const logs = computed(() => detail.value?.process?.logs || [])
const displayedLogs = computed(() => logs.value)
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

function enterWorkspace() {
  if (!task.value) return
  router.push({
    name: 'workspace',
    params: {
      sceneId: task.value.sceneCode,
      taskId: task.value.id,
    },
  })
}

async function loadTask() {
  const taskId = String(route.params.taskId || '')
  if (!taskId) return
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
    if (detailResult.status === 'rejected') throw detailResult.reason
    const nextDetail = detailResult.value
    detail.value = nextDetail
    geometry.value = geometryResult.status === 'fulfilled'
      ? geometryResult.value
      : { type: 'FeatureCollection', features: [] }
    if (!nextDetail) error.value = '未找到该任务或当前账号无查看权限。'
    else {
      void loadResultsAndEvidence(taskId)
      void loadAbnormals(taskId)
      void loadAllMapAbnormals(taskId)
    }
  } catch (reason) {
    detail.value = undefined
    geometry.value = { type: 'FeatureCollection', features: [] }
    error.value = reason instanceof Error ? reason.message : '任务详情加载失败，请稍后重试。'
  } finally {
    loading.value = false
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

async function loadResultsAndEvidence(taskId: string) {
  resultLoading.value = true
  evidenceLoading.value = true
  resultError.value = ''
  evidenceError.value = ''
  const [pageResult, imageResult] = await Promise.allSettled([
    getGovernanceResultPage({ pageNum: 1, pageSize: 50, bizTaskId: taskId }),
    getTaskEvidenceImages(taskId),
  ])
  if (pageResult.status === 'fulfilled') {
    resultRecords.value = pageResult.value.records
    resultTotal.value = pageResult.value.total
    if (pageResult.value.records[0]) void selectResult(pageResult.value.records[0].id)
  } else {
    resultRecords.value = []
    resultTotal.value = 0
    resultError.value = pageResult.reason instanceof Error ? pageResult.reason.message : '成果列表加载失败。'
  }
  if (imageResult.status === 'fulfilled') {
    evidenceImages.value = imageResult.value
  } else {
    evidenceImages.value = []
    evidenceError.value = imageResult.reason instanceof Error ? imageResult.reason.message : '影像证据加载失败。'
  }
  resultLoading.value = false
  evidenceLoading.value = false
}

async function selectResult(resultId: string) {
  try {
    selectedResult.value = await getGovernanceResultDetail(resultId)
    // 任务详情地图始终展示整个任务的范围和异常图斑。此前自动选中首个成果后，
    // 这里会用“成果范围”覆盖任务级 GeoJSON，触发地图再次仅按任务范围缩放。
    // 成果详情本身仍会正常读取，但不再改变任务地图的视野与要素。
  } catch (reason) {
    resultError.value = reason instanceof Error ? reason.message : '成果详情加载失败。'
  }
}

async function loadAbnormals(taskId = String(route.params.taskId || '')) {
  if (!taskId) return
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
    abnormalRecords.value = page.records
    abnormalTotal.value = page.total
    if (!page.records.some((item) => item.id === activeAbnormalId.value)) activeAbnormalId.value = ''
  } catch (reason) {
    abnormalRecords.value = []
    abnormalTotal.value = 0
    abnormalError.value = reason instanceof Error ? reason.message : '异常图斑加载失败。'
  } finally {
    abnormalLoading.value = false
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
  <CockpitPageLayout title="低空治理任务详情" back-to="/tasks">
    <template #action><div class="task-action-toolbar"><button class="enter-workspace" @click="router.push('/tasks')">返回任务总览</button><button v-if="task" class="enter-patrol" @click="enterWorkspace">进入工作台</button><template v-if="!isMockMode() && task"><button v-if="task.taskStatus !== 4 && task.taskStatus !== 5" class="task-action-edit" @click="editVisible = true">编辑任务</button><button v-if="task.taskStatus === 0" class="task-action-primary" :disabled="actionLoading" @click="requestTaskAction('execute')">执行任务</button><button v-if="task.taskStatus === 0 || task.taskStatus === 1" class="task-action-danger" :disabled="actionLoading" @click="requestTaskAction('cancel')">取消任务</button><button v-if="task.taskStatus === 2" class="task-action-primary" :disabled="actionLoading" @click="requestTaskAction('finish')">核查完成</button></template></div></template>
    <div v-if="loading" class="task-not-found"><h2>正在加载真实任务详情…</h2></div>
    <div v-else-if="error || !task" class="task-not-found"><h2>{{ error || '未找到任务' }}</h2><button @click="router.push('/tasks')">返回任务总览</button></div>
    <div v-else class="detail-layout">
      <aside class="detail-left">
        <section class="detail-panel basic-info">
          <div class="detail-title">任务基本信息</div>
          <h2>{{ task.name }}</h2><div><em>{{ taskPriorityLabel(task.priority) }}优先级</em><em :class="statusClass(task.taskStatus)">{{ task.taskStatusDesc }}</em></div>
          <dl>
            <dt>任务编号</dt><dd>{{ task.taskNo }}</dd><dt>所属单位</dt><dd>{{ task.deptName }}</dd>
            <dt>业务场景</dt><dd>{{ task.sceneName }}</dd><dt>当前状态</dt><dd>{{ task.taskStatusDesc }}</dd>
            <dt>执行方式</dt><dd>{{ task.executeMode === 'AUTO' ? '自动执行' : '手动执行' }}</dd><dt>关联类型</dt><dd>{{ task.refType }}{{ task.refId ? ` · ${task.refId}` : '' }}</dd>
            <dt>计划时间</dt><dd>{{ formatTime(task.planStartTime) }} 至 {{ formatTime(task.planEndTime) }}</dd><dt>实际时间</dt><dd>{{ formatTime(task.actualStartTime) }} 至 {{ formatTime(task.actualEndTime) }}</dd>
            <dt>负责人</dt><dd>{{ task.assigneeId ? `用户 #${task.assigneeId}` : '' }}</dd><dt>创建时间</dt><dd>{{ formatTime(task.createTime) }}</dd>
          </dl>
        </section>
        <section class="detail-panel area-info side-area-info"><div class="detail-title">范围与任务信息</div><dl><dt>范围要素</dt><dd>{{ geometry.features.length ? `${geometry.features.length} 个 GeoJSON 要素` : '后端暂未提供范围' }}</dd><dt>场景编码</dt><dd>{{ task.sceneCode }}</dd><dt>主责部门</dt><dd>{{ task.deptName }}</dd><dt>执行方式</dt><dd>{{ task.executeMode }}</dd><dt>关联信息</dt><dd>{{ detail?.refSummary || '无' }}</dd><dt>内部备注</dt><dd>{{ detail?.process?.remark || '暂无' }}</dd></dl></section>
        <section class="detail-panel process-panel side-process-panel">
          <div class="detail-title">任务处理记录 <span>{{ logs.length }} 条</span></div>
          <ol v-if="displayedLogs.length" class="process-list">
            <li v-for="(log, index) in displayedLogs" :key="log.id || index"><i>✓</i><span><b :title="log.operateTypeDesc">{{ log.operateTypeDesc }}</b><small>{{ formatTime(log.createTime) }}</small></span></li>
          </ol>
          <div v-else class="process-empty">暂无后端操作留痕</div>
        </section>
      </aside>

      <main class="detail-main">
        <section class="metric-grid">
          <article><i>◷</i><span>任务状态<b>{{ task.taskStatusDesc }}</b></span></article>
          <article><i>▰</i><span>成果批次<b>{{ resultTotal }}<small>个</small></b></span></article>
          <article><i>!</i><span>异常 / 图斑<b>{{ detail?.abnormalCount ?? 0 }}<small>个</small></b></span></article>
          <article><i>△</i><span>异常面积<b>{{ detail?.abnormalArea ?? 0 }}<small>㎡</small></b></span></article>
          <article><i>⌖</i><span>范围要素<b>{{ geometry.features.length }}<small>个</small></b></span></article>
        </section>
        <section class="map-info-grid">
          <article class="detail-panel task-map-panel"><div class="task-map-compare"><section class="task-map-compare__pane"><header>任务范围与异常图斑</header><TaskRangeMap :geo-json="geometry" :abnormal-points="mapAbnormalRecords" :active-abnormal-id="activeAbnormalId" :fit-abnormal-points="true" :auto-fit="false" :fit-request="taskMapFitRequest" :view="taskMapView" @view-change="syncTaskMapView" /></section><section class="task-map-compare__pane"><header>异常图斑</header><TaskRangeMap :geo-json="geometry" :abnormal-points="mapAbnormalRecords" :active-abnormal-id="activeAbnormalId" :show-task-range="false" :abnormal-fill-opacity="0" :show-dom-imagery="true" :auto-fit="false" :view="taskMapView" @view-change="syncTaskMapView" /></section></div></article>
        </section>
        <section class="detail-bottom">
          <section class="detail-panel abnormal-panel">
          <div class="abnormal-filters"><select v-model="abnormalType"><option value="">全部类型</option><option value="ILLEGAL_OCCUPY">违法占用</option><option value="FOREST_DAMAGE">林地破坏</option><option value="NON_GRAIN">非粮化</option><option value="ABANDONED">撂荒</option><option value="ILLEGAL_BUILD">违法建设</option><option value="OTHER">其他</option></select><select v-model="abnormalHandleStatus"><option value="">全部处置状态</option><option :value="0">待核查</option><option :value="1">核查中</option><option :value="2">已处置</option><option :value="3">已销号</option></select><input v-model="abnormalKeyword" placeholder="搜索图斑标题或描述" /><button @click="loadAbnormals()">查询</button></div>
          <div class="abnormal-table"><div class="abnormal-row abnormal-head"><span>异常图斑信息</span><span>类型 / 等级</span><span>面积（㎡）</span><span>处置状态</span><span>发现时间</span><span>关联影像</span></div><button v-for="(item, index) in abnormalRecords" :key="item.id" class="abnormal-row" :class="{ active: activeAbnormalId === item.id }" @click="selectAbnormal(item)"><span><b>{{ (abnormalPage - 1) * 10 + index + 1 }}. {{ item.title }}</b><small>{{ item.description || `图斑 #${item.id}` }}</small></span><span><em :class="`level-${item.abnormalLevel}`">{{ item.abnormalTypeDesc }}</em><small>{{ ['一般', '较重', '严重'][item.abnormalLevel - 1] || '一般' }}</small></span><span>{{ item.area ?? '-' }}</span><span>{{ abnormalStatusLabel(item.handleStatus) }}</span><span>{{ formatTime(item.foundTime) }}</span><span><img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.title" @click.stop="previewAbnormal = item" /><small v-else>暂无影像</small></span></button><div v-if="abnormalLoading" class="abnormal-empty">正在加载异常图斑…</div><div v-else-if="abnormalError" class="abnormal-empty table-error">异常图斑加载失败：{{ abnormalError }}</div><div v-else-if="!abnormalRecords.length" class="abnormal-empty">当前任务暂无异常图斑</div></div>
          <div class="abnormal-pagination"><span>共 {{ abnormalTotal }} 条</span><button :disabled="abnormalPage === 1" @click="abnormalPage -= 1; loadAbnormals()">上一页</button><b>{{ abnormalPage }} / {{ abnormalPageCount }}</b><button :disabled="abnormalPage >= abnormalPageCount" @click="abnormalPage += 1; loadAbnormals()">下一页</button></div>
          </section>
          <div class="detail-side-stack">
            <article class="detail-panel evidence-panel"><div class="detail-title">影像证据 <span>{{ evidenceImages.length }} 张</span></div><div v-if="selectedResult" class="selected-result"><b>{{ selectedResult.resultType }}</b><small>{{ selectedResult.files.length }} 个成果文件 · {{ selectedResult.parseStatusDesc }}</small></div><div v-if="evidenceLoading" class="process-empty">正在加载任务影像…</div><div v-else-if="evidenceError" class="process-empty table-error">{{ evidenceError }}</div><div v-else-if="evidenceImages.length" class="evidence-grid"><button v-for="image in evidenceImages.slice(0,6)" :key="image.id" class="evidence-image" @click="previewImage = image"><img v-if="image.thumbnailUrl || image.imageUrl" :src="image.thumbnailUrl || image.imageUrl" :alt="image.fileName" /><span v-else>暂无缩略图</span><small>{{ image.fileName }}</small></button></div><div v-else class="process-empty">暂无任务关联飞行影像</div></article>
            <article class="detail-panel records-panel">
              <div class="record-tabs"><button class="active">成果批次（{{ resultTotal }}）</button><span></span></div>
              <table><thead><tr><th>序号</th><th>成果类型</th><th>作业人员</th></tr></thead><tbody><tr v-for="(result,index) in resultRecords" :key="result.id" :class="{ selected: selectedResult?.id === result.id }" @click="selectResult(result.id)"><td>{{ index + 1 }}</td><td>{{ result.resultType }}</td><td>{{ result.operator || '-' }}</td></tr><tr v-if="resultLoading"><td colspan="3" class="table-empty">正在加载成果批次…</td></tr><tr v-else-if="resultError"><td colspan="3" class="table-empty table-error">成果加载失败：{{ resultError }}</td></tr><tr v-else-if="!resultRecords.length"><td colspan="3" class="table-empty">暂无后端成果记录</td></tr></tbody></table>
            </article>
          </div>
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
    <div v-if="previewImage" class="evidence-preview" @click.self="previewImage = undefined"><article><button class="preview-close" @click="previewImage = undefined">×</button><img v-if="previewImage.originalUrl || previewImage.imageUrl || previewImage.thumbnailUrl" :src="previewImage.originalUrl || previewImage.imageUrl || previewImage.thumbnailUrl" :alt="previewImage.fileName" /><div><b>{{ previewImage.fileName }}</b><small>{{ formatTime(previewImage.shootTime) }}{{ previewImage.longitude !== undefined && previewImage.latitude !== undefined ? ` · ${previewImage.longitude.toFixed(6)}, ${previewImage.latitude.toFixed(6)}` : '' }}</small></div></article></div>
    <div v-if="previewAbnormal" class="evidence-preview" @click.self="previewAbnormal = undefined"><article><button class="preview-close" @click="previewAbnormal = undefined">×</button><img v-if="previewAbnormal.imageUrl" :src="previewAbnormal.imageUrl" :alt="previewAbnormal.title" /><div><b>{{ previewAbnormal.title }}</b><small>{{ previewAbnormal.abnormalTypeDesc }} · {{ formatTime(previewAbnormal.foundTime) }}</small></div></article></div>
  </CockpitPageLayout>
</template>

<style scoped lang="scss">
.task-action-toolbar { display: flex; align-items: center; gap: 6px; white-space: nowrap; }.enter-workspace,.enter-patrol,.task-action-edit,.task-action-primary,.task-action-danger { height: 32px; padding: 0 11px; color: white; border: 1px solid #2fa9ff; border-radius: 3px; cursor: pointer; font-size: 13px; }.enter-workspace,.task-action-primary { background: #087fe7; box-shadow: 0 0 8px #138deb55; }.enter-patrol { color: #bff8e9; background: #075d58; border-color: #22bfae; box-shadow: 0 0 8px #16bfa744; }.task-action-edit { color: #bdeeff; background: #063958; border-color: #2581a8; }.task-action-danger { color: #ffc1c8; background: #5d1b2b; border-color: #ba5260; }.task-action-toolbar button:disabled { opacity: .55; cursor: wait; }.task-action-error { margin: 7px 0 0; padding: 8px 12px; color: #ffb3ab; background: #4e19252e; border: 1px solid #893444; font-size: 13px; }
.action-confirm-mask { position: fixed; z-index: 3200; inset: 0; display: grid; place-items: center; padding: 20px; background: #00121acc; backdrop-filter: blur(3px); }.action-confirm-dialog { width: min(430px, calc(100vw - 40px)); overflow: hidden; color: #c7eaf5; background: linear-gradient(145deg,#063454,#031c33); border: 1px solid #1b92c2; border-radius: 5px; box-shadow: 0 14px 40px #000a1ee0, 0 0 24px #078fd060; }.action-confirm-dialog header { display: flex; gap: 11px; align-items: center; padding: 15px 18px; background: linear-gradient(90deg,#095982,#063455); border-bottom: 1px solid #1376a1; }.action-confirm-dialog header i { width: 33px; height: 33px; display: grid; place-items: center; color: #092d43; background: #4de0e9; border-radius: 50%; box-shadow: 0 0 12px #25d6e599; font-style: normal; font-weight: 800; }.action-confirm-dialog header span,.action-confirm-dialog header b,.action-confirm-dialog header small { min-width: 0; display: block; }.action-confirm-dialog header b { color: #e3fbff; font-size: 17px; }.action-confirm-dialog header small { margin-top: 3px; overflow: hidden; color: #8ec5d7; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.action-confirm-dialog>p { margin: 18px; color: #b0d7e4; font-size: 14px; line-height: 1.7; }.action-confirm-dialog footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; background: #03192d; border-top: 1px solid #0b5375; }.action-confirm-dialog footer button { min-width: 92px; padding: 8px 13px; color: #bce6f0; background: #073553; border: 1px solid #19759c; border-radius: 3px; cursor: pointer; }.action-confirm-dialog footer button:last-child { color: #fff; background: #087fe7; border-color: #36aeff; box-shadow: 0 0 9px #0b91e766; }.action-confirm-dialog footer button.danger { background: #922f42; border-color: #ec6678; box-shadow: 0 0 9px #d3425866; }.action-confirm-dialog footer button:disabled { opacity: .6; cursor: wait; }.action-confirm-dialog .action-confirm-error { margin: 0 18px 14px; padding: 8px 10px; color: #ffc0c7; background: #531927; border-left: 2px solid #f05d70; font-size: 13px; }
.detail-layout { height: calc(100vh - 70px); min-height: 0; display: grid; grid-template-columns: 240px 1fr; gap: 7px; overflow: hidden; }.detail-left { display: grid; align-content: stretch; grid-template-rows: auto auto minmax(0,1fr); gap: 7px; min-height: 0; }.detail-main { min-width: 0; min-height: 0; display: grid; grid-template-rows: 76px minmax(220px,1fr) minmax(360px,1.05fr); gap: 7px; }
.detail-panel { min-width: 0; min-height: 0; overflow: hidden; background: linear-gradient(145deg,#042440,#03182d); border: 1px solid #0c557b; }.detail-title { height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; color: #bce7f2; background: #06385a; border-bottom: 1px solid #0b5477; font-size: 15px; font-weight: bold; }.detail-title button,.detail-title select { padding: 3px 8px; color: #74dcef; background: #052842; border: 1px solid #146284; font-size: 12px; }.detail-title span { color: #278db0; font-size: 12px; }
.basic-info { padding-bottom: 8px; }.basic-info h2 { margin: 13px 12px 7px; font-size: 15px; }.basic-info>div:nth-of-type(2) { margin: 0 12px 9px; }.basic-info em { margin-right: 5px; padding: 3px 6px; color: #65dded; background: #07516c; border: 1px solid #14718e; font-size: 12px; font-style: normal; }.basic-info dl { display: grid; grid-template-columns: 65px 1fr; margin: 0 12px; }.basic-info dt,.basic-info dd { margin: 0; padding: 5px 0; border-bottom: 1px solid #0a3b56; font-size: 14px; line-height: 1.5; }.basic-info dt { color: #628b9d; }.basic-info dd { color: #b6d7e1; }
.metric-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 7px; }.metric-grid article { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: linear-gradient(120deg,#07385a,#04243e); border: 1px solid #0b5982; }.metric-grid i { width: 36px; height: 36px; display: grid; place-items: center; color: #58e7f1; background: #075274; border-radius: 50%; font-style: normal; }.metric-grid span,.metric-grid b { display: block; }.metric-grid span { color: #78a4b5; font-size: 14px; }.metric-grid b { margin-top: 4px; color: #a4f4fb; font-size: 18px; }.metric-grid small { margin-left: 4px; color: #648d9d; font-size: 12px; }
.map-info-grid { min-height: 0; display: grid; grid-template-columns: 1fr; gap: 7px; }.task-map-panel { display: grid; grid-template-rows: minmax(0,1fr); }.task-map-compare { min-height: 0; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 2px; background: #0b6389; }.task-map-compare__pane { min-width: 0; min-height: 0; display: grid; grid-template-rows: 28px minmax(0,1fr); background: #031a31; }.task-map-compare__pane>header { display: flex; align-items: center; padding: 0 10px; color: #9bddea; background: #052d49; border-bottom: 1px solid #0d6287; font-size: 13px; font-weight: bold; }.task-map-compare__pane :deep(.task-range-map) { min-height: 0; }.area-info .detail-title { font-size: 18px; }.area-info dl { display: grid; grid-template-columns: 92px 1fr; margin: 7px 12px; }.area-info dt,.area-info dd { margin: 0; padding: 7px 0; border-bottom: 1px solid #0a3c57; font-size: 17px; }.area-info dt { color: #769eaf; }.area-info dd { color: #d1edf4; }.side-area-info { height: 100%; }.side-area-info .detail-title { font-size: 15px; }.side-area-info dl { grid-template-columns: 65px 1fr; margin: 5px 12px 8px; }.side-area-info dt,.side-area-info dd { padding: 5px 0; font-size: 14px; line-height: 1.35; }.side-area-info dd { overflow-wrap: anywhere; }.photo-strip { display: grid; grid-template-columns: repeat(3,1fr); gap: 4px; margin: 8px; }.photo-strip i { height: 45px; background: linear-gradient(145deg,#547963,#173c49); border: 1px solid #155f7d; }
.process-panel { display: grid; grid-template-rows: 34px minmax(0,1fr); }.process-panel .detail-title span { margin-left: auto; color: #57c8db; font-size: 12px; }.process-list { min-height: 0; margin: 0; padding: 4px 10px; overflow-x: hidden; overflow-y: auto; scrollbar-color: #2b91b2 #04243e; scrollbar-width: thin; list-style: none; }.process-list li { display: grid; grid-template-columns: 18px minmax(0,1fr); gap: 7px; align-items: start; min-height: 43px; padding: 7px 0; border-bottom: 1px solid #0a3b56; }.process-list li:last-child { border-bottom: 0; }.process-list i { width: 16px; height: 16px; display: grid; place-items: center; margin-top: 1px; border-radius: 50%; color: #fff; background: #20cfa7; box-shadow: 0 0 7px #20cfa788; font-size: 10px; font-style: normal; }.process-list span,.process-list b,.process-list small { min-width: 0; display: block; }.process-list b { overflow: hidden; color: #aeeadf; font-size: 13px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }.process-list small { margin-top: 3px; color: #6d9cac; font-size: 11px; white-space: nowrap; }.side-process-panel .process-empty { min-height: 80px; }
.detail-bottom { min-height: 0; display: grid; grid-template-columns: minmax(0,2.2fr) minmax(300px,.85fr); gap: 7px; }.detail-side-stack { min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0,1fr) minmax(0,1fr); gap: 7px; }.records-panel { overflow: auto; }.record-tabs { height: 38px; display: flex; border-bottom: 1px solid #0b4c6d; }.record-tabs button { padding: 0 14px; color: #91b9c9; background: transparent; border: 0; font-size: 15px; }.record-tabs button.active { color: #78e8f5; border-bottom: 2px solid #18c5df; }.record-tabs span { flex: 1; }.records-panel table { width: 100%; border-collapse: collapse; font-size: 13px; }.records-panel th,.records-panel td { padding: 7px 8px; border-bottom: 1px solid #0a3b55; text-align: left; }.records-panel th { color: #c4e2ed; background: #063452; font-size: 14px; }.records-panel td { color: #c3dfe8; }.records-panel em { color: #55ddb5; font-style: normal; }.records-panel tbody tr:not(.table-empty) { cursor: pointer; }.records-panel tbody tr:hover,.records-panel tbody tr.selected { background: #0870a629; }.table-empty { padding: 16px!important; color: #7699ac!important; text-align: center!important; }.table-error { color: #ffb0a8!important; }
.progress-panel .detail-title { font-size: 18px; }.progress-panel .detail-title select { font-size: 15px; }.progress-item { display: grid; grid-template-columns: 15px 1fr; gap: 9px; padding: 10px 14px; }.progress-item>i { width: 9px; height: 9px; margin-top: 4px; background: #22cfab; border-radius: 50%; box-shadow: 0 0 7px #22cfab; }.progress-item b,.progress-item small { display: block; }.progress-item b { font-size: 16px; }.progress-item small { margin-top: 4px; color: #8caeba; font-size: 14px; }.task-not-found { padding: 100px; text-align: center; }.task-not-found button { padding: 8px 16px; color: white; background: #087ee0; border: 1px solid #24a4ed; }
.evidence-panel { overflow: auto; }.evidence-panel .detail-title span { color: #69dcec; font-size: 12px; }.selected-result { margin: 8px; padding: 7px 9px; background: #063452; border-left: 2px solid #21cbed; }.selected-result b,.selected-result small { display: block; }.selected-result b { color: #d9f6ff; font-size: 13px; }.selected-result small { margin-top: 3px; color: #7ea4b6; font-size: 12px; }.evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; padding: 8px; }.evidence-image { min-width: 0; padding: 0; overflow: hidden; color: #9cc6d5; background: #051e34; border: 1px solid #125a7b; text-align: left; cursor: pointer; }.evidence-image img,.evidence-image span { width: 100%; height: 72px; display: grid; place-items: center; object-fit: cover; color: #759caf; background: #082b43; font-size: 11px; }.evidence-image small { display: block; overflow: hidden; padding: 4px 5px; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.evidence-preview { position: fixed; z-index: 3000; inset: 0; display: grid; place-items: center; padding: 30px; background: #00121ae8; }.evidence-preview article { position: relative; width: min(900px, 90vw); max-height: 90vh; overflow: auto; padding: 14px; background: #05233d; border: 1px solid #2495c5; box-shadow: 0 0 30px #008dd766; }.evidence-preview img { width: 100%; max-height: calc(90vh - 90px); object-fit: contain; background: #031426; }.evidence-preview b,.evidence-preview small { display: block; }.evidence-preview b { margin-top: 9px; color: #d8f6ff; }.evidence-preview small { margin-top: 4px; color: #85aebe; }.preview-close { position: absolute; z-index: 1; right: 20px; top: 20px; width: 32px; height: 32px; color: white; background: #051b30cc; border: 1px solid #4eb8e2; border-radius: 50%; font-size: 22px; cursor: pointer; }
.abnormal-panel { display: grid; grid-template-rows: 42px minmax(0,1fr) 38px; min-height: 0; }.abnormal-panel .detail-title span { color: #c6effa; }.abnormal-filters { display: flex; gap: 7px; align-items: center; padding: 6px 9px; border-bottom: 1px solid #0a425f; }.abnormal-filters select,.abnormal-filters input { height: 28px; padding: 0 8px; color: #bfe4ef; background: #031a30; border: 1px solid #155a7e; font-size: 12px; outline: none; }.abnormal-filters input { flex: 1; }.abnormal-filters button,.abnormal-pagination button { padding: 5px 10px; color: #c9effa; background: #075177; border: 1px solid #1683aa; cursor: pointer; }.abnormal-table { min-height: 0; overflow: auto; }.abnormal-row { width: 100%; display: grid; grid-template-columns: 2fr 1fr .65fr .8fr .9fr .8fr; align-items: center; min-height: 46px; color: #b6d9e4; background: transparent; border: 0; border-bottom: 1px solid #0a3b55; text-align: left; cursor: pointer; }.abnormal-row>span { min-width: 0; padding: 6px 9px; font-size: 12px; }.abnormal-row b,.abnormal-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.abnormal-row b { color: #d1eff7; font-size: 13px; }.abnormal-row small { margin-top: 3px; color: #7699ac; }.abnormal-head { min-height: 29px; color: #b9e0eb; background: #063452; cursor: default; }.abnormal-head>span { font-size: 12px; }.abnormal-row:hover,.abnormal-row.active { background: #0875aa2e; }.abnormal-row em { display: inline-block; padding: 2px 5px; border: 1px solid #2b9dc1; color: #8de7f7; font-style: normal; }.abnormal-row em.level-2 { color: #ffd06b; border-color: #a97b21; }.abnormal-row em.level-3 { color: #ff9aa4; border-color: #b94a57; }.abnormal-row img { width: 46px; height: 29px; object-fit: cover; border: 1px solid #1b7095; cursor: zoom-in; }.abnormal-empty { display: grid; min-height: 110px; place-items: center; color: #7298aa; font-size: 13px; }.abnormal-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 0 10px; color: #8cacbc; font-size: 12px; }.abnormal-pagination span { margin-right: auto; }.abnormal-pagination button:disabled { opacity: .4; cursor: not-allowed; }
</style>
