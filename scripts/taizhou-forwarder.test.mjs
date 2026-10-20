import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const imageUrls = []
const tileRequests = []
const sourceImages = []
const requestSignals = new Map()
let imageMode = 'success'
let fetchMode = 'image'
let statusForUrl = () => 200
globalThis.window = { setTimeout, clearTimeout }
globalThis.fetch = async (url, options) => {
  assert.match(new URL(url).pathname, /\/tile\/\d+\/\d+\/\d+$/, 'Requests must be real tiles, never metadata')
  tileRequests.push(url)
  requestSignals.set(url, options.signal)
  if (fetchMode === 'cors') throw new TypeError('CORS blocked')
  const status = statusForUrl(url)
  return { status, ok: status < 400, blob: async () => new Blob(['tile'], { type: 'image/png' }) }
}
globalThis.Image = class {
  naturalWidth = 256
  naturalHeight = 256
  constructor() { sourceImages.push(this) }
  set src(url) {
    this.url = url
    if (!url) return
    imageUrls.push(url)
    if (imageMode === 'success') queueMicrotask(() => this.onload?.())
    if (imageMode === 'error') queueMicrotask(() => this.onerror?.())
  }
  get src() { return this.url }
}
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas')
  const draws = []
  return { draws, getContext: () => ({ drawImage: (...args) => draws.push(args) }) }
} }
class GridLayer {
  constructor(options) { this.options = options; this.listeners = new Map(); this._map = {}; this.events = [] }
  on(name, handler) { this.listeners.set(name, handler); return this }
  fire(name, event) { this.events.push({ name, ...event }); this.listeners.get(name)?.(event) }
  onAdd(map) { this._map = map; return this }
  onRemove() { this._map = undefined; return this }
}
const leaflet = {
  TileLayer: class {}, LayerGroup: class {}, Layer: class {}, GridLayer,
  tileLayer: (url, options) => ({ url, options }),
  latLngBounds: (southWest, northEast) => ({
    isValid: () => true,
    getWest: () => southWest[1], getEast: () => northEast[1],
    getSouth: () => southWest[0], getNorth: () => northEast[0],
    getSouthWest: () => ({ lat: southWest[0], lng: southWest[1] }),
    getNorthEast: () => ({ lat: northEast[0], lng: northEast[1] }),
  }),
}
const source = ts.transpileModule(readFileSync('src/utils/map-service-layer.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
const internals = new Function('require', 'module', 'exports', `${source}\nreturn { taizhouForwarderTemplate, geographicTileSamples, TaizhouGeographicTileLayer };`)(id => {
  if (id === 'leaflet') return { default: leaflet }
  if (id === 'proj4') return { default: { defs() {} } }
  throw new Error(`Unexpected dependency ${id}`)
}, module, module.exports)
const api = module.exports
const root = 'https://jiangsu.tianditu.gov.cn/taizhou/forwarder/services/test-service/arcgis/tile'
const template = `${root}/tile/{z}/{y}/{x}?devAPIKey=test-key`
for (const path of [root, `${root}/`, `${root}/tile`, `${root}/tile/12/657/3412`, `${root}/tile/{z}/{y}/{x}`]) {
  assert.equal(internals.taizhouForwarderTemplate(`${path}?devAPIKey=test-key&f=json&callback=old`), template)
}
assert.equal(internals.taizhouForwarderTemplate('https://example.test/arcgis/tile'), undefined)
assert.equal(internals.taizhouForwarderTemplate('https://jiangsu.tianditu.gov.cn/other/MapServer'), undefined)

const service = { id: 'forwarder', name: '泰州天地图', type: 'ARCGIS_MAPSERVER', serviceUrl: `${root}?devAPIKey=test-key` }
assert.deepEqual(await api.expandMapServiceSublayers(service), [service])
assert.deepEqual(await api.inspectMapService(service), { isImagery: true, bounds: undefined })
const handle = await api.createMapServiceLayer(service)
assert(handle.layer instanceof internals.TaizhouGeographicTileLayer)
const coords = { x: 3412, y: 1660, z: 12 }
const plan = internals.geographicTileSamples(coords)
assert(plan.rows.includes(657), 'The provider geographic row 657 must be used, not Mercator row 1660')
const sampleLatitude = 90 - 657.5 * 360 / 2 ** 12
const mercatorY = (1 - Math.log(Math.tan(Math.PI / 4 + sampleLatitude * Math.PI / 360)) / Math.PI) / 2 * 2 ** 12
const destinationRow = Math.floor((mercatorY - coords.y) * 256)
assert(plan.samples[destinationRow].top <= 657.5 * 256)
assert(plan.samples[destinationRow].bottom >= 657.5 * 256, 'Reprojection preserves the source pixel geographic position')

function render(layer, tileCoords = coords) {
  let tile
  const completed = new Promise(resolve => { tile = layer.createTile(tileCoords, (error, result) => resolve({ error, tile: result })) })
  return { tile, completed }
}
const first = render(handle.layer)
const result = await first.completed
assert.equal(result.error, undefined)
assert(first.tile.draws.length >= 256)
const drawnHeight = first.tile.draws.reduce((sum, draw) => sum + draw[8], 0)
assert(Math.abs(drawnHeight - 256) < 1e-6, 'Canvas strips cover the whole destination without gaps or overlap')
assert(tileRequests.some(url => new URL(url).pathname.endsWith('/tile/12/657/3412')))
for (const url of tileRequests) {
  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('devAPIKey'), 'test-key')
  assert.equal(parsed.searchParams.has('f'), false)
  assert.equal(parsed.searchParams.has('callback'), false)
}
const requested = tileRequests.length
const cachedRender = await render(handle.layer).completed
assert.equal(tileRequests.length, requested, 'Repeated views reuse loaded source images')
assert.equal(cachedRender.tile.draws.length, 1, 'Repeated views copy the bounded projected-canvas cache instead of drawing 256 strips again')

const mercator = await api.createMapServiceLayer({ ...service, remark: '{"tileWkid":3857}' })
assert.equal(mercator.layer.url, template, 'Confirmed Mercator services can use native tile rendering')
imageMode = 'error'
const failed = await api.createMapServiceLayer(service)
assert.match((await render(failed.layer).completed).error.message, /无法显示为图片/)

imageMode = 'pending'
const cancelled = await api.createMapServiceLayer(service)
let callbacks = 0
const cancelledTile = cancelled.layer.createTile(coords, () => { callbacks += 1 })
cancelled.layer.onRemove({})
await new Promise(resolve => setImmediate(resolve))
assert.equal(callbacks, 0, 'Closing the layer discards pending tiles')
assert.equal(cancelledTile.draws.length, 0)
assert.equal(cancelled.layer.requests.size, 0)

const unloaded = await api.createMapServiceLayer(service)
const imageStart = sourceImages.length
const unloadedTile = unloaded.layer.createTile(coords, () => { callbacks += 1 })
unloaded.layer.fire('tileunload', { tile: unloadedTile })
await new Promise(resolve => setImmediate(resolve))
sourceImages.slice(imageStart).forEach(image => image.onload?.())
await new Promise(resolve => setImmediate(resolve))
assert.equal(unloadedTile.draws.length, 0, 'Panning away discards the canvas without drawing stale results')
assert.equal(callbacks, 0)
assert.equal(unloaded.layer.requests.size, 0, 'Offscreen tiles release their queued and active requests')

const shared = await api.createMapServiceLayer(service)
const sharedStart = sourceImages.length
const sharedA = render(shared.layer)
const sharedB = render(shared.layer)
await new Promise(resolve => setImmediate(resolve))
assert.equal(sourceImages.length - sharedStart, plan.rows.length, 'Consumers share each in-flight source image')
shared.layer.fire('tileunload', { tile: sharedA.tile })
assert.equal(shared.layer.requests.size, plan.rows.length, 'Unloading one consumer must not abort another consumer')
sourceImages.slice(sharedStart).forEach(image => image.onload?.())
assert.equal((await sharedB.completed).error, undefined)
assert.equal(sharedA.tile.draws.length, 0)

const scheduled = await api.createMapServiceLayer(service)
const beforeScheduled = tileRequests.length
const batch = Array.from({ length: 12 }, (_, index) => render(scheduled.layer, { ...coords, x: coords.x + index }))
await new Promise(resolve => setImmediate(resolve))
assert.equal(tileRequests.length - beforeScheduled, 6, 'At most six source requests/decode operations run simultaneously')
assert(scheduled.layer.requests.size > 6, 'The remaining tiles wait in the queue')
scheduled.layer._map = {
  getCenter: () => ({}),
  project: () => ({ x: (coords.x + 11.5) * 256, y: (coords.y + 0.5) * 256 }),
}
const abortedUrl = tileRequests[beforeScheduled]
scheduled.layer.fire('tileunload', { tile: batch[0].tile })
await new Promise(resolve => setImmediate(resolve))
assert.equal(requestSignals.get(abortedUrl).aborted, true, 'The last offscreen consumer aborts its active source request')
assert.equal(Number(new URL(tileRequests[beforeScheduled + 6]).pathname.split('/').at(-1)), coords.x + 11, 'Newly available slots prioritize the latest viewport center')
scheduled.layer.fire('tileunload', { tile: batch[6].tile })
scheduled.layer.onRemove({})
await new Promise(resolve => setImmediate(resolve))
assert(!tileRequests.slice(beforeScheduled).some(url => Number(new URL(url).pathname.split('/').at(-1)) === coords.x + 6), 'Queued offscreen tiles never start a network request')
assert.equal(scheduled.layer.activeRequests, 0)
assert.equal(scheduled.layer.requests.size, 0)
assert.equal(scheduled.layer.renderedTiles.size, 0)
imageMode = 'success'
scheduled.layer.onAdd({})
assert.equal((await render(scheduled.layer).completed).error, undefined, 'A removed layer can be enabled again without a stopped queue')
for (let index = 0; index < 70; index += 1) {
  await render(scheduled.layer, { ...coords, x: coords.x + index, y: coords.y + index }).completed
}
assert(scheduled.layer.images.size <= 64, 'Source-image memory stays bounded while panning')
assert.equal(scheduled.layer.renderedTiles.size, 32, 'Projected canvases use a bounded LRU cache')
assert.equal(scheduled.layer.projectionPlans.size, 64, 'Projection sampling plans also stay bounded')
scheduled.layer.onRemove({})

imageMode = 'success'
const edgeCoords = Array.from({ length: 8 }, (_, index) => ({ ...coords, y: 1656 + index }))
  .find(value => internals.geographicTileSamples(value).rows.length === 2)
assert(edgeCoords)
const edgeRows = internals.geographicTileSamples(edgeCoords).rows
statusForUrl = url => Number(new URL(url).pathname.split('/').at(-2)) === edgeRows[0] ? 200 : 404
const edge = await api.createMapServiceLayer(service)
const partial = await render(edge.layer, edgeCoords).completed
assert.equal(partial.error, undefined, 'A missing neighboring source tile is a normal transparent area')
const partialHeight = partial.tile.draws.reduce((sum, draw) => sum + draw[8], 0)
assert(partialHeight > 0 && partialHeight < 256, 'The available part of an edge tile remains visible')
assert.equal(edge.layer.events.filter(event => event.name === 'tileerror').length, 0)
const afterEdgeRequests = tileRequests.length
await render(edge.layer, edgeCoords).completed
assert.equal(tileRequests.length, afterEdgeRequests, 'Confirmed 404 tiles are cached briefly instead of repeatedly requested')

statusForUrl = () => 404
const absent = await api.createMapServiceLayer(service)
const blank = await render(absent.layer).completed
assert.equal(blank.error, undefined)
assert.equal(blank.tile.draws.length, 0, 'Completely missing coverage is transparent and does not raise a tile error')
for (const key of absent.layer.missingTiles.keys()) absent.layer.missingTiles.set(key, Date.now() - 1)
statusForUrl = () => 200
assert((await render(absent.layer).completed).tile.draws.length >= 256, 'Negative-cache expiry allows newly published tiles to appear')
statusForUrl = () => 204
const noContent = await api.createMapServiceLayer(service)
assert.equal((await render(noContent.layer).completed).error, undefined)
assert(noContent.layer.missingTiles.size > 0, 'A declared empty response is also transparent coverage')

for (const status of [401, 403, 500]) {
  statusForUrl = () => status
  const denied = await api.createMapServiceLayer(service)
  assert.match((await render(denied.layer).completed).error.message, new RegExp(String(status)))
  assert.equal(denied.layer.missingTiles.size, 0, 'Auth and server errors must never be cached as missing coverage')
}
statusForUrl = url => Number(new URL(url).pathname.split('/').at(-2)) === edgeRows[0] ? 200 : 403
const partialDenied = await api.createMapServiceLayer(service)
const partialDeniedResult = await render(partialDenied.layer, edgeCoords).completed
assert.equal(partialDeniedResult.error, undefined, 'A real error in a neighbor must not hide the successfully painted part')
assert(partialDeniedResult.tile.draws.length > 0)
assert(partialDenied.layer.events.some(event => event.name === 'tileerror' && /403/.test(event.error.message)), 'The real access failure is still reported separately')

statusForUrl = () => 200
fetchMode = 'cors'
const cors = await api.createMapServiceLayer(service)
assert.equal((await render(cors.layer).completed).error, undefined, 'Legacy image access remains available when fetch CORS is unavailable')
assert(imageUrls.some(url => url === `${root}/tile/12/657/3412?devAPIKey=test-key`))
fetchMode = 'image'

imageMode = 'pending'
const normalTimeout = window.setTimeout
window.setTimeout = callback => setTimeout(callback, 5)
const timedOut = await api.createMapServiceLayer(service)
assert.match((await render(timedOut.layer).completed).error.message, /读取超时/)
assert.equal(timedOut.layer.missingTiles.size, 0, 'Timeouts must not turn into permanent blank coverage')
window.setTimeout = normalTimeout
imageMode = 'success'

const configured = await api.createMapServiceLayer({ ...service, remark: JSON.stringify({
  fullExtent: { xmin: 119, ymin: 32, xmax: 120, ymax: 33, spatialReference: { wkid: 4490 } },
  tileInfo: { spatialReference: { wkid: 4490 }, lods: [{ level: 10 }, { level: 12 }] },
}) }, undefined, { fallbackRequestBounds: leaflet.latLngBounds([10, 10], [20, 20]) })
assert.equal(configured.layer.options.bounds, configured.bounds, 'Configured coverage takes precedence over the business fallback')
assert.equal(configured.layer.options.minZoom, 10, 'Published minimum level is also a display limit, not an invitation to request higher-detail tiles when zoomed out')
assert.equal(configured.layer.options.maxZoom, 12)
assert.equal(configured.layer.options.minNativeZoom, 10)
assert.equal(configured.layer.options.maxNativeZoom, 12)
const beforeOutside = tileRequests.length
const outside = await render(configured.layer, { ...coords, x: 1000 }).completed
assert.equal(outside.error, undefined)
assert.equal(outside.tile.draws.length, 0)
assert.equal(tileRequests.length, beforeOutside, 'No requests are sent outside the confirmed service bounds')

const cityBounds = leaflet.latLngBounds([31.92, 119.63], [33.22, 120.56])
const limited = await api.createMapServiceLayer(service, undefined, { fallbackRequestBounds: cityBounds })
assert.equal(limited.bounds, undefined, 'Business request bounds must not be reported as the service published extent')
assert.equal(limited.layer.options.bounds, cityBounds, 'Leaflet filters destination tiles using the city bounding rectangle')
assert.equal(limited.layer.coverageBounds, cityBounds, 'Source tiles are filtered separately after geographic reprojection')
const beforeFarAway = tileRequests.length
assert.equal((await render(limited.layer, { z: 8, x: 207, y: 101 }).completed).tile.draws.length, 0)
const outsideImage = await limited.layer.sourceImage(8, 39, 207, {}, { z: 8, x: 207, y: 101 })
assert.equal(outsideImage, undefined)
assert.equal(tileRequests.length, beforeFarAway, 'The exact 8/39/207 tile shown in the screenshot is rejected before fetching')

for (const z of [8, 9, 10, 12]) {
  const x = Math.floor((119.9255 + 180) / 360 * 2 ** z)
  const y = Math.floor((1 - Math.asinh(Math.tan(32.4555 * Math.PI / 180)) / Math.PI) / 2 * 2 ** z)
  const beforeViewport = tileRequests.length
  for (let dx = -4; dx <= 4; dx += 1) {
    for (let dy = -2; dy <= 2; dy += 1) await render(limited.layer, { z, x: x + dx, y: y + dy }).completed
  }
  const fetched = tileRequests.slice(beforeViewport)
  assert(fetched.length > 0, `Taizhou data must remain requestable at zoom ${z}`)
  for (const url of fetched) {
    const [level, row, column] = new URL(url).pathname.split('/').slice(-3).map(Number)
    const span = 360 / 2 ** level
    assert(column * span - 180 < cityBounds.getEast() && (column + 1) * span - 180 > cityBounds.getWest())
    assert(90 - row * span > cityBounds.getSouth() && 90 - (row + 1) * span < cityBounds.getNorth(), 'Only source tiles intersecting Taizhou may reach the network')
  }
}
const borderCoords = { z: 8, x: 213, y: Math.floor((1 - Math.asinh(Math.tan(33.22 * Math.PI / 180)) / Math.PI) / 2 * 256) }
assert((await render(limited.layer, borderCoords).completed).tile.draws.length > 0, 'Tiles intersecting the city edge remain available; they are not rejected because their center is outside')
const limitedMercator = await api.createMapServiceLayer({ ...service, remark: '{"tileWkid":3857}' }, undefined, { fallbackRequestBounds: cityBounds })
assert.equal(limitedMercator.layer.options.bounds, cityBounds, 'Native Mercator tiles honor the same request bounds')
assert.equal(limitedMercator.bounds, undefined)
const invalidFallback = await api.createMapServiceLayer(service, undefined, { fallbackRequestBounds: { isValid: () => false } })
assert.equal(invalidFallback.layer.options.bounds, undefined, 'Invalid fallback bounds cannot suppress all map requests')
console.log('taizhou-forwarder: reprojection, coverage, real errors, bounds/levels, concurrency, viewport priority, shared cancellation and bounded caches passed')
