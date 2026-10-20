export interface TelemetryLocationPoint { longitude: number; latitude: number }
export interface TelemetryLocationState { status: 'idle' | 'loading' | 'ready' | 'error'; text: string }

/** 由播放开始/暂停等离散事件驱动：约 20m 网格缓存、限频、只应用当前网格结果。 */
export function createTelemetryLocationResolver(
  request: (point: TelemetryLocationPoint, signal: AbortSignal) => Promise<string>,
  publish: (state: TelemetryLocationState) => void,
  options: { now?: () => number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout; minIntervalMs?: number } = {},
) {
  const now = options.now || Date.now
  const schedule = options.setTimer || setTimeout
  const unschedule = options.clearTimer || clearTimeout
  const interval = options.minIntervalMs ?? 3000
  const cache = new Map<string, { state: TelemetryLocationState; expires: number }>()
  let current: { key: string; point: TelemetryLocationPoint } | undefined
  let active: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastStart = -Infinity
  let revision = 0
  let disposed = false

  function cached(key: string) {
    const item = cache.get(key)
    if (item && item.expires > now()) return item.state
    cache.delete(key)
  }

  function plan() {
    if (disposed || !current || active || timer !== undefined || cached(current.key)) return
    const wait = Math.max(0, lastStart + interval - now())
    if (wait === 0) void run()
    else timer = schedule(() => { timer = undefined; void run() }, wait)
  }

  async function run() {
    if (disposed || !current || active) return
    const target = current, version = revision, controller = new AbortController()
    active = controller
    lastStart = now()
    let state: TelemetryLocationState
    try {
      state = { status: 'ready', text: await request(target.point, controller.signal) }
    } catch (reason) {
      state = { status: 'error', text: reason instanceof Error ? reason.message : '具体位置暂时无法获取' }
    }
    if (!disposed && version === revision && !controller.signal.aborted) {
      cache.set(target.key, { state, expires: now() + (state.status === 'ready' ? 300_000 : 30_000) })
      if (cache.size > 128) cache.delete(cache.keys().next().value!)
      if (current?.key === target.key) publish(state)
    }
    if (active === controller) { active = undefined; plan() }
  }

  function clear() {
    ++revision
    if (timer !== undefined) unschedule(timer)
    timer = undefined
    active?.abort()
    active = undefined
    current = undefined
  }

  return {
    update(point?: TelemetryLocationPoint) {
      if (disposed) return
      if (!point || !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)
        || Math.abs(point.longitude) > 180 || Math.abs(point.latitude) > 90) {
        clear()
        publish({ status: 'idle', text: '当前时刻无有效定位' })
        return
      }
      const key = `${Math.round(point.longitude * 5000)}:${Math.round(point.latitude * 5000)}`
      if (current?.key === key && (active || timer !== undefined || cached(key))) return
      current = { key, point: { longitude: point.longitude, latitude: point.latitude } }
      publish(cached(key) || { status: 'loading', text: '正在获取具体位置…' })
      plan()
    },
    /** 切换查询时机/开始拖动时取消等待和在途请求，保留缓存供下次查询复用。 */
    suspend() { clear() },
    dispose() { disposed = true; clear(); cache.clear() },
  }
}
