import type { SpatialCollection, SpatialGeometryCompare, SpatialInput, SpatialOverlaySummary, SpatialSource } from '@/api/spatial-analysis'
import { validateCompareGroup } from './spatial-geometry-result'
import { geometryRequestInputs } from './spatial-geometry-input'

export type FarmlandGroupKind = 'A_ONLY' | 'B_ONLY' | 'OVERLAP' | 'NEITHER' | 'IN_HIGH' | 'IN_PERMANENT'
export interface FarmlandPartition { kind:FarmlandGroupKind; name:string; color:string; areaSqm:number; data:SpatialCollection; sources:string[]; aggregate?:boolean }
export interface AnalysisStatistic { label:string; areaSqm?:number; ratio?:number|null }
export interface AnalysisStatistics { id:string; title:string; sources:string[]; metrics:AnalysisStatistic[]; fullMetrics?:AnalysisStatistic[]; fullError?:string }
const colors:Record<FarmlandGroupKind,string> = {A_ONLY:'#ffb81c',B_ONLY:'#9b5cff',OVERLAP:'#00e6a0',NEITHER:'#ff8238',IN_HIGH:'#25cce5',IN_PERMANENT:'#6f9cff'}
const empty = ():SpatialCollection => ({type:'FeatureCollection',features:[]})
const area = (data:SpatialCollection) => data.features.reduce((sum,feature)=>sum+Number(feature.properties?.areaSqm||0),0)
function partition(kind:FarmlandGroupKind,name:string,data:SpatialCollection,sources:string[],areaSqm=area(data)):FarmlandPartition {
  return {kind,name,color:colors[kind],areaSqm,sources,data:{...data,features:data.features.map(feature=>({...feature,properties:{...feature.properties,analysisMembership:name,analysisSourceLayerName:sources.join('、'),analysisGroup:kind}}))}}
}

const normalizeLayerName = (name:string) => name.replace(/\s/g,'')

/** Resolve the four default sublayers from the canonical 海陵区高标准农田 service. */
export function farmlandDefaults<T extends {key:string;sourceName:string;role:string;service:{name:string}}>(layers:T[]) {
  const canonical = layers.filter(item=>normalizeLayerName(item.sourceName)==='海陵区高标准农田')
  const candidates = canonical.length ? canonical : layers.filter(item=>/海陵区.*高标准农田/.test(normalizeLayerName(item.sourceName)))
  const named = (name:string) => candidates.find(item=>normalizeLayerName(item.service.name)===name)
  const a = named('高标地块_海陵区')
    || candidates.find(item=>item.role!=='permanent'&&item.role!=='boundary'&&/高标(?:准)?(?:农田)?地块|高标准农田|GBZ/i.test(item.service.name))
  const b = named('永久基本农田_海陵区')
    || candidates.find(item=>item.role==='permanent'||/永久基本农田/.test(item.service.name))
  const township = named('乡级行政区划')
  const village = named('村级行政区划')
  const boundary = township || village || candidates.find(item=>item.role==='boundary'||/行政区/.test(item.service.name))
  const input = (item:T|undefined):SpatialInput|undefined => item && /^\d+$/.test(item.key.split('/')[1]||'') ? {serviceId:item.key.split('/')[0]!,layerId:Number(item.key.split('/')[1]),filters:[]} : undefined
  return {
    a:input(a),b:input(b),boundary:input(boundary),initialKeys:boundary?[boundary.key]:[],
    keys:[b?.key,township?.key,a?.key,village?.key].filter((key):key is string=>!!key),
  }
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
  for(const [kind,legacy] of [['A_ONLY',summary.onlyAArea],['B_ONLY',summary.onlyBArea]] as const){
    const expected=summary.statistics?.categories?.find(item=>item.category===kind)?.outputAreaSqm??legacy
    if(Math.abs(area(collection(kind))-expected)>Math.max(.05,data.features.length*.00011))throw new Error('后端独有区域统计与返回图斑不一致')
  }
  const overlapOutput=summary.statistics?.categories?.find(item=>item.category==='OVERLAP')
  if((overlapOutput?overlapOutput.outputCount>0:summary.overlapArea>summary.minAreaSqm)&&!groups.get('OVERLAP')!.length)throw new Error('后端未返回两者同时满足的交集图斑，请检查 includeOverlapSpots=true 的结果')
  if(overlapOutput&&Math.abs(area(collection('OVERLAP'))-overlapOutput.outputAreaSqm)>Math.max(.05,data.features.length*.00011))throw new Error('后端交集统计与返回图斑不一致')
  if(area(collection('OVERLAP'))>summary.overlapArea+Math.max(.05,data.features.length*.00011))throw new Error('后端交集图斑面积超过交集统计，请检查结果')
  return [partition('A_ONLY','高标田中非永农部分',collection('A_ONLY'),[summary.sourceA.layerName]),partition('B_ONLY','永农中非高标田部分',collection('B_ONLY'),[summary.sourceB.layerName]),partition('OVERLAP','两者同时满足部分',collection('OVERLAP'),[summary.sourceA.layerName,summary.sourceB.layerName])]
}

/** Three backend clips partition U by both datasets. No browser topology calculation or whole-feature classification. */
export async function partitionUploadedRange(upload:SpatialCollection,high:SpatialCollection,permanent:SpatialCollection,minAreaSqm:number,sources:{high:SpatialSource;permanent:SpatialSource;uploadName:string},compare:(input:{geometryA:SpatialCollection;geometryB:SpatialCollection;minAreaSqm:number})=>Promise<SpatialGeometryCompare>,check:()=>void=()=>{}) {
  const first = await compare({...geometryRequestInputs(upload,high.features.length?high:upload),minAreaSqm});check()
  if(!Number.isFinite(first.areaA)||first.areaA<0)throw new Error('后端未返回有效的上传范围总面积')
  if(!high.features.length){first.aOnly={...first.both,featureCollection:{...first.both.featureCollection,features:first.both.featureCollection.features.map(feature=>({...feature,properties:{...feature.properties,diffType:'A_ONLY'}}))}};first.both={areaSqm:0,spotCount:0,featureCollection:empty()}}
  const inHigh = validateCompareGroup(first.both,'OVERLAP'),outsideHigh = validateCompareGroup(first.aOnly,'A_ONLY')
  const split = async (data:SpatialCollection) => {
    if(!data.features.length)return {inside:empty(),outside:empty(),insideArea:0,outsideArea:0,inputArea:0,crs:first.crsUsed}
    const result = await compare({...geometryRequestInputs(data,permanent.features.length?permanent:data),minAreaSqm});check()
    if(!Number.isFinite(result.areaA)||result.areaA<0)throw new Error('后端未返回有效的分阶段范围面积')
    if(!permanent.features.length)return {inside:empty(),outside:validateCompareGroup(result.both,'OVERLAP'),insideArea:0,outsideArea:result.both.areaSqm,inputArea:result.areaA,crs:result.crsUsed}
    return {inside:validateCompareGroup(result.both,'OVERLAP'),outside:validateCompareGroup(result.aOnly,'A_ONLY'),insideArea:result.both.areaSqm,outsideArea:result.aOnly.areaSqm,inputArea:result.areaA,crs:result.crsUsed}
  }
  const [inside,outside] = await Promise.all([split(inHigh),split(outsideHigh)]);check()
  // Use validated backend group totals, not sums of individually rounded spot areas.
  const atoms = [partition('A_ONLY','仅高标非永农',inside.outside,[sources.high.layerName],inside.outsideArea),partition('B_ONLY','仅永农非高标',outside.inside,[sources.permanent.layerName],outside.insideArea),partition('OVERLAP','同时满足',inside.inside,[sources.high.layerName,sources.permanent.layerName],inside.insideArea),partition('NEITHER','都不满足',outside.outside,[`${sources.uploadName}（不属于高标田、永农）`],outside.outsideArea)]
  atoms.forEach(group => group.data.features.forEach((feature,index) => { feature.properties!.coverageAtom = `${group.kind}:${index}` }))
  const combine = (kind:FarmlandGroupKind,name:string,members:FarmlandGroupKind[],source:string):FarmlandPartition => {const selected=atoms.filter(item=>members.includes(item.kind));return {...partition(kind,name,{type:'FeatureCollection',features:selected.flatMap(item=>item.data.features)},[source],selected.reduce((sum,item)=>sum+item.areaSqm,0)),aggregate:true}}
  // 汇总分类仅复用后端裁切结果，保留四个互斥原子区域，面积和导出不重复相加。
  const partitions = [combine('IN_HIGH','高标范围内（含重叠）',['A_ONLY','OVERLAP'],sources.high.layerName),combine('IN_PERMANENT','永农范围内（含重叠）',['B_ONLY','OVERLAP'],sources.permanent.layerName),...atoms]
  const numericTolerance=(inputArea:number)=>Math.max(.05,inputArea*1e-7)
  const stages=[{name:'高标范围内',source:first.both.areaSqm,...inside},{name:'高标范围外',source:first.aOnly.areaSqm,...outside}]
  // A chained operation exports WGS84 geometry then projects/repairs it again.
  // Accept only measured input drift bounded by 2 ppm (absolute floor 0.05㎡).
  // Never rescale backend statistics or allow a stage to duplicate its own input.
  for(const stage of stages){
    const drift=Math.abs(stage.inputArea-stage.source),limit=Math.max(.05,stage.source*2e-6)
    if(drift>limit||(stage.source>0&&stage.crs!==first.crsUsed))throw new Error(`范围覆盖面积校验未通过：${stage.name}再次输入面积由 ${stage.source}㎡变为 ${stage.inputArea}㎡，超过坐标转换容差 ${limit}㎡或投影不一致（${first.crsUsed} / ${stage.crs}），请检查后端几何转换`)
  }
  const total=atoms.reduce((sum,item)=>sum+item.areaSqm,0)
  const inheritedDrift=stages.reduce((sum,stage)=>sum+Math.max(0,stage.inputArea-stage.source),0)
  const tolerance=numericTolerance(first.areaA)+inheritedDrift
  if(total>first.areaA+tolerance){
    const number=(value:number)=>value.toLocaleString('zh-CN',{maximumFractionDigits:6})
    throw new Error(`范围覆盖面积校验未通过：上传范围 ${number(first.areaA)}㎡，四类合计 ${number(total)}㎡，超出 ${number(total-first.areaA)}㎡（容差 ${number(tolerance)}㎡）。${atoms.map(item=>`${item.name} ${number(item.areaSqm)}㎡`).join('；')}。分阶段输入面积：高标范围内 ${number(first.both.areaSqm)}→${number(inside.inputArea)}㎡，范围外 ${number(first.aOnly.areaSqm)}→${number(outside.inputArea)}㎡；投影 ${first.crsUsed} / ${inside.crs} / ${outside.crs}`)
  }
  if(first.both.areaSqm+first.aOnly.areaSqm>first.areaA+numericTolerance(first.areaA))throw new Error('范围覆盖面积校验未通过：第一轮高标范围内、外面积超过上传范围，请检查后端裁切结果')
  for(const stage of stages){
    if(stage.insideArea+stage.outsideArea>stage.inputArea+numericTolerance(stage.inputArea))throw new Error(`范围覆盖面积校验未通过：${stage.name}本轮输出 ${stage.insideArea+stage.outsideArea}㎡超过本轮输入 ${stage.inputArea}㎡，请检查后端裁切结果`)
  }
  return {partitions,areaSqm:first.areaA,crsUsed:first.crsUsed}
}
