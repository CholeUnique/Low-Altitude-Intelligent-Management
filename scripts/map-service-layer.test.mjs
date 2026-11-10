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
  { name:'COUNT', alias:'一田一码', type:'esriFieldTypeInteger' },
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
  if (options.method !== 'POST') {
    const gbz = new URL(url).pathname.endsWith('/1')
    return { ok: true, text: async () => JSON.stringify({ name: gbz ? '高标准农田GBZ' : '地块', fields: gbz ? fields.filter(f => f.name !== 'DLMC') : fields, geometryType: 'esriGeometryPoint' }) }
  }
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
const source = ts.transpileModule(readFileSync('src/utils/map-service-layer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const module = {exports:{}}
new Function('require','module','exports',source)(id=>{
  if(id==='leaflet')return {default:leaflet}
  if(id==='proj4')return {default:{defs(){}}}
  throw Error(`Unexpected dependency ${id}`)
},module,module.exports)
const api=module.exports
const boundaryPaths = []
leaflet.latLng = (lat, lng) => ({ lat, lng })
leaflet.layerGroup = () => ({ paths: [],hasLayer(path){return this.paths.includes(path)},addLayer(path){this.paths.push(path);return this},removeLayer(path){this.paths=this.paths.filter(item=>item!==path);return this} })
leaflet.polygon = (coordinates, style) => {
  const path = { coordinates, style, addTo(group) { group.paths.push(this); return this }, setStyle(next) { Object.assign(this.style, next) } }
  boundaryPaths.push(path)
  return path
}
const regularFetch = globalThis.fetch
globalThis.fetch = async (_url, options) => options.method!=='POST'
  ? {ok:true,text:async()=>JSON.stringify({fields:[{name:'OBJECTID',type:'esriFieldTypeOID'},{name:'ZLDWMC',alias:'坐落单位名称'},{name:'ZLDWDM',alias:'坐落单位代码'}]})}
  : { ok: true, json: async () => options.body.get('returnIdsOnly') === 'true'
  ? { objectIds: [1,2,3] }
  : { features: [1,2,3].map(id=>({attributes:{OBJECTID:id,ZLDWMC:'孙金村',ZLDWDM:`32120${id===3?2:id}`}, geometry: { rings: [[[119.8,32.4],[119.9,32.4],[119.9,32.5],[119.8,32.4]]] } })) } }
const boundary = await api.createAdministrativeBoundaryLayer({ serviceUrl: 'https://example.test/MapServer', arcGisLayerId: 2 })
assert(boundary.bounds.isValid())
assert.equal(boundaryPaths.length, 6, 'Each administrative feature uses a halo and a crisp foreground stroke')
assert.equal(boundaryPaths[1].style.color, '#74dfff')
assert.equal(boundaryPaths[1].style.fillOpacity, .1)
assert.deepEqual(boundaryPaths[1].coordinates[0][0], { lat: 32.4, lng: 119.8 }, 'ArcGIS WGS84 geometry keeps latitude/longitude order')
boundary.setColor('#ff0000'); boundary.setFillOpacity(.15)
assert.equal(boundaryPaths[1].style.fillColor, '#ff0000')
assert.equal(boundaryPaths[1].style.fillOpacity, .15)
assert.equal(boundary.categoryFilter.values.length,2,'同代码多块几何合为一个选项，同名但不同代码的区划独立选择')
assert.deepEqual(boundary.categoryFilter.values[1].objectIds,[2,3],'区划裁切提交完整的原始要素 ID 集')
assert(boundary.categoryFilter.values[0].label.startsWith('孙金村'),'区划选项显示真实村名')
boundary.categoryFilter.setVisibleValues([])
assert.equal(boundary.layer.paths.length,0,'取消区划时同时移除底部光晕和前景边界')
assert.equal(boundary.definitionExpression(),'1=0')
boundary.categoryFilter.setVisibleValues(['code:321202'])
assert.equal(boundary.layer.paths.length,4,'重新选中区划恢复其全部几何的两层边线')
assert.equal(boundary.definitionExpression(),'OBJECTID IN (2,3)','属性查询同步使用选中区划全部原始要素 ID')
assert(boundary.layer.paths.includes(boundaryPaths[3]),'只显示被选中区划')
assert(!boundary.layer.paths.includes(boundaryPaths[1]),'另一个同名区划保持隐藏')
boundary.categoryFilter.setVisibleValues(['code:321201','code:321202'])
assert.equal(boundary.layer.paths.length,6,'恢复全选')
boundary.setCategoryFillOpacity('code:321201',0)
assert.equal(boundaryPaths[1].style.fillOpacity,0)
const villageBoundary=await api.createAdministrativeBoundaryLayer({name:'村级行政区划',serviceUrl:'https://example.test/MapServer',arcGisLayerId:2})
assert.equal(villageBoundary.color,'#ffcf70','村级金黄与乡级青蓝区分，且原始分类符号使用同一颜色')
globalThis.fetch = regularFetch
const service={id:'test',name:'测试图层',serviceUrl:'https://example.test/MapServer',arcGisLayerId:0,arcGisGeometryType:'esriGeometryPoint'}
const topicRecords = await api.queryMapServiceFeatures(service, ['DLMC'], "DLMC = '水浇地'")
assert.equal(topicRecords.features.length,401,'Topic classification must include records beyond legacy transfer limits')
assert(requests.every(p => p.get('where') === "DLMC = '水浇地'"), 'Every topic query batch retains its scope')
await assert.rejects(api.queryMapServiceFeatures(service, ['MISSING_FIELD']), /字段不存在/, 'Reject unknown field names before constructing a query')
requests.length=0
await api.queryMapServiceFeatures(service,['DLMC'],'1=1',true,{extent:{west:119,south:32,east:120,north:33}})
assert(requests.every(p=>p.get('geometryType')==='esriGeometryEnvelope'&&p.get('spatialRel')==='esriSpatialRelIntersects'),'候选查询的每一批都保留后端空间过滤')
assert(requests.every(p=>JSON.parse(p.get('geometry')).xmin===119&&p.get('inSR')==='4326'))
await assert.rejects(api.queryMapServiceFeatures(service,['OBJECTID'],'1=1',true,{maxFeatures:400}),/超过 400/,'Analysis refuses oversized complete indexes before fetching geometry')
const aborted=new AbortController();aborted.abort()
await assert.rejects(api.queryMapServiceFeatures(service,['OBJECTID'],'1=1',true,{signal:aborted.signal}),error=>error.name==='AbortError','Canceled analysis does not start feature batches')
globalThis.fetch=async(_url,options)=>({ok:true,json:async()=>options.body.get('returnIdsOnly')==='true'?{objectIds:[1,2]}:{features:[{attributes:{OBJECTID:1}}]}})
await assert.rejects(api.queryMapServiceFeatures(service,['OBJECTID'],'1=1',true,{maxFeatures:5000}),/未完整返回/,'Do not analyze a silently truncated feature response')
globalThis.fetch=regularFetch
requests.length = 0
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
assert.equal(identified[0].rows.find(row=>row.name==='COUNT').label,'一田一码','无 fieldAliases 时使用发布元数据中的别名')
assert.equal(identified[0].rows.find(row=>row.name==='FIELD_11').label,'最后一个文本字段','查询响应的别名优先于元数据')
const gbz=await api.identifyVectorFeatures({...service,arcGisLayerId:1},{west:119,south:32,east:120,north:33})
assert.equal(gbz[0].category.field,'项目类','GBZ without a land-use field exposes its genuine project classification')
assert.equal(gbz[0].typeLabel,'项目类型')
requests.length=0
const hovered=await api.queryVectorHover({...service,arcGisGeometryType:'esriGeometryPolygon'},{lng:119.8,lat:32.4},{west:119,south:32,east:120,north:33},"DLMC = '水浇地'",new AbortController().signal)
assert.equal(hovered.features.length,2)
assert(requests.every(p=>p.get('geometryType')==='esriGeometryPoint'),'Polygon hover tests the cursor point rather than a nearby envelope')
assert(requests.every(p=>p.get('where')==="DLMC = '水浇地'"),'Hover preserves category/selection filters')
assert.equal(requests.at(-1).get('returnGeometry'),'true','Hover retrieves actual highlight geometry')
const hoverAbort=new AbortController();hoverAbort.abort();await assert.rejects(api.queryVectorHover(service,{lng:119,lat:32},{west:119,south:32,east:120,north:33},'1=1',hoverAbort.signal),error=>error.name==='AbortError')
assert.equal(new Set(Array.from({length:60},(_,i)=>api.vectorLayerColor(`layer-${i}`))).size,60,'New layers do not cycle through twelve repeated colors')
const shades=api.categoryShadeColors('#ff0000',5)
assert.equal(new Set(shades).size,5)
globalThis.fetch = async () => ({ok:true,json:async()=>({objectIdFieldName:'OBJECTID',objectIds:null})})
assert.deepEqual(await api.identifyVectorFeatures(service,{west:119,south:32,east:120,north:33}),[],'无命中图层的 null 索引是正常空结果')
globalThis.fetch = async () => ({ok:true,json:async()=>({})})
await assert.rejects(api.identifyVectorFeatures(service,{west:119,south:32,east:120,north:33}),/完整要素索引/,'缺失索引仍作为异常处理')
console.log('map-service-layer: complete fields, legacy queries, numeric fallback, overlap and colors passed')
