import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as Vue from 'vue'

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
function load(source, dependencies = {}) {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compile(source))(name => {
    assert(name in dependencies, `Unexpected import: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
const telemetry = load(readFileSync('src/utils/video-telemetry.ts', 'utf8'))
const { parseVideoSrt, telemetryAtTime, interpolatedTelemetryAtTime, clampTelemetryPanel, decodeVideoSrt, bindVideoTelemetryClock, formatTelemetryCoordinates } = telemetry
const locationUtils = load(readFileSync('src/utils/telemetry-location.ts', 'utf8'))
const panelUtils = load(readFileSync('src/utils/telemetry-panel.ts', 'utf8'))
const playbackUtils = load(readFileSync('src/utils/video-playback.ts', 'utf8'))
const clickVideo = { controls: true, paused: true, ended: false, plays: 0, pauses: 0,
  getBoundingClientRect: () => ({ bottom: 700, height: 600 }),
  async play() { this.plays++; this.paused = false }, pause() { this.pauses++; this.paused = true },
}
const surfaceClick = overrides => ({ currentTarget: clickVideo, target: clickVideo, button: 0, detail: 1, clientY: 300, defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true }, ...overrides })
const firstClick = surfaceClick()
assert.equal(await playbackUtils.toggleVideoSurfacePlayback(firstClick), true)
assert(firstClick.defaultPrevented, 'Prevent native surface action from toggling a second time')
assert.equal(clickVideo.plays, 1)
await playbackUtils.toggleVideoSurfacePlayback(surfaceClick())
assert.equal(clickVideo.pauses, 1, 'Second surface click pauses playback')
const controlClick = surfaceClick({ clientY: 680 })
assert.equal(await playbackUtils.toggleVideoSurfacePlayback(controlClick), false)
assert.equal(controlClick.defaultPrevented, false, 'Leave native play, scrub, volume and fullscreen controls untouched')
assert.equal(await playbackUtils.toggleVideoSurfacePlayback(surfaceClick({ target: {} })), false)
assert.equal(await playbackUtils.toggleVideoSurfacePlayback(surfaceClick({ button: 2 })), false)
assert.equal(await playbackUtils.toggleVideoSurfacePlayback(surfaceClick({ defaultPrevented: true })), false)
clickVideo.ended = true
await playbackUtils.toggleVideoSurfacePlayback(surfaceClick())
assert.equal(clickVideo.plays, 2, 'A finished video can restart from the surface')
clickVideo.play = async () => { throw new Error('NotAllowedError') }
await assert.rejects(playbackUtils.toggleVideoSurfacePlayback(surfaceClick()), /NotAllowedError/, 'Caller can show a real playback error instead of an unhandled rejection')
assert.equal(formatTelemetryCoordinates({ longitude: 119.839961, latitude: 32.477212 }), '119.839961°E, 32.477212°N')
assert.equal(formatTelemetryCoordinates({ longitude: -119.839961, latitude: -32.477212 }), '119.839961°W, 32.477212°S')
assert.equal(formatTelemetryCoordinates(), '经纬度 —')
const cue = (start, end, body) => `1\n00:00:${start} --> 00:00:${end}\n<font>${body}</font>\n\n`
const sample = '\ufeff' + cue('00,000', '01,000', '[latitude: 32.47] [longitude: 119.84] [rel_alt: 45.2 abs_alt: 60.3]')
  + cue('01,000', '02,000', '[latitude: 32.471] [longitude: 119.841]')
  + cue('02,000', '03,000', '[latitude: 0] [longitude: 0]')
  + cue('04.000', '05.000', 'GPS (119.842,32.472,65)')
const parsed = parseVideoSrt(sample.replace(/\n/g, '\r\n'))
assert.equal(parsed.points.length, 3)
assert.equal(parsed.skipped, 1)
assert.equal(parsed.points[0].relativeAltitude, 45.2)
assert.equal(parsed.points[0].absoluteAltitude, 60.3)
assert.equal(telemetryAtTime(parsed.points, 0).latitude, 32.47)
assert.equal(telemetryAtTime(parsed.points, 1).latitude, 32.471, 'Boundary uses the next cue')
assert.equal(telemetryAtTime(parsed.points, 3), undefined, 'No stale fix in GPS gaps')
assert.equal(telemetryAtTime(parsed.points, -1), undefined)
assert.equal(telemetryAtTime(parsed.points, 10), undefined)
assert.equal(telemetryAtTime(parsed.points, NaN), undefined)
assert.equal(telemetryAtTime(parsed.points, 4.5).longitude, 119.842)
assert.equal(parseVideoSrt(cue('00,000', '01,000', 'GPS(32.472,119.842,65)')).points[0].longitude, 119.842)
assert.throws(() => parseVideoSrt(cue('00,000', '01,000', 'GPS(32.472,59.842,65)')), /没有有效/, 'Do not guess ambiguous legacy coordinate ordering')
assert.throws(() => parseVideoSrt(cue('00,000', '01,000', '[latitude: 95] [longitude: 119]')), /没有有效/)
assert.throws(() => parseVideoSrt(cue('02,000', '01,000', '[latitude: 32] [longitude: 119]')), /没有有效/)
assert.throws(() => parseVideoSrt('ordinary subtitle without GPS'), /没有有效/)
assert.throws(() => parseVideoSrt(cue('00,000', '01,000', '[latitude: 32.1.2] [longitude: 119]')), /没有有效/)
assert.throws(() => parseVideoSrt(cue('00,000', '01,000', '[latitude: 32]') + cue('01,000', '02,000', '[longitude: 119]')), /没有有效/, 'Never combine coordinates across cues')
assert.equal(parseVideoSrt(cue('04,000', '05,000', 'latitude: 32 longitude: 119') + sample).points[0].start, 0, 'Sort unordered cues')
const smoothPoints = [
  { start: 0, end: 1, latitude: 32, longitude: 119, relativeAltitude: 10 },
  { start: 1, end: 2, latitude: 32.0001, longitude: 119.0001, relativeAltitude: 20 },
]
assert.equal(interpolatedTelemetryAtTime(smoothPoints, .5).latitude, 32.00005)
assert(Math.abs(interpolatedTelemetryAtTime(smoothPoints, .5).longitude - 119.00005) < 1e-10)
assert.equal(interpolatedTelemetryAtTime(smoothPoints, .5).relativeAltitude, 15)
assert.equal(interpolatedTelemetryAtTime(smoothPoints, 1).latitude, 32.0001)
assert.equal(interpolatedTelemetryAtTime(smoothPoints, 2.1), undefined)
const gapPoints = [smoothPoints[0], { ...smoothPoints[1], start: 1.5, end: 2.5 }]
assert.equal(interpolatedTelemetryAtTime(gapPoints, .5).latitude, 32, 'Never interpolate toward a point across a missing interval')
assert.equal(interpolatedTelemetryAtTime(gapPoints, 1.2), undefined)
assert.equal(interpolatedTelemetryAtTime([{ ...smoothPoints[0], end: 5 }, { ...smoothPoints[1], start: 5, end: 6 }], 2).latitude, 32, 'No smoothing over a long sample interval')
assert.equal(interpolatedTelemetryAtTime(parsed.points, .5).latitude, 32.47, 'Do not interpolate anomalous high-speed jumps')
assert.deepEqual(clampTelemetryPanel(-20, 900, 340, 330, 1000, 700), { left: 8, top: 362 })
assert.deepEqual(clampTelemetryPanel(999, -40, 340, 330, 500, 500), { left: 152, top: 8 })
assert.deepEqual(clampTelemetryPanel(999, 999, 340, 330, 300, 200), { left: 0, top: 0 }, 'Very small container cannot place the title outside the viewport')

const video = { taskId: 'A', fileName: 'DJI_0001_V.mp4' }
const srt = { taskId: 'A', fileName: 'dji_0001_v.SRT', id: 's' }
assert.equal(await decodeVideoSrt(new Blob([sample])), sample.replace(/^\ufeff/, ''))
assert.equal(await decodeVideoSrt(new Blob([Buffer.from('\ufeff' + sample.replace(/^\ufeff/, ''), 'utf16le')])), sample.replace(/^\ufeff/, ''))
await assert.rejects(decodeVideoSrt(new Blob([])), /非空/)
await assert.rejects(decodeVideoSrt(new Blob([new Uint8Array(telemetry.MAX_SRT_BYTES + 1)])), /20 MB/)

const frames = new Map()
let frameId = 0
globalThis.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId }
globalThis.cancelAnimationFrame = id => frames.delete(id)
class Video extends EventTarget { currentTime = 0; paused = true; ended = false }
const element = new Video(), updates = []
const cleanupClock = bindVideoTelemetryClock(element, time => updates.push(time))
assert.equal(frames.size, 0)
element.currentTime = 4.2; element.dispatchEvent(new Event('seeking'))
assert.equal(updates.at(-1), 4.2, 'Seek synchronizes even while paused')
element.paused = false; element.dispatchEvent(new Event('play'))
assert.equal(frames.size, 1)
element.dispatchEvent(new Event('playing')); assert.equal(frames.size, 1, 'No duplicate frame loop')
const [id, callback] = [...frames][0]; frames.delete(id)
element.currentTime = 7.5; callback(1000)
assert.equal(updates.at(-1), 7.5, 'Use media time, not elapsed wall time at different playback rates')
const [nextId, nextFrame] = [...frames][0]; frames.delete(nextId)
element.currentTime = 7.54; nextFrame(1040)
assert.equal(updates.at(-1), 7.54, 'Update within 40 ms instead of the old 100 ms throttle')
element.paused = true; element.dispatchEvent(new Event('pause'))
assert.equal(frames.size, 0)
cleanupClock()
const count = updates.length
element.dispatchEvent(new Event('seeking')); assert.equal(updates.length, count, 'Listeners removed on closing/switching')

// Mount the actual SFC with Vue's custom renderer and a Leaflet test double.
const nodes = (type, text = '') => ({ type, text, children: [], props: {}, parent: null })
const renderer = Vue.createRenderer({
  createElement: type => nodes(type), createText: text => nodes('text', text), createComment: text => nodes('comment', text),
  insert(child, parent, anchor) { if (child.parent) this.remove(child); child.parent = parent; const index = parent.children.indexOf(anchor); if (index < 0) parent.children.push(child); else parent.children.splice(index, 0, child) },
  remove(child) { const index = child.parent?.children.indexOf(child); if (index >= 0) child.parent.children.splice(index, 1); child.parent = null },
  setText(node, text) { node.text = text }, setElementText(node, text) { node.text = text; node.children = [] },
  parentNode: node => node.parent, nextSibling(node) { return node.parent?.children[node.parent.children.indexOf(node) + 1] },
  patchProp(node, key, before, after) { node.props[key] = after },
})
const mapCalls = [], markers = [], mapHandlers = {}
let mapCenter = [32, 119], mapOptions, pixelsPerDegree = 100000
const map = { setView(...args) { mapCenter = args[0]; mapCalls.push(['view', ...args]); return this },
  panTo(...args) { mapCenter = args[0]; mapCalls.push(['pan', ...args]) }, fitBounds() {}, invalidateSize() {}, stop() {},
  on(name, handler) { mapHandlers[name] = handler; return this }, getSize: () => ({ x: 340, y: 200 }),
  latLngToContainerPoint: ([latitude, longitude]) => ({ x: 170 + (longitude - mapCenter[1]) * pixelsPerDegree, y: 100 + (latitude - mapCenter[0]) * pixelsPerDegree }),
  remove() { mapCalls.push(['remove']) } }
const leaflet = { map: (container, options) => { mapOptions = options; return map },
  tileLayer: () => ({ on() { return this }, addTo() { return this } }),
  divIcon: value => value, polyline: () => ({ addTo() { return this }, remove() {}, getBounds() { return [] } }),
  marker(coordinate) { const marker = { coordinate, removed: false, addTo() { return this }, setLatLng(value) { this.coordinate = value }, remove() { this.removed = true } }; markers.push(marker); return marker },
}
let resizeCallback
globalThis.ResizeObserver = class { constructor(callback) { resizeCallback = callback } observe() {} disconnect() {} }
const pending = []
const geocodingCalls = []
let geocodingGate
function buildOverlay() {
  let source = readFileSync('src/workspace-components/spot-identification/VideoTelemetryOverlay.vue', 'utf8')
  source = source.replace('</script>', 'defineExpose({ points, busy, error, sourceName, loadSrt, readVideoSrt, chooseLocal, follow, panel, panelPosition, panelSize, videoBounds, dragging, resizing, updatePanelLayout, startDrag, moveDrag, endDrag, movePanelWithKey, startResize, moveResize, endResize, scalePanel });\n</script>')
  const { descriptor } = parse(source)
  return load(compileScript(descriptor, { id: 'test-overlay', inlineTemplate: true }).content.replace('import.meta.env.VITE_TIANDITU_TOKEN', "'test-map-key'"), {
    vue: Vue, leaflet, 'leaflet/dist/leaflet.css': {}, '@/utils/video-telemetry': telemetry,
    '@/utils/telemetry-panel': panelUtils,
    '@/utils/telemetry-location': { createTelemetryLocationResolver: (request, publish) => locationUtils.createTelemetryLocationResolver(request, publish, { minIntervalMs: 0 }) },
    '@/api/geocoding': { getTiandituAddress: (...args) => {
      geocodingCalls.push(args)
      return typeof geocodingGate === 'function' ? geocodingGate(...args) : geocodingGate || Promise.resolve('江苏省泰州市海陵区示例村附近')
    } },
    '@/api/flight-review': {
      getFlightReviewSrtFile: (...args) => new Promise((resolve, reject) => pending.push({ resolve, reject, args, kind: 'attachment' })),
      getFlightReviewVideoSrtFile: (...args) => new Promise((resolve, reject) => pending.push({ resolve, reject, args, kind: 'video' })),
    },
  }).default
}
const media = { ...video, id: 'v', type: 'video', originalUrl: 'https://video.test/a.mp4' }
const playback = Vue.markRaw(new Video())
const props = Vue.reactive({ media, mediaList: [], video: playback })
async function seek(time) { playback.currentTime = time; playback.dispatchEvent(new Event('seeked')); await Vue.nextTick() }
const Overlay = buildOverlay()
let vm
const root = nodes('root'), app = renderer.createApp({ setup: () => () => Vue.h(Overlay, { ...props, onToggleFullscreen: () => { props.fullscreen = !props.fullscreen }, ref: instance => { if (instance) vm = instance } }) })
app.mount(root)
assert.equal(mapOptions.zoomControl, false)
assert.equal(mapOptions.attributionControl, false, 'No green-box controls overlaying the map; credit is in the panel footer')
assert.equal(pending.length, 1, 'Opening reads the video SRT even without any SRT attachment in the list')
assert.equal(pending[0].kind, 'video')
assert.equal(pending[0].args[0], 'v', 'Use video media ID, not task ID, file URL, or SRT attachment ID')
assert.equal(vm.busy, true)
pending.shift().resolve(new Blob([sample])); await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick()
assert.equal(vm.points.length, 3)
assert.deepEqual(markers.at(-1).coordinate, [32.47, 119.84])
function findClass(node, name) { return String(node.props?.class || '').split(' ').includes(name) ? node : node.children.map(child => findClass(child, name)).find(Boolean) }
function findAria(node, name) { return node.props?.['aria-label'] === name ? node : node.children.map(child => findAria(child, name)).find(Boolean) }
function textContent(node) { return (node.text || '') + node.children.map(textContent).join('') }
const infoRow = findClass(root, 'telemetry-info'), locationRow = findClass(root, 'telemetry-location')
assert(infoRow && locationRow)
assert.equal(infoRow.children.filter(node => node.type === 'span').length, 3, 'Time, coordinate pair, altitude occupy three columns of one row')
assert.match(textContent(infoRow), /119\.840000°E, 32\.470000°N/)
assert.match(textContent(locationRow), /当前位置：江苏省泰州市海陵区示例村附近/)
assert(!findClass(root, 'telemetry-source') && !findClass(root, 'telemetry-credit'), 'Remove both lines in the red box')
const controlsNode = findClass(root, 'telemetry-controls')
assert(controlsNode.children.indexOf(locationRow) > controlsNode.children.indexOf(infoRow))
assert(controlsNode.children.indexOf(findClass(root, 'telemetry-actions')) > controlsNode.children.indexOf(locationRow), 'Buttons follow the new position row')
await seek(4.5)
assert.deepEqual(markers.at(-1).coordinate, [32.472, 119.842], 'Actual map marker follows playback/seek')
await seek(3)
assert.equal(markers.at(-1).removed, true, 'Hide marker during missing GPS interval')
// Measure the real contained video rectangle, not player letterboxing.
const stage = { clientWidth: 1000, clientHeight: 700, clientLeft: 0, clientTop: 0, getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight } } }
function attachPanelLayout(instance) {
  instance.panel.offsetParent = stage
  Object.defineProperties(instance.panel, Object.fromEntries([['offsetLeft', 'left'], ['offsetTop', 'top'], ['offsetWidth', 'width'], ['offsetHeight', 'height']].map(([property, style]) => [property, { configurable: true, get: () => parseFloat(instance.panel.props.style[style]) || 0 }])))
}
attachPanelLayout(vm)
Object.assign(playback, { videoWidth: 1920, videoHeight: 1080, getBoundingClientRect: () => stage.getBoundingClientRect() })
vm.updatePanelLayout(true); await Vue.nextTick()
assert.deepEqual(vm.panelPosition, { left: 652, top: 76.75 }, 'Default at actual video top-right, below horizontal black bars')
assert.deepEqual(vm.panelSize, { width: 340, height: 300 })
const captured = new Set()
const handle = { setPointerCapture(id) { captured.add(id) }, hasPointerCapture: id => captured.has(id), releasePointerCapture(id) { captured.delete(id) } }
const pointer = { button: 0, isPrimary: true, pointerId: 1, clientX: 650, clientY: 320, target: { closest: () => null }, currentTarget: handle, preventDefault() {} }
vm.startDrag(pointer)
assert.equal(vm.dragging, true)
assert(captured.has(1))
const beforeUnrelatedPointer = { ...vm.panelPosition }
vm.moveDrag({ pointerId: 2, clientX: 0, clientY: 0 }); assert.deepEqual(vm.panelPosition, beforeUnrelatedPointer, 'Ignore unrelated touch pointers')
vm.moveDrag({ pointerId: 1, clientX: -50, clientY: 1000 })
assert.deepEqual(vm.panelPosition, { left: 8, top: 323.25 })
vm.endDrag({ pointerId: 1 }); assert.equal(captured.size, 0)
assert.equal(vm.dragging, false)
stage.clientWidth = 500; stage.clientHeight = 450
resizeCallback(); await Vue.nextTick()
assert(vm.panelPosition.top >= vm.videoBounds.top + 8)
assert(vm.panelPosition.top + vm.panelSize.height <= vm.videoBounds.top + vm.videoBounds.height - 8)
vm.startDrag({ ...pointer, target: { closest: () => ({ type: 'button' }) } })
assert.equal(vm.dragging, false, 'Clicking close button must not initiate dragging')
const keyTarget = {}
vm.movePanelWithKey({ target: keyTarget, currentTarget: keyTarget, key: 'ArrowLeft', preventDefault() {} })
assert.equal(vm.panelPosition.left, 8, 'Keyboard movement is also clamped')
stage.clientWidth = 1000; stage.clientHeight = 700
vm.updatePanelLayout(true); await Vue.nextTick()
vm.startResize(pointer, 'left')
assert.equal(vm.resizing, true)
vm.moveResize({ pointerId: 1, clientX: pointer.clientX - 120, clientY: pointer.clientY + 60 })
assert.deepEqual(vm.panelSize, { width: 460, height: 360 })
assert.equal(vm.panelPosition.left + vm.panelSize.width, 992, 'Left corner grows a top-right-docked window to the left')
vm.endResize({ pointerId: 1 }); assert.equal(captured.size, 0)
assert.equal(vm.resizing, false)
assert(!findAria(root, '放大协同窗口') && !findAria(root, '缩小协同窗口') && !findAria(root, '全屏播放视频'), 'Remove all three red-box buttons, keep close and corner handles')
assert(findAria(root, '关闭协同展示'))
assert.equal(findAria(root, '关闭协同展示').props.title, '关闭协同展示', 'Close tooltip overrides the draggable header tooltip')
const resizeHandle = findAria(root, '从左下角调整窗口大小')
resizeHandle.props.onKeydown({ key: 'ArrowRight', preventDefault() {} }); await Vue.nextTick()
const manualSize = { ...vm.panelSize }
assert(manualSize.width > 460)
stage.clientWidth = 2000; stage.clientHeight = 1000
props.fullscreen = true
await Vue.nextTick(); await Vue.nextTick()
assert.equal(vm.panelPosition.top, 8, 'Entering fullscreen re-docks at picture top-right')
assert(Math.abs(vm.panelPosition.left + vm.panelSize.width - (vm.videoBounds.left + vm.videoBounds.width - 8)) < 1e-6)
stage.clientWidth = 500; stage.clientHeight = 450
props.fullscreen = false
await Vue.nextTick(); await Vue.nextTick()
assert(vm.panelSize.width < manualSize.width && vm.panelSize.height < manualSize.height, 'Leaving fullscreen shrinks to fit the smaller video picture')
assert(Math.abs(vm.panelPosition.top - vm.videoBounds.top - 8) < 1e-6)
stage.clientWidth = 2000; stage.clientHeight = 1000
props.fullscreen = true
await Vue.nextTick(); await Vue.nextTick()
assert.deepEqual(vm.panelSize, manualSize, 'Return to fullscreen restores requested size instead of permanently losing it')
vm.startResize(pointer, 'left')
vm.moveResize({ pointerId: 1, clientX: -10000, clientY: 10000 })
vm.endResize({ pointerId: 1 }); await Vue.nextTick()
assert(vm.panelSize.width > 720 && vm.panelSize.height > 640, 'Mounted overlay grows beyond the former fixed maximum')
assert(vm.panelSize.width <= vm.videoBounds.width - 16 && vm.panelSize.height <= vm.videoBounds.height - 16)
props.mediaList = [srt]; await Vue.nextTick()
assert.equal(pending.length, 0, 'Background pagination of attachments must not override the direct video SRT')
vm.readVideoSrt()
const notReadyRequest = pending.shift()
notReadyRequest.reject(new Error('当前视频的 SRT 尚未就绪'))
await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick()
assert.match(vm.error, /尚未就绪/)
assert.equal(vm.points.length, 0, 'Failed requests clear old coordinates')
vm.readVideoSrt()
assert.equal(pending[0].kind, 'video', 'Retry reads the same video endpoint without starting a generation task')
pending.shift().resolve(new Blob([sample])); await new Promise(resolve => setImmediate(resolve))
// Mounted interpolation really moves the marker between two samples without camera churn.
const smoothLoad = vm.loadSrt(srt), smoothRequest = pending.shift()
smoothRequest.resolve(new Blob([cue('00,000', '01,000', '[latitude: 32] [longitude: 119]') + cue('01,000', '02,000', '[latitude: 32.0001] [longitude: 119.0001]')]))
await smoothLoad; await seek(0)
const panCount = mapCalls.filter(call => call[0] === 'pan').length
await seek(.5)
assert.equal(markers.at(-1).coordinate[0], 32.00005, 'Actual map uses interpolated position, not a staircase')
assert.equal(mapCalls.filter(call => call[0] === 'pan').length, panCount, 'Central marker movement does not reposition tiles every frame')
await seek(1.5)
await seek(.25)
assert.equal(markers.at(-1).coordinate[0], 32.000025, 'Backward seek immediately uses media time without a catch-up animation')
pixelsPerDegree = 1000000
await seek(.9)
assert.equal(mapCalls.at(-1)[0], 'pan')
assert.equal(mapCalls.at(-1)[2].animate, true, 'Follow camera uses smooth pan only after leaving central area')
const smoothPanCount = mapCalls.filter(call => call[0] === 'pan').length
await seek(.95)
assert.equal(mapCalls.filter(call => call[0] === 'pan').length, smoothPanCount, 'Do not restart the follow animation every frame')
mapHandlers.moveend()
mapHandlers.dragstart()
await Vue.nextTick()
assert.equal(vm.follow, false, 'Dragging inside the map only pans the map and suspends auto follow')
pixelsPerDegree = 100000
// Race: loading a different SRT must discard an older response.
const old = vm.loadSrt({ ...srt, fileName: 'old.srt' }), oldRequest = pending.shift()
const fresh = vm.loadSrt({ ...srt, fileName: 'new.srt' }), newRequest = pending.shift()
assert.equal(newRequest.kind, 'attachment', 'Manual attachment selection uses file download, not the video subtitle endpoint')
assert.equal(oldRequest.args[1].aborted, true)
newRequest.resolve(new Blob([cue('00,000', '01,000', '[latitude: 31] [longitude: 118]')]))
await fresh; oldRequest.resolve(new Blob([sample])); await old
assert.equal(vm.points[0].latitude, 31, 'Old response never overwrites selected file')
playback.paused = false; playback.dispatchEvent(new Event('play'))
assert.equal(frames.size, 1, 'Mini-map owns its animation loop')
vm.startDrag(pointer)
const closing = vm.loadSrt(srt), closingRequest = pending.shift()
app.unmount()
assert.equal(captured.size, 0, 'Closing releases active header pointer capture')
assert.equal(closingRequest.args[1].aborted, true)
closingRequest.resolve(new Blob([sample])); await closing
assert.equal(vm.points.length, 0, 'Closing invalidates late response')
assert.equal(mapCalls.at(-1)[0], 'remove')
assert.equal(frames.size, 0, 'Closing the mini map stops its local animation clock')

// Only the first actual play event queries once; loading SRT later preserves that event's time.
const firstVideo = Vue.markRaw(new Video())
const firstRoot = nodes('root')
const firstProps = Vue.reactive({ media, mediaList: [], video: firstVideo, playbackStarted: false })
const firstApp = renderer.createApp({ setup: () => () => Vue.h(Overlay, firstProps) })
firstApp.mount(firstRoot)
const beforeFirstPlay = geocodingCalls.length
firstVideo.paused = false; firstVideo.dispatchEvent(new Event('play'))
firstProps.playbackStarted = true; await Vue.nextTick()
firstVideo.currentTime = 4.5; firstVideo.dispatchEvent(new Event('timeupdate')); await Vue.nextTick()
pending.shift().resolve(new Blob([sample])); await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforeFirstPlay + 1)
assert.equal(geocodingCalls.at(-1)[1], 119.84, 'Deferred first-play query uses the initial click time rather than the later frame')
assert.match(textContent(findClass(firstRoot, 'telemetry-location')), /首次播放位置：江苏省/)
firstVideo.dispatchEvent(new Event('playing')); firstVideo.dispatchEvent(new Event('waiting')); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforeFirstPlay + 1)
firstVideo.paused = true; firstVideo.dispatchEvent(new Event('pause'))
await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforeFirstPlay + 2, 'Existing pause lookup still works')
firstVideo.currentTime = 1.5; firstVideo.paused = false; firstVideo.dispatchEvent(new Event('play')); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforeFirstPlay + 2, 'Resume does not query even at a different, uncached coordinate')
firstApp.unmount()

// Reopening while paused must remember that this video already played (even without a played range).
const reopenedVideo = Vue.markRaw(new Video())
const reopenedApp = renderer.createApp(Overlay, { media, mediaList: [], video: reopenedVideo, playbackStarted: true })
reopenedApp.mount(nodes('root'))
pending.shift().resolve(new Blob([sample])); await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick()
const beforeReopenedResume = geocodingCalls.length
reopenedVideo.currentTime = 4.5; reopenedVideo.paused = false; reopenedVideo.dispatchEvent(new Event('play')); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforeReopenedResume, 'Reopening a previously-started video does not rearm the first-play lookup')
reopenedApp.unmount()

// Opening during playback never queries; pause/seek updates remain available.
const movingVideo = Vue.markRaw(new Video())
movingVideo.paused = false
const movingApp = renderer.createApp(Overlay, { media, mediaList: [], video: movingVideo })
const movingRoot = nodes('root')
const movingVm = movingApp.mount(movingRoot)
attachPanelLayout(movingVm)
movingVm.updatePanelLayout(true); await Vue.nextTick()
assert.deepEqual(movingVm.panelSize, { width: 340, height: 300 }, 'Each new overlay resets user size to normal-mode default')
assert.equal(movingVm.panelPosition.top, 8)
assert.equal(movingVm.panelPosition.left + movingVm.panelSize.width, stage.clientWidth - 8, 'Each new overlay starts top-right again')
const beforePlayingLookup = geocodingCalls.length
movingVideo.currentTime = .5; movingVideo.dispatchEvent(new Event('timeupdate')); await Vue.nextTick()
pending.shift().resolve(new Blob([sample])); await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforePlayingLookup, 'Opening collaboration during playback must not query an address')
movingVideo.dispatchEvent(new Event('playing')); movingVideo.dispatchEvent(new Event('playing')); await Vue.nextTick()
for (const time of [.5, 1.5, 4.5]) {
  movingVideo.currentTime = time; movingVideo.dispatchEvent(new Event('timeupdate')); await Vue.nextTick()
}
movingVideo.dispatchEvent(new Event('waiting')); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforePlayingLookup, 'Movement, duplicate playing and buffering do not query')
assert.match(textContent(findClass(movingRoot, 'telemetry-location')), /暂停后获取具体位置/)
movingVideo.paused = true; movingVideo.dispatchEvent(new Event('pause'))
await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforePlayingLookup + 1, 'Pause fetches the current frame address once')
assert.equal(geocodingCalls.at(-1)[1], 119.842)
assert.match(textContent(findClass(movingRoot, 'telemetry-location')), /当前位置：江苏省/)
movingVideo.paused = false; movingVideo.dispatchEvent(new Event('play')); await Vue.nextTick()
assert.match(textContent(findClass(movingRoot, 'telemetry-location')), /上次暂停位置：江苏省/)
const beforeSeekLookup = geocodingCalls.length
movingVideo.paused = true; movingVideo.seeking = true
movingVideo.dispatchEvent(new Event('seeking'))
for (const time of [.2, 1.2, 1.5]) {
  movingVideo.currentTime = time; movingVideo.dispatchEvent(new Event('timeupdate')); await Vue.nextTick()
}
assert.equal(geocodingCalls.length, beforeSeekLookup, 'Dragging while paused waits for seek completion')
const pendingAddresses = []
geocodingGate = () => new Promise(resolve => pendingAddresses.push(resolve))
movingVideo.seeking = false; movingVideo.dispatchEvent(new Event('seeked')); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforeSeekLookup + 1, 'Finished paused seek queries only the final frame')
const inFlightLocationSignal = geocodingCalls.at(-1)[3]
movingVideo.paused = false; movingVideo.dispatchEvent(new Event('play')); await Vue.nextTick()
assert(inFlightLocationSignal.aborted, 'Resuming playback cancels an in-flight address request')
assert.equal(geocodingCalls.length, beforeSeekLookup + 1, 'Resume does not replace the cancelled pause lookup with another query')
movingVideo.dispatchEvent(new Event('playing')); movingVideo.dispatchEvent(new Event('waiting')); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforeSeekLookup + 1)
pendingAddresses.shift()('已经过期的暂停地址'); await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick()
assert.doesNotMatch(textContent(findClass(movingRoot, 'telemetry-location')), /已经过期/)
assert.doesNotMatch(textContent(findClass(movingRoot, 'telemetry-location')), /正在获取/)
const beforeMovingSeek = geocodingCalls.length
movingVideo.seeking = true; movingVideo.dispatchEvent(new Event('seeking'))
movingVideo.currentTime = .25; movingVideo.seeking = false; movingVideo.dispatchEvent(new Event('seeked')); await Vue.nextTick()
movingVideo.dispatchEvent(new Event('playing')); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforeMovingSeek, 'Seeking within an uninterrupted playback does not add a new startup query')
movingVideo.paused = true; movingVideo.currentTime = 3; movingVideo.dispatchEvent(new Event('pause')); await Vue.nextTick()
movingVideo.paused = false; movingVideo.dispatchEvent(new Event('play')); await Vue.nextTick()
const beforeGpsGap = geocodingCalls.length
assert.match(textContent(findClass(movingRoot, 'telemetry-location')), /暂停后获取具体位置/)
movingVideo.currentTime = 4.5; movingVideo.dispatchEvent(new Event('timeupdate')); movingVideo.dispatchEvent(new Event('playing')); await Vue.nextTick()
assert.equal(geocodingCalls.length, beforeGpsGap, 'A missing GPS at playback start does not become a per-frame retry loop')
geocodingGate = undefined
movingVm.startResize(pointer, 'right')
assert(captured.has(1))
movingApp.unmount()
assert.equal(captured.size, 0, 'Closing during resizing releases resize pointer capture')
assert.equal(frames.size, 0)

// Closing a new playing overlay must also cancel its one-shot startup request.
const closingVideo = Vue.markRaw(new Video())
geocodingGate = () => new Promise(resolve => pendingAddresses.push(resolve))
const closingApp = renderer.createApp(Overlay, { media, mediaList: [], video: closingVideo })
closingApp.mount(nodes('root'))
closingVideo.paused = false; closingVideo.dispatchEvent(new Event('play')); await Vue.nextTick()
pending.shift().resolve(new Blob([sample])); await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick()
const startupSignal = geocodingCalls.at(-1)[3]
closingApp.unmount()
assert(startupSignal.aborted, 'Closing cancels the startup address query, not only paused queries')
pendingAddresses.shift()('已关闭窗口的播放地址'); await new Promise(resolve => setImmediate(resolve))
geocodingGate = undefined
assert.equal(frames.size, 0)

// Exercise the real SRT transport: backend file path vs anonymous remote URL.
const apiCalls = []
let backendResult = new Blob([sample]), backendError
const api = load(readFileSync('src/api/flight-review.ts', 'utf8'), { './client': { apiClient: {
  get: async (...args) => { apiCalls.push(args); if (backendError) throw backendError; return backendResult },
} } })
globalThis.window = { location: { href: 'https://app.test/review' } }
const originalFetch = globalThis.fetch
let remoteOptions, remoteReads = 0
globalThis.fetch = async (url, options) => { remoteReads++; remoteOptions = options; return new Response(sample, { status: 200 }) }
const local = await api.getFlightReviewSrtFile({ localFileUrl: '/api/v1/uav/media/file/srt-1', originalUrl: 'https://third-party.test/srt' })
assert(local instanceof Blob)
assert.equal(apiCalls[0][0], '/v1/uav/media/file/srt-1')
assert.equal(remoteReads, 0)
await api.getFlightReviewSrtFile({ originalUrl: 'https://third-party.test/file.SRT' })
assert.equal(remoteOptions.credentials, 'omit', 'No login credentials sent to external SRT service')
assert.equal(remoteOptions.headers, undefined, 'No bearer token copied from API client')
await assert.rejects(api.getFlightReviewSrtFile({ originalUrl: 'javascript:alert(1)' }), /无效/)
await assert.rejects(api.getFlightReviewSrtFile({ originalUrl: 'https://user:password@third-party.test/srt' }), /无效/)
globalThis.fetch = async () => new Response('not found', { status: 404 })
await assert.rejects(api.getFlightReviewSrtFile({ originalUrl: 'https://third-party.test/file.SRT' }), /404/)
globalThis.fetch = originalFetch
const signal = new AbortController().signal
await api.getFlightReviewVideoSrtFile('2109867443877969920', signal)
assert.equal(apiCalls.at(-1)[0], '/v1/uav/media/srt/2109867443877969920', 'Preserve long ID strings and avoid duplicate /api prefix')
assert.equal(apiCalls.at(-1)[1].responseType, 'blob')
assert.equal(apiCalls.at(-1)[1].signal, signal)
await assert.rejects(api.getFlightReviewVideoSrtFile('../invalid'), /无效/)
backendResult = new Blob(['{"code":"1"}'], { type: 'application/json' })
await assert.rejects(api.getFlightReviewVideoSrtFile('v'), /有效的 SRT/)
backendResult = new Blob([])
await assert.rejects(api.getFlightReviewVideoSrtFile('v'), /有效的 SRT/)
backendResult = new Blob([new Uint8Array(telemetry.MAX_SRT_BYTES + 1)])
await assert.rejects(api.getFlightReviewVideoSrtFile('v'), /20 MB/)
backendError = { response: { status: 404 } }
await assert.rejects(api.getFlightReviewVideoSrtFile('v'), /尚未就绪/)
backendError = { response: { status: 401 } }
await assert.rejects(api.getFlightReviewVideoSrtFile('v'), reason => reason === backendError, 'Do not swallow authentication errors')

const parent = readFileSync('src/workspace-components/spot-identification/FlightTaskReviewPanel.vue', 'utf8')
assert.match(parent, /defineAsyncComponent\(\(\) => import\('\.\/VideoTelemetryOverlay.vue'\)\)/, 'Do not load mini map until requested')
assert.doesNotMatch(parent, /bindVideoTelemetryClock|videoTime/, 'High-frequency playback state must not re-render the entire flight results table')
assert.match(parent, /:video="videoElement"/)
assert.match(parent, /:playback-started="videoPlaybackStarted"/, 'First-play status survives closing and reopening the overlay')
assert.match(parent, /:fullscreen="mediaFullscreen"/, 'Overlay receives fullscreen mode so docking can be recalculated')
assert.match(parent, /:key="mediaKey\(previewMedia\)" :media="previewMedia"/)
assert.match(parent, /telemetryVisible\.value = false/, 'Switch/close resets overlay')
console.log('Video SRT parsing, smooth playback, first-play-only and paused address lookup, no resume/reopen lookup, seek cancellation, dragging, endpoints and cleanup passed.')
