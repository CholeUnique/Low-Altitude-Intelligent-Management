import type { UavFlightTaskOption } from '@/api/patrol'
import type { LiveMediaItem } from '@/mocks/patrol-live'

export interface CollectionMediaEntry { media: LiveMediaItem; task: UavFlightTaskOption }
interface TaskCache {
  items: LiveMediaItem[]
  received: number
  nextPage: number
  exhausted: boolean
  pending?: Promise<void>
}
export interface CollectionMediaFilter {
  task: (task: UavFlightTaskOption) => boolean
  media: (media: LiveMediaItem, task: UavFlightTaskOption) => boolean
}

/** 按任务依次填充混合列表；固定接口页大小，剩余记录缓存供下一屏使用。 */
export function createCollectionMediaPager(
  tasks: UavFlightTaskOption[],
  request: (params: { taskId: string; pageNum: number; pageSize: number }) => Promise<{ list: LiveMediaItem[]; total: number }>,
  pageSize = 40,
) {
  const caches = new Map<string, TaskCache>()
  const cacheFor = (id: string) => {
    let cache = caches.get(id)
    if (!cache) {
      cache = { items: [], received: 0, nextPage: 1, exhausted: false }
      caches.set(id, cache)
    }
    return cache
  }
  async function readNext(task: UavFlightTaskOption) {
    const cache = cacheFor(task.id)
    if (cache.pending) return cache.pending
    if (cache.exhausted) return
    cache.pending = (async () => {
      const result = await request({ taskId: task.id, pageNum: cache.nextPage, pageSize })
      if (!result.list.length && cache.received < result.total) throw new Error('素材分页返回空数据，请重试')
      const known = new Set(cache.items.map(item => item.id))
      const added = result.list.filter(item => !known.has(item.id))
      if (result.list.length && !added.length) throw new Error('素材分页未返回新的记录，请重试')
      cache.items.push(...added)
      cache.received += result.list.length
      cache.nextPage += 1
      cache.exhausted = cache.received >= result.total || !result.list.length
    })()
    try { await cache.pending } finally { cache.pending = undefined }
  }
  async function readUntil(count: number, filter: CollectionMediaFilter, active: () => boolean = () => true) {
    const eligibleTasks = tasks.filter(filter.task)
    const entries: CollectionMediaEntry[] = []
    for (let index = 0; index < eligibleTasks.length; index++) {
      const task = eligibleTasks[index]!
      const cache = cacheFor(task.id)
      let consumed = 0
      while (active()) {
        entries.push(...cache.items.slice(consumed).filter(item => filter.media(item, task)).map(media => ({ media, task })))
        consumed = cache.items.length
        if (entries.length >= count) return { entries, hasMore: !cache.exhausted || index < eligibleTasks.length - 1 }
        if (cache.exhausted) break
        await readNext(task)
      }
      if (!active()) return undefined
    }
    return { entries, hasMore: false }
  }
  return { readUntil, taskMedia: (taskId: string) => caches.get(taskId)?.items || [] }
}
