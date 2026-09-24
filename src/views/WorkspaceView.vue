<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { WorkspaceNodeConfig } from '@/types'
import {
  getWorkflowNodeStatus,
  isWorkspaceNodeAccessible,
  resolveWorkspaceNodeKey,
} from '@/workspace/config/workflow'
import { getSharedWorkspaceConfig, resolveWorkspaceSceneId } from '@/workspace/config/registry'
import { getScene, getTask } from '@/mocks/portal'
import { useUserStore } from '@/stores/user'
import { isMockMode } from '@/api/client'
import { getGovernanceTaskDetail, toPatrolTask } from '@/api/governance-task'
import type { PortalTask } from '@/types'
import SpotIdentificationPanel from '@/workspace-components/spot-identification/SpotIdentificationPanel.vue'
import TaskDispatchPanel from '@/workspace-components/task-dispatch/TaskDispatchPanel.vue'
import ReviewArchivePanel from '@/workspace-components/review-archive/ReviewArchivePanel.vue'
import SceneNodePlaceholder from '@/workspace-components/shared/SceneNodePlaceholder.vue'
import RouteFlightPlanPanel from '@/workspace-components/route-flight-plan/RouteFlightPlanPanel.vue'
import RealtimeCruisePanel from '@/workspace-components/realtime-cruise/RealtimeCruisePanel.vue'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const sceneId = computed(() => String(route.params.sceneId || ''))
const task = ref<PortalTask>()
const taskLoading = ref(false)
const taskError = ref('')
const workspaceSceneId = computed(() => resolveWorkspaceSceneId(sceneId.value, task.value?.sceneId))
// 不同场景使用各自任务数据，但统一复用林业执法监管的完整工作台流程与页面。
const workspaceConfig = computed(() => getSharedWorkspaceConfig())
const currentScene = computed(() => getScene(user.organization, workspaceSceneId.value))

async function loadTaskContext() {
  const taskId = typeof route.params.taskId === 'string' ? route.params.taskId : ''
  task.value = undefined
  taskError.value = ''
  if (!taskId) return
  if (isMockMode()) {
    task.value = getTask(taskId)
    return
  }
  taskLoading.value = true
  try {
    const detail = await getGovernanceTaskDetail(taskId)
    task.value = detail ? toPatrolTask(detail.task) : undefined
    if (!task.value) taskError.value = '未找到该真实业务任务，或当前账号没有查看权限。'
  } catch (error) {
    taskError.value = error instanceof Error ? error.message : '真实任务上下文加载失败。'
  } finally {
    taskLoading.value = false
  }
}

const nodeKeys = computed(() => workspaceConfig.value?.nodes.map((node) => node.key) ?? [])

const governanceNodes = computed(() =>
  workspaceConfig.value?.nodes.filter((node) => node.key === 'task-dispatch' || node.key === 'review-archive') ?? [],
)

const discoveryNodes = computed<WorkspaceNodeConfig[]>(() => [])

/** 真实任务只有粗粒度 taskStatus 时，映射为工作台五节点中的当前节点。 */
const defaultNodeKey = computed(() => {
  const status = task.value?.status || ''
  if (status.includes('完成')) return governanceNodes.value[governanceNodes.value.length - 1]?.key || resolveWorkspaceNodeKey(task.value?.workflow, nodeKeys.value)
  if (status.includes('核查') || status.includes('复核')) return governanceNodes.value[0]?.key || resolveWorkspaceNodeKey(task.value?.workflow, nodeKeys.value)
  return governanceNodes.value[0]?.key || resolveWorkspaceNodeKey(task.value?.workflow, nodeKeys.value)
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

function nodeState(key: string) {
  const status = getWorkflowNodeStatus(task.value?.workflow, key)
  const node = workspaceConfig.value?.nodes.find((item) => item.key === key)
  return {
    status,
    accessible: Boolean(node && isNodeAvailable(node)),
    active: key === activeKey.value || (!activeKey.value && status === 'active'),
    done: status === 'done',
  }
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

watch(() => route.params.taskId, () => void loadTaskContext())
onMounted(() => void loadTaskContext())
</script>

<template>
  <div v-if="taskLoading" class="workspace workspace-empty">
    <header class="workspace-header"><div class="workspace-brand"><span class="brand-mark">翼</span><div><b>场景作业工作台</b><small>正在加载真实任务</small></div></div></header>
    <main class="empty-body"><div class="empty-card"><h2>正在加载任务工作台…</h2></div></main>
  </div>

  <div v-else-if="!workspaceConfig" class="workspace workspace-empty">
    <header class="workspace-header">
      <div class="workspace-brand" @click="$router.push('/dashboard')">
        <span class="brand-mark">翼</span>
        <div>
          <b :title="`${currentScene?.name || '场景作业'}工作台`">{{ currentScene?.shortName || currentScene?.name || '场景作业' }}工作台</b>
          <small>{{ taskError || sceneId || '未指定场景' }}</small>
        </div>
      </div>
      <div class="workspace-user"><span>{{ user.name }}</span></div>
    </header>
    <main class="empty-body">
      <div class="empty-card">
        <h2>该场景工作台正在建设</h2>
        <p>当前仅开放林业执法监管场景的治理流程配置，其他场景将按业务配置逐步接入。</p>
        <el-button type="primary" @click="$router.push('/dashboard')">返回运行中枢</el-button>
      </div>
    </main>
  </div>

  <div v-else class="workspace">
    <header class="workspace-header">
      <div class="workspace-return">
        <el-button class="workspace-return-button" @click="$router.push(task ? `/tasks/${task.id}` : '/tasks')">‹ 返回任务</el-button>
      </div>

      <div class="workspace-brand workspace-brand--moved" @click="$router.push('/dashboard')">
        <span class="brand-mark">翼</span>
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
              :class="nodeState(node.key)"
              :disabled="!nodeState(node.key).accessible"
              @click="selectNode(node)"
            >
              <i>{{ nodeState(node.key).done ? '✓' : node.order }}</i>
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
              :class="nodeState(node.key)"
              :disabled="!nodeState(node.key).accessible"
              @click="selectNode(node)"
            >
              <i>{{ nodeState(node.key).done ? '✓' : node.order }}</i>
              <span>{{ node.shortName }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="workspace-user">
        <span>今日任务 <b>{{ user.organizationId === 'agriculture-rural' ? 22 : 18 }}</b></span>
        <span>待办 <b>12</b></span>
        <span>{{ user.name }}</span>
      </div>
    </header>

    <main class="workspace-body">
      <component
        v-if="activeKey && activeNode"
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
.workspace-header {
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
  cursor: pointer;
}
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
.workspace-brand small { margin-top: 3px; color: #78adbf; font-size: 11px; }

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
  font-size: 11px;
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
  font-size: 11px;
}
.module-nodes span {
  font-size: 11px;
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
  .workspace-header { grid-template-columns: 220px 1fr 180px; }
  .workspace-brand--moved { left: 120px; }
  .module-nodes button { min-width: 76px; }
}
@media (max-width: 1120px) {
  .workspace-header { grid-template-columns: 205px minmax(0, 1fr) 150px; padding-inline: 10px; }
  .workspace-brand--moved { left: 105px; }.module-label { display: none; }.module-nodes button { min-width: 64px; }.module-nodes span { font-size: 10px; }.workspace-user { gap: 7px; font-size: 11px; }
}
@media (max-height: 700px) { .workspace-header { flex-basis: 62px; } }
</style>
