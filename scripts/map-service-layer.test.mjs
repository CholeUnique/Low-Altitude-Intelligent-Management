import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

class Bounds {
  extend(pair) { this.pair = pair; return this }
  isValid() { return Boolean(this.pair) }
}
const leaflet = { TileLayer: class {}, LayerGroup: class {}, Layer: class {}, GridLayer: class {}, latLngBounds: () => new Bounds() }
const fields = [
  { name:'OBJECTID', type:'esriFieldTypeOID' },
  ...Array.from({length:12}, (_,i) => ({name:`FIELD_${i}`,type:'esriFieldTypeString'})),
  { name:'COUNT', type:'esriFieldTypeInteger' },
  { name:'Shape_Length', type:'esriFieldTypeDouble' },
  { name:'DLMC', type:'esriFieldTypeString' },
  { name:'项目类', type:'esriFieldTypeString' },
]
globalThis.window = { setTimeout, clearTimeout }
globalThis.document = {
  createElement: () => ({ remove() {} }),
  head: { appendChild(script) {
    const url = new URL(script.src)
    const gbz=url.pathname.endsWith('/1')
    queueMicrotask(() => window[url.searchParams.get('callback')]({name:gbz?'高标准农田GBZ':'地块',fields:gbz?fields.filter(f=>f.name!=='DLMC'):fields,geometryType:'esriGeometryPoint'}))
  } },
}
let numericFallback = false
let clicked = false
const requests = []
globalThis.fetch = async (url, options) => {
  assert.equal(options.method, 'POST')
  const p = options.body
  requests.push(new URLSearchParams(p))
  assert.equal(p.has('resultRecordCount'), false, 'Legacy servers reject pagination parameters')
  let data
  if (numericFallback && p.get('where').includes('CAST')) data={error:{message:'Unsupported CAST'}}
  else if (p.get('returnIdsOnly') === 'true') data={objectIds: Array.from({length:clicked?2:401},(_,i)=>i+1)}
  else if(p.get('objectIds').split(',').length>100)data={exceededTransferLimit:true,features:[]}
  else data={fieldAliases:{FIELD_11:'最后一个文本字段'},features:p.get('objectIds').split(',').map(id=>({
    attributes:{OBJECTID:Number(id),FIELD_11:'needle',COUNT:904+Number(id),Shape_Length:0,DLMC:'水浇地','项目类':'地方自筹自建项目',GCMC:'工程名不能代替地块类型'},
    geometry:{x:119.8,y:32.4},
  }))}
  return {ok:true,json:async()=>data}
}
const source = ts.transpileModule(readFileSync('src/utils/map-service-layer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const module = {exports:{}}
new Function('require','module','exports',source)(id=>{
  if(id==='leaflet')return {default:leaflet}
  if(id==='proj4')return {default:{defs(){}}}
  throw Error(`Unexpected dependency ${id}`)
},module,module.exports)
const api=module.exports
const boundaryPaths = []
leaflet.latLng = (lat, lng) => ({ lat, lng })
leaflet.layerGroup = () => ({ paths: [] })
leaflet.polygon = (coordinates, style) => {
  const path = { coordinates, style, addTo(group) { group.paths.push(this); return this }, setStyle(next) { Object.assign(this.style, next) } }
  boundaryPaths.push(path)
  return path
}
const regularFetch = globalThis.fetch
globalThis.fetch = async (_url, options) => ({ ok: true, json: async () => options.body.get('returnIdsOnly') === 'true'
  ? { objectIds: [1] }
  : { features: [{ geometry: { rings: [[[119.8,32.4],[119.9,32.4],[119.9,32.5],[119.8,32.4]]] } }] } })
const boundary = await api.createAdministrativeBoundaryLayer({ serviceUrl: 'https://example.test/MapServer', arcGisLayerId: 2 })
assert(boundary.bounds.isValid())
assert.equal(boundaryPaths.length, 2, 'Administrative boundary uses a halo and a crisp foreground stroke')
assert.equal(boundaryPaths[1].style.color, '#9AEEFE')
assert.equal(boundaryPaths[1].style.fillOpacity, .1)
assert.deepEqual(boundaryPaths[1].coordinates[0][0], { lat: 32.4, lng: 119.8 }, 'ArcGIS WGS84 geometry keeps latitude/longitude order')
boundary.setColor('#ff0000'); boundary.setFillOpacity(.15)
assert.equal(boundaryPaths[1].style.fillColor, '#ff0000')
assert.equal(boundaryPaths[1].style.fillOpacity, .15)
globalThis.fetch = regularFetch
const service={id:'test',name:'测试图层',serviceUrl:'https://example.test/MapServer',arcGisLayerId:0,arcGisGeometryType:'esriGeometryPoint'}
const matches=await api.searchVectorLayerText(service,'needle')
assert.equal(matches.length,401,'All matching records survive transfer-limit batching')
assert(requests[0].get('where').includes('FIELD_11'),'Fields after the eighth field remain searchable')
assert(matches[0].rows.some(row=>row.label==='Shape_Length'&&row.value==='0'),'All backend attributes, including zero lengths, remain visible')
numericFallback=true
const numeric=await api.searchVectorLayerText(service,'905')
assert.equal(numeric.length,1,'Numeric search remains available when CAST is unsupported')
assert(requests.some(p=>p.get('where')==='1=1'),'Unsupported expressions use complete ID-batched data')
clicked=true;numericFallback=false
const identified=await api.identifyVectorFeatures(service,{west:119,south:32,east:120,north:33})
assert.equal(identified.length,2,'Overlapping features remain selectable')
assert.equal(identified[0].typeValue,'水浇地','Hover displays land type rather than engineering names')
const gbz=await api.identifyVectorFeatures({...service,arcGisLayerId:1},{west:119,south:32,east:120,north:33})
assert.equal(gbz[0].category.field,'项目类','GBZ without a land-use field exposes its genuine project classification')
assert.equal(gbz[0].typeLabel,'项目类型')
assert.equal(new Set(Array.from({length:60},(_,i)=>api.vectorLayerColor(`layer-${i}`))).size,60,'New layers do not cycle through twelve repeated colors')
const shades=api.categoryShadeColors('#ff0000',5)
assert.equal(new Set(shades).size,5)
console.log('map-service-layer: complete fields, legacy queries, numeric fallback, overlap and colors passed')
