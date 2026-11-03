import type { SpatialCollection, SpatialCompareGroup, SpatialGeometryCompare, SpatialOverlaySummary, SpatialSource } from '@/api/spatial-analysis'
import { assertTopicGeometry } from './topic-upload'
import { annotateSpatialDifference } from './spatial-overlay-result'

export type SpatialAnalysisOperation='difference'|'coverage'
export type SpatialAnalysisSummary=Pick<SpatialOverlaySummary,'sourceA'|'sourceB'|'areaA'|'areaB'|'overlapArea'|'onlyAArea'|'onlyBArea'|'diffArea'|'minAreaSqm'|'crsUsed'|'featureCountA'|'featureCountB'|'spotCount'>
  &Partial<Pick<SpatialOverlaySummary,'resultId'|'cached'|'costMs'|'createTime'|'diffAreaRaw'|'diffRate'>>
  &{coverageRate?:number|null;outsideRate?:number|null;unreturnedArea?:number}
export const COVERAGE_COLORS={INSIDE:'#57d2a3',OUTSIDE:'#f1ad6c'}
export function validateCompareGroup(group:SpatialCompareGroup,kind:'OVERLAP'|'A_ONLY'|'B_ONLY'):SpatialCollection {
  if(!group||!Number.isFinite(group.areaSqm)||group.areaSqm<0||!Number.isInteger(group.spotCount)||group.spotCount<0)throw new Error('后端分组统计无效')
  const data=group.featureCollection
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length!==group.spotCount)throw new Error('后端返回的分组图斑数量不完整')
  if(data.features.length)assertTopicGeometry(data)
  let area=0
  for(const feature of data.features){
    const properties=feature.properties
    if(properties?.diffType!==kind||typeof properties.areaSqm!=='number'||!Number.isFinite(properties.areaSqm)||properties.areaSqm<=0)throw new Error(`后端 ${kind} 分组包含来源不符或零面积图斑，请修复结果后重试`)
    area+=properties.areaSqm
  }
  if(Math.abs(area-group.areaSqm)>Math.max(.05,data.features.length*.00011))throw new Error('后端分组面积与已返回图斑面积不一致，未展示不完整结果')
  return data
}
export function geometryAnalysisResult(response:SpatialGeometryCompare,operation:SpatialAnalysisOperation,sources:{sourceA:SpatialSource;sourceB:SpatialSource},counts:{a:number;b:number}) {
  if(!response||![response.areaA,response.areaB,response.minAreaSqm,response.both?.areaSqm,response.aOnly?.areaSqm,response.bOnly?.areaSqm].every(value=>Number.isFinite(value)&&value>=0))throw new Error('后端未返回完整的面积统计')
  const aOnly=validateCompareGroup(response.aOnly,'A_ONLY')
  const second=operation==='coverage'?validateCompareGroup(response.both,'OVERLAP'):validateCompareGroup(response.bOnly,'B_ONLY')
  const summary:SpatialAnalysisSummary={...sources,areaA:response.areaA,areaB:response.areaB,overlapArea:response.both.areaSqm,onlyAArea:response.aOnly.areaSqm,onlyBArea:response.bOnly.areaSqm,diffArea:response.aOnly.areaSqm+response.bOnly.areaSqm,diffRate:response.areaA?(response.aOnly.areaSqm+response.bOnly.areaSqm)/response.areaA:null,minAreaSqm:response.minAreaSqm,crsUsed:response.crsUsed,featureCountA:counts.a,featureCountB:counts.b,spotCount:aOnly.features.length+second.features.length}
  if(operation==='difference')return {summary,data:annotateSpatialDifference({type:'FeatureCollection',features:[...aOnly.features,...second.features]},sources)}
  const retained=response.both.areaSqm+response.aOnly.areaSqm
  if(retained>response.areaA+Math.max(.05,response.areaA*1e-7))throw new Error('后端范围内与范围外面积超过上传总面积，请核对统计口径')
  summary.coverageRate=response.areaA?response.both.areaSqm/response.areaA:null
  summary.outsideRate=response.areaA?response.aOnly.areaSqm/response.areaA:null
  summary.unreturnedArea=Math.max(0,response.areaA-retained)
  const group=(data:SpatialCollection,kind:'INSIDE'|'OUTSIDE')=>data.features.map(feature=>({...feature,properties:{...feature.properties,analysisCoverage:kind,analysisSourceLayerName:sources.sourceA.layerName,analysisTargetLayerName:sources.sourceB.layerName,analysisMembership:kind==='INSIDE'?`位于${sources.sourceB.layerName}范围内`:`位于${sources.sourceB.layerName}范围外`}}))
  return {summary,data:{type:'FeatureCollection' as const,features:[...group(second,'INSIDE'),...group(aOnly,'OUTSIDE')]}}
}
