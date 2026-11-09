import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'

function load(file, dependencies) {
  const module = { exports: {} }
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', output)(name => {
    assert(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
let rawDetail
const requests = []
const api = load('src/api/governance-task.ts', { './client': { apiClient: { post: async (url, input) => {
  assert.equal(url, '/v1/biz/task/detail')
  assert.equal(input.id, 'task-1')
  requests.push(url)
  if (rawDetail instanceof Error) throw rawDetail
  return rawDetail
} } } })
const utilities = load('src/utils/facility-task.ts', {})
const { useFacilityContext } = load('src/workspace-components/farmland-facilities/use-facility-context.ts', {
  vue,
  '@/utils/facility-task': utilities,
})
const task = {id:'task-1',sceneCode:'HIGH_STANDARD_FARMLAND_FACILITY',sceneName:'高标准农田工程设施管理',deptId:'task-dept',facilityId:'1419'}
const facility = {id:1419,name:'一号泵站',facilityNo:'SS-1',geometryJson:JSON.stringify({type:'Point',coordinates:[119.9,32.4]})}
const emptyGeometry = () => ({type:'FeatureCollection',features:[]})
const flush = async () => { await vue.nextTick(); await new Promise(resolve=>setImmediate(resolve)); await vue.nextTick() }
function context(value) {
  const scope = vue.effectScope(), detail = vue.ref(value), geometry = vue.ref(emptyGeometry())
  return {scope,detail,geometry,state:scope.run(()=>useFacilityContext(detail,geometry))}
}

// Both supported task response shapes must use the already-authorized dossier, without ledger permission.
for (const response of [
  {task,facilityId:1419,facility},
  {task:{...task,facilityId:1419,facility}},
]) {
  rawDetail=response
  const detail=await api.getGovernanceTaskDetail('task-1')
  assert.equal(detail.facilityId,'1419')
  const view=context(detail)
  await flush()
  assert.equal(view.state.facility.value.id,1419)
  assert.equal(view.state.displayGeometry.value.features[0].geometry.type,'Point')
  assert.equal(Object.fromEntries(view.state.facts.value)['设施名称'],'一号泵站')
  assert.deepEqual(view.state.contextErrors.value,[])
  assert.equal(view.state.contextLoading.value,false)
  view.scope.stop()
}
assert.deepEqual(requests,['/v1/biz/task/detail','/v1/biz/task/detail'],'Only task-scoped endpoints are read')
const summaryOnly=context({task:{...task,facilityId:undefined},facility:{id:1419,name:'一号泵站'}})
await flush()
assert.equal(summaryOnly.state.reference.value.id,'1419')
assert.deepEqual(summaryOnly.state.contextErrors.value,[])
assert.equal(requests.length,2,'An authorized summary with no geometry must not trigger a ledger or department geometry request')
summaryOnly.scope.stop()

// An unrelated summary must never replace the task's explicit relation.
for (const input of [
  {task,facility:{...facility,id:9999}},
  {task:{...task,facilityId:undefined,refType:'FACILITY',refId:'1419'},facility:{...facility,id:9999}},
]) {
  const view=context(input)
  await flush()
  assert.equal(view.state.facility.value,undefined)
  assert.equal(view.state.reference.value.id,'1419')
  assert.match(view.state.contextErrors.value.join(''),/关联 ID 不一致/)
  assert.equal(Object.fromEntries(view.state.facts.value)['设施 ID'],'1419')
  view.scope.stop()
}
assert.equal(requests.length,2)

// Deleted facilities retain their task relation, without a forbidden ledger fallback.
rawDetail={task,facilityId:1419}
const deleted=context(await api.getGovernanceTaskDetail('task-1'))
await flush()
assert.equal(deleted.state.facility.value,undefined)
assert.equal(Object.fromEntries(deleted.state.facts.value)['设施 ID'],'1419')
assert.match(deleted.state.contextErrors.value.join(''),/已删除/)
assert.equal(requests.length,3)
deleted.scope.stop()

// Missing task access propagates the real error and never falls back to the facility ledger.
rawDetail=Object.assign(new Error('任务无权访问'),{code:'10107'})
await assert.rejects(()=>api.getGovernanceTaskDetail('task-1'),/任务无权访问/)

const construction=context({task:{...task,facilityId:undefined,description:'新建沟渠'}})
await flush()
assert.equal(construction.state.reference.value,undefined)
assert.deepEqual(construction.state.contextErrors.value,[])
construction.scope.stop()

// Changing tasks updates the dossier immediately, with no outstanding authorization requests.
const switching=context({task,facility})
await flush()
switching.detail.value={task:{...task,id:'task-2',facilityId:'22'},facility:{...facility,id:22,name:'二号泵站'}}
await flush()
assert.equal(switching.state.facility.value.id,22)
assert.deepEqual(switching.state.contextErrors.value,[])
switching.geometry.value={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[120,33]}}]}
assert.deepEqual(switching.state.displayGeometry.value.features[0].geometry.coordinates,[120,33],'Task geometry has priority over the facility geometry')
switching.detail.value=undefined
await flush()
assert.equal(switching.state.facility.value,undefined)
assert.deepEqual(switching.state.contextErrors.value,[])
switching.scope.stop()

console.log('facility workbench context: task-only dossiers, relation integrity, deleted facilities and task access boundaries passed')
