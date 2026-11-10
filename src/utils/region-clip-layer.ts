import L from 'leaflet'
import { geojsonToArcGIS } from '@terraformer/arcgis'
import type { MapServiceItem } from '@/api/map-service'
import type { RegionClipCollection } from '@/api/region-clip'
import type { IdentifiedMapFeature,MapServiceSearchGeometry } from './map-service-layer'
import { bindTopicFeatureHover } from './topic-feature-hover'
import { featureHoverCaption } from './feature-hover-caption'
import { c5Pattern,type C5Style } from './land-survey-c5'
import type { TopicDisplayMode } from './topic-renderer'
import { regionClipGeometryHit } from './region-clip-hit'

interface Category { value:string;name:string;checked:boolean;color?:string;style?:C5Style;mode?:TopicDisplayMode }
export interface RegionClipLayerStyle { mode:TopicDisplayMode;color:string;categoryField:string;categories:Category[];boundary:boolean }
let patternSequence=0
const svgNS='http://www.w3.org/2000/svg'

/** 渲染已由后端裁切的点线面，样式与分类继续复用原图层。 */
export function createRegionClipLayer(map:L.Map,data:RegionClipCollection,service:MapServiceItem,metadata:{fields?:{name?:string;alias?:string;type?:string}[];displayField?:string},pane:string,initial:RegionClipLayerStyle,select:(feature:IdentifiedMapFeature)=>boolean) {
  let current=initial
  const renderer=L.svg({pane})
  const patterns=new Map<string,string>()
  const images=new Map<string,{id:string;url:string}>()
  const pathStyles=new Map<L.Path,GeoJSON.Feature>()
  const aliases=new Map((metadata.fields||[]).map(field=>[field.name,field.alias||field.name||'']))
  const oid=metadata.fields?.find(field=>field.type==='esriFieldTypeOID')?.name||'OBJECTID'
  function identified(feature:GeoJSON.Feature,shape:L.Layer,position?:L.LatLng):IdentifiedMapFeature{
    const properties=feature.properties||{},caption=featureHoverCaption(properties,metadata.fields,service.name,metadata.displayField)
    const geometry=geojsonToArcGIS(feature.geometry) as MapServiceSearchGeometry
    const bounds=(shape as L.Polygon).getBounds?.()||(position?L.latLngBounds([position]):undefined)
    return {clipped:true,serviceId:String(service.id),serviceName:service.name,title:caption.value,typeLabel:caption.label,typeValue:caption.value,objectIdField:oid,objectId:properties.sourceObjectId as string|number,rows:Object.entries(properties).map(([name,value])=>({name,label:aliases.get(name)||name,value:value==null?'—':String(value)})),location:{bounds,geometryType:service.arcGisGeometryType,geometries:[geometry]}}
  }
  function category(feature:GeoJSON.Feature){return current.categories.find(category=>current.boundary?category.value===membership(feature):category.value===String(feature.properties?.[current.categoryField]??'').trim())}
  function membership(feature:GeoJSON.Feature){const id=String(feature.properties?.sourceObjectId??feature.properties?.[oid]??'');return memberships.get(id)||''}
  const memberships=new Map<string,string>()
  function style(feature:GeoJSON.Feature):L.PathOptions {
    const selected=category(feature),mode=selected?.mode??current.mode
    const color=selected?.style?`rgb(${selected.style.rgb.join(',')})`:selected?.color||current.color
    let fillColor=color
    if(selected?.style&&mode==='filled'){
      const key=selected.style.code+':'+selected.style.pattern
      let id=patterns.get(key)
      if(!id){id=`region-pattern-${++patternSequence}`;patterns.set(key,id);images.set(key,{id,url:c5Pattern(selected.style)})}
      fillColor=`url(#${id})`
    }
    return {renderer,pane,color,weight:current.boundary?3:mode==='boundary'?2.4:1.2,opacity:1,fill:/Polygon|Point/.test(feature.geometry?.type||'')&&mode==='filled',fillColor,fillOpacity:mode==='filled'?1:0,bubblingMouseEvents:true}
  }
  function installPatterns(){
    const svg=map.getPane(pane)?.querySelector('svg')
    if(!svg)return
    let defs=svg.querySelector('defs')
    if(!defs){defs=document.createElementNS(svgNS,'defs');svg.prepend(defs)}
    images.forEach(({id,url})=>{
      if(defs!.querySelector(`[id="${id}"]`))return
      const pattern=document.createElementNS(svgNS,'pattern'),image=document.createElementNS(svgNS,'image')
      pattern.id=id;pattern.setAttribute('patternUnits','userSpaceOnUse');pattern.setAttribute('width','36');pattern.setAttribute('height','36')
      image.setAttribute('width','36');image.setAttribute('height','36');image.setAttribute('href',url);pattern.append(image);defs!.append(pattern)
    })
  }
  const group=L.geoJSON(data,{
    pane,style:feature=>style(feature!),
    pointToLayer:(feature,latlng)=>L.circleMarker(latlng,{...style(feature),radius:5}),
    onEachFeature:(feature,shape)=>{
      const path=shape as L.Path
      if(path.setStyle){pathStyles.set(path,feature);bindTopicFeatureHover(path,map,()=>featureHoverCaption(feature.properties,metadata.fields,service.name,metadata.displayField),()=>path.setStyle(style(feature)))}
      shape.on('click',(event:L.LeafletMouseEvent)=>{
        const handled=select(identified(feature,shape,event.latlng))
        if(handled)L.DomEvent.stopPropagation(event)
      })
    },
  })
  group.on('add',installPatterns)
  return {
    layer:group,bounds:group.getBounds(),
    identify(position:L.LatLng,tolerance=6){
      const result:IdentifiedMapFeature[]=[],pixel=map.latLngToContainerPoint(position)
      const envelope=L.latLngBounds(map.containerPointToLatLng(pixel.subtract([tolerance,tolerance])),map.containerPointToLatLng(pixel.add([tolerance,tolerance])))
      pathStyles.forEach((feature,path)=>{
        if(!group.hasLayer(path))return
        const bounds=(path as L.Polygon).getBounds?.(),point=(path as L.CircleMarker).getLatLng?.()
        if(bounds&&!bounds.intersects(envelope)||point&&!envelope.contains(point))return
        if(feature.geometry&&regionClipGeometryHit(feature.geometry,[position.lng,position.lat],p=>map.latLngToContainerPoint([p[1]!,p[0]!]),tolerance))result.push(identified(feature,path,position))
      })
      return result
    },
    setMemberships(values:{value:string;objectIds?:(string|number)[]}[]){values.forEach(value=>value.objectIds?.forEach(id=>memberships.set(String(id),value.value)))},
    update(next:RegionClipLayerStyle){current=next;pathStyles.forEach((feature,path)=>{path.setStyle(style(feature));if(category(feature)?.checked===false)group.removeLayer(path);else if(!group.hasLayer(path))group.addLayer(path)});installPatterns()},
    destroy(){group.remove();renderer.remove();pathStyles.clear();patterns.clear();images.clear()},
  }
}
