import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as terraformer from '@terraformer/arcgis'
import {hit} from './region-clip-hit.test.mjs'
const shapes=[],hover=[]
class Path{
  constructor(style={}){this.options=style;this.events={}}
  setStyle(style){Object.assign(this.options,style);return this}
  on(event,handler){this.events[event]=handler;return this}
  getBounds(){return {isValid:()=>true,intersects:()=>true}}
}
let stopped=0
const L={svg:()=>({remove(){}}),circleMarker:(_latlng,style)=>new Path(style),DomEvent:{stopPropagation(event){stopped++;if(event.originalEvent)event.originalEvent._stopped=true}},latLngBounds:()=>({contains:()=>true}),geoJSON(data,options){
  for(const feature of data.features){const path=feature.geometry.type==='Point'?options.pointToLayer(feature,{lat:32.5,lng:119.9}):new Path(options.style(feature));shapes.push(path);options.onEachFeature(feature,path)}
  const members=new Set(shapes)
  return {data,on(){return this},getBounds(){return {}},remove(){},hasLayer:layer=>members.has(layer),addLayer(layer){members.add(layer)},removeLayer(layer){members.delete(layer)}}
}}
const module={exports:{}}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/utils/region-clip-layer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{
  if(name==='leaflet')return {default:L}
  if(name==='@terraformer/arcgis')return terraformer
  if(name==='./region-clip-hit')return {regionClipGeometryHit:hit}
  if(name==='./topic-feature-hover')return {bindTopicFeatureHover:(path,_map,caption,reset)=>hover.push({path,caption,reset})}
  if(name==='./land-survey-c5')return {c5Pattern:()=> 'data:image/png;base64,cGF0dGVybg=='}
  if(name==='./feature-hover-caption')return {featureHoverCaption:p=>({label:'地类名称',value:p.DLMC||p.NAME})}
  throw Error(name)
},module,module.exports)
const polygon={type:'Feature',geometry:{type:'MultiPolygon',coordinates:[[[[119.8,32.4],[119.9,32.4],[119.9,32.5],[119.8,32.4]]]]},properties:{sourceObjectId:12,TBBH:'000012',DLBM:'0101',DLMC:'水田'}}
const data={type:'FeatureCollection',features:[polygon,{type:'Feature',geometry:{type:'Point',coordinates:[119.9,32.5]},properties:{sourceObjectId:15,NAME:'设施一'}}]}
let received,handled=true
const style={mode:'boundary',color:'#ff0000',categoryField:'DLBM',categories:[{value:'0101',name:'水田',checked:true,color:'#00ff00',mode:'filled'}],boundary:false}
const pixel=(x,y)=>({x,y,add:([a,b])=>pixel(x+a,y+b),subtract:([a,b])=>pixel(x-a,y-b)})
const map={getPane:()=>undefined,latLngToContainerPoint:p=>pixel((p.lng??p[1])*1000,(p.lat??p[0])*1000),containerPointToLatLng:p=>({lng:p.x/1000,lat:p.y/1000})}
const display=module.exports.createRegionClipLayer(map,data,{id:'101::2',name:'高标地块',arcGisGeometryType:'esriGeometryPolygon'}, {fields:[{name:'OBJECTID',type:'esriFieldTypeOID'},{name:'TBBH',alias:'图斑编号'}]},'clip-pane',style,value=>{received=value;return handled})
assert.equal(display.layer.data,data,'渲染后端裁切几何，不替换为原服务或重新计算几何')
assert.equal(shapes[0].options.fillOpacity,1)
assert.equal(shapes[0].options.color,'#00ff00','原分类配色保留')
assert.equal(shapes[1].options.fillOpacity,0,'点状边界模式不强制填充')
assert.equal(shapes[1].options.fill,false,'边界模式关闭填充，避免透明面拦截下层点线的鼠标事件')
assert.deepEqual(hover[0].caption(),{label:'地类名称',value:'水田'})
display.update({...style,categories:style.categories.map(c=>({...c,mode:'boundary'}))})
assert.equal(shapes[0].options.fillOpacity,0,'分类模式更新作用于裁切结果')
assert.equal(shapes[0].options.fill,false,'边界面只接收边线命中，不遮挡内部其他图层')
assert.equal(display.identify({lng:119.87,lat:32.41})[0].objectId,12,'Map fallback selects the clipped boundary-mode interior')
display.update({...style,categories:style.categories.map(category=>({...category,checked:false}))})
assert.equal(display.layer.hasLayer(shapes[0]),false,'统计保留完整基准面时，地图仍可关闭单个分类')
assert.equal(display.identify({lng:119.87,lat:32.41}).length,0,'Hidden categories are not selectable')
display.update(style)
assert.equal(display.layer.hasLayer(shapes[0]),true,'分类可以恢复显示，无须重新裁切')
const click={originalEvent:{}}
shapes[0].events.click(click)
assert.equal(received.clipped,true)
assert.equal(received.objectId,12)
assert.equal(received.rows.find(row=>row.name==='TBBH').label,'图斑编号','原字段别名保留')
assert.equal(received.rows.find(row=>row.name==='TBBH').value,'000012','原属性保留前导零')
assert.equal(received.location.geometries[0].rings.length,1,'详情高亮使用裁切后的多面几何')
assert.equal(stopped,1)
assert.equal(click.originalEvent._stopped,true,'Stop the Leaflet event as well as DOM bubbling, so the map does not clear/replace the details')
handled=false;shapes[0].events.click({originalEvent:{}})
assert.equal(stopped,1,'绘制／测量时不阻断地图交互')
display.destroy()
console.log('region clip layer: exact backend geometry, point/polygon display, category style/mode, native hover, original aliases/IDs and drawing interaction passed')
