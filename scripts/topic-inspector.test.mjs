import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {parse,compileScript} from '@vue/compiler-sfc'
import * as vue from 'vue'
function load(source,deps={}){const m={exports:{}};new Function('module','exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(m,m.exports,id=>{assert(id in deps,id);return deps[id]});return m.exports}
const {administrativeTree}=load(readFileSync('src/utils/topic-administrative-tree.ts','utf8'))
const ring=(x,y,w=10)=>[[x,y],[x+w,y],[x+w,y+w],[x,y+w],[x,y]]
const town=(value,name,rings)=>({value,name,checked:true,geometries:[{rings}]})
const towns=[town('code:321202100','九龙镇',[ring(0,0)]),town('name:城西街道','城西街道',[ring(20,0),ring(40,0),ring(22,2,2)])]
const villages=[{value:'code:321202100201',name:'孙金村',checked:false},{value:'name:城西南村',name:'城西南村',checked:false,geometries:[{rings:[ring(41,1,1)]}]},{value:'name:明确归属村',name:'明确归属村',parentName:'九龙镇',checked:true},{value:'id:hole',name:'洞内不可配对',checked:false,geometries:[{rings:[ring(22.2,2.2,.1)]}]},{value:'id:unknown',name:'未知',checked:false}]
const tree=administrativeTree(towns,villages)
assert.deepEqual(tree.groups[0].villages.map(v=>v.name),['孙金村','明确归属村'])
assert.deepEqual(tree.groups[1].villages.map(v=>v.name),['城西南村'],'分离区域也归入同一个乡镇')
assert.deepEqual(tree.unassigned.map(v=>v.name),['洞内不可配对','未知'],'缺少归属保留为可操作项，不丢弃或错配')
assert.equal(tree.groups[0].town.checked,true);assert.equal(tree.groups[0].villages[0].checked,false,'乡村勾选互不联动')
const {descriptor}=parse(readFileSync('src/workspace-components/non-grain/ReviewPhotoViewport.vue','utf8'))
const component=load(compileScript(descriptor,{id:'viewport-test'}).content,{vue}).default
const scope=vue.effectScope(),props=vue.reactive({src:'photo-one'})
const state=scope.run(()=>component.setup(props,{expose(){}}))
const target={getBoundingClientRect:()=>({left:0,top:0,width:400,height:200}),setPointerCapture(){}}
state.wheel({currentTarget:target,clientX:200,clientY:100,deltaY:-500})
assert(state.zoom.value>1);assert.equal(state.x.value,0)
state.down({button:0,currentTarget:target,pointerId:1,clientX:50,clientY:50});state.move({clientX:90,clientY:70})
assert.equal(state.x.value,40);assert.equal(state.y.value,20);assert.equal(state.hint.value,true)
state.up();assert.equal(state.hint.value,false);assert.equal(state.dragging.value,false)
state.wheel({currentTarget:target,clientX:200,clientY:100,deltaY:-100000});assert.equal(state.zoom.value,12)
state.wheel({currentTarget:target,clientX:200,clientY:100,deltaY:100000});assert.equal(state.zoom.value,1);assert.equal(state.x.value,0)
state.down({button:0,currentTarget:target,pointerId:1,clientX:0,clientY:0});state.move({clientX:30,clientY:20})
props.src='photo-two';await vue.nextTick();assert.equal(state.x.value,0);assert.equal(state.hint.value,false)
scope.stop()
console.log('Topic inspector: administrative hierarchy/code/geometry/multipart/holes/independent selection and photo zoom/pan/reset passed')
