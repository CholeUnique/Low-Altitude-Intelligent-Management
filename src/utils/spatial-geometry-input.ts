import { arcgisToGeoJSON } from '@terraformer/arcgis'
import { getMapServiceLayerMetadata, queryMapServiceFeatures } from './map-service-layer'
import { assertTopicGeometry, SHP_MAX_FEATURES, uploadIsPolygon } from './topic-upload'
import type { MapServiceItem } from '@/api/map-service'
import type { SpatialCollection, SpatialFilter } from '@/api/spatial-analysis'

export function spatialAttributeWhere(filters:SpatialFilter[],fields:{name?:string;type?:string}[]) {
  return filters.map(filter=>{
    const field=fields.find(field=>field.name===filter.field)
    if(!field||!['EQ','IN'].includes(filter.op)||!filter.values.length||filter.values.length>50||filter.op==='EQ'&&filter.values.length!==1)throw new Error('属性筛选字段或条件无效')
    const numeric=/Integer|Double|Single|OID|SmallInteger|BigInteger|^number$/i.test(field.type||'')
    const values=filter.values.map(value=>{
      if(numeric){const raw=value.trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)||!Number.isFinite(Number(raw)))throw new Error(`${filter.field} 需要数值筛选值`);return raw}
      return `'${value.replace(/'/g,"''")}'`
    })
    const name=`"${filter.field.replace(/"/g,'""')}"`
    return filter.op==='EQ'?`${name} = ${values[0]}`:`${name} IN (${values.join(',')})`
  }).map(clause=>`(${clause})`).join(' AND ')||'1=1'
}
export function filterUploadedGeometry(data:GeoJSON.FeatureCollection,filters:SpatialFilter[]):SpatialCollection {
  if(!uploadIsPolygon(data))throw new Error('只有面图层可以参与面积分析')
  const names=new Set(data.features.flatMap(feature=>Object.keys(feature.properties||{})))
  if(filters.some(filter=>!names.has(filter.field)))throw new Error('上传图层不存在所选筛选字段')
  const features=data.features.filter(feature=>filters.every(filter=>filter.values.some(value=>{
    const actual=feature.properties?.[filter.field]
    return actual!=null&&(typeof actual==='number'?Number.isFinite(Number(value))&&actual===Number(value):String(actual)===value)
  })))
  if(!features.length)throw new Error('属性筛选后没有可分析的面要素')
  return {...data,features}
}
export async function readPublishedSpatialGeometry(service:MapServiceItem,filters:SpatialFilter[],signal:AbortSignal):Promise<SpatialCollection> {
  signal.throwIfAborted()
  const metadata=await getMapServiceLayerMetadata(service)
  signal.throwIfAborted()
  const fields=metadata.fields||[],oid=fields.find(field=>field.type==='esriFieldTypeOID')?.name||fields.find(field=>field.name)?.name
  if(!oid)throw new Error('发布图层没有可查询的字段')
  const response=await queryMapServiceFeatures(service,[oid],spatialAttributeWhere(filters,fields),true,{signal,maxFeatures:SHP_MAX_FEATURES})
  signal.throwIfAborted()
  const features=response.features.map(feature=>arcgisToGeoJSON(feature,oid))
  const data:GeoJSON.FeatureCollection={type:'FeatureCollection',features}
  assertTopicGeometry(data)
  if(!uploadIsPolygon(data))throw new Error('所选发布图层不是完整的面图层')
  return data
}
export function geometryRequestInputs(a:SpatialCollection,b:SpatialCollection) {
  assertTopicGeometry(a);assertTopicGeometry(b)
  // 属性在本机图层保留；分析接口只需要完整几何，减少请求体和不必要的属性传输。
  const geometry=(data:SpatialCollection):SpatialCollection=>({type:'FeatureCollection',features:data.features.map(feature=>({type:'Feature',geometry:feature.geometry,properties:{}}))})
  const geometryA=geometry(a),geometryB=geometry(b)
  if(new Blob([JSON.stringify({geometryA,geometryB})]).size>20*1024*1024)throw new Error('两侧分析几何超过 20MB，请简化或按属性分批分析')
  return {geometryA,geometryB}
}
