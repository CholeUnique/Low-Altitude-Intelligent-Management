import { fromArrayBuffer } from 'geotiff'
import proj4 from 'proj4'
import { zip } from '@mapbox/shp-write'
import type { TaskGeometryFeatureCollection } from '@/api/governance-task'

export interface ReviewImagery {
  previewDataUrl: string
  bounds: [number, number, number, number]
  epsg: number
  width: number
  height: number
  boundary?: TaskGeometryFeatureCollection
  boundaryFileId?: string
}
export const reviewImageryAccept = '.jpg,.jpeg,.png,.tif,.tiff,image/jpeg,image/png,image/tiff,image/geotiff'
export function reviewImageryFileError(files: File[]) {
  if (files.length !== 1) return '每次请选择一幅复核影像。'
  if (!/\.(tiff?|jpe?g|png)$/i.test(files[0]!.name)) return '请上传 JPG / PNG 图片进行地理配准，或上传已有坐标的 GeoTIFF。'
  if (files[0]!.size > 100 * 1024 * 1024) return '复核影像单个文件不能超过 100MB。'
  return ''
}
export async function readReviewGeoTiff(file: File): Promise<ReviewImagery> {
  const tiff = await fromArrayBuffer(await file.arrayBuffer())
  const image = await tiff.getImage()
  const keys = image.getGeoKeys()
  const epsg = Number(keys?.ProjectedCSTypeGeoKey || keys?.GeographicTypeGeoKey)
  if (!epsg || epsg === 32767) throw new Error('影像缺少可识别的 EPSG 坐标系，请导出标准 GeoTIFF。')
  if (epsg === 4490) proj4.defs('EPSG:4490', '+proj=longlat +ellps=GRS80 +no_defs')
  if ((epsg >= 32601 && epsg <= 32660) || (epsg >= 32701 && epsg <= 32760)) proj4.defs(`EPSG:${epsg}`, `+proj=utm +zone=${epsg % 100} ${epsg >= 32701 ? '+south' : ''} +datum=WGS84 +units=m +no_defs`)
  if (!proj4.defs(`EPSG:${epsg}`)) throw new Error(`暂不支持 EPSG:${epsg}，请先转换为 EPSG:4326 或 EPSG:3857。`)
  const matrix = image.getFileDirectory().getValue('ModelTransformation')
  if (matrix && (matrix[1] || matrix[4])) throw new Error('暂不支持旋转栅格，请导出北向朝上的正射 GeoTIFF。')
  const [xmin, ymin, xmax, ymax] = image.getBoundingBox()
  const corners = [[xmin!, ymin!], [xmin!, ymax!], [xmax!, ymin!], [xmax!, ymax!]].map(p => proj4(`EPSG:${epsg}`, 'EPSG:4326', p))
  const bounds: ReviewImagery['bounds'] = [Math.min(...corners.map(p => p[0]!)), Math.min(...corners.map(p => p[1]!)), Math.max(...corners.map(p => p[0]!)), Math.max(...corners.map(p => p[1]!))]
  if (!bounds.every(Number.isFinite) || bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -85 || bounds[3] > 85 || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) throw new Error('影像坐标范围无效。')
  const width = image.getWidth(), height = image.getHeight()
  const ratio = Math.min(1, 1024 / Math.max(width, height))
  const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio))
  const raster = await image.readRGB({ width: w, height: h, interleave: true, enableAlpha: true })
  const channels = raster.length / (w * h)
  const origin = image.getOrigin(), resolution = image.getResolution()
  const lower = proj4('EPSG:4326', 'EPSG:3857', [bounds[0], bounds[1]])
  const upper = proj4('EPSG:4326', 'EPSG:3857', [bounds[2], bounds[3]])
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const context = canvas.getContext('2d')!
  const pixels = context.createImageData(w, h)
  const bits = image.getFileDirectory().getValue('BitsPerSample')?.[0] || 8
  const scale = raster instanceof Uint8Array || raster instanceof Uint8ClampedArray ? 1 : bits > 8 ? 255 / (2 ** Math.min(bits, 16) - 1) : 1
  // 将源坐标像素重投影到地图的 Web Mercator，避免把投影坐标影像当普通图片拉伸。
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const source = proj4('EPSG:3857', `EPSG:${epsg}`, [lower[0]! + (x + .5) / w * (upper[0]! - lower[0]!), upper[1]! - (y + .5) / h * (upper[1]! - lower[1]!)])
    const sx = Math.floor((source[0]! - origin[0]!) / resolution[0]! * w / width)
    const sy = Math.floor((source[1]! - origin[1]!) / resolution[1]! * h / height)
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
    const input = (sy * w + sx) * channels, output = (y * w + x) * 4
    for (let c = 0; c < 3; c++) pixels.data[output + c] = Number(raster[input + c]) * scale
    pixels.data[output + 3] = channels === 4 ? Number(raster[input + 3]) * scale : 255
  }
  context.putImageData(pixels, 0, 0)
  return { previewDataUrl: canvas.toDataURL('image/webp', .85), bounds, epsg, width, height }
}
export function reviewBoundary(points: [number, number][], bounds: ReviewImagery['bounds']): TaskGeometryFeatureCollection {
  if (new Set(points.map(p => p.join(','))).size < 3) throw new Error('请至少绘制三个不同的点。')
  if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3])) throw new Error('请在上传影像范围内绘制边界。')
  const ring = [...points, points[0]!]
  const cross = (a: number[], b: number[], c: number[]) => (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!)
  for (let i = 0; i < points.length; i++) for (let j = i + 2; j < points.length; j++) {
    if (i === 0 && j === points.length - 1) continue
    const a = ring[i]!, b = ring[i + 1]!, c = ring[j]!, d = ring[j + 1]!
    if (cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0 && Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <= Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) && Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <= Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))) throw new Error('绘制边界不能交叉或重叠，请重新绘制。')
  }
  const area = ring.slice(1).reduce((sum, point, i) => sum + ring[i]![0] * point[1] - point[0] * ring[i]![1], 0)
  if (Math.abs(area) < 1e-12) throw new Error('绘制边界必须形成有效的面。')
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] }
}
export async function reviewShapefile(boundary: TaskGeometryFeatureCollection, name: string) {
  const blob = await zip<'blob'>(boundary as GeoJSON.FeatureCollection, { outputType: 'blob', compression: 'STORE', types: { polygon: 'review_boundary' } })
  return new File([blob], `${name}_复核图斑.zip`, { type: 'application/zip' })
}
