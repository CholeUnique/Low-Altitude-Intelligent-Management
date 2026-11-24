import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

globalThis.window = { location: { origin: 'http://localhost:5173' } }
globalThis.localStorage = { getItem: () => 'test-token' }
let replies = [], calls = []
const apiClient = { defaults: { baseURL: '/api' }, post: async (path, body, config) => { calls.push({ path, body, signal: config.signal }); return replies.shift() } }
const output = ts.transpileModule(readFileSync('src/utils/video-transcode.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', output)(name => { assert.equal(name, '@/api/client'); return { apiClient } }, module, module.exports)
const { prepareTranscodedVideo, transcodeVideoUrl, originalVideoUrl, canPlayOriginalVideo } = module.exports
const media = { id: '310987654321000001' }
const path = `/api/v1/uav/media/transcode/file/${media.id}`
assert.equal(await prepareTranscodedVideo({ ...media, transcodeStatus: 1, transcodeFileUrl: path }, new AbortController().signal, () => {}), `http://localhost:5173${path}?token=test-token`)
assert.equal(calls.length, 0)
assert.throws(() => transcodeVideoUrl(media.id, '/api/v1/uav/media/transcode/file/123'))
replies = [{ status: 'RUNNING', progress: 30 }, { status: 'SUCCEEDED', transcodeFileUrl: path }]
const progress = []
assert.equal(await prepareTranscodedVideo(media, new AbortController().signal, n => progress.push(n)), `http://localhost:5173${path}?token=test-token`)
assert.deepEqual(progress, [30])
assert.deepEqual(calls.map(x => x.path), ['/v1/uav/media/transcode', '/v1/uav/media/transcode/status'])
assert.equal(calls[0].body.mediaId, media.id)
replies = [{ status: 'FAILED', error: '转码失败原因' }]
await assert.rejects(prepareTranscodedVideo(media, new AbortController().signal, () => {}), /转码失败原因/)
replies = [{ status: 'RUNNING', progress: 10 }]
const controller = new AbortController()
const pending = prepareTranscodedVideo(media, controller.signal, () => controller.abort())
await assert.rejects(pending, { name: 'AbortError' })
console.log('Video transcode cache, polling, error, cancellation and URL checks passed')
const originalPath = `/api/v1/uav/media/file/${media.id}`
const original = `http://localhost:5173${originalPath}?token=test-token`
assert.equal(originalVideoUrl(media.id, `https://untrusted.example${originalPath}?token=foreign`), original, 'Only use the configured API origin and the current session, never the returned host')
assert.throws(() => originalVideoUrl(media.id, '/api/v1/uav/media/file/123'))
assert(canPlayOriginalVideo('h264', () => ''))
assert(canPlayOriginalVideo('HEVC', type => type.includes('hvc1.1.') ? 'probably' : ''))
assert(!canPlayOriginalVideo('hevc', () => ''))
assert(!canPlayOriginalVideo(null, () => 'probably'))
calls = []; replies = [{ status: 'RUNNING', progress: 0, localFileUrl: originalPath, sourceCodec: 'h264' }]
let selectedSource
const states = []
assert.equal(await prepareTranscodedVideo(media, new AbortController().signal, () => { throw Error('Playable original should not wait for transcode') }, false, { onSource: value => selectedSource = value, onUpdate: value => states.push(value) }), original)
assert.equal(calls.length, 1); assert.equal(selectedSource, 'original'); assert.equal(states.at(-1).originalUrl, original)
calls = []; replies = [{ status: 'FAILED', error: '硬编失败', localFileUrl: originalPath, sourceCodec: 'hevc' }]
assert.equal(await prepareTranscodedVideo(media, new AbortController().signal, () => {}, false, { canPlayType: () => 'maybe' }), original, 'A playable original is independent of background transcoding failures')
calls = []; replies = [{ status: 'RUNNING', localFileUrl: originalPath, sourceCodec: 'hevc' }, { status: 'SUCCEEDED', transcodeFileUrl: path }]
const unknownProgress = [], unknownStates = []
assert.equal(await prepareTranscodedVideo(media, new AbortController().signal, n => unknownProgress.push(n), false, { canPlayType: () => '', pollMs: 0, onUpdate: state => unknownStates.push(state) }), `http://localhost:5173${path}?token=test-token`)
assert.deepEqual(unknownProgress, [], 'A missing progress field must never be fabricated as zero')
assert.equal(unknownStates.at(-1).originalUrl, original, 'Download stays available when a later status response omits the original URL')
calls = []; replies = [{ status: 'PENDING', sourceCodec: null, localFileUrl: null }, { status: 'RUNNING', sourceCodec: 'h264', localFileUrl: originalPath }]
assert.equal(await prepareTranscodedVideo(media, new AbortController().signal, () => {}, false, { pollMs: 0 }), original, 'Switch to the original when the source finishes downloading during polling')
calls = []; replies = [{ status: 'RUNNING', progress: 0, localFileUrl: originalPath, sourceCodec: 'h264' }, { status: 'SUCCEEDED', transcodeFileUrl: path }]
assert.equal(await prepareTranscodedVideo({ ...media, sourceCodec: 'h264', localFileUrl: originalPath }, new AbortController().signal, () => {}, true, { pollMs: 0 }), `http://localhost:5173${path}?token=test-token`, 'Actual original-playback failure forces the compatible result instead of looping back to the original')
assert.equal(calls.length, 2)
calls = []; replies = []
assert.equal(await prepareTranscodedVideo({ ...media, sourceCodec: 'h264', localFileUrl: originalPath }, new AbortController().signal, () => {}), original)
assert.equal(calls.length, 0, 'Known playable local originals do not enqueue an unnecessary transcode')
replies = [{ status: 'RUNNING', progress: 0 }]
await assert.rejects(prepareTranscodedVideo(media, new AbortController().signal, () => {}, false, { timeoutMs: 0 }), /长时间未完成/)
console.log('Original-first playback: new fields, H264/HEVC capability, source download, real progress, authenticated URLs, timeout and forced fallback passed')
