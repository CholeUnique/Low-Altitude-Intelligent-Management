import type L from 'leaflet'

/**
 * 多期影像比对专用的共享视图组。
 * 模块级状态确保每个 SpotDistributionMap 实例加入的是同一组地图。
 */
const maps = new Set<L.Map>()
let isSynchronizing = false

function synchronizeFrom(source: L.Map) {
  if (isSynchronizing) return
  isSynchronizing = true
  const center = source.getCenter()
  const zoom = source.getZoom()
  try {
    maps.forEach((target) => {
      if (target === source) return
      const targetCenter = target.getCenter()
      if (target.getZoom() !== zoom || !targetCenter.equals(center)) target.setView(center, zoom, { animate: false })
    })
  } finally {
    isSynchronizing = false
  }
}

/**
 * 对比格数变化会改变每个 Leaflet 容器的尺寸。布局稳定后统一重算尺寸，
 * 再使用同一中心点和层级复位，避免 2/3 期切到 4 期时旧窗口发生视觉偏移。
 */
export function refreshComparisonMaps() {
  const source = [...maps][0]
  if (!source) return
  const center = source.getCenter()
  const zoom = source.getZoom()
  isSynchronizing = true
  try {
    maps.forEach((target) => target.invalidateSize({ animate: false, pan: false }))
    maps.forEach((target) => target.setView(center, zoom, { animate: false }))
  } finally {
    isSynchronizing = false
  }
}

export function registerComparisonMap(map: L.Map) {
  const currentMap = [...maps][0]
  maps.add(map)
  if (currentMap) map.setView(currentMap.getCenter(), currentMap.getZoom(), { animate: false })

  const onViewChange = () => synchronizeFrom(map)
  map.on('move zoom', onViewChange)

  return () => {
    map.off('move zoom', onViewChange)
    maps.delete(map)
  }
}
