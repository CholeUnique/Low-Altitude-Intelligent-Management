import proj4 from 'proj4'
import type { ShpPayload } from './topic-upload'

export const LAND_UPLOAD_PRJ='PROJCS["CGCS2000_3_Degree_GK_CM_120E",GEOGCS["China Geodetic Coordinate System 2000",DATUM["China_2000",SPHEROID["CGCS2000",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",120],PARAMETER["scale_factor",1],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","4549"]]'
proj4.defs('EPSG:4549','+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs')

/** Normalize geometry to the server's currently supported CGCS2000 120E input.
 * Preserve record/part order, holes, Z/M and original DBF/CPG bytes; never rewrite attributes.
 * This is a real projection plus matching PRJ, not a CRS label replacement.
 */
export function projectedLandShp(payload:ShpPayload) {
  const source=payload.crs==='prj'?payload.prj?.trim():payload.crs
  if(!source)throw new Error('请附带正确的 .prj 文件，不能猜测源坐标系。')
  const output=payload.shp.slice(0),view=new DataView(output),index:Array<{offset:number;length:number}>=[]
  const global=[Infinity,Infinity,-Infinity,-Infinity]
  const writeBounds=(offset:number,bounds:number[])=>bounds.forEach((value,i)=>view.setFloat64(offset+i*8,value,true))
  for(let offset=100;offset<output.byteLength;){
    if(offset+8>output.byteLength)throw new Error('SHP 记录不完整。')
    const length=view.getInt32(offset+4)*2,start=offset+8,end=start+length
    if(length<44||end>output.byteLength||![5,15,25].includes(view.getInt32(start,true)))throw new Error('仅支持完整的 Polygon / PolygonZ / PolygonM 图斑。')
    const parts=view.getInt32(start+36,true),points=view.getInt32(start+40,true),pointStart=start+44+parts*4
    if(parts<1||points<4||pointStart+points*16>end)throw new Error('SHP 面坐标记录损坏。')
    const bounds=[Infinity,Infinity,-Infinity,-Infinity]
    for(let i=0;i<points;i++){
      const position=pointStart+i*16,[x,y]=proj4(source,'EPSG:4549',[view.getFloat64(position,true),view.getFloat64(position+8,true)])
      if(x===undefined||y===undefined||!Number.isFinite(x)||!Number.isFinite(y))throw new Error('源坐标无法转换为 CGCS2000，请检查 .prj。')
      view.setFloat64(position,x,true);view.setFloat64(position+8,y,true)
      bounds[0]=Math.min(bounds[0]!,x);bounds[1]=Math.min(bounds[1]!,y);bounds[2]=Math.max(bounds[2]!,x);bounds[3]=Math.max(bounds[3]!,y)
    }
    writeBounds(start+4,bounds)
    for(let i=0;i<4;i++)global[i]=i<2?Math.min(global[i]!,bounds[i]!):Math.max(global[i]!,bounds[i]!)
    index.push({offset:offset/2,length:length/2});offset=end
  }
  if(!index.length)throw new Error('SHP 没有有效图斑。')
  writeBounds(36,global)
  const shx=new ArrayBuffer(100+index.length*8),shxBytes=new Uint8Array(shx),shxView=new DataView(shx)
  shxBytes.set(new Uint8Array(output,0,100));shxView.setInt32(24,shx.byteLength/2)
  index.forEach((record,i)=>{shxView.setInt32(100+i*8,record.offset);shxView.setInt32(104+i*8,record.length)})
  return {shp:output,shx,prj:LAND_UPLOAD_PRJ,featureCount:index.length}
}
