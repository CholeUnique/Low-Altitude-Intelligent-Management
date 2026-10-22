import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const ast=ts.createSourceFile('map.ts',readFileSync('src/utils/map-service-layer.ts','utf8'),ts.ScriptTarget.Latest,true)
const names=['renderJobs','renderQueue','renderCache','activeRenders','drainRenderQueue','loadMapRenderImage']
const selected=ast.statements.filter(node=>names.includes(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>names.includes(d.name.getText(ast))))
const code=ts.transpileModule(selected.map(node=>node.getText(ast)).join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const module={exports:{}}
new Function('module','exports',code)(module,module.exports)
const {loadMapRenderImage:load}=module.exports
const requests=[]
globalThis.fetch=(url,options)=>new Promise((resolve,reject)=>{
  const request={url,options,done:false,complete(){if(this.done)return;this.done=true;resolve({ok:true,headers:new Headers({'content-type':'image/png'}),blob:async()=>new Blob(['image'],{type:'image/png'})})}}
  requests.push(request)
  options.signal.addEventListener('abort',()=>{request.done=true;reject(new DOMException('cancelled','AbortError'))},{once:true})
})
const flush=()=>new Promise(resolve=>setImmediate(resolve))
const controllers=Array.from({length:10},()=>new AbortController())
const params=index=>new URLSearchParams({bbox:String(index),dynamicLayers:'standard-renderer',_filterRevision:'1'})
const jobs=controllers.map((controller,index)=>load('https://example.test/export',params(index),controller.signal).catch(error=>error.name))
const duplicateController=new AbortController()
const duplicate=load('https://example.test/export',params(0),duplicateController.signal)
await flush()
assert.equal(requests.length,6,'All vector layers share a six-request ceiling')
controllers[0].abort()
assert.equal(requests[0].options.signal.aborted,false,'One cancelled consumer must not cancel a shared render')
controllers[9].abort()
requests[0].complete();await flush()
assert.equal(requests.length,7,'Completing one render releases one slot')
assert((await duplicate) instanceof Blob)
while(requests.some(request=>!request.done)||requests.length<9){requests.forEach(request=>request.complete());await flush()}
const results=await Promise.all(jobs)
assert.equal(results[0],'AbortError');assert.equal(results[9],'AbortError')
assert.equal(requests.length,9,'Cancelled queued tiles never reach the server')
const cachedParameters=params(0);cachedParameters.set('_filterRevision','999')
await load('https://example.test/export',cachedParameters,new AbortController().signal)
assert.equal(requests.length,9,'Equivalent renders survive layer replacement/filter revision changes')
const changed=params(0);changed.set('dynamicLayers','different-standard-renderer')
const changedJob=load('https://example.test/export',changed,new AbortController().signal)
await flush();assert.equal(requests.length,10,'Different styles cannot reuse a cached image')
requests[9].complete();await changedJob
console.log('map rendering: global concurrency, shared cancellation, queue cancellation and semantic image caching passed')
