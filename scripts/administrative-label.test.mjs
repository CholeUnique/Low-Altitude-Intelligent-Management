import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const js=ts.transpileModule(readFileSync('src/utils/administrative-label.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const module={exports:{}};new Function('module','exports',js)(module,module.exports)
const point=module.exports.polygonLabelPoint
assert.deepEqual(point([[[0,0],[10,0],[10,10],[0,10],[0,0]]]),[5,5])
const p=point([[[0,0],[10,0],[10,10],[0,10],[0,0]],[[4,4],[6,4],[6,6],[4,6],[4,4]]])
assert(!(p[0]>4 && p[0]<6 && p[1]>4 && p[1]<6),'label must avoid hole')
assert.equal(point([]),undefined)
console.log('Administrative label interior and hole checks passed')
