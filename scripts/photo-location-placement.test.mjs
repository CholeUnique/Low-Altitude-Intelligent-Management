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
  vue: Vue, leaflet: {}, 'element-plus': {}, 'leaflet/dist/leaflet.css': {},
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
