import { parseShp, parseDbf } from 'shpjs'
import proj4 from 'proj4'
import type { SpatialCollection, SpatialField } from '@/api/spatial-analysis'

export const SHP_MAX_BYTES=50*1024*1024
export const SHP_MAX_FEATURES=5000
export const SHP_MAX_VERTICES=500_000
export const UPLOAD_COLORS=['#53d4df','#f5ba5c','#aa9aff','#79d49b','#ed94bd','#8ab8f6']
export const UPLOAD_CRS=[
  {code:'prj',name:'读取 .prj 文件'},
  {code:'EPSG:4549',name:'CGCS2000 / 120°E 高斯投影（不带带号）'},
  {code:'EPSG:4528',name:'CGCS2000 / 第 40 带高斯投影（带带号）'},
  {code:'EPSG:4490',name:'CGCS2000 经纬度'},
  {code:'EPSG:4326',name:'WGS84 经纬度'},
  {code:'EPSG:3857',name:'Web Mercator'},
]
proj4.defs('EPSG:4549','+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs')
proj4.defs('EPSG:4528','+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +ellps=GRS80 +units=m +no_defs')
proj4.defs('EPSG:4490','+proj=longlat +ellps=GRS80 +no_defs')

export interface ShpPayload {shp:ArrayBuffer;dbf:ArrayBuffer;prj?:string;cpg?:string;crs:string;encoding:string}
export interface ParsedTopicUpload {data:GeoJSON.FeatureCollection;sourceCrs:string;encoding:string;skippedCount:number;analyzable:boolean;fields:SpatialField[]}
export interface UploadedTopicLayer extends ParsedTopicUpload {id:string;name:string;fileName:string;color:string;mode:'filled'|'boundary';selected:boolean;createdAt:string}

export function validateUploadName(name:string) {
  const value=name.trim()
  if(!value||value.length>60)throw new Error('请输入 1—60 个字的图层名称')
  return value
}
export function normalizeDbfEncoding(value:string) {
  const label=value.replace(/^\uFEFF/,'').trim()
  const normalized=/^(?:ANSI\s*|CP|WINDOWS-)?936$/i.test(label)||/^GBK$/i.test(label)?'gb18030':/^(?:CP)?65001$/i.test(label)?'utf-8':label
  try{new TextDecoder(normalized)}catch{throw new Error(`无法识别 DBF 编码 ${label}，请选择 UTF-8 或 GB18030`)}
  return normalized
}
function dbfStructure(dbf:ArrayBuffer) {
  if(dbf.byteLength<33)throw new Error('DBF 文件头不完整')
  const view=new DataView(dbf),count=view.getUint32(4,true),header=view.getUint16(8,true),record=view.getUint16(10,true)
  if(!record||header<33||header+record*count>dbf.byteLength)throw new Error('DBF 文件已截断或记录长度无效')
  const fields:{offset:number;length:number;type:string;name:Uint8Array;decimals:number}[]=[]
  let offset=1
  for(let pos=32;pos<header-1;pos+=32){
    if(view.getUint8(pos)===13)break
    if(pos+32>header)throw new Error('DBF 字段定义无效')
    const length=view.getUint8(pos+16)
    fields.push({offset,length,type:String.fromCharCode(view.getUint8(pos+11)),name:new Uint8Array(dbf,pos,11),decimals:view.getUint8(pos+17)})
    offset+=length
  }
  if(offset!==record)throw new Error('DBF 字段长度与记录长度不一致')
  return {view,count,header,record,fields}
}
function automaticEncoding(dbf:ArrayBuffer,structure:ReturnType<typeof dbfStructure>) {
  const utf8=new TextDecoder('utf-8',{fatal:true})
  try{
    for(const field of structure.fields){utf8.decode(field.name);if(field.type==='C')for(let row=0;row<structure.count;row++)utf8.decode(new Uint8Array(dbf,structure.header+row*structure.record+field.offset,field.length))}
    return 'utf-8'
  }catch{return 'gb18030'}
}
export function assertTopicGeometry(data:GeoJSON.FeatureCollection) {
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||!data.features.length)throw new Error('图层没有有效要素')
  if(data.features.length>SHP_MAX_FEATURES)throw new Error(`图层超过 ${SHP_MAX_FEATURES} 个要素，请分批处理`)
  let vertices=0
  const position=(point:unknown)=>{
    if(!Array.isArray(point)||point.length<2||!point.slice(0,2).every(value=>typeof value==='number'&&Number.isFinite(value))||Math.abs(point[0])>180||Math.abs(point[1])>90)throw new Error('转换后坐标不在有效经纬度范围内，请检查源坐标系')
    if(++vertices>SHP_MAX_VERTICES)throw new Error('图层坐标点过多，请简化几何后重新上传')
  }
  const line=(points:unknown,min:number)=>{if(!Array.isArray(points)||points.length<min)throw new Error('图层存在不完整的线或面');points.forEach(position)}
  const polygon=(rings:unknown)=>{if(!Array.isArray(rings)||!rings.length)throw new Error('图层存在空面');rings.forEach(ring=>{line(ring,4);const points=ring as number[][];if(points[0]![0]!==points[points.length-1]![0]||points[0]![1]!==points[points.length-1]![1])throw new Error('图层存在未闭合的面边界')})}
  for(const feature of data.features){
    if(feature.type!=='Feature'||!feature.geometry)throw new Error('图层存在空几何')
    const geometry=feature.geometry
    switch(geometry.type){
      case 'Point':position(geometry.coordinates);break
      case 'MultiPoint':line(geometry.coordinates,1);break
      case 'LineString':line(geometry.coordinates,2);break
      case 'MultiLineString':if(!geometry.coordinates.length)throw new Error('图层存在空线');geometry.coordinates.forEach(points=>line(points,2));break
      case 'Polygon':polygon(geometry.coordinates);break
      case 'MultiPolygon':if(!geometry.coordinates.length)throw new Error('图层存在空面');geometry.coordinates.forEach(polygon);break
      default:throw new Error('目前支持点、线、面 SHP 图层，不支持几何集合')
    }
  }
}
export function uploadIsPolygon(data:GeoJSON.FeatureCollection):data is SpatialCollection {return !!data.features.length&&data.features.every(feature=>['Polygon','MultiPolygon'].includes(feature.geometry?.type||''))}
export function parseTopicShapefile(payload:ShpPayload):ParsedTopicUpload {
  if(payload.shp.byteLength+payload.dbf.byteLength>SHP_MAX_BYTES)throw new Error('SHP 与 DBF 总大小不能超过 50MB')
  const structure=dbfStructure(payload.dbf)
  if(structure.count>SHP_MAX_FEATURES)throw new Error(`单个图层最多 ${SHP_MAX_FEATURES} 条记录`)
  const view=new DataView(payload.shp)
  if(payload.shp.byteLength<100||view.getInt32(0)!==9994||view.getInt32(24)*2!==payload.shp.byteLength)throw new Error('SHP 文件头无效或文件已截断')
  let shapeCount=0
  for(let offset=100;offset<payload.shp.byteLength;shapeCount++){
    if(offset+8>payload.shp.byteLength)throw new Error('SHP 记录头不完整')
    const length=view.getInt32(offset+4)*2
    if(length<4||offset+8+length>payload.shp.byteLength)throw new Error('SHP 记录长度无效')
    offset+=8+length
  }
  if(shapeCount!==structure.count)throw new Error('SHP 与 DBF 记录数不一致，请选择同一份数据的组件')
  const projection=payload.crs==='prj'?payload.prj?.trim():payload.crs
  if(!projection)throw new Error('缺少 .prj 文件，请选择正确的源坐标系')
  try{proj4(projection)}catch{throw new Error('无法解析源坐标系，请检查 .prj 或手动选择坐标系')}
  const encoding=payload.encoding==='auto'?(payload.cpg?.trim()?normalizeDbfEncoding(payload.cpg):automaticEncoding(payload.dbf,structure)):normalizeDbfEncoding(payload.encoding)
  const geometries=parseShp(payload.shp,projection),rows=parseDbf(payload.dbf,encoding)
  if(geometries.length!==shapeCount||rows.length!==shapeCount)throw new Error('解析记录不完整，未将截断数据添加到地图')
  const decoder=new TextDecoder(encoding),features:GeoJSON.Feature[]=[],names=new Set<string>()
  let skippedCount=0
  geometries.forEach((geometry,index)=>{
    if(!geometry||structure.view.getUint8(structure.header+index*structure.record)===42){skippedCount++;return}
    const properties=Object.assign(Object.create(null),rows[index]) as Record<string,unknown>
    // DBF 的长整数编号不应被 parseFloat 舍入。
    structure.fields.forEach(field=>{
      const name=decoder.decode(field.name).replace(/\0/g,'').trim()
      if(['N','F'].includes(field.type)&&field.decimals===0){const raw=decoder.decode(new Uint8Array(payload.dbf,structure.header+index*structure.record+field.offset,field.length)).trim();if(/^[+-]?\d{16,}$/.test(raw))properties[name]=raw}
      names.add(name)
    })
    features.push({type:'Feature',id:index+1,geometry,properties})
  })
  const data:GeoJSON.FeatureCollection={type:'FeatureCollection',features}
  assertTopicGeometry(data)
  return {data,encoding,sourceCrs:payload.crs==='prj'?(projection.match(/(?:PROJCS|GEOGCS|PROJCRS|GEOGCRS)\s*\[\s*"([^"]+)"/i)?.[1]||'PRJ 坐标系'):payload.crs,skippedCount,analyzable:uploadIsPolygon(data),fields:[...names].filter(Boolean).map(name=>({name,alias:name,type:features.some(feature=>typeof feature.properties?.[name]==='number')?'number':'text'}))}
}

export async function readShpPayload(files:File[],crs:string,encoding:string):Promise<{payload:ShpPayload;fileName:string}> {
  if(!files.length)throw new Error('请选择 SHP 文件及其同名组件')
  if(files.reduce((total,file)=>total+file.size,0)>SHP_MAX_BYTES)throw new Error('所选文件总大小不能超过 50MB')
  const components=new Map<string,File>();let stem=''
  for(const file of files){
    const match=/^(.*)\.(shp|dbf|shx|prj|cpg)$/i.exec(file.name)
    if(!match)throw new Error(`不支持 ${file.name}，请选择 SHP 组件文件`)
    const base=match[1]!.toLocaleLowerCase(),extension=match[2]!.toLowerCase()
    if(stem&&stem!==base)throw new Error('一次只能上传一组同名的 SHP 组件')
    if(components.has(extension))throw new Error(`重复的 .${extension} 文件`)
    stem=base;components.set(extension,file)
  }
  if(!components.has('shp')||!components.has('dbf'))throw new Error('请同时选择同名 .shp 与 .dbf 文件')
  return {fileName:components.get('shp')!.name,payload:{shp:await components.get('shp')!.arrayBuffer(),dbf:await components.get('dbf')!.arrayBuffer(),prj:await components.get('prj')?.text(),cpg:await components.get('cpg')?.text(),crs,encoding}}
}
