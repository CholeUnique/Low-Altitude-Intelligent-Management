import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
function load(file,deps={}){const module={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(module,module.exports,id=>{assert(id in deps,`Unexpected import ${id}`);return deps[id]});return module.exports}
const validate=load('src/utils/spatial-geometry-result.ts',{'./topic-upload':{assertTopicGeometry(data){assert(data.features.every(f=>f.geometry.type==='Polygon'))}},'./spatial-overlay-result':{},'./spatial-geometry-input':{PUBLISHED_ANALYSIS_MAX_FEATURES:20000}})
const requests={geometryRequestInputs:(geometryA,geometryB)=>({geometryA,geometryB})}
const {farmlandDefaults,splitFarmlandOverlay,partitionUploadedRange}=load('src/utils/farmland-analysis.ts',{'./spatial-geometry-result':validate,'./spatial-geometry-input':requests})
const make=(kind,area,id)=>({type:'Feature',geometry:{type:'Polygon',coordinates:[[[120,32],[120.001,32],[120.001,32.001],[120,32]]]},properties:{diffType:kind,areaSqm:area,seqNo:id,centerLng:120,centerLat:32}})
const collection=features=>({type:'FeatureCollection',features})
const group=(kind,area,id)=>({areaSqm:area,spotCount:area?1:0,featureCollection:collection(area?[make(kind,area,id)]:[])})
const high={serviceId:'9',layerId:2,layerName:'高标地块_海陵区',serviceName:'海陵区高标准农田'},permanent={...high,layerId:0,layerName:'永久基本农田_海陵区'}
const defaults=farmlandDefaults([
 {key:'8/0',sourceName:'海陵区高标农田',role:'land',service:{name:'无关层'}},
 {key:'9/0',sourceName:high.serviceName,role:'permanent',service:{name:permanent.layerName}},
 {key:'9/1',sourceName:high.serviceName,role:'boundary',service:{name:'乡级行政区划'}},
 {key:'9/2',sourceName:high.serviceName,role:'parcel',service:{name:high.layerName}},
 {key:'9/3',sourceName:high.serviceName,role:'boundary',service:{name:'村级行政区划'}},
])
assert.deepEqual(defaults.keys,['9/0','9/1','9/2','9/3']);assert.equal(defaults.a.layerId,2);assert.equal(defaults.b.layerId,0);assert.equal(defaults.boundary.layerId,1)
assert.deepEqual(defaults.initialKeys,['9/1'],'Keep all four catalogue layers but initially render only township boundaries')
const features=[make('A_ONLY',100,1),make('B_ONLY',200,2),make('OVERLAP',300,3)]
const summary={sourceA:high,sourceB:permanent,onlyAArea:100,onlyBArea:200,overlapArea:300,diffArea:300,spotCount:3,minAreaSqm:4}
const split=splitFarmlandOverlay(collection(features),summary)
assert.deepEqual(split.map(g=>g.areaSqm),[100,200,300]);assert.equal(split[2].sources.length,2)
assert.equal(split[0].data.features[0].geometry,features[0].geometry,'Never recalculate or flatten source geometry')
assert(!('analysisGroup' in features[0].properties),'Never mutate raw backend features')
assert.throws(()=>splitFarmlandOverlay(collection(features.slice(0,2)),{...summary,spotCount:2}),/交集/)
assert.throws(()=>splitFarmlandOverlay(collection(features.slice(0,2)),summary),/不完整/)
assert.throws(()=>splitFarmlandOverlay(collection(features),{...summary,overlapArea:250}),/超过/)
assert.throws(()=>splitFarmlandOverlay(collection(features),{...summary,diffArea:NaN}),/统计/)
const responses=[
 {areaA:100,areaB:100,crsUsed:'test',minAreaSqm:4,both:group('OVERLAP',60,1),aOnly:group('A_ONLY',40,2),bOnly:group('B_ONLY',40,3)},
 {areaA:60,areaB:80,crsUsed:'test',minAreaSqm:4,both:group('OVERLAP',20,4),aOnly:group('A_ONLY',40,5),bOnly:group('B_ONLY',60,6)},
 {areaA:40,areaB:80,crsUsed:'test',minAreaSqm:4,both:group('OVERLAP',10,7),aOnly:group('A_ONLY',30,8),bOnly:group('B_ONLY',70,9)},
]
const calls=[],upload=collection([make('A_ONLY',100,0)]),highData=collection([make('A_ONLY',100,0)]),permData=collection([make('A_ONLY',80,0)])
const result=await partitionUploadedRange(upload,highData,permData,4,{high,permanent,uploadName:'规划范围'},async input=>{calls.push(input);return responses[calls.length-1]})
assert.equal(calls.length,3,'Use three backend clips, not whole-upload intersection classification')
assert.equal(calls[0].geometryA,upload);assert.equal(calls[0].geometryB,highData)
assert.equal(calls[1].geometryA,responses[0].both.featureCollection);assert.equal(calls[2].geometryA,responses[0].aOnly.featureCollection)
assert.equal(calls[1].geometryB,permData);assert(calls.every(c=>c.minAreaSqm===4))
assert.deepEqual(result.partitions.map(g=>g.areaSqm),[60,30,40,10,20,30],'Two inclusive summaries and four exclusive upload portions')
assert.equal(result.partitions.filter(g=>!g.aggregate).reduce((sum,g)=>sum+g.areaSqm,0),100)
assert.equal(result.partitions[4].sources.length,2)
assert.deepEqual(result.partitions.filter(g=>!g.aggregate).flatMap(g=>g.data.features.map(f=>f.properties.seqNo)),[5,7,4,8])
let emptyCalls=0
const emptyBranch=await partitionUploadedRange(upload,highData,permData,4,{high,permanent,uploadName:'规划'},async input=>{
  assert(input.geometryA.features.length,'Never submit an empty range to the backend')
  return ++emptyCalls===1?{...responses[0],both:group('OVERLAP',0,0),aOnly:group('A_ONLY',100,2)}:{...responses[2],areaA:100,both:group('OVERLAP',25,7),aOnly:group('A_ONLY',75,8)}
})
assert.equal(emptyCalls,2,'Skip only the mathematically empty branch')
assert.deepEqual(emptyBranch.partitions.map(g=>g.areaSqm),[0,25,0,25,0,75])
let outsideCalls=0
const outsideAll=await partitionUploadedRange(upload,collection([]),collection([]),0,{high,permanent,uploadName:'规划'},async input=>{
  outsideCalls++;assert.equal(input.geometryA,input.geometryB,'无候选图层时仍用后端自交计算范围面积')
  return {areaA:100,areaB:100,crsUsed:'fixture',both:group('OVERLAP',100,1),aOnly:group('A_ONLY',0,0),bOnly:group('B_ONLY',0,0)}
})
assert.equal(outsideCalls,2)
assert.deepEqual(outsideAll.partitions.map(group=>group.areaSqm),[0,0,0,0,0,100],'没有任何候选地块时完整范围属于都不满足')
await assert.rejects(partitionUploadedRange(upload,highData,permData,4,{high,permanent,uploadName:'规划'},async()=>{throw Error('backend failure')}),/backend failure/)
let checks=0
await assert.rejects(partitionUploadedRange(upload,highData,permData,4,{high,permanent,uploadName:'规划'},async()=>responses[0],()=>{if(++checks)throw Error('cancelled')}),/cancelled/)
console.log('farmland analysis: canonical defaults, three independent backend groups, four-way clipped upload partition, inclusive views, provenance and cancellation passed')

assert.equal(new Set(result.partitions.flatMap(g=>g.data.features.map(f=>f.properties.coverageAtom))).size,4,'Inclusive categories share stable atoms for deduplicated rendering')
