import type { SpatialCollection, SpatialSource } from '@/api/spatial-analysis'
import { compareSpatialGeometries } from '@/api/spatial-analysis'
import type { RegionClipRequest } from '@/api/region-clip'
import { runRegionClip, regionClipKey } from './region-clip'
import { geometryRequestInputs } from './spatial-geometry-input'
import { geometryAnalysisResult, validateCompareGroup } from './spatial-geometry-result'

/** Administrative boundaries are unioned and clipped on the server, never replaced by bbox filtering. */
export async function compareFarmlandRegions(request:RegionClipRequest,minAreaSqm:number,sources:{sourceA:SpatialSource;sourceB:SpatialSource},options:{signal:AbortSignal;progress?:(percent:number)=>void;stage?:(message:string)=>void},dependencies={clip:runRegionClip,compare:compareSpatialGeometries}) {
  if(!request.regions.length||request.regions.some(region=>!region.objectIds.length)||request.targets.length!==2)throw new Error('请选择有效行政区划及两个基准图层')
  options.stage?.('正在按所选行政边界裁切两类基准图层…')
  const clipped=await dependencies.clip(request,{signal:options.signal,progress:status=>{if(status.progress!=null)options.progress?.(status.progress*.5)}})
  options.signal.throwIfAborted()
  const inputs=request.targets.map(target=>{
    const layer=clipped.layers.find(layer=>regionClipKey(layer)===regionClipKey(target))
    if(layer?.status!=='SUCCEEDED'||!layer.data)throw new Error(layer?.error||'行政区基准图层裁切未成功，不使用未裁切数据分析')
    return layer.data as SpatialCollection
  })
  const [high,permanent]=inputs as [SpatialCollection,SpatialCollection]
  const empty=():SpatialCollection=>({type:'FeatureCollection',features:[]})
  options.stage?.('后端正在对比所选行政区内的高标田与永农…')
  if(!high.features.length&&!permanent.features.length){
    options.progress?.(100)
    return {data:empty(),summary:{...sources,areaA:0,areaB:0,overlapArea:0,onlyAArea:0,onlyBArea:0,diffArea:0,diffRate:null,minAreaSqm,crsUsed:'EPSG:4326',featureCountA:0,featureCountB:0,spotCount:0}}
  }
  // A single nonempty side is compared with itself so its area is still computed by the backend.
  const response=await dependencies.compare({...geometryRequestInputs(high.features.length?high:permanent,permanent.features.length?permanent:high),minAreaSqm},{signal:options.signal,deptId:request.deptId,progress:percent=>options.progress?.(50+percent*.5)})
  options.signal.throwIfAborted()
  if(!high.features.length||!permanent.features.length){
    const only=validateCompareGroup(response.both,'OVERLAP'),kind=high.features.length?'A_ONLY':'B_ONLY'
    const group={...response.both,featureCollection:{...only,features:only.features.map(feature=>({...feature,properties:{...feature.properties,diffType:kind}}))}}
    const none={areaSqm:0,spotCount:0,featureCollection:empty()}
    response.areaA=high.features.length?response.areaA:0;response.areaB=permanent.features.length?response.areaB:0
    response.aOnly=high.features.length?group:none;response.bOnly=permanent.features.length?group:none;response.both=none
  }
  const result=geometryAnalysisResult(response,'difference',sources,{a:high.features.length,b:permanent.features.length})
  const overlap=validateCompareGroup(response.both,'OVERLAP')
  const data:SpatialCollection={type:'FeatureCollection',features:[...result.data.features,...overlap.features]}
  options.progress?.(100)
  return {data,summary:{...result.summary,spotCount:data.features.length}}
}
