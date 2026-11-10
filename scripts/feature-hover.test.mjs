import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const module={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/feature-hover-caption.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports)
const caption=module.exports.featureHoverCaption
assert.deepEqual(caption({DLMC:'水田',XMMC:'工程项目'}),{label:'地类名称',value:'水田'})
assert.equal(caption({DLMC:' ',DKMC:'一号地块'}).value,'一号地块','Empty type must fall back per feature, not just per schema')
assert.equal(caption({DLMC:null,NAME:'named'}).value,'named')
assert.equal(caption({DLMC:'<null>',NAME:'named'}).value,'named')
assert.equal(caption({kind:'水浇地',NAME:'name'},[{name:'kind',alias:'地物类型'}]).value,'水浇地','Recognize Chinese aliases of custom service fields')
assert.equal(caption({项目类:'历史项目补录',NAME:'name'}).value,'历史项目补录')
assert.equal(caption({TYPE:0,NAME:'name'}).value,'0','Zero is a valid type value')
assert.equal(caption({analysisMembership:'仅高标（非永农）',seqNo:1}).value,'仅高标（非永农）')
assert.deepEqual(caption({OBJECTID:123},[],'上传图层','OBJECTID'),{label:'名称',value:'上传图层'},'Do not use technical IDs as names')
assert.equal(caption({TITLE:'自定义名称'},[],'图层','TITLE').value,'自定义名称')
assert.equal(caption(null,[],'上传范围').value,'上传范围')
assert.equal(caption({ZLDWMC:'孙金村'},[{name:'ZLDWMC',alias:'坐落单位名称'}],'村级行政区划').value,'孙金村','裁切区划悬浮显示真实村名')
assert.equal(caption({DLMC:'<img src=x onerror=alert(1)>'}).value,'<img src=x onerror=alert(1)>','Caption values remain text, rendering uses textContent')
console.log('feature hover: per-feature type/name priority, aliases, blank values, zero values, analysis membership and technical-ID exclusion passed')
