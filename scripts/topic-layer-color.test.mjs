import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

function component(file, dependencies) {
  const { descriptor } = parse(readFileSync(file, 'utf8'))
  const source = compileScript(descriptor, { id: 'topic-color-test' }).content.replaceAll('import.meta.url', '"file:///topic-color-test"')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    assert(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports.default
}
const cleanups = [], scopes = [], resets = new WeakMap(), layers = new Set()
const vueDeps = { ...vue, onBeforeUnmount: callback => cleanups.push(callback) }
const flush = async () => { await vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); await vue.nextTick() }
function setup(component, props, events = []) {
  const scope = vue.effectScope(); scopes.push(scope)
  return scope.run(() => component.setup(props, { expose() {}, emit: (name, value) => events.push([name, value]) }))
}
const map = { getPane: () => ({}), hasLayer: layer => layers.has(layer), fitBounds() {} }
const bounds = { isValid: () => false }
function geoJSON(data, options = {}) {
  const layer = {
    shapes: [], options,
    setStyle(style) { this.shapes.forEach(shape => Object.assign(shape.style, typeof style === 'function' ? style(shape.feature) : style)); return this },
    resetStyle(shape) { Object.assign(shape.style, options.style(shape.feature)); return this },
    addData(collection) {
      for (const feature of collection.features) {
        const shape = { feature, style: { ...options.style?.(feature) }, bindPopup() {}, setStyle(style) { Object.assign(this.style, style) } }
        this.shapes.push(shape); options.onEachFeature?.(feature, shape)
      }
      return this
    },
    clearLayers() { this.shapes = []; return this },
    addLayer(child) { this.shapes.push(...child.shapes); return this },
    addTo() { layers.add(this); return this },
    remove() { layers.delete(this); return this },
    getBounds: () => bounds,
  }
  if (data) layer.addData(data)
  return layer
}
const leaflet = { geoJSON, canvas: () => ({ remove() {} }) }
globalThis.document = { createElement: () => ({ appendChild() {}, append() {} }) }
const common = {
  vue: vueDeps, leaflet,
  './TopicLayerCard.vue': { default: {} }, './TopicLayerDisplayMode.vue': { default: {} },
  '@/utils/local-id': { createLocalId: () => 'color-fixture' },
  '@/utils/feature-hover-caption': { featureHoverCaption() {} },
  '@/utils/topic-feature-hover': { bindTopicFeatureHover: (shape, _map, _caption, reset) => resets.set(shape, reset) },
  '@/utils/topic-area': { squareMetresToMu: value => value, formatSquareMetresAsMu: value => value, topicAreaAttribute() {} },
}
const feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[119, 32], [120, 32], [120, 33], [119, 32]]] }, properties: { areaSqm: 1 } }
const data = { type: 'FeatureCollection', features: [feature] }
const palette = ['#53d4df', '#f5ba5c']
const saved = [], uploadEvents = [], analysisEvents = []
try {
  const picker = setup(component('src/components/TopicLayerDisplayMode.vue', { vue: vueDeps, '@/utils/topic-upload': { UPLOAD_COLORS: palette } }), {}, saved)
  picker.changeColor('#123456'); picker.changeColor(null); picker.changeColor('transparent')
  assert.deepEqual(saved.splice(0), [['colorChange', '#123456']], 'Only usable solid colors are applied')

  const uploads = setup(component('src/components/TopicUploadedLayers.vue', {
    ...common,
    '@/utils/topic-upload': { UPLOAD_COLORS: palette },
    '@/utils/topic-upload-storage': {
      readTopicUploads: async () => [{ id: 'upload-fixture', name: '上传范围', color: palette[0], mode: 'filled', selected: true, fields: [], data }],
      writeTopicUploads: async (scope, items) => saved.push({ scope, items }),
    },
  }), vue.reactive({ map, scope: 'account:department:topic', keyword: '' }), uploadEvents)
  await flush()
  const item = uploads.items.value[0], uploadLayer = uploads.handles.get(item.id)
  uploads.color(item, '#123456'); await flush()
  assert.equal(uploadLayer.shapes[0].style.color, '#123456')
  assert.equal(uploadLayer.shapes[0].style.fillColor, '#123456')
  assert.equal(saved.at(-1).scope, 'account:department:topic')
  assert.equal(saved.at(-1).items[0].color, '#123456', 'Upload color survives reloading local storage')
  assert.equal(uploadEvents.filter(([name]) => name === 'change').at(-1)[1][0].color, '#123456', 'Map legend receives the chosen color')
  uploads.mode(item, 'boundary'); uploads.color(item, '#abcdef'); await flush()
  assert.equal(uploadLayer.shapes[0].style.fillOpacity, 0, 'Changing color preserves boundary mode')
  Object.assign(uploadLayer.shapes[0].style, { color: '#highlight', fillColor: '#highlight' })
  resets.get(uploadLayer.shapes[0])()
  assert.equal(uploadLayer.shapes[0].style.color, '#abcdef', 'Hover restoration uses the new upload color')
  uploads.select([item.id], false); uploads.color(item, '#654321'); uploads.select([item.id], true)
  assert.equal(uploadLayer.shapes[0].style.fillColor, '#654321', 'Hidden layers use the new color when re-enabled')

  const analysis = setup(component('src/components/TopicOverlayAnalysis.vue', {
    ...common,
    '@/api/spatial-analysis': {},
    '@/utils/spatial-overlay-result': { SPATIAL_DIFFERENCE_COLORS: {}, spatialDifferenceLabel: () => '分析差异' },
    '@/utils/spatial-geometry-result': { COVERAGE_COLORS: {} },
    '@/utils/spatial-geometry-input': {}, '@/utils/farmland-analysis': {},
    '@/stores/user': { useUserStore: () => ({}) },
    '@/stores/farmland-comparison': { useFarmlandComparisonStore: () => ({}) },
  }), vue.reactive({ map, open: false, context: 'fixture', farmland: true, uploads: [], operation: 'difference', keyword: '' }), analysisEvents)
  analysis.display(data, { sourceA: { layerName: '高标田' }, sourceB: { layerName: '永农' } }, [], 'difference', false, [{ kind: 'A_ONLY', name: '分析差异', color: palette[0], data, areaSqm: 1 }])
  const result = analysis.results.value[0], group = result.groups[0]
  analysis.groupColor(group, '#112233'); await flush()
  assert.equal(group.layer.shapes[0].style.color, '#112233')
  assert.equal(group.layer.shapes[0].style.fillColor, '#112233')
  assert.equal(analysisEvents.filter(([name]) => name === 'legend').at(-1)[1][0].symbols[0].color, '#112233')
  analysis.groupMode(group, 'boundary'); analysis.groupColor(group, '#aabbcc')
  assert.equal(group.layer.shapes[0].style.fillOpacity, 0)
  analysis.toggleGroup(result, group, false); analysis.toggleGroup(result, group, true)
  const restored = group.layer.shapes[0]
  assert.equal(restored.style.color, '#aabbcc', 'Rebuilding analysis geometries retains the selected color')
  Object.assign(restored.style, { color: '#highlight', fillColor: '#highlight' }); resets.get(restored)()
  assert.equal(restored.style.fillColor, '#aabbcc', 'Hover reset retains the chosen fill color')
  assert.equal(restored.style.fillOpacity, 0)
  console.log('Topic colors: map stroke/fill, legend, upload persistence, boundary mode, hidden layers and hover restoration passed')
} finally { cleanups.forEach(cleanup => cleanup()); scopes.forEach(scope => scope.stop()); delete globalThis.document }
