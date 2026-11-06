import type { SpatialCollection, SpatialGeometryCompare, SpatialInput, SpatialOverlaySummary, SpatialSource } from '@/api/spatial-analysis'
import { validateCompareGroup } from './spatial-geometry-result'
import { geometryRequestInputs } from './spatial-geometry-input'

export type FarmlandGroupKind = 'A_ONLY' | 'B_ONLY' | 'OVERLAP' | 'NEITHER'
export interface FarmlandPartition { kind:FarmlandGroupKind; name:string; color:string; areaSqm:number; data:SpatialCollection; sources:string[] }
export interface AnalysisStatistic { label:string; areaSqm?:number; ratio?:number|null }
export interface AnalysisStatistics { id:string; title:string; sources:string[]; metrics:AnalysisStatistic[] }
const colors:Record<FarmlandGroupKind,string> = {A_ONLY:'#ffb81c',B_ONLY:'#9b5cff',OVERLAP:'#00e6a0',NEITHER:'#ff8238'}
const empty = ():SpatialCollection => ({type:'FeatureCollection',features:[]})
const area = (data:SpatialCollection) => data.features.reduce((sum,feature)=>sum+Number(feature.properties?.areaSqm||0),0)
function partition(kind:FarmlandGroupKind,name:string,data:SpatialCollection,sources:string[]):FarmlandPartition {
  return {kind,name,color:colors[kind],areaSqm:area(data),sources,data:{...data,features:data.features.map(feature=>({...feature,properties:{...feature.properties,analysisMembership:name,analysisSourceLayerName:sources.join('、'),analysisGroup:kind}}))}}
}

/** Resolve the three real sublayers from the canonical service, never conflate 高标 with 高标准. */
export function farmlandDefaults<T extends {key:string;sourceName:string;role:string;service:{name:string}}>(layers:T[]) {
  const canonical = layers.filter(item=>item.sourceName.replace(/\s/g,'')==='九龙镇高标准农田数据')
  const candidates = canonical.length ? canonical : layers.filter(item=>/九龙镇.*高标准农田/.test(item.sourceName))
  const a = candidates.find(item=>item.role!=='permanent'&&item.role!=='boundary'&&/高标准农田|高标田|GBZ/i.test(item.service.name))
  const b = candidates.find(item=>item.role==='permanent'||/永久基本农田/.test(item.service.name))
  const boundary = candidates.find(item=>item.role==='boundary'||/行政区/.test(item.service.name))
  const input = (item:T|undefined):SpatialInput|undefined => item && /^\d+$/.test(item.key.split('/')[1]||'') ? {serviceId:item.key.split('/')[0]!,layerId:Number(item.key.split('/')[1]),filters:[]} : undefined
  return {a:input(a),b:input(b),keys:[a?.key,b?.key,boundary?.key].filter((key):key is string=>!!key)}
}

/** Split only the actual backend output; an absent intersection is an error, never fabricated geometry. */
export function splitFarmlandOverlay(data:SpatialCollection,summary:SpatialOverlaySummary) {
  if(![summary.onlyAArea,summary.onlyBArea,summary.overlapArea,summary.diffArea,summary.minAreaSqm].every(value=>Number.isFinite(value)&&value>=0)||!Number.isInteger(summary.spotCount)||summary.spotCount<0)throw new Error('后端未返回完整有效的分析统计')
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length!==summary.spotCount)throw new Error('后端分析图斑返回不完整，请检查含交集的结果输出')
  const groups = new Map<FarmlandGroupKind,GeoJSON.Feature<GeoJSON.Polygon|GeoJSON.MultiPolygon>[]>([['A_ONLY',[]],['B_ONLY',[]],['OVERLAP',[]]])
  for(const feature of data.features){
    const kind = String(feature.properties?.diffType) as FarmlandGroupKind
    if(!groups.has(kind)||!feature.geometry||!['Polygon','MultiPolygon'].includes(feature.geometry.type)||typeof feature.properties?.areaSqm!=='number'||!Number.isFinite(feature.properties.areaSqm)||feature.properties.areaSqm<=0)throw new Error('后端未返回有效的高标田、永农及交集分类图斑')
    groups.get(kind)!.push(feature)
  }
  const collection = (kind:FarmlandGroupKind):SpatialCollection => ({type:'FeatureCollection',features:groups.get(kind)!})
  for(const [kind,expected] of [['A_ONLY',summary.onlyAArea],['B_ONLY',summary.onlyBArea]] as const){
    if(Math.abs(area(collection(kind))-expected)>Math.max(.05,data.features.length*.00011))throw new Error('后端独有区域统计与返回图斑不一致')
  }
  if(summary.overlapArea>summary.minAreaSqm&&!groups.get('OVERLAP')!.length)throw new Error('后端未返回两者同时满足的交集图斑，请检查 includeOverlapSpots=true 的结果')
  if(area(collection('OVERLAP'))>summary.overlapArea+Math.max(.05,data.features.length*.00011))throw new Error('后端交集图斑面积超过交集统计，请检查结果')
  return [partition('A_ONLY','高标田中非永农部分',collection('A_ONLY'),[summary.sourceA.layerName]),partition('B_ONLY','永农中非高标田部分',collection('B_ONLY'),[summary.sourceB.layerName]),partition('OVERLAP','两者同时满足部分',collection('OVERLAP'),[summary.sourceA.layerName,summary.sourceB.layerName])]
}

/** Three backend clips partition U by both datasets. No browser topology calculation or whole-feature classification. */
export async function partitionUploadedRange(upload:SpatialCollection,high:SpatialCollection,permanent:SpatialCollection,minAreaSqm:number,sources:{high:SpatialSource;permanent:SpatialSource;uploadName:string},compare:(input:{geometryA:SpatialCollection;geometryB:SpatialCollection;minAreaSqm:number})=>Promise<SpatialGeometryCompare>,check:()=>void=()=>{}) {
  const first = await compare({...geometryRequestInputs(upload,high),minAreaSqm});check()
  const inHigh = validateCompareGroup(first.both,'OVERLAP'),outsideHigh = validateCompareGroup(first.aOnly,'A_ONLY')
  const split = async (data:SpatialCollection) => {
    if(!data.features.length)return {inside:empty(),outside:empty()}
    const result = await compare({...geometryRequestInputs(data,permanent),minAreaSqm});check()
    return {inside:validateCompareGroup(result.both,'OVERLAP'),outside:validateCompareGroup(result.aOnly,'A_ONLY')}
  }
  const [inside,outside] = await Promise.all([split(inHigh),split(outsideHigh)]);check()
  const partitions = [partition('B_ONLY','仅在永农范围内部分',outside.inside,[sources.permanent.layerName]),partition('A_ONLY','仅在高标田范围内部分',inside.outside,[sources.high.layerName]),partition('OVERLAP','同时满足部分',inside.inside,[sources.high.layerName,sources.permanent.layerName]),partition('NEITHER','同时不满足部分',outside.outside,[`${sources.uploadName}（不属于高标田、永农）`])]
  if(partitions.reduce((sum,item)=>sum+item.areaSqm,0)>first.areaA+Math.max(.05,first.areaA*1e-7))throw new Error('后端四类裁切面积超过上传范围，请检查结果')
  return {partitions,areaSqm:first.areaA,crsUsed:first.crsUsed}
}
