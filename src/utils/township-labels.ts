import type { Geometry } from 'geojson'
import { geometryLocation } from './geometry-location'
export interface TownshipLabel { name: string; lng: number; lat: number; geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon }
export function townshipContains(lng: number, lat: number, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  const ringContains=(ring:GeoJSON.Position[])=>{
    let inside=false
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {const a=ring[i]!,b=ring[j]!;if((a[1]!>lat)!==(b[1]!>lat)&&lng<(b[0]!-a[0]!)*(lat-a[1]!)/(b[1]!-a[1]!)+a[0]!)inside=!inside}
    return inside
  }
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates
  return polygons.some(rings=>!!rings[0]?.length&&ringContains(rings[0])&&!rings.slice(1).some(ringContains))
}
/** Place the label inside the largest polygon, avoiding holes and disconnected islands. */
export function townshipLabel(name: string, geometry: Geometry): TownshipLabel | undefined {
  if (!name.trim() || !['Polygon','MultiPolygon'].includes(geometry.type)) return
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : (geometry as GeoJSON.MultiPolygon).coordinates
  const area = (ring: number[][]) => Math.abs(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length]!;return sum+a[0]!*b[1]!-b[0]!*a[1]!},0))
  const rings = [...polygons].sort((a,b)=>area(b[0]||[])-area(a[0]||[]))[0]
  if (!rings?.[0]?.length) return
  const bounds = geometryLocation({type:'Polygon',coordinates:rings})
  if (!bounds) return
  let best: {lng:number;lat:number;clearance:number;centerDistance:number} | undefined
  const scale=Math.cos((bounds.south+bounds.north)/2*Math.PI/180)
  const clearance=(lng:number,lat:number)=>{
    let distance=Infinity
    for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[j]!,b=ring[i]!,dx=(b[0]!-a[0]!)*scale,dy=b[1]!-a[1]!
      const t=Math.max(0,Math.min(1,(((lng-a[0]!)*scale)*dx+(lat-a[1]!)*dy)/(dx*dx+dy*dy||1)))
      distance=Math.min(distance,Math.hypot((lng-a[0]!)*scale-t*dx,lat-a[1]!-t*dy))
    }
    return distance
  }
  // Scan lines yield an interior point even for concave boundaries and holes.
  for (let row=1;row<20;row++) {
    const lat=bounds.south+(bounds.north-bounds.south)*row/20, xs:number[]=[]
    for (const ring of rings) for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[j]!,b=ring[i]!
      if((a[1]!>lat)!==(b[1]!>lat)) xs.push(a[0]!+(lat-a[1]!)*(b[0]!-a[0]!)/(b[1]!-a[1]!))
    }
    xs.sort((a,b)=>a-b)
    for(let i=0;i+1<xs.length;i+=2){
      if(xs[i+1]!<=xs[i]!)continue
      const lng=(xs[i]!+xs[i+1]!)/2,space=clearance(lng,lat),centerDistance=Math.hypot((lng-bounds.lng)*scale,lat-bounds.lat)
      if(!best||space>best.clearance+1e-10||(Math.abs(space-best.clearance)<1e-10&&centerDistance<best.centerDistance))best={lng,lat,clearance:space,centerDistance}
    }
  }
  return best ? {name:name.trim(),lng:best.lng,lat:best.lat} : undefined
}

/** Every disconnected polygon gets its own interior anchor; holes never become labels. */
export function administrativePolygonLabels(name:string,geometry:Geometry):TownshipLabel[]{
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[]
  return polygons.flatMap(coordinates=>{
    const polygon:GeoJSON.Polygon={type:'Polygon',coordinates}
    const label=townshipLabel(name,polygon)
    return label?[{...label,geometry:polygon}]:[]
  })
}
