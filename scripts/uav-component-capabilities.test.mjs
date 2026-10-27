import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

function load(source, dependencies = {}) {
  const module = { exports: {} }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', compiled)(name => {
    assert(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
const capabilities = load(readFileSync('src/utils/uav-component-capabilities.ts', 'utf8'))
const adapters = load(readFileSync('src/adapters/dasFly.ts', 'utf8'), { '@/utils/uav-component-capabilities': capabilities })
const { componentSelectionState, parseComponentCapabilities } = capabilities
const feedbackMessages = []
let closedMessages = 0
const feedback = load(readFileSync('src/workspace-components/shared/component-feedback.ts', 'utf8'), {
  vue: Vue,
  'element-plus': { ElMessage: options => { feedbackMessages.push(options); return { close() { closedMessages++ } } } },
  'element-plus/es/components/message/style/css': {},
})
const enabled = targetId => ({ available: true, targetId, reason: '' })
const disabled = { available: false, targetId: '41', reason: '任务未执行，不能回放' }
const largeId = '2111100000000000123'
assert.equal(parseComponentCapabilities({ cockpit: enabled(largeId) }).cockpit.targetId, largeId)
assert.equal(componentSelectionState(parseComponentCapabilities({ cockpit: enabled(42) }).cockpit).targetId, '42')
for (const raw of [undefined, null, {}, { available: 'true', targetId: '42' }, enabled(0), enabled('0'), enabled(''), enabled('-1'), enabled(999999999999999999)]) {
  const cap = parseComponentCapabilities({ cockpit: raw })?.cockpit
  assert.equal(componentSelectionState(cap).availability, 'unavailable')
}
assert.equal(componentSelectionState(disabled).unavailableReason, disabled.reason)
assert.match(componentSelectionState(undefined).unavailableReason, /未提供/)

const routeRecords = [
  { id: 'route-record', name: '可编辑航线', componentCapabilities: { waylineEdit: enabled(largeId) } },
  { id: 'locked', name: '锁定航线', componentCapabilities: { waylineEdit: { ...disabled, reason: '航线已锁定' } } },
  { id: 'legacy', name: '旧响应', status: 1 },
  { id: 'invalid', name: '缺少目标', componentCapabilities: { waylineEdit: enabled(0) } },
]
const taskRecords = [
  { id: 'task-a', name: '任务A', status: 6, componentCapabilities: { cockpit: enabled('4001'), trajectoryPlayback: enabled('5001') } },
  { id: 'task-b', name: '任务B', status: 1, componentCapabilities: { cockpit: disabled, trajectoryPlayback: enabled('5002') } },
  { id: 'task-c', name: '任务C', status: 4, componentCapabilities: { cockpit: enabled('4003'), trajectoryPlayback: disabled } },
  { id: 'legacy-task', name: '未提供能力', status: 4 },
]
const routes = adapters.toRouteList({ records: routeRecords }).list
const tasks = adapters.toFlightTaskOptionList({ records: taskRecords }).list
assert.equal(routes[0].componentCapabilities.waylineEdit.targetId, largeId)
assert.equal(tasks[0].componentCapabilities.cockpit.targetId, '4001')
assert.equal(tasks[0].componentCapabilities.trajectoryPlayback.targetId, '5001')

class ApiBusinessError extends Error { constructor(code, message) { super(message); this.code = code } }
const renderer = Vue.createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null })
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick() }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
globalThis.window = { addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout }
globalThis.document = { addEventListener() {}, removeEventListener() {}, fullscreenElement: null, body: {} }

function mount(path, dependencies, expose) {
  let source = readFileSync(path, 'utf8').replace("import.meta.env.VITE_DAS_FLY_EMBED", "'true'")
  if (source.includes('defineExpose(')) source = source.replace('defineExpose({ openFlightPlanCreate, openWaylineCreate, openWaylineEdit, openCockpit })', `defineExpose({ ${expose} })`)
  else source = source.replace('</script>', `defineExpose({ ${expose} });\n</script>`)
  const component = load(compileScript(parse(source).descriptor, { id: 'capabilities-test' }).content, { vue: Vue, ...dependencies }).default
  component.render = () => null
  let vm
  const app = renderer.createApp({ render: () => Vue.h(component, { ref: value => { if (value) vm = value } }) })
  app.mount({})
  return { get vm() { return vm }, close: () => app.unmount() }
}

// Route/cockpit selectors: zero per-record authorization calls, capability target IDs and failure handling.
{
  const calls = []
  let routePage = routes
  let routePageReads = 0
  let pending
  let failure
  const h = mount('src/workspace-components/route-flight-plan/RouteFlightPlanPanel.vue', {
    '@element-plus/icons-vue': {}, '@/api/client': { ApiBusinessError },
    '@/utils/uav-component-capabilities': capabilities,
    '@/workspace-components/shared/component-feedback': feedback,
    '@/mocks/route-planning': { planningAlerts: [], buildRouteMetrics: () => ({}) },
    './NewRouteDialog.vue': {}, './RouteWorkspaceMap.vue': {},
    '@/api/patrol': {
      getUavProjectOptions: async () => [], getUavDeviceOptions: async () => [],
      getRoutes: async () => { routePageReads++; return { list: routePage, total: routePage.length } }, getFlightPlans: async () => ({ list: [], total: 0 }),
      // Detail APIs may omit capabilities; they must not erase the pagination response's capabilities.
      getRouteDetail: async id => ({ id, componentCapabilities: undefined }),
      getUavFlightTaskOptions: async () => ({ list: tasks, total: tasks.length }),
      getUavComponentUrl: async (type, target) => {
        calls.push({ type, target })
        if (failure) throw failure
        return pending ? pending.promise : `https://fly.get3d.cn/${type}`
      },
    },
  }, 'openComponentSelector, componentSelectorItems, selectedComponentSelectionId, confirmComponentSelection, componentSelectorVisible, dasFlyComponentUrl, dasFlyEmbedLoading')
  await flush()
  const baseline = calls.length // Existing create-route initialization is unrelated to list capability checks.
  await h.vm.openComponentSelector('WAYLINE_EDIT')
  assert.equal(calls.length, baseline, 'Opening route selection never requests component URLs')
  assert.deepEqual(h.vm.componentSelectorItems.map(item => item.availability), ['available', 'unavailable', 'unavailable', 'unavailable'])
  assert.equal(h.vm.componentSelectorItems[0].waylineId, largeId)
  assert.equal(h.vm.componentSelectorItems[1].unavailableReason, '航线已锁定')
  h.vm.selectedComponentSelectionId = 'wayline:legacy'
  await h.vm.confirmComponentSelection()
  assert.equal(calls.length, baseline)
  h.vm.selectedComponentSelectionId = 'wayline:route-record'
  await h.vm.confirmComponentSelection()
  assert.deepEqual(calls.at(-1), { type: 'WAYLINE_EDIT', target: { waylineId: largeId, flightTaskId: undefined } })
  assert.equal(h.vm.componentSelectorVisible, false)

  await h.vm.openComponentSelector('COCKPIT')
  assert.equal(calls.length, baseline + 1, 'Opening cockpit selection never requests URLs for all tasks')
  assert.deepEqual(h.vm.componentSelectorItems.map(item => item.availability), ['available', 'unavailable', 'available', 'unavailable'])
  h.vm.selectedComponentSelectionId = 'flight:task-a'
  pending = deferred()
  const confirm = h.vm.confirmComponentSelection()
  await h.vm.confirmComponentSelection()
  assert.equal(calls.length, baseline + 2, 'Repeated confirmation shares the active request')
  assert.equal(calls.at(-1).target.flightTaskId, '4001', 'Use capability targetId, not task record ID')
  // Changing the component while a URL is pending must invalidate the old authorization response.
  await h.vm.openComponentSelector('WAYLINE_EDIT')
  pending.resolve('https://fly.get3d.cn/old-cockpit')
  await confirm
  assert.equal(h.vm.dasFlyComponentUrl, '')
  assert.equal(h.vm.componentSelectorVisible, true)
  pending = undefined
  failure = new ApiBusinessError('403', '无权限')
  h.vm.selectedComponentSelectionId = 'wayline:route-record'
  await h.vm.confirmComponentSelection()
  assert.match(feedbackMessages.at(-1).message, /无权限/)
  assert.equal(feedbackMessages.at(-1).duration, 3000)
  assert.equal(feedbackMessages.at(-1).placement, 'top')
  assert.equal(feedbackMessages.at(-1).customClass, 'component-feedback-message')
  assert.equal(h.vm.componentSelectorItems[0].availability, 'unavailable')
  // Server capability changes must be visible on reopening instead of reusing the original route list.
  const reads = routePageReads
  routePage = routes.map(route => ({ ...route, componentCapabilities: { waylineEdit: { ...disabled, reason: '后端已取消编辑权限' } } }))
  await h.vm.openComponentSelector('WAYLINE_EDIT')
  assert.equal(routePageReads, reads + 1)
  assert.equal(h.vm.componentSelectorItems[0].availability, 'unavailable')
  assert.equal(h.vm.componentSelectorItems[0].unavailableReason, '后端已取消编辑权限')
  h.close()
}

// Realtime: no initial per-task URL requests; task click is the only authorization trigger.
{
  const calls = [], pending = new Map()
  const user = Vue.reactive({ activeDeptId: 'dept-a' })
  let transientFailure = false
  const h = mount('src/workspace-components/realtime-cruise/GlobalLiveCruisePanel.vue', {
    '@/stores/user': { useUserStore: () => user }, '@/utils/uav-component-capabilities': capabilities,
    '@/workspace-components/shared/component-feedback': feedback,
    '@/api/patrol': {
      getRoutes: async () => ({ list: [] }), getLiveStreams: async () => ({ list: [] }),
      getUavFlightTaskOptions: async () => ({ list: tasks }),
      getUavComponentUrl: async (type, target) => {
        calls.push({ type, target })
        if (transientFailure) throw new Error('网络超时')
        return pending.get(target.flightTaskId)?.promise || `https://fly.get3d.cn/${target.flightTaskId}`
      },
    },
  }, 'flightTasks, selectedFlightTaskId, selectFlightTask, playbackUrl, playbackError, playbackLoading, loadOverview')
  await flush()
  assert.equal(calls.length, 0)
  assert.deepEqual(h.vm.flightTasks.map(item => item.availability), ['available', 'available', 'unavailable', 'unavailable'])
  await h.vm.selectFlightTask('task-c')
  assert.equal(calls.length, 0)
  pending.set('5001', deferred())
  const a = h.vm.selectFlightTask('task-a')
  await h.vm.selectFlightTask('task-a')
  assert.equal(calls.length, 1)
  await h.vm.selectFlightTask('task-b')
  assert.deepEqual(calls.at(-1), { type: 'TRAJECTORY_PLAYBACK', target: { flightTaskId: '5002' } })
  pending.get('5001').resolve('https://fly.get3d.cn/stale-task-a')
  await a
  assert.equal(h.vm.playbackUrl, 'https://fly.get3d.cn/5002')
  transientFailure = true
  await h.vm.selectFlightTask('task-a')
  assert.equal(h.vm.playbackUrl, '')
  assert.match(feedbackMessages.at(-1).message, /网络超时/)
  assert.equal(h.vm.playbackError, '', 'Authorization failures do not create a large inline error area')
  transientFailure = false
  pending.delete('5001')
  await h.vm.selectFlightTask('task-a')
  assert.equal(h.vm.playbackUrl, 'https://fly.get3d.cn/5001', 'Transient failure permits retry')
  pending.set('5002', deferred())
  const oldDepartment = h.vm.selectFlightTask('task-b')
  user.activeDeptId = 'dept-b'
  await flush()
  pending.get('5002').resolve('https://fly.get3d.cn/old-department')
  await oldDepartment
  assert.equal(h.vm.playbackUrl, '', 'Old department authorization cannot overwrite new scope')
  h.close()
}
assert(closedMessages >= 2, 'Popup messages are closed when their panel is unmounted')
const patrolAst = ts.createSourceFile('patrol.ts', readFileSync('src/api/patrol.ts', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const requestFunction = patrolAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getUavComponentUrl').getText(patrolAst)
const requests = []
// The API function's only runtime dependency is supplied explicitly to its compiled body.
const module = { exports: {} }
new Function('module', 'exports', 'apiClient', ts.transpileModule(requestFunction, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(
  module, module.exports, { post: async (path, body) => { requests.push({ path, body }); return 'https://fly.get3d.cn/component' } },
)
await module.exports.getUavComponentUrl('WAYLINE_EDIT', { waylineId: largeId })
await module.exports.getUavComponentUrl('COCKPIT', { flightTaskId: '4001' })
await module.exports.getUavComponentUrl('TRAJECTORY_PLAYBACK', { flightTaskId: '5001' })
assert.deepEqual(requests.map(request => request.body), [
  { type: 'WAYLINE_EDIT', waylineId: largeId },
  { type: 'COCKPIT', flightTaskId: '4001' },
  { type: 'TRAJECTORY_PLAYBACK', flightTaskId: '5001' },
])
assert(requests.every(request => request.path === '/v1/uav/component/url'))
for (const path of ['src/workspace-components/route-flight-plan/RouteFlightPlanPanel.vue', 'src/workspace-components/realtime-cruise/GlobalLiveCruisePanel.vue']) {
  const template = readFileSync(path, 'utf8').split('<template>')[1]
  assert.doesNotMatch(template, /componentSelectorActionError|item\.state|task\.status \|\| '可用'/)
}
console.log('UAV component capabilities: DTO mapping, valid targets, no list URL probes, click-only authorization, reasons, repeat clicks, retries and stale-response guards passed')
