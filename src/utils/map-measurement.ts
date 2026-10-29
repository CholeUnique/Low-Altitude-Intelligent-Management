import type { LatLng } from 'leaflet'
export function geodesicArea(points: Pick<LatLng,'lat'|'lng'>[]) {
  const radius = 6378137
  let area = 0
  points.forEach((point,index) => {
    const next = points[(index+1)%points.length]!
    area += (next.lng-point.lng)*Math.PI/180*(2+Math.sin(point.lat*Math.PI/180)+Math.sin(next.lat*Math.PI/180))
  })
  return Math.abs(area*radius*radius/2)
}
export function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres/1000).toFixed(2)} 公里` : `${metres.toFixed(1)} 米`
}
export function formatArea(squareMetres: number) {
  return squareMetres >= 1_000_000 ? `${(squareMetres/1_000_000).toFixed(2)} 平方公里` : `${squareMetres.toFixed(0)} 平方米`
}
