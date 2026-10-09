import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as geotiff from 'geotiff'
const require = createRequire(import.meta.url)
const source = ts.transpileModule(readFileSync('src/utils/review-geotiff.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', source)(id => id === 'geotiff' ? geotiff : require(id), module, module.exports)
const { readReviewGeoTiff, reviewBoundary, reviewShapefile, reviewImageryFileError } = module.exports
let rendered
globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: pixels => { rendered = pixels.data } }), toDataURL: () => 'data:image/webp;base64,fixture' }) }
function fixture(extra = {}) {
  return new File([geotiff.writeArrayBuffer(Array.from({ length: 12 }, (_, i) => i % 3 === 0 ? 255 : 0), { width: 2, height: 2, BitsPerSample: [8, 8, 8], PhotometricInterpretation: 2, ModelPixelScale: [.001, .001, 0], ModelTiepoint: [0, 0, 0, 119.84, 32.49, 0], GTModelTypeGeoKey: 2, GTRasterTypeGeoKey: 1, GeographicTypeGeoKey: 4326, ...extra })], 'review.tif')
}
const imagery = await readReviewGeoTiff(fixture())
assert.equal(imagery.epsg, 4326)
assert.deepEqual(imagery.bounds, [119.84, 32.488, 119.842, 32.49])
assert.equal(imagery.width, 2)
assert.deepEqual([...rendered], Array.from({ length: 16 }, (_, i) => i % 4 === 0 || i % 4 === 3 ? 255 : 0), 'GeoTIFF pixels are preserved through reprojection')
const projected = await readReviewGeoTiff(fixture({ ProjectedCSTypeGeoKey: 3857, GTModelTypeGeoKey: 1, ModelPixelScale: [10, 10, 0], ModelTiepoint: [0, 0, 0, 13340671, 3828025, 0] }))
assert.ok(projected.bounds[0] > 119 && projected.bounds[0] < 120)
assert.ok(projected.bounds[1] > 32 && projected.bounds[1] < 33)
await assert.rejects(readReviewGeoTiff(fixture({ GeographicTypeGeoKey: 32767 })), /EPSG/)
await assert.rejects(readReviewGeoTiff(fixture({ ModelTransformation: [1, 1, 0, 119, 1, -1, 0, 32, 0, 0, 1, 0, 0, 0, 0, 1] })), /旋转/)
assert.equal(reviewImageryFileError([new File(['x'], 'screen.png')]), '', 'PNG 进入地理配准流程')
assert.equal(reviewImageryFileError([new File(['x'], 'screen.jpg')]), '', 'JPG 进入地理配准流程')
assert.match(reviewImageryFileError([new File(['x'], 'screen.svg')]), /JPG \/ PNG/)
assert.match(reviewImageryFileError([fixture(), fixture()]), /一幅/)
const points = [[119.8401, 32.4881], [119.8419, 32.4881], [119.8419, 32.4899], [119.8401, 32.4899]]
const boundary = reviewBoundary(points, imagery.bounds)
assert.deepEqual(boundary.features[0].geometry.coordinates[0], [...points, points[0]])
assert.throws(() => reviewBoundary(points.slice(0, 2), imagery.bounds), /三个/)
assert.throws(() => reviewBoundary([[0, 0], ...points], imagery.bounds), /范围/)
assert.throws(() => reviewBoundary([points[0], points[2], points[1], points[3]], imagery.bounds), /交叉/)
const shape = await reviewShapefile(boundary, 'test')
const archive = await require('jszip').loadAsync(await shape.arrayBuffer())
for (const extension of ['shp', 'shx', 'dbf', 'prj']) assert.ok(Object.keys(archive.files).some(name => name.endsWith('.' + extension)), extension)
const shpName = Object.keys(archive.files).find(name => name.endsWith('.shp'))
const bytes = await archive.file(shpName).async('uint8array')
const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
assert.equal(header.getInt32(0), 9994, 'Valid shapefile magic number')
assert.equal(header.getInt32(32, true), 5, 'Polygon shapefile')
assert.equal(header.getFloat64(36, true), points[0][0], 'SHP retains geographic longitude')
console.log('PASS: real GeoTIFF decoding/reprojection, invalid inputs, boundary validation and SHP/SHX/DBF/PRJ export')
