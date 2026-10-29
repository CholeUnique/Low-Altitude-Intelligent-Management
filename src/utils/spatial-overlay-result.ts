import { getSpatialOverlayGeoJson, type SpatialCollection, type SpatialField, type SpatialFilter, type SpatialGeometry } from '@/api/spatial-analysis'

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

/** Accept only the server's merged result. Never substitute categorized source-exclusive spots. */
export function spatialDifferenceFeatures(data:SpatialCollection):SpatialCollection {
  collection(data)
  if(!data.features.length)throw new Error('未获取到独立的不重叠区域图层：后端返回空结果，请检查是否存在满足面积阈值的差异区域')
  if(data.features.length!==1||data.features[0]?.properties?.diffType!=='DIFF'){
    const types=[...new Set(data.features.map(feature=>String(feature.properties?.diffType||'未标注类型')))].slice(0,5).join('、')
    throw new Error(`未获取到独立的不重叠区域图层：merge=true 应返回单个 DIFF 要素，实际返回 ${data.features.length} 个 ${types} 要素；不会使用 A_ONLY/B_ONLY 替代显示，请后端检查合并结果`)
  }
  return data
}
/** Missing/failed merged geometry is an error, even if statistics or spot paging succeed. */
export async function loadSpatialOverlayResult(resultId:string,deptId?:string,options:{signal?:AbortSignal}={}):Promise<SpatialCollection> {
  const data=await getSpatialOverlayGeoJson(resultId,deptId,{signal:options.signal})
  try{return spatialDifferenceFeatures(data)}
  catch(error){throw new Error(`读取不重叠区域图层失败（POST /api/v1/spatial/overlay/geojson，merge=true，结果 ${resultId}）：${error instanceof Error?error.message:'后端结果格式无效'}`)}
}
