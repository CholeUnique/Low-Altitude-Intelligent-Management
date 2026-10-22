import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
function load(path) {
  const module = {exports:{}}
  const source = ts.transpileModule(readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  new Function('module','exports',source)(module,module.exports)
  return module.exports
}
const topic = load('src/utils/geographic-topic.ts')
const styles = load('src/utils/land-survey-c5.ts')
const service = {name:'普通数据',type:'ARCGIS_MAPSERVER',serviceUrl:'https://example.test/MapServer'}
assert.equal(topic.topicRole(service,['DLBM','DLMC']),'land')
assert.equal(topic.topicRole(service,['DLBM','DLMC','YJJBNTTBBH']),'permanent')
assert.equal(topic.topicRole(service,['GCMC','SFGBXMJS']),'facility')
assert.equal(topic.topicRole({...service,type:'WMS'},[]),'unconfigured','WMS 不是天然的影像底图')
assert.equal(topic.topicIncludes('facility',topic.HOMESTEAD),false)
assert.equal(topic.topicIncludes('facility',topic.NON_GRAIN),true)
assert.equal(topic.topicIncludes('land',topic.NON_GRAIN,topic.HOMESTEAD),false)
assert.equal(topic.topicIncludes('land',''),false)
assert.equal(topic.topicBaseWhere('land',topic.HOMESTEAD),"DLBM = '0702'")
assert.equal(topic.topicBaseWhere('changes',topic.HOMESTEAD),'"2025DLTB" = \'农村宅基地\'', '数字开头的 ArcGIS 字段必须带标识符引号')
assert.equal(topic.combineWhere("DLBM = '0702'",'1=0'),'1=0')
assert.equal(topic.categoryWhere('DLBM',[],['0101']),'1=0')
assert.equal(topic.categoryWhere('DLBM',['0101'],['0101']),'1=1')
assert.equal(topic.categoryWhere('名称',["O'Brien"],['a',"O'Brien"]),"名称 IN ('O''Brien')")
assert.equal(styles.resolveC5Style('203').name,'村庄')
assert.equal(styles.resolveC5Style('0203').name,'橡胶园')
assert.equal(styles.resolveC5Style('1104A','养殖坑塘').mapped,false)
assert.equal(styles.resolveC5Style('1208','后备耕地').mapped,false)
assert.equal(styles.resolveC5Style('101').mapped,false,'禁止猜测缺失的前导零')
assert.equal(styles.resolveC5Style('', '公用设施用地').code,'0809')
assert.deepEqual(styles.resolveC5Style('0702').rgb,[236,137,138])
assert.equal(new Set(styles.C5_STYLES.map(item=>item.code)).size,styles.C5_STYLES.length)
console.log('geographic topics: scene scope, SQL filters, unknown codes and C.1/C.2 identity passed')
