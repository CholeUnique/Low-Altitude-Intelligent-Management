import { spatialPost } from './spatial-analysis'

export type RegionClipState = 'PENDING'|'RUNNING'|'SUCCEEDED'|'PARTIAL_SUCCESS'|'FAILED'|'CANCELLED'
export interface RegionSelection { serviceId:string; layerId:number; objectIds:(string|number)[] }
export interface RegionClipTarget { serviceId:string; layerId:number; where:string }
export interface RegionClipRequest { deptId:string; regions:RegionSelection[]; combineMode:'UNION'; targets:RegionClipTarget[] }
export interface RegionClipAccepted { resultId:string; status:RegionClipState; cached:boolean }
export interface RegionClipLayerStatus {
  serviceId:string|number; layerId:number; layerName:string; status:RegionClipState
  sourceFeatureCount:number; resultFeatureCount:number; error?:string|null
}
export interface RegionClipStatus { resultId:string; status:RegionClipState; progress?:number; error?:string|null; layers:RegionClipLayerStatus[] }
export type RegionClipCollection = GeoJSON.FeatureCollection<Exclude<GeoJSON.Geometry,GeoJSON.GeometryCollection>>
const endpoint='/v1/spatial/region-clip'
export function startRegionClip(request:RegionClipRequest,signal?:AbortSignal) {
  return spatialPost<RegionClipAccepted>(endpoint,request,{signal})
}
export function getRegionClipStatus(resultId:string,deptId:string,signal?:AbortSignal,cancel=false) {
  return spatialPost<RegionClipStatus>(`${endpoint}/status`,{resultId,deptId,...(cancel?{cancel:true}:{})},{signal,timeout:30_000})
}
export function getRegionClipPage(resultId:string,target:RegionClipTarget,deptId:string,pageNum:number,signal?:AbortSignal) {
  return spatialPost<RegionClipCollection>(`${endpoint}/geojson`,{resultId,serviceId:target.serviceId,layerId:target.layerId,deptId,pageNum,pageSize:1000},{signal,timeout:60_000})
}
