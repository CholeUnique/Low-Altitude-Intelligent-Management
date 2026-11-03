import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as vue from 'vue'
import axios from 'axios'

function evaluate(source, dependencies) {
  const module = { exports: {} }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', 'localStorage', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`)
    return dependencies[name]
  }, module, module.exports, { getItem: () => null })
  return module.exports
}
const client = evaluate(readFileSync('src/api/client.ts', 'utf8').replaceAll('import.meta.env', '({ VITE_API_BASE_URL: "/api", VITE_USE_MOCK: "false" })'), { axios })
const api = evaluate(readFileSync('src/api/facility.ts', 'utf8'), { './client': client })
const requests = []
let fetched = 622
client.apiClient.defaults.adapter = async config => {
  requests.push({ url: config.url, baseURL: config.baseURL, body: JSON.parse(config.data) })
  return { config, status: 200, statusText: 'OK', headers: {}, data: JSON.stringify({ code: '0', data: { deptId: 1, inserted: fetched, updated: 0, skipped: 0, typeUnrecognized: 0, layers: [{ layerId: 0, layerName: 'Point_项目工程设施', fetched, inserted: fetched, updated: 0, skipped: 0, unrecognizedTypes: [] }], suspectDuplicates: [] } }) }
}
const mounted = []
const service = { id: 7, name: '九龙镇高标农田数据', serviceUrl: 'https://example.invalid/MapServer', status: 1 }
const { descriptor } = parse(readFileSync('src/components/FacilityImportDialog.vue', 'utf8'))
const component = evaluate(compileScript(descriptor, { id: 'facility-import-test' }).content, {
  vue: { ...vue, onMounted: callback => mounted.push(callback) },
  '@/api/map-service': { listEnabledMapServices: async () => [service] },
  '@/utils/map-service-layer': { expandMapServiceSublayers: async () => [0, 1, 2].map((id, index) => ({ ...service, id: `7::${id}`, arcGisLayerId: id, name: ['Point_项目工程设施', '项目工程设施', '关联工程设施'][index] })) },
  '@/api/facility': api,
}).default
const state = component.setup({ deptId: '1', canImport: true }, { expose() {}, emit() {} })
for (const callback of mounted) await callback()
state.serviceId.value = '7'
await vue.nextTick()
await new Promise(resolve => setImmediate(resolve))
assert.deepEqual([...state.selected.value], [0, 1, 2])
state.selected.value = [0]
await vue.nextTick()
await state.preview()
assert.deepEqual(requests[0], { baseURL: '/api', url: '/v1/biz/facility/import/layers/preview', body: { deptId: '1', serviceId: 7, layerIds: [0] } })
assert.equal(state.report.value.layers[0].fetched, 622)
fetched = 0
await state.preview()
assert.deepEqual(requests[1].body.layerIds, [0])
assert.equal(state.report.value.layers[0].fetched, 0)
state.selected.value = [0, 1, 2]
state.nameField.value = 'GCMC'
state.typeField.value = 'GCMC'
await vue.nextTick()
assert.equal(state.previewQuery.value, undefined)
await state.preview()
assert.deepEqual(requests[2].body, { deptId: '1', serviceId: 7, layerIds: [0, 1, 2], nameField: 'GCMC', typeField: 'GCMC' })
assert.ok(requests.every(request => request.url.endsWith('/preview')))
console.log('PASS: layer 0 survives selection and Axios serialization; response counts remain unchanged; source service ID is preserved; only preview requests made.')
