import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync('src/views/AlgorithmRepositoryView.vue', 'utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1]
const ast = ts.createSourceFile('catalog.ts', source, ts.ScriptTarget.Latest, true)
const declarations = new Map()
for (const statement of ast.statements) {
  if (!ts.isVariableStatement(statement)) continue
  for (const declaration of statement.declarationList.declarations) {
    if (declaration.initializer) declarations.set(declaration.name.getText(ast), declaration.initializer.getText(ast))
  }
}
const algorithms = new Function(`return (${declarations.get('algorithms')})`)()
const groups = new Function('algorithms', `return (${declarations.get('capabilityGroups')})`)(algorithms)
const module = { exports: {} }
const compiled = ts.transpileModule(readFileSync('src/utils/algorithm-catalog.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
new Function('module', 'exports', compiled)(module, module.exports)
const { matchesAlgorithmCapability: matches, availableCapabilityGroups: available } = module.exports
const spatial = algorithms.filter(model => model.family === 'spatial')
const ids = capability => spatial.filter(model => matches(model, capability)).map(model => model.id)

assert.deepEqual(ids('相交分析'), ['sp-overlay', 'sp-clip'])
assert.deepEqual(ids('包含判断'), ['sp-range'])
assert.deepEqual(ids('提取'), ['sp-clip'])
assert.deepEqual(ids('距离测算'), ['sp-distance'])
assert.deepEqual(ids('融合'), [])
assert.deepEqual(ids('路径分析'), [])
assert.deepEqual(ids('服务区分析'), [])
const snapshot = JSON.stringify(groups)
const visible = available(spatial, groups.spatial)
assert.deepEqual(visible.map(group => [group.title, group.items.length]), [
  ['基础空间分析', 3], ['空间关系计算', 4], ['数据处理', 2],
])
for (const family of ['ai', 'spatial']) {
  const models = algorithms.filter(model => model.family === family)
  for (const group of available(models, groups[family])) {
    assert(group.items.length > 0)
    for (const item of group.items) assert(models.some(model => matches(model, item)), `${family}/${item} must have a catalog entry`)
  }
}
assert.deepEqual(available([], groups.spatial), [])
assert.equal(available(spatial.filter(model => model.id !== 'sp-range'), groups.spatial)
  .some(group => group.items.includes('包含判断')), false)
assert.equal(JSON.stringify(groups), snapshot, 'Filtering must not mutate the catalog definitions')
console.log('algorithm catalog checks passed')
