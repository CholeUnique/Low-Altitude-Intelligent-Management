import { getSpatialOverlayGeoJson,getSpatialOverlaySpots, type SpatialCollection, type SpatialDifferenceType, type SpatialField, type SpatialFilter, type SpatialGeometry, type SpatialOverlaySummary } from '@/api/spatial-analysis'

export const SPATIAL_DIFFERENCE_COLORS:Record<SpatialDifferenceType,string>={A_ONLY:'#ffb81c',B_ONLY:'#9b5cff'}
export function spatialDifferenceLabel(type:SpatialDifferenceType,summary:Pick<SpatialOverlaySummary,'sourceA'|'sourceB'>) {
  const source=type==='A_ONLY'?summary.sourceA:summary.sourceB
  const excluded=type==='A_ONLY'?summary.sourceB:summary.sourceA
  return `仅${source.layerName}（非${excluded.layerName}）`
}

export function spatialFilters(rows:{field:string;op:'EQ'|'IN';values:string}[],fields:SpatialField[]):SpatialFilter[] {
  return rows.map(row=>{
    if(!fields.some(field=>field.name===row.field))throw new Error('请为每条筛选条件选择有效字段')
    if(row.op!=='EQ'&&row.op!=='IN')throw new Error('筛选仅支持等于和集合内')
    const values=[...new Set(row.values.split(/\r?\n/).map(value=>value.trim()).filter(Boolean))]
    if(!values.length)throw new Error('请填写筛选值')
    if(row.op==='EQ'&&values.length!==1)throw new Error('“等于”条件只能填写一个值')
    if(row.op==='IN'&&values.length>50)throw new Error('“集合内”条件最多填写 50 个不同值')
    return {field:row.field,op:row.op,values}
  })
}
function polygon(geometry:unknown):geometry is SpatialGeometry {
  const value=geometry as SpatialGeometry|undefined
  const ring=(coordinates:unknown)=>Array.isArray(coordinates)&&coordinates.length>=4&&coordinates.every(position=>Array.isArray(position)&&position.length>=2&&position.slice(0,2).every(ordinate=>typeof ordinate==='number'&&Number.isFinite(ordinate)))
  const rings=(coordinates:unknown)=>Array.isArray(coordinates)&&coordinates.length>0&&coordinates.every(ring)
  return Boolean(value&&(value.type==='Polygon'?rings(value.coordinates):value.type==='MultiPolygon'&&Array.isArray(value.coordinates)&&value.coordinates.length>0&&value.coordinates.every(rings)))
}
function collection(value:SpatialCollection) {
  if(value?.type!=='FeatureCollection'||!Array.isArray(value.features)||value.features.some(feature=>feature.type!=='Feature'||!polygon(feature.geometry)))throw new Error('后端未返回有效的面图斑 GeoJSON')
  return value
}

/** 后端负责差分几何；一个结果图层保留 A_ONLY/B_ONLY 分类，不接收来源已被抹掉的 DIFF。 */
export function spatialDifferenceFeatures(data:SpatialCollection):SpatialCollection {
  collection(data)
  if(data.features.some(feature=>!['A_ONLY','B_ONLY'].includes(String(feature.properties?.diffType)))){
    const types=[...new Set(data.features.map(feature=>String(feature.properties?.diffType||'未标注类型')))].slice(0,5).join('、')
    throw new Error(`差分图层缺少有效的来源分类：merge=false 应返回 A_ONLY/B_ONLY，实际返回 ${types}；不能用 DIFF 或交集代替`)
  }
  if(data.features.some(feature=>typeof feature.properties?.areaSqm!=='number'||!Number.isFinite(feature.properties.areaSqm)||feature.properties.areaSqm<=0))throw new Error('后端返回了缺少有效正面积的差分图斑，请检查零面积碎片及面积字段')
  return data
}
/** 只补充图层来源元数据，几何和后端统计均原样保留，不在浏览器计算差分。 */
export function annotateSpatialDifference(data:SpatialCollection,summary:Pick<SpatialOverlaySummary,'sourceA'|'sourceB'>):SpatialCollection {
  spatialDifferenceFeatures(data)
  return {...data,features:data.features.map(feature=>{
    const type=feature.properties!.diffType as SpatialDifferenceType
    const source=type==='A_ONLY'?summary.sourceA:summary.sourceB
    const excluded=type==='A_ONLY'?summary.sourceB:summary.sourceA
    return {...feature,properties:{...feature.properties,analysisSourceSide:type==='A_ONLY'?'A':'B',analysisSourceLayerName:source.layerName,analysisExcludedLayerName:excluded.layerName,analysisSourceServiceId:String(source.serviceId),analysisSourceLayerId:source.layerId,analysisMembership:spatialDifferenceLabel(type,summary)}}
  })}
}
/** Failed or unclassified geometry remains an error; do not silently fall back to merged geometry. */
export async function loadSpatialOverlayResult(resultId:string,deptId?:string,options:{signal?:AbortSignal}={}):Promise<SpatialCollection> {
  const data=await getSpatialOverlayGeoJson(resultId,deptId,{signal:options.signal})
  try{return spatialDifferenceFeatures(data)}
  catch(error){throw new Error(`读取差分来源图层失败（POST /api/v1/spatial/overlay/geojson，merge=false，结果 ${resultId}）：${error instanceof Error?error.message:'后端结果格式无效'}`)}
}
/** 分页接口与 GeoJSON 接口读取同一结果；仅导出超限时切换，不回退到另一种计算或合并几何。 */
export async function loadSpatialOverlayFeatures(summary:SpatialOverlaySummary,deptId?:string,options:{signal?:AbortSignal;progress?:(loaded:number,total:number)=>void}={}):Promise<SpatialCollection>{
  const {resultId,spotCount}=summary
  if(!Number.isInteger(spotCount)||spotCount<0)throw new Error('后端未返回有效的结果图斑总数')
  if(spotCount<=5000){
    try{const data=collection(await getSpatialOverlayGeoJson(resultId,deptId,{signal:options.signal}));if(data.features.length!==spotCount)throw new Error(`结果 ${resultId} 图斑返回不完整`);options.progress?.(spotCount,spotCount);return data}
    catch(error){if(String((error as {code?:string})?.code)!=='10707')throw error}
  }
  const data:SpatialCollection={type:'FeatureCollection',features:[]},seen=new Set<number>()
  for(let page=1;page<=Math.max(1,Math.ceil(spotCount/200));page++){
    options.signal?.throwIfAborted()
    const chunk=await getSpatialOverlaySpots(resultId,page,deptId,{signal:options.signal})
    if(chunk.total!==spotCount||!Array.isArray(chunk.records)||chunk.records.length!==Math.min(200,spotCount-data.features.length))throw new Error(`结果 ${resultId} 分页数量不完整，请检查后端返回`)
    for(const spot of chunk.records){
      if(!Number.isInteger(spot.seqNo)||seen.has(spot.seqNo))throw new Error(`结果 ${resultId} 分页图斑编号重复或无效`)
      seen.add(spot.seqNo)
      const {geometry,...properties}=spot
      data.features.push({type:'Feature',geometry,properties})
    }
    options.progress?.(data.features.length,spotCount)
  }
  return collection(data)
}
