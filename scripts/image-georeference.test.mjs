import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import proj4 from 'proj4'
import { writeArrayBuffer, fromArrayBuffer } from 'geotiff'
const source = ts.transpileModule(readFileSync('src/utils/image-georeference.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', source)(id => id === 'proj4' ? { default: proj4 } : { writeArrayBuffer }, module, module.exports)
const { fitControlPoints, georeferencePhoto } = module.exports
const width = 64, height = 40
const point = (pixelX, pixelY) => ({ pixelX, pixelY, x: 13000000 + pixelX * 2 + pixelY * .5, y: 3800000 + pixelX * .3 - pixelY * 2 })
const points = [point(0, 0), point(width, 0), point(0, height), point(width, height)]
const fit = fitControlPoints(points, 'EPSG:3857', width, height)
assert.ok(fit.rmse < 1e-6)
const ground = fit.forward(20, 15), original = fit.inverse(...ground)
assert.ok(Math.abs(original[0] - 20) < 1e-6 && Math.abs(original[1] - 15) < 1e-6, '旋转和倾斜变换可逆')
assert.throws(() => fitControlPoints(points.slice(0, 2), 'EPSG:3857', width, height), /三个/)
assert.throws(() => fitControlPoints([point(0, 0), point(1, 1), point(2, 2)], 'EPSG:3857', width, height), /共线/)
assert.throws(() => fitControlPoints(points.map(p => ({ ...p, x: 181, y: 91 })), 'EPSG:4326', width, height), /有效范围/)
const geographic = points.map(p => { const [x, y] = proj4('EPSG:3857', 'EPSG:4326', [p.x, p.y]); return { ...p, x, y } })
assert.ok(fitControlPoints(geographic, 'EPSG:4326', width, height).rmse < 1e-6)
globalThis.createImageBitmap = async () => ({ width, height, close() {} })
globalThis.document = { createElement: () => {
  const canvas = { width: 0, height: 0, toDataURL: () => 'data:image/png;base64,preview' }
  canvas.getContext = () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4).map((_, i) => [180, 100, 20, 255][i % 4]) }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} })
  return canvas
} }
const registered = await georeferencePhoto(new File(['photo'], '现场.jpg', { type: 'image/jpeg' }), points, 'EPSG:3857')
const tiff = await fromArrayBuffer(await registered.file.arrayBuffer()), image = await tiff.getImage()
assert.equal(image.getGeoKeys().ProjectedCSTypeGeoKey, 3857, '输出为真实带投影 GeoTIFF')
assert.equal(image.getSamplesPerPixel(), 4)
assert.equal(image.getWidth(), registered.imagery.width)
assert.equal(image.getHeight(), registered.imagery.height)
assert.deepEqual(image.getBoundingBox().map(Math.round), [13000000, 3799920, 13000148, 3800019])
const rgba = await image.readRGB({ interleave: true, enableAlpha: true })
assert.ok(Array.from(rgba).some((v, i) => i % 4 === 3 && v === 0), '旋转配准后的无数据区域透明')
assert.ok(Array.from(rgba).some((v, i) => i % 4 === 3 && v === 255), '照片像素真实写入 TIFF')
delete globalThis.createImageBitmap; delete globalThis.document
console.log('PASS: affine control points, CRS conversion, inverse warp, real GeoTIFF geokeys/raster/alpha')
