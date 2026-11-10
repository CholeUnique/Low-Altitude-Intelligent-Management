import { startRegionClip,getRegionClipStatus,getRegionClipPage,type RegionClipRequest,type RegionClipStatus,type RegionClipLayerStatus,type RegionClipCollection } from '@/api/region-clip'

export const regionClipKey=(item:{serviceId:string|number;layerId:number})=>`${item.serviceId}/${item.layerId}`
export interface RegionClipResultLayer extends RegionClipLayerStatus { data?:RegionClipCollection }
export interface RegionClipResult { resultId:string; layers:RegionClipResultLayer[]; cached:boolean }
export interface RegionClipApi { start:typeof startRegionClip;status:typeof getRegionClipStatus;page:typeof getRegionClipPage }
const api:RegionClipApi={start:startRegionClip,status:getRegionClipStatus,page:getRegionClipPage}
export class RegionClipIntegrityError extends Error {
  constructor(resultId:string,target:{serviceId:string|number;layerId:number},missing:string[]){
    super(`后端裁切范围不完整（结果 ${resultId}，服务 ${target.serviceId}、图层 ${target.layerId}）：未返回所选区划要素 ${missing.join('、')}。已隐藏全部裁切图层，请后端核查区划外环／内环转换及几何修复结果。`)
    this.name='RegionClipIntegrityError'
  }
}
export function assertRegionClipSources(request:RegionClipRequest,target:{serviceId:string|number;layerId:number},data:RegionClipCollection,resultId:string){
  const expected=new Set(request.regions.filter(source=>regionClipKey(source)===regionClipKey(target)).flatMap(source=>source.objectIds.map(String)))
  if(!expected.size)return
  const received=new Set(data.features.map(feature=>String(feature.properties?.sourceObjectId)))
  const missing=[...expected].filter(id=>!received.has(id))
  // 所选行政区一定包含于 UNION 范围中，自裁切不得丢失任何原始要素。
  if(missing.length)throw new RegionClipIntegrityError(resultId,target,missing)
}
function wait(ms:number,signal:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    signal.throwIfAborted()
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)
    function abort(){clearTimeout(timer);reject(signal.reason||new Error('裁切已取消'))}
    signal.addEventListener('abort',abort,{once:true})
  })
}
export function validateRegionClipCollection(data:RegionClipCollection,expected:number) {
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length!==expected)throw new Error('后端裁切结果未完整返回，已隐藏该图层，请重试')
  for(const feature of data.features){
    if(feature?.type!=='Feature'||!feature.geometry||!['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon'].includes(feature.geometry.type)||feature.properties?.sourceObjectId==null)throw new Error('后端裁切结果缺少有效几何或原要素标识')
    const positions:unknown[]=[feature.geometry.coordinates]
    while(positions.length){const value=positions.pop();if(!Array.isArray(value)||!value.length)throw new Error('后端裁切结果包含空几何');if(typeof value[0]==='number'){if(value.length<2||!value.every(n=>typeof n==='number'&&Number.isFinite(n))||Math.abs(value[0])>180||Math.abs(value[1])>90)throw new Error('后端裁切坐标不是有效经纬度')}else positions.push(...value)}
  }
  return data
}

/** 只读取服务端真实裁切结果；失败、漏页或取消均不回退到原图层。 */
export async function runRegionClip(request:RegionClipRequest,options:{signal:AbortSignal;progress?:(status:RegionClipStatus)=>void;notice?:(message:string)=>void;layer?:(layer:RegionClipResultLayer)=>void|Promise<void>;pollMs?:number;timeoutMs?:number},client:RegionClipApi=api):Promise<RegionClipResult> {
  const {signal}=options
  signal.throwIfAborted()
  const accepted=await client.start(request,signal)
  if(!accepted?.resultId)throw new Error('后端未返回裁切任务编号')
  // 缓存可能由其他请求复用；仅取消本次新建的任务。
  const cancel=()=>{if(!accepted.cached)void client.status(accepted.resultId,request.deptId,undefined,true).catch(()=>{})}
  signal.addEventListener('abort',cancel,{once:true})
  try{
    if(signal.aborted){cancel();signal.throwIfAborted()}
    const deadline=Date.now()+(options.timeoutMs??600_000)
    const completed=new Map<string,RegionClipResultLayer>()
    const deferred=new Set<string>()
    let previous='',unchanged=0,retries=0
    for(;;){
      signal.throwIfAborted()
      let status:RegionClipStatus
      try{status=await client.status(accepted.resultId,request.deptId,signal);retries=0}
      catch(error){signal.throwIfAborted();const code=String((error as {code?:string})?.code);if(['ECONNABORTED','ETIMEDOUT','ERR_NETWORK','HTTP 500','HTTP 502','HTTP 503','HTTP 504'].includes(code)&&++retries<=2&&Date.now()<deadline){options.notice?.(`后端状态暂未响应（${code}），正在重试（${retries}/2），请稍候…`);await wait(options.pollMs===0?0:Math.min(10_000,3000*retries),signal);continue}throw error}
      if(!status||String(status.resultId)!==String(accepted.resultId)||!Array.isArray(status.layers))throw new Error('后端裁切状态不完整')
      options.progress?.(status)
      const terminal=!['PENDING','RUNNING'].includes(status.status)
      if(status.status==='CANCELLED')throw new Error('行政区裁切任务已取消')
      if(terminal&&!['SUCCEEDED','PARTIAL_SUCCESS','FAILED'].includes(status.status))throw new Error('后端返回未知裁切状态')
      for(const target of request.targets){
        const key=regionClipKey(target)
        if(completed.has(key))continue
        if(!terminal&&deferred.has(key))continue
        signal.throwIfAborted()
        const item=status.layers.find(layer=>regionClipKey(layer)===key)
        if(!terminal&&(!item||!['SUCCEEDED','FAILED'].includes(item.status)))continue
        let result:RegionClipResultLayer
        if(!item)result={...target,layerName:key,status:'FAILED',sourceFeatureCount:0,resultFeatureCount:0,error:status.error||'后端未返回该图层状态'}
        else if(item.status!=='SUCCEEDED')result={...item,status:'FAILED',error:item.error||status.error||'图层裁切未成功'}
        else{
          try{
            const count=item.resultFeatureCount
            if(!Number.isInteger(count)||count<0)throw new Error('后端未返回裁切结果数量')
            const data:RegionClipCollection={type:'FeatureCollection',features:[]}
            for(let page=1;page<=Math.max(1,Math.ceil(count/1000));page++){
              const chunk=await client.page(accepted.resultId,target,request.deptId,page,signal)
              validateRegionClipCollection(chunk,count===0?0:Math.min(1000,count-(page-1)*1000))
              data.features.push(...chunk.features)
            }
            result={...item,data}
          }catch(error){signal.throwIfAborted();if(!terminal&&String((error as {code?:string})?.code)==='10816'){deferred.add(key);continue}result={...item,status:'FAILED',error:error instanceof Error?error.message:'读取裁切图层失败'}}
        }
        if(result.status==='SUCCEEDED'&&result.data)assertRegionClipSources(request,target,result.data,String(accepted.resultId))
        signal.throwIfAborted();completed.set(key,result)
        await options.layer?.(result)
      }
      if(terminal)return {resultId:String(accepted.resultId),layers:request.targets.map(target=>completed.get(regionClipKey(target))!),cached:accepted.cached}
      if(Date.now()>=deadline){cancel();throw new Error('行政区裁切等待超时，请重试或检查后端任务')}
      const fingerprint=JSON.stringify(status)
      unchanged=fingerprint===previous?unchanged+1:0;previous=fingerprint
      await wait(Math.min(8000,(options.pollMs??1500)*2**Math.min(unchanged,3)),signal)
    }

  }
  finally{signal.removeEventListener('abort',cancel)}
}
