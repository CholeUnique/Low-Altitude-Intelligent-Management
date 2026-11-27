import type { CurrentUser, OrganizationId } from '@/types'
import type { LandSceneCode } from '@/types/land-supervision'

export function isNaturalResourcesTopicDepartment(user:{organizationId:OrganizationId;activeDeptId?:string;currentUser:CurrentUser|null}) {
  const department=user.currentUser?.deptList?.find(item=>String(item.deptId)===String(user.activeDeptId))
  const name=department?.deptName||(!user.activeDeptId||String(user.currentUser?.deptId)===String(user.activeDeptId)?user.currentUser?.deptName:'')||''
  if(name.includes('农业农村')||department?.deptCode==='DEPT_NYNCJ')return false
  if(name.includes('自然资源')||/ZRZY|NATURAL/i.test(department?.deptCode||''))return true
  return !name&&user.organizationId==='natural-resources'
}
/** Keep previously shared preview links while sending the existing backend codes. */
export function resolveLandSceneCode(id: unknown): LandSceneCode | undefined {
  if(id==='ILLEGAL_LAND_EARLY_WARN'||id==='ILLEGAL_LAND_EARLY_WARNING')return 'ILLEGAL_LAND_EARLY_WARN'
  if(id==='STOCK_ILLEGAL_LAND_RECTIFY'||id==='ILLEGAL_LAND_RECTIFICATION')return 'STOCK_ILLEGAL_LAND_RECTIFY'
  return undefined
}
export function isLandSupervisionTopic(id: unknown) { return Boolean(resolveLandSceneCode(id)) }

/** Use the active department, rather than an unrelated membership or administrator role. */
export function isAgricultureTopicDepartment(user:{organizationId:OrganizationId;activeDeptId?:string;currentUser:CurrentUser|null}) {
  const department=user.currentUser?.deptList?.find(item=>String(item.deptId)===String(user.activeDeptId))
  const name=department?.deptName||(!user.activeDeptId||String(user.currentUser?.deptId)===String(user.activeDeptId)?user.currentUser?.deptName:'')||''
  if(department?.deptCode==='DEPT_NYNCJ'||name.includes('农业农村'))return true
  if(name.includes('自然资源')||/ZRZY|NATURAL/i.test(department?.deptCode||''))return false
  return user.organizationId==='agriculture-rural'
}
