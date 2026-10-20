import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const component = readFileSync('src/views/DashboardView.vue', 'utf8')
const script = component.split('<script setup lang="ts">')[1].split('</script>')[0]
const ast = ts.createSourceFile('DashboardView.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const functionNames = new Set(['percentage', 'formatCount', 'formatFileSize', 'loadLivePreview'])
const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && functionNames.has(node.name?.text)).map(node => node.getText(ast))
assert.equal(declarations.length, functionNames.size)
const rate = ast.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === 'mediaPhotoRate')
const executable = ts.transpileModule(`${declarations.join('\n')}\nconst ${rate.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
assert.doesNotMatch(script, /getFlightTaskMedia|getUavFlightTaskOptions|loadAllTaskMedia|loadClassifiedMediaCounts|classifiedMediaCounts|mediaCountsLoadedKey/, 'The homepage must not import, scan or locally count flight-task media')
for (const field of ['totalCount', 'photoCount', 'videoCount', 'otherCount']) assert(component.includes(`formatCount(uavMediaSummary?.${field})`), `The ${field} card must bind directly to backend summary`)
const contextWatcher = ast.statements.filter(ts.isExpressionStatement).map(node => node.expression).find(node => ts.isCallExpression(node)
  && node.expression.getText(ast) === 'watch' && node.arguments[0]?.getText(ast).includes('user.activeDeptId'))
assert.match(contextWatcher.arguments[1].getText(ast), /loadLivePreview\(true\)/, 'Identity changes reset previous department media counts immediately')

function harness() {
  const state = {
    livePreviewLoaded: { value: false }, livePreviewLoading: { value: false }, uavMediaSummary: { value: undefined },
    uavDeviceSummary: { value: undefined }, uavFlightSummary: { value: undefined }, onlineUavCount: { value: undefined }, livePreviews: { value: [] },
  }
  const calls = [], summaries = [], streams = []
  const context = { ...state, computed: getter => ({ get value() { return getter() } }),
    getLiveStreams: async () => { calls.push('streams'); return streams.length ? await streams.shift() : { list: [], onlineDeviceCount: 1 } },
    getUavDeviceSummary: async () => { calls.push('devices'); return {} },
    getUavFlightSummary: async () => { calls.push('flight-summary'); return {} },
    getUavMediaSummary: async () => {
      calls.push('media-summary')
      const result = summaries.shift()
      if (result instanceof Error) throw result
      return await result
    },
  }
  const api = new Function('context', `const {${Object.keys(context).join(',')}} = context;
    let livePreviewRequestVersion = 0;
    ${executable}
    return {loadLivePreview, view: () => ({total: formatCount(uavMediaSummary.value?.totalCount),
      photos: formatCount(uavMediaSummary.value?.photoCount), videos: formatCount(uavMediaSummary.value?.videoCount),
      others: formatCount(uavMediaSummary.value?.otherCount),
      size: formatFileSize(uavMediaSummary.value?.totalFileSize), rate: mediaPhotoRate.value})};`)(context)
  return { state, calls, summaries, streams, ...api }
}

const normal = harness()
normal.summaries.push({ totalCount: 100, photoCount: 40, videoCount: 20, otherCount: 30, totalFileSize: 1024 })
await normal.loadLivePreview(true)
assert.deepEqual(normal.view(), { total: '100', photos: '40', videos: '20', others: '30', size: '1 KB', rate: 40 }, 'Preserve backend totals and otherCount instead of calculating either from the other category counts')
assert.deepEqual(normal.calls, ['streams', 'devices', 'flight-summary', 'media-summary'], 'Exactly one media summary request per refresh and no task/media page request')
normal.summaries.push({ totalCount: 200, photoCount: 150, videoCount: 40, otherCount: 10, totalFileSize: 0 })
await normal.loadLivePreview()
assert.equal(normal.calls.filter(name => name === 'media-summary').length, 2)
assert.equal(normal.view().total, '200', 'Scheduled refresh uses the latest backend counts instead of a session-long local scan cache')
assert.equal(normal.view().others, '10', 'Scheduled refresh also updates other material counts')

normal.summaries.push(new Error('Unavailable'))
await normal.loadLivePreview()
assert.deepEqual(normal.view(), { total: '—', photos: '—', videos: '—', others: '—', size: '—', rate: undefined }, 'Failure must not fabricate zero or start a detail-scan fallback')
normal.summaries.push({ totalCount: 0, photoCount: 0, videoCount: 0, otherCount: 0, totalFileSize: 0 })
await normal.loadLivePreview()
assert.deepEqual(normal.view(), { total: '0', photos: '0', videos: '0', others: '0', size: '0 B', rate: undefined }, 'A real zero is distinct from missing data')
normal.summaries.push({ photoCount: 7 })
await normal.loadLivePreview()
assert.deepEqual(normal.view(), { total: '—', photos: '7', videos: '—', others: '—', size: '—', rate: undefined }, 'Missing fields are not calculated or filled with invented counts')
normal.summaries.push({ totalCount: 6948, photoCount: 6896, videoCount: 12, otherCount: 40 })
await normal.loadLivePreview()
assert.deepEqual([normal.view().total, normal.view().photos, normal.view().videos, normal.view().others], ['6,948', '6,896', '12', '40'], 'Render the backend example without scanning individual media records')

const independent = harness()
let finishStreams
independent.streams.push(new Promise(resolve => { finishStreams = resolve }))
independent.summaries.push({ totalCount: 20, photoCount: 18, videoCount: 2 })
const slowLoad = independent.loadLivePreview(true)
await new Promise(resolve => setImmediate(resolve))
assert.equal(independent.view().total, '20', 'Media summary is visible without waiting for slow live-stream requests')
finishStreams({ list: [], onlineDeviceCount: 1 })
await slowLoad

const racing = harness()
racing.state.uavMediaSummary.value = { totalCount: 999, photoCount: 998, videoCount: 1 }
racing.state.livePreviewLoaded.value = true
let finishOld
racing.summaries.push(new Promise(resolve => { finishOld = resolve }))
const oldLoad = racing.loadLivePreview()
racing.summaries.push({ totalCount: 12, photoCount: 10, videoCount: 2 })
const newDepartmentLoad = racing.loadLivePreview(true)
assert.equal(racing.view().total, '—', 'Never show the previous department counts while loading another identity')
await newDepartmentLoad
finishOld({ totalCount: 999, photoCount: 998, videoCount: 1 })
await oldLoad
assert.equal(racing.view().total, '12', 'An old response cannot overwrite a newer department summary')

// Verify the actual API adapter, including numeric-string and missing-field behavior.
const patrol = ts.createSourceFile('patrol.ts', readFileSync('src/api/patrol.ts', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const apiSource = patrol.statements.filter(node => ts.isFunctionDeclaration(node) && ['optionalNumber', 'getUavMediaSummary'].includes(node.name?.text)).map(node => node.getText(patrol)).join('\n')
const compiledApi = ts.transpileModule(apiSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }, apiCalls = []
let payload = { totalCount: '100', photoCount: '70', videoCount: '20', otherCount: '10', totalFileSize: '1024' }, mock = false
new Function('module', 'exports', 'apiClient', 'isMockMode', compiledApi)(module, module.exports,
  { async post(path, body) { apiCalls.push({ path, body }); return payload } }, () => mock)
const getSummary = module.exports.getUavMediaSummary
const adapted = await getSummary()
assert.deepEqual([adapted.totalCount, adapted.photoCount, adapted.videoCount, adapted.otherCount, adapted.totalFileSize], [100, 70, 20, 10, 1024])
assert.deepEqual(apiCalls, [{ path: '/v1/uav/statistics/media-summary', body: {} }])
payload = { totalCount: null, photoCount: '', videoCount: 'invalid', totalFileSize: 0 }
const missing = await getSummary()
assert.equal(missing.totalCount, undefined)
assert.equal(missing.photoCount, undefined)
assert.equal(missing.videoCount, undefined)
assert.equal(missing.otherCount, undefined)
assert.equal(missing.totalFileSize, 0)
for (const otherCount of [null, '', 'invalid', 0, '40']) {
  payload = { otherCount }
  assert.equal((await getSummary()).otherCount, otherCount === 0 ? 0 : otherCount === '40' ? 40 : undefined)
}
mock = true
const beforeMock = apiCalls.length
assert.deepEqual(await getSummary(), {})
assert.equal(apiCalls.length, beforeMock, 'Mock mode must not call real APIs')
console.log('dashboard-media-summary: backend-only counts, no media scans, refresh, zero/missing/failure, department reset, stale responses and API normalization passed')
