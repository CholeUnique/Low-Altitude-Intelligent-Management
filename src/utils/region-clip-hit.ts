type Position=readonly number[]
type Pixel={x:number;y:number}
function ringHit(point:Position,ring:Position[]):'inside'|'outside'|'edge'{
  let inside=false
  const [x,y]=point as [number,number]
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [ax,ay]=ring[j] as [number,number],[bx,by]=ring[i] as [number,number]
    const dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy),cross=(x-ax)*dy-(y-ay)*dx
    if((length?Math.abs(cross)/length<1e-10:Math.hypot(x-ax,y-ay)<1e-10)&&x>=Math.min(ax,bx)-1e-10&&x<=Math.max(ax,bx)+1e-10&&y>=Math.min(ay,by)-1e-10&&y<=Math.max(ay,by)+1e-10)return 'edge'
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside
  }
  return inside?'inside':'outside'
}
function polygonHit(point:Position,rings:Position[][]){
  const outer=rings[0]&&ringHit(point,rings[0])
  if(!outer||outer==='outside')return false
  if(outer==='edge')return true
  for(const ring of rings.slice(1)){const hole=ringHit(point,ring);if(hole==='edge')return true;if(hole==='inside')return false}
  return true
}
function segmentDistance(p:Pixel,a:Pixel,b:Pixel){
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)
}
/** 仅用于点击命中；边界模式仍可点击面内部，不执行几何裁切或面积计算。 */
export function regionClipGeometryHit(geometry:GeoJSON.Geometry,position:Position,project:(position:Position)=>Pixel,tolerance=6):boolean{
  if(geometry.type==='Polygon')return polygonHit(position,geometry.coordinates)
  if(geometry.type==='MultiPolygon')return geometry.coordinates.some(rings=>polygonHit(position,rings))
  const point=project(position)
  const line=(positions:Position[])=>positions.some((value,index)=>index>0&&segmentDistance(point,project(positions[index-1]!),project(value))<=tolerance)
  if(geometry.type==='Point')return segmentDistance(point,project(geometry.coordinates),project(geometry.coordinates))<=tolerance
  if(geometry.type==='MultiPoint')return geometry.coordinates.some(value=>segmentDistance(point,project(value),project(value))<=tolerance)
  if(geometry.type==='LineString')return line(geometry.coordinates)
  if(geometry.type==='MultiLineString')return geometry.coordinates.some(line)
  return false
}
