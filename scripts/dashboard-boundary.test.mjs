import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const component = readFileSync('src/components/DashboardMap.vue', 'utf8')
const script = component.split('<script setup lang="ts">')[1].split('</script>')[0]
const ast = ts.createSourceFile('DashboardMap.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const names = new Set(['detachJiulongAdminLayer', 'closeJiulongBoundary', 'renderJiulongBoundary', 'toggleJiulongBoundary', 'isMapServiceGroupActive', 'toggleMapServiceGroupVisibility', 'hideMapService', 'taizhouServiceBounds', 'mapServiceViewBounds', 'toggleMapService'])
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n')
assert.equal(ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).length, names.size)
const executable = ts.transpileModule(functions, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

assert.match(script, /const jiulongBoundaryVisible = ref\(false\)/, 'Jiulong boundary starts hidden for every organization')

function harness({ fail = false, missing = false, deferred, deferredService, visible = true } = {}) {
  const service = { id: 'source::2', name: '九龙镇行政区划', arcGisLayerId: 2 }
  const refs = {
    jiulongAdminService: { value: missing ? undefined : service },
    jiulongAdminSourceId: { value: missing ? '' : 'source' },
    jiulongBoundaryVisible: { value: visible },
    jiulongBoundaryLoading: { value: false },
    jiulongBoundaryError: { value: '' },
    mapServicesLoading: { value: false },
    activeFeature: { value: undefined },
    vectorLayerColors: { value: {} }, vectorFillOpacity: { value: {} },
    visibleMapServiceIds: { value: ['source::0', 'other::0'] },
    vectorFilterPanels: { value: [] }, expandedCategoryIds: { value: [] },
  }
  const calls = { added: 0, removed: 0, fits: 0, messages: [], order: [], lastFit: undefined, creationOptions: undefined }
  const cityGeometry = { type: 'FeatureCollection', features: [] }
  const cityBounds = { isValid: () => true, contains: () => false }
  const handle = {
    layer: { attached: false, on() {}, addTo() { this.attached = true; calls.added += 1; calls.order.push('add') }, remove() { this.attached = false; calls.removed += 1 } },
    bounds: { isValid: () => true, contains: () => true }, setFillOpacity() {},
  }
  const context = {
    ...refs,
    L: { geoJSON(geometry) { assert.equal(geometry, cityGeometry); return { getBounds: () => cityBounds } } },
    taizhouDistrictBoundariesWgs84: cityGeometry,
    map: { fitBounds(bounds, options) { calls.fits += 1; calls.lastFit = { bounds, options }; calls.order.push('fit') }, hasLayer: layer => layer.attached, getBounds: () => ({}), invalidateSize() {} },
    mapServiceLayers: new Map(), loadingMapServiceIds: new Set(), mapServiceVisibilityVersions: new Map(),
    requestedLayerOrder: [],
    createMapServiceLayer: async (_service, _color, options) => {
      calls.creationOptions = options
      return deferredService ? deferredService.promise : handle
    },
    assignMapServicePane() {}, paneForMapService: () => '', syncMapServiceStack() {}, vectorLayerColor: () => '#fff', showToolMessage(message) { calls.messages.push(message) },
    createAdministrativeBoundaryLayer: async () => {
      if (fail) throw new Error('地图服务拒绝访问（403）')
      return deferred ? deferred.promise : handle
    },
    clearSelectionHighlight() {}, renderHailingBoundary() {},
  }
  const api = new Function('context', `
    const { ${Object.keys(context).join(', ')} } = context;
    let jiulongAdminRequest = 0, jiulongAdminHandle, jiulongAdminPendingFit = false, overviewFocused = false, mapServiceRequestVersion = 0;
    ${executable}
    return { ${[...names].join(', ')} };
  `)(context)
  return { refs, calls, handle, api, cityBounds }
}

const initiallyHidden = harness({ visible: false })
await initiallyHidden.api.renderJiulongBoundary(false)
assert.equal(initiallyHidden.calls.added, 0, 'Entering the homepage must not display the boundary')
initiallyHidden.api.toggleJiulongBoundary()
await new Promise(resolve => setImmediate(resolve))
assert.equal(initiallyHidden.calls.added, 1, 'The boundary can still be enabled manually')
assert.equal(initiallyHidden.calls.fits, 1, 'Manual activation retains boundary positioning')

const normal = harness()
await normal.api.renderJiulongBoundary(true)
assert.equal(normal.calls.added, 1)
assert.equal(normal.refs.jiulongBoundaryLoading.value, false)
await normal.api.toggleMapServiceGroupVisibility({ id: 'source', layers: [{ id: 'source::0' }] })
assert.equal(normal.refs.jiulongBoundaryVisible.value, false, 'Closing the source service closes its detached boundary')
assert.equal(normal.calls.removed, 1)
assert.deepEqual(normal.refs.visibleMapServiceIds.value, ['other::0'])

const unrelated = harness()
await unrelated.api.toggleMapServiceGroupVisibility({ id: 'other', layers: [{ id: 'other::0' }] })
assert.equal(unrelated.refs.jiulongBoundaryVisible.value, true, 'Closing unrelated imagery must not close the boundary')

const missing = harness({ missing: true })
await missing.api.renderJiulongBoundary(false)
assert.equal(missing.refs.jiulongBoundaryVisible.value, false)
assert.match(missing.refs.jiulongBoundaryError.value, /来源服务/)

const denied = harness({ fail: true })
await denied.api.renderJiulongBoundary(false)
assert.equal(denied.refs.jiulongBoundaryVisible.value, false)
assert.equal(denied.refs.jiulongBoundaryLoading.value, false)
assert.match(denied.refs.jiulongBoundaryError.value, /403/)
denied.refs.jiulongBoundaryVisible.value = true
denied.api.toggleJiulongBoundary()
assert.equal(denied.refs.jiulongBoundaryVisible.value, false, 'The switch can always turn off an errored boundary')
assert.equal(denied.refs.jiulongBoundaryError.value, '')

let resolve
const pending = { promise: new Promise(done => { resolve = done }) }
const racing = harness({ deferred: pending })
const loading = racing.api.renderJiulongBoundary(false)
assert.equal(racing.refs.jiulongBoundaryLoading.value, true)
racing.api.toggleJiulongBoundary()
resolve(racing.handle)
await loading
assert.equal(racing.calls.added, 0, 'A response arriving after closing must never re-add the boundary')
assert.equal(racing.calls.removed, 1)
assert.equal(racing.refs.jiulongBoundaryVisible.value, false)
assert.equal(racing.refs.jiulongBoundaryLoading.value, false)

let resolveService
const pendingService = { promise: new Promise(done => { resolveService = done }) }
const pendingGroup = harness({ deferredService: pendingService })
pendingGroup.refs.visibleMapServiceIds.value = []
pendingGroup.refs.jiulongBoundaryVisible.value = false
const serviceLoading = pendingGroup.api.toggleMapService({ id: 'source::0' })
await pendingGroup.api.toggleMapServiceGroupVisibility({ id: 'source', layers: [{ id: 'source::0' }] })
resolveService(pendingGroup.handle)
await serviceLoading
assert.equal(pendingGroup.calls.added, 0, 'Turning off a loading parent also prevents pending child layers from reappearing')
assert.deepEqual(pendingGroup.refs.visibleMapServiceIds.value, [])

const extraction = harness({ missing: true })
const admin = { id: 'source::2', name: '九龙镇行政区划' }
const sibling = { id: 'source::0', name: '农田' }
assert.deepEqual(extraction.api.detachJiulongAdminLayer({ id: 'source', name: '农田数据' }, [sibling, admin]), [sibling])
assert.equal(extraction.refs.jiulongAdminSourceId.value, 'source', 'Boundary dependencies use source IDs, not inferred imagery names')
const noExtent = harness()
noExtent.handle.bounds = undefined
await noExtent.api.toggleMapService({ id: 'imagery', name: '普通影像' })
assert.equal(noExtent.calls.added, 1, 'Services without extent still load normally')
assert.equal(noExtent.calls.fits, 0, 'Missing extent preserves the current viewport')
assert.deepEqual(noExtent.calls.messages, [], 'Missing optional extent must not produce a normal-load warning')
assert.equal(noExtent.calls.creationOptions.fallbackRequestBounds, undefined, 'Ordinary services must not inherit the Taizhou request restriction')
for (const service of [
  { id: 'taizhou', name: '泰州天地图' },
  { id: 'renamed', name: '市级地图', serviceUrl: 'https://jiangsu.tianditu.gov.cn/taizhou/forwarder/services/example/arcgis/tile' },
]) {
  const fallback = harness()
  fallback.handle.bounds = undefined
  await fallback.api.toggleMapService(service)
  assert.equal(fallback.calls.lastFit.bounds, fallback.cityBounds, 'Taizhou services without extent use the local city administrative geometry for the default view')
  assert.equal(fallback.calls.lastFit.options.animate, false)
  assert.equal(fallback.calls.creationOptions.fallbackRequestBounds, fallback.cityBounds, 'The city range constrains requests before the layer is created')
  assert.deepEqual(fallback.calls.order, ['fit', 'add'], 'Position before adding the layer to avoid requesting the previous wide viewport')
  assert.equal(fallback.handle.bounds, undefined, 'The default view must not masquerade as actual service coverage')
  assert.deepEqual(fallback.calls.messages, [])
}
const actualExtent = harness()
actualExtent.handle.bounds.contains = () => false
await actualExtent.api.toggleMapService({ id: 'taizhou', name: '泰州天地图' })
assert.equal(actualExtent.calls.lastFit.bounds, actualExtent.handle.bounds, 'Real service extent takes precedence over the city default')
assert.equal(actualExtent.calls.lastFit.options.animate, true)
const alreadyInCity = harness()
alreadyInCity.handle.bounds = undefined
alreadyInCity.cityBounds.contains = () => true
await alreadyInCity.api.toggleMapService({ id: 'taizhou', name: '泰州天地图' })
assert.equal(alreadyInCity.calls.fits, 0, 'Preserve an existing close-up view inside Taizhou')
console.log('dashboard-boundary: source dependency, missing source, errors, independent imagery and async close passed')
