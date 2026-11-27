import { administrativePolygonLabels, type TownshipLabel } from './township-labels'

export interface AdministrativeLabelSource {
  visible:boolean
  vector:boolean
  administrative:boolean
  features:{name:string;geometry:GeoJSON.Geometry}[]
}

/** Labels belong to visible administrative vectors, never to imagery or unrelated business layers. */
export function topicAdministrativeLabels(sources:AdministrativeLabelSource[]):TownshipLabel[]{
  return sources.filter(source=>source.visible&&source.vector&&source.administrative)
    .flatMap(source=>source.features.flatMap(feature=>administrativePolygonLabels(feature.name,feature.geometry)))
}

interface ScreenPoint { x:number;y:number }
/** Screen area sets the scale threshold; larger regions win collisions without moving names outside their polygons. */
export function layoutAdministrativeLabels(rows:TownshipLabel[],project:(lng:number,lat:number)=>ScreenPoint,viewport:{width:number;height:number}):TownshipLabel[]{
  const candidates=rows.flatMap((row,index)=>{
    if(!row.geometry)return []
    const polygons=row.geometry.type==='Polygon'?[row.geometry.coordinates]:row.geometry.coordinates
    let area=0,left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity
    for(const rings of polygons){
      rings.forEach((ring,ringIndex)=>{
        const points=ring.map(([lng,lat])=>project(lng!,lat!)),origin=points[0]
        if(!origin)return
        let ringArea=0
        points.forEach((point,i)=>{
          const next=points[(i+1)%points.length]!
          ringArea+=(point.x-origin.x)*(next.y-origin.y)-(next.x-origin.x)*(point.y-origin.y)
          if(ringIndex===0){left=Math.min(left,point.x);right=Math.max(right,point.x);top=Math.min(top,point.y);bottom=Math.max(bottom,point.y)}
        })
        area+=(ringIndex===0?1:-1)*Math.abs(ringArea)/2
      })
    }
    // Match the 14px label font, including letter spacing, text shadow and breathing room.
    const width=Array.from(row.name).reduce((size,char)=>size+(/[^\x00-\xff]/.test(char)?15:9),0)+12,height=28
    if(area<Math.max(900,width*height*.75)||right-left<28||bottom-top<18)return []
    const point=project(row.lng,row.lat)
    const box={left:point.x-width/2,right:point.x+width/2,top:point.y-height/2,bottom:point.y+height/2}
    if(box.right<0||box.left>viewport.width||box.bottom<0||box.top>viewport.height)return []
    return [{row,index,area,box}]
  }).sort((a,b)=>b.area-a.area||a.index-b.index)
  const placed:typeof candidates=[]
  for(const candidate of candidates){
    if(placed.some(({box})=>candidate.box.left<box.right+8&&candidate.box.right>box.left-8&&candidate.box.top<box.bottom+8&&candidate.box.bottom>box.top-8))continue
    placed.push(candidate)
  }
  return placed.map(candidate=>candidate.row)
}
