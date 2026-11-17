import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'

const source = parse(readFileSync('src/views/EngineeringFacilitiesOverview.vue', 'utf8')).descriptor.scriptSetup.content
const ast = ts.createSourceFile('facility.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const names = ['clearMapServices', 'loadMapServices', 'updateMapServices']
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
assert.equal(functions.length, names.length)
const code = ts.transpileModule(functions.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const state = { mapServices: { value: [] }, selectedServices: { value: [] }, mapServiceError: { value: '' }, mapServiceLoading: { value: false }, user: { activeDeptId: 'a' } }
const calls = [], added = [], removed = []
let deferred
const dependencies = {
  ...state,
  listEnabledMapServices: async (...args) => { calls.push(args); return [{ id: 1, name: '影像' }, { id: 2, name: '矢量' }] },
  createMapServiceLayer: async service => {
    if (service.id === 2) throw new Error('不可访问')
    if (deferred) await deferred
    return { layer: { addTo: () => added.push(service.id), remove: () => removed.push(service.id) } }
  },
}
const api = new Function('ctx', `const {mapServices,selectedServices,mapServiceError,mapServiceLoading,user,listEnabledMapServices,createMapServiceLayer}=ctx;
  const FACILITIES_TOPIC_ID='HIGH_STANDARD_FACILITIES'; let map={}; let serviceVersion=0; const serviceLayers=new Map(),serviceRequests=new Map();
  ${code}; return {clearMapServices,loadMapServices,updateMapServices};`)(dependencies)
await api.loadMapServices()
assert.deepEqual(calls[0], ['a', 'HIGH_STANDARD_FACILITIES'])
await api.updateMapServices(['1', '2'])
assert.deepEqual(added, [1])
assert.deepEqual(state.selectedServices.value, ['1'])
assert.match(state.mapServiceError.value, /矢量加载失败/)
await api.updateMapServices([])
assert.deepEqual(removed, [1])
let release
deferred = new Promise(resolve => { release = resolve })
const old = api.updateMapServices(['1'])
state.user.activeDeptId = 'b'
await api.loadMapServices()
release(); await old
assert.deepEqual(added, [1], 'Old department layer cannot appear after switching departments')
assert.deepEqual(state.selectedServices.value, [])
assert.deepEqual(calls[1], ['b', 'HIGH_STANDARD_FACILITIES'])
console.log('Facility map services: topic scope, selection, errors, cleanup and department race passed')
