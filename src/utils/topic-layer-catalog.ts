import type { MapServiceItem } from '@/api/map-service'
import { topicRole } from './geographic-topic'
import type { TopicRole } from './geographic-topic'
import type { CustomStatGroup } from '@/api/business-statistics'

export function topicStatGroups(groups:CustomStatGroup[],sources?:{id:string; name:string}[]) {
  if (!sources) return groups
  const key = (name:string) => name.replace(/建设数据$|数据$/g,'').replace(/\s+/g,'')
  return groups.filter(group => sources.some(source => group.serviceId
    ? group.serviceId === source.id
    : key(group.serviceName || group.name) === key(source.name)))
}

/** 按后端服务 ID 归组，名称原样保留；“高标”和“高标准”不是同一个服务。 */
export function groupTopicLayers<T extends {key:string; sourceName:string}>(layers:T[]) {
  const groups = new Map<string,{id:string; name:string; layers:T[]}>()
  layers.forEach(layer => {
    const id = layer.key.split('/')[0]!
    const group = groups.get(id)
    if (group) group.layers.push(layer)
    else groups.set(id,{id,name:layer.sourceName,layers:[layer]})
  })
  return [...groups.values()]
}

export function topicStatSources(layers: {key:string; visible:boolean; sourceName:string; role:TopicRole}[]) {
  return [...new Map(layers
    .filter(item => item.visible && item.role !== 'boundary' && item.role !== 'permanent' && /高标(?:准)?农田/.test(item.sourceName))
    .map(item => [item.key.split('/')[0]!,{id:item.key.split('/')[0]!,name:item.sourceName}])).values()]
}

interface CatalogReader {
  expand: (source: MapServiceItem) => Promise<MapServiceItem[]>
  metadata: (service: MapServiceItem) => Promise<{fields?: {name?: string}[]}>
}
/** 业务字段只决定可用的分类功能，不决定图层是否进入用户配置列表。 */
export async function readTopicLayerCatalog(source: MapServiceItem, reader: CatalogReader) {
  let services: MapServiceItem[]
  let sourceError = ''
  try { services = await reader.expand(source) }
  catch (reason) {
    services = [source]
    sourceError = reason instanceof Error ? reason.message : '服务信息暂时无法读取'
  }
  if (!services.length) services = [source]
  return Promise.all(services.map(async service => {
    let fields: string[] = []
    let error = sourceError
    if (service.arcGisLayerId !== undefined) {
      try { fields = (await reader.metadata(service)).fields?.map(field => field.name || '').filter(Boolean) || [] }
      catch (reason) { error = reason instanceof Error ? reason.message : '字段信息暂时无法读取' }
    }
    const role = topicRole(service,fields)
    const categoryField = ['DLBM','DLMC','变化类','XMLX','GCMC'].find(field => fields.includes(field)) || ''
    return {key:`${source.id}/${service.arcGisLayerId ?? 'root'}`,service,sourceName:source.name,fields,role,categoryField,error}
  }))
}
