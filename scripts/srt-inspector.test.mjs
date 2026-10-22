import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

function load(source, dependencies = {}) {
  const module = { exports: {} }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', compiled)(name => {
    assert(name in dependencies, `Unexpected import: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
const telemetry = load(readFileSync('src/utils/video-telemetry.ts', 'utf8'))
const inspector = load(readFileSync('src/utils/srt-inspector.ts', 'utf8'), { './video-telemetry': telemetry })
const { inspectSrt, srtField, formatSrtTime, srtAltitudePath } = inspector
const panelTemplate = parse(readFileSync('src/workspace-components/spot-identification/FlightTaskReviewPanel.vue', 'utf8')).descriptor.template.content
assert(!panelTemplate.includes('srt-info-button'), 'Results table must not contain a separate SRT action')
assert.match(panelTemplate, /class="media-srt-button"[^>]*>SRT 信息<\/button>/, 'Sidebar retains its SRT entry without an arrow')
const cue = (index, start, end, text) => `${index}\n${start} --> ${end}\n${text}\n\n`
const source = '\ufeff' + cue(10, '00:00:00,000', '00:00:01,000', '<font>2026-10-13 13:34:12.123\n[latitude: 32.47] [longitude: 119.84] [rel_alt: 92.0 abs_alt: 110.2] [iso: 100] [custom_sensor: stable] [shutter: 1/800]</font>')
  + cue(11, '00:00:01.000', '00:00:02.000', '[iso: 200] [rel_alt: 93m] plain subtitle')
  + cue(12, '00:99:00,000', '00:00:03,000', '[latitude: 32.47] [longitude: 119.84] [rel_alt: 94]')
  + cue(13, '00:00:03,000', '00:00:04,000', 'GPS(119.84,32.47,110) F.PRY(0,-90,180)')
const parsed = inspectSrt(source.replace(/\n/g, '\r\n'))
assert.equal(parsed.records.length, 4)
assert.equal(parsed.gpsCount, 2)
assert.equal(parsed.validTimeCount, 3)
assert.equal(parsed.duration, 4)
assert.equal(parsed.records[0].sequence, '10')
assert.equal(parsed.records[0].recordedAt, '2026-10-13 13:34:12.123')
assert.equal(srtField(parsed.records[0], 'ISO'), '100')
assert.equal(srtField(parsed.records[0], 'custom_sensor'), 'stable')
assert.equal(srtField(parsed.records[0], 'shutter'), '1/800')
assert.equal(srtField(parsed.records[0], 'rel_alt'), '92.0')
assert.equal(srtField(parsed.records[0], 'abs_alt'), '110.2')
assert.equal(srtField(parsed.records[3], 'F.PRY'), '0,-90,180')
assert.equal(srtField(parsed.records[1], 'latitude'), '—')
assert.equal(parsed.records[1].relativeAltitude, 93)
assert.equal(parsed.records[2].validTime, false)
assert.equal(parsed.records[2].point, undefined)
assert.match(parsed.records[0].raw, /<font>/, 'Original markup is preserved as text')
assert(parsed.fields.includes('custom_sensor'))
assert.equal(parsed.altitudeMin, 92)
assert.equal(parsed.altitudeMax, 94)
assert.match(srtAltitudePath(parsed), /^M/)
assert(!srtAltitudePath(parsed).includes('NaN'))
assert.equal(formatSrtTime(3661.123, true), '01:01:01.123')
assert.equal(formatSrtTime(NaN), '—')
assert.equal(inspectSrt('unsupported subtitle data').records.length, 0)
assert.equal(inspectSrt(cue(1, '00:00:00,000', '00:00:01,000', `[rel_alt: ${'9'.repeat(400)}]`)).records[0].relativeAltitude, undefined)
assert.throws(() => inspectSrt('x'.repeat(telemetry.MAX_SRT_BYTES + 1)), /20 MB/)
const many = inspectSrt(Array.from({ length: 105 }, (_, i) => cue(i + 1, '00:00:00,000', '00:00:01,000', `[iso: ${i}]`)).join(''))
assert.equal(many.records.length, 105, 'Keep all records for pagination')

// Mount the real dialog with a lightweight host, including Teleport and form directives.
const listeners = new Map()
globalThis.Document = class {}
globalThis.ShadowRoot = class {}
const previousFocus = { focus() { this.restored = true } }
globalThis.document = { activeElement: previousFocus, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name) } }
function node(type, text = '') {
  return { type, text, tagName: type.toUpperCase(), children: [], props: {}, parent: null,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    focus() { document.activeElement = this }, getClientRects: () => [1], getRootNode: () => document,
    querySelectorAll() { return [] }, contains: () => true,
    get options() { return this.children.filter(item => item.type === 'option') },
  }
}
const body = node('body')
const renderer = Vue.createRenderer({
  createElement: type => node(type), createText: text => node('text', text), createComment: text => node('comment', text),
  querySelector: selector => selector === 'body' ? body : null,
  insert(child, parent, anchor) { if (child.parent) this.remove(child); child.parent = parent; const index = parent.children.indexOf(anchor); if (index < 0) parent.children.push(child); else parent.children.splice(index, 0, child) },
  remove(child) { const index = child.parent?.children.indexOf(child); if (index >= 0) child.parent.children.splice(index, 1); child.parent = null },
  setText(item, value) { item.text = value }, setElementText(item, value) { item.text = value; item.children = [] },
  parentNode: item => item.parent, nextSibling: item => item.parent?.children[item.parent.children.indexOf(item) + 1],
  patchProp(item, name, before, after) { item.props[name] = after; if (name === 'value') item.value = after },
})
const pending = []
let componentSource = readFileSync('src/workspace-components/spot-identification/SrtInfoDialog.vue', 'utf8')
componentSource = componentSource.replace('</script>', 'defineExpose({ tab, data, raw, busy, error, expanded, gpsFilter, searchInput, page, pageSize, pageRecords, selectedRecord, download, load });\n</script>')
const { descriptor } = parse(componentSource)
const Dialog = load(compileScript(descriptor, { id: 'srt-test', inlineTemplate: true }).content, {
  vue: Vue, '@/utils/video-telemetry': telemetry, '@/utils/srt-inspector': inspector,
  '@/api/flight-review': { getFlightReviewVideoSrtFile: (id, signal) => new Promise((resolve, reject) => pending.push({ id, signal, resolve, reject })) },
}).default
const media = { id: '210987654321000001', taskId: 'task1', fileName: 'A.mp4', type: 'video' }
let closes = 0
const app = renderer.createApp(Dialog, { planName: '测试飞行计划', media, onClose: () => closes++ })
const vm = app.mount(node('root'))
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick() }
assert.equal(pending[0].id, media.id, 'Read using the clicked video ID without precision loss')
pending.shift().resolve(new Blob([source])); await flush()
assert.equal(vm.data.records.length, 4)
const renderedText = item => (item.text || '') + item.children.map(renderedText).join('')
for (const removed of ['原始记录只读 · 不触发后台生成', 'ALTITUDE PROFILE', 'SOURCE DETAILS', 'DATA AVAILABILITY', 'TELEMETRY FIELDS', 'SRT 原始采样', 'FLIGHT TELEMETRY', '数据源']) {
  assert(!renderedText(body).includes(removed), `Remove marked content rather than leaving its placeholder: ${removed}`)
}
assert.equal(vm.raw, source.replace(/^\ufeff/, ''))
vm.tab = 'records'; await Vue.nextTick()
vm.gpsFilter = 'missing'; await Vue.nextTick()
assert.equal(vm.pageRecords.length, 2, 'GPS-less and invalid-time cues remain inspectable')
vm.searchInput = 'custom_sensor'; await new Promise(resolve => setTimeout(resolve, 230)); await Vue.nextTick()
assert.equal(vm.pageRecords.length, 0)
vm.gpsFilter = 'all'; await Vue.nextTick()
assert.equal(vm.pageRecords.length, 1, 'Unknown fields are searchable')
assert.equal(vm.selectedRecord.sequence, '10')
vm.tab = 'raw'; await Vue.nextTick()
function find(item, predicate) { return predicate(item) ? item : item.children.map(child => find(child, predicate)).find(Boolean) }
assert.equal(find(body, item => item.type === 'textarea').props.value, vm.raw, 'Raw view exposes the entire original, not just GPS fields')
assert(!find(body, item => 'innerHTML' in item.props), 'Never render untrusted SRT as HTML')
assert(!find(body, item => item.props['aria-label'] === '选择视频的 SRT'), 'The dialog cannot switch to a different video')
vm.load(); const old = pending.shift()
vm.load(); const fresh = pending.shift()
assert(old.signal.aborted)
fresh.resolve(new Blob([Array.from({ length: 105 }, (_, i) => cue(i + 1, '00:00:00,000', '00:00:01,000', `[iso: ${i}]`)).join('')])); await flush()
old.resolve(new Blob([source])); await flush()
assert.equal(vm.data.records.length, 105, 'A late retry cannot overwrite the clicked video data')
vm.tab = 'records'; await Vue.nextTick()
assert.equal(vm.pageRecords.length, 25)
vm.page = 5; await Vue.nextTick()
assert.equal(vm.pageRecords.length, 5)
assert.equal(vm.pageRecords[0].sequence, '101')
vm.pageSize = 100; await Vue.nextTick()
assert.equal(vm.page, 1)
vm.expanded = true; await Vue.nextTick()
assert(find(body, item => String(item.props.class).includes('is-expanded')))
let clicked
document.createElement = type => ({ click() { clicked = this } })
vm.download()
assert.equal(clicked.download, 'A.SRT')
assert.match(clicked.href, /^blob:/)
vm.load(); pending.shift().reject(new Error('当前视频的 SRT 尚未就绪')); await flush()
assert.match(vm.error, /尚未就绪/)
assert.equal(vm.data, undefined, 'Failure never retains previous video data')
vm.load(); pending.shift().resolve(new Blob(['unrecognized subtitle body'])); await flush()
assert.equal(vm.data.records.length, 0)
assert.equal(vm.raw, 'unrecognized subtitle body', 'Unknown formats retain raw content for inspection')
listeners.get('keydown')({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} })
assert.equal(closes, 1)
vm.load(); const closing = pending.shift()
app.unmount()
assert(closing.signal.aborted)
assert.equal(listeners.size, 0)
assert(previousFocus.restored)
closing.resolve(new Blob([source])); await flush()
assert.equal(vm.data, undefined, 'Closing invalidates pending content')
assert.equal(body.children.length, 0, 'Teleport content is removed on close')
console.log('SRT inspector parsing, full records, single-video dialog, retry races, download and cleanup passed')
