import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
}
const module = { exports: {} }
new Function('module', 'exports', compile(readFileSync('src/utils/dashboard-loading.ts', 'utf8')))(module, module.exports)
const { createDashboardGeometryLoader, loadDashboardSceneCounts } = module.exports
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
const geometry = id => ({ type: 'FeatureCollection', features: [{ id }] })

const summaryCalls = []
const counts = await loadDashboardSceneCounts(['A', 'A', 'B', 'C', 'D', 'E', 'F'], [
  { sceneCode: 'A', abnormalCount: 24 }, { sceneCode: 'B', abnormalCount: 0 },
  { sceneCode: 'C', abnormalCount: null }, { sceneCode: 'F', abnormalCount: '12' },
], async code => {
  summaryCalls.push(code)
  if (code === 'D') throw new Error('Unavailable')
  return { total: code === 'C' ? 7 : undefined }
}, () => true)
assert.deepEqual(counts, { A: 24, B: 0, F: 12, C: 7 })
assert.deepEqual(summaryCalls, ['C', 'D', 'E'], 'Only missing/invalid scenes request a scoped summary, regardless of task count')
assert.deepEqual(await loadDashboardSceneCounts(['X'], [], async () => ({ total: 0 }), () => true), { X: 0 })
let liveSummary = true
const blockers = Array.from({ length: 4 }, deferred), startedSummaries = []
const manyCounts = loadDashboardSceneCounts(['1', '2', '3', '4', '5', '6'], [], async code => {
  startedSummaries.push(code)
  await blockers[Number(code) - 1].promise
  return { total: 1 }
}, () => liveSummary)
assert.equal(startedSummaries.length, 4)
liveSummary = false
blockers.forEach(item => item.resolve())
await manyCounts
assert.equal(startedSummaries.length, 4, 'Old departments do not issue remaining summary queries')

let time = 0
const requests = [], responses = []
const loader = createDashboardGeometryLoader(async id => {
  requests.push(id)
  const response = responses.shift()
  if (response instanceof Error) throw response
  return response ? await response : geometry(id)
}, () => time)
const tasks = [{ id: 'a', updateTime: 'v1' }, { id: 'b', updateTime: 'v1' }]
assert.deepEqual(Object.keys(await loader.load(tasks, () => true)), ['a', 'b'])
await loader.load(tasks, () => true)
assert.deepEqual(requests, ['a', 'b'], 'Refreshing task metadata reuses unchanged geometry')
await loader.load([{ id: 'a', updateTime: 'v2' }], () => true)
assert.equal(requests.length, 3, 'A task revision invalidates only that task')
time = 300_001
await loader.load(tasks.slice(1), () => true)
assert.equal(requests.length, 4, 'Geometry cache expires after five minutes')
loader.clear()
await loader.load(tasks.slice(1), () => true)
assert.equal(requests.length, 5, 'Changing identity clears the geometry cache')

responses.push(new Error('Temporary failure'))
assert.deepEqual(await loader.load([{ id: 'failed' }], () => true), {})
await loader.load([{ id: 'failed' }], () => true)
assert.equal(requests.filter(id => id === 'failed').length, 2, 'Failures can retry instead of caching an empty success')

const slow = deferred()
responses.push(slow.promise)
const once = loader.load([{ id: 'shared' }], () => true)
const twice = loader.load([{ id: 'shared' }], () => true)
await tick()
assert.equal(requests.filter(id => id === 'shared').length, 1)
slow.resolve(geometry('shared'))
await Promise.all([once, twice])

const old = deferred()
responses.push(old.promise)
const oldDepartment = loader.load([{ id: 'private' }], () => true)
await tick()
loader.clear()
old.resolve(geometry('old-private'))
assert.deepEqual(await oldDepartment, {}, 'A cleared identity discards old geometry even if it arrives late')
const newDepartment = await loader.load([{ id: 'private' }], () => true)
assert.equal(newDepartment.private.features[0].id, 'private')

const geoBlockers = new Map()
const concurrentCalls = []
const capped = createDashboardGeometryLoader(async id => {
  concurrentCalls.push(id)
  const gate = deferred(); geoBlockers.set(id, gate)
  return gate.promise
})
let firstSceneCurrent = true
const sceneOne = capped.load(Array.from({ length: 6 }, (_, index) => ({ id: String(index) })), () => firstSceneCurrent)
await tick()
assert.equal(concurrentCalls.length, 4)
firstSceneCurrent = false
const sceneTwo = capped.load([{ id: '4' }], () => true)
for (const id of ['0', '1', '2', '3']) geoBlockers.get(id).resolve(geometry(id))
await tick()
assert.deepEqual(concurrentCalls, ['0', '1', '2', '3', '4'], 'Queued stale work is skipped; an active consumer can retain a shared queued request')
geoBlockers.get('4').resolve(geometry('4'))
await Promise.all([sceneOne, sceneTwo])

function scriptAst(path) {
  const component = readFileSync(path, 'utf8')
  const script = component.split('<script setup lang="ts">')[1].split('</script>')[0]
  return { component, script, ast: ts.createSourceFile(path, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) }
}
function functions(ast, names) {
  const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
  assert.equal(declarations.length, names.length)
  return compile(declarations.map(node => node.getText(ast)).join('\n'))
}
const view = scriptAst('src/views/DashboardView.vue')
assert.doesNotMatch(view.script, /getTaskAbnormalPage/, 'Homepage never requests per-task abnormal pages')
assert.match(view.component, /:focus-geometry-pending="sceneGeometryPending"/)
const viewFunctions = functions(view.ast, ['loadTaskRanges', 'loadSceneAbnormalCounts'])
const viewState = {
  activeScene: { value: undefined }, currentUnitTasksLoaded: { value: true },
  currentUnitTasks: { value: [{ id: 'a', sceneCode: 'A' }, { id: 'b', sceneCode: 'B' }] },
  taskRanges: { value: {} }, taskRangesLoading: { value: false }, sceneAbnormalCounts: { value: {} },
  organization: { value: {} },
}
const selectedScenes = [], scopedQueries = []
const lazy = new Function('context', `const {${Object.keys(viewState).join(',')}, geometryLoader, findOrganizationScene, resolveWorkspaceSceneId, loadDashboardSceneCounts, getBusinessAbnormalSummary} = context;
  let geometryRequestVersion = 0, statisticsRequestVersion = 1, abnormalCountRequestVersion = 0;
  ${viewFunctions}
  return {loadTaskRanges, loadSceneAbnormalCounts};`)(
  { ...viewState, geometryLoader: { async load(tasks) { selectedScenes.push(tasks.map(task => task.id)); return Object.fromEntries(tasks.map(task => [task.id, geometry(task.id)])) } },
    findOrganizationScene: (_org, code) => ({ id: code }), resolveWorkspaceSceneId: code => code,
    loadDashboardSceneCounts, getBusinessAbnormalSummary: async query => { scopedQueries.push(query); return { total: 9 } },
  })
await lazy.loadTaskRanges()
assert.deepEqual(selectedScenes, [], 'Ordinary homepage triggers zero task GeoJSON loads')
viewState.activeScene.value = { id: 'B' }
await lazy.loadTaskRanges()
assert.deepEqual(selectedScenes, [['b']], 'Entering a scene requests only that scene geometry')
await lazy.loadSceneAbnormalCounts(viewState.currentUnitTasks.value, 1, 'dept-2', [{ sceneCode: 'A', abnormalCount: 3 }])
assert.deepEqual(scopedQueries, [{ deptId: 'dept-2', sceneCode: 'B' }], 'Fallback summary retains both scene and department scope')
assert.deepEqual(viewState.sceneAbnormalCounts.value, { A: 3, B: 9 })

// Execute actual map initialization with a Leaflet stub that records the viewport at tile attachment.
const mapSource = scriptAst('src/components/DashboardMap.vue')
const mapFunctions = functions(mapSource.ast, ['initMap', 'initializeBaseLayers', 'focusHailingDistrict', 'focusSceneLayer', 'addBaseLayers'])
assert.doesNotMatch(mapFunctions, /setTimeout/, 'Map startup no longer loads tiles and refits after a timer')
function mapHarness({ scene = false, pending = false, hasGeometry = true } = {}) {
  const events = [], viewsAtTileAttach = [], layers = []
  let viewName = 'temporary-city-center'
  const props = { focusLayerId: scene ? 'A' : undefined, focusGeometryPending: pending,
    layers: [{ id: 'A', tasks: hasGeometry ? [{ polygon: [[119, 32], [120, 33], [120, 32]] }] : [] }] }
  const leafletMap = { createPane: () => ({ style: {} }), on() {}, invalidateSize() {},
    fitBounds(bounds) { viewName = bounds.name; events.push('fit') } }
  const context = { props, container: { value: {} }, token: 'test', TAIZHOU_CENTER: [32, 119], TAIZHOU_ZOOM: 10,
    HAILING_DISTRICT: {}, jiulongBoundaryVisible: { value: false }, mapMode: { value: 'image' },
    mapReady: { value: false }, mapError: { value: '' },
    mapServicePaneNames: new Map(), MAP_SERVICE_IMAGERY_PANE: 'imagery', MAP_SERVICE_VECTOR_PANE: 'vector',
    L: { map: () => leafletMap, layerGroup: () => ({ addTo: () => ({}) }),
      geoJSON: () => ({ getBounds: () => ({ name: 'final-overview', isValid: () => true }) }),
      latLngBounds: () => ({ name: 'final-scene', count: 0, extend() { this.count++ }, isValid() { return this.count > 0 } }),
      tileLayer: url => { const layer = { url, on() {}, remove() {}, addTo() { events.push('tile'); viewsAtTileAttach.push(viewName) } }; layers.push(layer); return layer },
    },
    tileUrl: layer => layer, subdomains: [], nextTick: async () => {}, renderHailingBoundary() {}, updateScale() {},
    loadMapServices: async () => { events.push('services') }, closeLayerMenus() {}, redrawMeasurement() {},
    addAnnotation() {}, identifyClickedFeature() {}, finishMeasurement() {},
    ResizeObserver: class { observe() {} }, window: { removeEventListener() {}, addEventListener() {} },
  }
  const api = new Function('context', `const {${Object.keys(context).join(',')}} = context;
    let map, baseLayer, labelLayer, baseLayersInitialized = false, overviewFocused = false, focusedSceneLayerId = '';
    let measureGroup, annotationGroup, locationGroup, searchHighlightGroup, selectionHighlightGroup, resizeObserver, resizeFrame;
    const activeTool = {value:null}, measurePoints=[];
    ${mapFunctions}
    return {initMap, initializeBaseLayers};`)(context)
  return { api, props, events, viewsAtTileAttach }
}
const home = mapHarness()
await home.api.initMap()
assert.deepEqual(home.viewsAtTileAttach, ['final-overview', 'final-overview'])
assert.deepEqual(home.events, ['fit', 'tile', 'tile', 'services'], 'Both imagery and labels attach after the final initial view')
home.api.initializeBaseLayers()
assert.equal(home.viewsAtTileAttach.length, 2, 'Repeated readiness signals cannot duplicate basemap layers')
const sceneMap = mapHarness({ scene: true, pending: true })
await sceneMap.api.initMap()
assert.deepEqual(sceneMap.events, [], 'Scene startup sends no tile/service requests before geometry is ready')
sceneMap.props.focusGeometryPending = false
sceneMap.api.initializeBaseLayers()
assert.deepEqual(sceneMap.viewsAtTileAttach, ['final-scene', 'final-scene'])
const emptyScene = mapHarness({ scene: true, hasGeometry: false })
await emptyScene.api.initMap()
assert.equal(emptyScene.viewsAtTileAttach.length, 2, 'Missing geometry falls back to the city view instead of leaving the map blank')

console.log('dashboard-loading: lazy scene geometry, bounded/deduplicated cache, scoped summaries, unknown counts, stale identity handling and view-before-tiles passed')
