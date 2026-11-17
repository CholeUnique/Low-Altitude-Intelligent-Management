import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

function load(source, dependencies) {
  const module = { exports: {} }
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', output)(name => {
    assert(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
const calls = []
const user = Vue.reactive({ activeDeptId: 'dept-a', currentUser: { role: 'ADMIN' } })
const planList = Array.from({length: 18}, (_, i) => ({id: `p${i}`, name: `Plan ${i}`, resultCount: i + 1, waylineName: '', waylineType: 'WAYPOINT', sn: 'dock', regionCode: i === 1 ? '' : '321202', regionName: i === 1 ? '' : '海陵区'}))
const recalcCalls = []
const resultCalls = []
const taskList = planList.map((plan, i) => ({id: `t${i}`, planId: plan.id, name: plan.name, type:'0', startTime:'2026-09-01T10:00:00', endTime:`2026-09-${String(28-i).padStart(2,'0')}T11:00:00`}))
let deferOld
let deferDetail
const emptyTasks = new Set()
const failingCounts = new Set()
const mediaRequest = async (taskId, pageNum, pageSize, deptId) => {
  calls.push({taskId,pageNum,pageSize,deptId})
  if (pageSize === 1 && failingCounts.has(taskId)) throw new Error('count unavailable')
  if (deferDetail && pageSize === 200) { const wait = deferDetail; deferDetail = undefined; await wait }
  if (deferOld && deptId === 'dept-a' && pageSize === 200) { const wait = deferOld; deferOld = undefined; await wait }
  const total = emptyTasks.has(taskId) ? 0 : taskId === 't0' ? 201 : 1
  const count = total === 0 ? 0 : pageSize === 1 ? 1 : pageNum === 1 ? Math.min(total,200) : 1
  return { total, pageSize, records: Array.from({length:count},(_,i)=>({id:`${taskId}-${pageNum}-${i}`,taskId,type:'other',fileName:`file-${i}.txt`,localFileUrl:'',originalUrl:'',thumbnailUrl:''})) }
}
globalThis.window = { addEventListener(){}, removeEventListener(){}, clearTimeout }
const renderer = Vue.createRenderer({
  createElement:()=>({}), createText:()=>({}), createComment:()=>({}),
  insert(){}, remove(){}, setText(){}, setElementText(){}, parentNode(){}, nextSibling(){}, patchProp(){}
})
let source = readFileSync('src/workspace-components/spot-identification/FlightTaskReviewPanel.vue','utf8')
source = source.replace('</script>', 'defineExpose({ getVersion: () => loadVersion, pageRows, rows, currentPage, loadTaskMedia, mediaByTask, departmentMediaSummary, completedMediaTaskIds, resultTypeFilter, openAiRecognition, aiPlan, selectedAlgorithmId, aiUnavailable, aiAlgorithms, draftFilters, applyFilters, resetFilters });\n</script>')
const script = compileScript(parse(source).descriptor, {id:'review-lazy-test'}).content
const regionUtil = load(readFileSync('src/utils/region-path.ts','utf8'),{})
assert.equal(regionUtil.regionPaths([{code:'32',name:'江苏省',children:[{code:'3212',name:'泰州市',children:[{code:'321202',name:'海陵区'}]}]}]).get('321202'), '江苏省 / 泰州市 / 海陵区')
const component = load(script, {
  vue: Vue, 'vue-router': {}, 'element-plus':{ElTooltip:{}}, '@element-plus/icons-vue':{},
  '@/components/FilterActions.vue': {},
  '@/api/client':{isMockMode:()=>false}, '@/api/patrol':{getUavMediaSummary:async()=>({photoCount:6896,videoCount:12})},
  '@/api/metadata':{getMetadataOptions:async()=>[{code:'32',name:'江苏省',children:[{code:'3212',name:'泰州市',children:[{code:'321202',name:'海陵区'}]}]}]}, '@/utils/region-path':regionUtil,
  '@/mocks/algorithm-catalog':load(readFileSync('src/mocks/algorithm-catalog.ts','utf8'),{}),
  '@/api/flight-review':{
    getFlightReviewResultPage:async query=>{
      resultCalls.push({...query})
      let items=planList.filter(plan=>!query.keyword || plan.name.toLowerCase().includes(query.keyword.toLowerCase()))
      if (query.droneSn) items=items.filter(plan=>Number(plan.id.slice(1)) % 2 === Number(query.droneSn.slice(-1)))
      return {records:items.slice((query.pageNum-1)*query.pageSize,query.pageNum*query.pageSize).map(plan=>({...plan,mediaFileCount:plan.id==='p0'?201:1,finishTime:taskList.find(task=>task.planId===plan.id).endTime})),total:items.length,pageSize:query.pageSize}
    },
    getFlightReviewTasks:async()=>({records:taskList,total:18,pageSize:200}),
    getFlightReviewMedia:mediaRequest,
    getFlightPlanDevices:async ids=>Object.fromEntries(ids.map(id=>[id,[{droneSn:`drone${Number(id.slice(1)) % 2}`,droneName:`飞机${Number(id.slice(1)) % 2}`,droneType:'M4D',gatewaySn:'dock'}]])),
    getFlightReviewPlanMediaTotal:async (id,deptId)=> (await mediaRequest(id.replace(/^p/, 't'),1,1,deptId)).total,
    recalculateFlightPlanRegion:async (id,deptId)=>{recalcCalls.push({id,deptId})},
    getFlightReviewPlanRegion:async()=>({regionCode:'321202',regionName:'海陵区'})
  }, '@/stores/user':{useUserStore:()=>user},
  './SpotUploadDialog.vue':{}, './SharedVideoPlayer.vue':{}, './PhotoLocationControl.vue':{}
}).default
component.render = ()=>null
const app = renderer.createApp(component)
const vm = app.mount({})
const flush = async()=>{ for(let i=0;i<8;i++){await new Promise(resolve=>setImmediate(resolve));await Vue.nextTick()} }
await flush()
assert.equal(vm.pageRows.length, 16, 'Server provides only the current page')
assert.equal(vm.pageRows[0].fileCount, 201, 'Uses mediaFileCount, not resultCount')
assert.equal(calls.length, 0, 'No per-plan media count requests')
assert.equal(resultCalls[0].pageSize, 16)
vm.draftFilters.planKeyword = 'Plan 1'
await flush()
assert.equal(vm.pageRows.length, 16, 'Draft filters do not query')
vm.applyFilters()
await flush()
assert.equal(resultCalls.at(-1).keyword, 'Plan 1')
assert.equal(vm.pageRows.length, 9)
vm.resetFilters()
await flush()
vm.currentPage = 2
await flush()
assert.equal(resultCalls.at(-1).pageNum, 2)
assert.equal(vm.pageRows.length, 2)
vm.currentPage = 1
await flush()
const first = vm.loadTaskMedia('t0', vm.getVersion())
await first
await flush()
assert.equal(vm.mediaByTask.t0.length, 201, 'Preview fetches all media pages')
vm.draftFilters.resultTypeFilter = 'image'
vm.applyFilters()
await flush()
assert.equal(resultCalls.at(-1).mediaType, 'photo')
user.activeDeptId = 'dept-b'
await flush()
assert.equal(resultCalls.at(-1).deptId, 'dept-b')
assert.equal(Object.keys(vm.mediaByTask).length, 0, 'Changing department clears preview data')
app.unmount()
console.log('Flight review server pagination and preview tests passed')


