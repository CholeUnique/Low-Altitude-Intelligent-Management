import type { SpatialGeometryCompare } from '@/api/spatial-analysis'
export interface SpatialCompareTask {resultId?:string|number;status?:string;progress?:number;cached?:boolean;error?:string;data?:unknown;result?:unknown;[key:string]:unknown}
export interface SpatialTaskOptions {signal?:AbortSignal;progress?:(percent:number)=>void;pollMs?:number;timeoutMs?:number}
function comparison(value:unknown):SpatialGeometryCompare|undefined{
  if(!value||typeof value!=='object')return
  const item=value as Record<string,unknown>
  if(typeof item.areaA!=='number'||typeof item.areaB!=='number'||!item.both)return
  return {...item,aOnly:item.aOnly??item.aonly,bOnly:item.bOnly??item.bonly} as unknown as SpatialGeometryCompare
}
function pause(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{signal.throwIfAborted();const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms);function abort(){clearTimeout(timer);reject(signal.reason)}signal.addEventListener('abort',abort,{once:true})})}
/** 新异步接口与旧同步响应均在此收敛为完整计算结果，受理回执不能当作面积。 */
export async function waitForSpatialCalculation<T>(accepted:unknown,read:(id:string,signal:AbortSignal)=>Promise<unknown>,parse:(value:unknown)=>T|undefined,label:string,options:SpatialTaskOptions={}):Promise<T>{
  options.signal?.throwIfAborted()
  const task=accepted as SpatialCompareTask
  const immediate=!task?.status?parse(accepted):undefined
  if(immediate){options.progress?.(100);return immediate}
  if(!task?.resultId)throw new Error(`后端未返回有效的${label}任务编号或计算结果`)
  const id=String(task.resultId),signal=options.signal||new AbortController().signal,deadline=Date.now()+(options.timeoutMs??720_000)
  let lastProgress=-1,unchanged=0,retries=0,current:SpatialCompareTask=task,submission=true
  for(;;){
    signal.throwIfAborted()
    if(!current||current.resultId!=null&&String(current.resultId)!==id)throw new Error(`后端${label}任务状态编号不一致`)
    if(current.status==='SUCCEEDED'){
      const result=parse(current)||parse(current.data)||parse(current.result)
      if(result){options.progress?.(100);return result}
      // 命中已完成缓存时，受理接口仍可能只返回 resultId/status，必须查询一次结果状态。
      if(!submission)throw new Error(`后端${label}任务 ${id} 已完成，但状态接口未返回完整计算结果`)
    }
    else {
    if(['FAILED','CANCELLED'].includes(current.status||''))throw new Error(`后端${label}失败（结果 ${id}）：${current.error||'后端未提供具体原因'}`)
    if(!['PENDING','RUNNING'].includes(current.status||''))throw new Error(`后端${label}任务 ${id} 返回未知状态`)
    const value=Number(current.progress),progress=current.progress!=null&&Number.isFinite(value)&&value>=0&&value<=100?value:-1
    if(progress>=0)options.progress?.(progress)
    unchanged=progress===lastProgress?unchanged+1:0;lastProgress=progress
    if(Date.now()>=deadline)throw new Error(`${label}任务 ${id} 等待超时，可稍后重试复用后端结果`)
    await pause(Math.min(8000,(options.pollMs??1200)*2**Math.min(unchanged,3)),signal)
    }
    submission=false
    for(;;){try{current=await read(id,signal) as SpatialCompareTask;retries=0;break}
      catch(error){signal.throwIfAborted();if(['ECONNABORTED','ETIMEDOUT','ERR_NETWORK','HTTP 500','HTTP 502','HTTP 503','HTTP 504'].includes(String((error as {code?:string})?.code))&&++retries<=2&&Date.now()<deadline){await pause(options.pollMs===0?0:3000*retries,signal);continue}throw error}}
  }
}
export function waitForSpatialComparison(accepted:unknown,read:(id:string,signal:AbortSignal)=>Promise<unknown>,options:SpatialTaskOptions={}){
  return waitForSpatialCalculation(accepted,read,comparison,'图斑对比',options)
}
