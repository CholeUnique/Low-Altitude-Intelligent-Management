<script setup lang="ts">
import WorkflowActorBadge from '@/components/WorkflowActorBadge.vue'
import { getTaskWorkflow, startTaskWorkflow, type TaskWorkflow } from '@/api/task-workflow'
import { isDefaultWorkflow } from '@/utils/default-workflow'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { WorkspaceNodeConfig } from '@/types'
import {
  getWorkflowNodeStatus,
  isWorkspaceNodeAccessible,
  resolveWorkspaceNodeKey,
} from '@/workspace/config/workflow'
import { getSharedWorkspaceConfig, getWorkspaceConfig, resolveWorkspaceSceneId } from '@/workspace/config/registry'
import { forestryBackendKey, forestryNodeInstance, forestryNodeStatus, forestryWorkspaceKey, isForestryFlowNode, isForestryNodeAvailable } from '@/utils/forestry-workflow'
import { isSupplyFlowNode, isSupplyNodeAvailable, supplyBackendKey, supplyNodeInstance, supplyNodeStatus, supplyWorkspaceKey, showsSupplyImagery } from '@/utils/supply-workflow'
import BoundWorkflowNode from '@/workspace-components/scene/BoundWorkflowNode.vue'
import ForestryWorkflowPanel from '@/workspace-components/forestry/ForestryWorkflowPanel.vue'
import SupplyProjectMatching from '@/workspace-components/land-supply/SupplyProjectMatching.vue'
import SupplyPerformance from '@/workspace-components/land-supply/SupplyPerformance.vue'
import SupplyMonitoringWorkspace from '@/workspace-components/land-supply/SupplyMonitoringWorkspace.vue'
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
import TaskAcceptancePanel from '@/workspace-components/shared/TaskAcceptancePanel.vue'
import { vWorkbenchValidation } from '@/workspace-components/shared/workbench-validation'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const sceneId = computed(() => String(route.params.sceneId || ''))
const task = ref<PortalTask>()
const taskLoading = ref(false)
const taskError = ref('')
const workspaceSceneId = computed(() => resolveWorkspaceSceneId(backendTask.value?.sceneCode || sceneId.value, backendTask.value?.sceneName))
const isNonGrainWorkspace = computed(() => workspaceSceneId.value === 'non-grain-monitoring')
const isFacilityWorkspace = computed(() => workspaceSceneId.value === 'farmland-facilities')
/** 林业执法按业务节点办理：科室下发 / 实地考察 / 验收结案，直接绑定后端默认流程三个节点。 */
const isForestryWorkspace = computed(() => workspaceSceneId.value === 'forestry-enforcement')
/** 土地供后巡查与履约分析：项目匹配 / 履约分析 / 核查下发 / 现场核查 / 处置归档。 */
const isSupplyWorkspace = computed(() => workspaceSceneId.value === 'land-supply-inspection')

/**
 * 有专属流程绑定的场景：节点状态、可进入性与办理页都跟随后端流程实例。
 * 其余场景继续复用共享五节点工作台。
 */
const sceneWorkflow = computed(() => {
  if (isForestryWorkspace.value) {
    return {
      backendKey: forestryBackendKey,
      workspaceKey: forestryWorkspaceKey,
      isFlowNode: isForestryFlowNode,
      instance: forestryNodeInstance,
      status: forestryNodeStatus,
      available: isForestryNodeAvailable,
      showImagery: (key: string) => ['field-inspection', 'review-archive'].includes(key),
      imageryTitle: '整改前后影像对比',
      /** 流程未启动或状态粗粒度时落在首个办理节点。 */
      defaultNodeKey: 'task-dispatch',
    }
  }
  if (isSupplyWorkspace.value) {
    return {
      backendKey: supplyBackendKey,
      workspaceKey: supplyWorkspaceKey,
      isFlowNode: isSupplyFlowNode,
      instance: supplyNodeInstance,
      status: supplyNodeStatus,
      available: isSupplyNodeAvailable,
      showImagery: showsSupplyImagery,
      imageryTitle: '巡查前后影像对比',
      defaultNodeKey: 'supply-inspection-dispatch',
    }
  }
  return undefined
})
// 不同场景使用各自任务数据，但统一复用林业执法监管的完整工作台流程与页面。
// 林业执法自带「实地考察」节点，取本场景配置；其余场景继续用共享五节点。
const workspaceConfig = computed(() => {
  const dedicatedSceneId = isForestryWorkspace.value ? 'forestry-enforcement' : isSupplyWorkspace.value ? 'land-supply-inspection' : ''
  const own = dedicatedSceneId ? getWorkspaceConfig(dedicatedSceneId) : undefined
  const config = own || getSharedWorkspaceConfig()
  return { ...config, nodes: [{ key: 'task-acceptance', name: '任务受理', shortName: '任务受理', order: 0, module: 'governance' as const, component: 'TaskAcceptance' }, ...config.nodes] }
})
const contextFlow = ref<TaskWorkflow>()
const useDefaultTemplate = computed(() => !isNonGrainWorkspace.value && isDefaultWorkflow(contextFlow.value))
const backendTask = ref<import('@/api/governance-task').GovernanceTask>()
const currentScene = computed(() => getScene(user.organization, workspaceSceneId.value))
let taskRequestVersion = 0

async function loadTaskContext() {
  const version = ++taskRequestVersion
  const taskId = typeof route.params.taskId === 'string' ? route.params.taskId : ''
  task.value = undefined
  backendTask.value = undefined
  contextFlow.value = undefined
  taskError.value = ''
  taskLoading.value = false
  if (!taskId) return
  taskLoading.value = true
  try {
    const detail = await getGovernanceTaskDetail(taskId)
    const scene = resolveWorkspaceSceneId(detail?.task.sceneCode || sceneId.value, detail?.task.sceneName)
    const workflow = scene === 'land-supply-inspection' ? undefined : await getTaskWorkflow(taskId)
    if (version !== taskRequestVersion) return
    contextFlow.value = workflow
    backendTask.value = detail?.task
    task.value = detail ? toPatrolTask(detail.task) : undefined
    if (!task.value) taskError.value = '未找到该真实业务任务，或当前账号没有查看权限。'
  } catch (error) {
    if (version !== taskRequestVersion) return
    taskError.value = error instanceof Error ? error.message : '真实任务上下文加载失败。'
  } finally {
    if (version === taskRequestVersion) taskLoading.value = false
  }
}

async function onWorkflowSubmitted() {
  const taskId = typeof route.params.taskId === 'string' ? route.params.taskId : ''
  await loadTaskContext()
  if (taskId !== route.params.taskId || taskError.value) return
  const currentKey = sceneWorkflow.value?.workspaceKey(contextFlow.value?.currentNode?.nodeKey)
  if (currentKey) await router.replace({ query: { ...route.query, node: currentKey } })
}

const nodeKeys = computed(() => workspaceConfig.value?.nodes.map((node) => node.key) ?? [])

const governanceNodes = computed(() =>
  // 图斑识别在工作台内由任务详情回看，不放进治理模块节点条。
  workspaceConfig.value?.nodes.filter((node) => (node.key === 'task-acceptance' || (node.module === 'governance' && node.key !== 'spot-identification')) && (!isForestryWorkspace.value || (contextFlow.value?.flowKey === 'FOREST_LAW_ENFORCE_FLOW' ? node.key !== 'review-archive' : !['section-dispatch', 'section-audit', 'forest-rectify', 'section-recheck', 'forest-finish'].includes(node.key)))) ?? [],
)

const discoveryNodes = computed<WorkspaceNodeConfig[]>(() => [])

/** 真实任务只有粗粒度 taskStatus 时，映射为工作台五节点中的当前节点。 */
const defaultNodeKey = computed(() => {
  // 专属场景优先落在后端当前办理节点，避免待办人进入后被带回首个节点。
  const flow = sceneWorkflow.value
  if (flow) {
    const current = contextFlow.value?.currentNode || contextFlow.value?.timeline.find((node) => node.status === 'PROCESSING')
    const activeWorkspaceKey = flow.workspaceKey(current?.nodeKey)
    if (activeWorkspaceKey) return activeWorkspaceKey
  }
  const status = task.value?.status || ''
  if (status.includes('完成')) return governanceNodes.value[governanceNodes.value.length - 1]?.key || resolveWorkspaceNodeKey(task.value?.workflow, nodeKeys.value)
  // 专属场景回退到本场景的首个办理节点，避免硬编码的 key 在别的场景里不存在导致空白。
  if (flow?.defaultNodeKey) return flow.defaultNodeKey
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

/** 专属场景且后端明确未启动流程（/flow/detail 返回 10501）时，给出显式启动入口。 */
const workflowMissing = computed(() =>
  Boolean(sceneWorkflow.value) && Boolean(backendTask.value) && !taskLoading.value && !contextFlow.value,
)
const workflowStarting = ref(false)
const workflowStartError = ref('')
async function startWorkflow() {
  const id = backendTask.value?.id
  if (!id || workflowStarting.value) return
  workflowStarting.value = true
  workflowStartError.value = ''
  try {
    await startTaskWorkflow(id, backendTask.value?.deptId)
    await loadTaskContext()
  } catch (reason) {
    workflowStartError.value = reason instanceof Error ? reason.message : '启动工作流失败，请稍后重试。'
  } finally {
    workflowStarting.value = false
  }
}

const panelComponents = {
  SpotIdentification: SpotIdentificationPanel,
  TaskDispatch: TaskDispatchPanel,
  ReviewArchive: ReviewArchivePanel,
  RouteFlightPlan: RouteFlightPlanPanel,
  RealtimeCruise: RealtimeCruisePanel,
  ScenePlaceholder: SceneNodePlaceholder,
  SupplyProjectMatching,
  SupplyPerformance,
} as const

const ActivePanel = computed(() => {
  // 专属场景的办理节点直接绑定后端流程节点，避免只读展示页代替真实办理。
  const flow = sceneWorkflow.value
  if (isForestryWorkspace.value && contextFlow.value?.flowKey === 'FOREST_LAW_ENFORCE_FLOW' && activeKey.value && flow?.isFlowNode(activeKey.value)) return ForestryWorkflowPanel
  if (flow && activeKey.value && flow.isFlowNode(activeKey.value)) return BoundWorkflowNode
  const component = activeNode.value?.component as keyof typeof panelComponents
  return panelComponents[component] || SceneNodePlaceholder
})

/** 绑定节点的办理页额外属性；非绑定节点不传，避免污染其他面板。 */
const panelExtraProps = computed(() => {
  const flow = sceneWorkflow.value
  const key = activeKey.value
  if (!flow || !key || !flow.isFlowNode(key)) return {}
  const backendKey = flow.instance(contextFlow.value, key)?.nodeKey || flow.backendKey(key)
  if (!backendKey) return {}
  if (isForestryWorkspace.value && contextFlow.value?.flowKey === 'FOREST_LAW_ENFORCE_FLOW') return { taskId: task.value?.id, nodeKey: backendKey }
  return { backendKey, showImagery: flow.showImagery(key), imageryTitle: flow.imageryTitle }
})

/**
 * 治理模块是工作台的常驻能力，不再因任务尚未写入节点级 workflow 而被锁定。
 * 巡查节点仍遵循既有的任务阶段控制；治理节点无真实数据时由各面板显示空状态。
 */
function isNodeAvailable(node: WorkspaceNodeConfig) {
  const flow = sceneWorkflow.value
  // 专属场景的办理节点跟随后端流程实例：没有实例的后续节点不进入。
  if (node.module === 'governance' && flow && flow.isFlowNode(node.key)) {
    return flow.available(contextFlow.value, node.key)
  }
  return node.module === 'governance'
    || isWorkspaceNodeAccessible(task.value?.workflow, node.key, nodeKeys.value)
}

function nodeState(key: string) {
  if (key === 'task-acceptance') return { status: 'done', accessible: Boolean(backendTask.value), active: key === activeKey.value, done: true }
  const flow = sceneWorkflow.value
  const raw = flow && flow.isFlowNode(key)
    ? flow.status(contextFlow.value, key)
    : getWorkflowNodeStatus(task.value?.workflow, key)
  const status = raw === 'completed' ? 'done' : raw
  const node = workspaceConfig.value?.nodes.find((item) => item.key === key)
  return {
    status,
    accessible: Boolean(node && isNodeAvailable(node)),
    active: key === activeKey.value || (!activeKey.value && status === 'active'),
    done: status === 'done',
  }
}

function workflowInstance(node: WorkspaceNodeConfig) {
  const flow = sceneWorkflow.value
  if (flow) {
    const bound = flow.instance(contextFlow.value, node.key)
    if (bound) return bound
  }
  return [...(contextFlow.value?.timeline || []), ...(contextFlow.value?.currentNode ? [contextFlow.value.currentNode] : [])].reverse().find(item => item.nodeKey === node.key || item.nodeName === node.name || item.nodeName === node.shortName)
}

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
    if (isNonGrainWorkspace.value || isFacilityWorkspace.value || (useDefaultTemplate.value && !sceneWorkflow.value)) return
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
  <div v-if="taskLoading" class="workspace workspace-empty">
    <section class="workspace-context" aria-label="工作台操作"><div class="workspace-brand"><div><b>场景作业工作台</b><small>正在加载真实任务</small></div></div></section>
    <main class="empty-body"><div class="empty-card"><h2>正在加载任务工作台…</h2></div></main>
  </div>

  <SupplyMonitoringWorkspace
    v-else-if="!taskError && task && isSupplyWorkspace"
    :key="task.id"
    :task-id="task.id"
    :task-name="task.name"
    :dept-id="backendTask?.deptId"
  />

  <FarmlandFacilitiesWorkspace
    v-workbench-validation
    v-else-if="!taskError && task && workspaceSceneId === 'farmland-facilities'"
    :key="task.id"
    :task-id="task.id"
    :task-name="task.name"
  />

  <NonGrainWorkspace
    v-workbench-validation
    v-else-if="!taskError && task && (workspaceSceneId === 'non-grain-monitoring' || (useDefaultTemplate && !sceneWorkflow))"
    :key="task?.id || String(route.params.taskId || '')"
    :task-id="task?.id || String(route.params.taskId || '')"
    :task-name="task?.name"
    :task-no="backendTask?.taskNo"
    :task-status="task?.status"
    :default-template="useDefaultTemplate"
  />

  <div v-else-if="taskError" class="workspace workspace-empty"><main class="empty-body"><div class="empty-card"><h2>任务读取失败</h2><p>{{ taskError }}</p><button @click="loadTaskContext">重试</button></div></main></div>

  <div v-else-if="!workspaceConfig" class="workspace workspace-empty">
    <section class="workspace-context" aria-label="工作台操作">
      <div class="workspace-brand" :class="{ 'workspace-brand--linked': user.hasPermission('unit-overview') }" @click="user.hasPermission('unit-overview') && $router.push('/dashboard')">

        <div>
          <b :title="`${currentScene?.name || '场景作业'}工作台`">{{ currentScene?.shortName || currentScene?.name || '场景作业' }}工作台</b>
          <small>{{ taskError || sceneId || '未指定场景' }}</small>
        </div>
      </div>

    </section>
    <main class="empty-body">
      <div class="empty-card">
        <h2>该场景工作台正在建设</h2>
        <p>当前仅开放林业执法监管场景的治理流程配置，其他场景将按业务配置逐步接入。</p>
        <el-button v-if="user.hasPermission('unit-overview')" type="primary" @click="$router.push('/dashboard')">返回运行中枢</el-button>
      </div>
    </main>
  </div>

  <div v-else v-workbench-validation class="workspace">
    <section class="workspace-context" aria-label="工作台操作">
      <div class="workspace-return">
        <el-button v-if="user.hasPermission('task-todo')" class="workspace-return-button" @click="$router.push('/tasks/todo')">‹ 返回任务</el-button>
      </div>

      <div class="workspace-brand workspace-brand--moved" :class="{ 'workspace-brand--linked': user.hasPermission('unit-overview') }" @click="user.hasPermission('unit-overview') && $router.push('/dashboard')">

        <div>
          <b :title="`${workspaceConfig.name}工作台`">{{ currentScene?.shortName || workspaceConfig.name }}工作台</b>
          <small>{{ task?.name || route.params.taskId || '综合工作台' }}</small>
        </div>
      </div>

      <div class="flow-nav">
        <div v-if="discoveryNodes.length" class="flow-module">
          <span class="module-label">低空巡查发现模块</span>
          <div class="module-nodes">
            <button
              v-for="node in discoveryNodes"
              :key="node.key"
              :class="[nodeState(node.key), { 'acceptance-complete': node.key === 'task-acceptance' }]"
              :data-processing="workflowInstance(node)?.status === 'PROCESSING'"
              :disabled="!nodeState(node.key).accessible"
              @click="selectNode(node)"
            >
              <div class="workflow-step-symbol"><i aria-hidden="true"></i><WorkflowActorBadge v-if="node.key !== 'task-acceptance'" :node="workflowInstance(node)" :user-id="String(user.currentUser?.id || '')" /></div>
              <span>{{ node.shortName }}</span>
            </button>
          </div>
        </div>
        <div v-if="discoveryNodes.length" class="flow-divider"></div>
        <div class="flow-module">
          <span class="module-label">治理模块</span>
          <div class="module-nodes">
            <button
              v-for="node in governanceNodes"
              :key="node.key"
              :class="[nodeState(node.key), { 'acceptance-complete': node.key === 'task-acceptance' }]"
              :data-processing="workflowInstance(node)?.status === 'PROCESSING'"
              :disabled="!nodeState(node.key).accessible"
              @click="selectNode(node)"
            >
              <div class="workflow-step-symbol"><i aria-hidden="true"></i><WorkflowActorBadge v-if="node.key !== 'task-acceptance'" :node="workflowInstance(node)" :user-id="String(user.currentUser?.id || '')" /></div>
              <span>{{ node.shortName }}</span>
            </button>
          </div>
        </div>
      </div>


    </section>

      <p v-if="workflowMissing" class="workflow-notice" role="status">
        <span>该任务尚未启动工作流，目前只能查看任务受理与本地分析节点。</span>
        <small v-if="workflowStartError">{{ workflowStartError }}</small>
        <button type="button" :disabled="workflowStarting" @click="startWorkflow">{{ workflowStarting ? '正在启动…' : '启动工作流' }}</button>
      </p>
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
        v-bind="panelExtraProps"
        @submitted="onWorkflowSubmitted"
      />
      <div v-else class="empty-body">
        <div class="empty-card">
          <h2>暂无可进入的节点</h2>
          <p v-if="workflowMissing">该任务尚未启动工作流，请点击上方"启动工作流"后再办理，或先查看任务受理。</p>
          <p v-else>当前任务没有可进入的节点，请核对任务状态与流程配置。</p>
        </div>
      </div>
    </main>
  </div>
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
.workflow-notice {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 12px 8px;
  padding: 9px 14px;
  border: 1px solid #f0d9a8;
  border-radius: 6px;
  color: #8a6d24;
  background: #fdf8ea;
  font-size: 12px;
}
.workflow-notice span { flex: 1; min-width: 0; }
.workflow-notice small { color: #b04747; }
.workflow-notice button { flex: none; height: 28px; padding: 0 14px; border: 1px solid #d8b264; border-radius: 4px; color: #6f5516; background: #fff; cursor: pointer; }
.workflow-notice button:disabled { opacity: .6; cursor: wait; }
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
