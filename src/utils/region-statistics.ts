import { compareSpatialGeometries,type SpatialCollection } from '@/api/spatial-analysis'
import { geometryRequestInputs,spatialGeometryExtent } from './spatial-geometry-input'
export interface RegionStatistic {areaSqm:number;highAreaSqm:number;permanentAreaSqm:number;overlapAreaSqm:number;onlyHighAreaSqm:number;onlyPermanentAreaSqm:number;diffRate:number|null}
export interface RegionStatisticRow {id:string;name:string;status:'RUNNING'|'SUCCEEDED'|'FAILED';value?:RegionStatistic;error?:string}
export interface RegionGeometry {id:string;name:string;data:SpatialCollection}
const bounds=new WeakMap<object,ReturnType<typeof spatialGeometryExtent>>()
function candidates(data:SpatialCollection,region:SpatialCollection):SpatialCollection{
  const extent=spatialGeometryExtent(region)
  return {...data,features:data.features.filter(feature=>{
    let box=bounds.get(feature)
    if(!box){box=spatialGeometryExtent({type:'FeatureCollection',features:[feature]});bounds.set(feature,box)}
    return box.east>=extent.west&&box.west<=extent.east&&box.north>=extent.south&&box.south<=extent.north
  })}
}
/** 包围盒仅排除不可能相交的候选，面积与精确相交全部由后端计算。 */
export async function calculateRegionStatistic(region:SpatialCollection,high:SpatialCollection,permanent:SpatialCollection,signal:AbortSignal,compare:typeof compareSpatialGeometries=compareSpatialGeometries,deptId?:string,progress?:(percent:number)=>void):Promise<RegionStatistic>{
  const parts=[0,0,0],publish=()=>progress?.(parts[0]!*.35+parts[1]!*.35+parts[2]!*.3)
  const stages=['区划与高标田叠加','区划与永农叠加','高标田与永农重叠统计']
  const invoke=async(a:SpatialCollection,b:SpatialCollection,slot:number)=>{
    signal.throwIfAborted()
    try{
      const result=await compare({...geometryRequestInputs(a,b),minAreaSqm:0},{signal,deptId,progress:value=>{parts[slot]=Math.max(parts[slot]!,value);publish()}})
      signal.throwIfAborted();if(!Number.isFinite(result.areaA)||result.areaA<0||!Number.isFinite(result.both?.areaSqm)||result.both.areaSqm<0)throw new Error('后端未返回有效的区域统计面积');parts[slot]=100;publish();return result
    }catch(error){signal.throwIfAborted();throw new Error(`${a===region&&b===region?'区划总面积计算':stages[slot]}失败：${error instanceof Error?error.message:'后端未提供具体原因'}`)}
  }
  const h=candidates(high,region),p=candidates(permanent,region)
  if(!h.features.length)parts[0]=100
  if(!p.features.length)parts[1]=100
  const [hr,pr]=await Promise.all([h.features.length?invoke(region,h,0):undefined,p.features.length?invoke(region,p,1):undefined])
  const areaSqm=hr?.areaA??pr?.areaA??(await invoke(region,region,2)).areaA
  const highAreaSqm=hr?.both.areaSqm||0,permanentAreaSqm=pr?.both.areaSqm||0
  let overlapAreaSqm=0,onlyHighAreaSqm=highAreaSqm,onlyPermanentAreaSqm=permanentAreaSqm
  if(highAreaSqm&&permanentAreaSqm){
    const result=await invoke(hr!.both.featureCollection,pr!.both.featureCollection,2)
    overlapAreaSqm=result.both.areaSqm
    onlyHighAreaSqm=result.aOnly.areaSqm;onlyPermanentAreaSqm=result.bOnly.areaSqm
  }
  if(overlapAreaSqm>Math.min(highAreaSqm,permanentAreaSqm)+.05)throw new Error('后端区域重叠统计超过基准面积')
  if(![onlyHighAreaSqm,onlyPermanentAreaSqm].every(value=>Number.isFinite(value)&&value>=0))throw new Error('后端未返回有效的独有区域面积')
  progress?.(100)
  return {areaSqm,highAreaSqm,permanentAreaSqm,overlapAreaSqm,onlyHighAreaSqm,onlyPermanentAreaSqm,diffRate:highAreaSqm?(onlyHighAreaSqm+onlyPermanentAreaSqm)/highAreaSqm:null}
}
