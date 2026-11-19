import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import {parse,compileScript} from '@vue/compiler-sfc'
function load(file,deps={}){const module={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,id=>{assert(id in deps,`Unexpected import ${id}`);return deps[id]});return module.exports}
const util=load('src/utils/spatial-statistics.ts')
const {splitFarmlandOverlay}=load('src/utils/farmland-analysis.ts',{'./spatial-geometry-result':{},'./spatial-geometry-input':{}})
const full={areaA:1000,areaB:900,overlapArea:600,onlyAArea:400,onlyBArea:300,diffArea:700,diffRate:.7}
const statistics={status:'SUCCEEDED',areaUnit:'SQM',complete:full,categories:[['A_ONLY',400,350],['B_ONLY',300,250],['OVERLAP',600,500]].map(([category,fullAreaSqm,outputAreaSqm])=>({category,fullAreaSqm,outputAreaSqm,fullCount:2,outputCount:1,filteredCount:1,filteredAreaSqm:fullAreaSqm-outputAreaSqm}))}
const raw={...full,statistics,minAreaSqm:50,spotCount:3,sourceA:{layerName:'高标'},sourceB:{layerName:'永农'}}
const before=structuredClone(raw),filtered=util.filteredOverlaySummary(raw)
assert.equal(filtered.diffArea,600);assert.equal(filtered.diffRate,.6)
assert.equal(filtered.overlapArea,500);assert.equal(filtered.onlyAArea,350)
assert.deepEqual(raw,before,'Never overwrite backend complete totals with thresholded totals')
const fullMetrics=util.completeAnalysisMetrics(filtered.statistics,true)
assert.equal(fullMetrics.find(m=>m.label==='差异面积').areaSqm,700)
assert.equal(fullMetrics.find(m=>m.label==='差异率').ratio,.7)
assert.equal(fullMetrics.find(m=>m.label==='两者同时满足部分').areaSqm,600)
const collection=areas=>({type:'FeatureCollection',features:areas.map(([diffType,areaSqm])=>({type:'Feature',geometry:{type:'Polygon',coordinates:[]},properties:{diffType,areaSqm}}))})
const partitions=splitFarmlandOverlay(collection([['A_ONLY',350],['B_ONLY',250],['OVERLAP',500]]),filtered)
assert.deepEqual(partitions.map(p=>p.areaSqm),[350,250,500],'Result layers and main panel keep the actual filtered areas')
assert.throws(()=>splitFarmlandOverlay(collection([['A_ONLY',351],['B_ONLY',250],['OVERLAP',500]]),filtered),/不一致/,'Keep validating output geometry against output statistics')
const allFiltered={...raw,spotCount:0,minAreaSqm:1000,statistics:{...statistics,categories:statistics.categories.map(c=>({...c,outputAreaSqm:0,outputCount:0,filteredAreaSqm:c.fullAreaSqm,filteredCount:c.fullCount}))}}
const zero=util.filteredOverlaySummary(allFiltered)
assert.equal(zero.diffArea,0);assert.equal(zero.diffRate,0)
assert(splitFarmlandOverlay(collection([]),zero).every(p=>p.areaSqm===0),'All small parts filtered out is a valid empty output, even when complete overlap exceeds the threshold')
assert.deepEqual(util.completeAnalysisMetrics(zero.statistics,true),fullMetrics,'Changing the threshold never changes the comparison popup')
assert.equal(util.completeAnalysisMetrics({...statistics,status:'FAILED'},true),undefined)
assert.equal(util.completeAnalysisMetrics(undefined,true),undefined,'Missing full statistics must not silently reuse filtered values')
const coverage=util.completeAnalysisMetrics(statistics,false,true)
assert.equal(coverage.find(m=>m.label==='范围内面积').areaSqm,600)
assert.equal(coverage.find(m=>m.label==='范围内占比').ratio,.6)
const fallback=util.zeroThresholdStatistics({minAreaSqm:0,areaA:1000,areaB:900,aOnly:{areaSqm:400},bOnly:{areaSqm:300},both:{areaSqm:600}})
assert.deepEqual(fallback.complete,full)
assert.throws(()=>util.zeroThresholdStatistics({minAreaSqm:4}),/零面积过滤/)
// Exercise the actual popup handlers: hover is temporary, click pins, outside/Escape close.
const {descriptor}=parse(readFileSync('src/components/TopicCompleteStatistics.vue','utf8'))
const source=compileScript(descriptor,{id:'full-statistics-test'}).content
const callbacks=[],listeners=new Map()
globalThis.document={body:{},addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name)}
const component={exports:{}}
new Function('module','exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(component,component.exports,id=>id==='vue'?{...vue,onMounted(){},onBeforeUnmount:callback=>callbacks.push(callback)}:{formatSquareMetresAsMu:value=>value})
const scope=vue.effectScope()
try{
  const popup=scope.run(()=>component.exports.default.setup({title:'对比分析'},{expose(){}}))
  const mapRoot={id:'topic-root'}
  popup.anchor.value={closest:selector=>{assert.equal(selector,'.geographic-topics');return mapRoot},contains:()=>false}
  popup.syncTarget();assert.equal(popup.appendTarget.value,mapRoot,'Mount the popup inside the fullscreen-capable map, outside the scrolling inspector')
  assert.equal(popup.virtualAnchor.contextElement,popup.anchor.value,'Track the actual reference scroll parents')
  popup.enter();await vue.nextTick();assert.equal(popup.opened.value,true);assert(listeners.has('pointerdown'))
  popup.leave();await new Promise(resolve=>setTimeout(resolve,320));assert.equal(popup.opened.value,false,'Hover alone closes after pointer leaves')
  popup.enter();popup.toggle();popup.leave();await new Promise(resolve=>setTimeout(resolve,320));assert.equal(popup.opened.value,true,'Click keeps full statistics open for comparison')
  popup.close();assert.equal(popup.opened.value,false);assert.equal(popup.pinned.value,false)
  popup.enter();await vue.nextTick();listeners.get('pointerdown')({target:{}});await vue.nextTick();assert.equal(popup.opened.value,false,'Outside click closes the floating window')
}finally{callbacks.forEach(callback=>callback());scope.stop();delete globalThis.document}
console.log('Full statistics: independent filtered/full totals, difference rates, output integrity, empty outputs and zero-threshold backend compatibility passed')
