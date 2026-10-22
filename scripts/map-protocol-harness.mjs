import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import proj4 from 'proj4'

export class XmlNode {
  constructor(name, attributes = {}, children = []) { this.localName = name.split(':').at(-1); this.attributes = attributes; this.nodes = children }
  get children() { return this.nodes.filter(node => typeof node !== 'string') }
  get textContent() { return this.nodes.map(node => typeof node === 'string' ? node : node.textContent).join('') }
  getAttribute(key) { return this.attributes[key] ?? null }
  getAttributeNS(_namespace, key) { return this.attributes[`xlink:${key}`] ?? this.getAttribute(key) }
  getElementsByTagName(name) { return this.children.flatMap(child => [...(name === '*' || name === child.localName ? [child] : []), ...child.getElementsByTagName(name)]) }
}
export const xml = (name, attributes = {}, ...children) => new XmlNode(name, attributes, children)
export const text = (name, value) => xml(name, {}, String(value))
export const documentOf = root => Object.assign(xml('#document', {}, root), { documentElement: root })

class Bounds {
  constructor(points) { this.points = []; points.forEach(point => this.extend(point)) }
  extend(point) { this.points.push(Array.isArray(point) ? { lat: point[0], lng: point[1] } : point); return this }
  isValid() { return this.points.length > 0 }
  getWest() { return Math.min(...this.points.map(point => point.lng)) }
  getEast() { return Math.max(...this.points.map(point => point.lng)) }
  getSouth() { return Math.min(...this.points.map(point => point.lat)) }
  getNorth() { return Math.max(...this.points.map(point => point.lat)) }
  getSouthWest() { return { lng: this.getWest(), lat: this.getSouth() } }
  getNorthEast() { return { lng: this.getEast(), lat: this.getNorth() } }
  getCenter() { return { lng: (this.getWest() + this.getEast()) / 2, lat: (this.getSouth() + this.getNorth()) / 2 } }
  contains(point) { return point.lng >= this.getWest() && point.lng <= this.getEast() && point.lat >= this.getSouth() && point.lat <= this.getNorth() }
}

export function harness() {
  const requests = [], images = [], documents = new Map()
  let metadata, capabilities, status = 200, pendingImages = false
  const unproject = (point, zoom) => ({ lng: point.x / (256 * 2 ** zoom) * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * point.y / (256 * 2 ** zoom)))) * 180 / Math.PI })
  class GridLayer {
    constructor(options) { this.options = options; this._map = { unproject }; this.listeners = new Map(); this.events = [] }
    on(name, callback) { this.listeners.set(name, callback); return this }
    fire(name, event) { this.events.push({ name, ...event }); this.listeners.get(name)?.(event) }
    _isValidTile(coords) { return coords.x >= 0 && coords.y >= 0 }
    _tileCoordsToBounds(coords) {
      const nw = this._map.unproject({ x: coords.x * 256, y: coords.y * 256 }, coords.z)
      const se = this._map.unproject({ x: (coords.x + 1) * 256, y: (coords.y + 1) * 256 }, coords.z)
      return new Bounds([nw, se])
    }
    onAdd(map) { this._map = map; return this }
    onRemove() { this._map = undefined; return this }
    getTileSize() { return { x: this.options.tileSize || 256, y: this.options.tileSize || 256 } }
  }
  class TileLayer extends GridLayer {
    constructor(url, options) { super(options); this.url = url }
  }
  const L = { GridLayer, TileLayer, Layer: class {}, LayerGroup: class {},
    point: (x, y) => ({ x, y }), latLng: (lat, lng) => ({ lat, lng }), latLngBounds: (a, b) => new Bounds(b ? [a, b] : a),
    tileLayer: (url, options) => ({ kind: 'native', url, options }),
    CRS: { EPSG3857: { unproject: ({ x, y }) => ({ lng: x * 180 / 20037508.342789244, lat: Math.atan(Math.sinh(y / 6378137)) * 180 / Math.PI }) } },
  }
  globalThis.window = { setTimeout, clearTimeout, location: { href: 'https://app.example.test/' } }
  globalThis.DOMParser = class { parseFromString(value) { assert(documents.has(value), `Unknown XML fixture ${value}`); return documents.get(value) } }
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    const params = new URL(url).searchParams
    const isCapabilities = [...params].some(([name, value]) => name.toUpperCase() === 'REQUEST' && value === 'GetCapabilities')
    return { status, ok: status >= 200 && status < 300,
      text: async () => isCapabilities ? capabilities : JSON.stringify(metadata),
      blob: async () => new Blob(['tile'], { type: 'image/png' }) }
  }
  globalThis.Image = class {
    constructor() { this.naturalWidth = this.naturalHeight = 256; images.push(this) }
    set src(value) { this.value = value; if (value && !pendingImages) queueMicrotask(() => this.onload?.()) }
    get src() { return this.value }
  }
  globalThis.document = { createElement(name) {
    assert.equal(name, 'canvas')
    const draws = [], transforms = []
    const context = { save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, clip() {},
      transform(...values) { assert(values.every(Number.isFinite)); transforms.push(values) }, drawImage(...values) { draws.push(values) } }
    return { draws, transforms, getContext: () => context }
  } }
  const source = ts.transpileModule(readFileSync('src/utils/map-service-layer.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  const internals = new Function('require', 'module', 'exports', `${source}\nreturn {MatrixTileLayer, CoverageAwareArcGisTileLayer, AdvertisedTileLayer, OgcWmsTileLayer, drawTileTriangle, resolveWmts, resolveWms, projectionWkid};`)(id => {
    if (id === 'leaflet') return { default: L }
    if (id === 'proj4') return { default: proj4 }
    throw new Error(`Unexpected dependency ${id}`)
  }, module, module.exports)
  return { api: module.exports, internals, L, requests, images,
    setMetadata(value) { metadata = value }, setStatus(value) { status = value }, setPendingImages(value) { pendingImages = value },
    setCapabilities(id, value) { capabilities = id; documents.set(id, documentOf(value)) },
  }
}

export const coordsAt = (lng, lat, z) => ({ z, x: Math.floor((lng + 180) / 360 * 2 ** z), y: Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z) })
export function render(layer, coords) {
  let tile
  const completed = new Promise(resolve => { tile = layer.createTile(coords, (error, result) => resolve({ error, tile: result })) })
  return { tile, completed }
}
