import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const module={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/map-measurement.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports)
const {geodesicArea,formatDistance,formatArea}=module.exports
const ring=[{lat:0,lng:0},{lat:0,lng:.01},{lat:.01,lng:.01},{lat:.01,lng:0}]
assert(geodesicArea(ring)>1_230_000&&geodesicArea(ring)<1_240_000,'赤道附近约一平方公里范围的球面面积')
assert(Math.abs(geodesicArea(ring)-geodesicArea([...ring].reverse()))<.01,'绘制方向不影响面积')
assert.equal(geodesicArea([]),0)
assert.equal(formatDistance(1200),'1.20 公里')
assert.equal(formatArea(200),'200 平方米')
console.log('map measurement: spherical area, winding, empty input and units passed')
