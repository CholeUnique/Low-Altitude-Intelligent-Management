import type { MapServiceItem } from '@/api/map-service'
import { createAdministrativeBoundaryLayer, createMapServiceLayer, getMapServiceLayerMetadata, type MapServiceLayerOptions } from './map-service-layer'
import { topicRole } from './geographic-topic'
import { resolveC5Style } from './land-survey-c5'
import { createTopicRenderer } from './topic-renderer'

/** Homepage uses the topic map's published-layer symbols, not random service colors. */
export async function createTopicStyledServiceLayer(service:MapServiceItem,options:MapServiceLayerOptions={}){
  if(!service.arcGisGeometryType)return createMapServiceLayer(service,undefined,options)
  const metadata=await getMapServiceLayerMetadata(service)
  const role=topicRole(service,(metadata.fields||[]).map(field=>field.name||''))
  if(role==='boundary'){
    const handle=await createAdministrativeBoundaryLayer(service)
    handle.setFillOpacity?.(0)
    return handle
  }
  const handle=await createMapServiceLayer(service,undefined,options)
  const field=handle.categoryFilter?.fieldName||''
  const categories=(handle.categoryFilter?.values||[]).map(item=>{
    const style=['land','permanent','parcel'].includes(role)?resolveC5Style(field==='DLBM'?item.value:'',item.label):undefined
    const color=role==='project'?'#ffca5d':item.color||handle.color||'#56bccc'
    // Keep homepage's category swatches synchronized with the actual renderer.
    item.color=style?`rgb(${style.rgb.join(',')})`:color
    return {value:item.value,name:item.label,style,color}
  })
  handle.setRenderer?.(createTopicRenderer(field,categories,service.arcGisGeometryType,handle.color,'filled'))
  handle.setFillOpacity?.(1)
  return handle
}
