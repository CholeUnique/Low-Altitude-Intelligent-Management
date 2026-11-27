import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import ts from 'typescript'
import proj4 from 'proj4'
import * as shp from 'shpjs'
const require=createRequire(import.meta.url),write=require('@mapbox/shp-write/src/write.js')
const load=(path,deps={})=>{const module={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{assert(name in deps,`Unexpected dependency ${name}`);return deps[name]},module,module.exports);return module.exports}
const normalize=load('src/utils/land-shp-coordinate.ts',{proj4})
const upload=load('src/utils/topic-upload.ts',{proj4,shpjs:shp})
const outer=[[119.83,32.48],[119.83,32.49],[119.84,32.49],[119.84,32.48],[119.83,32.48]],hole=[[119.832,32.482],[119.838,32.482],[119.838,32.488],[119.832,32.488],[119.832,32.482]]
const second=[[119.85,32.48],[119.85,32.49],[119.86,32.49],[119.86,32.48],[119.85,32.48]]
const fixture=await new Promise((resolve,reject)=>write([{NAME:'Original',CODE:'321202100207000146'},{NAME:'Second',CODE:'other'}],'POLYGON',[[outer,hole],[second]],(e,f)=>e?reject(e):resolve(f)))
const payload={shp:fixture.shp.buffer,dbf:fixture.dbf.buffer,prj:fixture.prj,crs:'prj',encoding:'auto'}
const originalShape=Buffer.from(payload.shp).toString('base64'),originalDbf=Buffer.from(payload.dbf).toString('base64')
const projected=normalize.projectedLandShp(payload)
assert.equal(projected.featureCount,2)
const parsed=upload.parseTopicShapefile({...payload,shp:projected.shp,prj:projected.prj})
assert.equal(parsed.data.features.length,2);assert.equal(parsed.data.features[0].geometry.coordinates.length,2,'Retain holes')
assert.equal(parsed.data.features[0].properties.CODE,'321202100207000146','Retain long identifiers in original DBF bytes')
assert.equal(Buffer.from(payload.shp).toString('base64'),originalShape,'Never mutate the selected source file')
assert.equal(Buffer.from(payload.dbf).toString('base64'),originalDbf)
parsed.data.features[0].geometry.coordinates[0].forEach((point,i)=>{assert(Math.abs(point[0]-outer[i][0])<1e-7);assert(Math.abs(point[1]-outer[i][1])<1e-7)})
const shx=new DataView(projected.shx),shape=new DataView(projected.shp)
assert.equal(shx.getInt32(24)*2,projected.shx.byteLength)
for(let i=0;i<2;i++){const pos=shx.getInt32(100+i*8)*2;assert.equal(shape.getInt32(pos+4),shx.getInt32(104+i*8))}
const legacyFailure=proj4('EPSG:4549','EPSG:4326',[119.839438037,32.482674977])
assert(Math.abs(legacyFailure[0]-115.514121132)<1e-8&&Math.abs(legacyFailure[1]-.00029285742)<1e-10,'Reproduce the actual backend degree-as-metres failure')
const raw=new DataView(projected.shp),first=100+8+44+4*raw.getInt32(100+8+36,true)
const throughLegacyServer=proj4('EPSG:4549','EPSG:4326',[raw.getFloat64(first,true),raw.getFloat64(first+8,true)])
assert(Math.abs(throughLegacyServer[0]-outer[0][0])<1e-7&&Math.abs(throughLegacyServer[1]-outer[0][1])<1e-7,'Normalized files work with both the current server projection and future PRJ-aware reading')
console.log('PASS: actual degree/metre repro, CGCS2000 upload normalization, matching PRJ/SHX, polygon holes/records, WGS84 roundtrip and unchanged source DBF/geometry')
