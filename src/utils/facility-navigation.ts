import type { RouteLocationRaw } from 'vue-router'
import { FACILITIES_TOPIC_ID } from '@/stores/geographic-topics'

export function facilityStatisticDestination(label: string): { route: RouteLocationRaw; name: string } | undefined {
  if (label === '设施总数' || label === '正常') {
    return { route: { name: 'recognition', params: { tab: 'topics' }, query: { topic: FACILITIES_TOPIC_ID, view: 'map' } }, name: '工程设施地图' }
  }
  if (label === '异常' || label === '核查中' || label === '废弃') {
    return { route: { name: 'task-list', query: { sceneCode: 'farmland-facilities' } }, name: '工程设施任务列表' }
  }
  return undefined
}
