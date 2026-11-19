import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as Vue from 'vue'

const calls = []
let release
const getFacilityDetail = (deptId, id) => { calls.push({ deptId, id }); return new Promise(resolve => { release = resolve }) }
globalThis.window = { addEventListener() {}, removeEventListener() {} }
let source = readFileSync('src/components/FacilityDetailDialog.vue', 'utf8')
source = source.replace('</script>', 'defineExpose({ record, loading, error });\n</script>')
const script = compileScript(parse(source).descriptor, { id: 'facility-detail-test' }).content
const compiled = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled)(name => {
  if (name === 'vue') return Vue
  if (name === '@/api/facility') return { getFacilityDetail }
  throw new Error(`Unexpected dependency: ${name}`)
}, module, module.exports)
const renderer = Vue.createRenderer({ createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {}, setText() {}, setElementText() {}, parentNode() {}, nextSibling() {}, patchProp() {} })
const component = module.exports.default
component.render = () => null
const app = renderer.createApp(component, { deptId: 'dept-a', id: '123456789012345678' })
const vm = app.mount({})
assert.deepEqual(calls, [{ deptId: 'dept-a', id: '123456789012345678' }])
assert.equal(vm.loading, true)
release({ id: '123456789012345678', name: '涵洞' })
await new Promise(resolve => setImmediate(resolve))
assert.equal(vm.record.name, '涵洞')
assert.equal(vm.loading, false)
app.unmount()
console.log('Facility detail dialog checks passed')
