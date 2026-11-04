import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const module = {exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/topic-area.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports)
const {squareMetresToMu,muToSquareMetres,formatMu,formatSquareMetresAsMu,topicAreaMetric,topicAreaAttribute} = module.exports
assert.equal(squareMetresToMu(10000),15)
assert.equal(muToSquareMetres(.006),4,'UI threshold retains the exact original API threshold')
assert.equal(muToSquareMetres(15),10000,'UI maximum matches the API maximum')
assert.equal(formatSquareMetresAsMu(20000),'30')
assert.equal(formatSquareMetresAsMu(4),'0.006','Small filtering thresholds must not round to zero')
assert.equal(formatSquareMetresAsMu(.01),'<0.0001','Tiny nonzero polygons remain distinguishable from zero')
for(const value of [undefined,null,'',NaN,Infinity,'—'])assert.equal(formatSquareMetresAsMu(value),'—')
assert.equal(formatMu(0),'0')
const metric={name:'耕地面积',value:'11,756.21',unit:'亩'}
assert.deepEqual(topicAreaMetric(metric),metric,'Already-mu backend statistics are not converted twice')
assert.equal(topicAreaMetric({value:'10,000',unit:'㎡'}).value,'15')
assert.equal(topicAreaMetric({value:'2',unit:'公顷'}).value,'30')
assert.equal(topicAreaMetric({value:'1',unit:'km²'}).value,'1,500')
assert.equal(topicAreaMetric({value:'—',unit:'平方米'}).value,'—')
const count={value:'3',unit:'个'};assert.equal(topicAreaMetric(count),count,'Counts remain unchanged')
assert.deepEqual(topicAreaAttribute('YJJBNTTBMJ','永久基本农田图斑面积','32905.09'),{label:'永久基本农田图斑面积（亩）',value:'49.36'})
assert.equal(topicAreaAttribute('MJ','面积（亩）','100').value,'100','Explicit field unit overrides documented default')
assert.equal(topicAreaAttribute('unknown','范围面积（公顷）','2').value,'30')
assert.equal(topicAreaAttribute('areaMu','结果面积',15).value,'15')
assert.equal(topicAreaAttribute('Shape_Area','Shape_Area',.00001),undefined,'Unknown geometry storage units must not be guessed')
assert.equal(topicAreaAttribute('BSM','标识码','32120100207000146'),undefined,'Identifiers must not be rounded or converted')
assert(!readFileSync('src/components/TopicOverlayAnalysis.vue','utf8').includes('<small>㎡</small>'))
console.log('topic area: mu conversion, API threshold round-trip, explicit units, tiny polygons and source semantics passed')
