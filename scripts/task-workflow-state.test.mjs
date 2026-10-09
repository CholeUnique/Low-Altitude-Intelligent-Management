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
const todoState = load('src/utils/task-todo-state.ts')
assert.equal(todoState.todoTaskStatus({ myWorkState: 'handled', taskStatus: 0, flow: { status: 'FINISHED' } }), 'archived', '真实结案优先于已办和滞后的任务状态')
assert.equal(todoState.todoTaskStatus({ myWorkState: 'handled', taskStatus: 1, flow: { status: 'RUNNING' } }), 'handled')
assert.equal(todoState.todoTaskStatus({ myWorkState: 'pending', taskStatus: 5, flow: { status: 'RUNNING' } }), 'pending', '流程仍运行时不采用错误的已完成业务状态')
assert.equal(todoState.todoTaskStatus({ myWorkState: 'scene', taskStatus: 0 }), 'pending')
assert.equal(todoState.todoTaskStatus({ myWorkState: 'scene', taskStatus: 5 }), 'archived')
assert.equal(todoState.todoTaskStatusLabel({ myWorkState: 'scene', taskStatus: 0, flow: { status: 'COMPLETED' } }), '已结案')
console.log('PASS: todo handled/pending/archived filters and workflow status priority')
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
const transferredProgress = listState.projectTaskListWorkflow(waitingTask, transferFlow)
assert.equal(transferredProgress.workflow.filter(step => step.name === '无人机复核').length, 1, '改派旧实例不重复绘制为已完成节点')
assert.equal(listState.projectTaskListWorkflow({ ...waitingTask, taskStatus: 4, taskStatusDesc: '已取消' }, reviewFlow).taskStatus, 4)
assert.equal(listState.projectTaskListWorkflow(waitingTask, { ...reviewFlow, status: 'FINISHED', timeline: [{ ...realReview, status: 'COMPLETED' }], currentNode: undefined }).taskStatus, 5)
console.log('PASS: list status, workflow history, next node, loops, filtering status and source immutability')

const sortTask = (id, state, priority, createTime, myDeadline) => ({ id, myWorkState: state, priority, createTime, myDeadline })
const sortingTasks = [
  sortTask('handled', 'handled', 0, '2026-10-10', '2026-10-11'),
  sortTask('high', 'pending', 2, '2026-10-10', '2026-10-12'),
  sortTask('low-old', 'pending', 0, '2026-10-08', undefined),
  sortTask('low-new', 'pending', 0, '2026-10-09', '2026-10-15'),
  sortTask('medium', 'pending', 1, '2026-10-10', '2026-10-13'),
]
assert.deepEqual([...sortingTasks].sort(todoState.compareTodoTasks).map(t => t.id), ['low-new', 'low-old', 'medium', 'high', 'handled'])
assert.deepEqual([...sortingTasks].sort((a,b) => todoState.compareTodoTasks(a,b,'asc')).map(t => t.id), ['handled', 'high', 'medium', 'low-new', 'low-old'])
assert.deepEqual([...sortingTasks].sort((a,b) => todoState.compareTodoTasks(a,b,'desc')).map(t => t.id), ['low-new', 'medium', 'high', 'handled', 'low-old'])
console.log('PASS: default pending/priority/creation sort and explicit own-node deadline sorts')

const ownerReview = { ...realReview, nodeKey: 'REVIEW_OWNER', nodeName: '场景负责人审核', bizTaskId: '900' }
assert.equal(state.nonGrainNodeKey(ownerReview), 'section-preliminary-review', '任务900最新后端首节点映射为科室初核')
assert.equal(state.canOperateWorkflowNode(ownerReview, '692'), true)
assert.equal(state.workflowNodeDisplayName(ownerReview, 'CULTIVATED_LAND_USE_CONTROL'), '科室初核')
assert.equal(state.nonGrainWorkflow({ ...reviewFlow, currentNode: ownerReview, timeline: [ownerReview] }, true)[1].status, 'active')
assert.equal(listState.projectTaskListWorkflow(waitingTask, { ...reviewFlow, currentNode: ownerReview, timeline: [ownerReview] }).taskStatusDesc, '科室初核处理中')
console.log('PASS: REVIEW_OWNER real non-grain first node and assignee permissions')

const county = { ...realReview, id: 'next-node', nodeKey: 'REVIEW_COUNTY', nodeName: '区县审核', assigneeId: '694', bizTaskId: '1314' }
const completedCity = { ...realReview, status: 'COMPLETED', bizTaskId: '1314', resultData: { result: 'FORWARD', opinion: '疑似非粮化，建议下发核查' } }
const forwardedFlow = { ...reviewFlow, timeline: [completedCity, county], currentNode: county }
assert.equal(state.workflowNodeDisplayName(county, waitingTask.sceneCode), '部门确认')
assert.equal(state.nonGrainWorkflow(forwardedFlow, true)[1].status, 'completed')
assert.equal(state.nonGrainWorkflow(forwardedFlow, true)[2].status, 'active')
assert.equal(state.canOperateWorkflowNode(county, '694'), true)
assert.equal(state.canOperateWorkflowNode(county, '692'), false)
assert.equal(state.myTaskWorkState(forwardedFlow, '692'), 'handled')
assert.equal(state.myTaskWorkState(forwardedFlow, '694'), 'pending')
const pagination = { collectPages: async fn => (await fn(1, 200)).records }
const myTasks = load('src/api/my-workflow-tasks.ts', {
  './scene': { getBizSceneAssignees: async () => [] },
  './governance-task': {
    getMyTodoTaskPage: async () => ({ records: [] }),
    getGovernanceTaskPage: async () => ({ records: [] }),
    getGovernanceTaskDetail: async id => { assert.equal(id, '1314'); return { task: waitingTask } },
  },
  './task-workflow': { getTaskWorkflow: async () => forwardedFlow, getWorkflowTodos: async () => [county], workflowSteps: f => f.timeline.map(n => ({ key: n.nodeKey, name: n.nodeName, status: n.status })) },
  './pagination': pagination,
  '@/utils/task-workflow-state': state,
  '@/utils/task-list-workflow': listState,
})
const recipientTodos = await myTasks.getMyWorkflowTasks('694', '1')
assert.equal(recipientTodos.records.length, 1, '业务负责人接口没有任务时，仍从真实工作流待办补全接收人的任务')
assert.equal(recipientTodos.records[0].myWorkState, 'pending')
assert.equal(recipientTodos.records[0].myNodes[0].nodeKey, 'REVIEW_COUNTY')
assert.equal(recipientTodos.records[0].workflow.at(-1).name, '部门确认')
assert.equal((await myTasks.getMyWorkflowTasks('692', '1')).records[0].myWorkState, 'handled')
let namedFlow = forwardedFlow
const namedTodos = load('src/api/my-workflow-tasks.ts', {
  './scene': { getBizSceneAssignees: async () => [] },
  './governance-task': {
    getMyTodoTaskPage: async () => ({ records: [{ ...waitingTask, name: '旧待办名称' }] }),
    getGovernanceTaskPage: async () => ({ records: [{ ...waitingTask, name: '列表名称' }] }),
    getGovernanceTaskDetail: async () => ({ task: { ...waitingTask, name: '用户最新填写的任务名称' } }),
  },
  './task-workflow': { getTaskWorkflow: async () => namedFlow, getWorkflowTodos: async () => [county] },
  './pagination': pagination,
  '@/utils/task-workflow-state': state,
  '@/utils/task-list-workflow': listState,
})
assert.equal((await namedTodos.getMyWorkflowTasks('694', '1')).records[0].name, '用户最新填写的任务名称', '待办使用当前业务任务名称，不被旧待办记录覆盖')
const oldOwnedNode = { ...county, id: 'old-owned', status: 'COMPLETED', deadline: '2026-10-01T12:00:00' }
namedFlow = { ...forwardedFlow, timeline: [completedCity, oldOwnedNode, county] }
assert.equal((await namedTodos.getMyWorkflowTasks('694', '1')).records[0].myDeadline, undefined, '当前本人节点未设截止时间，不能沿用上一轮的截止时间')
const datedCounty = { ...county, deadline: '2026-11-05T18:00:00' }
namedFlow = { ...forwardedFlow, timeline: [completedCity, datedCounty], currentNode: datedCounty }
assert.equal((await namedTodos.getMyWorkflowTasks('694', '1')).records[0].myDeadline, datedCounty.deadline, '截止日期使用本人节点，而非任务日期')
namedFlow = { ...forwardedFlow, timeline: [{ ...completedCity, deadline: '2026-10-09T18:00:00' }, datedCounty], currentNode: datedCounty }
assert.equal((await namedTodos.getMyWorkflowTasks('692', '1')).records[0].myDeadline, '2026-10-09T18:00:00', '已处理任务仍显示本人的历史办理截止时间')
const restoredSceneTasks = load('src/api/my-workflow-tasks.ts', {
  './scene': { getBizSceneAssignees: async () => [{ sceneCode: waitingTask.sceneCode, deptId: 1, assigneeId: 773 }] },
  './governance-task': {
    getMyTodoTaskPage: async () => ({ records: [] }),
    getGovernanceTaskPage: async () => ({ records: [waitingTask, { ...waitingTask, id: 'not-started' }, { ...waitingTask, id: 'other-scene', sceneCode: 'OTHER' }] }),
    getGovernanceTaskDetail: async () => ({ task: waitingTask }),
  },
  './task-workflow': { getTaskWorkflow: async id => id === 'not-started' ? undefined : forwardedFlow, getWorkflowTodos: async () => [], workflowSteps: f => f.timeline.map(n => ({ key: n.nodeKey, name: n.nodeName, status: n.status })) },
  './pagination': pagination,
  '@/utils/task-workflow-state': state,
  '@/utils/task-list-workflow': listState,
})
const restoredHistory = await restoredSceneTasks.getMyWorkflowTasks('773', '1')
assert.equal(restoredHistory.records.length, 2, '现任场景负责人可查看旧账号关联任务和未启动任务，排除其他场景')
assert.ok(restoredHistory.records.every(task => task.myWorkState === 'scene' && task.myNodes.length === 0), '历史任务不能假冒新账号待办或已办')
assert.equal(restoredHistory.records.find(task => task.id === '1314').flow.timeline[0].assigneeId, '692', '保留原历史办理人')
assert.equal((await restoredSceneTasks.getMyWorkflowTasks('999', '1')).records.length, 0, '其他用户不能因场景负责人配置扩大历史范围')
assert.equal((await restoredSceneTasks.getMyWorkflowTasks('773', '2')).records.length, 0, '场景负责人历史按部门隔离')
console.log('PASS: recreated scene owner history, unstarted tasks, actual identity, other users and department isolation')
const assignmentCalls = []
const assignment = load('src/api/non-grain-assignment.ts', {
  './account-management': {
    getDeptUserPage: async query => { assert.equal(query.keyword, 'nyncKZ'); assert.equal(query.includeChild, false); return { records: query.deptId === '1' ? [{ id: '1', username: 'admin' }, { id: '692', username: 'nyncKZ' }] : [], total: 2, pageSize: 100 } },
  },
  './client': { apiClient: { post: async (url, body) => { assignmentCalls.push({ url, body }) } }, ApiBusinessError: class extends Error {} },
  './task-workflow': { getTaskWorkflow: async () => reviewFlow },
})
globalThis.window = { dispatchEvent: () => {} }
assert.equal(await assignment.getNonGrainReviewerId('1'), '692')
await assert.rejects(assignment.getNonGrainReviewerId('2'), /未找到/)
await assignment.assignNonGrainReview('1314', '1', '692')
assert.deepEqual(assignmentCalls, [{ url: '/v1/workflow/start', body: { bizTaskId: '1314', deptId: '1', assigneeId: '692' } }])
delete globalThis.window
console.log('PASS: county handoff, recipient todo fallback, completed reviewer history and nyncKZ startup assignment')

const dataErrors = load('src/workspace-components/shared/task-data-errors.ts')
for (const index of [2, 3]) {
  assert.equal(dataErrors.shouldShowTaskDataError(index, new Error('无权限访问'), true), false, '已完成节点的可选材料访问限制不遮挡回看')
  assert.equal(dataErrors.shouldShowTaskDataError(index, { response: { status: 403 } }, true), false)
  assert.equal(dataErrors.shouldShowTaskDataError(index, new Error('网络连接失败'), true), true, '真实加载故障不能当作权限限制隐藏')
  assert.equal(dataErrors.shouldShowTaskDataError(index, new Error('无权限访问'), false), true, '本人正在办理的节点仍提示材料访问错误')
}
assert.equal(dataErrors.shouldShowTaskDataError(4, new Error('无权限访问'), true), true, '工作流的核心访问限制仍须报告')
assert.equal(dataErrors.shouldShowTaskDataError(0, new Error('无权限访问'), true), true)
console.log('PASS: readonly optional material permissions and essential/network error reporting')

class GridPermissionError extends Error { constructor() { super('无权限访问'); this.code = '403' } }
let denyGridUsers = false
const gridUsersApi = load('src/api/grid-dispatch-users.ts', {
  './account-management': { getDeptUserPage: async query => {
    assert.equal(query.deptId, '1')
    assert.equal(query.role, undefined, '网格员的管理员角色不应导致漏查')
    if (denyGridUsers) throw new GridPermissionError()
    return { records: [
      { id: '719', username: 'wgy1', realName: '九龙镇姚家村网格员', role: 'USER', status: 1 },
      { id: '720', username: 'wgy2', realName: '九龙镇张巷村网格员', role: 'ADMIN', status: 1 },
      { id: '694', username: 'hlqNYNCJ', realName: '海陵区农业农村局', role: 'USER', status: 1 },
      { id: '692', username: 'nyncKZ', role: 'ADMIN', status: 1 },
    ] }
  } },
  './pagination': pagination,
  './client': { ApiBusinessError: GridPermissionError },
})
assert.deepEqual((await gridUsersApi.getGridDispatchUsers('1')).map(u => u.id), ['719', '720'])
await assert.rejects(gridUsersApi.getGridDispatchUsers(), /未提供所属部门/)
denyGridUsers = true
await assert.rejects(gridUsersApi.getGridDispatchUsers('1'), /开通下发对象查询权限/)
const implement = { ...county, id: 'implementation', nodeKey: 'IMPLEMENT', nodeType: 'IMPLEMENT', assigneeId: '719' }
const implementingFlow = { ...forwardedFlow, timeline: [completedCity, { ...county, status: 'COMPLETED' }, implement], currentNode: implement }
assert.equal(state.myTaskWorkState(implementingFlow, '719'), 'pending')
assert.equal(state.myTaskWorkState(implementingFlow, '720'), undefined)
assert.equal(state.myTaskWorkState(implementingFlow, '694'), 'handled')
assert.equal(state.nonGrainWorkflow(implementingFlow, true)[3].status, 'active')
assert.equal(state.workflowNodeDisplayName(implement, waitingTask.sceneCode), '现场核查')
console.log('PASS: department-scoped grid users, permission denial, and IMPLEMENT recipient/history permissions')

const inspection = load('src/utils/non-grain-inspection.ts')
const inspectedPlot = { abnormalId: '439', result: 'NO_PROBLEM', landUse: '0201', description: '现场仍为粮食作物', noProblemReason: '识别误差', attachment: [] }
const inspectionFlow = { ...implementingFlow, timeline: [{ ...completedCity, deptId: '1' }, { ...county, status: 'COMPLETED' }, implement], currentNode: { ...implement, deptId: '1' } }
assert.deepEqual(inspection.inspectionRoute([inspectedPlot], inspectionFlow), { result: 'NO_PROBLEM', assigneeId: '692', deptId: '1', nextKey: 'FINISH' }, '无问题返回真实首审用户，不写死 nyncKZ ID')
const problemPlot = { ...inspectedPlot, abnormalId: '440', result: 'PROBLEM', attachment: ['file-1'] }
assert.equal(inspection.inspectionRoute([inspectedPlot, problemPlot], inspectionFlow, '744').assigneeId, '744')
assert.equal(inspection.inspectionRoute([inspectedPlot, problemPlot], inspectionFlow, '744').nextKey, 'RECTIFY')
assert.throws(() => inspection.inspectionRoute([{ ...problemPlot, attachment: [] }], inspectionFlow, '744'), /现场拍摄图片/)
assert.throws(() => inspection.inspectionRoute([problemPlot], inspectionFlow), /ntjsg/)
assert.throws(() => inspection.inspectionRoute([{ ...inspectedPlot, noProblemReason: '' }], inspectionFlow), /无问题原因/)
assert.throws(() => inspection.inspectionRoute([], inspectionFlow), /没有待核查/)
const archive = { ...implement, id: 'finish', nodeKey: 'FINISH', status: 'PROCESSING', assigneeId: '692' }
const archivedRoute = state.nonGrainWorkflow({ ...inspectionFlow, currentNode: archive, timeline: [...inspectionFlow.timeline.map(n => ({ ...n, status: 'COMPLETED' })), archive] }, true)
assert.equal(archivedRoute[4].viewable, false, '跳过的整改节点保持灰色且不可点击')
assert.equal(archivedRoute[5].viewable, false, '跳过的无人机复核保持灰色且不可点击')
assert.equal(archivedRoute[6].status, 'active')
console.log('PASS: inspection validation, mixed plots, real recipient routing and skipped stages')
const selectorCalls = []
const selector = load('src/api/account-management.ts', { './client': { apiClient: { post: async (path, body) => {
  selectorCalls.push({ path, body })
  return { records: [{ id: 744, username: 'ntjsg', realName: '农田建设股' }], total: 1 }
} } } })
const selectorPage = await selector.getDeptUserPage({ deptId: '1', pageNum: 2, pageSize: 200, keyword: 'ntjsg' })
assert.equal(selectorCalls[0].path, '/v1/user/dept/page')
assert.equal(selectorCalls[0].body.pageSize, 100, '选人接口最大每页 100，不能因分页上限遗漏数据')
assert.equal(selectorPage.records[0].id, '744')
assert.equal(selectorPage.pageSize, 100)
assert.equal(selectorPage.pageNum, 2)
console.log('PASS: dept selection endpoint, page size limit and slim user ID normalization')
const queriedDepartments = []
const workbenchUsers = load('src/api/workbench-users.ts', {
  './account-management': {
    getDepartmentList: async () => { throw new Error('不应读取不相关部门目录') },
    getDeptUserPage: async query => { queriedDepartments.push(query.deptId); return { records: [{ id: '744', username: 'ntjsg' }] } },
  },
  './pagination': pagination,
})
const allowedUsers = await workbenchUsers.getWorkbenchUsers('other-dept', { id: '773', username: 'nyncKZ', deptList: [{ deptId: '1', deptName: '农业农村局' }] }, '1')
assert.deepEqual(queriedDepartments, ['1'], '只请求本人有权限的部门，不读取任务所属的无权部门')
assert.deepEqual(allowedUsers.users.map(person => person.id), ['744', '773'], '仍可选择真实部门用户和本人')
assert.deepEqual(allowedUsers.warnings, [])
console.log('PASS: workbench picker authorized departments and self assignment')
const inspectionFiles = load('src/utils/inspection-files.ts')
for (const name of ['现场.PNG', 'boundary.svg', 'photo.jpeg', 'photo.webp', 'photo.HEIC']) {
  assert.equal(inspectionFiles.inspectionFileError([{ name, size: 1024 }], true), '')
  assert.match(inspectionFiles.inspectionFileError([{ name, size: 1024 }], false), /图片请使用/)
}
for (const name of ['报告.pdf', '说明.doc', '说明.docx']) {
  assert.equal(inspectionFiles.inspectionFileError([{ name, size: 1024 }], false), '')
  assert.match(inspectionFiles.inspectionFileError([{ name, size: 1024 }], true), /上传附件/)
}
assert.match(inspectionFiles.inspectionFileError([{ name: 'bad.exe', size: 1024 }], true), /仅接收图片/)
assert.match(inspectionFiles.inspectionFileError([{ name: 'huge.jpg', size: 10 * 1024 * 1024 + 1 }], true), /10MB/)
assert.match(inspectionFiles.inspectionFileError([{ name: 'a.jpg', size: 1024 }, { name: 'b.docx', size: 1024 }], true), /上传附件/)
console.log('PASS: disjoint image/document upload filters and batch size validation')
const recheck = load('src/utils/non-grain-recheck.ts')
const previousRectifier = { ...implement, nodeKey: 'RECTIFY', status: 'COMPLETED', assigneeId: '743', deptId: '1' }
const latestRectifier = { ...previousRectifier, id: 'rectify-latest', assigneeId: '744' }
const recheckingFlow = { ...inspectionFlow, timeline: [...inspectionFlow.timeline, previousRectifier, latestRectifier] }
assert.deepEqual(recheck.recheckRoute(['NO_PROBLEM'], recheckingFlow), { result: 'NO_PROBLEM', assigneeId: '692', deptId: '1', nextKey: 'FINISH' })
assert.deepEqual(recheck.recheckRoute(['NO_PROBLEM', 'PROBLEM'], recheckingFlow), { result: 'PROBLEM', assigneeId: '744', deptId: '1', nextKey: 'RECTIFY' }, '循环复核退回最近一轮整改办理人')
assert.throws(() => recheck.recheckRoute([], recheckingFlow), /所有图斑/)
assert.throws(() => recheck.recheckRoute([''], recheckingFlow), /所有图斑/)
assert.throws(() => recheck.recheckRoute(['PROBLEM'], inspectionFlow), /上一轮整改办理人/)
assert.throws(() => recheck.recheckRoute(['NO_PROBLEM'], { ...recheckingFlow, timeline: [latestRectifier] }), /首审办理人/)
console.log('PASS: drone review mixed outcomes, latest rectifier, first reviewer archive and missing routes')
