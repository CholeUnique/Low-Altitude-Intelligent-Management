import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const module={exports:{}}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/utils/region-clip.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({}),module,module.exports)
const {runRegionClip,validateRegionClipCollection,assertRegionClipSources,RegionClipIntegrityError}=module.exports
const target={serviceId:'101',layerId:2,where:"DLMC = '水田'"}
const request={deptId:'9',combineMode:'UNION',regions:[{serviceId:'101',layerId:1,objectIds:[12,15]}],targets:[target]}
const feature=(id=1,type='Polygon')=>({type:'Feature',geometry:type==='Point'?{type,coordinates:[119.9,32.5]}:type==='MultiLineString'?{type,coordinates:[[[119.8,32.4],[119.9,32.5]]]}:{type,coordinates:type==='MultiPolygon'?[[[[119.8,32.4],[119.9,32.4],[119.9,32.5],[119.8,32.4]]]]:[[[119.8,32.4],[119.9,32.4],[119.9,32.5],[119.8,32.4]]]},properties:{sourceObjectId:id,TBBH:'00321202001204003037',DLMC:'水田'}})
const collection=(features=[])=>({type:'FeatureCollection',features})
const layer=(extra={})=>({...target,layerName:'高标地块_海陵区',status:'SUCCEEDED',sourceFeatureCount:5000,resultFeatureCount:2001,...extra})
const options=()=>({signal:new AbortController().signal,pollMs:0})
let polls=0;const pages=[],arrivals=[]
const result=await runRegionClip(request,{...options(),layer:layer=>arrivals.push({polls,count:layer.data.features.length})},{
  start:async input=>{assert.deepEqual(input,request);return {resultId:'job1',status:'PENDING',cached:false}},
  status:async()=>({resultId:'job1',status:++polls===1?'RUNNING':'SUCCEEDED',layers:[layer()]}),
  page:async(id,t,dept,page)=>{assert.equal(id,'job1');assert.deepEqual(t,target);assert.equal(dept,'9');pages.push(page);return collection(Array.from({length:page<3?1000:1},(_,i)=>feature((page-1)*1000+i+1)))},
})
assert.deepEqual(pages,[1,2,3],'超过单页上限时完整读取后续所有页')
assert.deepEqual(arrivals,[{polls:1,count:2001}],'就绪图层提前发布且只读取一次，不等待其他层')
assert.equal(result.layers[0].data.features.length,2001)
assert.equal(result.layers[0].data.features[0].properties.TBBH,'00321202001204003037','图斑编号和前导零原样保留')
assert.equal(result.layers[0].data.features[0].properties.DLMC,'水田')
for(const type of ['Point','MultiLineString','Polygon','MultiPolygon'])assert.equal(validateRegionClipCollection(collection([feature(1,type)]),1).features[0].geometry.type,type)
assert.throws(()=>validateRegionClipCollection(collection([feature()]),2),/未完整返回/)
assert.throws(()=>validateRegionClipCollection(collection([{...feature(),properties:{}}]),1),/原要素标识/)
assert.throws(()=>validateRegionClipCollection(collection([{...feature(),geometry:{type:'Point',coordinates:[400,32]}}]),1),/经纬度/)
const partial=await runRegionClip({...request,targets:[target,{...target,layerId:3},{...target,layerId:4}]},options(),{
  start:async()=>({resultId:'partial',status:'PARTIAL_SUCCESS',cached:true}),
  status:async()=>({resultId:'partial',status:'PARTIAL_SUCCESS',layers:[layer({resultFeatureCount:0}),layer({layerId:3,status:'FAILED',error:'where 字段不存在'})]}),
  page:async(_id,t)=>{assert.equal(t.layerId,2,'失败层不请求空 GeoJSON 冒充成功');return collection()},
})
assert.equal(partial.layers[0].status,'SUCCEEDED','空图层正常成功')
assert.equal(partial.layers[0].data.features.length,0)
assert.equal(partial.layers[1].error,'where 字段不存在')
assert.equal(partial.layers[1].data,undefined,'失败层不回退原几何')
assert.equal(partial.layers[2].status,'FAILED','后端漏掉目标状态时失败关闭')
const truncated=await runRegionClip(request,options(),{start:async()=>({resultId:'short',cached:false}),status:async()=>({resultId:'short',status:'SUCCEEDED',layers:[layer({resultFeatureCount:2})]}),page:async()=>collection([feature()])})
assert.equal(truncated.layers[0].status,'FAILED','漏读结果时隐藏该层')
assert.equal(truncated.layers[0].data,undefined)
for(const cached of [false,true]){
  const controller=new AbortController();let cancellations=0
  await assert.rejects(runRegionClip(request,{signal:controller.signal,pollMs:0},{
    start:async()=>({resultId:'cancel',status:'RUNNING',cached}),
    status:async(_id,_dept,_signal,cancel)=>{if(cancel){cancellations++;return {}}controller.abort();return {resultId:'cancel',status:'RUNNING',layers:[]}},
    page:async()=>{throw Error('不应读取已取消任务')},
  }))
  assert.equal(cancellations,cached?0:1,'只取消自己新建的任务，不取消共享缓存任务')
}
await assert.rejects(runRegionClip(request,options(),{start:async()=>({resultId:'cancelled'}),status:async()=>({resultId:'cancelled',status:'CANCELLED',layers:[]}),page:async()=>collection()}),/已取消/)
let laterPolls=0,earlyReads=0
const deferred=await runRegionClip(request,options(),{start:async()=>({resultId:'deferred',cached:true}),status:async()=>({resultId:'deferred',status:++laterPolls<3?'RUNNING':'SUCCEEDED',layers:[layer({resultFeatureCount:1})]}),page:async()=>{if(++earlyReads===1)throw Object.assign(new Error('整体任务尚未完成'),{code:'10816'});return collection([feature()])}})
assert.equal(earlyReads,2,'10816 只在整体结束后重读，不在每次轮询时重复请求 GeoJSON')
assert.equal(deferred.layers[0].status,'SUCCEEDED')
let statusAttempts=0,cancelAttempts=0
const recovered=await runRegionClip(request,options(),{start:async()=>({resultId:'recovered',cached:false}),status:async(_id,_dept,_signal,cancel)=>{if(cancel){cancelAttempts++;return {}}if(++statusAttempts===1)throw Object.assign(new Error('timeout'),{code:'ECONNABORTED'});return {resultId:'recovered',status:'SUCCEEDED',layers:[layer({resultFeatureCount:0})]}},page:async()=>collection()})
assert.equal(recovered.layers[0].status,'SUCCEEDED')
assert.equal(cancelAttempts,0,'一次状态超时不会取消仍在后台运行的裁切任务')
const cityTarget={serviceId:'101',layerId:4,where:'OBJECTID IN (2,22)'}
const cityRequest={...request,regions:[{serviceId:'101',layerId:4,objectIds:[2,22]}],targets:[cityTarget]}
assert.doesNotThrow(()=>assertRegionClipSources(cityRequest,cityTarget,collection([feature(2),feature(22)]),'city-complete'))
assert.doesNotThrow(()=>assertRegionClipSources(cityRequest,cityTarget,collection([feature(2),feature(22),feature(22)]),'city-split'))
assert.throws(()=>assertRegionClipSources(cityRequest,cityTarget,collection([feature(2)]),'city-missing'),error=>error instanceof RegionClipIntegrityError&&/city-missing.*22/.test(error.message))
let cityPublished=0
await assert.rejects(runRegionClip(cityRequest,{...options(),layer:()=>cityPublished++},{start:async()=>({resultId:'city-missing',cached:true}),status:async()=>({resultId:'city-missing',status:'SUCCEEDED',layers:[{...cityTarget,status:'SUCCEEDED',sourceFeatureCount:2,resultFeatureCount:1}]}),page:async()=>collection([feature(2)])}),RegionClipIntegrityError)
assert.equal(cityPublished,0,'A normal backend count cannot hide the loss of a selected administrative feature')
console.log('region clip: async polling, complete pagination, source attributes, point/line/polygon, empty/failed/missing layers, truncation and cancellation passed')
