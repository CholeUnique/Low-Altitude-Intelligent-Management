import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const module={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/topic-layer-search.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports)
const {matchesTopicText,topicSearchCategories,indexTopicProperties,matchingTopicPropertyRows,matchesTopicProperties}=module.exports
const categories=[{name:'孙金村',value:'code:001',checked:true},{name:'界沟村',value:'code:002',checked:false}]
const snapshot=JSON.stringify(categories)
assert.deepEqual(topicSearchCategories('孙金村',['村级行政区划'],categories),[categories[0]])
assert.deepEqual(topicSearchCategories('CODE:002',['村级行政区划'],categories),[categories[1]],'未勾选的匹配分类仍可找到并重新开启')
assert.equal(topicSearchCategories('村级行政区划',['村级行政区划'],categories).length,2,'命中图层名称保留全部分类')
assert.equal(topicSearchCategories('',['村级行政区划'],categories).length,2,'清空恢复完整列表')
assert.equal(JSON.stringify(categories),snapshot,'搜索不修改分类的勾选状态')
const rows=indexTopicProperties([{attributes:{OBJECTID:2,VILLAGE:'孙金村',CODE:'000011',REMARK:'待维修'}},{attributes:{OBJECTID:3,VILLAGE:'界沟村',CODE:'000012',REMARK:null}}],'OBJECTID',[{value:'code:001',objectIds:[2,4]},{value:'code:002',objectIds:[3]}])
assert.equal(matchingTopicPropertyRows('待维修',rows)[0].category,'code:001','任意业务属性命中后定位到原分类')
assert.equal(matchingTopicPropertyRows('000011',rows)[0].category,'code:001','属性编号保留前导零')
assert.equal(matchingTopicPropertyRows('孙金村',rows).length,1)
assert.equal(matchesTopicProperties('water',{type:'WATER',count:0}),true)
assert.equal(matchesTopicProperties('0',{count:0}),true)
assert.equal(matchesTopicText('不存在','村级行政区划'),false)
console.log('Topic search: layer/category names, codes, arbitrary properties, administrative membership, unchecked matches and state preservation passed')
