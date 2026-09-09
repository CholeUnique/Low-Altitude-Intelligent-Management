<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  forestryConfig,
  getWorkflowNodeStatus,
  isWorkspaceNodeAccessible,
  resolveWorkspaceNodeKey,
} from '@/workspace/config/forestry'
import { getScene, getTask } from '@/mocks/portal'
import { useUserStore } from '@/stores/user'
import RouteFlightPlanPanel from '@/workspace-components/route-flight-plan/RouteFlightPlanPanel.vue'
import RealtimeCruisePanel from '@/workspace-components/realtime-cruise/RealtimeCruisePanel.vue'
import SpotIdentificationPanel from '@/workspace-components/spot-identification/SpotIdentificationPanel.vue'
import TaskDispatchPanel from '@/workspace-components/task-dispatch/TaskDispatchPanel.vue'
import ReviewArchivePanel from '@/workspace-components/review-archive/ReviewArchivePanel.vue'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const currentScene = computed(() => getScene(user.organization, String(route.params.sceneId)))
const task = computed(() => {
  const taskId = route.params.taskId
  return typeof taskId === 'string' && taskId ? getTask(taskId) : undefined
})

const defaultNodeKey = computed(() => resolveWorkspaceNodeKey(task.value?.workflow))

const activeKey = computed(() => {
  const queryKey = typeof route.query.node === 'string' ? route.query.node : ''
  if (queryKey && isWorkspaceNodeAccessible(task.value?.workflow, queryKey)) return queryKey
  return defaultNodeKey.value
})

const activeNode = computed(() => forestryConfig.nodes.find((node) => node.key === activeKey.value)!)

const discoveryNodes = computed(() => forestryConfig.nodes.filter((node) => node.module === 'discovery'))
const governanceNodes = computed(() => forestryConfig.nodes.filter((node) => node.module === 'governance'))

const nodePanels = {
  'route-flight-plan': RouteFlightPlanPanel,
  'realtime-cruise': RealtimeCruisePanel,
  'spot-identification': SpotIdentificationPanel,
  'task-dispatch': TaskDispatchPanel,
  'review-archive': ReviewArchivePanel,
} as const

const ActivePanel = computed(() => nodePanels[activeKey.value as keyof typeof nodePanels] || RouteFlightPlanPanel)

function nodeState(key: string) {
  const status = getWorkflowNodeStatus(task.value?.workflow, key)
  return {
    status,
    accessible: isWorkspaceNodeAccessible(task.value?.workflow, key),
    active: key === activeKey.value,
    done: status === 'done',
  }
}

function selectNode(key: string) {
  if (!isWorkspaceNodeAccessible(task.value?.workflow, key)) return
  router.replace({ query: { ...route.query, node: key } })
}

watch(
  [defaultNodeKey, () => route.query.node, () => task.value?.id],
  () => {
    const queryKey = typeof route.query.node === 'string' ? route.query.node : ''
    if (queryKey && isWorkspaceNodeAccessible(task.value?.workflow, queryKey)) return
    if (queryKey === defaultNodeKey.value) return
    router.replace({ query: { ...route.query, node: defaultNodeKey.value } })
  },
  { immediate: true },
)
</script>

<template>
  <div class="workspace">
    <header class="workspace-header">
      <div class="workspace-brand" @click="$router.push('/dashboard')">
        <span class="brand-mark">翼</span>
        <div>
          <b>{{ currentScene?.name || '场景作业' }}工作台</b>
          <small>{{ task?.name || route.params.taskId || '综合工作台' }}</small>
        </div>
      </div>

      <div class="flow-nav">
        <div class="flow-module">
          <span class="module-label">低空巡查发现模块</span>
          <div class="module-nodes">
            <button
              v-for="node in discoveryNodes"
              :key="node.key"
              :class="nodeState(node.key)"
              :disabled="!nodeState(node.key).accessible"
              @click="selectNode(node.key)"
            >
              <i>{{ nodeState(node.key).done ? '✓' : node.order }}</i>
              <span>{{ node.shortName }}</span>
            </button>
          </div>
        </div>
        <div class="flow-divider"></div>
        <div class="flow-module">
          <span class="module-label">治理模块</span>
          <div class="module-nodes">
            <button
              v-for="node in governanceNodes"
              :key="node.key"
              :class="nodeState(node.key)"
              :disabled="!nodeState(node.key).accessible"
              @click="selectNode(node.key)"
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

    <div class="workspace-title">
      <div>
        <span>节点 {{ activeNode.order }}</span>
        <h2>{{ activeNode.name }}</h2>
        <p>{{ activeNode.description }}</p>
      </div>
      <div class="workspace-actions">
        <el-button @click="$router.push(task ? `/tasks/${task.id}` : '/tasks')">返回任务</el-button>
        <el-tag v-if="activeKey !== 'route-flight-plan'" type="info">后续完善</el-tag>
      </div>
    </div>

    <main class="workspace-body">
      <component :is="ActivePanel" :task="task" />
    </main>
  </div>
</template>

<style scoped lang="scss">
.workspace {
  height: 100vh;
  min-height: 720px;
  display: flex;
  flex-direction: column;
  background: #eef3f6;
}
.workspace-header {
  flex: 0 0 78px;
  display: grid;
  grid-template-columns: 260px 1fr 240px;
  align-items: center;
  padding: 0 16px;
  color: white;
  background: linear-gradient(100deg, #043654, #075070);
  box-shadow: 0 3px 10px #002b4633;
}
.workspace-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
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
.workspace-brand b { font-size: 15px; }
.workspace-brand small { margin-top: 3px; color: #78adbf; font-size: 10px; }

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
  font-size: 10px;
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
  font-size: 10px;
}
.module-nodes span {
  font-size: 10px;
  white-space: nowrap;
}
.module-nodes button.active {
  color: white;
}
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
  font-size: 11px;
}
.workspace-user b { color: #4ee1c2; }

.workspace-title {
  flex: 0 0 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: white;
  border-bottom: 1px solid #dce5eb;
}
.workspace-title > div:first-child {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  column-gap: 10px;
}
.workspace-title span {
  grid-row: 1 / 3;
  padding: 5px 7px;
  color: white;
  background: #0d8faa;
  border-radius: 4px;
  font-size: 9px;
}
.workspace-title h2 {
  margin: 0;
  font-size: 16px;
  color: #16384c;
}
.workspace-title p {
  margin: 2px 0 0;
  color: #8191a0;
  font-size: 11px;
}
.workspace-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 1450px) {
  .workspace-header { grid-template-columns: 220px 1fr 180px; }
  .module-nodes button { min-width: 76px; }
}
</style>
