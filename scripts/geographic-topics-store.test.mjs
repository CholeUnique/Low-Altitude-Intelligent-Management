import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import * as pinia from 'pinia'

const stored = new Map()
globalThis.localStorage = {getItem:key=>stored.get(key) ?? null,setItem:(key,value)=>stored.set(key,value)}
const useUserStore = pinia.defineStore('test-topic-user',()=>({currentUser:vue.ref({id:'user-a'}),activeDeptId:vue.ref('dept-a'),organizationId:vue.ref('agriculture-rural')}))
const source = ts.transpileModule(readFileSync('src/stores/geographic-topics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const module = {exports:{}}
new Function('require','module','exports',source)(id=>{
  if(id==='vue')return vue
  if(id==='pinia')return pinia
  if(id==='./user')return {useUserStore}
  throw Error(`Unexpected dependency ${id}`)
},module,module.exports)
const {useGeographicTopicsStore,HIGH_STANDARD_TOPIC_ID}=module.exports
pinia.setActivePinia(pinia.createPinia())
const user=useUserStore(),store=useGeographicTopicsStore()
assert.deepEqual(store.topics.map(t=>t.name),['高标准农田'],'专题目录不应继承任务业务场景')
const created=store.addTopic(' 农田设施专题 ','设施说明')
assert.throws(()=>store.addTopic('农田设施专题',''),/已存在/)
store.setPreference(HIGH_STANDARD_TOPIC_ID,'7/0',{mode:'boundary',visible:true})
store.setPreference(HIGH_STANDARD_TOPIC_ID,'7/1',{mode:'filled',visible:false})
store.setPreference(HIGH_STANDARD_TOPIC_ID,'7/0',{categoryModes:{'0101':'boundary','0102':'filled'}})
store.setPreference(created.id,'7/0',{mode:'filled'})
assert.equal(store.getPreference(HIGH_STANDARD_TOPIC_ID,'7/0').mode,'boundary')
assert.equal(store.getPreference(HIGH_STANDARD_TOPIC_ID,'7/1').mode,'filled','每个图层独立保存模式')
assert.equal(store.getPreference(created.id,'7/0').mode,'filled','不同专题独立保存相同图层的模式')
user.activeDeptId='dept-b';await vue.nextTick()
assert.equal(store.topics.length,1,'切换部门不能看到上一部门的自建专题')
user.activeDeptId='dept-a';await vue.nextTick()
assert.equal(store.topics.length,2)
assert.equal(store.getPreference(HIGH_STANDARD_TOPIC_ID,'7/0').visible,true)
user.currentUser={id:'user-b'};await vue.nextTick()
assert.equal(store.topics.length,1,'不同账号的配置必须隔离')
user.currentUser={id:'user-a'};await vue.nextTick()
pinia.setActivePinia(pinia.createPinia())
const restored=useGeographicTopicsStore()
assert.equal(restored.topics[1].id,created.id,'刷新后恢复新增专题')
assert.equal(restored.getPreference(HIGH_STANDARD_TOPIC_ID,'7/0').mode,'boundary')
assert.deepEqual({...restored.getPreference(HIGH_STANDARD_TOPIC_ID,'7/0').categoryModes},{'0101':'boundary','0102':'filled'},'刷新后独立恢复同一图层内各地类的显示模式')
assert.equal(restored.getPreference(HIGH_STANDARD_TOPIC_ID,'7/1').categoryModes,undefined,'不影响其他图层分类')
globalThis.localStorage.setItem=()=>{throw new Error('storage disabled')}
restored.setPreference(HIGH_STANDARD_TOPIC_ID,'7/0',{mode:'filled'})
assert.match(restored.storageError,/无法保存/,'保存失败不能伪装成已持久保存')
console.log('geographic topic profiles: independent catalogue, account/department isolation, layer modes, reload and storage failures passed')
