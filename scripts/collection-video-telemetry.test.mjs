import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

function load(source, dependencies) {
  const module = { exports: {} }
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', output)(name => {
    assert(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
globalThis.Document = class {}
globalThis.ShadowRoot = class {}
globalThis.document = { activeElement: null }
globalThis.ResizeObserver = class { observe() {} disconnect() {} }
const windowListeners = new Map()
globalThis.window = { setTimeout, clearTimeout, innerWidth: 1600, innerHeight: 900,
  addEventListener: (name, handler) => windowListeners.set(name, handler), removeEventListener: name => windowListeners.delete(name) }
function node(type, text = '') {
  const listeners = new Map()
  return { type, text, tagName: type.toUpperCase(), children: [], props: {}, parent: null,
    paused: true, ended: false, currentTime: 0, played: { length: 0 }, pauses: 0,
    addEventListener(name, handler, options) { const entries = listeners.get(name) || []; entries.push({ handler, options }); listeners.set(name, entries) },
    removeEventListener(name, handler) { listeners.set(name, (listeners.get(name) || []).filter(item => item.handler !== handler)) },
    dispatch(name) { for (const item of [...(listeners.get(name) || [])]) { item.handler({ type: name }); if (item.options?.once) this.removeEventListener(name, item.handler) } },
    async play() { this.paused = false; this.dispatch('play') },
    pause() { this.paused = true; this.pauses++; this.dispatch('pause') },
    setAttribute() {}, removeAttribute() {}, getRootNode: () => document,
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 700, width: 1200, height: 700 }),
    get options() { return this.children.filter(item => item.type === 'option') },
  }
}
const renderer = Vue.createRenderer({
  createElement: type => node(type), createText: text => node('text', text), createComment: text => node('comment', text),
  insertStaticContent(content, parent, anchor) { const child = node('static', content); child.parent = parent; const i = parent.children.indexOf(anchor); if (i < 0) parent.children.push(child); else parent.children.splice(i, 0, child); return [child, child] },
  insert(child, parent, anchor) { if (child.parent) this.remove(child); child.parent = parent; const i = parent.children.indexOf(anchor); if (i < 0) parent.children.push(child); else parent.children.splice(i, 0, child) },
  remove(child) { const i = child.parent?.children.indexOf(child); if (i >= 0) child.parent.children.splice(i, 1); child.parent = null },
  setText(item, text) { item.text = text }, setElementText(item, text) { item.text = text; item.children = [] },
  parentNode: item => item.parent, nextSibling: item => item.parent?.children[item.parent.children.indexOf(item) + 1],
  patchProp(item, name, before, after) { item.props[name] = after; if (['value', 'controls'].includes(name)) item[name] = after },
})
const overlayInstances = [], srtInstances = []
let closedOverlays = 0
const Overlay = Vue.defineComponent({ props: ['media', 'mediaList', 'video', 'playbackStarted', 'fullscreen'], emits: ['close'], setup(props, { emit }) {
  overlayInstances.push({ props, close: () => emit('close') })
  Vue.onBeforeUnmount(() => closedOverlays++)
  return () => Vue.h('section', { class: 'stub-overlay' })
} })
const SrtDialog = Vue.defineComponent({ props: ['planName', 'media'], emits: ['close'], setup(props, { emit }) {
  srtInstances.push({ props, close: () => emit('close') })
  return () => Vue.h('section', { class: 'stub-srt-dialog' })
} })
const PhotoLocation = Vue.defineComponent({ props: ['media', 'fullscreen'], setup: () => () => Vue.h('section', { class: 'stub-photo-location' }) })
const taskA = { id: '210987654321000001', name: '采集任务 A', createTime: '2026-10-13 13:00', deviceName: '设备 A', waylineName: '' }
const taskB = { id: '210987654321000002', name: '采集任务 B', createTime: '2026-10-12 13:00', deviceName: '设备 B', waylineName: '' }
const videoA = { id: '310987654321000001', name: 'DJI_SAME.mp4', capturedAt: '2026-10-13 13:34:12', thumbnail: '/a.jpg', originalUrl: 'https://video.test/a.mp4', mediaType: 'video' }
const videoB = { ...videoA, id: '310987654321000002', capturedAt: '2026-10-12 12:34:12', originalUrl: 'https://video.test/b.mp4' }
const imageA = { id: 'image', name: 'photo.jpg', capturedAt: '2026-10-11 11:00', thumbnail: '/image.jpg' }
const noUrlVideo = { id: 'no-url', name: 'MISSING.mp4', capturedAt: '2026-10-10 11:00', thumbnail: '' }
const attachment = { id: 'srt', name: 'DJI_SAME.SRT', capturedAt: '2026-10-09 11:00', thumbnail: '' }
const componentPath = 'src/views/DataResultsView.vue'
let source = readFileSync(componentPath, 'utf8')
source = source.replace('</script>', 'defineExpose({ previewMedia, previewTask, previewItems, srtContext, filteredMedia, mediaTypeFilter, openMedia, openSrtInfo, switchPreview, closePreview, retryVideoPlayback, videoPlaybackFailed });\n</script>')
const { descriptor } = parse(source)
const sharedSource = readFileSync('src/workspace-components/spot-identification/SharedVideoPlayer.vue', 'utf8')
const SharedPlayer = load(compileScript(parse(sharedSource).descriptor, { id: 'shared-video-test', inlineTemplate: true }).content, {
  vue: Vue,
  '@/utils/video-playback': load(readFileSync('src/utils/video-playback.ts', 'utf8'), {}),
  './VideoTelemetryOverlay.vue': { __esModule: true, default: Overlay },
}).default
const View = load(compileScript(descriptor, { id: 'collection-test', inlineTemplate: true }).content, {
  vue: Vue,
  '@/api/patrol': {
    getUavMediaSummary: async () => ({ photoCount: 1, videoCount: 3 }),
    getUavFlightTaskOptions: async () => ({ list: [taskA, taskB], total: 2 }),
    getFlightTaskMedia: async ({ taskId }) => ({ list: taskId === taskA.id ? [videoA, imageA, noUrlVideo, attachment] : [videoB], total: taskId === taskA.id ? 4 : 1 }),
  },
  '@/utils/collection-media-pager': load(readFileSync('src/utils/collection-media-pager.ts', 'utf8'), {}),
  '@/workspace-components/spot-identification/SharedVideoPlayer.vue': { __esModule: true, default: SharedPlayer },
  '@/workspace-components/spot-identification/PhotoLocationOverlay.vue': { __esModule: true, default: PhotoLocation },
  '@/workspace-components/spot-identification/SrtInfoDialog.vue': { __esModule: true, default: SrtDialog },
}).default
const root = node('root'), props = Vue.reactive({ embedded: true, activeTab: 'collection' })
let vm
const app = renderer.createApp({ setup: () => () => Vue.h(View, { ...props, ref: value => { if (value) vm = value } }) })
app.mount(root)
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick() }
await flush()
function all(item, predicate) { return [...(predicate(item) ? [item] : []), ...item.children.flatMap(child => all(child, predicate))] }
const byClass = name => all(root, item => String(item.props.class || '').split(' ').includes(name))
const click = item => item.props.onClick({ stopPropagation() {} })
assert.equal(byClass('media-card-srt').length, 3, 'Only videos get SRT actions, including videos without playback URLs')
assert(!byClass('media-card-srt').some(item => item.text.includes('↗')))
assert(!all(root, item => item.type === 'button').some(item => all(item, child => child !== item && child.type === 'button').length), 'Card preview and SRT actions must not be nested buttons')
click(byClass('media-card-srt')[0]); await flush()
assert.equal(vm.previewMedia, undefined, 'SRT action must not also open the video preview')
assert.equal(srtInstances.at(-1).props.media.id, videoA.id)
assert.equal(srtInstances.at(-1).props.planName, taskA.name)
assert.equal(srtInstances.at(-1).props.media.taskId, taskA.id)
assert.equal(srtInstances.at(-1).props.media.type, 'video')
srtInstances.at(-1).close(); await flush()
vm.mediaTypeFilter = 'video'; await flush()
click(byClass('media-card-open')[0]); await flush()
assert.equal(vm.previewMedia.id, videoA.id)
assert.equal(vm.previewTask.id, taskA.id)
const firstVideo = all(root, item => item.type === 'video')[0]
assert(firstVideo)
click(byClass('collaboration-toggle')[0]); await flush()
assert.equal(overlayInstances.at(-1).props.media.id, videoA.id)
assert.equal(overlayInstances.at(-1).props.media.taskId, taskA.id)
assert.equal(Vue.toRaw(overlayInstances.at(-1).props.video), firstVideo)
assert.equal(overlayInstances.at(-1).props.fullscreen, true)
assert(overlayInstances.at(-1).props.mediaList.some(item => item.fileName.endsWith('.SRT')))
await firstVideo.play(); await Vue.nextTick()
assert.equal(overlayInstances.at(-1).props.playbackStarted, true, 'Collection player remembers initial play just like the review player')
vm.switchPreview(1); await flush()
assert.equal(vm.previewMedia.id, videoB.id)
assert.equal(vm.previewTask.id, taskB.id, 'Switching same-name videos preserves their original task identity')
assert.equal(byClass('stub-overlay').length, 0)
assert.equal(closedOverlays, 1, 'Switching video destroys the old collaboration panel')
assert.notEqual(all(root, item => item.type === 'video')[0], firstVideo)
click(byClass('collaboration-toggle')[0]); await flush()
assert.equal(overlayInstances.at(-1).props.media.id, videoB.id)
assert.equal(overlayInstances.at(-1).props.media.taskId, taskB.id)
const secondVideo = all(root, item => item.type === 'video')[0]
vm.openSrtInfo(videoB, taskB); await flush()
assert.equal(secondVideo.pauses, 1, 'Opening SRT information pauses an existing preview')
assert.equal(srtInstances.at(-1).props.media.id, videoB.id)
windowListeners.get('keydown')({ key: 'ArrowLeft', preventDefault() {} })
assert.equal(vm.previewMedia.id, videoB.id, 'Keys inside SRT dialog cannot switch the underlying video')
srtInstances.at(-1).close(); await flush()
overlayInstances.at(-1).close(); await flush()
assert.equal(byClass('stub-overlay').length, 0)
click(byClass('collaboration-toggle')[0]); await flush()
vm.retryVideoPlayback(); await flush()
assert.equal(byClass('stub-overlay').length, 0, 'Retry closes the old map and its subtitle lifecycle')
click(byClass('collaboration-toggle')[0]); await flush()
all(root, item => item.type === 'video')[0].props.onError(); await flush()
assert.equal(vm.videoPlaybackFailed, true)
assert.equal(byClass('stub-overlay').length, 0, 'Playback failure destroys the old collaboration panel')
vm.openMedia(imageA, taskA, [{ media: imageA, task: taskA }]); await flush()
assert.equal(byClass('preview-image-stage').length, 1)
assert.equal(byClass('collaboration-toggle').length, 0, 'Image preview never offers drone-video collaboration')
assert.equal(byClass('stub-overlay').length, 0)
vm.openSrtInfo(noUrlVideo, taskA); await flush()
assert.equal(srtInstances.at(-1).props.media.id, 'no-url', 'SRT uses the video ID, not its URL or thumbnail')
props.activeTab = 'recognition'; await flush()
assert.equal(vm.previewMedia, undefined)
assert.equal(vm.srtContext, undefined)
app.unmount()
assert.equal(windowListeners.size, 0)

const playerRoot = node('root')
const playerProps = Vue.reactive({ media: { id: 'review-video', taskId: 'review-task', fileName: 'review.mp4' },
  mediaList: [], src: 'https://video.test/review.mp4', autoplay: false, fullscreen: false, collaborationAvailable: false })
const playerApp = renderer.createApp({ setup: () => () => Vue.h(SharedPlayer, { ...playerProps }) })
playerApp.mount(playerRoot)
await flush()
const reviewVideo = all(playerRoot, item => item.type === 'video')[0]
assert(reviewVideo && !reviewVideo.props.autoplay, 'Review mode keeps manual playback')
assert.equal(all(playerRoot, item => item.props.class === 'collaboration-toggle').length, 0)
playerProps.collaborationAvailable = true
await flush()
const reviewToggle = () => all(playerRoot, item => item.props.class === 'collaboration-toggle')[0]
click(reviewToggle()); await flush()
assert.equal(overlayInstances.at(-1).props.playbackStarted, false)
await reviewVideo.props.onClick({ currentTarget: reviewVideo, target: reviewVideo, button: 0, detail: 1,
  clientY: 350, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } })
await flush()
assert.equal(reviewVideo.paused, false, 'Clicking review video starts the shared player')
assert.equal(overlayInstances.at(-1).props.playbackStarted, true)
playerProps.fullscreen = true
await flush()
assert.equal(overlayInstances.at(-1).props.fullscreen, true, 'Review fullscreen keeps the existing overlay alive')
click(reviewToggle()); await flush()
click(reviewToggle()); await flush()
assert.equal(overlayInstances.at(-1).props.playbackStarted, true, 'Reopening collaboration does not reset first-play state')
playerProps.collaborationAvailable = false
await flush()
assert.equal(all(playerRoot, item => item.props.class === 'stub-overlay').length, 0)
playerApp.unmount()
console.log('Collection and review player integration: card actions, SRT IDs, collaboration, click playback, first play, fullscreen, switching and cleanup passed')
