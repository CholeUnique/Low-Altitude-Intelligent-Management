import type { CurrentUser, OrganizationId } from '@/types'

/** Use the active department, rather than an unrelated membership or administrator role. */
export function isAgricultureTopicDepartment(user:{organizationId:OrganizationId;activeDeptId?:string;currentUser:CurrentUser|null}) {
  const department=user.currentUser?.deptList?.find(item=>String(item.deptId)===String(user.activeDeptId))
  const name=department?.deptName||(!user.activeDeptId||String(user.currentUser?.deptId)===String(user.activeDeptId)?user.currentUser?.deptName:'')||''
  if(department?.deptCode==='DEPT_NYNCJ'||name.includes('农业农村'))return true
  if(name.includes('自然资源')||/ZRZY|NATURAL/i.test(department?.deptCode||''))return false
  return user.organizationId==='agriculture-rural'
}
