import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(path) {
  const module = { exports: {} }
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('module', 'exports', compiled)(module, module.exports)
  return module.exports
}
const { createTelemetryLocationResolver } = load('src/utils/telemetry-location.ts')
const { getTiandituAddress } = load('src/api/geocoding.ts')
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
let now = 0, timerId = 0
const timers = new Map(), calls = [], states = [], pending = []
const options = { now: () => now, setTimer: (fn, delay) => { timers.set(++timerId, { fn, at: now + delay }); return timerId }, clearTimer: id => timers.delete(id) }
function advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn() } }
const resolver = createTelemetryLocationResolver((point, signal) => {
  calls.push({ point, signal }); const item = deferred(); pending.push(item); return item.promise
}, state => states.push(state), options)
const a = { longitude: 119.84, latitude: 32.47 }, b = { longitude: 119.841, latitude: 32.471 }, c = { longitude: 119.842, latitude: 32.472 }
resolver.update(a)
assert.equal(calls.length, 1)
for (let frame = 0; frame < 90; frame++) resolver.update({ longitude: a.longitude + frame * .0000001, latitude: a.latitude })
assert.equal(calls.length, 1, '30fps movement within the same small cell does not generate requests')
pending.shift().resolve('江苏省泰州市某村附近'); await tick()
assert.equal(states.at(-1).status, 'ready')
resolver.update(b)
assert.equal(states.at(-1).status, 'loading', 'Do not display the previous address after moving to another cell')
assert.equal(calls.length, 1)
advance(2999); assert.equal(calls.length, 1)
advance(1); assert.equal(calls.length, 2, 'At most one request per three seconds')
resolver.update(c)
pending.shift().resolve('旧坐标地址'); await tick()
assert.equal(states.at(-1).status, 'loading', 'Late response must not apply to a different current coordinate')
advance(3000)
assert.equal(calls.length, 3)
pending.shift().resolve('新坐标地址'); await tick()
assert.equal(states.at(-1).text, '新坐标地址')
resolver.update(a)
assert.equal(states.at(-1).text, '江苏省泰州市某村附近', 'Cached nearby address reused when seeking back')
assert.equal(calls.length, 3)
resolver.update()
assert.equal(states.at(-1).status, 'idle', 'No address carried through GPS gap')
resolver.update({ longitude: 118, latitude: 31 })
advance(3000)
pending.shift().reject(new Error('逆地理编码权限未开通')); await tick()
assert.equal(states.at(-1).status, 'error')
assert.match(states.at(-1).text, /权限/)
const count = calls.length
for (let i = 0; i < 90; i++) resolver.update({ longitude: 118, latitude: 31 })
assert.equal(calls.length, count, 'Failures are backed off instead of retrying every frame')
resolver.update({ longitude: 117, latitude: 30 }); advance(3000)
const closing = pending.shift(), activeSignal = calls.at(-1).signal
const publishedBeforeClose = states.length
resolver.dispose()
assert(activeSignal.aborted)
closing.resolve('不应出现的地址'); await tick()
advance(10000)
assert.equal(states.length, publishedBeforeClose)
assert.equal(timers.size, 0)

const suspendCalls = [], suspendStates = [], suspendPending = []
const suspended = createTelemetryLocationResolver((point, signal) => {
  const item = deferred(); suspendCalls.push({ point, signal }); suspendPending.push(item); return item.promise
}, state => suspendStates.push(state), options)
suspended.update(a)
suspendPending.shift().resolve('已缓存的暂停地址'); await tick()
suspended.update(b)
assert.equal(timers.size, 1)
suspended.suspend()
advance(3000)
assert.equal(timers.size, 0)
assert.equal(suspendCalls.length, 1, 'Resume cancels a throttled queued request')
suspended.update(a)
assert.equal(suspendStates.at(-1).text, '已缓存的暂停地址', 'Suspending retains cached results for the next pause')
suspended.update(b)
assert.equal(suspendCalls.length, 2)
const latePauseAddress = suspendPending.shift(), beforeSuspend = suspendStates.length
suspended.suspend()
assert(suspendCalls.at(-1).signal.aborted)
latePauseAddress.resolve('取消后不应显示'); await tick()
assert.equal(suspendStates.length, beforeSuspend)
suspended.dispose()

const originalFetch = globalThis.fetch
let sentUrl, sentOptions
globalThis.fetch = async (url, options) => {
  sentUrl = new URL(url); sentOptions = options
  return new Response(JSON.stringify({ status: '0', result: { formatted_address: '江苏省泰州市海陵区' } }))
}
assert.equal(await getTiandituAddress('map-key', 119.84, 32.47), '江苏省泰州市海陵区')
assert.equal(sentUrl.origin, 'https://api.tianditu.gov.cn')
assert.equal(sentUrl.pathname, '/geocoder')
assert.deepEqual(JSON.parse(sentUrl.searchParams.get('postStr')), { lon: 119.84, lat: 32.47, ver: 1 })
assert.equal(sentUrl.searchParams.get('type'), 'geocode')
assert.equal(sentOptions.credentials, 'omit')
assert.equal(sentOptions.headers, undefined, 'Never send business bearer token to map provider')
await assert.rejects(getTiandituAddress('', 119, 32), /未配置/)
await assert.rejects(getTiandituAddress('map-key', 181, 32), /无效/)
globalThis.fetch = async () => new Response(JSON.stringify({ status: '1', msg: 'invalid token' }))
await assert.rejects(getTiandituAddress('map-key', 119, 32), /权限/)
globalThis.fetch = async () => new Response(JSON.stringify({ status: '0', result: {} }))
await assert.rejects(getTiandituAddress('map-key', 119, 32), /暂无/)
globalThis.fetch = originalFetch
console.log('Telemetry location: provider request, cache/throttle, suspend/resume cancellation, stale responses, failure backoff and close cleanup passed.')
