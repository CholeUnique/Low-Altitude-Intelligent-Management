import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Exercise Leaflet's installed wheel handler, including its real debounce and
// nonlinear zoom calculation, with a deterministic clock and a minimal map.
let now = 1000
let nextTimer = 0
const timers = new Map()
const defaults = { zoomSnap: 1, scrollWheelZoom: true }
let WheelHandler
const MapType = {
  mergeOptions(options) { Object.assign(defaults, options) },
  addInitHook() {},
}
const eventListeners = new Set()
const DomEvent = {
  getWheelDelta: event => event.delta,
  stop(event) { event.stopped = true },
  on(container, type, listener, context) { eventListeners.add(context) },
  off(container, type, listener, context) { eventListeners.delete(context) },
}
const wheelSource = ts.transpileModule(
  readFileSync('node_modules/leaflet/src/map/handler/Map.ScrollWheelZoom.js', 'utf8'),
  { compilerOptions: { allowJs: true, module: ts.ModuleKind.CommonJS } },
).outputText
const wheelModule = { exports: {} }
new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', 'Date', wheelSource)(
  name => {
    if (name === '../Map') return { Map: MapType }
    if (name === '../../core/Handler') return { Handler: { extend: methods => (WheelHandler = methods) } }
    if (name === '../../dom/DomEvent') return DomEvent
    if (name === '../../core/Util') return { bind: (fn, context) => fn.bind(context) }
    throw new Error(`Unexpected Leaflet dependency: ${name}`)
  }, wheelModule, wheelModule.exports,
  (fn, delay) => { const id = ++nextTimer; timers.set(id, { at: now + delay, fn }); return id },
  id => timers.delete(id),
  class extends Date { constructor() { super(now) } },
)
function advance(ms) {
  const end = now + ms
  while (true) {
    const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
    if (!next) break
    now = next[1].at
    timers.delete(next[0])
    next[1].fn()
  }
  now = end
}
function map(options = {}, initialZoom = 10) {
  const changes = []
  const value = {
    options: { ...defaults, ...options }, _container: {}, zoom: initialZoom,
    getZoom() { return this.zoom }, _stop() {},
    _limitZoom(zoom) { return Math.max(2, Math.min(20, zoom)) },
    mouseEventToContainerPoint: event => event.point,
    setZoom(zoom) { changes.push({ zoom, center: true }); this.zoom = zoom },
    setZoomAround(point, zoom) { changes.push({ zoom, point }); this.zoom = zoom },
  }
  const handler = Object.assign(Object.create(WheelHandler), { _map: value })
  handler.addHooks()
  return {
    value, changes, handler,
    wheel(delta) {
      const event = { delta, point: [120, 80] }
      handler._onWheelScroll(event)
      assert.equal(event.stopped, true, 'Map wheel must not also scroll the page')
    },
  }
}
const old = map()
old.wheel(120); advance(200)
assert.equal(old.value.zoom, 12, 'Reproduce the old two-level jump from one wheel event')
old.handler.removeHooks()

const configuredModule = { exports: {} }
const configuredSource = ts.transpileModule(readFileSync('src/utils/map-interaction.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText
new Function('require', 'module', 'exports', configuredSource)(
  name => { assert.equal(name, 'leaflet'); return { Map: MapType } },
  configuredModule, configuredModule.exports,
)
assert.match(readFileSync('src/main.ts', 'utf8'), /import ['"]\.\/utils\/map-interaction['"]/, 'Configure maps before app mounting')

const regular = map()
regular.wheel(120); advance(200)
assert.equal(regular.value.zoom, 11)
assert.deepEqual(regular.changes, [{ zoom: 11, point: [120, 80] }], 'One notch zooms once around the cursor')
regular.wheel(-120); advance(200)
assert.equal(regular.value.zoom, 10, 'Zoom out also moves one level')

const split = map()
split.wheel(40); advance(45); split.wheel(40); advance(45); split.wheel(40); advance(200)
assert.equal(split.changes.length, 1, 'A split wheel notch is coalesced into one zoom')
assert.equal(split.value.zoom, 11)
split.wheel(120); advance(150); split.wheel(120); advance(150)
assert.equal(split.value.zoom, 13, 'Deliberate subsequent notches still zoom normally')
advance(1000)
assert.equal(split.changes.length, 3, 'No delayed extra zoom after scrolling stops')

const center = map({ scrollWheelZoom: 'center' })
center.wheel(120); advance(200)
assert.deepEqual(center.changes, [{ zoom: 11, center: true }])
const maximum = map({}, 20)
maximum.wheel(120); advance(200)
assert.equal(maximum.changes.length, 0, 'Respect maximum zoom')
const minimum = map({}, 2)
minimum.wheel(-120); advance(200)
assert.equal(minimum.changes.length, 0, 'Respect minimum zoom')
const image = map({ zoomSnap: .25 })
image.wheel(30); advance(200)
assert.equal(image.value.zoom, 10.25, 'Image maps retain fractional zoom')
assert.equal(map({ scrollWheelZoom: false }).value.options.scrollWheelZoom, false, 'Thumbnail opt-out stays intact')
for (const context of [...eventListeners]) context.removeHooks()
assert.equal(eventListeners.size, 0, 'Wheel handlers detach when maps are removed')
console.log('map wheel zoom: old jump reproduced; single notch, split events, repeat scroll, cursor, limits and image zoom passed')
