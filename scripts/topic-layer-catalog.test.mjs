import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
function load(path, dependencies = {}) {
  const module = {exports:{}}
  const source = ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  new Function('module','exports','require',source)(module,module.exports,id => dependencies[id])
  return module.exports
}
const topic = load('src/utils/geographic-topic.ts')
const {readTopicLayerCatalog,topicStatSources,groupTopicLayers,topicStatGroups} = load('src/utils/topic-layer-catalog.ts',{'./geographic-topic':topic})
const source = {id:'sample',name:'后端新数据',type:'ARCGIS_MAPSERVER',serviceUrl:'https://example.test/MapServer'}
const children = [{...source,id:'sample::0',arcGisLayerId:0,arcGisGeometryType:'esriGeometryPolygon'}, {...source,id:'sample::1',arcGisLayerId:1}]
const entries = await readTopicLayerCatalog(source,{
  expand:async()=>children,
  metadata:async service => {
    if(service.arcGisLayerId===1)throw Error('字段读取失败')
    return {fields:[{name:'CUSTOM_FIELD'}]}
  },
})
assert.equal(entries.length,2,'新字段图层和字段读取失败的图层均保留')
assert.equal(entries[0].role,'unconfigured')
assert.equal(entries[0].categoryField,'','没有地类字段时不虚构分类')
assert.equal(entries[1].error,'字段读取失败')
const unavailable = await readTopicLayerCatalog(source,{expand:async()=>{throw Error('服务离线')},metadata:async()=>({})})
assert.equal(unavailable[0].key,'sample/root','服务暂时不可用时仍保留后端配置条目')
assert.equal(unavailable[0].error,'服务离线')
const empty = await readTopicLayerCatalog(source,{expand:async()=>[],metadata:async()=>({})})
assert.equal(empty.length,1,'无法展开子层不能丢掉整个后端服务')
const imagery = await readTopicLayerCatalog({...source,type:'XYZ',dataType:'IMAGERY'},{expand:async item=>[item],metadata:async()=>({})})
assert.equal(imagery[0].role,'imagery','分类功能仍识别影像，不影响已有显隐配置')
const statLayer=(key,role,visible=true)=>({key,role,visible,sourceName:'九龙镇高标准农田数据'})
assert.deepEqual(topicStatSources([statLayer('9/2','boundary'),statLayer('9/1','permanent')]),[],'同一服务中的背景行政区和永久基本农田不触发高标统计')
assert.deepEqual(topicStatSources([statLayer('9/0','project'),statLayer('9/2','boundary')]),[{id:'9',name:'九龙镇高标准农田数据'}])
const distinct=groupTopicLayers([
  {key:'9/0',sourceName:'九龙镇高标准农田数据'},
  {key:'7/3',sourceName:'九龙镇高标农田数据'},
  {key:'9/1',sourceName:'九龙镇高标准农田数据'},
])
assert.deepEqual(distinct.map(group=>group.name),['九龙镇高标准农田数据','九龙镇高标农田数据'],'保留不同父服务的完整原名')
assert.deepEqual(distinct.map(group=>group.layers.length),[2,1],'按服务 ID 归组，不按相似名称合并')
assert.deepEqual(groupTopicLayers([{key:'a/0',sourceName:'同名服务'},{key:'b/0',sourceName:'同名服务'}]).map(group=>group.id),['a','b'],'即使完全同名，不同服务 ID 也不能混组')
const stats=[{name:'九龙镇高标准农田建设数据',items:[]}]
assert.equal(topicStatGroups(stats,[{id:'7',name:'九龙镇高标农田数据'}]).length,0,'没有关联依据时不把高标准农田统计套到高标农田服务')
assert.equal(topicStatGroups(stats,[{id:'9',name:'九龙镇高标准农田数据'}]).length,1)
assert.equal(topicStatGroups([{...stats[0],serviceId:'7'}],[{id:'7',name:'九龙镇高标农田数据'}]).length,1,'后台明确关联的服务 ID 优先')
console.log('topic catalog: unknown schemas, partial metadata failures, offline sources and imagery retained')
