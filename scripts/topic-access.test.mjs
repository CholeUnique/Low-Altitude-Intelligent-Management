import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const module={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/topic-access.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports)
const {isAgricultureTopicDepartment:allowed}=module.exports
const user={organizationId:'agriculture-rural',activeDeptId:'1',currentUser:{role:'ADMIN',deptList:[{deptId:'1',deptName:'农业农村局',deptCode:'DEPT_NYNCJ'},{deptId:'2',deptName:'自然资源和规划局',deptCode:'DEPT_ZRZYJ'}]}}
assert(allowed(user))
assert(!allowed({...user,activeDeptId:'2'}),'Other agriculture memberships do not grant access in the natural-resources view')
assert(allowed({...user,organizationId:'natural-resources'}),'Actual active agriculture department takes precedence over old browser organization')
assert(!allowed({...user,activeDeptId:'2',currentUser:{...user.currentUser,deptList:[{deptId:'2',deptName:'自规局',deptCode:'DEPT_ZRZYJ'}]}}))
assert(!allowed({organizationId:'natural-resources',currentUser:null}))
console.log('topic access: agriculture view only, active-department priority and natural-resources exclusion passed')
