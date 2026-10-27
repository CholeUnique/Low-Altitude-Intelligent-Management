import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

function load(source, dependencies = {}) {
  const module = { exports: {} }
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', output)(name => {
    assert(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
const pagerApi = load(readFileSync('src/utils/collection-media-pager.ts', 'utf8'))
const task = id => ({ id, name: `任务${id}`, deviceName: `设备${id}`, waylineName: '', createTime: '2026-10-26 12:00' })
const photo = id => ({ id, name: `${id}.jpg`, thumbnail: `/${id}.jpg`, originalUrl: `/${id}.jpg`, capturedAt: '2026-10-26 12:00' })
const list = (prefix, count) => Array.from({ length: count }, (_, index) => photo(`${prefix}-${index}`))
const first = task('A'), second = task('B'), third = task('C')
const all = { task: () => true, media: () => true }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

// A short task fills the first screen from B, with fixed backend page sizes and cached overflow.
{
  const calls = []
  const records = { A: list('A', 15), B: list('B', 90), C: list('C', 20) }
  const pager = pagerApi.createCollectionMediaPager([first, second, third], async params => {
    calls.push(params)
    const data = records[params.taskId]
    return { list: data.slice((params.pageNum - 1) * params.pageSize, params.pageNum * params.pageSize), total: data.length }
  })
  let result = await pager.readUntil(40, all)
  assert.deepEqual(calls.map(call => `${call.taskId}:${call.pageNum}`), ['A:1', 'B:1'])
  assert.equal(result.entries.slice(0, 40).length, 40)
  assert.equal(result.entries[14].media.id, 'A-14')
  assert.equal(result.entries[15].media.id, 'B-0')
  assert.equal(result.entries[39].media.id, 'B-24')
  result = await pager.readUntil(80, all)
  assert.equal(result.entries[79].media.id, 'B-64')
  const count = calls.length
  await pager.readUntil(40, all)
  assert.equal(calls.length, count, 'Back navigation reuses cached records')
  result = await pager.readUntil(500, all)
  assert.equal(result.hasMore, false)
  assert.equal(result.entries.length, 125)
  assert.equal(new Set(result.entries.map(entry => entry.media.id)).size, 125)
  assert(calls.every(call => call.pageSize === 40), 'Page-size changes in UI cannot shift backend offsets')
}

// Concurrent readers share one request; errors never advance the failed page.
{
  const pending = deferred(), calls = []
  const pager = pagerApi.createCollectionMediaPager([first], async params => {
    calls.push(params.pageNum)
    if (calls.length === 1) return pending.promise
    return { list: [photo('retry')], total: 1 }
  })
  const a = pager.readUntil(1, all), b = pager.readUntil(1, all)
  pending.reject(new Error('network'))
  await assert.rejects(a, /network/)
  await assert.rejects(b, /network/)
  assert.deepEqual(calls, [1])
  assert.equal((await pager.readUntil(1, all)).entries[0].media.id, 'retry')
  assert.deepEqual(calls, [1, 1])
}

let source = readFileSync('src/views/DataResultsView.vue', 'utf8')
source = source.replace('</script>', 'defineExpose({ pageMedia, currentPage, pageSize, filteredMedia, knownTotal, hasMoreMedia, mediaSummaryTotal, summaryError, error, mediaScanLoading, keyword, taskFilter, mediaTypeFilter, loadMediaPage, loadTasks, setPage, previewMedia, previewTask, previewItems, previewIndex, previewSwitching, previewNotice, openMedia, switchPreview, closePreview });\n</script>')
const compiled = compileScript(parse(source).descriptor, { id: 'collection-pagination-test' }).content
globalThis.window = { setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} }
const renderer = Vue.createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null })
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick(); await new Promise(resolve => setTimeout(resolve, 5)); await Vue.nextTick() }
async function harness(records, options = {}) {
  const calls = []
  let hook = options.hook
  const component = load(compiled, {
    vue: Vue,
    '@/api/patrol': {
      getUavFlightTaskOptions: async ({ pageNum }) => {
        calls.push({ kind: 'tasks', pageNum })
        return options.taskPage ? options.taskPage(pageNum) : { list: Object.keys(records).map(task), total: Object.keys(records).length }
      },
      getUavMediaSummary: async () => {
        calls.push({ kind: 'summary' })
        if (options.summaryFailure) throw new Error('summary unavailable')
        return { photoCount: Object.values(records).reduce((sum, rows) => sum + rows.length, 0), videoCount: 0 }
      },
      getFlightTaskMedia: async params => {
        calls.push({ kind: 'media', ...params })
        const override = hook?.(params)
        if (override) return override
        const rows = records[params.taskId] || []
        return { list: rows.slice((params.pageNum - 1) * params.pageSize, params.pageNum * params.pageSize), total: rows.length }
      },
    },
    '@/utils/collection-media-pager': pagerApi,
    '@/workspace-components/spot-identification/SharedVideoPlayer.vue': { default: {} },
    '@/workspace-components/spot-identification/PhotoLocationOverlay.vue': { default: {} },
  }).default
  component.render = () => null
  let vm
  const props = Vue.reactive({ embedded: true, activeTab: 'collection' })
  const app = renderer.createApp({ render: () => Vue.h(component, { ...props, ref: value => { if (value) vm = value } }) })
  app.mount({})
  await flush()
  return { vm, calls, props, setHook(value) { hook = value }, close: () => app.unmount() }
}
const mediaCalls = calls => calls.filter(call => call.kind === 'media')

// First page only; full-screen page boundary, cross-task boundary, last record and cached previous page.
{
  const { vm, calls, close } = await harness({ A: list('A', 80), B: list('B', 3) })
  assert.deepEqual(mediaCalls(calls).map(call => `${call.taskId}:${call.pageNum}`), ['A:1'])
  assert.equal(vm.mediaSummaryTotal, 83, 'Summary is exact without scanning all media')
  assert.equal(vm.pageMedia.length, 40)
  const entry = vm.pageMedia.at(-1)
  vm.openMedia(entry.media, entry.task, vm.filteredMedia)
  await vm.switchPreview(1)
  assert.equal(vm.previewMedia.id, 'A-40', 'Next from first-screen last item loads the next backend page')
  assert.equal(vm.previewTask.id, 'A')
  assert.equal(vm.previewIndex, 40)
  const lastA = vm.filteredMedia.find(entry => entry.media.id === 'A-79')
  vm.openMedia(lastA.media, lastA.task, vm.filteredMedia)
  await vm.switchPreview(1)
  assert.equal(vm.previewMedia.id, 'B-0', 'Last media in A continues into task B')
  assert.equal(vm.previewTask.id, 'B')
  await vm.switchPreview(1)
  await vm.switchPreview(1)
  await vm.switchPreview(1)
  assert.equal(vm.previewMedia.id, 'B-2', 'End of dataset retains last valid preview')
  assert.match(vm.previewNotice, /最后一条/)
  assert.equal(vm.hasMoreMedia, false)
  vm.closePreview()
  const count = mediaCalls(calls).length
  await vm.loadMediaPage(2)
  assert.equal(vm.pageMedia[0].media.id, 'A-40')
  await vm.loadMediaPage(1)
  assert.equal(mediaCalls(calls).length, count)
  assert.equal(vm.pageMedia.at(-1).media.id, 'A-39')
  vm.pageSize = 20
  await flush()
  assert.equal(vm.pageMedia.length, 20)
  assert.equal(vm.pageMedia.at(-1).media.id, 'A-19')
  vm.pageSize = 60
  await flush()
  assert.equal(vm.pageMedia.length, 60)
  assert.equal(vm.pageMedia.at(-1).media.id, 'A-59')
  assert.equal(mediaCalls(calls).length, count, 'Changing display page size preserves backend-page caches')
  close()
}

// A whole unread page with missing URLs must not produce a blank fullscreen item.
{
  const rows = list('A', 80).map((row, index) => index >= 40 ? { ...row, thumbnail: '', originalUrl: '' } : row)
  const h = await harness({ A: rows, B: [photo('B-only')] })
  const entry = h.vm.pageMedia.at(-1)
  h.vm.openMedia(entry.media, entry.task, h.vm.filteredMedia)
  await h.vm.switchPreview(1)
  assert.equal(h.vm.previewMedia.id, 'B-only')
  assert.equal(h.vm.previewTask.id, 'B')
  assert.equal(h.vm.previewSwitching, false)
  h.close()
}

// Multiple keys while a request is pending; failure retry, missing URLs and close during loading.
{
  const rows = list('A', 82)
  rows[40] = { ...rows[40], thumbnail: '', originalUrl: '' }
  const h = await harness({ A: rows })
  const { vm, calls } = h
  const entry = vm.pageMedia.at(-1)
  vm.openMedia(entry.media, entry.task, vm.filteredMedia)
  const pending = deferred()
  h.setHook(({ pageNum }) => pageNum === 2 ? pending.promise : undefined)
  const switching = vm.switchPreview(1)
  await vm.switchPreview(1)
  assert.equal(mediaCalls(calls).filter(call => call.pageNum === 2).length, 1)
  assert.equal(vm.previewMedia.id, 'A-39')
  pending.reject(new Error('network'))
  await switching
  assert.equal(vm.previewMedia.id, 'A-39')
  assert.match(vm.previewNotice, /重试/)
  assert.equal(vm.previewSwitching, false)
  h.setHook(undefined)
  await vm.switchPreview(1)
  assert.equal(vm.previewMedia.id, 'A-41', 'Unavailable preview URL is skipped safely')
  assert.deepEqual(mediaCalls(calls).map(call => call.pageNum), [1, 2, 2])
  const last = vm.filteredMedia.at(-1)
  vm.openMedia(last.media, last.task, vm.filteredMedia)
  const late = deferred()
  h.setHook(({ pageNum }) => pageNum === 3 ? late.promise : undefined)
  const next = vm.switchPreview(1)
  vm.closePreview()
  late.resolve({ list: rows.slice(80), total: 82 })
  await next
  assert.equal(vm.previewMedia, undefined, 'A late response never reopens a closed fullscreen viewer')
  assert.equal(vm.previewSwitching, false)
  h.close()
}

// Filter within unloaded pages, then clear filters: cached later tasks cannot jump ahead of A.
{
  const records = { A: list('A', 81), B: list('B', 2) }
  records.A[80] = { ...records.A[80], name: 'needle.jpg' }
  const { vm, calls, close } = await harness(records, { summaryFailure: true })
  assert.equal(vm.mediaSummaryTotal, undefined)
  assert.match(vm.summaryError, /统计/)
  vm.keyword = 'needle'
  await new Promise(resolve => setTimeout(resolve, 330))
  await flush()
  assert.equal(vm.pageMedia.length, 1)
  assert.equal(vm.pageMedia[0].media.id, 'A-80')
  assert.equal(vm.knownTotal, 1)
  vm.keyword = ''
  await new Promise(resolve => setTimeout(resolve, 330))
  await flush()
  assert.equal(vm.pageMedia[0].media.id, 'A-0')
  assert.equal(vm.pageMedia.at(-1).media.id, 'A-39')
  assert(mediaCalls(calls).length >= 3)
  close()
}
console.log('Collection pagination: lazy first page, cross-task fill, cached back navigation, separate totals, filters, fullscreen boundaries, deduplication, failure retry and late-response cancellation passed')
