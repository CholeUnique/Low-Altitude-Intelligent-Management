import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import ts from 'typescript'
import JSZip from 'jszip'
import {parseShp,parseDbf} from 'shpjs'
const require=createRequire(import.meta.url),module={exports:{}}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/utils/map-drawing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText)(require,module,module.exports)
const {createDrawingFeature,exportDrawingShapefiles,DRAWING_WGS84}=module.exports
const features=[createDrawingFeature('point',[[120,32]],1),createDrawingFeature('point',[[120.01,32.01]],2),createDrawingFeature('line',[[120,32],[120.01,32.01]],3),createDrawingFeature('line',[[120.02,32],[120.03,32.01],[120.04,32]],4),createDrawingFeature('polygon',[[120,32],[120.01,32],[120.01,32.01],[120,32.01]],5)]
assert.throws(()=>createDrawingFeature('line',[[120,32],[120,32]],1),/不同/)
assert.throws(()=>createDrawingFeature('polygon',[[120,32],[120.01,32.01],[120,32.01],[120.01,32]],1),/交叉/)
assert.throws(()=>createDrawingFeature('polygon',[[120,32],[120.01,32],[120.02,32]],1),/有效/)
assert.throws(()=>createDrawingFeature('point',[[NaN,32]],1),/坐标/)
assert.equal(features[4].geometry.coordinates[0].length,5,'A polygon ring is explicitly closed')
const snapshot=JSON.stringify(features),blob=await exportDrawingShapefiles(features,'自定义范围'),zip=await JSZip.loadAsync(await blob.arrayBuffer())
for(const [suffix,expected,type] of [['points',2,1],['lines',2,3],['polygons',1,5]]){
  const name=`自定义范围_${suffix}`
  for(const ext of ['shp','shx','dbf','prj','cpg'])assert(zip.file(`${name}.${ext}`),`${suffix}.${ext} must be present`)
  const shp=await zip.file(`${name}.shp`).async('arraybuffer'),shx=await zip.file(`${name}.shx`).async('arraybuffer'),dbf=await zip.file(`${name}.dbf`).async('arraybuffer')
  assert.equal(new DataView(shp).getInt32(32,true),type)
  assert.equal((shx.byteLength-100)/8,expected,'One SHX index per drawn feature')
  assert.equal(new DataView(dbf).getUint32(4,true),expected,'DBF and SHP records must match, including multiple separate lines')
  assert.equal(parseShp(shp).length,expected);assert.equal(parseDbf(dbf).length,expected)
  assert.equal(await zip.file(`${name}.prj`).async('string'),DRAWING_WGS84)
  assert.equal(await zip.file(`${name}.cpg`).async('string'),'UTF-8')
}
assert.equal(JSON.stringify(features),snapshot,'Export must not mutate the displayed polygon orientation')
await assert.rejects(exportDrawingShapefiles([]),/至少/)
console.log('PASS: point/line/polygon validation and actual SHP/SHX/DBF/PRJ/CPG ZIP round-trip, including multiple lines')
