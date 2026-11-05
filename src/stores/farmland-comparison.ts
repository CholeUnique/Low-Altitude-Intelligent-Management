import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from './user'
import type { SpatialOverlaySummary, SpatialSource } from '@/api/spatial-analysis'

interface ComparisonSnapshot {
  areaA: number
  areaB: number
  diffRate: number | null
  sourceA: SpatialSource
  sourceB: SpatialSource
  resultId: string
  minAreaSqm: number
  origin: 'analysis' | 'default'
}
type ComparisonSummary = Pick<SpatialOverlaySummary, 'areaA' | 'areaB' | 'diffRate' | 'sourceA' | 'sourceB' | 'resultId' | 'minAreaSqm'>
function valid(value: unknown): value is ComparisonSnapshot {
  if (!value || typeof value !== 'object') return false
  const record = value as ComparisonSnapshot
  const nonnegative = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0
  return nonnegative(record.areaA) && nonnegative(record.areaB) && nonnegative(record.minAreaSqm)
    && (record.diffRate === null || nonnegative(record.diffRate))
    && typeof record.sourceA?.layerName === 'string' && typeof record.sourceB?.layerName === 'string'
    && typeof record.resultId === 'string' && ['analysis', 'default'].includes(record.origin)
}

/** 只保存汇总和输入快照，不保存图斑几何；同账号、同部门的首页与专题页共用。 */
export const useFarmlandComparisonStore = defineStore('farmland-comparison', () => {
  const user = useUserStore()
  const scope = computed(() => {
    const account = user.currentUser?.id ?? user.currentUser?.username
    return user.token && account != null && user.activeDeptId
      ? `farmland-comparison:v1:${encodeURIComponent(String(account))}:${encodeURIComponent(user.activeDeptId)}` : ''
  })
  const latest = ref<ComparisonSnapshot>()
  const storageError = ref('')
  function restore() {
    latest.value = undefined; storageError.value = ''
    if (!scope.value) return
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(scope.value) || 'null')
      if (valid(saved)) latest.value = saved
    } catch { storageError.value = '本机分析摘要无法读取。' }
  }
  watch(scope, restore, { immediate: true, flush: 'sync' })
  function remember(summary: ComparisonSummary, origin: ComparisonSnapshot['origin'] = 'analysis', expectedScope = scope.value) {
    if (!scope.value || expectedScope !== scope.value || (origin === 'default' && latest.value?.origin === 'analysis')) return false
    const snapshot = { areaA: summary.areaA, areaB: summary.areaB, diffRate: summary.diffRate,
      sourceA: summary.sourceA, sourceB: summary.sourceB, resultId: String(summary.resultId), minAreaSqm: summary.minAreaSqm, origin }
    if (!valid(snapshot)) return false
    // 去掉 Vue 代理，并隔离后续对图层筛选条件的修改。
    latest.value = JSON.parse(JSON.stringify(snapshot)) as ComparisonSnapshot
    try { localStorage.setItem(scope.value, JSON.stringify(latest.value)); storageError.value = '' }
    catch { storageError.value = '本机无法保存分析摘要，本次结果仅在当前页面会话中保留。' }
    return true
  }
  if (typeof window !== 'undefined') {
    const onStorage = (event: StorageEvent) => { if (event.key === scope.value || event.key === null) restore() }
    window.addEventListener('storage', onStorage)
    onScopeDispose(() => window.removeEventListener('storage', onStorage))
  }
  return { scope, latest, storageError, remember }
})
