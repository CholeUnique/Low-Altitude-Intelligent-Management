import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
function load(file,deps={}){const module={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(module,module.exports,id=>{assert(id in deps,`Unexpected import ${id}`);return deps[id]});return module.exports}
const geometry={type:'Polygon',coordinates:[[[120,32],[120.01,32],[120.01,32.01],[120,32]]]}
const feature=(kind,area)=>({type:'Feature',geometry,properties:{diffType:kind,areaSqm:area,seqNo:1}})
const collection=features=>({type:'FeatureCollection',features})
const group=(kind,area)=>({areaSqm:area,spotCount:area?1:0,featureCollection:collection(area?[feature(kind,area)]:[])})
const overlay=load('src/utils/spatial-overlay-result.ts',{'@/api/client':{},'@/api/spatial-analysis':{}})
const result=load('src/utils/spatial-geometry-result.ts',{'./topic-upload':{assertTopicGeometry:()=>{}},'./spatial-overlay-result':overlay,'./spatial-geometry-input':{PUBLISHED_ANALYSIS_MAX_FEATURES:20000}})
const prepare={geometryRequestInputs:(geometryA,geometryB)=>({geometryA,geometryB})}
const mod=load('src/utils/farmland-region-comparison.ts',{'@/api/spatial-analysis':{},'./region-clip':{regionClipKey:x=>`${x.serviceId}/${x.layerId}`},'./spatial-geometry-input':prepare,'./spatial-geometry-result':result})
const request={deptId:'agriculture',combineMode:'UNION',regions:[{serviceId:'101',layerId:4,objectIds:[2,22,20]}],targets:[{serviceId:'101',layerId:6,where:'("DLBM" = \'0101\')'},{serviceId:'101',layerId:3,where:'1=1'}]}
const sources={sourceA:{serviceId:'101',layerId:6,layerName:'高标田'},sourceB:{serviceId:'101',layerId:3,layerName:'永农'}}
const high=collection([feature('source',100)]),permanent=collection([feature('source',80)])
const abort=new AbortController(),progress=[]
const clipResult=(a=high,b=permanent)=>({resultId:'new-clip',layers:request.targets.map((target,index)=>({...target,status:'SUCCEEDED',data:index?b:a}))})
let calls=0
const dependencies={clip:async(sent,options)=>{assert.deepEqual(sent,request);assert.equal(options.signal,abort.signal);options.progress({progress:100});return clipResult()},compare:async(input,options)=>{calls++;assert.equal(input.geometryA,high);assert.equal(input.geometryB,permanent);assert.equal(input.minAreaSqm,0);assert.equal(options.deptId,'agriculture');options.progress(100);return {areaA:100,areaB:80,minAreaSqm:0,crsUsed:'CGCS2000',both:group('OVERLAP',60),aOnly:group('A_ONLY',40),bOnly:group('B_ONLY',20)}}}
const output=await mod.compareFarmlandRegions(request,0,sources,{signal:abort.signal,progress:value=>progress.push(value)},dependencies)
assert.equal(calls,1);assert.deepEqual(output.data.features.map(f=>f.properties.diffType),['A_ONLY','B_ONLY','OVERLAP']);assert.equal(output.summary.spotCount,3);assert.equal(output.summary.diffArea,60);assert.equal(output.summary.diffRate,.6);assert.deepEqual(progress,[50,100,100]);assert.deepEqual(request.regions[0].objectIds,[2,22,20],'all selected source parts retained in backend request')
await assert.rejects(mod.compareFarmlandRegions(request,0,sources,{signal:abort.signal},{clip:async()=>({...clipResult(),layers:[{...request.targets[0],status:'FAILED',error:'clip failed'}]}),compare:()=>assert.fail('must not compare original data after clip failure')}),/clip failed/)
for(const nonempty of [0,1]){
  const empty=collection([])
  const data=await mod.compareFarmlandRegions(request,0,sources,{signal:abort.signal},{clip:async()=>clipResult(nonempty?empty:high,nonempty?permanent:empty),compare:async(input)=>{assert.equal(input.geometryA,input.geometryB);return {areaA:50,areaB:50,minAreaSqm:0,crsUsed:'CGCS2000',both:group('OVERLAP',50),aOnly:group('A_ONLY',0),bOnly:group('B_ONLY',0)}}})
  assert.equal(data.data.features[0].properties.diffType,nonempty?'B_ONLY':'A_ONLY');assert.equal(data.summary.overlapArea,0);assert.equal(data.summary.diffArea,50)
}
const empty=await mod.compareFarmlandRegions(request,0,sources,{signal:abort.signal},{clip:async()=>clipResult(collection([]),collection([])),compare:()=>assert.fail('empty inputs need no backend calculation')})
assert.equal(empty.data.features.length,0);assert.equal(empty.summary.diffRate,null)
const cancelled=new AbortController();cancelled.abort()
await assert.rejects(mod.compareFarmlandRegions(request,0,sources,{signal:cancelled.signal},{clip:async()=>clipResult(),compare:()=>assert.fail('cancelled')}),{name:'AbortError'})
console.log('Farmland regional comparison: server UNION clipping, complete multipart selection, three result groups, failure isolation, empty inputs and abort passed')
