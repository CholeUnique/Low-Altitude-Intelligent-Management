<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import TopicLayerCard from './TopicLayerCard.vue'
import TopicLayerDisplayMode from './TopicLayerDisplayMode.vue'
import { createLocalId } from '@/utils/local-id'
import { featureHoverCaption } from '@/utils/feature-hover-caption'
import { bindTopicFeatureHover } from '@/utils/topic-feature-hover'
import { topicAreaAttribute } from '@/utils/topic-area'
import { readShpPayload, UPLOAD_COLORS, UPLOAD_CRS, validateUploadName, assertTopicGeometry, uploadIsPolygon, type ParsedTopicUpload, type UploadedTopicLayer } from '@/utils/topic-upload'
import type { DrawingLayerInput } from '@/utils/map-drawing'
import { readTopicUploads, writeTopicUploads } from '@/utils/topic-upload-storage'
import { matchesTopicText,matchesTopicProperties } from '@/utils/topic-layer-search'

const props=defineProps<{map:L.Map;scope:string;keyword:string;integrated?:boolean;layerOrder?:Record<string,number>}>()
const emit=defineEmits<{change:[layers:UploadedTopicLayer[]];dialog:[open:boolean];imported:[]}>()
const items=ref<UploadedTopicLayer[]>([]),dialog=ref<HTMLDialogElement>(),opened=ref(false),busy=ref(false),loading=ref(false),storageError=ref(''),validation=ref('')
const name=ref(''),files=ref<File[]>([]),crs=ref('prj'),encoding=ref('auto'),removing=ref('')
const expanded=ref<Record<string,boolean>>({})
const matches=computed(()=>items.value.filter(item=>matchesTopicText(props.keyword,item.name)||item.data.features.some(feature=>matchesTopicProperties(props.keyword,feature.properties))))
watch([()=>props.keyword,matches],()=>{if(props.keyword.trim())matches.value.forEach(item=>{expanded.value[item.id]=true})})
const handles=new Map<string,L.GeoJSON>()
let request=0,loadVersion=0,worker:Worker|undefined,parseTimer:ReturnType<typeof setTimeout>|undefined,storageQueue=Promise.resolve()
const pane='topic-uploaded-vectors'
if(!props.map.getPane(pane))props.map.createPane(pane).style.zIndex='345'
const renderer=L.canvas({pane,padding:.25})
function announce(){
  emit('change',[...items.value])
}
function persist(){
  const scope=props.scope,snapshot=JSON.parse(JSON.stringify(items.value)) as UploadedTopicLayer[]
  storageQueue=storageQueue.catch(()=>{}).then(()=>writeTopicUploads(scope,snapshot)).then(()=>{if(scope===props.scope)storageError.value=''}).catch(()=>{if(scope===props.scope)storageError.value='上传图层暂时无法保存到本机，本次页面仍可使用；请勿关闭页面，并检查浏览器存储空间。'})
}
function style(item:UploadedTopicLayer):L.PathOptions{return {pane,renderer,color:item.color,weight:item.mode==='boundary'?2.6:1.4,fillColor:item.color,fillOpacity:item.mode==='boundary'?0:.3,bubblingMouseEvents:false}}
function addHandle(item:UploadedTopicLayer){
  const layer=L.geoJSON(item.data,{...style(item),style:()=>style(item),pointToLayer:(_feature,position)=>L.circleMarker(position,{...style(item),radius:5}),onEachFeature(feature,shape){
    bindTopicFeatureHover(shape,props.map,()=>featureHoverCaption(feature.properties,item.fields,item.name),()=>{(shape as L.Path).setStyle(style(item))})
    const content=document.createElement('div');content.className='uploaded-feature-properties'
    const title=document.createElement('b');title.textContent=item.name;content.appendChild(title)
    Object.entries(feature.properties||{}).forEach(([key,value])=>{
      const area=topicAreaAttribute(key,item.fields.find(field=>field.name===key)?.alias||key,value)
      const row=document.createElement('p');row.textContent=`${area?.label||key}：${area?.value??(value==null?'—':typeof value==='object'?JSON.stringify(value):String(value))}`;content.appendChild(row)
    })
    shape.bindPopup(content,{maxWidth:300,maxHeight:240})
  }})
  handles.set(item.id,layer)
  if(item.selected)layer.addTo(props.map)
}
function select(keys:string[],selected:boolean){
  for(const item of items.value.filter(item=>keys.includes(item.id)||keys.includes(`upload:${item.id}`))){item.selected=selected;const layer=handles.get(item.id);if(layer){if(selected&&!props.map.hasLayer(layer))layer.addTo(props.map);else if(!selected)layer.remove()}}
  announce();persist()
}
function mode(item:UploadedTopicLayer,next:'filled'|'boundary'){item.mode=next;handles.get(item.id)?.setStyle(style(item));announce();persist()}
function color(item:UploadedTopicLayer,next:string){item.color=next;handles.get(item.id)?.setStyle(style(item));announce();persist()}
function locate(item:UploadedTopicLayer){const bounds=handles.get(item.id)?.getBounds();if(bounds?.isValid())props.map.fitBounds(bounds,{padding:[80,80],maxZoom:18})}
function remove(item:UploadedTopicLayer){handles.get(item.id)?.remove();handles.delete(item.id);items.value=items.value.filter(value=>value.id!==item.id);removing.value='';delete expanded.value[item.id];announce();persist()}
async function addDrawings(input:DrawingLayerInput){
  if(loading.value||busy.value)throw new Error('本机图层正在读取或导入，请稍后再试')
  const title=validateUploadName(input.name)
  if(!/^#[\da-f]{6}$/i.test(input.color))throw new Error('绘制图层颜色无效')
  // 快照后加入本机图层，后续清除或继续绘制都不能改动已加载几何。
  const data=JSON.parse(JSON.stringify({type:'FeatureCollection',features:input.features})) as GeoJSON.FeatureCollection
  assertTopicGeometry(data)
  const types=['Point','LineString','Polygon'] as const
  const groups=types.map(type=>({type,features:data.features.filter(feature=>feature.geometry.type===type)})).filter(group=>group.features.length)
  if(groups.reduce((count,group)=>count+group.features.length,0)!==data.features.length)throw new Error('绘制图层包含不支持的几何类型')
  if(items.value.length+groups.length>10)throw new Error('每个专题最多保留 10 个本机图层，请先移除不再使用的图层')
  const names=new Set(items.value.map(item=>item.name)),suffix={Point:'点',LineString:'线',Polygon:'面'}
  const additions=groups.map(group=>{
    const base=groups.length>1?`${title.slice(0,56)} · ${suffix[group.type]}`:title
    let name=base,index=2
    while(names.has(name)){const tail=`（${index++}）`;name=base.slice(0,60-tail.length)+tail}
    names.add(name)
    const collection:GeoJSON.FeatureCollection={type:'FeatureCollection',features:group.features}
    return {id:`upload-${createLocalId()}`,name,fileName:`${name}（地图绘制）`,origin:'drawing',color:input.color,mode:'filled',selected:true,createdAt:new Date().toISOString(),data:markRaw(collection),sourceCrs:'EPSG:4326',encoding:'utf-8',skippedCount:0,analyzable:uploadIsPolygon(collection),fields:[{name:'ID',alias:'要素编号',type:'number'},{name:'TYPE',alias:'要素类型',type:'text'}]} satisfies UploadedTopicLayer
  })
  additions.forEach(item=>{addHandle(item);items.value.push(item);expanded.value[item.id]=true})
  announce();persist();emit('imported')
  await nextTick()
}
async function open(){opened.value=true;validation.value='';await nextTick();dialog.value?.showModal();emit('dialog',true)}
function close(){request++;clearTimeout(parseTimer);worker?.terminate();worker=undefined;busy.value=false;dialog.value?.close();opened.value=false;emit('dialog',false)}
function choose(event:Event){files.value=Array.from((event.target as HTMLInputElement).files||[]);if(!name.value.trim()){const shp=files.value.find(file=>/\.shp$/i.test(file.name));if(shp)name.value=shp.name.replace(/\.shp$/i,'').slice(0,60)}}
async function submit(){
  if(busy.value||loading.value)return
  validation.value=''
  let title:string
  try{title=validateUploadName(name.value);if(items.value.length>=10)throw new Error('每个专题最多保留 10 个上传图层，请先移除不再使用的图层');if(items.value.some(item=>item.name===title))throw new Error('上传图层名称已存在，请更换名称')}
  catch(error){validation.value=error instanceof Error?error.message:'请检查上传信息';return}
  const current=++request,scope=props.scope;busy.value=true
  let parser:Worker|undefined
  try{
    const {payload,fileName}=await readShpPayload(files.value,crs.value,encoding.value)
    if(current!==request)return
    parser=new Worker(new URL('../workers/topic-shapefile.worker.ts',import.meta.url),{type:'module'});worker=parser
    const parsed=await new Promise<ParsedTopicUpload>((resolve,reject)=>{
      const timer=setTimeout(()=>{parser?.terminate();reject(new Error('SHP 解析超时，请检查文件或简化数据后重试'))},30_000);parseTimer=timer
      worker!.onmessage=(event:MessageEvent<{ok:boolean;data:ParsedTopicUpload;error:string}>)=>{clearTimeout(timer);event.data.ok?resolve(event.data.data):reject(new Error(event.data.error))}
      worker!.onerror=()=>{clearTimeout(timer);reject(new Error('SHP 解析中断，请检查数据是否完整或尝试较小的文件'))}
      worker!.postMessage(payload,[payload.shp,payload.dbf])
    })
    if(current!==request||scope!==props.scope)return
    const used=new Set(items.value.map(item=>item.color)),color=UPLOAD_COLORS.find(color=>!used.has(color))||UPLOAD_COLORS[items.value.length%UPLOAD_COLORS.length]!
    const item:UploadedTopicLayer={...parsed,data:markRaw(parsed.data),id:`upload-${createLocalId()}`,name:title,fileName,color,mode:'filled',selected:true,createdAt:new Date().toISOString()}
    addHandle(item);items.value.push(item);announce();persist();locate(item);emit('imported');name.value='';files.value=[];close()
  }catch(error){if(current===request)validation.value=error instanceof Error?error.message:'上传解析失败'}
  finally{parser?.terminate();if(worker===parser)worker=undefined;if(current===request){clearTimeout(parseTimer);busy.value=false}}
}
watch(()=>props.scope,async scope=>{
  close();const current=++loadVersion
  handles.forEach(layer=>layer.remove());handles.clear();items.value=[];expanded.value={};removing.value='';storageError.value='';announce();loading.value=true
  try{const stored=await readTopicUploads(scope);if(current!==loadVersion)return;items.value=stored.map(item=>({...item,data:markRaw(item.data)}));items.value.forEach(addHandle);announce()}
  catch{if(current===loadVersion)storageError.value='本机上传图层未能读取，可重新上传；请检查浏览器是否允许本机存储。'}
  finally{if(current===loadVersion)loading.value=false}
},{immediate:true})
onBeforeUnmount(()=>{loadVersion++;close();handles.forEach(layer=>layer.remove());handles.clear();renderer.remove();emit('change',[])})
defineExpose({open,select,addDrawings})
</script>

<template>
  <section v-if="items.length||storageError||loading" class="uploaded-layers" :class="{integrated}" aria-label="本机上传图层">
    <header v-if="items.length&&!integrated"><b>上传图层 <small>{{ items.length }}</small></b></header>
    <p v-if="loading" role="status">正在读取本机图层…</p><p v-if="storageError" class="upload-error" role="alert">{{ storageError }}</p>
    <TopicLayerCard v-for="item in matches" :key="item.id" v-model:expanded="expanded[item.id]" :title="item.name" :subtitle="`${item.data.features.length} 个要素 · ${item.analyzable?'面图层':'点／线图层，仅供展示'}`" :checked="item.selected" class="uploaded-layer" :data-upload-id="item.id" :data-layer-key="`upload:${item.id}`" :style="integrated?{order:layerOrder?.[`upload:${item.id}`]??10000}:undefined" @select="select([item.id],$event)">
      <TopicLayerDisplayMode :mode="item.mode" :name="`upload-mode-${item.id}`" :label="`${item.name}显示模式`" :color="item.color" color-editable @change="mode(item,$event)" @color-change="color(item,$event)" />
      <div v-if="removing===item.id" class="upload-remove"><span>从当前浏览器移除此图层？</span><button type="button" @click="remove(item)">确认</button><button type="button" @click="removing=''">取消</button></div>
      <template #actions><button type="button" @click="locate(item)">定位</button><button type="button" @click="removing=removing===item.id?'':item.id">移除</button></template>
    </TopicLayerCard>
  </section>
  <Teleport :to="map.getContainer().parentElement!">
    <dialog v-if="opened" ref="dialog" class="topic-upload-dialog" aria-labelledby="topic-upload-title" @cancel.prevent="close" @close="opened && close()">
      <form @submit.prevent="submit"><header><h2 id="topic-upload-title">上传 SHP 图层</h2><button type="button" aria-label="关闭上传图层" @click="close">×</button></header>
        <div class="topic-upload-body"><label>图层名称 <em>*</em><input v-model="name" aria-label="上传图层名称" maxlength="60" required :disabled="busy" /></label>
          <label>选择同名组件 <em>*</em><input type="file" multiple accept=".shp,.dbf,.shx,.prj,.cpg" aria-label="SHP 组件文件" :disabled="busy" @change="choose" /></label><p>必选 .shp、.dbf，建议同时选择 .prj、.shx、.cpg。总大小不超过 50MB，单层最多 5,000 个要素。</p><p class="file-names">{{ files.map(file=>file.name).join('、') }}</p>
          <label>源坐标系<ElSelect :empty-values="[null, undefined]" :append-to="dialog" :popper-options="{ strategy: 'fixed' }" class="system-select" popper-class="system-select-options" v-model="crs" aria-label="SHP 源坐标系" :disabled="busy"><ElOption v-for="option in UPLOAD_CRS" :key="option.code" :value="option.code" :label="String(option.name)" /></ElSelect></label>
          <label>属性文字编码<ElSelect :empty-values="[null, undefined]" :append-to="dialog" :popper-options="{ strategy: 'fixed' }" class="system-select" popper-class="system-select-options" v-model="encoding" aria-label="SHP 属性文字编码" :disabled="busy"><ElOption value="auto" label="自动（优先读取 .cpg）" /><ElOption value="utf-8" label="UTF-8" /><ElOption value="gb18030" label="GB18030 / GBK" /></ElSelect></label>
          <p>图层保存在当前浏览器，按账号、部门和专题隔离。面图层可以参与面积分析；坐标系不明确时请先核实，避免位置偏移。</p>
          <p v-if="validation" class="upload-error" role="alert">{{ validation }}</p><p v-if="busy" role="status">正在解析 SHP 并转换坐标…</p>
        </div><footer><button type="button" @click="close">{{ busy?'取消解析':'取消' }}</button><button type="submit" class="primary" :disabled="busy||loading">{{ busy?'解析中…':'添加到地图' }}</button></footer>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.uploaded-layers{margin:12px 0;padding:12px 0;border-block:1px solid #78a7b329;color:#d7eaf0}.uploaded-layers>header{display:flex;align-items:center;gap:8px;font-size:14px}.uploaded-layers>header small{font-size:12px;color:#91b8c6}.uploaded-layers>p{font-size:12px;line-height:1.8}.uploaded-layers:not(.integrated)>.uploaded-layer{margin-top:8px}.upload-remove{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:12px}.upload-remove span{width:100%}.upload-remove button{border:0;background:none;color:#79d4df;font:inherit;font-size:12px;cursor:pointer;padding:2px 0}.upload-error{color:#ffb49b!important}

.topic-upload-dialog{width:500px;max-width:calc(100vw - 40px);max-height:calc(100dvh - 40px);overflow:auto;scrollbar-width:none;padding:0;border:1px solid #83b4c640;border-radius:12px;color:#deedf3;background:#0d2c3df7;box-shadow:0 20px 70px #00141b88;font:13px/1.6 var(--ui-font)}.topic-upload-dialog::backdrop{background:#00152088;backdrop-filter:blur(5px)}.topic-upload-dialog header{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #82b3c429}.topic-upload-dialog h2{font-size:20px;margin:0}.topic-upload-dialog button{font:inherit;cursor:pointer;color:inherit}.topic-upload-dialog header button{border:0;background:none;font-size:24px}.topic-upload-body{padding:20px 22px}.topic-upload-body label{display:block;margin-bottom:14px;font-size:12px}.topic-upload-body em{color:#ffb49b;font-style:normal}.topic-upload-body input,.topic-upload-body select{box-sizing:border-box;display:block;width:100%;margin-top:6px;padding:9px 10px;background:#092331;border:1px solid #6c9bab50;border-radius:5px;color:#deedf3;font:inherit;min-width:0}.topic-upload-body input[type=file]{font-size:12px}.topic-upload-body p{font-size:12px;color:#9dbdc9;line-height:1.8;margin:6px 0 14px;overflow-wrap:anywhere}.topic-upload-dialog footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid #82b3c429}.topic-upload-dialog footer button{padding:8px 14px;border:1px solid #83b4c650;border-radius:5px;background:transparent}.topic-upload-dialog footer .primary{background:#157c9a;border-color:#389fb7}.topic-upload-dialog button:disabled{opacity:.5;cursor:default}:global(.uploaded-feature-properties){max-height:240px;overflow:auto;scrollbar-width:none;color:#244653;font-size:12px}:global(.uploaded-feature-properties p){overflow-wrap:anywhere;margin:6px 0}
.uploaded-layers.integrated{display:contents}
</style>
