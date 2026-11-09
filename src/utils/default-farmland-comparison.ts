import { listEnabledMapServices } from '@/api/map-service'
import { analyzeSpatialOverlay, getSpatialLayers } from '@/api/spatial-analysis'
import { farmlandDefaults } from './farmland-analysis'

/** 首次访问只读取后端汇总，不下载几何、结果图层或分页；相同条件复用后端缓存。 */
export async function loadDefaultFarmlandComparison(deptId: string, signal: AbortSignal) {
  const services = await listEnabledMapServices(deptId)
  signal.throwIfAborted()
  const source = services.find(item => item.name.replace(/\s/g, '') === '海陵区高标准农田')
    || services.find(item => /海陵区.*高标准农田/.test(item.name.replace(/\s/g, '')))
  if (!source) throw new Error('当前部门没有可用的高标准农田基准服务。')
  const layers = await getSpatialLayers(String(source.id), deptId, { signal })
  signal.throwIfAborted()
  const defaults = farmlandDefaults(layers.filter(item => item.analyzable).map(item => ({
    key: `${source.id}/${item.layerId}`, sourceName: source.name, service: { name: item.name },
    role: /永久基本农田|永农/.test(item.name) || item.fields?.some(field => field.name === 'YJJBNTTBBH') ? 'permanent' : /行政区/.test(item.name) ? 'boundary' : 'unconfigured',
  })))
  if (!defaults.a || !defaults.b) throw new Error('未找到高标田与永久基本农田两类基准图层。')
  return analyzeSpatialOverlay({ deptId, sourceA: defaults.a, sourceB: defaults.b, minAreaSqm: 4, includeOverlapSpots: true }, { signal })
}
