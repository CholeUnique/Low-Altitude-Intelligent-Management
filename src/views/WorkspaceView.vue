<script setup lang="ts">
import WorkspaceToolBall from '@/workspace-components/shared/WorkspaceToolBall.vue'
import WorkbenchHeader from '@/workspace-components/shared/WorkbenchHeader.vue'
import { getMyWorkflowTasks, type MyWorkflowTask } from '@/api/my-workflow-tasks'
import { getTaskWorkflow, type TaskWorkflow } from '@/api/task-workflow'
import { isDefaultWorkflow } from '@/utils/default-workflow'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { WorkspaceNodeConfig } from '@/types'
import {
  isWorkspaceNodeAccessible,
  resolveWorkspaceNodeKey,
} from '@/workspace/config/workflow'
import { getSharedWorkspaceConfig, resolveWorkspaceSceneId } from '@/workspace/config/registry'
import { getScene } from '@/mocks/portal'
import { useUserStore } from '@/stores/user'
import { getGovernanceTaskDetail, toPatrolTask } from '@/api/governance-task'
import type { PortalTask } from '@/types'
import SpotIdentificationPanel from '@/workspace-components/spot-identification/SpotIdentificationPanel.vue'
import TaskDispatchPanel from '@/workspace-components/task-dispatch/TaskDispatchPanel.vue'
import ReviewArchivePanel from '@/workspace-components/review-archive/ReviewArchivePanel.vue'
import SceneNodePlaceholder from '@/workspace-components/shared/SceneNodePlaceholder.vue'
import RouteFlightPlanPanel from '@/workspace-components/route-flight-plan/RouteFlightPlanPanel.vue'
import RealtimeCruisePanel from '@/workspace-components/realtime-cruise/RealtimeCruisePanel.vue'
import NonGrainWorkspace from '@/workspace-components/non-grain/NonGrainWorkspace.vue'
import FarmlandFacilitiesWorkspace from '@/workspace-components/farmland-facilities/FarmlandFacilitiesWorkspace.vue'
import LandSupervisionWorkspace from '@/workspace-components/land-supervision/LandSupervisionWorkspace.vue'
import { LAND_WARNING_SCENE, LAND_RECTIFICATION_SCENE } from '@/types/land-supervision'
import TaskAcceptancePanel from '@/workspace-components/shared/TaskAcceptancePanel.vue'
import { vWorkbenchValidation } from '@/workspace-components/shared/workbench-validation'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const sceneId = computed(() => String(route.params.sceneId || ''))
const task = ref<PortalTask>()
const landLocation=ref<{taskId:string;taskName:string;geometry?:import('@/api/governance-task').TaskGeometryFeatureCollection}>()
const taskLoading = ref(false)
const taskError = ref('')
const workspaceSceneId = computed(() => resolveWorkspaceSceneId(backendTask.value?.sceneCode || sceneId.value, backendTask.value?.sceneName))
const isNonGrainWorkspace = computed(() => workspaceSceneId.value === 'non-grain-monitoring')
const isFacilityWorkspace = computed(() => workspaceSceneId.value === 'farmland-facilities')
const isLandWorkspace = computed(() => ['new-illegal-land-warning','existing-illegal-land-rectification'].includes(resolveWorkspaceSceneId(sceneId.value)))
const landSceneCode = computed(() => resolveWorkspaceSceneId(sceneId.value)==='new-illegal-land-warning'?LAND_WARNING_SCENE:LAND_RECTIFICATION_SCENE)
// 不同场景使用各自任务数据，但统一复用林业执法监管的完整工作台流程与页面。
const workspaceConfig = computed(() => {
  const config = getSharedWorkspaceConfig()
  return { ...config, nodes: [{ key: 'task-acceptance', name: '任务受理', shortName: '任务受理', order: 0, module: 'governance' as const, component: 'TaskAcceptance' }, ...config.nodes] }
})
const contextFlow = ref<TaskWorkflow>()
const headerTodos=ref<MyWorkflowTask[]>([]),headerNoticeError=ref('')
const useDefaultTemplate = computed(() => !isLandWorkspace.value && !isNonGrainWorkspace.value && isDefaultWorkflow(contextFlow.value))
const backendTask = ref<import('@/api/governance-task').GovernanceTask>()
const currentScene = computed(() => getScene(user.organization, workspaceSceneId.value))
let taskRequestVersion = 0

async function loadTaskContext() {
  const version = ++taskRequestVersion
  const taskId = typeof route.params.taskId === 'string' ? route.params.taskId : ''
  task.value = undefined
  landLocation.value=undefined
  backendTask.value = undefined
  contextFlow.value = undefined
  taskError.value = ''
  taskLoading.value = false
  headerTodos.value=[];headerNoticeError.value=''
  if (isLandWorkspace.value) return
  if (!taskId) return
  taskLoading.value = true
  try {
    const [detail, workflow] = await Promise.all([getGovernanceTaskDetail(taskId), getTaskWorkflow(taskId)])
    if (version !== taskRequestVersion) return
    contextFlow.value = workflow
    backendTask.value = detail?.task
    task.value = detail ? toPatrolTask(detail.task) : undefined
    if (!isNonGrainWorkspace.value&&!isFacilityWorkspace.value&&!useDefaultTemplate.value&&user.hasPermission('task-todo')){try{const pending=await getMyWorkflowTasks(String(user.currentUser?.id||''),user.activeDeptId);if(version===taskRequestVersion){headerTodos.value=pending.records.filter(item=>item.id!==taskId&&item.myWorkState==='pending');headerNoticeError.value=pending.warnings.join('；')}}catch(reason){headerNoticeError.value=reason instanceof Error?reason.message:'待办读取失败'}}
    if (!task.value) taskError.value = '未找到该真实业务任务，或当前账号没有查看权限。'
  } catch (error) {
    if (version !== taskRequestVersion) return
    taskError.value = error instanceof Error ? error.message : '真实任务上下文加载失败。'
  } finally {
    if (version === taskRequestVersion) taskLoading.value = false
  }
}

const nodeKeys = computed(() => workspaceConfig.value?.nodes.map((node) => node.key) ?? [])

const governanceNodes = computed(() =>
  workspaceConfig.value?.nodes.filter((node) => ['task-acceptance', 'task-dispatch', 'review-archive'].includes(node.key)) ?? [],
)


/** 真实任务只有粗粒度 taskStatus 时，映射为工作台五节点中的当前节点。 */
const defaultNodeKey = computed(() => {
  const status = task.value?.status || ''
  if (status.includes('完成')) return governanceNodes.value[governanceNodes.value.length - 1]?.key || resolveWorkspaceNodeKey(task.value?.workflow, nodeKeys.value)
  if (status.includes('核查') || status.includes('复核')) return 'task-dispatch'
  return 'task-dispatch'
})

const activeKey = computed(() => {
  const queryKey = typeof route.query.node === 'string' ? route.query.node : ''
  if (queryKey) {
    const node = workspaceConfig.value?.nodes.find((item) => item.key === queryKey)
    if (node && isNodeAvailable(node)) return queryKey
  }
  const defaultNode = workspaceConfig.value?.nodes.find((node) => node.key === defaultNodeKey.value)
  return defaultNode && isNodeAvailable(defaultNode) ? defaultNode.key : ''
})

const activeNode = computed(() =>
  workspaceConfig.value?.nodes.find((node) => node.key === activeKey.value),
)
const activeGovernanceIndex = computed(() =>
  Math.max(0, governanceNodes.value.findIndex((node) => node.key === activeKey.value)) + 1,
)

const panelComponents = {
  SpotIdentification: SpotIdentificationPanel,
  TaskDispatch: TaskDispatchPanel,
  ReviewArchive: ReviewArchivePanel,
  RouteFlightPlan: RouteFlightPlanPanel,
  RealtimeCruise: RealtimeCruisePanel,
  ScenePlaceholder: SceneNodePlaceholder,
} as const

const ActivePanel = computed(() => {
  const component = activeNode.value?.component as keyof typeof panelComponents
  return panelComponents[component] || SceneNodePlaceholder
})

/**
 * 治理模块是工作台的常驻能力，不再因任务尚未写入节点级 workflow 而被锁定。
 * 巡查节点仍遵循既有的任务阶段控制；治理节点无真实数据时由各面板显示空状态。
 */
function isNodeAvailable(node: WorkspaceNodeConfig) {
  return node.module === 'governance'
    || isWorkspaceNodeAccessible(task.value?.workflow, node.key, nodeKeys.value)
}


function workflowInstance(node: WorkspaceNodeConfig) {
  return [...(contextFlow.value?.timeline || []), ...(contextFlow.value?.currentNode ? [contextFlow.value.currentNode] : [])].reverse().find(item => item.nodeKey === node.key || item.nodeName === node.name || item.nodeName === node.shortName)
}

const workspaceHeaderSteps=computed(()=>governanceNodes.value.map(node=>{const instance=workflowInstance(node);return {key:node.key,name:node.shortName||node.name,order:node.order,instance,viewable:node.key==='task-acceptance'?Boolean(backendTask.value):isNodeAvailable(node),status:node.key==='task-acceptance'&&backendTask.value||instance?.status==='COMPLETED'?'completed':instance?.status==='PROCESSING'?'active':'pending'}}))

function selectNode(node: WorkspaceNodeConfig) {
  if (!isNodeAvailable(node)) return
  router.replace({
    query: {
      ...route.query,
      node: node.key,
    },
  })
}

watch(
  [() => workspaceConfig.value?.sceneId, defaultNodeKey, () => route.query.node, () => task.value?.id],
  () => {
    // 非粮化工作台由其自身七节点路由守卫维护，不能复用共享工作台的节点改写逻辑。
    // 非粮化与工程设施工作台都由内部流程维护节点路由；外层通用守卫不能
    // 把其历史节点 query 改写成共享工作台节点，否则已完成页面无法回看。
    if (isLandWorkspace.value || isNonGrainWorkspace.value || isFacilityWorkspace.value || useDefaultTemplate.value) return
    if (!workspaceConfig.value) return
    const queryKey = typeof route.query.node === 'string' ? route.query.node : ''
    const queryNode = workspaceConfig.value.nodes.find((item) => item.key === queryKey)
    if (queryNode && isNodeAvailable(queryNode)) {
      return
    }
    const preferred = workspaceConfig.value.nodes.find((item) => item.key === defaultNodeKey.value)
    if (!preferred || queryKey === preferred.key) return
    router.replace({ query: { ...route.query, node: preferred.key } })
  },
  { immediate: true },
)

watch([() => route.params.taskId, () => route.params.sceneId, () => user.activeDeptId], () => void loadTaskContext())
onMounted(() => void loadTaskContext())
</script>

<template>
  <div class="workspace-host"><div class="workspace-host-content">
  <LandSupervisionWorkspace @location="landLocation=$event" v-if="isLandWorkspace" :key="`${user.activeDeptId}:${route.params.taskId}`" :scene-code="landSceneCode" :task-id="String(route.params.taskId||'')" />
  <div v-else-if="taskLoading" class="workspace workspace-empty">
    <WorkbenchHeader :title="taskLoading?'场景作业工作台':(currentScene?.shortName||currentScene?.name||'场景作业')+'工作台'" :task-name="taskLoading?'正在加载真实任务':task?.name||String(route.params.taskId||'')" :steps="taskLoading?[]:workspaceHeaderSteps" :selected-key="activeKey" :user-id="String(user.currentUser?.id||'')" :show-back="user.hasPermission('task-todo')" :show-notice="user.hasPermission('task-todo')" :tasks="headerTodos" :notice-error="headerNoticeError" @back="router.push('/tasks/todo')" @select="key=>{const node=workspaceConfig.nodes.find(item=>item.key===key);if(node)selectNode(node)}" @open-all="router.push('/tasks/todo')" @open-task="router.push({name:'workspace',params:{sceneId:$event.sceneCode,taskId:$event.id}})" />
    <main class="empty-body"><div class="empty-card"><h2>正在加载任务工作台…</h2></div></main>
  </div>

  <FarmlandFacilitiesWorkspace
    v-workbench-validation
    v-else-if="!taskError && task && workspaceSceneId === 'farmland-facilities'"
    :key="task.id"
    :task-id="task.id"
    :task-name="task.name"
  />

  <NonGrainWorkspace
    v-workbench-validation
    v-else-if="!taskError && task && (workspaceSceneId === 'non-grain-monitoring' || useDefaultTemplate)"
    :key="task?.id || String(route.params.taskId || '')"
    :task-id="task?.id || String(route.params.taskId || '')"
    :task-name="task?.name"
    :task-no="backendTask?.taskNo"
    :task-status="task?.status"
    :default-template="useDefaultTemplate"
  />

  <div v-else-if="taskError" class="workspace workspace-empty"><main class="empty-body"><div class="empty-card"><h2>任务读取失败</h2><p>{{ taskError }}</p><button @click="loadTaskContext">重试</button></div></main></div>

  <div v-else-if="!workspaceConfig" class="workspace workspace-empty">
    <WorkbenchHeader :title="taskLoading?'场景作业工作台':(currentScene?.shortName||currentScene?.name||'场景作业')+'工作台'" :task-name="taskLoading?'正在加载真实任务':task?.name||String(route.params.taskId||'')" :steps="taskLoading?[]:workspaceHeaderSteps" :selected-key="activeKey" :user-id="String(user.currentUser?.id||'')" :show-back="user.hasPermission('task-todo')" :show-notice="user.hasPermission('task-todo')" :tasks="headerTodos" :notice-error="headerNoticeError" @back="router.push('/tasks/todo')" @select="key=>{const node=workspaceConfig.nodes.find(item=>item.key===key);if(node)selectNode(node)}" @open-all="router.push('/tasks/todo')" @open-task="router.push({name:'workspace',params:{sceneId:$event.sceneCode,taskId:$event.id}})" />
    <main class="empty-body">
      <div class="empty-card">
        <h2>该场景工作台正在建设</h2>
        <p>当前仅开放林业执法监管场景的治理流程配置，其他场景将按业务配置逐步接入。</p>
        <el-button v-if="user.hasPermission('unit-overview')" type="primary" @click="$router.push('/dashboard')">返回运行中枢</el-button>
      </div>
    </main>
  </div>

  <div v-else v-workbench-validation class="workspace">
    <WorkbenchHeader :title="taskLoading?'场景作业工作台':(currentScene?.shortName||currentScene?.name||'场景作业')+'工作台'" :task-name="taskLoading?'正在加载真实任务':task?.name||String(route.params.taskId||'')" :steps="taskLoading?[]:workspaceHeaderSteps" :selected-key="activeKey" :user-id="String(user.currentUser?.id||'')" :show-back="user.hasPermission('task-todo')" :show-notice="user.hasPermission('task-todo')" :tasks="headerTodos" :notice-error="headerNoticeError" @back="router.push('/tasks/todo')" @select="key=>{const node=workspaceConfig.nodes.find(item=>item.key===key);if(node)selectNode(node)}" @open-all="router.push('/tasks/todo')" @open-task="router.push({name:'workspace',params:{sceneId:$event.sceneCode,taskId:$event.id}})" />

    <main class="workspace-body">
      <TaskAcceptancePanel v-if="activeKey === 'task-acceptance'" :task-id="backendTask?.id" />
      <component
        v-else-if="activeKey && activeNode"
        :is="ActivePanel"
        :task="task"
        :scene-name="workspaceConfig.name"
        :node="activeNode"
        :governance-index="activeGovernanceIndex"
        :governance-total="governanceNodes.length"
      />
      <div v-else class="empty-body">
        <div class="empty-card">
          <h2>请从公共巡查模块开始</h2>
          <p>当前任务仍处于航线规划 / 实时巡航阶段，请点击上方节点进入公共巡查页面。</p>
        </div>
      </div>
    </main>
  </div>
</div><WorkspaceToolBall v-if="route.params.taskId&&!taskError" :key="`${user.activeDeptId}:${route.params.taskId}`" :task-name="task?.name||landLocation?.taskName" :geometry="landLocation?.taskId===String(route.params.taskId)?landLocation.geometry:undefined" :task-id="String(route.params.taskId)" :dept-id="backendTask?.deptId||user.activeDeptId" /></div>
</template>

<style scoped lang="scss">
.workspace {
  width: 100%;
  height: 100dvh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #eef3f6;
}
.workspace-context {
  position: relative;
  flex: 0 0 78px;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 240px;
  align-items: center;
  padding: 0 16px;
  color: white;
  background: linear-gradient(100deg, #043654, #075070);
  box-shadow: 0 3px 10px #002b4633;
}
.workspace-brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.workspace-brand--linked { cursor: pointer; }
.workspace-brand--moved {
  position: absolute;
  left: 122px;
  z-index: 1;
}
.workspace-return {
  z-index: 2;
  justify-self: start;
}
.workspace-return :deep(.workspace-return-button) {
  height: 32px;
  padding: 0 12px;
  color: #c7f4ff;
  background: linear-gradient(180deg, #0a5075, #063451);
  border-color: #2187af;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px #5be6f022, 0 0 10px #0e9fc033;
  font-weight: 600;
}
.workspace-return :deep(.workspace-return-button:hover) {
  color: #fff;
  background: linear-gradient(180deg, #0e668e, #074765);
  border-color: #4ee1ec;
  box-shadow: 0 0 12px #23cfe066;
}
.workspace-brand > div { min-width: 0; }
.brand-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: linear-gradient(135deg, #1fd0c8, #0b8ad8);
  font-weight: 800;
}
.workspace-brand b,
.workspace-brand small { display: block; }
.workspace-brand b {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-brand small { margin-top: 3px; color: #78adbf; font-size: 12px; }

.flow-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 0;
}
.flow-module {
  display: grid;
  gap: 4px;
  justify-items: center;
}
.module-label {
  padding: 2px 10px;
  color: #9fd7e8;
  background: #ffffff12;
  border: 1px solid #7fb4c855;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
}
.module-nodes {
  display: flex;
  align-items: center;
}
.module-nodes button {
  position: relative;
  min-width: 88px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 4px;
  padding: 0 4px;
  border: 0;
  color: #94b4c3;
  background: transparent;
  cursor: pointer;
}
.module-nodes button:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 12px;
  left: calc(50% + 14px);
  width: calc(100% - 28px);
  border-top: 1px solid #54788a;
}
.module-nodes i {
  z-index: 1;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 1px solid #66899a;
  border-radius: 50%;
  background: #174e68;
  font-style: normal;
  font-size: 12px;
}
.module-nodes span {
  font-size: 12px;
  white-space: nowrap;
}
.module-nodes button.active { color: white; }
.module-nodes button.active i {
  border-color: #3dd2e0;
  background: #13a6bb;
  box-shadow: 0 0 0 4px #37d3df1d;
}
.module-nodes button.done i {
  color: #064863;
  border-color: #58d3b1;
  background: #58d3b1;
}
.module-nodes button.acceptance-complete i {
  color: #fff;
  background: #0280a2;
  border: 1px solid #52c4d9;
  box-shadow: 0 0 5px 4px #0a5270;
}
.module-nodes button.acceptance-complete span { color: #7199ac; }
.module-nodes button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}
.flow-divider {
  width: 1px;
  height: 42px;
  background: #6f96a866;
}
.workspace-user {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 14px;
  color: #9cbac7;
  font-size: 12px;
}
.workspace-user b { color: #4ee1c2; }

.workspace-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.empty-body {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 24px;
}
.empty-card {
  width: min(560px, 100%);
  padding: 32px;
  text-align: center;
  background: #fff;
  border: 1px solid #d7e3eb;
  border-radius: 8px;
  box-shadow: 0 8px 24px #12344714;
}
.empty-card h2 {
  margin: 0 0 10px;
  color: #16384c;
}
.empty-card p {
  margin: 0 0 18px;
  color: #6f8393;
  line-height: 1.6;
}

@media (max-width: 1450px) {
  .workspace-context { grid-template-columns: 220px 1fr 180px; }
  .workspace-brand--moved { left: 120px; }
  .module-nodes button { min-width: 76px; }
}
@media (max-width: 1120px) {
  .workspace-context { grid-template-columns: 205px minmax(0, 1fr) 150px; padding-inline: 10px; }
  .workspace-brand--moved { left: 105px; }.module-label { display: none; }.module-nodes button { min-width: 64px; }.module-nodes span { font-size: 12px; }.workspace-user { gap: 7px; font-size: 12px; }
}
@media (max-height: 700px) { .workspace-context { flex-basis: 62px; } }
</style>

<style scoped>
.workflow-step-symbol{position:relative;display:grid;place-items:center;width:28px;height:28px;z-index:2;overflow:visible}
</style>

<style scoped>.workspace-host{position:relative;height:100%;min-height:0;isolation:isolate}.workspace-host-content{height:100%;min-height:0}</style>
