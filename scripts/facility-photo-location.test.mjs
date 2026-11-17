import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as Vue from 'vue'

let response = { matched: true, mediaId: '212039846837891912', fileName: 'photo.jpg', longitude: 119.85, latitude: 32.48, localFileUrl: '/api/v1/uav/media/file/212039846837891912' }
const calls = []
const apiClient = { post: async (_path, payload) => { calls.push(payload); return response } }
globalThis.window = { addEventListener() {}, removeEventListener() {} }
const source = readFileSync('src/components/FacilityNearbyPhoto.vue', 'utf8')
assert.match(source, /<PhotoLocationControl v-if="original && locationMedia"/)
const exposed = source.replace('</script>', 'defineExpose({ search, locationMedia, shootAfterDate });\n</script>')
const script = compileScript(parse(exposed).descriptor, { id: 'facility-photo-test' }).content
const code = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', code)(name => {
  if (name === 'vue') return Vue
  if (name === '@/api/client') return { apiClient }
  if (name === '@/workspace-components/spot-identification/PhotoLocationControl.vue') return { default: {} }
  throw new Error(`Unexpected dependency: ${name}`)
}, module, module.exports)
const renderer = Vue.createRenderer({ createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {}, setText() {}, setElementText() {}, parentNode() {}, nextSibling() {}, patchProp() {} })
const component = module.exports.default
component.render = () => null
const app = renderer.createApp(component, { coordinate: { longitude: 119.8, latitude: 32.4 }, geometryType: '点' })
const vm = app.mount({})
await vm.search()
assert.equal('shootAfter' in calls[0], false, 'Empty date uses the backend default')
assert.equal(vm.locationMedia.longitude, 119.85)
assert.equal(vm.locationMedia.latitude, 32.48)
assert.equal(vm.locationMedia.id, '212039846837891912')
response = { ...response, longitude: null, latitude: null }
vm.shootAfterDate = '2025-01-02'
await vm.search()
assert.equal(calls[1].shootAfter, '2025-01-02T00:00:00', 'The selected date is inclusive from midnight')
assert.equal(vm.locationMedia.longitude, undefined, 'Missing photo coordinates must not fall back to facility coordinates')
assert.equal(vm.locationMedia.latitude, undefined)
app.unmount()
console.log('Facility photo location checks passed')
