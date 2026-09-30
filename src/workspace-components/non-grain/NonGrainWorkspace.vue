<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Component } from 'vue'
import type { NonGrainWorkflowActor, NonGrainWorkflowNode, NonGrainWorkflowNodeKey } from '@/types'
import { createNonGrainDemoTasks, createNonGrainWorkspaceContext, isNonGrainDemoTaskId, NON_GRAIN_VIEWER_NODE_KEY } from '@/mocks/non-grain-workspace'
import { getGovernanceTaskPage, type GovernanceTask } from '@/api/governance-task'
import { useUserStore } from '@/stores/user'
import { isTaskVisibleForOrganization } from '@/utils/scene-visibility'
import { getTaskWorkflowSteps, getTaskWorkspaceNodeKey, isNonGrainTask } from '@/components/task-center/TaskWorkflowProgress.vue'
import {
  canOperateNonGrainWorkflowNode,
  canViewNonGrainWorkflowNode,
  getNonGrainWorkflowNodeHint,
  returnNonGrainReviewToRectification,
  skipNonGrainRectificationToArchive,
} from '@/workspace/config/workflow'
import DashboardSymbol from '@/components/DashboardSymbol.vue'
import logoUrl from '@/assets/非粮工作台logo.png'
import TaskAcceptancePanel from './TaskAcceptancePanel.vue'
import SectionPreliminaryReviewPanel from './SectionPreliminaryReviewPanel.vue'
import DepartmentConfirmationPanel from './DepartmentConfirmationPanel.vue'
import OnSiteVerificationPanel from './OnSiteVerificationPanel.vue'
import RectificationDisposalPanel from './RectificationDisposalPanel.vue'
import DroneReviewPanel from './DroneReviewPanel.vue'
import CaseArchivePanel from './CaseArchivePanel.vue'

const props = defineProps<{ taskId?: string; taskName?: string; taskNo?: string; taskStatus?: string }>()
const route = useRoute()
const router = useRouter()
const user = useUserStore()
const context = reactive(createNonGrainWorkspaceContext(props.taskId))
const apiTasks = ref<GovernanceTask[]>([])
if (props.taskName) context.task.name = props.taskName
if (props.taskNo) context.task.taskNo = props.taskNo

function initializeWorkflowFromTaskStatus() {
  const status = props.taskStatus || ''
  const activeKey: NonGrainWorkflowNodeKey = /完成|结案/.test(status)
    ? 'case-archive'
    : /核查|复核/.test(status)
      ? 'drone-review'
      : /执行|进行/.test(status)
        ? 'on-site-verification'
        : /待执行|待处理/.test(status)
          ? 'task-acceptance'
          : context.currentNodeKey
  const activeOrder = context.workflow.find((node) => node.key === activeKey)?.order ?? 4
  const isFinished = /完成|结案/.test(status)
  context.workflow = context.workflow.map((node) => ({
    ...node,
    status: isFinished || node.order < activeOrder
      ? 'completed'
      : node.order === activeOrder
        ? 'active'
        : 'pending',
  }))
  const current = context.workflow.find((node) => node.status === 'active')
  if (current) {
    context.currentNodeKey = current.key
  }
}

initializeWorkflowFromTaskStatus()
const viewerActor: NonGrainWorkflowActor = {
  userId: context.currentActor.userId,
  roles: [...context.currentActor.roles],
}
const toast = ref<{ message: string; type: 'success' | 'warning' }>()
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(message: string, type: 'success' | 'warning' = 'success') {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { message, type }
  toastTimer = setTimeout(() => { toast.value = undefined }, 2400)
}

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
})

const panels: Record<NonGrainWorkflowNodeKey, Component> = {
  'task-acceptance': markRaw(TaskAcceptancePanel),
  'section-preliminary-review': markRaw(SectionPreliminaryReviewPanel),
  'department-confirmation': markRaw(DepartmentConfirmationPanel),
  'on-site-verification': markRaw(OnSiteVerificationPanel),
  'rectification-disposal': markRaw(RectificationDisposalPanel),
  'drone-review': markRaw(DroneReviewPanel),
  'case-archive': markRaw(CaseArchivePanel),
}

const currentWorkflowNode = computed(() =>
  context.workflow.find((node) => node.status === 'active' || node.status === 'returned')
  ?? [...context.workflow].reverse().find((node) => node.status === 'completed'),
)

function requestedNode() {
  const rawKey = typeof route.query.node === 'string' ? route.query.node : ''
  const key = rawKey === 'task-dispatch'
    ? 'on-site-verification'
    : rawKey === 'review-archive'
      ? 'case-archive'
      : rawKey
  const node = context.workflow.find((item) => item.key === key)
  return node && canViewNonGrainWorkflowNode(node) ? node : currentWorkflowNode.value
}

const selectedNode = computed(requestedNode)
const activePanel = computed(() => (selectedNode.value ? panels[selectedNode.value.key] : undefined))
const canOperate = computed(() => Boolean(selectedNode.value && canOperateNonGrainWorkflowNode(selectedNode.value, viewerActor)))
const disabledReason = computed(() => {
  if (!selectedNode.value) return '还未进行'
  if (selectedNode.value.status === 'completed') return ''
  return getNonGrainWorkflowNodeHint(selectedNode.value, viewerActor)
})
function isMyNode(node: NonGrainWorkflowNode) {
  return node.ownerUserId
    ? node.ownerUserId === viewerActor.userId
    : viewerActor.roles.includes(node.ownerRole)
}
const actorNode = computed(() => context.workflow.find(isMyNode))
const currentUserId = computed(() => String(user.currentUser?.id || user.currentUser?.username || 'non-grain-demo-user'))

function myWorkState(task: GovernanceTask) {
  if (isNonGrainTask(task)) {
    const myNode = getTaskWorkflowSteps(task).find((node) => node.key === NON_GRAIN_VIEWER_NODE_KEY)
    if (myNode?.status === 'active') return '待我处理'
    if (myNode?.status === 'done') return '我已处理'
    return ''
  }
  if (task.assigneeId !== currentUserId.value) return ''
  return [3, 4, 5].includes(task.taskStatus) ? '我已处理' : '待我处理'
}

const noticeTasks = computed(() => {
  const demoTasks = createNonGrainDemoTasks(currentUserId.value, user.activeDeptId, '海陵区农业农村局')
  const merged = [...demoTasks, ...apiTasks.value.filter((task) => !isNonGrainDemoTaskId(task.id))]
  return merged
    .filter((task) => task.id !== context.task.id && Boolean(myWorkState(task)))
    .sort((left, right) => String(left.planEndTime || '').localeCompare(String(right.planEndTime || '')))
})

async function loadNoticeTasks() {
  try {
    const page = await getGovernanceTaskPage({
      pageNum: 1,
      pageSize: 200,
      deptId: user.activeDeptId,
      organizationId: user.organizationId,
    })
    apiTasks.value = page.records.filter((task) =>
      isTaskVisibleForOrganization(user.organization, task, user.activeDeptId))
  } catch {
    apiTasks.value = []
  }
}

function openNoticeTask(task: GovernanceTask) {
  void router.push({
    name: 'workspace',
    params: { sceneId: task.sceneCode, taskId: task.id },
    query: { node: isNonGrainTask(task) ? NON_GRAIN_VIEWER_NODE_KEY : getTaskWorkspaceNodeKey(task) },
  })
}

onMounted(() => void loadNoticeTasks())

function replaceNode(key: NonGrainWorkflowNodeKey) {
  void router.replace({ query: { ...route.query, node: key } })
}

function selectNode(node: NonGrainWorkflowNode) {
  if (!canViewNonGrainWorkflowNode(node)) return
  replaceNode(node.key)
}

function setActorTo(node: NonGrainWorkflowNode | undefined) {
  if (!node) return
  context.currentNodeKey = node.key
}

function activateNext(from: NonGrainWorkflowNodeKey, to: NonGrainWorkflowNodeKey) {
  const now = new Date().toISOString()
  context.workflow = context.workflow.map((node) => {
    if (node.key === from) return { ...node, status: 'completed', completedAt: now, updatedAt: now }
    if (node.key === to) return { ...node, status: 'active', startedAt: now, updatedAt: now }
    return node
  })
  const target = context.workflow.find((node) => node.key === to)
  setActorTo(target)
  replaceNode(to)
}

function submitVerification(hasProblem: boolean) {
  if (!canOperate.value) return
  if (hasProblem) activateNext('on-site-verification', 'rectification-disposal')
  else {
    context.workflow = skipNonGrainRectificationToArchive(context.workflow, new Date().toISOString())
    const target = context.workflow.find((node) => node.key === 'case-archive')
    setActorTo(target)
    replaceNode('case-archive')
  }
  showToast(hasProblem ? '已提交，进入整改处置' : '核查无问题，已直接进入结案归档')
}

function submitRectification() {
  if (!canOperate.value) return
  activateNext('rectification-disposal', 'drone-review')
  showToast('整改处置已提交')
}

function advanceCurrentNode() {
  if (!canOperate.value || !selectedNode.value) return
  const nextNode: Partial<Record<NonGrainWorkflowNodeKey, NonGrainWorkflowNodeKey>> = {
    'task-acceptance': 'section-preliminary-review',
    'section-preliminary-review': 'department-confirmation',
    'department-confirmation': 'on-site-verification',
  }
  const target = nextNode[selectedNode.value.key]
  if (!target) return
  activateNext(selectedNode.value.key, target)
  showToast(`已完成${selectedNode.value.name}，流程已进入下一节点`)
}

function handleSubmit(payload?: boolean) {
  if (selectedNode.value?.key === 'on-site-verification') submitVerification(Boolean(payload))
  else if (selectedNode.value?.key === 'rectification-disposal') submitRectification()
}

function passReview() {
  if (!canOperate.value) return
  activateNext('drone-review', 'case-archive')
  showToast('复核通过，进入结案归档')
}

function rejectReview() {
  if (!canOperate.value) return
  context.workflow = returnNonGrainReviewToRectification(context.workflow, '无人机复核发现整改不到位', new Date().toISOString())
  const target = context.workflow.find((node) => node.key === 'rectification-disposal')
  setActorTo(target)
  replaceNode('rectification-disposal')
  showToast('已退回整改处置', 'warning')
}

function closeCase() {
  if (!canOperate.value) return
  const now = new Date().toISOString()
  context.workflow = context.workflow.map((node) =>
    node.key === 'case-archive' ? { ...node, status: 'completed', completedAt: now, updatedAt: now } : node,
  )
  replaceNode('case-archive')
  showToast('任务已确认结案并归档')
}

function saveDraft() {
  if (!canOperate.value) return
  showToast('草稿已保存，流程未推进')
}

watch(
  [() => route.query.node, () => context.workflow.map((node) => `${node.key}:${node.status}`).join('|')],
  () => {
    const queryKey = typeof route.query.node === 'string' ? route.query.node : ''
    const queryNode = context.workflow.find((node) => node.key === queryKey)
    if (queryNode && canViewNonGrainWorkflowNode(queryNode)) return
    const fallback = currentWorkflowNode.value
    if (fallback && queryKey !== fallback.key) replaceNode(fallback.key)
  },
  { immediate: true },
)
</script>

<template>
  <div class="non-grain-workspace">
    <header class="ng-header">
      <div class="ng-brand-area">
        <button class="ng-back" @click="$router.push(taskId ? `/tasks/${taskId}` : '/tasks/todo')">‹ 返回任务</button>
        <img :src="logoUrl" alt="耕地用途监管 Logo">
        <div class="ng-brand-text">
          <b>耕地用途监管工作台</b>
          <small :title="context.task.name">{{ context.task.name }}</small>
        </div>
      </div>

      <nav class="ng-steps" aria-label="任务办理步骤">
        <button
          v-for="node in context.workflow"
          :key="node.key"
          :class="[node.status, { selected: node.key === selectedNode?.key, mine: isMyNode(node) }]"
          :disabled="!canViewNonGrainWorkflowNode(node)"
          :title="getNonGrainWorkflowNodeHint(node, viewerActor)"
          @click="selectNode(node)"
        >
          <i>{{ node.status === 'completed' ? '✓' : node.order }}</i>
          <span>{{ node.name }}<em v-if="isMyNode(node)">我</em></span>
        </button>
      </nav>

      <div class="ng-header-right">
        <div class="ng-notice-shell">
          <button class="ng-notice" type="button" aria-label="我的待办通知" title="前往我的待办" @click="router.push('/tasks/todo')">
            <DashboardSymbol name="notification" />
            <b>{{ noticeTasks.length }}</b>
          </button>
          <div class="ng-notices">
            <header><strong>其他相关任务</strong><button type="button" @click="router.push('/tasks/todo')">查看全部</button></header>
            <button v-for="task in noticeTasks" :key="task.id" type="button" class="ng-notice-task" @click="openNoticeTask(task)">
              <span><b>{{ task.name }}</b><small>{{ task.taskNo }} · {{ myWorkState(task) }}</small></span>
              <time>{{ task.taskStatusDesc }}</time>
            </button>
            <p v-if="!noticeTasks.length" class="ng-notice-empty">暂无其他相关任务</p>
          </div>
        </div>
        <div class="ng-actor">
          <small>我的身份</small>
          <b>{{ actorNode?.ownerRole || '已办结' }} · {{ actorNode?.ownerName || '—' }}</b>
        </div>
      </div>
    </header>

    <Transition name="ng-toast">
      <div v-if="toast" class="ng-workspace-toast" :class="toast.type" role="status">
        <i>{{ toast.type === 'success' ? '✓' : '!' }}</i>{{ toast.message }}
      </div>
    </Transition>

    <main class="ng-workspace-body">
      <component
        :is="activePanel"
        v-if="activePanel && selectedNode"
        :context="context"
        :readonly="!canOperate"
        :disabled-reason="disabledReason"
        @advance="advanceCurrentNode"
        @draft="saveDraft"
        @submit="handleSubmit"
        @pass="passReview"
        @reject="rejectReview"
        @close="closeCase"
      />
    </main>
  </div>
</template>

<style scoped>
.non-grain-workspace {
  position: relative;
  isolation: isolate;
  height: 100dvh;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #edf3f7;
}

.ng-header {
  position: relative;
  z-index: 100;
  flex: 0 0 92px;
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(560px, 2.6fr) minmax(240px, .9fr);
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: #063353;
  border-bottom: 1px solid #14506a;
  box-shadow: 0 4px 14px #06243a99;
}

.ng-brand-area {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ng-back {
  height: 32px;
  padding: 0 10px;
  color: #d7e8f1;
  background: #0a4769;
  border: 1px solid #3b7592;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}

.ng-brand-area img {
  width: 36px;
  height: 36px;
  border: 0;
  object-fit: contain;
}

.ng-brand-text {
  min-width: 0;
}

.ng-brand-text b,
.ng-brand-text small {
  display: block;
}

.ng-brand-text b {
  color: #e4f5ff;
  font-size: 14px;
}

.ng-brand-text small {
  margin-top: 4px;
  overflow: hidden;
  color: #8eb1c3;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ng-steps {
  min-width: 0;
  display: flex;
}

.ng-steps button {
  position: relative;
  flex: 1;
  min-width: 0;
  display: grid;
  justify-items: center;
  gap: 4px;
  color: #7199ac;
  background: none;
  border: 0;
  cursor: pointer;
}

.ng-steps button:hover {
  background: transparent;
}

.ng-steps button:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 12px;
  left: calc(50% + 14px);
  width: calc(100% - 28px);
  height: 2px;
  background: #40667a;
}

.ng-steps i {
  position: relative;
  z-index: 1;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: #7199ac;
  background: rgb(217 217 217 / 22%);
  border: 1px solid #7199ac;
  border-radius: 50%;
  font-size: 11px;
  font-style: normal;
  transition: transform .22s ease, box-shadow .22s ease;
}

.ng-steps span {
  position: relative;
  font-size: 11px;
  white-space: nowrap;
}

.ng-steps span em {
  position: absolute;
  top: -21px;
  right: -13px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  color: #063353;
  background: #6fe0c3;
  border-radius: 8px;
  font-size: 9px;
  font-style: normal;
  line-height: 15px;
  text-align: center;
  box-shadow: 0 0 7px #28d6b777;
}

.ng-steps button.selected span {
  color: #fff;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: #65d9ff;
  text-decoration-thickness: 2px;
  text-underline-offset: 5px;
}

.ng-steps button.selected i {
  transform: scale(1.12);
  outline: 2px solid #ffffffb8;
  outline-offset: 2px;
}

.ng-steps .completed span {
  color: #7199ac;
}

.ng-steps .completed i {
  color: #fff;
  background: #0280a2;
  border-color: #52c4d9;
  box-shadow: 0 0 5px 4px #0a5270;
}

.ng-steps .completed:not(:last-child)::after {
  background: #52c4d9;
}

.ng-steps .active,
.ng-steps .returned {
  color: #fff;
  font-weight: 600;
}

.ng-steps .active span,
.ng-steps .returned span {
  color: #fff;
}

.ng-steps .active i,
.ng-steps .returned i {
  color: #fff;
  background: #de8d02;
  border-color: #fce505;
  box-shadow: 0 0 5px 4px rgb(247 183 3 / 30%);
}

.ng-steps .pending span {
  color: #7199ac;
}

.ng-steps button:disabled {
  cursor: not-allowed;
  opacity: .76;
}

.ng-steps button:hover i {
  transform: scale(1.06);
  animation: nodePulse .8s ease-in-out infinite alternate;
}

@keyframes nodePulse {
  from { box-shadow: 0 0 2px 1px rgb(255 255 255 / 20%); }
  to { box-shadow: 0 0 8px 5px rgb(255 255 255 / 24%); }
}

.ng-header-right {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}

.ng-notice-shell {
  position: relative;
  width: 30px;
  height: 30px;
}

.ng-notice {
  position: relative;
  width: 30px;
  height: 30px;
  padding: 0;
  display: grid;
  place-items: center;
  color: #9ec6d5;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.ng-notice :deep(svg) {
  width: 25px;
  height: 25px;
  filter: drop-shadow(0 0 5px #1ce5f577);
}

.ng-notice>b {
  position: absolute;
  top: 0;
  right: -2px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  color: #fff;
  font-size: 10px;
  line-height: 15px;
  text-align: center;
  background: #f04d62;
  border-radius: 9px;
  box-shadow: 0 0 7px #f04d62;
}

.ng-notices {
  position: absolute;
  z-index: 240;
  top: 40px;
  right: 0;
  width: 262px;
  display: none;
  padding: 12px;
  color: #4a6678;
  background: #fff;
  border: 1px solid #dbe6ed;
  border-radius: 6px;
  box-shadow: 0 10px 28px #2a4a5f2a;
}

.ng-notice-shell:hover .ng-notices,
.ng-notice-shell:focus-within .ng-notices {
  display: block;
}

.ng-notices header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ng-notices header > button {
  padding: 0;
  color: #2583c3;
  background: transparent;
  border: 0;
  font-size: 11px;
  cursor: pointer;
}

.ng-notices strong {
  color: #1f4257;
  font-size: 13px;
}

.ng-notice-task {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin: 9px 0 0;
  padding-top: 8px;
  color: #4a6678;
  background: transparent;
  border: 0;
  border-top: 1px solid #edf2f5;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.ng-notice-task:hover { color: #167ab8; background: #f5faff; }
.ng-notice-task span { min-width: 0; }
.ng-notice-task b,.ng-notice-task small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ng-notice-task b { max-width: 165px; color: #2f5268; font-size: 12px; }
.ng-notice-task small { max-width: 175px; margin-top: 3px; color: #899aa7; font-size: 10px; }
.ng-notice-empty { margin: 12px 0 0; color: #8a9ba8; font-size: 11px; text-align: center; }

.ng-notice-task time {
  flex: 0 0 auto;
}

.ng-notices time {
  color: #d48a21;
}

.ng-actor small,
.ng-actor b {
  display: block;
}

.ng-actor small {
  color: #7199ac;
  font-size: 10px;
}

.ng-actor b {
  margin-top: 4px;
  color: #e8f3f8;
  font-size: 12px;
}

.ng-workspace-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ng-workspace-toast {
  position: absolute;
  z-index: 180;
  top: 102px;
  left: 50%;
  min-width: 240px;
  max-width: min(520px, calc(100vw - 32px));
  padding: 10px 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #1d6e52;
  background: #f0fff9f5;
  border: 1px solid #83d9ba;
  border-radius: 6px;
  box-shadow: 0 8px 22px #183c5030;
  font-size: 13px;
  transform: translateX(-50%);
}

.ng-workspace-toast.warning { color: #8c6218; background: #fff9eaf5; border-color: #efcf83; }
.ng-workspace-toast i { width: 18px; height: 18px; display: grid; place-items: center; color: #fff; background: #28aa7b; border-radius: 50%; font-style: normal; }
.ng-workspace-toast.warning i { background: #e5a52e; }
.ng-toast-enter-active,.ng-toast-leave-active { transition: opacity .18s ease, transform .18s ease; }
.ng-toast-enter-from,.ng-toast-leave-to { opacity: 0; transform: translate(-50%, -8px); }

@media (max-width: 1200px) {
  .ng-header {
    grid-template-columns: minmax(230px, .95fr) minmax(500px, 2.5fr) 190px;
    padding-inline: 9px;
  }

  .ng-brand-text b {
    font-size: 12px;
  }

  .ng-brand-text small {
    max-width: 135px;
  }
}
</style>
