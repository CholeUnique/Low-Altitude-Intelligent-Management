import type { SpatialCompleteStatistics, SpatialGeometryCompare } from '@/api/spatial-analysis'
import type { AnalysisStatistic } from './farmland-analysis'
import type { SpatialAnalysisSummary } from './spatial-geometry-result'

/** Main panel retains the output threshold; the separate comparison uses complete backend statistics. */
export function filteredOverlaySummary<T extends SpatialAnalysisSummary>(summary:T):T {
  const statistics=summary.statistics
  if(statistics?.status!=='SUCCEEDED')return summary
  const output=(kind:string)=>statistics.categories.find(item=>item.category===kind)?.outputAreaSqm
  const a=output('A_ONLY'),b=output('B_ONLY'),overlap=output('OVERLAP')
  if(a==null||b==null||![a,b,overlap??0].every(value=>Number.isFinite(value)&&value>=0))throw new Error('后端未返回有效的阈值过滤统计')
  return {...summary,onlyAArea:a,onlyBArea:b,overlapArea:overlap??summary.overlapArea,diffArea:a+b,diffRate:summary.areaA?(a+b)/summary.areaA:null}
}

export function completeAnalysisMetrics(statistics:SpatialCompleteStatistics|undefined,farmland:boolean,coverage=false):AnalysisStatistic[]|undefined {
  if(statistics?.status!=='SUCCEEDED'||statistics.areaUnit!=='SQM')return
  const full=statistics.complete
  if(!full||![full.areaA,full.areaB,full.overlapArea,full.onlyAArea,full.onlyBArea,full.diffArea].every(value=>Number.isFinite(value)&&value>=0))return
  if(coverage)return [{label:'上传范围总面积',areaSqm:full.areaA},{label:'范围内面积',areaSqm:full.overlapArea},{label:'范围外面积',areaSqm:full.onlyAArea},{label:'范围内占比',ratio:full.areaA?full.overlapArea/full.areaA:null},{label:'范围外占比',ratio:full.areaA?full.onlyAArea/full.areaA:null}]
  return [
    {label:farmland?'高标田面积':'A 图层面积',areaSqm:full.areaA},
    {label:farmland?'永农面积':'B 图层面积',areaSqm:full.areaB},
    {label:farmland?'高标田中非永农部分':'A 中非 B 面积',areaSqm:full.onlyAArea},
    {label:farmland?'永农中非高标田部分':'B 中非 A 面积',areaSqm:full.onlyBArea},
    {label:farmland?'两者同时满足部分':'重叠面积',areaSqm:full.overlapArea},
    {label:'差异面积',areaSqm:full.diffArea},{label:'差异率',ratio:full.diffRate},
  ]
}

/** Compatibility for geometry comparison endpoints: only a zero-threshold backend result is complete. */
export function zeroThresholdStatistics(response:SpatialGeometryCompare):SpatialCompleteStatistics {
  if(response.minAreaSqm!==0)throw new Error('完整统计必须来自零面积过滤的后端计算')
  const a=response.aOnly.areaSqm,b=response.bOnly.areaSqm,overlap=response.both.areaSqm
  return {status:'SUCCEEDED',areaUnit:'SQM',complete:{areaA:response.areaA,areaB:response.areaB,onlyAArea:a,onlyBArea:b,overlapArea:overlap,diffArea:a+b,diffRate:response.areaA?(a+b)/response.areaA:null},categories:[]}
}
