import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript} from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import {arcgisToGeoJSON} from '@terraformer/arcgis'
const selections=new Set(),highlights=[],queries=[]
const geometry={type:'Polygon',coordinates:[[[119,32],[120,32],[120,33],[119,32]]]}
const feature=(value)=>({type:'Feature',geometry,properties:{DLMC:value,sourceObjectId:1}})
const data={type:'FeatureCollection',features:[feature('水田'),feature('旱地')]}
const map={hasLayer:layer=>selections.has(layer),fitBounds(){this.fits=(this.fits||0)+1}}
function native(){return {options:{},addTo(){selections.add(this);return this},remove(){selections.delete(this);return this}}}
const deps={
 vue:{...vue,watch(){},onMounted(){},onBeforeUnmount(){}},
 leaflet:{geoJSON(collection){highlights.push(collection);return {addTo(){return this},getBounds:()=>({isValid:()=>true})}},circleMarker(){}},
 '@terraformer/arcgis':{arcgisToGeoJSON},
 '@/stores/user':{useUserStore:()=>({currentUser:{id:'account'},activeDeptId:'department'})},
 '@/stores/geographic-topics':{HIGH_STANDARD_TOPIC_ID:'high',FACILITIES_TOPIC_ID:'facility',useGeographicTopicsStore:()=>({setPreference(){}})},
 '@/utils/farmland-analysis':{farmlandDefaults:()=>({a:{serviceId:'101',layerId:0},b:{serviceId:'101',layerId:1},keys:[],initialKeys:[]})},
 '@/utils/topic-layer-catalog':{groupTopicLayers:()=>[],topicStatSources:()=>[]},
 '@/utils/topic-layer-search':{matchesTopicText:()=>true,matchingTopicPropertyRows:()=>[],topicSearchCategories:(_key,_names,cats)=>cats},
 '@/utils/geographic-topic':{categoryWhere:(field,values)=>`${field} IN (${values.map(value=>"'"+value+"'").join(',')})`},
 '@/utils/topic-renderer':{createTopicRenderer:()=>({})},
 '@/utils/region-clip':{regionClipKey:item=>`${item.serviceId}/${item.layerId}`},
 '@/utils/map-service-layer':{setMapHoverSelection(){},queryMapServiceFeatures:async(service,fields,where)=>{queries.push(where);return {features:[{attributes:{DLMC:'水田'},geometry:{rings:geometry.coordinates}}]}}},
}
const {descriptor}=parse(readFileSync('src/views/GeographicTopicsView.vue','utf8'))
const m={exports:{}}
new Function('module','exports','require',ts.transpileModule(compileScript(descriptor,{id:'inspector-view-test'}).content.replace(/import\.meta\.env/g,'({})'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(m,m.exports,id=>deps[id]||{})
const scope=vue.effectScope(),state=scope.run(()=>m.exports.default.setup({topic:{id:'high'}},{expose(){}}))
state.updateResultLayers(['analysis:first'])
assert.deepEqual(state.resultLayerKeys.value,['analysis:first'],'Analysis results activate the separate result column')
const firstOrder=state.detailLayerOrder.value['analysis:first']
state.updateResultLayers(['analysis:first','analysis:second'])
assert.equal(state.detailLayerOrder.value['analysis:first'],firstOrder,'Adding a result preserves the existing ordering')
state.updateResultLayers([])
assert.equal(state.resultLayerKeys.value.length,0,'Removing every result returns to the full-width original column')
state.map=map;state.selectionGroup={clearLayers(){}}
const category=(value,checked)=>({value,name:value,checked,count:1})
function layer(key,role,categories){const handle=native();handle.addTo(map);return {key,role,service:{id:key,name:key,arcGisLayerId:Number(key.split('/')[1]),arcGisGeometryType:'esriGeometryPolygon'},sourceName:'海陵区高标准农田',visible:true,analysisHidden:false,categories,categoryField:'DLMC',mode:role==='boundary'?'boundary':'filled',handle:{layer:handle,color:'#ff0',setRenderer(){},setFillOpacity(){},setCategoryFillOpacity(){},categoryFilter:role==='boundary'?{values:categories.map((c,i)=>({value:c.value,objectIds:[i+1]})),setVisibleValues(){}}:undefined}}}
state.layers.value=[layer('101/0','land',[category('水田',false)]),layer('101/1','permanent',[category('水田',true)]),layer('101/4','boundary',[category('九龙镇',true),category('城西街道',false)]),layer('101/7','boundary',[category('孙金村',false),category('张坝村',false)]),layer('image/root','imagery',[])]
state.layers.value[0].analysisHidden=true
assert.equal(state.farmlandStatSources.value.length,0,'只开永农不能显示高标田统计')
state.selectLegend(state.layers.value[0],'all');assert.equal(state.farmlandStatSources.value.length,1)
let hiddenUploads=[];state.uploadedLayers.value=[{id:'upload-1'}];state.uploadPanel.value={select:keys=>{hiddenUploads=keys}}
state.showOverlayResult([])
assert.equal(state.layers.value[0].analysisHidden,true);assert.equal(state.layers.value[1].analysisHidden,true)
assert.equal(state.layers.value[2].categories[0].checked,true,'无范围参数时保留已选行政边界')
assert.equal(state.layers.value[4].analysisHidden,false,'影像不参与隔离')
assert(state.layers.value.every(item=>item.visible),'地图隐藏不能删除原有图层卡片')
assert.deepEqual(hiddenUploads,['upload-1'])
state.showOverlayResult([],[{serviceId:'101',layerId:7,objectIds:[1]}])
assert(state.layers.value[2].categories.every(c=>!c.checked),'旧乡级边界取消')
assert.equal(state.layers.value[3].categories[0].checked,true,'恢复本次分析所选村界')
assert.equal(state.layers.value[3].mode,'boundary')
state.selectLegend(state.layers.value[0],'all')
await state.locateLegend('101/0','水田')
assert(queries.at(-1).includes("DLMC IN ('水田')"),'图例查询只定位目标分类')
assert.equal(highlights.at(-1).features.length,1);assert(map.fits>0)
state.layers.value[0].categories.push(category('旱地',true))
state.regionClipSources.value=['101/4'];state.regionClipStates.value={'101/0':{status:'SUCCEEDED',data}}
await state.locateLegend('101/0','旱地')
assert.equal(highlights.at(-1).features.length,1);assert.deepEqual(highlights.at(-1).features[0].geometry,geometry,'裁切模式定位真实裁切几何')
state.regionClipDisplays.set('101/0',{update(){},layer:native(),identify:()=>[{serviceId:'101/0',serviceName:'高标田',location:{geometries:[]}}]})
state.regionClipDisplays.set('101/4',{update(){},layer:native(),identify:()=>[{serviceId:'101/4',serviceName:'行政区',location:{geometries:[]}}]})
state.selectLegend(state.layers.value[2],'all')
await state.identifyFeature({latlng:{lng:119.9,lat:32.5}})
assert.equal(state.featureCandidates.value.length,1);assert.equal(state.featureCandidates.value[0].serviceId,'101/0','裁切地块详情保留，同时排除行政区详情')
// Per-row clipping must not silently include every currently visible township.
state.regionClipDisplays.clear();state.regionClipSources.value=[];state.regionClipSelections.value={}
const township=state.layers.value[2],village=state.layers.value[3]
state.selectLegend(township,'all');state.selectLegend(village,'none')
state.clipAdministrative('101/4','九龙镇',true)
assert.deepEqual(state.regionClipRequest.value.regions.map(region=>[region.layerId,region.objectIds]),[[4,[1]]],'只裁切点击的乡镇，不能带入其他显示中的乡镇')
assert.equal(state.regionClipSelectionCount.value,1)
state.clipAdministrative('101/4','城西街道',true)
assert.deepEqual(state.regionClipRequest.value.regions[0].objectIds,[1,2],'支持同级多选')
state.clipAdministrative('101/4','九龙镇',false)
assert.deepEqual(state.regionClipRequest.value.regions[0].objectIds,[2])
assert.equal(township.categories[0].checked,true,'取消裁切保留显示勾选')
state.clipAdministrative('101/7','孙金村',true)
assert.equal(village.categories[0].checked,true,'开启裁切自动打开对应边界')
assert.deepEqual(state.regionClipRequest.value.regions.map(region=>[region.layerId,region.objectIds]),[[4,[2]],[7,[1]]],'乡村级范围独立，允许跨层级多选')
state.setCategoryVisible(township,township.categories[1],false)
assert.deepEqual(state.regionClipRequest.value.regions.map(region=>region.layerId),[7],'隐藏已用于裁切的区划同步移出范围')
state.modeAdministrative('101/7','孙金村','filled')
assert.equal(village.categories[0].mode,'filled');assert.equal(village.categories[1].mode,undefined,'行内样式不影响其他区划')
state.selectLegend(village,'none');assert.equal(state.regionClipSources.value.length,0,'全不选时结束裁切，不提交空范围')
scope.stop()
console.log('Topic inspector view: high-only statistics, latest result isolation, selected administrative boundaries, catalogue retention, legend highlighting and clipped feature details passed')
