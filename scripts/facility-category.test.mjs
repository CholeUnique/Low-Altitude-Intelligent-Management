import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const module = { exports: {} }
const source = ts.transpileModule(readFileSync('src/utils/facility-category.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
new Function('module', 'exports', source)(module, module.exports)
const { facilityCategoryFromName } = module.exports
assert.equal(facilityCategoryFromName('涵洞-001'), '涵洞')
assert.equal(facilityCategoryFromName('涵洞-012'), '涵洞')
assert.equal(facilityCategoryFromName('村砌明渠（沟）-024'), '村砌明渠（沟）')
assert.equal(facilityCategoryFromName('道路_003'), '道路')
assert.equal(facilityCategoryFromName('2号泵站'), '2号泵站')
assert.equal(facilityCategoryFromName(''), '未分类')
console.log('facility categories: numbered names grouped without modifying other names')
