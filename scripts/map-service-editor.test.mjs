import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { parse, compileTemplate } from '@vue/compiler-sfc'
import { parse as parseTemplate } from '@vue/compiler-dom'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

const component = readFileSync('src/components/MapServiceManagementPanel.vue', 'utf8')
const { descriptor } = parse(component)
const ast = ts.createSourceFile('editor.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const names = ['submitService', 'getServiceUrlWarnings', 'serviceTypeLabel', 'fillForm', 'toDateTimeLocal', 'toServiceTime']
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
assert.equal(functions.length, names.length)
const options = ast.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === 'serviceTypeOptions')
const executable = ts.transpileModule(`const ${options.getText(ast)};\n${functions.map(node => node.getText(ast)).join('\n')}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const calls = [], errors = [], successes = []
const state = { form: {}, editorMode: { value: 'edit' }, editorOpen: { value: true }, busy: { value: false }, departments: { value: [] }, dataTypeOptions: { value: [{ value: 'IMAGE', label: '影像' }] }, metadataError: { value: '' }, originalTopicCode: { value: '' } }
const api = new Function('context', `const {form, editorMode, editorOpen, busy, departments, dataTypeOptions, metadataError, originalTopicCode, showError, showSuccess, addMapService, updateMapService, loadServices} = context;
  const ref = value => ({ value });
  ${executable}; return {${names.join(',')}, serviceTypeOptions};`)(
  { ...state, showError: error => errors.push(error.message), showSuccess: message => successes.push(message),
    addMapService: async payload => calls.push({ mode: 'add', payload }), updateMapService: async payload => calls.push({ mode: 'edit', payload }), loadServices: async () => {} })

api.serviceTypeOptions.value = [{ value: 'ARCGIS_MAPSERVER', label: 'ArcGIS MapServer' }, { value: 'WMS', label: 'WMS' }, { value: 'WMTS', label: 'WMTS' }]
api.fillForm({ id: 9, name: '测试图层', type: 'ARCGIS_MAPSERVER', dataType: 'IMAGE', topicCode: '', serviceUrl: 'https://maps.example.com/geoserver/wms?layers=workspace:plots', status: 1, sort: 3, serviceTime: '2026-10-21T07:06:17.529Z', deptIds: [2], deptNames: ['农业农村局'] })
assert.equal(state.form.type, 'ARCGIS_MAPSERVER', 'Opening the editor retains the saved type until explicitly changed')
assert.equal(api.toServiceTime(state.form.serviceTime), '2026-10-21T07:06:00.000Z', 'Service time round-trips through the local datetime control')
state.form.type = 'WMS'
await api.submitService()
assert.equal(calls[0].mode, 'edit')
assert.deepEqual(calls[0].payload, { id: 9, name: '测试图层', type: 'WMS', dataType: 'IMAGE', topicCode: undefined, serviceUrl: state.form.serviceUrl, sort: 3, serviceTime: '2026-10-21T07:06:00.000Z', remark: undefined, deptIds: ['2'] })
assert.equal(state.editorOpen.value, false)
assert.equal(state.busy.value, false)

state.form.type = ''
await api.submitService()
assert.equal(calls.length, 1, 'Editing cannot silently drop the required type')
assert.equal(errors.at(-1), '请选择服务类型')
state.form.type = 'WMTS'
state.editorMode.value = 'view'
await api.submitService()
assert.equal(calls.length, 1, 'Viewing details never submits a service mutation')
state.editorMode.value = 'add'
await api.submitService()
assert.equal(calls[1].mode, 'add')
assert.equal(calls[1].payload.type, 'WMTS')
assert.equal(calls[1].payload.id, undefined)
state.busy.value = true
await api.submitService()
assert.equal(calls.length, 2, 'Repeated clicks during save cannot duplicate the request')

const address = 'http://localhost:9090/geoserver/mygeoserver/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=workspace:plots&maxFeatures=50'
assert.equal(api.getServiceUrlWarnings(address).length, 2, 'The screenshot configuration has both WFS and localhost problems')
assert.match(api.getServiceUrlWarnings(address)[0], /只改类型不能转换协议/)
assert.equal(api.getServiceUrlWarnings('https://maps.example.com/geoserver/wms?service=WMS').length, 0)
assert.equal(api.getServiceUrlWarnings('https://maps.example.com/geoserver/wfs').length, 1)
assert.equal(api.getServiceUrlWarnings('http://127.0.0.1:9090/wms').length, 1)
assert.equal(api.getServiceUrlWarnings('http://[::1]:9090/wms').length, 1)
assert.equal(api.getServiceUrlWarnings('https://demo.localhost/wms').length, 1)
assert.deepEqual(api.getServiceUrlWarnings('unfinished address'), [], 'Typing an incomplete address does not interrupt editing')

// Render the actual service-type branches in add/edit/view modes (not a hand-written replacement).
const template = parseTemplate(descriptor.template.content)
let labels
function findTypeBranches(node) {
  if (node.children) {
    const children = node.children.filter(child => child.type === 1)
    const index = children.findIndex(child => child.tag === 'label' && child.loc.source.includes('v-model="form.type"'))
    if (index >= 0) labels = children.slice(index, index + 2).map(child => child.loc.source).join('\n')
    node.children.forEach(findTypeBranches)
  }
}
findTypeBranches(template)
assert(labels)
const compiled = compileTemplate({ source: `<form>${labels}</form>`, filename: 'service-type.vue', id: 'service-type', ssr: true, ssrCssVars: [] })
assert.deepEqual(compiled.errors, [])
const ssrModule = { exports: {} }
const js = ts.transpileModule(compiled.code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
new Function('module', 'exports', 'require', js)(ssrModule, ssrModule.exports, createRequire(import.meta.url))
async function render(mode, type = 'WMS') {
  return renderToString(createSSRApp({ data: () => ({ editorMode: mode, form: { type }, serviceTypeOptions: api.serviceTypeOptions.value, serviceTypeLabel: api.serviceTypeLabel }), ssrRender: ssrModule.exports.ssrRender }))
}
for (const mode of ['add', 'edit']) {
  const html = await render(mode)
  assert.match(html, /<select[^>]*required[^>]*aria-label="服务类型"/)
  assert.match(html, /value="WMS" selected/)
  assert.doesNotMatch(html, /readonly|只读/)
}
const details = await render('view')
assert.doesNotMatch(details, /<select/)
assert.match(details, /readonly/)
assert.match(await render('edit', 'LEGACY_SERVICE'), /LEGACY_SERVICE（原配置）/, 'Legacy types are preserved instead of silently being overwritten')

// The adapter must actually forward the changed type to the supported update endpoint.
const serviceAst = ts.createSourceFile('map-service.ts', readFileSync('src/api/map-service.ts', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const update = serviceAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'updateMapService')
const adapterModule = { exports: {} }, adapterCalls = []
new Function('module', 'exports', 'apiClient', ts.transpileModule(update.getText(serviceAst), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(adapterModule, adapterModule.exports,
  { post: async (path, payload) => adapterCalls.push({ path, payload }) })
await adapterModule.exports.updateMapService(calls[0].payload)
assert.deepEqual(adapterCalls, [{ path: '/v1/map/service/update', payload: calls[0].payload }])
console.log('map-service-editor: editable add/edit types, read-only detail, update payload, required validation, legacy values and WFS/localhost warnings passed')
