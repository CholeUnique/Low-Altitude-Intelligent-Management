<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { nonGrainWorkflow, nonGrainNodeKey, isNodeMine, canOperateWorkflowNode } from '@/utils/task-workflow-state'
import { getMyWorkflowTasks, type MyWorkflowTask } from '@/api/my-workflow-tasks'
import { getTaskWorkflow, type TaskWorkflow } from '@/api/task-workflow'
import { useUserStore } from '@/stores/user'
import DashboardSymbol from '@/components/DashboardSymbol.vue'
import NonGrainNodePanel from './NonGrainNodePanel.vue'
import TaskAcceptancePanel from '@/workspace-components/shared/TaskAcceptancePanel.vue'
import NonGrainPreliminaryReviewPanel from './NonGrainPreliminaryReviewPanel.vue'
import NonGrainInspectionPanel from './NonGrainInspectionPanel.vue'
import NonGrainArchivePanel from './NonGrainArchivePanel.vue'
import NonGrainRectificationPanel from './NonGrainRectificationPanel.vue'
import NonGrainDroneReviewPanel from './NonGrainDroneReviewPanel.vue'
import WorkbenchReadonlyHint from '@/workspace-components/shared/WorkbenchReadonlyHint.vue'
import logoUrl from '@/assets/非粮工作台logo.png'

const props = defineProps<{ taskId?: string; taskName?: string; taskNo?: string; taskStatus?: string }>()
const route = useRoute()
const router = useRouter()
const user = useUserStore()
const flow = ref<TaskWorkflow>()
const todos = ref<MyWorkflowTask[]>([])
const noticeError = ref('')
const flowError = ref('')
let version = 0
const flowLoading = ref(true)
const workflow = computed(() => nonGrainWorkflow(flow.value, Boolean(props.taskId)))
const currentKey = computed(() => {
  const current = flow.value?.currentNode || flow.value?.timeline.find(node => node.status === 'PROCESSING')
  const key = current ? nonGrainNodeKey(current) : undefined
  return workflow.value.find(node => node.key === key && node.viewable)?.key || [...workflow.value].reverse().find(node => node.viewable)?.key
})
const selectedKey = computed(() => {
  const requested = workflow.value.find(node => node.key === route.query.node && node.viewable)
  return requested?.key || currentKey.value
})
const selectedNode = computed(() => workflow.value.find(node => node.key === selectedKey.value))
const canOperate = computed(() => canOperateWorkflowNode(selectedNode.value?.instance, String(user.currentUser?.id || '')))
const workbenchBody = ref<HTMLElement | null>(null)
const readonlyControlHint = computed(() => {
  if (selectedNode.value?.status === 'completed') return '已完成工作，无法更改'
  return selectedNode.value?.instance && !canOperate.value ? '没有工作权限' : ''
})
const noticeTasks = computed(() => todos.value.filter(task => task.id !== props.taskId))
function isMyNode(node: typeof workflow.value[number]) { return Boolean(node.instance && isNodeMine(node.instance, String(user.currentUser?.id || ''))) }
function selectNode(node: typeof workflow.value[number]) {
  if (!node.viewable) return
  void router.replace({ query: { ...route.query, node: node.key } })
}
function nodeHint(node: typeof workflow.value[number]) {
  if (!node.viewable) return '还未进行到此流程'
  if (node.status === 'active' && !isMyNode(node)) return '由其他办理人处理，可查看办理页面'
  return node.status === 'completed' ? '已处理，当前页面只读' : '本人办理节点'
}
function openNoticeTask(task: MyWorkflowTask) { void router.push({ name: 'workspace', params: { sceneId: task.sceneCode, taskId: task.id } }) }
async function inspectionSubmitted() {
  await loadHeader()
  // 提交后优先展示后端实际进入的下一节点；旧节点仍能从流程图回看。
  const query = { ...route.query }
  delete query.node
  await router.replace({ query })
}
async function loadHeader() {
  const current = ++version
  flowLoading.value = true; flow.value = undefined; todos.value = []; noticeError.value = ''; flowError.value = ''
  const responses = await Promise.allSettled([
    props.taskId ? getTaskWorkflow(props.taskId) : Promise.resolve(undefined),
    getMyWorkflowTasks(String(user.currentUser?.id || ''), user.activeDeptId),
  ])
  if (current !== version) return
  if (responses[0].status === 'fulfilled') flow.value = responses[0].value
  else flowError.value = responses[0].reason instanceof Error ? responses[0].reason.message : '工作流读取失败'
  if (responses[1].status === 'fulfilled') todos.value = responses[1].value.records
  if (responses[1].status === 'fulfilled') noticeError.value = responses[1].value.warnings.join('；')
  else noticeError.value = responses[1].reason instanceof Error ? responses[1].reason.message : '待办读取失败'
  flowLoading.value = false
}
watch([() => props.taskId, () => user.activeDeptId], () => void loadHeader(), { immediate: true })
</script>

<template>
  <div class="non-grain-workspace">
    <header class="ng-header">
      <div class="ng-brand-area">
        <button class="ng-back" @click="router.push('/tasks/todo')">‹ 返回任务</button>
        <img :src="logoUrl" alt="耕地用途监管 Logo">
        <div class="ng-brand-text">
          <b>耕地用途监管工作台</b>
          <small :title="taskName">{{ taskName }}</small>
        </div>
      </div>

      <nav class="ng-steps" aria-label="任务办理步骤">
        <button
          v-for="node in workflow"
          :key="node.key"
          :class="[node.status, { selected: node.key === selectedKey, mine: isMyNode(node) }]"

          :title="nodeHint(node)"
          :aria-disabled="!node.viewable"
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
              <span><b>{{ task.name }}</b><small>{{ task.taskNo }} · {{ task.myWorkState === 'pending' ? '待我处理' : '我已处理' }}</small></span>
              <time>{{ task.taskStatusDesc }}</time>
            </button>
            <p v-if="noticeError" class="ng-notice-empty">{{ noticeError }}</p>
            <p v-else-if="!noticeTasks.length" class="ng-notice-empty">暂无其他相关任务</p>
          </div>
        </div>
        <div class="ng-actor">
          <small>当前用户</small>
          <b>{{ user.name }}</b>
        </div>
      </div>
    </header>

    <WorkbenchReadonlyHint :root="workbenchBody" :message="readonlyControlHint" :page-key="selectedKey" />
    <main ref="workbenchBody" class="ng-workspace-body">
      <TaskAcceptancePanel v-if="selectedKey === 'task-acceptance'" :task-id="taskId" />
      <NonGrainPreliminaryReviewPanel v-else-if="selectedKey === 'section-preliminary-review'" :task-id="taskId" :flow-error="flowError" :readonly="!canOperate" @submitted="loadHeader" />
      <NonGrainPreliminaryReviewPanel v-else-if="selectedKey === 'department-confirmation'" stage="department" :task-id="taskId" :flow-error="flowError" :readonly="!canOperate" @submitted="loadHeader" />
      <NonGrainInspectionPanel v-else-if="selectedKey === 'on-site-verification'" :task-id="taskId" :flow-error="flowError" :readonly="!canOperate" @submitted="inspectionSubmitted" />
      <NonGrainRectificationPanel v-else-if="selectedKey === 'rectification-disposal'" :task-id="taskId" :flow-error="flowError" :readonly="!canOperate" @submitted="inspectionSubmitted" />
      <NonGrainDroneReviewPanel v-else-if="selectedKey === 'drone-review'" :task-id="taskId" :flow-error="flowError" :readonly="!canOperate" @submitted="inspectionSubmitted" />
      <NonGrainArchivePanel v-else-if="selectedKey === 'case-archive'" :task-id="taskId" :flow-error="flowError" :readonly="!canOperate" @submitted="loadHeader" />
      <NonGrainNodePanel v-else :task-id="taskId" :node-key="selectedKey" :flow-error="flowError" :flow-loading="flowLoading" :readonly="!canOperate" />
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
  z-index: 0;
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
  z-index: 2;
  font-size: 11px;
  white-space: nowrap;
}

.ng-steps span em {
  position: absolute;
  z-index: 3;
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

.ng-steps button.completed.selected span { color: #7199ac; }

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

.ng-steps button[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 1;
}

.ng-steps button:hover i {
  transform: scale(1.06);
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
  top: 30px;
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

.ng-notices::before { content: ''; position: absolute; top: -10px; left: 0; right: 0; height: 10px; }

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
