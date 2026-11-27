import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const load=(file,deps={})=>{const module={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>deps[id],module,module.exports);return module.exports}
const location=load('src/utils/geometry-location.ts')
const {geometryLocation}=location
assert.equal(geometryLocation({type:'FeatureCollection',features:[]}),undefined)
assert.equal(geometryLocation({type:'Point',coordinates:[Infinity,32]}),undefined)
assert.equal(geometryLocation({type:'Point',coordinates:[190,32]}),undefined)
assert.deepEqual(geometryLocation({type:'Feature',geometry:{type:'Point',coordinates:[119.9,32.5,20]}}),{west:119.9,east:119.9,south:32.5,north:32.5,lng:119.9,lat:32.5})
assert.deepEqual(geometryLocation({type:'GeometryCollection',geometries:[{type:'LineString',coordinates:[[119,32],[120,33]]},{type:'Point',coordinates:[118,34]}]}),{west:118,east:120,south:32,north:34,lng:119,lat:33})
const {townshipLabel,townshipContains,administrativePolygonLabels}=load('src/utils/township-labels.ts',{'./geometry-location':location})
const {pointInLandGeometry}=load('src/utils/land-supervision.ts',{'@/types/land-supervision':load('src/types/land-supervision.ts')})
const hole={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[3,3],[7,3],[7,7],[3,7],[3,3]]]}
const concave={type:'Polygon',coordinates:[[[0,0],[10,0],[10,2],[2,2],[2,10],[0,10],[0,0]]]}
const multipart={type:'MultiPolygon',coordinates:[hole.coordinates,[[[20,20],[21,20],[21,21],[20,21],[20,20]]]]}
for(const geometry of [hole,concave,multipart]){const p=townshipLabel('测试街道',geometry);assert(p);assert(pointInLandGeometry([p.lng,p.lat],geometry),'Label must lie inside a real polygon, not a hole or the space between islands')}
assert(townshipContains(1,1,hole));assert(!townshipContains(5,5,hole));assert(townshipContains(20.5,20.5,multipart));assert(!townshipContains(15,15,multipart))
const hailing=JSON.parse(readFileSync('src/assets/geo/hailing-township-labels.json','utf8'))
assert.equal(new Set(hailing.labels.map(row=>row.name)).size,hailing.labels.length,'One base label per township')
for(const label of hailing.labels){const region=hailing.regions.find(row=>row.name===label.name);assert(region);assert(townshipContains(label.lng,label.lat,region.geometry),`${label.name} must be labelled inside its real boundary`)}
assert.equal(townshipLabel('',hole),undefined)
assert.equal(townshipLabel('测试',{type:'Point',coordinates:[1,1]}),undefined)
console.log('PASS: WGS84 point/line/multipart bounds, missing/invalid geometry, interior township labels with holes and disconnected polygons')

const separated=administrativePolygonLabels('同一街道',multipart)
assert.equal(separated.length,2,'Both disconnected parts need their own name')
assert(separated.every(p=>pointInLandGeometry([p.lng,p.lat],multipart)))
assert(separated.some(p=>p.lng>20&&p.lat>20),'The smaller enclave must not lose its label')
assert.equal(administrativePolygonLabels('带洞街道',hole).length,1,'Holes must not receive labels')
const rectangle={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}
const centered=administrativePolygonLabels('居中',rectangle)[0]
assert(Math.abs(centered.lng-5)<1e-6&&Math.abs(centered.lat-5)<1e-6,'Prefer the actual polygon interior center, not the first scan line')
const labelRules=load('src/utils/topic-administrative-labels.ts',{'./township-labels':{administrativePolygonLabels}})
const source={visible:true,vector:true,administrative:true,features:[{name:'同一街道',geometry:multipart}]}
assert.equal(labelRules.topicAdministrativeLabels([source]).length,2)
for(const override of [{visible:false},{vector:false},{administrative:false}])assert.equal(labelRules.topicAdministrativeLabels([{...source,...override}]).length,0,'Hidden layers, imagery, and business polygons never create administrative names')
assert.equal(labelRules.topicAdministrativeLabels([{...source,features:[{name:'点',geometry:{type:'Point',coordinates:[1,1]}}]}]).length,0)
console.log('PASS: visible administrative vectors only, centered interior anchors, all enclaves labelled and holes excluded')

const box=(west,south,east,north)=>({type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]})
const projected=(scale=1,offset=0)=>(lng,lat)=>({x:lng*scale+offset,y:lat*scale})
const crowded=[...administrativePolygonLabels('大区域',box(0,0,10,10)),...administrativePolygonLabels('小区域',box(5,5,7,7))]
const compact=labelRules.layoutAdministrativeLabels(crowded,projected(20),{width:2000,height:2000})
assert.deepEqual(compact.map(row=>row.name),['大区域'],'At small scales, larger polygons win overlapping labels')
const detailed=labelRules.layoutAdministrativeLabels(crowded,projected(100),{width:2000,height:2000})
assert.deepEqual(detailed.map(row=>row.name),['大区域','小区域'],'Zooming in restores smaller-region names when there is room')
const tiny=administrativePolygonLabels('微小飞地',box(12,2,12.1,2.1))
assert.equal(labelRules.layoutAdministrativeLabels(tiny,projected(100),{width:2000,height:2000}).length,0,'Small screen footprints hide their names even without a collision')
assert.equal(labelRules.layoutAdministrativeLabels(tiny,projected(500),{width:10000,height:10000}).length,1,'An enclave remains available when zoomed in')
assert.equal(labelRules.layoutAdministrativeLabels(crowded,projected(100,10000),{width:2000,height:2000}).length,0,'Panning away removes offscreen names')
const thinDonut={type:'Polygon',coordinates:[box(0,0,10,10).coordinates[0],box(.1,.1,9.9,9.9).coordinates[0]]}
assert.equal(labelRules.layoutAdministrativeLabels(administrativePolygonLabels('空心区域',thinDonut),projected(10),{width:2000,height:2000}).length,0,'Screen area excludes holes rather than relying on a large bounding box')
assert.equal(crowded.length,2,'Layout changes must not discard the saved anchors or geometries')
assert.deepEqual(labelRules.layoutAdministrativeLabels(crowded,projected(100),{width:2000,height:2000}),detailed,'Repeated zoom/pan cycles produce a stable layout')
console.log('PASS: scale-sensitive area thresholds, large-first collision avoidance, enclave recovery, viewport culling, hole area and repeatable layout')
