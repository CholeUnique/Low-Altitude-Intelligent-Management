import { apiClient, ApiBusinessError } from './client'

export interface SpatialField { name:string; alias?:string; type:'text'|'number'|'date'|'oid' }
export interface SpatialLayer { layerId:number; name:string; geometryType:string; analyzable:boolean; fields:SpatialField[] }
export interface SpatialFilter { field:string; op:'EQ'|'IN'; values:string[] }
export interface SpatialInput { serviceId:string; layerId:number; filters:SpatialFilter[] }
export interface SpatialOverlayRequest { deptId?:string; sourceA:SpatialInput; sourceB:SpatialInput; minAreaSqm:number; includeOverlapSpots:boolean }
export interface SpatialSource { serviceId:string|number; serviceName:string; layerId:number; layerName:string; filters?:SpatialFilter[] }
export interface SpatialOverlaySummary {
  resultId:string; cached:boolean; fingerprint?:string
  areaA:number; areaB:number; overlapArea:number; onlyAArea:number; onlyBArea:number
  diffArea:number; diffAreaRaw:number; diffRate:number|null
  featureCountA:number; featureCountB:number; spotCount:number; minAreaSqm:number
  crsUsed:string; costMs:number; createTime:string; sourceA:SpatialSource; sourceB:SpatialSource
}
export type SpatialGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon
export type SpatialCollection = GeoJSON.FeatureCollection<SpatialGeometry>
export interface SpatialSpot { seqNo:number; diffType:string; areaSqm:number; centerLng:number; centerLat:number; geometry:SpatialGeometry }
export interface SpatialSpotPage { records:SpatialSpot[]; total:number; pageNum:number; pageSize:number }
interface RequestOptions { signal?:AbortSignal }

/** Keep diagnostic context without exposing request headers or authentication tokens. */
export class SpatialRequestError extends ApiBusinessError {
  constructor(public readonly endpoint:string,public readonly resultId:string|undefined,code:string,detail:string) {
    super(code,`${endpoint.endsWith('/overlay')?'后端分析':endpoint.endsWith('/geojson')?'读取结果 GeoJSON':endpoint.endsWith('/spot/page')?'读取结果分页':endpoint.endsWith('/detail')?'读取分析统计':'读取可分析图层'}失败（POST /api${endpoint}${resultId?`，结果 ${resultId}`:''}，错误码 ${code}）：${/^unknown error$/i.test(detail.trim())?'后端未提供具体原因（unknown error），请检查服务端异常日志':detail}`)
    this.name='SpatialRequestError'
  }
}
async function spatialPost<T>(endpoint:string,body:object,options:RequestOptions&{timeout?:number}={}):Promise<T> {
  try{
    // apiClient's response interceptor unwraps data; Axios still types the transport response.
    const data:unknown=await apiClient.post(endpoint,body,options)
    return data as T
  }
  catch(error){
    if(options.signal?.aborted)throw error
    const failure=error as {code?:string;message?:string;response?:{status?:number;data?:{code?:string;msg?:string}}}
    const payload=failure?.response?.data,status=failure?.response?.status
    const code=error instanceof ApiBusinessError?error.code:String(payload?.code??(status?`HTTP ${status}`:failure?.code||'NETWORK_ERROR'))
    const message=payload?.msg||(error instanceof Error?error.message:'请求未完成')
    const detail=['ECONNABORTED','ETIMEDOUT'].includes(code)?'请求超时，请重试或检查后端是否仍在计算':code==='ERR_NETWORK'?'无法连接后端，请检查服务是否重启完成及网络连接':message
    throw new SpatialRequestError(endpoint,'resultId' in body?String(body.resultId):undefined,code,detail)
  }
}

export function getSpatialLayers(serviceId:string,deptId?:string,options:RequestOptions={}) {
  return spatialPost<SpatialLayer[]>('/v1/spatial/layer/list',{serviceId,deptId},options)
}
export async function analyzeSpatialOverlay(input:SpatialOverlayRequest,options:RequestOptions={}) {
  // This API is synchronous. Wait for the server instead of starting a browser worker or fake polling.
  const result=await spatialPost<SpatialOverlaySummary>('/v1/spatial/overlay',input,{...options,timeout:180_000})
  return {...result,resultId:String(result.resultId)}
}
export function getSpatialOverlayDetail(resultId:string,deptId?:string,options:RequestOptions={}) {
  return spatialPost<SpatialOverlaySummary>('/v1/spatial/overlay/detail',{resultId,deptId},options)
}
export function getSpatialOverlayGeoJson(resultId:string,deptId?:string,options:RequestOptions={}) {
  return spatialPost<SpatialCollection>('/v1/spatial/overlay/geojson',{resultId,deptId,merge:true},options)
}
export function getSpatialOverlaySpots(resultId:string,pageNum:number,deptId?:string,options:RequestOptions={}) {
  return spatialPost<SpatialSpotPage>('/v1/spatial/overlay/spot/page',{resultId,deptId,pageNum,pageSize:200},options)
}
