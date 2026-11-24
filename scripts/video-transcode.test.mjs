import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

globalThis.window = { location: { origin: 'http://localhost:5173' } }
globalThis.localStorage = { getItem: () => 'test-token' }
let replies = [], calls = []
let fileReply, fileCancelled = 0
const fileRequests = []
globalThis.fetch = async (url, options) => {
  fileRequests.push({ url, ...options })
  return fileReply || new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([0])) },
    cancel() { fileCancelled++ },
  }), { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-0/1000000000' } })
}
const apiClient = { defaults: { baseURL: '/api' }, post: async (path, body, config) => { calls.push({ path, body, signal: config.signal }); return replies.shift() } }
const output = ts.transpileModule(readFileSync('src/utils/video-transcode.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', output)(name => { assert.equal(name, '@/api/client'); return { apiClient } }, module, module.exports)
const { prepareTranscodedVideo, transcodeVideoUrl, originalVideoUrl } = module.exports
const media = { id: '310987654321000001' }
const path = `/api/v1/uav/media/transcode/file/${media.id}`
const originalPath = `/api/v1/uav/media/file/${media.id}`
const original = `http://localhost:5173${originalPath}?token=test-token`
let selectedSource
const states = []
for (const source of [media, { ...media, localFileUrl: null, sourceCodec: null, transcodeStatus: 0 },
  { ...media, sourceCodec: 'hevc' }, { ...media, transcodeStatus: 1, transcodeFileUrl: path }]) {
  assert.equal(await prepareTranscodedVideo(source, new AbortController().signal, () => assert.fail('Original playback never waits for transcoding'), false, {
    onSource: value => selectedSource = value, onUpdate: value => states.push(value),
  }), original)
}
assert.equal(calls.length, 0, 'Always try GET /media/file/{id} without starting or polling a transcode, even with missing URL/codec')
assert.equal(fileRequests.length, 4)
assert.equal(fileCancelled, 4, 'Cancel each probe stream immediately instead of downloading a whole video')
assert(fileRequests.every(request => request.headers.Range === 'bytes=0-0' && request.url === original))
assert.equal(selectedSource, 'original')
assert.equal(states.at(-1).originalUrl, original, 'Direct original download is available immediately')
assert.equal(originalVideoUrl(media.id), original)
assert.equal(originalVideoUrl(media.id, `https://untrusted.example${originalPath}?token=foreign`), original, 'Only use configured API origin and current session')
assert.throws(() => originalVideoUrl(media.id, '/api/v1/uav/media/file/123'))
assert.throws(() => transcodeVideoUrl(media.id, '/api/v1/uav/media/transcode/file/123'))
await assert.rejects(prepareTranscodedVideo({ id: 'invalid' }, new AbortController().signal, () => {}), /编号无效/)
apiClient.defaults.baseURL = 'http://api.example/api'
assert.equal(originalVideoUrl(media.id), `http://api.example${originalPath}?token=test-token`)
apiClient.defaults.baseURL = '/api'
fileReply = new Response(JSON.stringify({ code: '10201', msg: '素材尚未下载到本地' }), { headers: { 'content-type': 'application/json' } })
await assert.rejects(prepareTranscodedVideo(media, new AbortController().signal, () => {}), /10201.*素材尚未下载到本地/)
assert.equal(calls.length, 0, 'A missing source file must not silently enter an endless transcode wait')
fileReply = new Response('proxy unavailable', { status: 502, headers: { 'content-type': 'text/html' } })
await assert.rejects(prepareTranscodedVideo(media, new AbortController().signal, () => {}), /HTTP 502/)
fileReply = undefined
const streamFetch = globalThis.fetch
globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
  options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
})
const reading = new AbortController()
const pendingRead = prepareTranscodedVideo(media, reading.signal, () => {})
reading.abort()
await assert.rejects(pendingRead, { name: 'AbortError' })
globalThis.fetch = streamFetch

replies = [{ status: 'RUNNING', progress: 30 }, { status: 'SUCCEEDED', transcodeFileUrl: path }]
const progress = []
assert.equal(await prepareTranscodedVideo(media, new AbortController().signal, n => progress.push(n), true, { pollMs: 0 }), `http://localhost:5173${path}?token=test-token`)
assert.deepEqual(progress, [30])
assert.deepEqual(calls.map(x => x.path), ['/v1/uav/media/transcode', '/v1/uav/media/transcode/status'])
assert.equal(calls[0].body.mediaId, media.id)
replies = [{ status: 'FAILED', error: '转码失败原因' }]
await assert.rejects(prepareTranscodedVideo(media, new AbortController().signal, () => {}, true), /转码失败原因/)
replies = [{ status: 'RUNNING', progress: 10 }]
const controller = new AbortController()
await assert.rejects(prepareTranscodedVideo(media, controller.signal, () => controller.abort(), true), { name: 'AbortError' })
calls = []; replies = [{ status: 'PENDING', localFileUrl: null }, { status: 'RUNNING', sourceCodec: 'h264', localFileUrl: originalPath }, { status: 'SUCCEEDED', transcodeFileUrl: path }]
const fallbackStates = [], unknownProgress = []
assert.equal(await prepareTranscodedVideo(media, new AbortController().signal, n => unknownProgress.push(n), true, { pollMs: 0, onUpdate: state => fallbackStates.push(state) }), `http://localhost:5173${path}?token=test-token`)
assert.deepEqual(unknownProgress, [], 'Missing progress must not be fabricated as zero')
assert.equal(fallbackStates.at(-1).originalUrl, original, 'Download remains available during fallback')
assert.equal(calls.length, 3, 'Fallback never switches back to a failing original, even if backend says H264')
replies = [{ status: 'RUNNING', progress: 0 }]
await assert.rejects(prepareTranscodedVideo(media, new AbortController().signal, () => {}, true, { timeoutMs: 0 }), /长时间未完成/)
const aborted = new AbortController(); aborted.abort()
await assert.rejects(prepareTranscodedVideo(media, aborted.signal, () => {}), { name: 'AbortError' })
console.log('Video direct file playback: GET/Range URL, unknown codec, no transcode wait, download, safe auth, fallback, real progress, timeout and cancellation passed')
