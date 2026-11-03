import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import ts from 'typescript'
import * as shp from 'shpjs'
import proj4 from 'proj4'
import {arcgisToGeoJSON} from '@terraformer/arcgis'
const require=createRequire(import.meta.url),write=require('@mapbox/shp-write/src/write.js')
function load(file,deps={}){const module={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText)(module,module.exports,id=>{assert(id in deps,`Unexpected import ${id}`);return deps[id]});return module.exports}
const upload=load('src/utils/topic-upload.ts',{shpjs:shp,proj4})
const overlay=load('src/utils/spatial-overlay-result.ts',{'@/api/client':{},'@/api/spatial-analysis':{}})
const input=load('src/utils/spatial-geometry-input.ts',{'@terraformer/arcgis':{arcgisToGeoJSON},'./map-service-layer':{},'./topic-upload':upload})
const result=load('src/utils/spatial-geometry-result.ts',{'./topic-upload':upload,'./spatial-overlay-result':overlay})
const ring=[[500000,3600000],[500000,3600100],[500200,3600100],[500200,3600000],[500000,3600000]]
const fixture=await new Promise((resolve,reject)=>write([{NAME:'planning',ID:'321202100207000146'}],'POLYGON',[[ring]],(error,files)=>error?reject(error):resolve(files)))
const payload={shp:fixture.shp.buffer,dbf:fixture.dbf.buffer,crs:'EPSG:4549',encoding:'auto'}
const parsed=upload.parseTopicShapefile(payload)
assert(parsed.analyzable);assert.equal(parsed.data.features[0].properties.NAME,'planning');assert.equal(parsed.fields[0].name,'NAME')
assert(Math.abs(parsed.data.features[0].geometry.coordinates[0][0][0]-120)<.00001,'Project SHP into WGS84, not screen coordinates')
assert.equal(parsed.data.features[0].properties.ID,'321202100207000146')
const geographic=await new Promise((resolve,reject)=>write([{NAME:'hole'}],'POLYGON',[[[[120,32],[120,33],[121,33],[121,32],[120,32]],[[120.2,32.2],[120.8,32.2],[120.8,32.8],[120.2,32.8],[120.2,32.2]]]],(e,f)=>e?reject(e):resolve(f)))
const withHole=upload.parseTopicShapefile({shp:geographic.shp.buffer,dbf:geographic.dbf.buffer,prj:geographic.prj,crs:'prj',encoding:'auto'})
assert.equal(withHole.data.features[0].geometry.type,'Polygon');assert.equal(withHole.data.features[0].geometry.coordinates.length,2,'Preserve inner rings when parsing PRJ-projected SHP')
const converted=arcgisToGeoJSON({geometry:{rings:[[[120,32],[120,33],[121,33],[121,32],[120,32]],[[120.2,32.2],[120.8,32.2],[120.8,32.8],[120.2,32.8],[120.2,32.2]]]},attributes:{OID:1}},'OID')
assert.equal(converted.geometry.type,'Polygon');assert.equal(converted.geometry.coordinates.length,2,'ArcGIS format conversion preserves holes')
assert.throws(()=>upload.parseTopicShapefile({...payload,crs:'prj'}),/缺少 .prj/)
assert.throws(()=>upload.parseTopicShapefile({...payload,crs:'broken'}),/无法解析/)
assert.throws(()=>upload.parseTopicShapefile({...payload,shp:payload.shp.slice(0,-4)}),/截断/)
assert.throws(()=>upload.parseTopicShapefile({...payload,dbf:payload.dbf.slice(0,-8)}),/截断/)
const badCount=payload.dbf.slice(0);new DataView(badCount).setUint32(4,0,true)
assert.throws(()=>upload.parseTopicShapefile({...payload,dbf:badCount}),/记录数/)
// DBF fixture with a numeric identifier beyond JS safe precision and GBK Chinese text.
const dbf=new ArrayBuffer(97+25+1),view=new DataView(dbf),bytes=new Uint8Array(dbf)
view.setUint8(0,3);view.setUint32(4,1,true);view.setUint16(8,97,true);view.setUint16(10,25,true)
bytes.set(Buffer.from('ID'),32);bytes[43]=78;bytes[48]=20
bytes.set(Buffer.from('NAME'),64);bytes[75]=67;bytes[80]=4;bytes[96]=13;bytes[97]=32
bytes.set(Buffer.from('  321202100207000146'),98);bytes.set([0xcb,0xae,0xcc,0xef],118);bytes[122]=26
const chinese=upload.parseTopicShapefile({...payload,dbf,encoding:'auto'})
assert.equal(chinese.data.features[0].properties.NAME,'水田');assert.equal(chinese.encoding,'gb18030');assert.equal(chinese.data.features[0].properties.ID,'321202100207000146','Numeric long identifiers retained exactly')
assert.equal(upload.normalizeDbfEncoding('CP936'),'gb18030');assert.equal(upload.normalizeDbfEncoding('65001'),'utf-8')
assert.throws(()=>upload.normalizeDbfEncoding('not-an-encoding'),/无法识别/)
const file=(name,data)=>({name,size:data.byteLength??data.length,arrayBuffer:async()=>data,text:async()=>data})
await assert.rejects(upload.readShpPayload([file('one.shp',payload.shp),file('two.dbf',payload.dbf)],'EPSG:4549','auto'),/同名/)
await assert.rejects(upload.readShpPayload([file('one.shp',payload.shp)],'EPSG:4549','auto'),/.shp 与 .dbf/)
await assert.rejects(upload.readShpPayload([file('one.shp',payload.shp),file('one.SHP',payload.shp)],'EPSG:4549','auto'),/重复/)
assert.throws(()=>upload.validateUploadName('  '),/名称/)
assert.throws(()=>upload.assertTopicGeometry({type:'FeatureCollection',features:Array(5001).fill(parsed.data.features[0])}),/5000/)
assert.throws(()=>upload.assertTopicGeometry({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[500000,3600000]},properties:{}}]}),/经纬度/)
assert.equal(input.spatialAttributeWhere([{field:'NAME',op:'EQ',values:["O'Brien"]}],[{name:'NAME',type:'esriFieldTypeString'}]),`("NAME" = 'O''Brien')`)
assert.equal(input.spatialAttributeWhere([{field:'ID',op:'EQ',values:['321202100207000146']}],[{name:'ID',type:'esriFieldTypeBigInteger'}]),'("ID" = 321202100207000146)')
assert.throws(()=>input.spatialAttributeWhere([{field:'MISSING',op:'EQ',values:['x']}],[{name:'NAME'}]),/无效/)
assert.equal(input.filterUploadedGeometry(chinese.data,[{field:'NAME',op:'EQ',values:['水田']}]).features.length,1)
assert.throws(()=>input.filterUploadedGeometry(chinese.data,[{field:'NAME',op:'EQ',values:['旱地']}]),/没有可分析/)
const sent=input.geometryRequestInputs(parsed.data,chinese.data)
assert.deepEqual(sent.geometryA.features[0].properties,{});assert.equal(sent.geometryA.features[0].geometry,parsed.data.features[0].geometry)
assert.equal(parsed.data.features[0].properties.NAME,'planning','Preparation never destroys source attributes')
const geom={type:'Polygon',coordinates:[[[120,32],[120.001,32],[120.001,32.001],[120,32]]]}
const feature=(diffType,areaSqm)=>({type:'Feature',geometry:geom,properties:{diffType,areaSqm}})
const group=(kind,area)=>({areaSqm:area,spotCount:area?1:0,featureCollection:{type:'FeatureCollection',features:area?[feature(kind,area)]:[]}})
const response={areaA:20000,areaB:10000,minAreaSqm:4,crsUsed:'CGCS2000_3DEG_CM_120E',both:group('OVERLAP',10000),aOnly:group('A_ONLY',10000),bOnly:group('B_ONLY',0)}
const sources={sourceA:{serviceId:'upload:one',serviceName:'本机上传',layerId:0,layerName:'规划范围'},sourceB:{serviceId:'9',serviceName:'已发布',layerId:1,layerName:'永久基本农田'}}
const coverage=result.geometryAnalysisResult(response,'coverage',sources,{a:1,b:1})
assert.equal(coverage.summary.coverageRate,.5);assert.equal(coverage.summary.outsideRate,.5);assert.equal(coverage.summary.unreturnedArea,0)
assert.equal(coverage.data.features.length,2);assert.deepEqual(coverage.data.features.map(f=>f.properties.analysisCoverage),['INSIDE','OUTSIDE']);assert.equal(coverage.data.features[0].geometry,geom,'Result geometries come from backend unchanged')
assert.equal(coverage.data.features[0].properties.analysisTargetLayerName,'永久基本农田');assert(!('resultId' in coverage.summary),'Do not fabricate backend persistence')
const difference=result.geometryAnalysisResult(response,'difference',sources,{a:1,b:1})
assert.equal(difference.data.features.length,1);assert.equal(difference.data.features[0].properties.analysisSourceLayerName,'规划范围')
assert.equal(result.geometryAnalysisResult({...response,aOnly:group('A_ONLY',9996)},'coverage',sources,{a:1,b:1}).summary.unreturnedArea,4)
assert.throws(()=>result.geometryAnalysisResult({...response,aOnly:group('A_ONLY',11000)},'coverage',sources,{a:1,b:1}),/超过上传总面积/)
assert.throws(()=>result.validateCompareGroup({...response.aOnly,spotCount:2},'A_ONLY'),/数量不完整/)
assert.throws(()=>result.validateCompareGroup({...group('A_ONLY',1),areaSqm:2},'A_ONLY'),/面积不一致/)
assert.throws(()=>result.validateCompareGroup({areaSqm:0,spotCount:1,featureCollection:{type:'FeatureCollection',features:[feature('B_ONLY',0)]}},'B_ONLY'),/零面积/)
assert.throws(()=>result.geometryAnalysisResult({...response,bOnly:undefined},'coverage',sources,{a:1,b:1}),/完整的面积统计/)
console.log('topic uploads and geometry analysis: projection, DBF Chinese/long IDs, component validation, limits, filters, exact backend clipping and coverage accounting passed')
