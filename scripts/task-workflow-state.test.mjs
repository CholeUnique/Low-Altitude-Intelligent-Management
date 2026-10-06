import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
function load(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', source)(id => dependencies[id] || require(id), module, module.exports)
  return module.exports
}
const config = load('src/workspace/config/non-grain-workflow.ts')
const state = load('src/utils/task-workflow-state.ts', { '../workspace/config/non-grain-workflow': config })
const node = (key, status, assigneeId = '1', id = key) => ({ id, bizTaskId: '900', nodeKey: key, nodeName: key, nodeType: 'REVIEW', status, assigneeId })
const completed = node('task-acceptance', 'COMPLETED')
const active = node('drone-review', 'PROCESSING')
const pending = node('case-archive', 'PENDING')
const flow = { flowInstanceId: 'flow', status: 'RUNNING', timeline: [completed, active, pending], currentNode: active }
assert.equal(state.myTaskWorkState(undefined, '1'), undefined, '未启动流程不能冒充待办')
assert.equal(state.myTaskWorkState(flow, '1'), 'pending', '本人当前节点是待办')
assert.equal(state.myTaskWorkState(flow, '2'), undefined, '他人节点不计入本人待办')
assert.equal(state.myTaskWorkState({ ...flow, currentNode: { ...active, assigneeId: '2' }, timeline: [completed, { ...active, assigneeId: '2' }] }, '1'), 'handled', '流程推进后保留本人已办')
assert.equal(state.canOperateWorkflowNode(active, '1'), true)
assert.equal(state.canOperateWorkflowNode(active, '2'), false, '管理员也不能替他人节点操作')
assert.equal(state.canOperateWorkflowNode(completed, '1'), false)
assert.equal(state.canViewWorkflowNode(pending), false, '未进行节点不能打开')
assert.equal(state.canViewWorkflowNode(completed), true)
const projection = state.nonGrainWorkflow(flow)
assert.equal(projection[0].status, 'completed')
assert.equal(projection[5].status, 'active')
assert.equal(projection[6].status, 'pending')
assert.equal(projection[5].instance.assigneeId, '1')
const reassigned = node('drone-review', 'PROCESSING', '2', 'new-instance')
const transferred = { ...active, status: 'TRANSFERRED' }
const transferFlow = { ...flow, timeline: [completed, transferred, reassigned], currentNode: reassigned }
assert.equal(state.nonGrainWorkflow(transferFlow)[5].instance.assigneeId, '2', '转办使用最新节点实例')
assert.equal(state.myTaskWorkState(transferFlow, '1'), 'handled')
assert.equal(state.nonGrainNodeKey({ ...active, nodeKey: 'unknown', nodeName: '无人机复核' }), 'drone-review')
assert.equal(state.nonGrainNodeKey({ ...active, nodeKey: 'unknown', nodeName: 'unknown' }), undefined, '不能猜测未知节点进度')
const realReview = { ...active, nodeKey: 'REVIEW_CITY', nodeName: '市级审核', nodeType: 'REVIEW', assigneeId: '692' }
assert.equal(state.nonGrainNodeKey(realReview), 'section-preliminary-review', '真实非粮化首审映射为科室初核')
assert.equal(state.nonGrainWorkflow({ ...flow, timeline: [realReview], currentNode: realReview })[1].status, 'active')
assert.equal(state.canOperateWorkflowNode(realReview, '692'), true)
assert.equal(state.canOperateWorkflowNode(realReview, '1'), false)
const accepted = state.nonGrainWorkflow({ ...flow, timeline: [realReview], currentNode: realReview }, true)
assert.equal(accepted[0].status, 'completed', '已创建任务的任务受理页必须显示已完成')
assert.equal(accepted[0].viewable, true, '任务受理作为详情回看页可打开')
assert.equal(accepted[0].instance, undefined, '不能伪造后端受理节点实例')
assert.equal(state.canOperateWorkflowNode(accepted[0].instance, '692'), false)
assert.equal(accepted[1].instance.id, realReview.id, '初核仍使用真实办理实例')
assert.equal(accepted[2].viewable, false, '尚未进入的后续节点仍然锁定')
console.log('PASS: workflow assignment, history, permissions, states, and transfer cases')

const listState = load('src/utils/task-list-workflow.ts', { './task-workflow-state': state })
const waitingTask = { id: '1314', name: '111', sceneCode: 'CULTIVATED_LAND_USE_CONTROL', taskStatus: 0, taskStatusDesc: '待执行', createTime: '2026-10-06T22:47:22' }
const reviewFlow = { flowInstanceId: '2', status: 'RUNNING', timeline: [realReview], currentNode: realReview }
const displayed = listState.projectTaskListWorkflow(waitingTask, reviewFlow)
assert.equal(displayed.taskStatus, 1, '工作流运行中不能仍显示待执行，执行中筛选必须能找到它')
assert.equal(displayed.taskStatusDesc, '科室初核处理中')
assert.deepEqual(displayed.workflow.map(step => step.name), ['待执行', '科室初核'])
assert.deepEqual(displayed.workflow.map(step => step.status), ['done', 'active'])
assert.equal(waitingTask.taskStatus, 0, '列表显示投影不修改原始接口数据')
assert.equal(listState.projectTaskListWorkflow(waitingTask, undefined), waitingTask, '未启动流程保留真实业务状态')
const departmentNode = { ...realReview, id: 'next', nodeKey: 'department-confirmation', nodeName: '部门确认' }
const advanced = listState.projectTaskListWorkflow(waitingTask, { ...reviewFlow, timeline: [{ ...realReview, status: 'COMPLETED' }, departmentNode, pending], currentNode: departmentNode })
assert.deepEqual(advanced.workflow.map(step => step.name), ['待执行', '科室初核', '部门确认'], '只追加实际已产生节点，不显示预置未来节点')
assert.equal(advanced.taskStatusDesc, '部门确认处理中')
const looped = listState.projectTaskListWorkflow(waitingTask, { ...reviewFlow, timeline: [{ ...realReview, id: 'old', status: 'COMPLETED' }, realReview], currentNode: realReview })
assert.equal(looped.workflow.length, 3, '循环节点保留不同实例，只去重当前节点与时间线的同一实例')
assert.equal(listState.projectTaskListWorkflow({ ...waitingTask, taskStatus: 4, taskStatusDesc: '已取消' }, reviewFlow).taskStatus, 4)
assert.equal(listState.projectTaskListWorkflow(waitingTask, { ...reviewFlow, status: 'FINISHED', timeline: [{ ...realReview, status: 'COMPLETED' }], currentNode: undefined }).taskStatus, 5)
console.log('PASS: list status, workflow history, next node, loops, filtering status and source immutability')

const ownerReview = { ...realReview, nodeKey: 'REVIEW_OWNER', nodeName: '场景负责人审核', bizTaskId: '900' }
assert.equal(state.nonGrainNodeKey(ownerReview), 'section-preliminary-review', '任务900最新后端首节点映射为科室初核')
assert.equal(state.canOperateWorkflowNode(ownerReview, '692'), true)
assert.equal(state.workflowNodeDisplayName(ownerReview, 'CULTIVATED_LAND_USE_CONTROL'), '科室初核')
assert.equal(state.nonGrainWorkflow({ ...reviewFlow, currentNode: ownerReview, timeline: [ownerReview] }, true)[1].status, 'active')
assert.equal(listState.projectTaskListWorkflow(waitingTask, { ...reviewFlow, currentNode: ownerReview, timeline: [ownerReview] }).taskStatusDesc, '科室初核处理中')
console.log('PASS: REVIEW_OWNER real non-grain first node and assignee permissions')
