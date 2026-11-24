import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
function load(file,deps={}){
 const module={exports:{}}
 new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports,id=>{assert(id in deps,`Unexpected import ${id}`);return deps[id]})
 return module.exports
}
const styles=load('src/utils/land-survey-c5.ts'),topic=load('src/utils/geographic-topic.ts')
globalThis.document={createElement:()=>({getContext:()=>null})}
const renderer=load('src/utils/topic-renderer.ts',{'./land-survey-c5':styles})
const calls=[]
function handle(){return {color:'#112233',categoryFilter:{fieldName:'DLMC',values:[{value:'水田',label:'水田',color:'#112233'}]},setRenderer(value){this.renderer=value},setFillOpacity(value){this.opacity=value}}}
const {createTopicStyledServiceLayer}=load('src/utils/topic-map-service.ts',{
 './geographic-topic':topic,'./land-survey-c5':styles,'./topic-renderer':renderer,
 './map-service-layer':{
  getMapServiceLayerMetadata:async service=>({fields:(service.fields||[]).map(name=>({name}))}),
  createMapServiceLayer:async(...args)=>{calls.push(args);return handle()},
  createAdministrativeBoundaryLayer:async service=>{calls.push(['boundary',service]);return handle()},
 },
})
const service={id:'101::0',arcGisGeometryType:'esriGeometryPolygon',name:'永久基本农田_海陵区',fields:['DLBM','DLMC','YJJBNTTBBH']}
const result=await createTopicStyledServiceLayer(service,{fallbackRequestBounds:'bounds'})
const expected=renderer.createTopicRenderer('DLMC',[{value:'水田',name:'水田',style:styles.resolveC5Style('','水田')}],service.arcGisGeometryType,'#112233','filled')
assert.deepEqual(result.renderer,expected,'Homepage land-use fills, outlines and symbols match the topic renderer')
assert.equal(result.categoryFilter.values[0].color,'rgb(248,208,114)','Category swatch uses the actual C5 renderer color')
assert.equal(result.opacity,1);assert.deepEqual(calls[0],[service,undefined,{fallbackRequestBounds:'bounds'}])
const boundary=await createTopicStyledServiceLayer({...service,name:'村级行政区划',fields:['PAC','NAME']})
assert.equal(calls.at(-1)[0],'boundary');assert.equal(boundary.opacity,0,'Administrative boundaries stay outlined')
const imagery=await createTopicStyledServiceLayer({id:'image',name:'影像'},{});assert(!imagery.renderer,'Imagery is never recolored')

const source=readFileSync('src/components/DashboardMap.vue','utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
const ast=ts.createSourceFile('DashboardMap.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name.text==='renderHailingBoundary').getText(ast)
const code=ts.transpileModule(fn,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const districts=JSON.parse(readFileSync('src/assets/geo/hailing-boundary.json','utf8'))
const district=districts.features.find(feature=>String(feature.properties.adcode)==='321202');assert(district)
assert.equal(String(district.properties.adcode),'321202');assert(['Polygon','MultiPolygon'].includes(district.geometry.type))
assert.match(source,/const HAILING_DISTRICT = \(hailingBoundary as/,'首页直接使用提供的 CRS84 边界')
for(const organizationId of ['agriculture-rural','other']){
 const paths=[],groups=[],map={},props={focusLayerId:'scene'}
 const L={layerGroup:()=>{const group={remove(){},addTo(target){assert.equal(target,map)}};groups.push(group);return group},geoJSON:(data,options)=>{assert.equal(data,district);paths.push(options);return {addTo:()=>{}}}}
 new Function('L','map','props','HAILING_DISTRICT','user',`let hailingBoundaryGroup;const jiulongBoundaryVisible={value:false};${code};renderHailingBoundary()`)(L,map,props,district,{organizationId})
 assert.equal(groups.length,1,`${organizationId} sees Hailing on initial homepage render`)
 assert.equal(paths.length,2);assert.equal(paths[1].style.color,'#74dfff');assert.equal(paths[1].style.fill,false)
}
console.log('Homepage topic styling: C5 symbols, matched legend colors, imagery preservation and automatic Hailing boundary passed')
delete globalThis.document
