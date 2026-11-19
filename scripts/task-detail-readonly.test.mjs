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
const user=vue.reactive({allowed:false,currentUser:{id:'me',role:'USER'},hasPermission(key){assert.equal(key,'task-list');return this.allowed}})
const navigations = [], mounted = [], mediaEditable = [], mapEditable = [], abnormalQueries = []
let response, workflowResponse
const child = name => ({ default: { name, setup: (_, { slots }) => () => vue.h('section', { 'data-child': name }, slots.default?.()) } })
const { descriptor } = parse(readFileSync('src/views/TaskDetailView.vue', 'utf8'))
const component = evaluate(compileScript(descriptor, { id: 'task-detail-readonly', inlineTemplate: true }).content, {
  vue: { ...vue, onMounted: callback => mounted.push(callback) },
  'vue-router': { useRoute: () => route, useRouter: () => ({ push: value => navigations.push(value) }) },
  '@/stores/user': {useUserStore:()=>user},
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
  '@/api/task-workflow': { getTaskWorkflow: async () => workflowResponse },
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
      workflowResponse={flowInstanceId:'flow',status:taskStatus===5?'FINISHED':'RUNNING',timeline:[{id:'done',bizTaskId:response.task.id,nodeKey:'REVIEW',nodeName:'审核',assigneeId:'me',status:'COMPLETED'}]}
      const before = abnormalQueries.length
      route.params.taskId = response.task.id
      if (mounted.length) mounted.splice(0).forEach(callback => callback())
      await flush()
      for(const allowed of [false,true]){
      user.allowed=allowed
      const html = await renderToString(vue.h({ render }))
      for (const section of ['detail-layout', 'detail-left', 'metric-grid', 'map-info-grid', 'detail-bottom', 'records-panel']) assert(new RegExp(`class="[^"]*\\b${section}\\b[^"]*"`).test(html), `Shared layout missing ${section}`)
      assert(html.includes('返回任务列表'))
      const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(match => match[1].replace(/<[^>]+>/g, '')).join(' ')
      assert.equal(buttons.includes('进入工作台'),allowed,'A participant still needs the existing task route permission')
      assert(!/编辑|执行任务|取消任务|核查完成|解绑/.test(buttons), `${sceneCode}/${taskStatus} exposes a write action`)
      assert(html.includes(isFacility ? '涵洞测试设施' : '异常图斑信息'))
      assert.equal(abnormalQueries.length > before, !isFacility, 'Facilities do not require the abnormal listing permission')
      }
    }
  }
  user.allowed=true
  const cases=[
    {name:'查看者未参与',nodes:[{assigneeId:'other',status:'COMPLETED'}],expected:false},
    {name:'仅配置为未来办理人',nodes:[{assigneeId:'me',status:'PENDING'}],expected:false},
    {name:'跳过节点不代表办理过',nodes:[{assigneeId:'me',status:'SKIPPED'}],expected:false},
    {name:'本人已办理',nodes:[{assigneeId:'me',status:'COMPLETED'}],expected:true},
    {name:'本人正在办理',nodes:[],currentNode:{assigneeId:'me',status:'PROCESSING'},expected:true},
    {name:'他人正在办理',nodes:[],currentNode:{assigneeId:'other',status:'PROCESSING'},expected:false},
    {name:'管理员仅可见',nodes:[],role:'ADMIN',expected:false},
    {name:'无工作流不得推断',missing:true,expected:false},
  ]
  for(const [index,test] of cases.entries()){
    user.currentUser.role=test.role||'USER'
    response={task:{id:`access-${index}`,sceneCode:'HIGH_STANDARD_FARMLAND_FACILITY',name:test.name,taskStatus:1,assigneeId:'me',currentHandlerId:'me',createBy:'me',imageCount:0,facilityId:facility.id},facility,reportImages:[]}
    workflowResponse=test.missing?undefined:{flowInstanceId:'access-flow',status:'RUNNING',timeline:test.nodes.map((node,index)=>({id:String(index),bizTaskId:response.task.id,nodeKey:'REVIEW',nodeName:'审核',...node})),currentNode:test.currentNode&&{id:'active',bizTaskId:response.task.id,nodeKey:'IMPLEMENT',nodeName:'处置',...test.currentNode}}
    route.params.taskId=response.task.id
    await flush()
    const app=vue.createSSRApp({render});app.config.warnHandler=()=>{}
    const html=await renderToString(app)
    assert.equal(html.includes('class="detail-workspace-button"'),test.expected,test.name)
  }
  assert(mediaEditable.length > 0 && mediaEditable.every(value => value === false), 'Linked media is always read-only')
  assert(mapEditable.length > 0 && mapEditable.every(value => value === false), 'Facility map cannot edit geometry')
  assert.equal(navigations.length, 0)
  console.log('Task detail: shared layout and read-only rendering passed for both scenes across all 6 statuses')
} finally { scope.stop() }
