import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
class ApiBusinessError extends Error { constructor(code,message){super(message);this.code=code} }
const calls=[]
let handle
const client={ApiBusinessError,apiClient:{post:async(path,body,options)=>{calls.push({path,body,options});return handle(path,body,options)}}}
function load(file,dependencies){const module={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(module,module.exports,id=>{assert(id in dependencies,`Unexpected dependency: ${id}`);return dependencies[id]});return module.exports}
const api=load('src/api/spatial-analysis.ts',{'./client':client})
const {loadSpatialOverlayResult,spatialFilters,spatialDifferenceFeatures}=load('src/utils/spatial-overlay-result.ts',{'@/api/client':client,'@/api/spatial-analysis':api})
const signal=new AbortController().signal
const fields=[{name:'DLMC',alias:'地类名称',type:'text'}]
handle=async()=>[{layerId:2,name:'后端原名',analyzable:true,geometryType:'POLYGON',fields}]
assert.equal((await api.getSpatialLayers('9223372036854775806','1',{signal}))[0].name,'后端原名')
assert.equal(calls.at(-1).body.serviceId,'9223372036854775806','Preserve 64-bit identifiers as strings')
assert.equal(calls.at(-1).options.signal,signal)
const input={deptId:'1',sourceA:{serviceId:'9',layerId:0,filters:[{field:'DLMC',op:'EQ',values:['水田']}]},sourceB:{serviceId:'9',layerId:1,filters:[]},minAreaSqm:4,includeOverlapSpots:false}
handle=async()=>({resultId:'9223372036854775805',areaA:122.456,diffArea:5.67,crsUsed:'CGCS2000_3DEG_CM_120E'})
const summary=await api.analyzeSpatialOverlay(input,{signal})
assert.equal(summary.resultId,'9223372036854775805');assert.equal(summary.areaA,122.456,'Never recompute or round backend statistics in the API')
assert.deepEqual(calls.at(-1).body,input);assert.equal(calls.at(-1).options.timeout,180000)
assert(!('geometry' in calls.at(-1).body),'Send layer references, never browser-loaded source geometry')
await api.getSpatialOverlayDetail(summary.resultId,'1',{signal});assert.equal(calls.at(-1).path,'/v1/spatial/overlay/detail')
assert.equal(calls.at(-1).body.resultId,summary.resultId)
assert.deepEqual(spatialFilters([{field:'DLMC',op:'IN',values:'水田\n旱地\n水田'}],fields),[{field:'DLMC',op:'IN',values:['水田','旱地']}])
assert.throws(()=>spatialFilters([{field:'BAD',op:'EQ',values:'水田'}],fields),/有效字段/)
assert.throws(()=>spatialFilters([{field:'DLMC',op:'IN',values:Array.from({length:51},(_,i)=>String(i)).join('\n')}],fields),/50/)
assert.throws(()=>spatialFilters([{field:'DLMC',op:'EQ',values:'水田\n旱地'}],fields),/一个值/)
assert.throws(()=>spatialFilters([{field:'DLMC',op:'EQ',values:' '}],fields),/筛选值/)

const outer=[[119,32],[120,32],[120,33],[119,32]],hole=[[119.2,32.2],[119.3,32.2],[119.3,32.3],[119.2,32.2]];
const geometry={type:'MultiPolygon',coordinates:[[outer,hole]]};
const feature={type:'Feature',geometry,properties:{diffType:'DIFF',areaSqm:135.27,partCount:2}};
const data={type:'FeatureCollection',features:[feature]};
const original=JSON.stringify(data);
assert.equal(spatialDifferenceFeatures(data),data,'Use the merged backend result unchanged');
assert.equal(spatialDifferenceFeatures(data).features[0].geometry,geometry,'Preserve multipart geometry and holes');
assert.equal(JSON.stringify(data),original,'Never merge or recalculate geometry in the browser');
for(const diffType of ['A_ONLY','B_ONLY','OVERLAP',undefined]){
 assert.throws(()=>spatialDifferenceFeatures({type:'FeatureCollection',features:[{...feature,properties:{diffType}}]}),/未获取到独立的不重叠区域图层/);
}
assert.throws(()=>spatialDifferenceFeatures({type:'FeatureCollection',features:[feature,{...feature,properties:{diffType:'A_ONLY'}}]}),/单个 DIFF/);
assert.throws(()=>spatialDifferenceFeatures({type:'FeatureCollection',features:[feature,feature]}),/单个 DIFF/);
assert.throws(()=>spatialDifferenceFeatures({type:'FeatureCollection',features:[]}),/后端返回空结果/);
assert.throws(()=>spatialDifferenceFeatures({type:'FeatureCollection',features:[{...feature,geometry:null}]}),/有效的面图斑/);
assert.throws(()=>spatialDifferenceFeatures({type:'FeatureCollection',features:[{...feature,geometry:{type:'Polygon',coordinates:[]}}]}),/有效的面图斑/);
handle=async()=>data;
assert.equal(await loadSpatialOverlayResult(summary.resultId,'1',{signal}),data);
assert.equal(calls.at(-1).path,'/v1/spatial/overlay/geojson');
assert.equal(calls.at(-1).body.merge,true,'Explicitly request the independent merged layer');
assert.equal(calls.at(-1).body.resultId,summary.resultId);
assert.equal(calls.at(-1).options.signal,signal);
for(const code of ['-1','10707','403','10709']){
 const attempted=[];
 handle=async(path)=>{attempted.push(path);throw new ApiBusinessError(code,code==='-1'?'unknown error':'接口错误')};
 await assert.rejects(loadSpatialOverlayResult('33','1'),error=>error.code===code&&error.message.includes('结果 33')&&error.message.includes('/geojson'));
 assert.deepEqual(attempted,['/v1/spatial/overlay/geojson'],'Never replace unavailable merged geometry with A_ONLY/B_ONLY paging');
}
handle=async()=>({type:'FeatureCollection',features:[{...feature,properties:{diffType:'A_ONLY'}}]});
await assert.rejects(loadSpatialOverlayResult('33','1'),/merge=true.*结果 33.*不会使用 A_ONLY\/B_ONLY 替代/);
handle=async()=>{throw new ApiBusinessError('-1','unknown error')};
await assert.rejects(api.getSpatialOverlayGeoJson('33','1'),error=>error instanceof api.SpatialRequestError&&error.code==='-1'&&error.endpoint==='/v1/spatial/overlay/geojson'&&/服务端异常日志/.test(error.message));
handle=async()=>{throw Object.assign(new Error('timeout'),{code:'ECONNABORTED'})};
await assert.rejects(api.getSpatialOverlayGeoJson('33','1'),/请求超时/);
handle=async()=>{throw Object.assign(new Error('Network Error'),{code:'ERR_NETWORK'})};
await assert.rejects(api.getSpatialOverlayGeoJson('33','1'),/无法连接后端/);
handle=async()=>{throw {response:{status:503,data:{msg:'服务维护中'}}}};
await assert.rejects(api.getSpatialOverlayGeoJson('33','1'),/HTTP 503.*服务维护中/);
const abort=new AbortController();abort.abort();const aborted=Object.assign(new Error('aborted'),{name:'AbortError'});
handle=async()=>{throw aborted};await assert.rejects(loadSpatialOverlayResult('33','1',{signal:abort.signal}),error=>error===aborted);
console.log('spatial analysis: explicit merge=true, strict single DIFF geometry, preserved holes, no A_ONLY/B_ONLY fallback, exact diagnostics, filters, IDs and cancellation passed');
