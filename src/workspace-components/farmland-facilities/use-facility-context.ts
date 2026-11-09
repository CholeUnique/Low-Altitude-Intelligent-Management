import { computed, type Ref } from 'vue'
import type { GovernanceTaskDetail, TaskGeometryFeatureCollection } from '@/api/governance-task'
import { facilityDetailReference, facilityFacts, facilityGeometry } from '@/utils/facility-task'

/** 设施资料由任务详情按任务权限内嵌返回，不再依赖专题台账权限。 */
export function useFacilityContext(detail: Readonly<Ref<GovernanceTaskDetail | undefined>>, geometry: Readonly<Ref<TaskGeometryFeatureCollection | undefined>>) {
  const reference = computed(()=>facilityDetailReference(detail.value))
  const facility = computed(() => {
    const summary = detail.value?.facility
    return summary && reference.value && String(summary.id) === reference.value.id ? summary : undefined
  })
  const contextErrors = computed(() => {
    if (!reference.value) return []
    if (!detail.value?.facility) return ['任务关联的设施资料不可用，请核对设施是否已删除或任务关联是否有效。']
    if (!facility.value) return ['任务返回的设施摘要与关联 ID 不一致，请核对任务关联']
    return []
  })
  const facts = computed(()=>facilityFacts(detail.value?.task,facility.value,reference.value).filter(([,value])=>value!=null&&String(value).trim()!==''))
  const displayGeometry = computed(()=>geometry.value?.features.length ? geometry.value : facilityGeometry(facility.value))
  return {facility,facts,contextErrors,contextLoading:computed(()=>false),displayGeometry,reference}
}
