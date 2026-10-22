import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const script = readFileSync('src/components/DashboardMap.vue','utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
const ast = ts.createSourceFile('Map.ts',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
const names = ['groupKind','sortedServiceGroups','paneForMapService','syncMapServiceStack','onMapServicePointerMove']
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(ast)).join('\n')
const group = (id,kind) => ({id,name:id,kind,source:{id,type:kind},layers:[{id,arcGisGeometryType:kind==='vector'?'esriGeometryPolygon':undefined}]})
const groups = {value:[group('v1','vector'),group('v2','vector'),group('i1','imagery'),group('i2','imagery')]}
const order = ['v1','i1','v2','i2']
const panes = new Map(), paintOrder=[]
const map = {getPane:name=>panes.get(name),createPane:name=>{const pane={style:{},parentElement:{appendChild:()=>paintOrder.push(name)}};panes.set(name,pane);return pane}}
const list={parentElement:null,querySelectorAll:()=>groups.value.map((item,index)=>({dataset:{groupId:item.id},getBoundingClientRect:()=>({top:index*50,height:50})}))}
const context = {map,mapServiceGroups:groups,mapServicePaneNames:new Map(),requestedLayerOrder:order,MAP_SERVICE_IMAGERY_PANE:'imagery',document:{getElementById:()=>({querySelector:()=>list})},layerPanelId:'test',dragGhost:{value:undefined}}
const api = new Function('context',`const {${Object.keys(context)}}=context;let mapServicePaneSerial=0,dragPointerId=1,dragActive=true,dragGroupId='',dragRowX=0,dragRowY=0,dragStartX=0,dragStartY=0;${compile(functions)};return {${names},drag(id,y){dragGroupId=id;onMapServicePointerMove({pointerId:1,clientX:0,clientY:y,preventDefault(){}})}}`)(context)
assert.deepEqual(api.sortedServiceGroups([group('i','imagery'),group('v','vector')]).map(g=>g.id),['v','i'])
const vectorPane=api.paneForMapService(groups.value[0].layers[0]), imagePane=api.paneForMapService(groups.value[2].layers[0])
assert(Number(panes.get(vectorPane).style.zIndex)>Number(panes.get(imagePane).style.zIndex),'An image enabled later cannot cover a vector')
api.syncMapServiceStack()
const original=groups.value.map(g=>g.id)
api.drag('i2',1);assert.deepEqual(groups.value.map(g=>g.id),original,'Imagery cannot be dragged above vectors')
api.drag('v1',1000);assert.deepEqual(groups.value.map(g=>g.id),original,'Vectors cannot be dragged below imagery')
api.drag('v2',1);assert.deepEqual(groups.value.map(g=>g.id),['v2','v1','i1','i2'],'Same-kind drag changes stack order')
assert(order.indexOf('v2')>order.indexOf('v1'),'Top row paints last within its type band')
const changedService = {...groups.value.find(group => group.id === 'v1').layers[0], arcGisGeometryType: undefined}
api.paneForMapService(changedService)
assert.equal(panes.get(vectorPane).style.zIndex, '235', 'A service changed to imagery cannot retain its old vector pane priority')

const identifyFunction = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'identifyClickedFeature').getText(ast)
const queried=[]
const environment={map:{latLngToContainerPoint:()=>({subtract:()=>({lat:33,lng:119}),add:()=>({lat:32,lng:120})}),containerPointToLatLng:point=>point},activeTool:{value:null},jiulongAdminService:{value:{id:'admin'}},visibleMapServiceIds:{value:['business','admin']},searchableVectorServices:()=>[{id:'business',name:'业务图斑'},{id:'admin',name:'九龙镇行政区'}],mapServiceLayers:new Map(),identifyVectorFeatures:async service=>{queried.push(service.id);return[]},clearSelectionHighlight(){},pinFeatureHighlight(){}}
await new Function('context',`const {${Object.keys(environment)}}=context;let featureSelectionRequestVersion=0,jiulongAdminHandle;${compile(identifyFunction)};return identifyClickedFeature({latlng:{lat:32.5,lng:119.9}})`)(environment)
assert.deepEqual(queried,['business'],'Administrative background boundaries never enter feature-detail queries')

const utility = ts.createSourceFile('Layer.ts',readFileSync('src/utils/map-service-layer.ts','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
const renderer = utility.statements.find(node=>ts.isClassDeclaration(node)&&node.name.text==='ArcGisExportLayer')
const ExportHarness = new Function('L', `const MAP_SERVICE_IMAGERY_PANE='imagery',MAP_SERVICE_VECTOR_PANE='vector';${compile(renderer.getText(utility))};return ArcGisExportLayer`)(
  {GridLayer:class {constructor(options){this.options=options} on(){} }}
)
const standard = {type:'uniqueValue',field1:'DLBM',uniqueValueInfos:[{value:'0702',symbol:{type:'esriPFS',imageData:'pattern'}}]}
const originalExport = new ExportHarness('https://example.test/MapServer',false,0)
originalExport.options.pane='special-vector-pane'
originalExport.setStandardRenderer(standard)
const filteredExport=originalExport.createFilteredCopy("DLBM = '0702'")
assert.deepEqual(filteredExport.vectorRenderer(),standard,'Filtering and atomic tile swaps preserve locked standard symbols')
assert.equal(filteredExport.options.pane,'special-vector-pane','Standard rendering never changes the imagery/vector stacking band')
const vectorClass=utility.statements.find(node=>ts.isClassDeclaration(node)&&node.name.text==='ArcGisVectorLayer')
const filterMethod=vectorClass.members.find(node=>node.name?.getText(utility)==='setDefinitionExpression').getText(utility)
let copies=0,removeCleanups=0
class PendingImage {
  cleanup=true
  off(){this.cleanup=false}
  createFilteredCopy(){copies++;return new PendingImage()}
  once(){return this}
  setOpacity(){return this}
  setDefinitionExpression(){}
}
const FilterHarness=new Function('ArcGisExportLayer',`${compile(`class FilterHarness {${filterMethod}}`)};return FilterHarness`)(PendingImage)
const filter=new FilterHarness()
filter.definitionExpression='old';filter.filterSwapSequence=0;filter.imageLayer=new PendingImage();filter.pendingImageLayer=new PendingImage()
const children=new Set([filter.imageLayer,filter.pendingImageLayer])
filter.hasLayer=layer=>children.has(layer)
filter.removeLayer=layer=>{children.delete(layer);if(layer.cleanup)removeCleanups++}
filter.addLayer=layer=>children.add(layer)
filter.closeVectorTooltip=()=>{}
filter.setDefinitionExpression('new')
assert.equal(removeCleanups,1,'Cancelling a render preserves Leaflet removal handlers, which detach zoom/move listeners')
assert.equal(copies,1)
filter.setDefinitionExpression('new')
assert.equal(copies,1,'Reapplying an identical filter must not redraw tiles or cancel a pending render')
filter.setDefinitionExpression('new',true)
assert.equal(copies,2,'Changing a standard renderer can explicitly refresh an unchanged filter')
const methods = renderer.members.filter(node=>['retainPreviousLevel','commitReadyLevel','_pruneTiles'].includes(node.name?.getText(utility))).map(node=>node.getText(utility)).join('\n')
let pruned=0
const ZoomHarness = new Function('L',`${compile(`class ZoomHarness {${methods}}`)};return ZoomHarness`)({GridLayer:class{_pruneTiles(){pruned++}}})
const zoom = new ZoomHarness();zoom.vectorLayerId=0;zoom._tileZoom=12;zoom._levels={11:{el:{style:{opacity:'1'}}},12:{el:{style:{}}}}
let loading=true;zoom.isLoading=()=>loading
zoom.retainPreviousLevel();assert.equal(zoom._levels[11].el.style.opacity,'1');assert.equal(zoom._levels[12].el.style.opacity,'0')
zoom._pruneTiles();assert.equal(pruned,0,'Parent tiles survive until the new zoom level is ready')
loading=false;zoom.commitReadyLevel();assert.equal(zoom._levels[11].el.style.opacity,'0');assert.equal(zoom._levels[12].el.style.opacity,'1');assert.equal(pruned,1)
console.log('dashboard layers: type bands, cross-type drag blocking, same-type ordering and atomic zoom replacement passed')
