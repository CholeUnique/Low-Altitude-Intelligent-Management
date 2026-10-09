import proj4 from 'proj4'
import { writeArrayBuffer } from 'geotiff'
import type { ReviewImagery } from './review-geotiff'

export interface ControlPoint { pixelX: number; pixelY: number; x: number; y: number }
export const coordinateSystems = [
  { code: 'EPSG:4326', name: 'WGS84 经纬度（EPSG:4326）' },
  { code: 'EPSG:4490', name: 'CGCS2000 经纬度（EPSG:4490）' },
  { code: 'EPSG:3857', name: 'Web Mercator 米制坐标（EPSG:3857）' },
  { code: 'EPSG:32650', name: 'WGS84 / UTM 50N 米制坐标（EPSG:32650）' },
  { code: 'EPSG:32651', name: 'WGS84 / UTM 51N 米制坐标（EPSG:32651）' },
]
proj4.defs('EPSG:4490', '+proj=longlat +ellps=GRS80 +no_defs')
for (const zone of [50, 51]) proj4.defs(`EPSG:326${zone}`, `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`)

function solve(matrix: number[][], values: number[]) {
  const rows = matrix.map((row, i) => [...row, values[i]!])
  for (let col = 0; col < 3; col++) {
    let pivot = col
    for (let row = col + 1; row < 3; row++) if (Math.abs(rows[row]![col]!) > Math.abs(rows[pivot]![col]!)) pivot = row
    if (Math.abs(rows[pivot]![col]!) < 1e-10) throw new Error('控制点不能共线或重复，请重新选点。')
    ;[rows[col], rows[pivot]] = [rows[pivot]!, rows[col]!]
    const scale = rows[col]![col]!
    rows[col] = rows[col]!.map(value => value / scale)
    for (let row = 0; row < 3; row++) if (row !== col) {
      const factor = rows[row]![col]!
      rows[row] = rows[row]!.map((value, index) => value - factor * rows[col]![index]!)
    }
  }
  return rows.map(row => row[3]!)
}

/** 在归一化像素空间拟合仿射变换，输出统一地图投影 EPSG:3857。 */
export function fitControlPoints(points: ControlPoint[], crs: string, width: number, height: number) {
  if (points.length < 3) throw new Error('请至少添加三个控制点。')
  if (!coordinateSystems.some(item => item.code === crs)) throw new Error('请选择支持的坐标系。')
  const targets = points.map(point => {
    if (![point.pixelX, point.pixelY, point.x, point.y].every(Number.isFinite)) throw new Error('请填写每个控制点的有效坐标。')
    if (point.pixelX < 0 || point.pixelX > width || point.pixelY < 0 || point.pixelY > height) throw new Error('控制点必须位于图片内。')
    const lonlat = proj4(crs, 'EPSG:4326', [point.x, point.y])
    if (!lonlat.every(Number.isFinite) || Math.abs(lonlat[0]!) > 180 || Math.abs(lonlat[1]!) > 85) throw new Error('控制点坐标超出有效范围，请核对坐标系。')
    return proj4(crs, 'EPSG:3857', [point.x, point.y])
  })
  const vectors = points.map(point => [1, point.pixelX / width, point.pixelY / height])
  const matrix = [0, 1, 2].map(i => [0, 1, 2].map(j => vectors.reduce((sum, v) => sum + v[i]! * v[j]!, 0)))
  const coefficients = [0, 1].map(axis => solve(matrix, [0, 1, 2].map(i => vectors.reduce((sum, v, index) => sum + v[i]! * targets[index]![axis]!, 0))))
  const forward = (x: number, y: number) => coefficients.map(c => c[0]! + c[1]! * x / width + c[2]! * y / height)
  const [a, b] = coefficients
  const determinant = a![1]! * b![2]! - a![2]! * b![1]!
  if (Math.abs(determinant) < 1e-6) throw new Error('地理坐标不能共线或重合。')
  const inverse = (x: number, y: number) => [((x - a![0]!) * b![2]! - (y - b![0]!) * a![2]!) / determinant * width, ((y - b![0]!) * a![1]! - (x - a![0]!) * b![1]!) / determinant * height]
  const rmse = Math.sqrt(points.reduce((sum, p, i) => { const result = forward(p.pixelX, p.pixelY); return sum + (result[0]! - targets[i]![0]!) ** 2 + (result[1]! - targets[i]![1]!) ** 2 }, 0) / points.length)
  return { forward, inverse, rmse }
}

export async function georeferencePhoto(file: File, points: ControlPoint[], crs: string) {
  const bitmap = await createImageBitmap(file)
  try {
    const transform = fitControlPoints(points, crs, bitmap.width, bitmap.height)
    const corners = [[0, 0], [bitmap.width, 0], [0, bitmap.height], [bitmap.width, bitmap.height]].map(p => transform.forward(p[0]!, p[1]!))
    const extent = [Math.min(...corners.map(p => p[0]!)), Math.min(...corners.map(p => p[1]!)), Math.max(...corners.map(p => p[0]!)), Math.max(...corners.map(p => p[1]!))]
    const lower = proj4('EPSG:3857', 'EPSG:4326', extent.slice(0, 2)), upper = proj4('EPSG:3857', 'EPSG:4326', extent.slice(2, 4))
    const bounds: ReviewImagery['bounds'] = [lower[0]!, lower[1]!, upper[0]!, upper[1]!]
    if (!bounds.every(Number.isFinite) || bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -85 || bounds[3] > 85) throw new Error('配准范围超出有效地图范围，请核对控制点。')
    const source = document.createElement('canvas'), output = document.createElement('canvas')
    const ratio = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
    source.width = Math.max(1, Math.round(bitmap.width * ratio)); source.height = Math.max(1, Math.round(bitmap.height * ratio))
    const sourceContext = source.getContext('2d')!; sourceContext.drawImage(bitmap, 0, 0, source.width, source.height)
    const input = sourceContext.getImageData(0, 0, source.width, source.height).data
    const aspect = (extent[2]! - extent[0]!) / (extent[3]! - extent[1]!)
    if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('配准范围无效。')
    const longest = Math.min(2048, Math.max(bitmap.width, bitmap.height))
    output.width = Math.max(1, Math.round(aspect >= 1 ? longest : longest * aspect)); output.height = Math.max(1, Math.round(aspect >= 1 ? longest / aspect : longest))
    const context = output.getContext('2d')!, pixels = context.createImageData(output.width, output.height)
    for (let y = 0; y < output.height; y++) {
      for (let x = 0; x < output.width; x++) {
        const p = transform.inverse(extent[0]! + (x + .5) / output.width * (extent[2]! - extent[0]!), extent[3]! - (y + .5) / output.height * (extent[3]! - extent[1]!))
        const sx = Math.floor(p[0]! * source.width / bitmap.width), sy = Math.floor(p[1]! * source.height / bitmap.height)
        if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue
        pixels.data.set(input.subarray((sy * source.width + sx) * 4, (sy * source.width + sx) * 4 + 4), (y * output.width + x) * 4)
      }
      if (y % 64 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
    context.putImageData(pixels, 0, 0)
    const buffer = writeArrayBuffer(new Uint8Array(pixels.data), { width: output.width, height: output.height, BitsPerSample: [8, 8, 8, 8], SamplesPerPixel: 4, ExtraSamples: [2], PhotometricInterpretation: 2, ModelPixelScale: [(extent[2]! - extent[0]!) / output.width, (extent[3]! - extent[1]!) / output.height, 0], ModelTiepoint: [0, 0, 0, extent[0]!, extent[3]!, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: 3857 })
    return { file: new File([buffer], file.name.replace(/\.[^.]+$/, '') + '_配准.tif', { type: 'image/tiff' }), imagery: { previewDataUrl: output.toDataURL('image/png'), bounds, epsg: 3857, width: output.width, height: output.height } as ReviewImagery, rmse: transform.rmse }
  } finally { bitmap.close() }
}
