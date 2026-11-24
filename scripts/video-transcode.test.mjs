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
const { prepareTranscodedVideo, transcodeVideoUrl } = module.exports
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
