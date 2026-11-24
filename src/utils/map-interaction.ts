import L from 'leaflet'

// Windows 鼠标的一格滚轮可能产生 120 个归一化像素，或连续几个小事件。
// Leaflet 默认 60px / 40ms 会把它放大成两级或分两次缩放。
// 在应用启动时统一设置，让所有地图（包括延迟加载的地图）保持相同手感。
L.Map.mergeOptions({
  wheelPxPerZoomLevel: 120,
  wheelDebounceTime: 120,
})
