import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

const child = { id: 'dock:aircraft:drone', sn: 'drone', label: 'M4D', kind: 'aircraft', online: false }
const dock = { id: 'dock', sn: 'dock-sn', label: '泰州', kind: 'dock', online: true, children: [child] }
const statsCalls = []
const patrol = {
  getUavDeviceOptions: async () => [dock],
  getUavFlightTaskOptions: async () => ({ list: [], total: 0 }),
  getUavFlightSummary: async () => ({}), getUavDeviceSummary: async () => ({}),
  getUavDeviceState: async sn => ({ deviceSn: sn, longitude: sn === 'dock-sn' ? 119 : undefined, latitude: sn === 'dock-sn' ? 32 : undefined, batteryPercent: sn === 'drone' ? 42 : undefined }),
  getUavDeviceAlarms: async sn => ({ total: 1, list: [{ id: sn, sn, message: sn }] }),
  getUavDeviceFlightStatistics: async sn => { statsCalls.push(`dock:${sn}`); return [{ sn, flightCount: 8 }] },
  getUavDroneSummary: async sn => { statsCalls.push(`aircraft:${sn}`); return [{ sn, flightCount: 3, flightDistance: 1000, flightTime: 60, executingCount: 0, noEndTimeCount: 0 }] },
}
let source = readFileSync('src/workspace-components/fleet-overview/FleetOverviewPanel.vue', 'utf8')
source = source.replace('</script>', 'defineExpose({ allDevices, activeDevice, selectedDeviceId, selectedAlarms, selectedAlarmTotal, selectedDeviceMetrics, droneSummary, deviceStates, devicesWithLocation });\n</script>')
const script = compileScript(parse(source).descriptor, { id: 'fleet-test' }).content
const compiled = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled)(name => {
  if (name === 'vue') return Vue
  if (name === '@/api/patrol') return patrol
  if (name === '@element-plus/icons-vue' || name === './FleetOverviewMap.vue' || name === '@/components/ContinuousScrollList.vue') return {}
  throw new Error(`Unexpected dependency: ${name}`)
}, module, module.exports)
globalThis.window = { setInterval: () => 1, clearInterval() {} }
globalThis.document = { addEventListener() {}, removeEventListener() {}, fullscreenElement: null }
const renderer = Vue.createRenderer({ createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {}, setText() {}, setElementText() {}, parentNode() {}, nextSibling() {}, patchProp() {} })
const component = module.exports.default
component.render = () => null
const app = renderer.createApp(component)
const vm = app.mount({})
const flush = async () => { for (let i = 0; i < 6; i++) { await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick() } }
await flush()
assert.equal(vm.allDevices.length, 2)
assert.equal(vm.activeDevice.sn, 'dock-sn')
assert.equal(vm.selectedDeviceMetrics.flightCount, 8)
assert.equal(vm.selectedAlarms[0].sn, 'dock-sn')
assert.deepEqual(vm.devicesWithLocation.map(device => device.sn), ['dock-sn'], 'Child must not inherit the dock position')
vm.selectedDeviceId = child.id
await flush()
assert.equal(vm.activeDevice.sn, 'drone')
assert.equal(vm.deviceStates.drone.batteryPercent, 42)
assert.equal(vm.droneSummary.flightCount, 3)
assert.equal(vm.droneSummary.flightDistance, 1000)
assert.equal(vm.selectedAlarmTotal, 1)
assert.equal(vm.selectedAlarms[0].sn, 'drone')
assert.deepEqual(statsCalls, ['dock:dock-sn', 'aircraft:drone'])
app.unmount()
console.log('fleet device selection tests passed')
