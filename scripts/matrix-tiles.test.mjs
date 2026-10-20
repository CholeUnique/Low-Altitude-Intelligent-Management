import assert from 'node:assert/strict'
import proj4 from 'proj4'
import { harness, render, coordsAt } from './map-protocol-harness.mjs'

const h = harness(), { api, internals } = h
const service = suffix => ({ id: suffix, name: '缓存影像', type: 'ARCGIS_MAPSERVER', serviceUrl: `https://maps.test/${suffix}/MapServer?token=test-key` })
const metadata = (wkid, lods, origin = { x: -180, y: 90 }, size = 256) => ({ singleFusedMapCache: true,
  tileInfo: { spatialReference: { wkid }, rows: size, cols: size, origin, lods } })
const tileCalls = () => h.requests.filter(request => /\/tile\//.test(new URL(request.url).pathname))
const requestCoords = request => new URL(request.url).pathname.split('/').slice(-3).map(Number)
const coords = coordsAt(119.9255, 32.4555, 11)

h.setMetadata(metadata(3857, [0, 1, 2, 3].map(level => ({ level, resolution: 156543.03392804097 / 2 ** level })), { x: -20037508.342789244, y: 20037508.342789244 }))
const canonical = await api.createMapServiceLayer(service('standard'))
assert.equal(canonical.layer.kind, 'native', 'Verified standard Mercator caches retain the lightweight native renderer')
assert.match(canonical.layer.url, /\/tile\/\{z\}\/\{y\}\/\{x\}\?token=test-key$/)

h.setMetadata(metadata(4326, [9, 10, 11].map(level => ({ level, resolution: 180 / (256 * 2 ** level) }))))
const geographic = await api.createMapServiceLayer(service('geographic'))
assert(geographic.layer instanceof internals.MatrixTileLayer)
const before = tileCalls().length
const result = await render(geographic.layer, coords).completed
assert.equal(result.error, undefined)
assert(result.tile.draws.length > 0)
assert(result.tile.transforms.length > 0)
const calls = tileCalls().slice(before).map(requestCoords)
const expectedCol = Math.floor((119.9255 + 180) / (256 * (180 / (256 * 2 ** 10))))
const expectedRow = Math.floor((90 - 32.4555) / (256 * (180 / (256 * 2 ** 10))))
assert(calls.some(([level, row, col]) => level === 10 && row === expectedRow && col === expectedCol), 'ArcGIS geographic cache level is selected by resolution, not the Leaflet zoom')
assert(calls.every(([level]) => level === 10))
assert(calls.every(([, row]) => row !== coords.y), 'Mercator row numbers cannot be reused for geographic caches')
for (const request of tileCalls()) assert.equal(new URL(request.url).searchParams.get('token'), 'test-key')
const afterFirst = tileCalls().length
const cached = await render(geographic.layer, coords).completed
assert.equal(cached.tile.draws.length, 1)
assert.equal(tileCalls().length, afterFirst)

h.setMetadata(metadata(4490, [{ level: 21, resolution: 180 / (256 * 2 ** 10) }], { x: -180, y: 90 }, 512))
const large = await api.createMapServiceLayer(service('large-tiles'))
const beforeLarge = tileCalls().length
assert.equal((await render(large.layer, coords).completed).error, undefined)
assert(tileCalls().slice(beforeLarge).map(requestCoords).some(([level, row, col]) => level === 21 && row === Math.floor(expectedRow / 2) && col === Math.floor(expectedCol / 2)), 'Tile dimensions are read from the cache metadata')

const resolution = 156543.03392804097 / 2 ** 11
h.setMetadata(metadata(3857, [{ level: 40, resolution }], { x: -20037508.342789244 + resolution * 100, y: 20037508.342789244 - resolution * 75 }))
const shifted = await api.createMapServiceLayer(service('shifted-origin'))
assert(shifted.layer instanceof internals.MatrixTileLayer)
const beforeShift = tileCalls().length
const shiftedResult = await render(shifted.layer, coords).completed
assert.equal(shiftedResult.error, undefined)
const shiftedPlan = shifted.layer.plan(coords)
assert(Math.abs(shiftedPlan.points[0][0][0] - (coords.x * 256 - 100)) < 1e-5)
assert(Math.abs(shiftedPlan.points[0][0][1] - (coords.y * 256 - 75)) < 1e-5)
assert(tileCalls().slice(beforeShift).map(requestCoords).every(([level]) => level === 40), 'Custom origins and custom LOD identifiers are both honored')

h.setMetadata(metadata(3857, [{ level: 3, resolution: 156543.03392804097 / 2 ** 8 }, { level: 8, resolution: 156543.03392804097 / 2 ** 10 }, { level: 17, resolution: 156543.03392804097 / 2 ** 12 }], { x: -20037508.342789244, y: 20037508.342789244 }))
const sparse = await api.createMapServiceLayer(service('sparse'))
const beforeSparse = tileCalls().length
await render(sparse.layer, coordsAt(119.9255, 32.4555, 10)).completed
assert(tileCalls().slice(beforeSparse).map(requestCoords).every(([level]) => level === 8), 'Noncontinuous source LODs never become invented intermediate level requests')

const projectedCenter = proj4('EPSG:4326', 'EPSG:4549', [119.9255, 32.4555])
h.setMetadata(metadata(4549, [{ level: 7, resolution: 100 }], { x: projectedCenter[0] - 100000, y: projectedCenter[1] + 100000 }))
const projected = await api.createMapServiceLayer(service('projected'))
assert.equal((await render(projected.layer, coordsAt(119.9255, 32.4555, 10)).completed).error, undefined, 'Registered CGCS2000 projected cache schemes use reprojection instead of XYZ assumptions')

const fallback = h.L.latLngBounds([31.9, 119.6], [33.3, 120.6])
h.setMetadata(metadata(4326, [{ level: 8, resolution: 360 / (256 * 2 ** 8) }]))
const bounded = await api.createMapServiceLayer(service('bounded'), undefined, { fallbackRequestBounds: fallback })
const beforeOutside = tileCalls().length
const outside = await render(bounded.layer, coordsAt(111.5, 34.5, 8)).completed
assert.equal(outside.error, undefined)
assert.equal(outside.tile.draws.length, 0)
assert.equal(tileCalls().length, beforeOutside, 'Geographic source filtering preserves the Taizhou boundary optimization')

h.setMetadata({ ...metadata(4326, [{ level: 8, resolution: 360 / (256 * 2 ** 8) }, { level: 9, resolution: 360 / (256 * 2 ** 9) }]), minLOD: 9, maxLOD: 9 })
const restricted = await api.createMapServiceLayer(service('published-levels'))
assert.deepEqual(restricted.layer.matrices.map(matrix => matrix.id), ['9'], 'Only published minLOD/maxLOD levels are requested')

for (const [suffix, value, message] of [
  ['unknown', metadata(32650, [{ level: 0, resolution: 100 }]), /坐标系/],
  ['no-origin', metadata(4326, [{ level: 0, resolution: .703125 }], {}), /原点/],
  ['bad-resolution', metadata(4326, [{ level: 0, resolution: 0 }]), /分辨率/],
]) {
  h.setMetadata(value)
  await assert.rejects(api.createMapServiceLayer(service(suffix)), message)
}

h.setMetadata(metadata(4326, [{ level: 10, resolution: 180 / (256 * 2 ** 10) }]))
const denied = await api.createMapServiceLayer(service('denied'))
h.setStatus(403)
assert.match((await render(denied.layer, coords).completed).error.message, /403/)
assert.equal(denied.layer.missingTiles.size, 0)
h.setStatus(200)
const cancelled = await api.createMapServiceLayer(service('cancelled'))
h.setPendingImages(true)
let completions = 0
const cancelledTile = cancelled.layer.createTile(coords, () => { completions += 1 })
await new Promise(resolve => setImmediate(resolve))
assert(cancelled.layer.requests.size > 0)
cancelled.layer.onRemove({})
await new Promise(resolve => setImmediate(resolve))
assert.equal(cancelled.layer.requests.size, 0)
assert.equal(completions, 0)
assert.equal(cancelledTile.draws.length, 0)
h.setPendingImages(false)

let transform
const context = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, drawImage() {}, transform(...values) { transform = values } }
internals.drawTileTriangle(context, { naturalWidth: 256, naturalHeight: 256 }, [[100, 200], [110, 200], [100, 210]], [[0, 0], [16, 0], [0, 16]], { tileWidth: 256, tileHeight: 256 }, 0, 0)
const [a, b, c, d, e, f] = transform
assert(Math.abs(a * 105 + c * 205 + e - 8) < 1e-8 && Math.abs(b * 105 + d * 205 + f - 8) < 1e-8, 'Mesh affine transforms preserve the geographic pixel location')
console.log('matrix-tiles: ArcGIS geographic/projected/shifted/sparse/512px caches, published levels, auth, bounds, cancellation and affine rendering passed')
