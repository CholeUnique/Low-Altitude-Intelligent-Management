import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const m={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/spatial-compare-task.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports)
const {waitForSpatialComparison}=m.exports
const group={areaSqm:2,featureCollection:{type:'FeatureCollection',features:[]}}
const value={areaA:5,areaB:3,both:group,aOnly:group,bOnly:group}
assert.equal((await waitForSpatialComparison(value,()=>{throw Error('同步响应不轮询')})).areaA,5)
let reads=0;const progress=[]
const result=await waitForSpatialComparison({resultId:'321202100207000146',status:'RUNNING',progress:0},async id=>{assert.equal(id,'321202100207000146');return ++reads===1?{resultId:id,status:'RUNNING',progress:50}:{resultId:id,status:'SUCCEEDED',progress:100,...value}},{pollMs:0,progress:value=>progress.push(value)})
assert.equal(result.areaA,5);assert.deepEqual(progress,[0,50,100]);assert.equal(reads,2)
await assert.rejects(waitForSpatialComparison({resultId:1,status:'RUNNING'},async()=>({resultId:1,status:'FAILED',error:'几何无效'}),{pollMs:0}),/几何无效/)
await assert.rejects(waitForSpatialComparison({resultId:1,status:'RUNNING'},async()=>({resultId:2,status:'SUCCEEDED',...value}),{pollMs:0}),/编号不一致/)
await assert.rejects(waitForSpatialComparison({resultId:1,status:'RUNNING'},async()=>({resultId:1,status:'SUCCEEDED'}),{pollMs:0}),/未返回完整/)
const controller=new AbortController();controller.abort()
await assert.rejects(waitForSpatialComparison({resultId:1,status:'RUNNING'},async()=>{throw Error('不应查询')},{signal:controller.signal}))
assert.equal((await waitForSpatialComparison({resultId:1,status:'SUCCEEDED',data:value},()=>{throw Error('缓存成功无需轮询')})).areaB,3)
let cachedReads=0
assert.equal((await waitForSpatialComparison({resultId:1,status:'SUCCEEDED',cached:true},async()=>{cachedReads++;return {resultId:1,status:'SUCCEEDED',...value}})).areaA,5)
assert.equal(cachedReads,1,'A cached SUCCEEDED submission can still be an acknowledgement only; read its status once')
await assert.rejects(waitForSpatialComparison({resultId:1,status:'RUNNING'},async()=>({resultId:1,status:'RUNNING'}),{pollMs:0,timeoutMs:0}),/等待超时/)
let retries=0
assert.equal((await waitForSpatialComparison({resultId:1,status:'RUNNING'},async()=>{if(++retries===1)throw Object.assign(Error('temporary'),{code:'HTTP 503'});return {resultId:1,status:'SUCCEEDED',...value}},{pollMs:0})).areaA,5)
console.log('Geometry compare tasks: legacy synchronous, async progress/result, exact long IDs, failure, missing result and cancellation passed')
