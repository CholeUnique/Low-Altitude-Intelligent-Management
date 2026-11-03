import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {webcrypto} from 'node:crypto'
import ts from 'typescript'
import * as vue from 'vue'
import * as pinia from 'pinia'
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
function localId(crypto){const module={exports:{}};runInNewContext(compile('src/utils/local-id.ts'),{module,exports:module.exports,crypto});return module.exports.createLocalId}
assert.equal(localId({randomUUID:()=> 'native-uuid'})(),'native-uuid')
const fallback=localId({getRandomValues:array=>webcrypto.getRandomValues(array)})
assert.match(fallback(),/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/)
assert.equal(new Set(Array.from({length:1000},()=>fallback())).size,1000,'HTTP crypto fallback creates distinct local layer IDs')
const legacy=localId(undefined);assert.equal(new Set(Array.from({length:1000},()=>legacy())).size,1000,'No Web Crypto support must not prevent local layer creation')
const access={exports:{}};new Function('module','exports',compile('src/utils/access-control.ts'))(access,access.exports)
assert.equal(access.exports.recognitionTabPermission.topics,'special-analysis')
assert.equal(access.exports.firstAccessiblePath(key=>key==='special-analysis'),'/recognition/topics','Users granted only topic access can enter through shared navigation')
const storage=new Map([['auth_mode','real'],['current_user',JSON.stringify({id:'staff',role:'STAFF'})],['active_dept_id','1']])
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
let menus=[{code:'DATA_MANAGE',name:'数据管理'}]
const deps={vue,pinia,'@/mocks/portal':{getOrganization:()=>({id:'agriculture-rural'}),getRole:()=>({permissions:[]}),portalData:{organizations:[]}},'@/api/permission-management':{getUserDepartmentPermissions:async()=>[{deptId:'1',menus}]},'@/utils/access-control':access.exports,'@/utils/user-role':{isDepartmentAdmin:()=>false}}
const userModule={exports:{}};new Function('module','exports','require',compile('src/stores/user.ts'))(userModule,userModule.exports,id=>{assert(id in deps,`Unexpected ${id}`);return deps[id]})
pinia.setActivePinia(pinia.createPinia());const user=userModule.exports.useUserStore()
await user.ensureMenuPermissions();assert(user.hasPermission('data-management'));assert(!user.hasPermission('special-analysis'),'Data management never grants backend topic permissions')
menus=[{code:'SPECIAL_ANALYSIS',name:'专题分析'}];await user.ensureMenuPermissions(true)
assert(user.hasPermission('special-analysis'));assert(!user.hasPermission('data-management'),'Independent topic grant does not grant data-management access')
console.log('topic compatibility: HTTP/legacy local IDs and independent SPECIAL_ANALYSIS permission matching passed')
