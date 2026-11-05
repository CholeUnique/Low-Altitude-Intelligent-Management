import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import * as pinia from 'pinia'

function load(file, dependencies = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(id => dependencies[id] || {}, module, module.exports)
  return module.exports
}
const stored = new Map()
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
globalThis.window = new EventTarget()
const useUserStore = pinia.defineStore('comparison-test-user', () => ({ token: vue.ref('qa'), currentUser: vue.ref({ id: 'u1' }), activeDeptId: vue.ref('d1') }))
const { useFarmlandComparisonStore } = load('src/stores/farmland-comparison.ts', { vue, pinia, './user': { useUserStore } })
pinia.setActivePinia(pinia.createPinia())
const user = useUserStore(), store = useFarmlandComparisonStore()
const a = { serviceId: '9', layerId: 0, serviceName: '九龙镇高标准农田数据', layerName: '高标准农田GBZ', filters: [] }
const b = { ...a, layerId: 1, layerName: '九龙镇永久基本农田1' }
const summary = { areaA: 5413814.39, areaB: 5141672.91, diffRate: .7966, sourceA: a, sourceB: b, resultId: '19', minAreaSqm: 4 }
assert.equal(store.latest, undefined)
assert(store.remember(summary, 'default'))
assert.equal(store.latest.areaA, summary.areaA)
const firstScope = store.scope
assert(store.remember({ ...summary, areaA: 6000000 }, 'analysis'))
assert.equal(store.remember(summary, 'default'), false, 'A slow default request cannot overwrite the user analysis')
assert.equal(store.latest.areaA, 6000000)
a.filters.push({ field: 'DLMC', op: 'EQ', values: ['水田'] })
assert.deepEqual([...store.latest.sourceA.filters], [], 'Stored source snapshots are isolated from form mutations')
assert.equal(store.remember({ ...summary, areaA: NaN }), false)
assert.equal(store.remember({ ...summary, diffRate: undefined }), false)
user.activeDeptId = 'd2'
assert.equal(store.latest, undefined)
assert.equal(store.remember(summary, 'analysis', firstScope), false, 'An old department response must be rejected')
user.activeDeptId = 'd1'
assert.equal(store.latest.areaA, 6000000, 'Restore the same account/department history')
user.currentUser = { id: 'u2' }
assert.equal(store.latest, undefined, 'New accounts need their own default baseline')
assert(store.remember({ ...summary, areaA: 0, areaB: 0, diffRate: 0 }))
assert.equal(store.latest.diffRate, 0)
user.token = ''
assert.equal(store.latest, undefined)
user.token = 'qa'
assert.equal(store.latest.areaA, 0)
const oldSet = localStorage.setItem
localStorage.setItem = () => { throw Error('quota') }
assert(store.remember({ ...summary, diffRate: 1.25 }))
assert.equal(store.latest.diffRate, 1.25, 'Backend ratios above 100% must not be clamped')
assert.match(store.storageError, /无法保存/)
localStorage.setItem = oldSet
stored.set(store.scope, JSON.stringify({ ...summary, origin: 'analysis', areaA: -1 }))
const event = new Event('storage'); Object.assign(event, { key: store.scope }); window.dispatchEvent(event)
assert.equal(store.latest, undefined, 'Malformed cached summaries are not displayed')

const { farmlandDefaults } = load('src/utils/farmland-analysis.ts')
const calls = []
let services = [{ id: '8', name: '九龙镇高标农田数据' }, { id: '9', name: '九龙镇高标准农田数据' }]
let layers = [{ layerId: 0, name: '高标准农田GBZ', analyzable: true, fields: [] }, { layerId: 1, name: '九龙镇永久基本农田1', analyzable: true, fields: [] }]
const { loadDefaultFarmlandComparison } = load('src/utils/default-farmland-comparison.ts', {
  '@/api/map-service': { listEnabledMapServices: async dept => { calls.push(['services', dept]); return services } },
  '@/api/spatial-analysis': {
    getSpatialLayers: async (id, dept) => { calls.push(['layers', id, dept]); return layers },
    analyzeSpatialOverlay: async input => { calls.push(['summary', input]); return summary },
  },
  './farmland-analysis': { farmlandDefaults },
})
assert.equal(await loadDefaultFarmlandComparison('d1', new AbortController().signal), summary)
assert.deepEqual(calls.map(item => item[0]), ['services', 'layers', 'summary'], 'Defaults do not request GeoJSON, tiles or result pages')
assert.equal(calls[1][1], '9', 'Do not conflate 高标农田 with the canonical 高标准农田 service')
assert.deepEqual(calls[2][1], { deptId: 'd1', sourceA: { serviceId: '9', layerId: 0, filters: [] }, sourceB: { serviceId: '9', layerId: 1, filters: [] }, minAreaSqm: 4, includeOverlapSpots: true })
layers = layers.slice(0, 1)
await assert.rejects(loadDefaultFarmlandComparison('d1', new AbortController().signal), /两类基准图层/)
services = [services[0]]
await assert.rejects(loadDefaultFarmlandComparison('d1', new AbortController().signal), /基准服务/)
const abort = new AbortController(); abort.abort()
await assert.rejects(loadDefaultFarmlandComparison('d1', abort.signal), /abort/i)
console.log('PASS: scoped latest comparison, persistence, race protection, real zero values, default baseline resolution and summary-only requests')
