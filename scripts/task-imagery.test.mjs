import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(file, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', source)(id => {
    if (id in dependencies) return dependencies[id]
    throw new Error(`Unexpected dependency: ${id}`)
  }, module, module.exports)
  return module.exports
}
const history = { id: 1, name: '202604局部0.02米影像', serviceUrl: 'https://example.com/history/MapServer', type: 'ARCGIS_MAPSERVER', status: 1 }
const june = { ...history, id: 3, name: '202606九龙镇0.2米影像', serviceUrl: 'https://example.com/june/MapServer' }
const september = { ...history, id: 6, name: '2026年9月无人机正射影像', serviceUrl: 'https://example.com/september/{z}/{x}/{y}.png', type: 'TMS' }
const requests = []
const api = load('src/api/governance-task.ts', {
  './client': { apiClient: { post: async (url, body) => {
    requests.push({ url, body })
    if (url === '/v1/biz/task/detail') return { task: { id: body.id, mapServices: body.id === '1318' ? [history, june] : [history, september] } }
    if (url === '/v1/biz/task/geometry/geojson') return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [119.84, 32.49] } }] }
    throw new Error(`Unexpected API: ${url}`)
  } } },
})
const { taskImageryService } = load('src/utils/task-imagery.ts')
const first = await api.getGovernanceTaskDetail('1318')
const second = await api.getGovernanceTaskDetail('900')
assert.equal(taskImageryService(first.task.comparisonImages).id, '3')
assert.equal(taskImageryService(second.task.comparisonImages).id, '6')
assert.equal(taskImageryService(first.task.comparisonImages, 'history').id, '1')
assert.equal(taskImageryService(undefined), undefined, '未关联影像不能套用固定影像')
assert.equal(taskImageryService([{ ...second.task.comparisonImages[1], mapService: { ...september, status: 0 } }]), undefined, '停用影像不能继续显示')
assert.equal(taskImageryService([second.task.comparisonImages[1]]).id, '6', '单期影像正常显示')
const geometry = await api.getGovernanceTaskGeometry('900', undefined, false, '1')
assert.deepEqual(geometry.features[0].geometry.coordinates, [119.84, 32.49])
assert.deepEqual(requests[2], { url: '/v1/biz/task/geometry/geojson', body: { bizTaskId: '900', deptId: '1', resultId: undefined, includeAbnormalPoints: false } })
console.log('PASS: real task detail map-service fields, independent task imagery, single/disabled/missing periods and geometry request')
