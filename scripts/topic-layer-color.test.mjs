import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
const searchModule={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/topic-layer-search.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(searchModule,searchModule.exports)
const search=searchModule.exports
const statisticsModule={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/spatial-statistics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(statisticsModule,statisticsModule.exports)

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
  './TopicLayerCard.vue': { default: {} }, './TopicLayerDisplayMode.vue': { default: {} }, './TopicLayerColorPicker.vue': { default: {} },
  './TopicAnalysisProgress.vue': { default: {} },
  './TopicCompleteStatistics.vue': { default: {} },
  '@/utils/topic-layer-search': search,
  '@/utils/local-id': { createLocalId: () => 'color-fixture' },
  '@/utils/feature-hover-caption': { featureHoverCaption() {} },
  '@/utils/topic-feature-hover': { bindTopicFeatureHover: (shape, _map, _caption, reset) => resets.set(shape, reset) },
  '@/utils/topic-area': { squareMetresToMu: value => value, muToSquareMetres:value=>value, formatSquareMetresAsMu: value => value, topicAreaAttribute() {} },
}
const feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[119, 32], [120, 32], [120, 33], [119, 32]]] }, properties: { areaSqm: 1 } }
const data = { type: 'FeatureCollection', features: [feature] }
const palette = ['#53d4df', '#f5ba5c']
const saved = [], uploadEvents = [], analysisEvents = []
try {
  const colorInput=setup(component('src/components/TopicLayerColorPicker.vue',{vue:vueDeps}),{},saved)
  colorInput.change({target:{value:'#fedcba'}});colorInput.change({target:{value:'transparent'}})
  assert.deepEqual(saved.splice(0),[['change','#fedcba']])
  const picker = setup(component('src/components/TopicLayerDisplayMode.vue', { vue: vueDeps, './TopicLayerColorPicker.vue': { default: {} } }), {}, saved)
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

  const analysisProps=vue.reactive({ map, open: false, context: 'fixture', farmland: true, uploads: [], operation: 'difference', keyword: '' })
  let overlayRequest
  const complete={areaA:4,areaB:3,onlyAArea:2,onlyBArea:0,overlapArea:2,diffArea:2,diffRate:.5}
  const backendSummary={...complete,resultId:'full-statistics-fixture',minAreaSqm:1,spotCount:1,sourceA:{layerName:'高标田'},sourceB:{layerName:'永农'},statistics:{status:'SUCCEEDED',areaUnit:'SQM',complete,categories:[{category:'A_ONLY',outputAreaSqm:1},{category:'B_ONLY',outputAreaSqm:0},{category:'OVERLAP',outputAreaSqm:1}]}}
  const analysis = setup(component('src/components/TopicOverlayAnalysis.vue', {
    ...common,
    '@/api/spatial-analysis': {analyzeSpatialOverlay:async request=>{overlayRequest=request;return backendSummary}}, '@/utils/spatial-statistics': statisticsModule.exports,
    '@/utils/spatial-overlay-result': { SPATIAL_DIFFERENCE_COLORS: {}, spatialDifferenceLabel: () => '分析差异',spatialFilters:()=>[],loadSpatialOverlayFeatures:async()=>data },
    '@/utils/spatial-geometry-result': { COVERAGE_COLORS: {} },
    '@/utils/spatial-geometry-input': {}, '@/utils/farmland-analysis': {splitFarmlandOverlay:()=>[{kind:'A_ONLY',name:'分析差异',color:palette[0],data,areaSqm:1}]},
    '@/stores/user': { useUserStore: () => ({}) },
    '@/stores/farmland-comparison': { useFarmlandComparisonStore: () => ({}) },
  }), analysisProps, analysisEvents)
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
  assert.equal(analysis.legendData(result.id,'分析差异').features.length,1,'图例选择返回对应分类真实几何')
  analysis.display(data, { sourceA: { layerName: '高标田' }, sourceB: { layerName: '永农' } }, [], 'difference', false, [{ kind: 'B_ONLY', name: '新分析差异', color: palette[1], data, areaSqm: 1 }])
  assert.equal(result.visible,false,'新分析完成后旧结果取消显示')
  assert.equal(group.visible,false,'旧分类 checkbox 同步取消')
  assert(!layers.has(result.layer),'旧结果从地图移除，仍保留结果记录')
  assert.equal(analysis.results.value.length,2)
  const fullMetrics=[{label:'高标田中非永农部分',areaSqm:2},{label:'差异率',ratio:.5}]
  analysis.display(data,{sourceA:{layerName:'高标田'},sourceB:{layerName:'永农'},diffArea:1,diffRate:.25},[],'difference',false,[{kind:'A_ONLY',name:'高标田中非永农部分',color:palette[0],data,areaSqm:1}],undefined,fullMetrics)
  await flush()
  const statistics=analysisEvents.filter(([name])=>name==='statistics').at(-1)[1][0]
  assert.equal(statistics.metrics.find(metric=>metric.label==='差异面积').areaSqm,1,'Main panel keeps filtered totals')
  assert.deepEqual(statistics.fullMetrics,fullMetrics,'The same result carries distinct full totals to its question-mark popup')
  analysis.display({type:'FeatureCollection',features:[]},{sourceA:{layerName:'高标田'},sourceB:{layerName:'永农'},diffArea:0,diffRate:0},[],'difference',false,[{kind:'A_ONLY',name:'已全部过滤',color:palette[0],data:{type:'FeatureCollection',features:[]},areaSqm:0}],undefined,fullMetrics)
  await flush()
  assert.equal(analysisEvents.filter(([name])=>name==='statistics').at(-1)[1].length,1,'Keep the comparison popup available when the threshold filters every output polygon')
  analysis.selectResult(result,'all');assert.equal(result.visible,true,'可以手动重新显示旧结果')
  analysis.hideAll();assert(analysis.results.value.every(result=>!result.visible),'区划裁切能隐藏此前全部分析结果')
  Object.assign(analysisProps,{sources:[{id:'101',name:'海陵区高标准农田'}],visibleKeys:[],regions:[{key:'101/4',serviceId:'101',layerId:4,options:[{value:'cx',name:'城西街道',objectIds:[2,22]}]}]})
  for(const [side,layerId,name] of [[analysis.a,6,'高标田'],[analysis.b,3,'永农']])Object.assign(side,{serviceId:'101',layerId:String(layerId),layers:[{layerId,name,analyzable:true,fields:[]}],filters:[]})
  analysis.regionChoices.value=['101/4:cx'];analysis.minAreaMu.value=1
  await analysis.finish();await flush()
  assert.deepEqual(overlayRequest.regions,[{serviceId:'101',layerId:4,objectIds:[2,22]}],'Regional analysis passes complete selections directly to the backend overlay/statistics snapshot')
  const emitted=analysisEvents.filter(([name])=>name==='statistics').at(-1)[1][0]
  assert.equal(emitted.metrics.find(metric=>metric.label==='差异面积').areaSqm,1)
  assert.equal(emitted.fullMetrics.find(metric=>metric.label==='差异面积').areaSqm,2,'Complete backend totals reach the popup without replacing filtered panel values')
  analysisProps.farmland=false
  analysis.display({type:'FeatureCollection',features:[{...feature,properties:{analysisCoverage:'INSIDE'}}]}, { sourceA: { layerName: '上传范围' }, sourceB: { layerName: '目标图层' } }, [], 'coverage', false)
  const generic=analysis.results.value[0]
  analysis.changeResultColor(generic,'INSIDE','#123abc');await flush()
  assert.equal(generic.layer.shapes[0].style.fillColor,'#123abc','其他专题的分析结果也可改色')
  assert.equal(analysisEvents.filter(([name])=>name==='legend').at(-1)[1][0].symbols[0].color,'#123abc')
  generic.layer.resetStyle(generic.layer.shapes[0])
  assert.equal(generic.layer.shapes[0].style.color,'#123abc','其他专题结果悬浮复位保留改色')
  console.log('Topic colors: map stroke/fill, legend, upload persistence, boundary mode, hidden layers and hover restoration passed')
} finally { cleanups.forEach(cleanup => cleanup()); scopes.forEach(scope => scope.stop()); delete globalThis.document }
