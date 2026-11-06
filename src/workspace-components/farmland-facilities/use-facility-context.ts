import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { getFacilityDetail, getFacilityReportImage, type FacilityRecord } from '@/api/facility'
import type { GovernanceTaskDetail, TaskGeometryFeatureCollection } from '@/api/governance-task'
import { facilityFacts, facilityGeometry, facilityTaskReference } from '@/utils/facility-task'

/** 任务关联设施档案与现场上报照片；辅助资料失败不阻止流程办理。 */
export function useFacilityContext(detail: Readonly<Ref<GovernanceTaskDetail | undefined>>, geometry: Readonly<Ref<TaskGeometryFeatureCollection | undefined>>) {
  const facility = ref<FacilityRecord>(), errors = ref<string[]>([]), loading = ref(false)
  const photos = ref<Array<{id:string;name:string;url?:string;error?:string}>>([])
  let version = 0
  const clear = () => { photos.value.forEach(photo=>{if(photo.url)URL.revokeObjectURL(photo.url)});photos.value=[] }
  watch(detail, async value => {
    const request = ++version
    clear(); facility.value=undefined;errors.value=[];loading.value=!!value
    if(!value)return
    const task=value.task
    const linked=facilityTaskReference(task,value.facilityId || value.facility?.id?.toString())
    const items=[...(value.reportImages || [])].sort((a,b)=>(a.sortNo || 0)-(b.sortNo || 0))
    photos.value=items.map(item=>({id:String(item.imageId),name:item.fileName}))
    await Promise.all([
      (async()=>{
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
          if(request===version)facility.value=result
        }
        catch(error){if(request===version){const message=error instanceof Error?error.message:'读取失败';errors.value.push(/无权限|无权访问|403|forbidden/i.test(message)?'任务可办理，但当前账号无权读取设施台账详情。需后端在任务详情中提供关联设施资料。':`设施档案：${message}`)}}
      })(),
      ...items.map(async(item,index)=>{
        try{const blob=await getFacilityReportImage(item.imageId);if(request!==version)return;if(!(blob instanceof Blob)||!blob.type.startsWith('image/'))throw new Error('照片接口未返回有效图片');photos.value[index]!.url=URL.createObjectURL(blob)}
        catch(error){if(request===version)photos.value[index]!.error=error instanceof Error?error.message:'照片读取失败'}
      }),
    ])
    if(request===version)loading.value=false
  },{immediate:true})
  onScopeDispose(()=>{version++;clear()})
  const facts = computed(()=>facilityFacts(detail.value?.task,facility.value).filter(([,value])=>value!=null&&String(value).trim()!==''))
  const displayGeometry = computed(()=>geometry.value?.features.length ? geometry.value : facilityGeometry(facility.value))
  const reference = computed(()=>facilityTaskReference(detail.value?.task,detail.value?.facilityId || detail.value?.facility?.id?.toString()))
  return {facility,facts,photos,contextErrors:errors,contextLoading:loading,displayGeometry,reference}
}
