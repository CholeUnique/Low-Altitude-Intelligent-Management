import assert from 'node:assert/strict'
import { harness, xml, text, coordsAt } from './map-protocol-harness.mjs'

const h = harness(), { api, internals } = h
const box = () => xml('EX_GeographicBoundingBox', {}, text('westBoundLongitude', 119.6), text('southBoundLatitude', 31.9), text('eastBoundLongitude', 120.6), text('northBoundLatitude', 33.3))
const wms = (names = ['demo:land']) => xml('WMS_Capabilities', { version: '1.3.0' }, xml('Capability', {}, xml('Layer', {},
  ...['EPSG:3857', 'EPSG:4326', 'EPSG:4490', 'CRS:84'].map(code => text('CRS', code)), box(),
  ...names.map(name => xml('Layer', {}, text('Name', name))))))
const service = (url, type = 'WMS') => ({ id: url, name: '测试地图', type, serviceUrl: url })
const base = 'https://maps.test/geoserver/wms'
h.setCapabilities('wms-one', wms())
const automatic = await api.createMapServiceLayer(service(`${base}?token=test-key`, 'GEOSERVER'))
assert(automatic.layer instanceof internals.OgcWmsTileLayer)
const coords = coordsAt(119.9255, 32.4555, 12)
const autoUrl = new URL(automatic.layer.getTileUrl(coords))
assert.equal(autoUrl.searchParams.get('LAYERS'), 'demo:land')
assert.equal(autoUrl.searchParams.get('CRS'), 'EPSG:3857')
assert.equal(autoUrl.searchParams.get('token'), 'test-key')
assert.equal(autoUrl.searchParams.get('VERSION'), '1.3.0')
assert.equal(automatic.bounds.getWest(), 119.6)
assert.equal(automatic.bounds.getNorth(), 33.3)
const requestCount = h.requests.length
assert.deepEqual((await api.inspectMapService(service(`${base}?token=test-key`, 'GEOSERVER'))).bounds, [119.6, 31.9, 120.6, 33.3])
assert.equal(h.requests.length, requestCount, 'Capability requests are reused between loading and inspection')
assert.equal(new URL(h.requests[0].url).searchParams.get('token'), 'test-key')

const legacy = await api.createMapServiceLayer(service(`${base}?LAYERS=demo:land&VERSION=1.1.1&SRS=EPSG:4326&REQUEST=GetMap&BBOX=1,2,3,4&WIDTH=900&HEIGHT=600&STYLES=outline&TIME=2026-10-19&token=test-key`))
const legacyUrl = new URL(legacy.layer.getTileUrl(coords)), legacyBox = legacyUrl.searchParams.get('BBOX').split(',').map(Number)
assert.equal(legacyUrl.searchParams.get('VERSION'), '1.1.1')
assert.equal(legacyUrl.searchParams.get('SRS'), 'EPSG:4326')
assert.equal(legacyUrl.searchParams.has('CRS'), false)
assert(legacyBox[0] > 119 && legacyBox[0] < 121 && legacyBox[1] > 31 && legacyBox[1] < 34)
assert.equal(legacyUrl.searchParams.get('WIDTH'), '256')
assert.equal(legacyUrl.searchParams.get('STYLES'), 'outline')
assert.equal(legacyUrl.searchParams.get('TIME'), '2026-10-19')
for (const name of ['VERSION', 'BBOX', 'WIDTH', 'HEIGHT', 'LAYERS', 'REQUEST']) assert.equal([...legacyUrl.searchParams.keys()].filter(key => key.toUpperCase() === name).length, 1)

for (const crs of ['EPSG:4326', 'EPSG:4490', 'CRS:84']) {
  const layer = (await api.createMapServiceLayer(service(`${base}?layers=demo:land&version=1.3.0&crs=${crs}`))).layer
  const url = new URL(layer.getTileUrl(coords)), bbox = url.searchParams.get('BBOX').split(',').map(Number)
  assert.equal(url.searchParams.get('CRS'), crs)
  assert.equal(url.searchParams.has('SRS'), false)
  assert.deepEqual(bbox, crs === 'CRS:84' ? legacyBox : [legacyBox[1], legacyBox[0], legacyBox[3], legacyBox[2]], 'WMS axis order follows version and CRS, not the map CRS')
}
h.setCapabilities('wms-multiple', wms(['a', 'b']))
await assert.rejects(api.createMapServiceLayer(service(`${base}?token=multiple`)), /指定 layers/)
await assert.rejects(api.createMapServiceLayer(service(`${base}?token=missing&layers=absent`)), /不存在所选图层/)
const regularFetch = globalThis.fetch
globalThis.fetch = async () => { throw new TypeError('CORS blocked') }
assert((await api.createMapServiceLayer(service(`${base}?token=image-only&layers=demo:land`))).layer instanceof internals.OgcWmsTileLayer, 'Explicit image-only WMS remains usable when capabilities CORS is disabled')
await assert.rejects(api.createMapServiceLayer(service(`${base}?token=cors&service=WMS`)), /CORS/)
const oldTemplate = 'https://legacy.test/wmts?token=legacy&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
assert.equal((await api.createMapServiceLayer(service(oldTemplate, 'WMTS'))).layer.kind, 'native', 'Explicit legacy templates remain available when XML cannot be read')
await assert.rejects(api.createMapServiceLayer({ ...service(`${oldTemplate}&TILEMATRIXSET=EPSG:4326`, 'WMTS') }), /CORS/, 'A geographic matrix must not silently fall back to native Mercator')
globalThis.fetch = regularFetch
h.setStatus(403)
await assert.rejects(api.createMapServiceLayer(service(`${base}?token=denied&layers=demo:land`)), /403/)
h.setStatus(200)

function wmts({ wkid = 3857, rest = false, endpoint = 'https://maps.test/geoserver/gwc/service/wmts', limited = true } = {}) {
  const setId = `EPSG:${wkid}`, geographic = wkid === 4326
  const matrices = [8, 9, 10].map((z, index) => {
    const resolution = geographic ? 360 / (256 * 2 ** z) : 156543.03392804097 / 2 ** z
    return xml('TileMatrix', {}, text('ows:Identifier', `grid:L${index}`), text('ScaleDenominator', resolution * (geographic ? 111319.49079327358 : 1) / .00028),
      text('TopLeftCorner', geographic ? '90 -180' : '-20037508.342789244 20037508.342789244'), text('TileWidth', 256), text('TileHeight', 256), text('MatrixWidth', 2 ** z), text('MatrixHeight', geographic ? 2 ** (z - 1) : 2 ** z))
  })
  return xml('Capabilities', { version: '1.0.0' }, xml('ows:OperationsMetadata', {}, xml('ows:Operation', { name: 'GetTile' }, xml('ows:DCP', {}, xml('ows:HTTP', {}, xml('ows:Get', { 'xlink:href': endpoint }))))),
    xml('Contents', {}, xml('Layer', {}, text('ows:Identifier', 'demo:land'), xml('ows:WGS84BoundingBox', {}, text('ows:LowerCorner', '119.6 31.9'), text('ows:UpperCorner', '120.6 33.3')),
      xml('Style', { isDefault: 'true' }, text('ows:Identifier', 'default')), text('Format', 'image/png'),
      xml('Dimension', {}, text('ows:Identifier', 'Time'), text('Default', '2026-10-01')),
      xml('TileMatrixSetLink', {}, text('TileMatrixSet', setId), ...(limited ? [xml('TileMatrixSetLimits', {}, ...[8, 9, 10].map((z, index) => xml('TileMatrixLimits', {}, text('TileMatrix', `grid:L${index}`), text('MinTileRow', 0), text('MaxTileRow', (geographic ? 2 ** (z - 1) : 2 ** z) - 1), text('MinTileCol', 1), text('MaxTileCol', 2 ** z - 1))))] : [])),
      ...(rest ? [xml('ResourceURL', { resourceType: 'tile', format: 'image/png', template: 'https://maps.test/tiles/{Layer}/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}?Time={Time}' })] : [])),
    xml('TileMatrixSet', {}, text('ows:Identifier', setId), text('ows:SupportedCRS', `urn:ogc:def:crs:EPSG::${wkid}`), ...matrices)))
}
const wmtsBase = 'https://maps.test/geoserver/gwc/service/wmts'
h.setCapabilities('wmts-native', wmts())
const tiled = await api.createMapServiceLayer(service(`${wmtsBase}?SERVICE=WMTS&REQUEST=GetCapabilities&token=native&TIME=2026-10-19`, 'WMTS'))
assert(tiled.layer instanceof internals.AdvertisedTileLayer)
const tiledUrl = new URL(tiled.layer.getTileUrl(coordsAt(119.9255, 32.4555, 9)))
assert.equal(tiledUrl.searchParams.get('TILEMATRIX'), 'grid:L1', 'Matrix identifiers must not be replaced by Leaflet numeric zoom')
assert.equal(tiledUrl.searchParams.get('TILEMATRIXSET'), 'EPSG:3857')
assert.equal(tiledUrl.searchParams.get('token'), 'native')
assert.equal(tiledUrl.searchParams.get('Time'), '2026-10-19')
assert.equal([...tiledUrl.searchParams.keys()].filter(key => key.toUpperCase() === 'TIME').length, 1)
assert.equal(tiledUrl.searchParams.get('REQUEST'), 'GetTile')
assert.match(tiled.layer.getTileUrl({ x: 0, y: 1, z: 9 }), /^data:/, 'Matrix limits prevent an HTTP request')
assert.deepEqual((await api.inspectMapService(service(`${wmtsBase}?token=inspect`, 'WMTS'))).bounds, [119.6, 31.9, 120.6, 33.3])
await assert.rejects(api.createMapServiceLayer(service(`${wmtsBase}?token=wrongset&TILEMATRIXSET=absent`, 'WMTS')), /TileMatrixSet/)
await assert.rejects(api.createMapServiceLayer(service(`${wmtsBase}?token=wronglayer&LAYER=absent`, 'WMTS')), /图层/)

h.setCapabilities('wmts-rest', wmts({ rest: true }))
const restLayer = (await api.createMapServiceLayer(service(`${wmtsBase}?token=rest`, 'WMTS'))).layer
const restUrl = new URL(restLayer.getTileUrl(coordsAt(119.9255, 32.4555, 9)))
assert.match(restUrl.pathname, /demo%3Aland\/default\/EPSG%3A3857\/grid%3AL1\/\d+\/\d+$/)
assert.equal(restUrl.searchParams.get('token'), 'rest')
assert.equal(restUrl.searchParams.get('Time'), '2026-10-01')
h.setCapabilities('wmts-geographic', wmts({ wkid: 4326 }))
const geographic = await api.createMapServiceLayer(service(`${wmtsBase}?token=geographic`, 'WMTS'))
assert(geographic.layer instanceof internals.MatrixTileLayer)
assert.deepEqual(geographic.layer.matrices[0].origin, [-180, 90], 'EPSG:4326 TopLeftCorner is latitude/longitude in the capabilities')
assert.equal(geographic.layer.matrices[0].width, 256)
h.setCapabilities('wmts-cdn', wmts({ endpoint: 'https://cdn.test/wmts' }))
const cdn = await api.createMapServiceLayer(service(`${wmtsBase}?token=private`, 'WMTS'))
const cdnUrl = new URL(cdn.layer.getTileUrl(coordsAt(119.9255, 32.4555, 9)))
assert.equal(cdnUrl.hostname, 'cdn.test')
assert.equal(cdnUrl.searchParams.has('token'), false, 'Capabilities cannot send original credentials to another origin')
console.log('ogc-services: capabilities, layer selection, WMS versions/axes/unique parameters, WMTS matrix IDs/limits/REST, bounds and credential isolation passed')
