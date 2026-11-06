export type DrawingKind = 'point' | 'line' | 'polygon'
export type DrawingFeature = GeoJSON.Feature<GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon, { ID: number; TYPE: string }>
export const DRAWING_WGS84 = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'

export function createDrawingFeature(kind: DrawingKind, input: [number, number][], id: number): DrawingFeature {
  const points = input.filter((point, index) => index === 0 || point[0] !== input[index - 1]![0] || point[1] !== input[index - 1]![1]).map(point => [...point] as [number, number])
  if (points.some(([x,y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90)) throw new Error('绘制坐标无效。')
  if (kind === 'polygon' && points.length > 1 && points[0]!.every((value,index) => value === points[points.length - 1]![index])) points.pop()
  const count = kind === 'point' ? 1 : kind === 'line' ? 2 : 3
  if (new Set(points.map(point => point.join(','))).size < count) throw new Error(`请至少绘制 ${count} 个不同的点。`)
  if (kind === 'point') return {type:'Feature',properties:{ID:id,TYPE:'POINT'},geometry:{type:'Point',coordinates:points[0]!}}
  if (kind === 'line') return {type:'Feature',properties:{ID:id,TYPE:'LINE'},geometry:{type:'LineString',coordinates:points}}
  const cross = (a:number[],b:number[],c:number[]) => (b[0]!-a[0]!)*(c[1]!-a[1]!)-(b[1]!-a[1]!)*(c[0]!-a[0]!)
  const ring = [...points,points[0]!]
  for (let i=0;i<points.length;i++) for (let j=i+2;j<points.length;j++) {
    if (i===0 && j===points.length-1) continue
    const a=ring[i]!,b=ring[i+1]!,c=ring[j]!,d=ring[j+1]!
    if (cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0 && Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0])) && Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))) throw new Error('面边界不能交叉或重叠，请撤销顶点后重画。')
  }
  const signedArea = points.reduce((sum,point,index) => sum+point[0]*ring[index+1]![1]-ring[index+1]![0]*point[1],0)
  if (Math.abs(signedArea)<1e-12) throw new Error('绘制边界必须形成有效的面。')
  return {type:'Feature',properties:{ID:id,TYPE:'POLYGON'},geometry:{type:'Polygon',coordinates:[ring]}}
}

/** Each SHP holds one geometry type; each drawn feature keeps its own SHP/SHX/DBF record. */
export async function exportDrawingShapefiles(features: DrawingFeature[], name = '绘制图层'): Promise<Blob> {
  if (!features.length) throw new Error('请先完成至少一个绘制要素。')
  const [{write},{default:JSZip}] = await Promise.all([import('@mapbox/shp-write'),import('jszip')])
  const archive = new JSZip()
  const base = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,60) || '绘制图层'
  for (const kind of ['Point','LineString','Polygon'] as const) {
    const rows = features.filter(feature => feature.geometry.type === kind)
    if (!rows.length) continue
    const coordinates = rows.map(feature => {
      const geometry = feature.geometry
      if (geometry.type === 'Point') return geometry.coordinates
      if (geometry.type === 'LineString') return [geometry.coordinates]
      const ring = geometry.coordinates[0]!
      const signed = ring.slice(1).reduce((sum,point,index) => sum+ring[index]![0]!*point[1]!-point[0]!*ring[index]![1]!,0)
      return [signed > 0 ? [...ring].reverse() : ring]
    })
    const files = await new Promise<{shp:DataView;shx:DataView;dbf:DataView}>((resolve,reject) => write(rows.map(row=>row.properties),kind==='Point'?'POINT':kind==='LineString'?'POLYLINE':'POLYGON',coordinates,(error,data)=>error?reject(error):resolve(data)))
    const prefix = `${base}_${kind==='Point'?'points':kind==='LineString'?'lines':'polygons'}`
    archive.file(`${prefix}.shp`,files.shp.buffer)
    archive.file(`${prefix}.shx`,files.shx.buffer)
    archive.file(`${prefix}.dbf`,files.dbf.buffer)
    archive.file(`${prefix}.prj`,DRAWING_WGS84)
    archive.file(`${prefix}.cpg`,'UTF-8')
  }
  return archive.generateAsync({type:'blob',compression:'DEFLATE'})
}
