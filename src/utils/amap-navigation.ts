/** 使用当前定位在高德地图中打开驾车导航。 */
export function openAmapNavigation(longitude: number | undefined, latitude: number | undefined, address: string) {
  if (longitude == null || latitude == null || !Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return
  const url = new URL('https://uri.amap.com/navigation')
  url.searchParams.set('to', `${longitude},${latitude},${address.trim() || '拍摄位置'}`)
  url.searchParams.set('mode', 'car')
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}
