import L from 'leaflet'
import { watch } from 'vue'
import type { Pinia } from 'pinia'
import { arcgisToGeoJSON } from '@terraformer/arcgis'
import { useUserStore } from '@/stores/user'
import { listEnabledMapServices } from '@/api/map-service'
import { administrativeNameField, expandMapServiceSublayers, getMapServiceLayerMetadata, queryMapServiceFeatures } from './map-service-layer'
import { townshipLabel, townshipContains, type TownshipLabel } from './township-labels'

export function installMapTownshipLabels(pinia: Pinia) {
  const user=useUserStore(pinia)
  let fallbackJob:Promise<TownshipLabel[]>|undefined
  const getFallback=()=>fallbackJob ||= import('@/assets/geo/hailing-township-labels.json').then(({default:hailing})=>hailing.labels.map(label=>({...label,geometry:hailing.regions?.find(region=>region.name===label.name)?.geometry as GeoJSON.MultiPolygon|undefined})))
  const cache=new Map<string,Promise<TownshipLabel[]>>()
  function load(dept:string) {
    const key=`${String(user.currentUser?.id||'')}:${dept}`
    let job=cache.get(key)
    if(!job){job=(async()=>{
      const sources=await listEnabledMapServices(dept)
      const geometries=new Map<string,GeoJSON.MultiPolygon['coordinates']>()
      for(const source of sources.filter(item=>/VECTOR|MAPSERVER|FEATURE/i.test(item.dataType||item.type||'')||/MapServer|FeatureServer/i.test(item.serviceUrl))){
        try{
          const layers=await expandMapServiceSublayers(source)
          for(const layer of layers.filter(item=>/乡级|乡镇|街道.*区划|镇街|township/i.test(item.name))){
            const metadata=await getMapServiceLayerMetadata(layer), field=administrativeNameField(metadata.fields||[],layer.name)
            if(!field)continue
            const {features}=await queryMapServiceFeatures(layer,[field],'1=1',true)
            for(const feature of features){const converted=arcgisToGeoJSON(feature) as GeoJSON.Feature;const geometry=converted.geometry;if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type))continue;const name=String(feature.attributes?.[field]||'').trim();if(!name)continue;const polygons=geometry.type==='Polygon'?[geometry.coordinates]:(geometry as GeoJSON.MultiPolygon).coordinates;geometries.set(name,[...(geometries.get(name)||[]),...polygons])}
          }
        }catch{ /* A failed service must not prevent other maps and labels from loading. */ }
      }
      return [...geometries].flatMap(([name,coordinates])=>{const geometry:GeoJSON.MultiPolygon={type:'MultiPolygon',coordinates},label=townshipLabel(name,geometry);return label?[{...label,geometry}]:[]})
    })();cache.set(key,job);job.catch(()=>cache.delete(key))}
    return job
  }
  L.Map.addInitHook(function(this:L.Map){
    const map=this
    // Image-coordinate maps are not geographic maps.
    if(map.options.crs===L.CRS.Simple||map.getContainer().closest('[data-map-labels="layer"]'))return
    let alive=true,version=0,rows:TownshipLabel[]=[],group:L.LayerGroup|undefined
    function render(){
      group?.clearLayers()
      if(!alive||map.getZoom()<9||map.getSize().x<130||map.getSize().y<100)return
      if(!map.getPane('township-labels')){const pane=map.createPane('township-labels');pane.style.zIndex='680';pane.style.pointerEvents='none'}
      group ||= L.layerGroup().addTo(map)
      const occupied:L.Point[]=[]
      for(const row of rows){let position=L.latLng(row.lat,row.lng);if(!map.getBounds().contains(position)){const center=map.getCenter();if(map.getZoom()<15||!row.geometry||!townshipContains(center.lng,center.lat,row.geometry))continue;position=map.containerPointToLatLng([map.getSize().x/2,20])}const point=map.latLngToContainerPoint(position);if(occupied.some(p=>Math.abs(p.x-point.x)<90&&Math.abs(p.y-point.y)<30))continue;occupied.push(point)
        const label=document.createElement('span');label.textContent=row.name
        L.marker(position,{pane:'township-labels',interactive:false,keyboard:false,icon:L.divIcon({className:'township-map-label',html:label,iconSize:[140,24],iconAnchor:[70,12]})}).addTo(group)
      }
    }
    const stop=watch(()=>[user.activeDeptId,user.currentUser?.id],async()=>{const request=++version;rows=[];group?.clearLayers();if(!user.activeDeptId||!user.currentUser)return;const dept=String(user.activeDeptId),fallback=await getFallback().catch(()=>[]);if(!alive||request!==version)return;rows=fallback;map.whenReady(render);try{const data=await load(dept);if(alive&&version===request){const names=new Set(data.map(row=>row.name));rows=[...data,...fallback.filter(row=>!names.has(row.name))];map.whenReady(render)}}catch{}},{immediate:true})
    map.on('moveend zoomend resize',render)
    map.once('unload',()=>{alive=false;version++;stop();map.off('moveend zoomend resize',render);group?.clearLayers()})
  })
}
