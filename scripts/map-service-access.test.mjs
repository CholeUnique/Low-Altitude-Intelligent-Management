import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const tileLayers = []
const leaflet = {
  TileLayer: class {}, LayerGroup: class {}, Layer: class {}, GridLayer: class {},
  tileLayer: (url, options) => { const layer = { url, options }; tileLayers.push(layer); return layer },
}
globalThis.window = { setTimeout, clearTimeout }
let jsonpRequests = 0
let jsonpPayload = { layers: [] }
globalThis.document = {
  createElement: () => ({ remove() {} }),
  head: { appendChild(script) {
    jsonpRequests += 1
    const url = new URL(script.src)
    assert.equal(url.searchParams.get('devAPIKey'), 'test-key')
    queueMicrotask(() => window[url.searchParams.get('callback')](jsonpPayload))
  } },
}
const source = ts.transpileModule(readFileSync('src/utils/map-service-layer.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const module = { exports: {} }
const internals = new Function('require', 'module', 'exports', `${source}\nreturn { loadArcGisJson, loadArcGisMetadata, queryArcGis, servicePath, serviceParameters };`)(id => {
  if (id === 'leaflet') return { default: leaflet }
  if (id === 'proj4') return { default: { defs() {} } }
  throw new Error(`Unexpected dependency ${id}`)
}, module, module.exports)
const api = module.exports
const root = 'https://example.test/MapServer?devAPIKey=test-key'
const response = (payload, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(payload), json: async () => payload })

// CORS 可读且 Content-Type 为 text/plain 的 JSON 不需要执行 JSONP 脚本。
globalThis.fetch = async (url, options) => {
  assert.equal(options.method, undefined)
  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('devAPIKey'), 'test-key')
  assert.equal(parsed.searchParams.get('f'), 'json')
  assert.equal(parsed.searchParams.has('callback'), false)
  return response({ layers: [] })
}
assert.deepEqual(await internals.loadArcGisMetadata(`${root}&callback=oldCallback`), { layers: [] })
assert.equal(jsonpRequests, 0)
globalThis.fetch = async () => response({ extent: { xmin: 119, ymin: 32, xmax: 120, ymax: 33 } })
assert.equal((await internals.loadArcGisMetadata(root)).extent.xmin, 119, 'ImageServer metadata uses extent instead of fullExtent')

globalThis.fetch = async () => { throw new TypeError('CORS blocked') }
assert.deepEqual(await internals.loadArcGisMetadata(root), { layers: [] })
assert.equal(jsonpRequests, 1, 'Legacy services still fall back to JSONP when fetch is blocked')
jsonpPayload = { error: { code: 499 } }
await assert.rejects(internals.loadArcGisMetadata(root), /499/)

const scriptsBefore403 = jsonpRequests
globalThis.fetch = async () => response({}, 403)
await assert.rejects(internals.loadArcGisMetadata(root), /拒绝访问.*403/)
await assert.rejects(internals.queryArcGis(root, new URLSearchParams()), /拒绝访问.*403/)
assert.equal(jsonpRequests, scriptsBefore403, 'Authorization failures must not be hidden by a second JSONP request')
globalThis.fetch = async () => response({ error: { code: 498 } })
await assert.rejects(internals.loadArcGisMetadata(root), /498/)
globalThis.fetch = async () => response({ status: 403, message: 'Forbidden' })
await assert.rejects(internals.loadArcGisMetadata(root), /403/)
globalThis.fetch = async () => ({ ok: true, text: async () => '<html>Login required</html>' })
await assert.rejects(internals.loadArcGisMetadata(root), /有效的 JSON/)
await assert.rejects(internals.loadArcGisMetadata('https://example.test/arcgis/tile/tile?devAPIKey=test-key'), /瓦片接口.*完整瓦片地址/)

const expectedQuery = 'https://example.test/MapServer/2/query?devAPIKey=test-key'
assert.equal(internals.servicePath(root, '2/query'), expectedQuery)
const combined = new URL(internals.serviceParameters(`${expectedQuery}&f=html`, new URLSearchParams({ f: 'json', where: '1=1' })))
assert.equal(combined.pathname, '/MapServer/2/query')
assert.equal(combined.searchParams.get('devAPIKey'), 'test-key')
assert.deepEqual(combined.searchParams.getAll('f'), ['json'])

// 配置中附带的鉴权参数要出现在瓦片查询中，而不是出现在 /tile 路径前。
globalThis.fetch = async () => response({ singleFusedMapCache: true, tileInfo: {
  spatialReference: { wkid: 3857 }, origin: { x: -20037508.342789244, y: 20037508.342789244 }, rows: 256, cols: 256,
  lods: Array.from({ length: 19 }, (_, level) => ({ level, resolution: 156543.03392804097 / 2 ** level })),
} })
await api.createMapServiceLayer({ id: 'cached', name: '缓存影像', serviceUrl: root, type: 'ARCGIS_MAPSERVER' })
assert.equal(tileLayers.at(-1).url, 'https://example.test/MapServer/tile/{z}/{y}/{x}?devAPIKey=test-key')

globalThis.fetch = async () => { throw new Error('Template URLs must not request metadata') }
const templateService = { id: 'forwarder', name: '泰州天地图', type: 'ARCGIS_MAPSERVER', serviceUrl: 'https://example.test/arcgis/tile/tile?devAPIKey=test-key&z={z}&x={x}&y={y}' }
await api.createMapServiceLayer(templateService)
assert.equal(tileLayers.at(-1).url, templateService.serviceUrl)
assert.deepEqual(await api.expandMapServiceSublayers(templateService), [templateService])

// POST 被服务禁用时使用 GET，同时保留原 URL 的密钥。
globalThis.fetch = async (url, options) => {
  if (options.method === 'POST') return response({}, 405)
  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('devAPIKey'), 'test-key')
  assert.equal(parsed.searchParams.get('where'), '1=1')
  return response({ objectIds: [1] })
}
assert.deepEqual(await internals.queryArcGis(expectedQuery, new URLSearchParams({ where: '1=1' })), { objectIds: [1] })
console.log('map-service-access: JSON/CORS/JSONP, auth errors, tile templates and authenticated child URLs passed')
