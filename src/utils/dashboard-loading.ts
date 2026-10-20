import type { GovernanceTask, TaskGeometryFeatureCollection } from '@/api/governance-task'
import type { BusinessSceneStat } from '@/api/business-statistics'

/** 汇总缺失与真实的 0 必须区分；不接受 null、空串或布尔值。 */
function countValue(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined
  const count = Number(value)
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined
}

/** 复用一次场景汇总，只为遗漏/无效的场景补查汇总，绝不遍历任务异常明细。 */
export async function loadDashboardSceneCounts(
  sceneCodes: string[],
  sceneStats: BusinessSceneStat[],
  fetchSummary: (sceneCode: string) => Promise<{ total?: number }>,
  isCurrent: () => boolean,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  const missing: string[] = []
  for (const code of new Set(sceneCodes.filter(Boolean))) {
    const matches = sceneStats.filter(item => item.sceneCode === code)
    const count = matches.length === 1 ? countValue(matches[0]?.abnormalCount) : undefined
    if (count !== undefined) counts[code] = count
    else missing.push(code)
  }
  // 限制补查并发；切换部门/刷新版本后，不再发出剩余请求。
  for (let offset = 0; offset < missing.length && isCurrent(); offset += 4) {
    await Promise.all(missing.slice(offset, offset + 4).map(async code => {
      try {
        const count = countValue((await fetchSummary(code))?.total)
        if (isCurrent() && count !== undefined) counts[code] = count
      } catch { /* 保持缺失，页面显示“—”，不伪造 0 或不完整的小计。 */ }
    }))
  }
  return counts
}

/** 场景几何按需读取；在途去重，最多 4 个并发，更新/过期/切换身份后失效。 */
export function createDashboardGeometryLoader(
  fetchGeometry: (taskId: string) => Promise<TaskGeometryFeatureCollection>,
  now: () => number = Date.now,
) {
  type Task = Pick<GovernanceTask, 'id' | 'updateTime'>
  type Geometry = TaskGeometryFeatureCollection
  const cache = new Map<string, { revision: string; time: number; geometry: Geometry }>()
  const pending = new Map<string, { promise: Promise<Geometry | undefined>; consumers: Array<() => boolean> }>()
  const queue: Array<() => void> = []
  let running = 0
  let epoch = 0
  function pump() {
    while (running < 4 && queue.length) queue.shift()!()
  }
  function get(task: Task, isCurrent: () => boolean): Promise<Geometry | undefined> {
    const revision = task.updateTime || ''
    const cached = cache.get(task.id)
    if (cached?.revision === revision && now() - cached.time < 300_000) return Promise.resolve(cached.geometry)
    const key = JSON.stringify([task.id, revision])
    const existing = pending.get(key)
    if (existing) { existing.consumers.push(isCurrent); return existing.promise }
    const requestEpoch = epoch
    const consumers = [isCurrent]
    const request = new Promise<Geometry | undefined>(resolve => {
      queue.push(() => {
        if (requestEpoch !== epoch || !consumers.some(current => current())) { resolve(undefined); return }
        running += 1
        void Promise.resolve().then(() => requestEpoch === epoch && consumers.some(current => current())
          ? fetchGeometry(task.id) : undefined).then(geometry => {
          if (requestEpoch === epoch && geometry) {
            cache.delete(task.id)
            cache.set(task.id, { revision, time: now(), geometry })
            if (cache.size > 256) cache.delete(cache.keys().next().value!)
          }
          resolve(requestEpoch === epoch ? geometry : undefined)
        }, () => resolve(undefined)).finally(() => { running -= 1; pump() })
      })
    })
    pending.set(key, { promise: request, consumers })
    void request.finally(() => { if (pending.get(key)?.promise === request) pending.delete(key) })
    pump()
    return request
  }
  return {
    clear() { epoch += 1; cache.clear(); pending.clear(); pump() },
    async load(tasks: Task[], isCurrent: () => boolean): Promise<Record<string, Geometry>> {
      const requestEpoch = epoch
      const results = await Promise.all(tasks.map(async task => [task.id, await get(task, isCurrent)] as const))
      if (requestEpoch !== epoch || !isCurrent()) return {}
      return Object.fromEntries(results.flatMap(([id, geometry]) => geometry ? [[id, geometry]] : []))
    },
  }
}
