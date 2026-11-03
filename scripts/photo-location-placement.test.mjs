import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

function load(source, dependencies = {}) {
  const module = { exports: {} }
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', output)(name => {
    assert(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

let source = readFileSync('src/workspace-components/spot-identification/PhotoLocationOverlay.vue', 'utf8')
source = source.replace('import.meta.env.VITE_TIANDITU_TOKEN', "''")
source = source.replace('</script>', 'defineExpose({ panel, panelPosition, panelSize, imageBounds, placementReady, updatePlacement, startResize, moveResize, endResize });\n</script>')
const component = load(compileScript(parse(source).descriptor, { id: 'photo-placement-test' }).content, {
  './NavigationQrDialog.vue': { default: {} }, vue: Vue, leaflet: {}, 'element-plus': {}, 'leaflet/dist/leaflet.css': {},
  '@/api/geocoding': {},
  '@/utils/telemetry-panel': load(readFileSync('src/utils/telemetry-panel.ts', 'utf8')),
}).default
component.render = () => null
const renderer = Vue.createRenderer({
  createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null,
})

for (const layout of ['collection', 'review']) {
  const props = Vue.reactive({ media: { id: layout }, fullscreen: true })
  let vm
  const app = renderer.createApp({ render: () => Vue.h(component, { ...props, ref: value => { vm = value } }) })
  app.mount({})
  const image = { naturalWidth: 4000, naturalHeight: 3000, offsetLeft: layout === 'collection' ? 100 : 0,
    offsetTop: 0, clientWidth: layout === 'collection' ? 800 : 1000, clientHeight: 600,
    getBoundingClientRect() { throw new Error('Zoomed/transformed image bounds must not position the panel') } }
  const parent = { querySelector: () => image }
  vm.panel = Vue.markRaw({ parentElement: parent })
  vm.updatePlacement(true)
  const originalBounds = { ...vm.imageBounds }
  const originalPosition = { ...vm.panelPosition }
  const captured = new Set()
  const handle = { setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id), releasePointerCapture: id => captured.delete(id) }
  vm.startResize({ button: 0, isPrimary: true, pointerId: 1, clientX: 0, clientY: 0, currentTarget: handle, preventDefault() {} }, 'left')
  vm.moveResize({ pointerId: 1, clientX: -140, clientY: 90 })
  assert(vm.panelSize.width > 340, `${layout}: panel can grow after image zoom`)
  vm.updatePlacement()
  assert.deepEqual({ ...vm.imageBounds }, originalBounds, `${layout}: panel resize does not adopt zoomed image bounds`)
  assert(vm.panelPosition.left >= originalBounds.left)
  assert(vm.panelPosition.top >= originalBounds.top)
  assert(vm.panelPosition.left + vm.panelSize.width <= originalBounds.left + originalBounds.width)
  assert(vm.panelPosition.top + vm.panelSize.height <= originalBounds.top + originalBounds.height)
  props.fullscreen = false
  await Vue.nextTick()
  await Vue.nextTick()
  assert.deepEqual({ ...vm.panelSize }, { width: 340, height: 300 }, `${layout}: exit resets preferred size`)
  assert.deepEqual({ ...vm.panelPosition }, originalPosition, `${layout}: exit restores default top-right position`)
  assert.equal(captured.size, 0, `${layout}: exit releases resize capture`)
  assert.equal(vm.placementReady, true)
  app.unmount()
}
console.log('Photo panel: collection/review zoom-independent bounds, resize visibility, fullscreen exit defaults and capture cleanup passed')

// 图斑窗口的缩放范围需避开影像顶部标签，并在外层尺寸变化后仍保持可见。
let spotSource = readFileSync('src/workspace-components/spot-identification/SpotLocationPanel.vue', 'utf8')
spotSource = spotSource.replace('import.meta.env.VITE_TIANDITU_TOKEN', "''")
spotSource = spotSource.replace('</script>', 'defineExpose({ panel, layout, updateLayout, startResize, moveResize, endResize, resizeWithKey });\n</script>')
const SpotPanel = load(compileScript(parse(spotSource).descriptor, { id: 'spot-resize-test' }).content, {
  vue: Vue, leaflet: {}, './NavigationQrDialog.vue': {},
  '@/composables/useSpotAddress': { useSpotAddress: () => ({ spotAddress: Vue.ref('测试地址'), spotAddressLoading: Vue.ref(false), spotAddressError: Vue.ref(false) }) },
  '@/utils/telemetry-panel': load(readFileSync('src/utils/telemetry-panel.ts', 'utf8')),
}).default
SpotPanel.render = () => null
let spot
const spotApp = renderer.createApp({ render: () => Vue.h(SpotPanel, { longitude: 119.8, latitude: 32.4, ref: vm => { if (vm) spot = vm } }) })
spotApp.mount({})
const viewport = { clientWidth: 700, clientHeight: 500 }
spot.panel = Vue.markRaw({ parentElement: viewport })
spot.updateLayout()
assert.equal(spot.layout.top, 48)
assert.deepEqual({ width: spot.layout.width, height: spot.layout.height }, { width: 340, height: 300 })
const captures = new Set()
const handle = { setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) }
for (const edge of ['left', 'right']) {
  spot.startResize({ button: 0, isPrimary: true, pointerId: 10, clientX: 0, clientY: 0, currentTarget: handle, preventDefault() {} }, edge)
  spot.moveResize({ pointerId: 10, clientX: edge === 'left' ? -2000 : 2000, clientY: 2000 })
  assert(spot.layout.top >= 48)
  assert(spot.layout.left >= 8)
  assert(spot.layout.left + spot.layout.width <= viewport.clientWidth - 8)
  assert(spot.layout.top + spot.layout.height <= viewport.clientHeight - 8)
  spot.endResize()
}
viewport.clientWidth = 380
viewport.clientHeight = 320
spot.updateLayout()
assert(spot.layout.left + spot.layout.width <= viewport.clientWidth - 8)
assert(spot.layout.top + spot.layout.height <= viewport.clientHeight - 8)
spot.resizeWithKey({ key: 'ArrowLeft', preventDefault() {} }, 'left')
assert(spot.layout.width >= 300)
spotApp.unmount()
assert.equal(captures.size, 0)
console.log('Spot panel: two-corner resizing, top-label clearance, small viewport clamping and pointer cleanup passed')

// 实际渲染照片开关：初始不创建地图；点击才展示；换照片重置，切换全屏保持开关状态。
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
const listeners = new Map()
const testImage = { offsetLeft: 0, offsetTop: 0, clientWidth: 1000, clientHeight: 600, naturalWidth: 4000, naturalHeight: 3000,
  addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
function hostNode(type) { return { type, children: [], props: {}, parent: null, get parentElement() { return this.parent }, querySelector: () => testImage } }
const controlRenderer = Vue.createRenderer({
  createElement: hostNode, createText: () => hostNode('text'), createComment: () => hostNode('comment'),
  insert(child, parent, anchor) { child.parent = parent; const i = parent.children.indexOf(anchor); if (i < 0) parent.children.push(child); else parent.children.splice(i, 0, child) },
  remove(child) { const i = child.parent.children.indexOf(child); if (i >= 0) child.parent.children.splice(i, 1) },
  patchProp: (node, key, _before, after) => { node.props[key] = after }, setText() {}, setElementText() {},
  parentNode: node => node.parent, nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1],
})
let mapsCreated = 0
const overlay = Vue.defineComponent({ setup() { mapsCreated++; return () => Vue.h('section') } })
const Control = load(compileScript(parse(readFileSync('src/workspace-components/spot-identification/PhotoLocationControl.vue', 'utf8')).descriptor, { id: 'photo-control-test', inlineTemplate: true }).content, {
  vue: Vue, './PhotoLocationOverlay.vue': { __esModule: true, default: overlay },
  '@/utils/telemetry-panel': load(readFileSync('src/utils/telemetry-panel.ts', 'utf8')),
}).default
const controlProps = Vue.reactive({ media: { id: 'photo-a', longitude: 119.8, latitude: 32.4 }, fullscreen: false })
const root = hostNode('root')
const controlApp = controlRenderer.createApp({ render: () => Vue.h(Control, controlProps) })
controlApp.mount(root)
await Vue.nextTick()
const toggle = () => root.children.find(node => node.type === 'button')
assert.equal(mapsCreated, 0)
assert.equal(toggle().props['aria-pressed'], false)
assert.deepEqual(toggle().props.style, { left: '109px', top: '9px' }, 'Toggle follows actual contained image, excluding letterboxing')
toggle().props.onClick({ stopPropagation() {} })
await Vue.nextTick()
assert.equal(mapsCreated, 1)
assert.equal(toggle().props['aria-pressed'], true)
controlProps.fullscreen = true
await Vue.nextTick()
assert.equal(toggle().props['aria-pressed'], true)
toggle().props.onClick({ stopPropagation() {} })
await Vue.nextTick()
assert(!root.children.some(node => node.type === 'section'))
toggle().props.onClick({ stopPropagation() {} })
await Vue.nextTick()
controlProps.media = { ...controlProps.media, id: 'photo-b' }
await Vue.nextTick()
await Vue.nextTick()
assert.equal(toggle().props['aria-pressed'], false)
assert(!root.children.some(node => node.type === 'section'))
controlProps.media = { id: 'no-coordinates' }
await Vue.nextTick()
assert.equal(toggle().props.disabled, true)
controlApp.unmount()
assert.equal(listeners.size, 0)
console.log('Photo location control: lazy opening, active state, contained-image position, closing, media reset and no-coordinate disabling passed')
