import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { getFacilityDetail, getFacilityGeoJson, type FacilityRecord } from '@/api/facility'
import type { GovernanceTaskDetail, TaskGeometryFeatureCollection } from '@/api/governance-task'
import { facilityFacts, facilityGeometry, facilityTaskReference } from '@/utils/facility-task'

/** 读取任务关联设施；现场照片统一由 FacilityReportImageGallery 管理。 */
export function useFacilityContext(detail: Readonly<Ref<GovernanceTaskDetail | undefined>>, geometry: Readonly<Ref<TaskGeometryFeatureCollection | undefined>>) {
  const facility = ref<FacilityRecord>(), errors = ref<string[]>([]), loading = ref(false)
  let version = 0
  watch(detail, async value => {
    const request = ++version
    facility.value=undefined;errors.value=[];loading.value=!!value
    if(!value)return
    const task=value.task
    const linked=facilityTaskReference(task,value.facilityId || value.facility?.id?.toString())
    try {
        if(!linked)return
        if(value.facility){
          if(String(value.facility.id)===linked.id){if(request===version)facility.value=value.facility;return}
          if(request===version)errors.value.push('任务返回的设施摘要与关联 ID 不一致，请核对任务关联')
          return
        }
        if(!task.deptId){if(request===version)errors.value.push('缺少任务归属部门，无法读取设施档案');return}
        try{
          const result=await getFacilityDetail(task.deptId,linked.id)
          if(String(result.id)!==linked.id || (linked.source==='report-description' && result.name?.trim()!==linked.expectedName))throw new Error('关联设施与原始上报记录不一致，请核对任务关联')
          if(request!==version)return
          if(request===version)facility.value=result
          // main 的设施地图接口可补充部分台账详情尚未带出的几何；只在详情读取成功后查询。
          if(!geometry.value?.features.length && !facilityGeometry(result).features.length) {
            try {
              const collection=await getFacilityGeoJson({deptId:task.deptId})
              if(request!==version)return
              const feature=collection.features.find(item=>String(item.properties?.facilityId)===linked.id)
              if(feature?.geometry)facility.value={...result,geometryType:feature.geometry.type,geometryJson:JSON.stringify(feature)}
            } catch(error) { if(request===version)errors.value.push(`设施位置补充读取失败：${error instanceof Error?error.message:'请稍后重试'}`) }
          }
        }
        catch(error){if(request===version){const message=error instanceof Error?error.message:'读取失败';errors.value.push(/无权限|无权访问|403|forbidden/i.test(message)?'任务可办理，但关联设施资料读取被接口拒绝。请核对任务与设施接口的授权衔接。':`设施档案：${message}`)}}
    } finally { if(request===version)loading.value=false }
  },{immediate:true})
  onScopeDispose(()=>{version++})
  const facts = computed(()=>facilityFacts(detail.value?.task,facility.value).filter(([,value])=>value!=null&&String(value).trim()!==''))
  const displayGeometry = computed(()=>geometry.value?.features.length ? geometry.value : facilityGeometry(facility.value))
  const reference = computed(()=>facilityTaskReference(detail.value?.task,detail.value?.facilityId || detail.value?.facility?.id?.toString()))
  return {facility,facts,contextErrors:errors,contextLoading:loading,displayGeometry,reference}
}
