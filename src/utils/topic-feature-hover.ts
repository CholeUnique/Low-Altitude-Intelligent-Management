import L from 'leaflet'
import {arcgisToGeoJSON} from '@terraformer/arcgis'
import type {MapServiceItem} from '@/api/map-service'
import {queryVectorHover} from './map-service-layer'
import {featureHoverCaption,type FeatureHoverCaption} from './feature-hover-caption'

export interface TopicHoverTarget {service:MapServiceItem;where:string;pane?:string}
const nativeEvent='topic-native-feature-hover'
const highlightStyle:L.PathOptions={color:'#35edff',weight:3.5,opacity:1,fillColor:'#35edff',fillOpacity:.3}
const nativeHoverByMap=new WeakMap<L.Map,{shape:L.Layer;reset:()=>void}>()
const suspendedByMap=new WeakMap<L.Map,()=>boolean>()
const suspendedPopups=new WeakMap<L.Map,Map<L.Layer,L.Popup>>()
function restoreDetails(map:L.Map){const popups=suspendedPopups.get(map);popups?.forEach((popup,shape)=>{shape.closeTooltip();shape.bindPopup(popup)});popups?.clear()}
function suspendDetails(map:L.Map,shape:L.Layer){
  const popup=shape.getPopup();if(popup){let saved=suspendedPopups.get(map);if(!saved){saved=new Map();suspendedPopups.set(map,saved)};saved.set(shape,popup);shape.closePopup();shape.unbindPopup()}
  shape.closeTooltip()
}
function clearNative(map:L.Map){const active=nativeHoverByMap.get(map);if(active){nativeHoverByMap.delete(map);active.shape.closeTooltip();active.reset()}}
function content(caption:FeatureHoverCaption){const body=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong');body.className='hover-stack';label.textContent=`${caption.label}：`;value.textContent=caption.value;const row=document.createElement('div');row.append(label,value);body.appendChild(row);return body}

/** 上传图层和结果图层是本机矢量，直接命中，不向后端发起悬浮查询。 */
export function bindTopicFeatureHover(shape:L.Layer,map:L.Map,caption:()=>FeatureHoverCaption,reset:()=>void) {
  const path=shape as L.Path,originalBubbling=path.options.bubblingMouseEvents
  const suspended=()=>suspendedByMap.get(map)?.()===true
  function activate(){
    if(suspended()){path.options.bubblingMouseEvents=true;suspendDetails(map,shape);return false}
    restoreDetails(map)
    path.options.bubblingMouseEvents=originalBubbling
    if(nativeHoverByMap.get(map)?.shape!==shape){map.fire(nativeEvent);clearNative(map);nativeHoverByMap.set(map,{shape,reset});path.setStyle(highlightStyle)}
    return true
  }
  shape.bindTooltip(content(caption()),{sticky:true,direction:'top',offset:[0,-10],opacity:1,className:'jiulong-feature-tooltip'})
  shape.on('mouseover',activate)
  shape.on('mousemove',event=>{if(activate()){if(!shape.isTooltipOpen())shape.openTooltip((event as L.LeafletMouseEvent).latlng);L.DomEvent.stopPropagation(event)}})
  shape.on('mouseout remove',()=>{path.options.bubblingMouseEvents=originalBubbling;if(nativeHoverByMap.get(map)?.shape===shape)clearNative(map)})
}

/** 发布图层以栅格瓦片显示，悬浮时只查询鼠标命中的几何，另绘临时高亮。 */
export function createTopicFeatureHover(map:L.Map,targets:()=>TopicHoverTarget[],suspended:()=>boolean) {
  suspendedByMap.set(map,suspended)
  const pane='topic-feature-hover'
  if(!map.getPane(pane)){const node=map.createPane(pane);node.style.zIndex='455';node.style.pointerEvents='none'}
  const highlight=L.layerGroup().addTo(map)
  const tooltip=L.tooltip({direction:'top',offset:[0,-12],opacity:1,className:'jiulong-feature-tooltip'})
  let timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,revision=0,moving=false
  function clear(){revision++;clearTimeout(timer);controller?.abort();controller=undefined;highlight.clearLayers();map.closeTooltip(tooltip);clearNative(map);if(!suspended())restoreDetails(map)}
  function order(items:TopicHoverTarget[]){return items.map((item,index)=>({item,index,node:map.getPane(item.pane||'overlayPane')})).sort((a,b)=>{
    const az=Number(a.node?.style.zIndex)||0,bz=Number(b.node?.style.zIndex)||0
    if(az!==bz)return bz-az
    if(a.node&&b.node&&a.node!==b.node)return a.node.compareDocumentPosition(b.node)&Node.DOCUMENT_POSITION_FOLLOWING?1:-1
    return b.index-a.index
  }).map(value=>value.item)}
  function move(event:L.LeafletMouseEvent){
    clear();if(moving||suspended())return
    const request=revision,position=event.latlng,point=map.latLngToContainerPoint(position),nw=map.containerPointToLatLng(point.subtract([6,6])),se=map.containerPointToLatLng(point.add([6,6]))
    timer=setTimeout(async()=>{
      const abort=new AbortController();controller=abort
      for(const target of order(targets())){
        if(abort.signal.aborted||request!==revision||suspended())return
        try{
          const response=await queryVectorHover(target.service,position,{west:Math.min(nw.lng,se.lng),east:Math.max(nw.lng,se.lng),south:Math.min(nw.lat,se.lat),north:Math.max(nw.lat,se.lat)},target.where,abort.signal)
          if(abort.signal.aborted||request!==revision||suspended())return
          const feature=[...response.features].reverse().find(feature=>feature.geometry)
          if(!feature)continue
          const converted=arcgisToGeoJSON(feature)
          L.geoJSON(converted,{pane,interactive:false,style:highlightStyle,pointToLayer:(_feature,latlng)=>L.circleMarker(latlng,{...highlightStyle,pane,interactive:false,radius:8})}).addTo(highlight)
          tooltip.setLatLng(position).setContent(content(featureHoverCaption(feature.attributes,response.metadata.fields,target.service.name,response.metadata.displayField)))
          map.openTooltip(tooltip);return
        }catch{if(abort.signal.aborted||request!==revision)return}
      }
    },140)
  }
  function start(){moving=true;clear()}
  function end(){moving=false}
  map.on('mousemove',move).on('mouseout',clear).on('movestart zoomstart',start).on('moveend zoomend',end).on(nativeEvent,clear)
  return {clear,destroy(){clear();restoreDetails(map);suspendedPopups.delete(map);suspendedByMap.delete(map);map.off('mousemove',move).off('mouseout',clear).off('movestart zoomstart',start).off('moveend zoomend',end).off(nativeEvent,clear);highlight.remove()}}
}
