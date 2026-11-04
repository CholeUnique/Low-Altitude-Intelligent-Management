import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const module = {exports:{}}
const source = ts.transpileModule(readFileSync('src/utils/topic-feature-fields.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const areaModule = {exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/topic-area.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(areaModule,areaModule.exports)
new Function('module','exports','require',source)(module,module.exports,()=>areaModule.exports)
const {topicFeatureRows} = module.exports
const rows = [
  {name:'SSXMMC',label:'SSXMMC',value:'九龙镇农田项目'},
  {name:'MJ',label:'MJ',value:'1200'},
  {name:'JYZTMC_1',label:'JYZTMC_1',value:'经营主体'},
  {name:'Shape_Area',label:'Shape_Area',value:'0.0002'},
  {name:'OBJECTID',label:'OBJECTID',value:'1'},
  {name:'GGSY',label:'GGSY',value:'—'},
]
assert.deepEqual(topicFeatureRows(rows,'parcel').map(row=>row.label),['所属项目名称','面积（亩）','经营主体名称'])
assert.equal(topicFeatureRows([{name:'DLBM',value:'0101'}],'land')[0].value,'0101','地类编码保留前导零')
assert.equal(topicFeatureRows([{name:'ZLDWMC',value:'九龙镇'}],'land')[0].label,'坐落单位名称')
assert.equal(topicFeatureRows([{name:'SFSC',value:'0'}],'land')[0].value,'0','合法零值不能当作空值丢弃')
assert.equal(topicFeatureRows([{name:'UNKNOWN',label:'未知',value:'123'}],'land').length,0,'不暴露未配置字段')
const permanent = topicFeatureRows([
  {name:'DLBM',value:'0101'},{name:'XZQMC',value:'界沟村'},{name:'YJJBNTTBBH',value:'32120100207000146'},
  {name:'DLMC',value:'水田'},{name:'QSDWMC',value:'界沟村'},{name:'ZLDWMC',value:'界沟村'},
  {name:'YJJBNTTBMJ',value:'32905.09'},{name:'YJJBNTMJ',value:'32905.09'},
  {name:'ZZSXMC',value:'种植粮食作物'},{name:'SJNF',value:'2020'},
],'permanent')
assert.equal(permanent.length,8,'永久基本农田仅保留截图红框八项，不重复展示另一面积字段')
assert.equal(permanent[0].label,'行政区名称')
assert.equal(permanent[5].label,'永久基本农田图斑面积（亩）')
assert.equal(permanent[7].label,'数据年份')
assert.equal(topicFeatureRows(rows,'parcel')[1].value,'1.8','PDF 定义的 MJ 平方米换算为亩')
assert.equal(permanent[5].value,'49.36','永久基本农田图斑面积转换为亩')
assert.equal(topicFeatureRows([{name:'MJ',label:'面积（亩）',value:'1200'}],'parcel')[0].value,'1,200','明确已为亩的属性不能重复换算')
assert.equal(topicFeatureRows([{name:'LZGM',value:'10000'}],'parcel')[0].value,'15','流转规模按属性表的平方米换算')
assert.equal(rows[1].value,'1200','不修改源属性')
console.log('topic fields: mu conversion, explicit units, PDF labels and source preservation passed')
