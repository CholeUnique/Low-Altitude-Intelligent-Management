import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const dock = {
  callsign: '泰州', sn: '8UUXP3P00A11XC', deviceModelName: 'DOCK3', deviceOnlineStatus: 1,
  childJson: JSON.stringify({ sn: '1581F8HHX259T00A04W7', callsign: 'M4D', device_model: { name: 'M4D' }, device_online_status: false, camera_list: [] }),
}
const module = { exports: {} }
const source = ts.transpileModule(readFileSync('src/api/patrol.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replaceAll('import.meta.env', '{}')
new Function('require', 'module', 'exports', source)(name => {
  if (name === '@/api/client') return { apiClient: { post: async (path) => {
    if (path.endsWith('/drone-summary')) return [{ sn: '1581F8HHX259T00A04W7', droneName: 'M4D', flightCount: 87, flightDistance: 1212179, flightTime: 105156, executingCount: 0, noEndTimeCount: 0 }]
    if (path.endsWith('/hms/page')) return { total: 3, records: [{ id: 1, sn: 'drone', messageZh: '告警' }, { id: 2, sn: 'dock' }, { id: 3 }] }
    return { records: [dock] }
  } } }
  if (name === '@/adapters/dasFly') return {}
  throw new Error(`Unexpected dependency: ${name}`)
}, module, module.exports)

const { getUavDeviceOptions, parseDeviceChildren } = module.exports
const [parent] = await getUavDeviceOptions()
assert.equal(parent.kind, 'dock')
assert.equal(parent.sn, dock.sn)
assert.equal(parent.online, true)
assert.equal(parent.children.length, 1)
assert.equal(parent.children[0].sn, '1581F8HHX259T00A04W7')
assert.equal(parent.children[0].model, 'M4D')
assert.equal(parent.children[0].online, false)
assert.equal(parent.children[0].kind, 'aircraft')
assert.notEqual(parent.children[0].id, parent.id)
assert.deepEqual(parseDeviceChildren('invalid json', 'dock'), [])
const children = parseDeviceChildren([{ sn: 'one' }, { sn: 'one' }, { sn: 'two', deviceOnlineStatus: 1 }], 'dock')
assert.equal(children.length, 2)
assert.equal(children[0].online, undefined)
assert.equal(children[1].online, true)
const [summary] = await module.exports.getUavDroneSummary('1581F8HHX259T00A04W7')
assert.equal(summary.flightCount, 87)
assert.equal(summary.flightDistance, 1212179)
assert.equal(summary.flightTime, 105156)
assert.equal(summary.noEndTimeCount, 0)
const alarms = await module.exports.getUavDeviceAlarms('drone')
assert.equal(alarms.total, 3)
assert.deepEqual(alarms.list.map(item => item.sn), ['drone'], 'Unknown or mismatched SN must not be attributed to the requested device')
console.log('fleet device children tests passed')
