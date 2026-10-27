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
const user = Vue.reactive({ activeDeptId: 'dept-a' })
const planList = Array.from({length: 18}, (_, i) => ({id: `p${i}`, name: `Plan ${i}`, waylineName: '', waylineType: 'WAYPOINT', sn: 'dock'}))
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
source = source.replace('</script>', 'defineExpose({ pageRows, rows, currentPage, loadTaskMedia, mediaByTask, departmentMediaSummary, completedMediaTaskIds, resultTypeFilter, mediaLoading, filteredRows });\n</script>')
const script = compileScript(parse(source).descriptor, {id:'review-lazy-test'}).content
const component = load(script, {
  vue: Vue, 'vue-router': {}, 'element-plus':{ElTooltip:{}}, '@element-plus/icons-vue':{},
  '@/api/client':{isMockMode:()=>false}, '@/api/patrol':{getUavMediaSummary:async()=>({photoCount:6896,videoCount:12})},
  '@/api/flight-review':{
    getFlightReviewPlans:async()=>({records:planList,total:18,pageSize:200}),
    getFlightReviewTasks:async()=>({records:taskList,total:18,pageSize:200}),
    getFlightReviewMedia:mediaRequest
  }, '@/stores/user':{useUserStore:()=>user},
  './SpotUploadDialog.vue':{}, './SharedVideoPlayer.vue':{}, './PhotoLocationOverlay.vue':{}
}).default
component.render = ()=>null
const app = renderer.createApp(component)
const vm = app.mount({})
const flush = async()=>{ for(let i=0;i<8;i++){await new Promise(resolve=>setImmediate(resolve));await Vue.nextTick()} }
await flush()
assert.equal(calls.length,16,'Initial load only counts tasks on the first page')
assert(calls.every(call=>call.pageNum===1 && call.pageSize===1),'Initial load must not read full media pages')
assert.equal(vm.departmentMediaSummary.photoCount,6896,'Summary independent of loaded files')
assert.equal(vm.pageRows[0].fileCount,201,'Row count comes from total, not one returned record')
assert.equal(Object.keys(vm.mediaByTask).length,0)
vm.currentPage=2
await flush()
assert.equal(calls.length,18,'Next page counts only its tasks')
vm.currentPage=1
await flush()
assert.equal(calls.length,18,'Cached counts are reused')
let releaseDetail
deferDetail = new Promise(resolve=>releaseDetail=resolve)
const first=vm.loadTaskMedia('t0',1)
const duplicate=vm.loadTaskMedia('t0',1)
releaseDetail()
await Promise.all([first,duplicate])
await flush()
assert.equal(calls.filter(c=>c.taskId==='t0'&&c.pageSize===200).length,2,'One shared request chain, two pages')
assert.equal(vm.mediaByTask.t0.length,201,'Selected plan gets all pages so preview switching has no unloaded tail')
assert.equal(vm.pageRows[0].plan.id,'p0','Loading media does not reorder rows')
const before=calls.length
await vm.loadTaskMedia('t0',1)
assert.equal(calls.length,before,'Completed media are reused')
let releaseOld
deferOld=new Promise(resolve=>releaseOld=resolve)
const old=vm.loadTaskMedia('t1',1)
user.activeDeptId='dept-b'
await flush()
releaseOld()
await old
await flush()
assert.equal(Object.keys(vm.mediaByTask).length,0,'Old department results cannot publish into new department')
assert(calls.slice(-16).every(c=>c.deptId==='dept-b'&&c.pageSize===1))
vm.resultTypeFilter='other'
await flush()
assert.equal(vm.filteredRows.length,18,'Explicit type filter classifies all eligible plans accurately')
assert.equal(vm.mediaLoading,false)
vm.resultTypeFilter=''
emptyTasks.add('t0'); emptyTasks.add('t1')
failingCounts.add('t2')
user.activeDeptId='dept-c'
await flush()
assert.equal(vm.pageRows.length,16,'Removed empty plans are automatically replaced by later plans')
assert(!vm.filteredRows.some(row=>['p0','p1'].includes(row.plan.id)),'Confirmed empty plans are hidden')
assert(vm.filteredRows.some(row=>row.plan.id==='p2' && row.countFailed),'Count failure remains visible, not treated as empty')
assert(!calls.filter(call=>call.deptId==='dept-c').some(call=>call.pageSize!==1),'Filtering empty plans never scans full media pages')
emptyTasks.clear(); failingCounts.clear()
emptyTasks.add('t16'); emptyTasks.add('t17')
user.activeDeptId='dept-d'
await flush()
vm.currentPage=2
await flush()
assert.equal(vm.currentPage,1,'Removing an empty last page returns to a valid page')
assert.equal(vm.pageRows.length,16)
taskList.forEach(task=>emptyTasks.add(task.id))
user.activeDeptId='dept-e'
await flush()
assert.equal(vm.filteredRows.length,0,'All-empty result displays an empty list')
assert.equal(vm.currentPage,1)
app.unmount()
console.log('Flight review lazy loading tests passed')
