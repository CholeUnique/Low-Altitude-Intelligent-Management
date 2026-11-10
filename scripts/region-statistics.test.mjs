import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const load=(file,deps={})=>{const m={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,id=>deps[id]||{});return m.exports}
const geometry=load('src/utils/spatial-geometry-input.ts',{'./topic-upload':{assertTopicGeometry(){}}})
const {calculateRegionStatistic}=load('src/utils/region-statistics.ts',{'./spatial-geometry-input':geometry})
const feature=(x=119)=>({type:'Feature',geometry:{type:'Polygon',coordinates:[[[x,32],[x+.1,32],[x+.1,32.1],[x,32]]]},properties:{originalAreaMu:999999}})
const fc=(features)=>({type:'FeatureCollection',features})
const region=fc([feature()]),high=fc([feature(),feature(130)]),permanent=fc([feature()])
const group=(area)=>({areaSqm:area,spotCount:area?1:0,featureCollection:fc(area?[feature()]:[])})
const responses=[{areaA:100,both:group(60)},{areaA:100,both:group(70)},{areaA:60,both:group(40),aOnly:group(20),bOnly:group(30)}]
const requests=[]
const progress=[]
const result=await calculateRegionStatistic(region,high,permanent,new AbortController().signal,async (input,options)=>{requests.push(input);assert.equal(options.deptId,'7');options.progress?.(10);options.progress?.(70);options.progress?.(100);return responses.shift()},'7',value=>progress.push(value))
assert.deepEqual(result,{areaSqm:100,highAreaSqm:60,permanentAreaSqm:70,overlapAreaSqm:40,onlyHighAreaSqm:20,onlyPermanentAreaSqm:30,diffRate:50/60})
assert.equal(requests.length,3)
assert.equal(progress.at(-1),100);assert(progress.every((value,index)=>value>=0&&value<=100&&(!index||value>=progress[index-1])),'Parallel and sequential calculation stages form one monotonic progress value')
assert(requests.every(input=>input.minAreaSqm===0),'统计不以碎斑阈值丢失面积')
assert.equal(requests[0].geometryB.features.length,1,'包围盒排除远处候选，具体裁切仍由后端完成')
assert.equal(requests[0].geometryA.features[0].geometry,region.features[0].geometry,'前端不修改几何')
assert.deepEqual(requests[0].geometryA.features[0].properties,{})
const empty=await calculateRegionStatistic(region,fc([]),fc([]),new AbortController().signal,async()=>({areaA:100,both:group(100)}))
assert.deepEqual(empty,{areaSqm:100,highAreaSqm:0,permanentAreaSqm:0,overlapAreaSqm:0,onlyHighAreaSqm:0,onlyPermanentAreaSqm:0,diffRate:null},'无基准地块仍从后端计算区划面积，不能使用原地物属性相加')
const abort=new AbortController();abort.abort()
await assert.rejects(calculateRegionStatistic(region,high,permanent,abort.signal,async()=>{throw Error('不应调用')}))
await assert.rejects(calculateRegionStatistic(region,high,permanent,new AbortController().signal,async()=>{throw Error('后端图斑对比失败（结果 56）：side location conflict')}),/区划与高标田叠加失败.*结果 56.*side location conflict/)
console.log('Regional statistics: backend areas/intersections, zero threshold, bbox candidates, unchanged geometry, empty regions and cancellation passed')
