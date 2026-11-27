<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Upload } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { ApiBusinessError } from '@/api/client'
import { uploadLandShp,importLandDataset,savedLandDatasets,deleteLandDataset,verifyLandDatasetPlacement,landShpFiles,type LandUploadDataset } from '@/api/land-shp-upload'
import { geometryLocation } from '@/utils/geometry-location'
import { parseTopicShapefile,assertTopicGeometry,uploadIsPolygon,type ParsedTopicUpload } from '@/utils/topic-upload'
import { projectedLandShp } from '@/utils/land-shp-coordinate'
import TaskLocationPreview from '@/components/TaskLocationPreview.vue'
import type { TaskGeometryFeatureCollection } from '@/api/governance-task'
import { LAND_WARNING_SCENE,type LandSceneCode } from '@/types/land-supervision'

const props=defineProps<{open:boolean;sceneCode:LandSceneCode;purpose?:'SCOPE'}>()
const emit=defineEmits<{close:[];imported:[count:number]}>()
const user=useUserStore(),warning=computed(()=>props.sceneCode===LAND_WARNING_SCENE)
const scope=computed(()=>props.purpose==='SCOPE')
const uploadTitle=computed(()=>scope.value?'上传监管范围':warning.value?'上传疑似问题图斑':'上传已确认问题图斑')
const files=ref<File[]>([]),name=ref(''),nameField=ref(''),parsed=ref<ParsedTopicUpload>()
const dataset=ref<LandUploadDataset>(),saved=ref<LandUploadDataset[]>([]),step=ref(''),busy=ref(false),error=ref(''),note=ref(''),uncertain=ref(false)
const deleteCandidate=ref<LandUploadDataset>()
const datasetImported=computed(()=>!!(dataset.value?.convertTime||dataset.value?.hasTopicObjects))
const previewGeometry=computed(()=>parsed.value?.data as TaskGeometryFeatureCollection|undefined)
let version=0
const context=computed(()=>`${user.currentUser?.id}:${user.activeDeptId}:${props.sceneCode}:${props.purpose||'ISSUE'}`)
watch(context,()=>{version++;files.value=[];parsed.value=undefined;dataset.value=undefined;saved.value=[];uncertain.value=false;error.value='';note.value='';name.value='';nameField.value=''})
async function readSaved(){
  const captured=context.value
  try{const result=await savedLandDatasets(user.activeDeptId||'',props.sceneCode);if(captured!==context.value)return;saved.value=result.records.filter(item=>item.topicCode===props.sceneCode);if(dataset.value){const latest=saved.value.find(item=>String(item.id)===dataset.value!.id);if(latest?.convertTime||latest?.hasTopicObjects){dataset.value={...latest,id:String(latest.id)};uncertain.value=false;note.value='该数据集已有专题图斑／导入记录，请查看对象列表核对。'}}}
  catch(reason){if(captured===context.value)error.value='已保存数据读取失败：'+(reason instanceof Error?reason.message:String(reason))}
}
watch(()=>props.open,open=>{if(open)void readSaved()},{immediate:true})
async function choose(event:Event){
  if(busy.value||dataset.value||uncertain.value)return
  const input=event.target as HTMLInputElement,items=Array.from(input.files||[]);input.value=''
  if(!items.length)return
  const request=++version;error.value='';parsed.value=undefined;files.value=[];busy.value=true;step.value='正在检查文件…'
  try{
    const parts=landShpFiles(items),shp=parts.get('shp')!,dbf=parts.get('dbf')!
    const [shape,attributes,prj,cpg]=await Promise.all([shp.arrayBuffer(),dbf.arrayBuffer(),parts.get('prj')?.text(),parts.get('cpg')?.text()])
    if(request!==version)return
    const preview=parseTopicShapefile({shp:shape,dbf:attributes,prj,cpg,crs:prj?'prj':'EPSG:4326',encoding:'auto'})
    assertTopicGeometry(preview.data,2000)
    if(!uploadIsPolygon(preview.data))throw new Error('问题图斑必须是面或多面，不能上传点、线图层。')
    if(preview.skippedCount)throw new Error('文件含空几何或已删除记录，请清理后上传，避免遗漏图斑。')
    const projected=projectedLandShp({shp:shape,dbf:attributes,prj,cpg,crs:prj?'prj':'EPSG:4326',encoding:'auto'})
    const stem=shp.name.replace(/\.shp$/i,'')
    files.value=[new File([projected.shp],`${stem}.shp`),new File([attributes],`${stem}.dbf`),new File([projected.shx],`${stem}.shx`),new File([projected.prj],`${stem}.prj`),new File([preview.encoding==='gb18030'?'GB18030':'UTF-8'],`${stem}.cpg`)]
    parsed.value=preview;name.value=stem;nameField.value=''
  }catch(reason){if(request===version)error.value=(reason instanceof Error?reason.message:'文件检查失败')+' 投影坐标数据请附带正确的 .prj 文件。'}
  finally{if(request===version){busy.value=false;step.value=''}}
}
async function submit(){
  if(busy.value||uncertain.value||datasetImported.value||(!dataset.value&&!parsed.value))return
  busy.value=true;error.value='';note.value=''
  const captured=context.value,scene=props.sceneCode,dept=user.activeDeptId||''
  let sending:'upload'|'import'='upload'
  try{
    if(!dataset.value){step.value='正在上传并保存数据集…';dataset.value=await uploadLandShp(dept,scene,files.value,name.value)}
    if(captured!==context.value)return
    if(parsed.value&&dataset.value.featureCount!==parsed.value.data.features.length)throw new Error('后端保存要素数与本地解析数量不一致，已停止导入，请核对数据集。')
    sending='import';step.value=`数据集 ${dataset.value.datasetNo} 已保存，正在导入专题…`
    const count=await importLandDataset(dept,scene,dataset.value.id,nameField.value,props.purpose)
    if(captured!==context.value)return
    if(!Number.isInteger(count)||count<1)throw new Error('导入已受理，但没有返回有效的导入数量，请先核对专题对象列表。')
    if(count!==dataset.value.featureCount){emit('imported',count);throw new Error(`后端仅返回导入 ${count} / ${dataset.value.featureCount} 个要素，请核对专题对象，勿重复导入。`)}
    step.value='已保存，正在核验后端返回的图斑位置…'
    await verifyLandDatasetPlacement(dept,scene,dataset.value.id,count,geometryLocation(parsed.value?.data),props.purpose)
    note.value=scope.value?`已导入 ${count} 个监管范围，不会生成疑似图斑或任务。`:`已导入 ${count} 个${warning.value?'疑似问题':'已确认问题'}图斑；尚未生成任务。`
    dataset.value={...dataset.value,convertTime:new Date().toISOString()};emit('imported',count);await readSaved()
  }catch(reason){
    if(captured!==context.value)return
    uncertain.value=!(reason instanceof ApiBusinessError)
    error.value=(reason instanceof Error?reason.message:'上传失败')+(dataset.value?' 数据集已保存。':'')+(uncertain.value?' 请求结果尚未确认，请刷新已保存数据并核对专题对象，勿重复提交。':sending==='import'?' 可重试导入，无需再次上传。':'')
  }finally{busy.value=false;step.value=''}
}
function resume(item:LandUploadDataset){if(busy.value||item.convertTime||item.hasTopicObjects||item.importStateUnknown||(uncertain.value&&dataset.value))return;parsed.value=undefined;files.value=[];dataset.value={...item,id:String(item.id)};uncertain.value=false;error.value='';note.value='继续导入已有数据集，无需重新上传。';nameField.value=''}
function reset(){if(busy.value||uncertain.value)return;dataset.value=undefined;files.value=[];parsed.value=undefined;note.value='';error.value='';nameField.value=''}
async function removeDataset(){
  if(!deleteCandidate.value||busy.value)return
  const id=String(deleteCandidate.value.id);busy.value=true;error.value='';step.value='正在删除数据集…'
  try{await deleteLandDataset(id);if(dataset.value?.id===id){dataset.value=undefined;parsed.value=undefined;files.value=[];uncertain.value=false}deleteCandidate.value=undefined;note.value='上传数据集已删除；已导入的专题图斑需在图斑详情中单独删除。';await readSaved()}
  catch(reason){error.value=reason instanceof Error?reason.message:'删除失败'}finally{busy.value=false;step.value=''}
}
</script>
<template>
  <Teleport to="body"><div v-if="open" class="land-dialog-mask"><form class="land-dialog land-shp-dialog" role="dialog" aria-modal="true" :aria-label="uploadTitle" @submit.prevent="submit"><header><h2>{{ uploadTitle }}</h2><button type="button" :disabled="busy" aria-label="关闭图斑上传" @click="emit('close')">×</button></header>
    <p>保存至后端，当前专题用户可共享查看。{{ scope?'按“监管范围”导入，仅作范围展示，不作为疑似问题或生成任务。':warning?'按“疑似问题”导入，人工审核后生成核查任务。':'按“已确认问题”导入，可逐图斑生成整改任务。' }}</p>
    <template v-if="!dataset"><label class="land-shp-file"><Upload/><span>选择 Shapefile 文件组</span><input type="file" accept=".shp,.dbf,.shx,.prj,.cpg" multiple :disabled="busy||uncertain" @change="choose"/></label><p>至少包含同名 .shp、.dbf；建议同时选择 .shx、.prj、.cpg。仅支持面图斑，最多 2,000 个，总大小不超过 50MB。</p><ul v-if="files.length"><li v-for="file in files" :key="file.name">{{ file.name }}</li></ul><label>数据集名称<input v-model="name" maxlength="100" :disabled="busy||uncertain"/></label><p v-if="parsed">已检查 {{ parsed.data.features.length }} 个面图斑 · {{ parsed.sourceCrs }}</p></template>
    <p v-else>已保存数据集：<b>{{ dataset.datasetName }}</b> · {{ dataset.datasetNo }} · {{ dataset.featureCount }} 个要素</p>
    <template v-if="parsed&&!dataset"><p>上传前将几何统一转换为 CGCS2000 / 120°E 投影并附带匹配的 .prj，属性完整保留。请核对下方位置。</p><TaskLocationPreview :geo-json="previewGeometry" title="上传位置预览" cgcs2000 /></template>
    <label v-if="parsed&&!datasetImported">图斑名称字段（可选）<select v-model="nameField" :disabled="busy||uncertain"><option value="">自动识别，缺省使用数据集名与序号</option><option v-for="field in parsed.fields" :key="field.name" :value="field.name">{{ field.alias||field.name }}</option></select></label>
    <p v-if="busy" class="land-shp-progress" role="status"><i/>{{ step }}</p><p v-if="error" class="land-error" role="alert">{{ error }}</p><p v-if="note" role="status">{{ note }}</p>
    <details class="land-shp-saved"><summary>已保存数据集（最近 200 条）</summary><button type="button" :disabled="busy" @click="readSaved">刷新已保存数据</button><p v-if="!saved.length">当前专题暂无已保存数据集。</p><article v-for="item in saved" :key="item.id"><span>{{ item.datasetName }} · {{ item.featureCount }} 个 · {{ item.datasetNo }}</span><button type="button" :disabled="busy||!!item.convertTime||item.hasTopicObjects||item.importStateUnknown||(uncertain&&!!dataset)" @click="resume(item)">{{ item.hasTopicObjects?'已有专题图斑':item.convertTime?'已有导入记录':item.importStateUnknown?'导入状态未确认':'继续导入' }}</button><button type="button" :disabled="busy" @click="deleteCandidate=item">删除数据集</button></article></details>
    <section v-if="deleteCandidate" class="land-error" role="alert"><p>删除“{{ deleteCandidate.datasetName }}”？上传数据集和其要素将被逻辑删除；已导入专题的对象不会据此自动清除，需单独删除。权限由后端校验。</p><button type="button" :disabled="busy" @click="deleteCandidate=undefined">取消</button><button type="button" :disabled="busy" @click="removeDataset">确认删除数据集</button></section>
    <footer><button v-if="dataset&&!uncertain" type="button" :disabled="busy" @click="reset">上传另一组</button><button type="button" :disabled="busy" @click="emit('close')">{{ datasetImported?'完成':'关闭' }}</button><button v-if="!dataset?.convertTime" class="primary" :disabled="busy||uncertain||(!parsed&&!dataset)">{{ busy?'正在处理…':dataset?'导入当前专题':'保存并导入专题' }}</button></footer>
  </form></div></Teleport>
</template>
<style scoped>
.land-shp-dialog{width:min(640px,94vw);background:#12384b;color-scheme:dark}.land-shp-file{display:flex!important;align-items:center;justify-content:center;gap:8px;padding:16px;border:1px dashed #5fa4b8;border-radius:8px;background:#0b2e41;cursor:pointer}.land-shp-file>svg{width:20px;height:20px}.land-shp-file>input{max-width:270px}.land-shp-dialog ul{margin:0;padding-left:20px;overflow-wrap:anywhere;font-size:12px}.land-shp-saved{padding-top:12px;border-top:1px solid #76b5cd40;font-size:12px}.land-shp-saved summary{cursor:pointer;margin-bottom:10px}.land-shp-saved article{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #76b5cd20}.land-shp-saved span{min-width:0;overflow-wrap:anywhere}.land-shp-saved button{flex:none}.land-shp-progress{display:flex;gap:8px;align-items:center}.land-shp-progress i{width:14px;height:14px;border:2px solid #54c5df40;border-top-color:#54dceb;border-radius:50%;animation:land-upload-spin 1s linear infinite;flex:none}@keyframes land-upload-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.land-shp-progress i{animation:none}}
</style>
<style scoped>
.land-shp-file{position:relative;overflow:hidden;min-height:32px}.land-shp-file>input{position:absolute;inset:0;width:100%;height:100%;max-width:none;opacity:0;cursor:pointer}.land-shp-file:focus-within{outline:2px solid #4ecfe2;outline-offset:2px}
</style>
