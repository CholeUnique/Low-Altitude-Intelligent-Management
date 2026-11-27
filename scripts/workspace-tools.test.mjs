import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import {parse,compileScript} from '@vue/compiler-sfc'
import proj4 from 'proj4'

function load(source,deps={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{assert(name in deps,`Unexpected dependency ${name}`);return deps[name]},module,module.exports);return module.exports}
const layout=load(readFileSync('src/utils/workspace-tools-layout.ts','utf8'))
for(const [width,height] of [[1440,900],[700,500],[486,600],[320,420]])for(const top of [-1000,12,height/2,height+500]){
  const actual=layout.workspaceToolsLayout(width,height,top)
  assert.equal(actual.right,12,'Dragging can never move the ball away from the right rail')
  assert(actual.top>=12&&actual.top+52<=height-12)
  assert(actual.panelTop>=12&&actual.panelTop+actual.panelHeight<=height-12)
  assert(actual.panelWidth+actual.panelRight<=width-12)
}
const coordinate=load(readFileSync('src/utils/location-coordinate.ts','utf8'),{proj4})
assert.equal(coordinate.cgcs2000Coordinate(NaN,32),undefined)
assert.equal(coordinate.cgcs2000Coordinate(500000,3600000),undefined,'Never relabel projected metres as longitude/latitude')
const cgcs=coordinate.cgcs2000Coordinate(119.839438,32.482675)
assert(Math.abs(cgcs.lng-119.839438)<0.00001&&Math.abs(cgcs.lat-32.482675)<0.00001,'CGCS2000 conversion must not move a Hailing point outside China')

const saved={document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,performance:globalThis.performance}
let callback,now=0,reads=0
globalThis.document={addEventListener(){},removeEventListener(){}}
globalThis.ResizeObserver=class{constructor(cb){callback=cb}observe(){}disconnect(){}}
Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true})
const shape={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[119.9,32.5],[119.901,32.5],[119.9,32.501],[119.9,32.5]]]},properties:{}}]}
let source=readFileSync('src/workspace-components/shared/WorkspaceToolBall.vue','utf8').replace('</script>','defineExpose({root,layout,requestedTop,expanded,locationOpen,startDrag,moveDrag,endDrag,toggleBall,toggleLocation,moveWithKey});\n</script>')
const component=load(compileScript(parse(source).descriptor,{id:'workspace-tools-test'}).content,{
  vue:Vue,'@element-plus/icons-vue':{},'@/components/TaskLocationPreview.vue':{},
  '@/api/governance-task':{getGovernanceTaskGeometry:async()=>{reads++;return shape}},
  '@/utils/facility-task':{},'@/utils/geometry-location':load(readFileSync('src/utils/geometry-location.ts','utf8')),'@/utils/workspace-tools-layout':layout,
}).default
component.render=()=>null
const renderer=Vue.createRenderer({createComment:()=>({}),insert(){},remove(){},parentNode:()=>null,nextSibling:()=>null})
const props=Vue.reactive({taskId:'first',deptId:'2'});let vm
const app=renderer.createApp({render:()=>Vue.h(component,{...props,ref:value=>vm=value})});app.mount({})
vm.root={clientWidth:1100,clientHeight:800};callback()
assert.equal(reads,0,'The closed ball must not request or mount a map')
vm.toggleBall();assert.equal(vm.expanded,true)
vm.toggleLocation();await Vue.nextTick();await Promise.resolve();assert.equal(reads,1)
vm.toggleLocation();assert.equal(vm.locationOpen,false)
vm.toggleLocation();await Vue.nextTick();assert.equal(reads,1,'Reopening within one task reuses its actual location')
const captures=new Set(),handle={setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)}
const start=vm.layout.top
vm.startDrag({button:0,isPrimary:true,pointerId:1,clientX:1080,clientY:start,currentTarget:handle})
vm.moveDrag({pointerId:1,clientX:-500,clientY:start+100});assert.equal(vm.layout.top,start+100);assert.equal(vm.layout.right,12)
vm.endDrag({pointerId:1});vm.toggleBall();assert.equal(vm.expanded,true,'Pointer release after dragging must not toggle the tool strip')
now=500;vm.toggleBall();assert.equal(vm.expanded,false);assert.equal(vm.locationOpen,false)
let prevented=false;vm.moveWithKey({key:'End',preventDefault(){prevented=true}});assert(prevented);assert.equal(vm.layout.top,800-12-52)
props.taskId='second';await Vue.nextTick();assert.equal(vm.expanded,false);vm.toggleBall();vm.toggleLocation();await Vue.nextTick();await Promise.resolve();assert.equal(reads,2,'Switching tasks discards the old geometry')
app.unmount();globalThis.document=saved.document;globalThis.ResizeObserver=saved.ResizeObserver;Object.defineProperty(globalThis,'performance',{value:saved.performance,configurable:true})

for(const file of ['src/views/WorkspaceView.vue','src/workspace-components/non-grain/NonGrainWorkspace.vue','src/workspace-components/farmland-facilities/FarmlandFacilitiesWorkspace.vue','src/workspace-components/land-supervision/LandSupervisionWorkspace.vue'])assert(readFileSync(file,'utf8').includes('<WorkbenchHeader '),`${file} must use the common header`)
const host=readFileSync('src/views/WorkspaceView.vue','utf8')
assert.equal((host.match(/<WorkspaceToolBall\b/g)||[]).length,1)
assert(!/<WorkspaceToolBall[^>]*v-if="!isLandWorkspace/.test(host),'Land workbenches must inherit the same tool ball')
console.log('PASS: right-only drag/clamping, resize layouts, drag/click separation, lazy location reuse, task changes, CGCS2000 readout and shared workbench shell')
