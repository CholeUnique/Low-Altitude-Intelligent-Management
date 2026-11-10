import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import {parse,compileScript} from '@vue/compiler-sfc'
import * as shp from 'shpjs'
import proj4 from 'proj4'
function load(source,deps){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(id=>{assert(id in deps,`Unexpected import ${id}`);return deps[id]},m,m.exports);return m.exports}
const upload=load(readFileSync('src/utils/topic-upload.ts','utf8'),{shpjs:shp,proj4})
const drawing=load(readFileSync('src/utils/map-drawing.ts','utf8'),{})
const search=load(readFileSync('src/utils/topic-layer-search.ts','utf8'),{})
const scopes=[],cleanups=[],layers=new Set(),saved=[],events=[]
const originalWindow=globalThis.window,originalDocument=globalThis.document
globalThis.window={addEventListener(){},removeEventListener(){}}
globalThis.document={createElement:()=>({append(){},appendChild(){}})}
const vueDeps={...vue,onBeforeUnmount:fn=>cleanups.push(fn)}
function setup(path,props,deps){const {descriptor}=parse(readFileSync(path,'utf8'));const source=compileScript(descriptor,{id:'drawing-load'}).content.replaceAll('import.meta.url','"file:///drawing-load"');const component=load(source,{vue:vueDeps,...deps}).default;const scope=vue.effectScope();scopes.push(scope);return scope.run(()=>component.setup(props,{expose(){},emit:(...args)=>events.push(args)}))}
function group(){const members=new Set();return {clearLayers(){members.clear()},eachLayer(fn){members.forEach(fn)},addTo(){layers.add(this);return this},remove(){layers.delete(this)},addLayer(layer){members.add(layer);return this},hasLayer:layer=>members.has(layer),getBounds:()=>({isValid:()=>false})}}
function shape(){return {bindTooltip(){return this},bindPopup(){return this},setStyle(){return this},addTo(target){target.addLayer(this);return this}}}
const leaflet={layerGroup:group,canvas:()=>({remove(){}}),geoJSON(data,options){const layer=group();layer.setStyle=()=>layer;for(const feature of data.type==='FeatureCollection'?data.features:[data])options.onEachFeature?.(feature,shape());return layer},circleMarker:shape,polygon:shape,polyline:shape}
const map={getPane:()=>({isConnected:true}),hasLayer:layer=>layers.has(layer),fitBounds(){},doubleClickZoom:{enabled:()=>true,enable(){},disable(){}},on(){return this},off(){return this}}
const flush=async()=>{await vue.nextTick();await new Promise(resolve=>setImmediate(resolve));await vue.nextTick()}
let sequence=0
try{
  const panel=setup('src/components/TopicUploadedLayers.vue',vue.reactive({map,scope:'account:department:topic',keyword:''}),{
    leaflet,'./TopicLayerCard.vue':{},'./TopicLayerDisplayMode.vue':{},'@/utils/local-id':{createLocalId:()=>`drawing-${++sequence}`},'@/utils/feature-hover-caption':{featureHoverCaption(){}},'@/utils/topic-feature-hover':{bindTopicFeatureHover(){}},'@/utils/topic-area':{topicAreaAttribute(){}},'@/utils/topic-upload':upload,'@/utils/topic-layer-search':search,'@/utils/topic-upload-storage':{readTopicUploads:async()=>[],writeTopicUploads:async(scope,items)=>saved.push({scope,items:JSON.parse(JSON.stringify(items))})},
  });await flush()
  let requests=0,fail=true
  const props=vue.reactive({map,loadDrawing:async input=>{requests++;if(fail)throw Error('加载暂不可用');await panel.addDrawings(input)}})
  const toolbar=setup('src/components/TopicMapToolbar.vue',props,{leaflet,'@element-plus/icons-vue':{},'@/utils/topic-area':{formatSquareMetresAsMu:()=>''},'@/utils/map-measurement':{geodesicArea:()=>1,formatDistance:()=>''},'@/utils/map-drawing':drawing,'./TopicLayerColorPicker.vue':{}})
  const point=(lng,lat)=>({lng,lat})
  toolbar.commitDrawing('point',[point(119,32)])
  toolbar.commitDrawing('line',[point(119,32),point(119.01,32.01)])
  toolbar.commitDrawing('polygon',[point(119,32),point(119.01,32),point(119.01,32.01)])
  await toolbar.loadDrawings()
  assert.equal(toolbar.drawingLoaded.value,false);assert.equal(toolbar.drawnFeatures.value.length,3);assert.match(toolbar.message.value,/加载暂不可用/)
  fail=false
  await Promise.all([toolbar.loadDrawings(),toolbar.loadDrawings()]);await flush()
  assert.equal(requests,2,'Failed load may retry, concurrent clicks submit only once')
  assert.equal(toolbar.drawingLoaded.value,true)
  assert.equal(toolbar.drawnFeatures.value.length,3,'Keep completed features available for export after loading')
  assert.equal(panel.items.value.length,3,'Mixed drawings become three homogeneous local layers')
  assert.deepEqual(panel.items.value.map(item=>item.name),['绘制图层 · 点','绘制图层 · 线','绘制图层 · 面'])
  assert.deepEqual(panel.items.value.map(item=>item.analyzable),[false,false,true],'Only the drawn polygon participates in area analysis')
  assert(panel.items.value.every(item=>item.selected&&item.origin==='drawing'&&item.color==='#ffd16b'&&layers.has(panel.handles.get(item.id))))
  assert.equal(saved.at(-1).scope,'account:department:topic')
  toolbar.drawnFeatures.value[0].geometry.coordinates[0]=118
  assert.equal(panel.items.value[0].data.features[0].geometry.coordinates[0],119,'Loaded geometry is independent of the drawing draft')
  await toolbar.loadDrawings();assert.equal(requests,2,'Already-loaded draft cannot create duplicates')
  toolbar.start('draw-point');assert.equal(toolbar.drawnFeatures.value.length,0,'New drawing starts a new draft after successful loading')
  assert.equal(panel.items.value.length,3,'Continuing drawing must retain loaded layers')
  toolbar.click({latlng:point(119.1,32.1)})
  toolbar.key({key:'Escape'})
  assert.equal(toolbar.drawingFeedbackClosed.value,false,'Esc does not hide export/load actions for completed features')
  await toolbar.loadDrawings();assert.equal(panel.items.value.length,4)
  toolbar.clearDrawings();assert.equal(panel.items.value.length,4,'Clearing the draft must not delete loaded layers')
  const originalCount=panel.items.value.length
  await assert.rejects(panel.addDrawings({name:'invalid',color:'#ffd16b',features:[]}),/没有有效要素/)
  assert.equal(panel.items.value.length,originalCount)
  console.log('Drawing load: one-click local layers, mixed geometries, polygon analysis, scope persistence, snapshots, retry, duplicate prevention and export retention passed')
}finally{cleanups.forEach(fn=>fn());scopes.forEach(scope=>scope.stop());globalThis.window=originalWindow;globalThis.document=originalDocument}
