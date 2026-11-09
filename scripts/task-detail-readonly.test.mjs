import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { parse, compileScript } from '@vue/compiler-sfc'
import { build } from 'esbuild'

function evaluate(source, dependencies) {
  const module = { exports: {} }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    assert(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
async function bundle(file) {
  const result = await build({ entryPoints: [file], bundle: true, platform: 'node', format: 'esm', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const facilityUtils = await bundle('src/utils/facility-task.ts')
const workflowState = await bundle('src/utils/task-workflow-state.ts')
const workflowProjection = await bundle('src/utils/task-list-workflow.ts')
const imagery = await bundle('src/utils/task-imagery.ts')
const facilityContext = evaluate(readFileSync('src/workspace-components/farmland-facilities/use-facility-context.ts', 'utf8'), { vue, '@/utils/facility-task': facilityUtils })
const geometry = { type: 'FeatureCollection', features: [] }
const facility = { id: '1419', name: '涵洞测试设施', geometryJson: JSON.stringify({ type: 'Point', coordinates: [119.9, 32.4] }) }
const route = vue.reactive({ params: { taskId: '' } })
const navigations = [], mounted = [], mediaEditable = [], mapEditable = [], abnormalQueries = []
let response
const child = name => ({ default: { name, setup: (_, { slots }) => () => vue.h('section', { 'data-child': name }, slots.default?.()) } })
const { descriptor } = parse(readFileSync('src/views/TaskDetailView.vue', 'utf8'))
const component = evaluate(compileScript(descriptor, { id: 'task-detail-readonly', inlineTemplate: true }).content, {
  vue: { ...vue, onMounted: callback => mounted.push(callback) },
  'vue-router': { useRoute: () => route, useRouter: () => ({ push: value => navigations.push(value) }) },
  '@/utils/facility-task': facilityUtils,
  '@/utils/task-workflow-state': workflowState,
  '@/utils/task-list-workflow': workflowProjection,
  '@/utils/task-imagery': imagery,
  '@/workspace-components/farmland-facilities/use-facility-context': facilityContext,
  '@/api/governance-task': {
    getGovernanceTaskDetail: async () => response,
    getGovernanceTaskGeometry: async () => geometry,
    getGovernanceTaskOperateLogs: async () => [],
    getTaskAbnormalPage: async query => { abnormalQueries.push(query); return { records: [], total: 0 } },
    taskPriorityLabel: () => '普通',
    // Mutation APIs intentionally absent: detail rendering must not depend on them.
  },
  '@/api/task-workflow': { getTaskWorkflow: async () => undefined },
  '@/components/task-center/TaskLinkedMedia.vue': { default: { props: ['editable'], setup: props => () => {
    mediaEditable.push(props.editable)
    return vue.h('section', props.editable ? [vue.h('button', '解绑')] : '只读关联影像')
  } } },
  '@/workspace-components/farmland-facilities/FacilityGeometryMap.vue': { default: { props: ['editable', 'geometry'], setup: props => () => {
    mapEditable.push(props.editable)
    assert.equal(props.geometry.features.length, 1, 'Facility geometry falls back to the task-embedded dossier')
    return vue.h('section', '设施位置地图')
  } } },
  ...Object.fromEntries([
    '@/layouts/CockpitPageLayout.vue', '@/components/TaskRangeMap.vue',
    '@/components/task-center/TaskHistory.vue', '@/components/FacilityReportImageGallery.vue',
  ].map(name => [name, child(name.split('/').pop())])),
}).default
const scope = vue.effectScope()
const render = scope.run(() => component.setup({}, { expose() {} }))
const flush = async () => { await vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); await vue.nextTick() }
try {
  for (const sceneCode of ['HIGH_STANDARD_FARMLAND_FACILITY', 'NON_GRAIN']) {
    for (const taskStatus of [0, 1, 2, 3, 4, 5]) {
      const isFacility = sceneCode === 'HIGH_STANDARD_FARMLAND_FACILITY'
      response = { task: { id: `${sceneCode}-${taskStatus}`, sceneCode, sceneName: sceneCode, name: '详情只读回归', taskStatus, taskStatusDesc: '状态', imageCount: 1, facilityId: isFacility ? facility.id : undefined }, facility: isFacility ? facility : undefined, reportImages: [{ imageId: 'photo' }] }
      const before = abnormalQueries.length
      route.params.taskId = response.task.id
      if (mounted.length) mounted.splice(0).forEach(callback => callback())
      await flush()
      const html = await renderToString(vue.h({ render }))
      for (const section of ['detail-layout', 'detail-left', 'metric-grid', 'map-info-grid', 'detail-bottom', 'records-panel']) assert(new RegExp(`class="[^"]*\\b${section}\\b[^"]*"`).test(html), `Shared layout missing ${section}`)
      assert(html.includes('返回任务列表'))
      const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(match => match[1].replace(/<[^>]+>/g, '')).join(' ')
      assert(!/进入工作台|编辑|执行任务|取消任务|核查完成|解绑/.test(buttons), `${sceneCode}/${taskStatus} exposes a write action`)
      assert(html.includes(isFacility ? '涵洞测试设施' : '异常图斑信息'))
      assert.equal(abnormalQueries.length > before, !isFacility, 'Facilities do not require the abnormal listing permission')
    }
  }
  assert(mediaEditable.length > 0 && mediaEditable.every(value => value === false), 'Linked media is always read-only')
  assert(mapEditable.length > 0 && mapEditable.every(value => value === false), 'Facility map cannot edit geometry')
  assert.equal(navigations.length, 0)
  console.log('Task detail: shared layout and read-only rendering passed for both scenes across all 6 statuses')
} finally { scope.stop() }
