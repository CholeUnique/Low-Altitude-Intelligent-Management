<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, CircleCheck, Plus, Upload } from '@element-plus/icons-vue'
import LandSceneMap from '@/components/land-supervision/LandSceneMap.vue'
import LandShpUploadDialog from '@/components/land-supervision/LandShpUploadDialog.vue'
import TaskLocationPreview from '@/components/TaskLocationPreview.vue'
import SpotDateTimePicker from '@/workspace-components/spot-identification/SpotDateTimePicker.vue'
import { useLandSupervisionStore } from '@/stores/land-supervision'
import { useUserStore } from '@/stores/user'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import { getBizSceneAssignees } from '@/api/scene'
import { getRecognitionSpotTypes, type RecognitionAbnormalTypeOption } from '@/api/recognition-spot'
import { saveLandRecognition, reviewLandRecognition, deleteUploadedLandObject, createLandRecognitionTask, getLandRecognitionPage, getLandRecognitionDetail, type LandRecognitionItem } from '@/api/land-recognition'
import { ApiBusinessError } from '@/api/client'
import { landPolygons } from '@/utils/land-supervision-adapter'
import { formatLandTime } from '@/utils/land-supervision'
import { topicRole } from '@/utils/geographic-topic'
import { LAND_WARNING_SCENE, type LandSceneCode, type LandGeometry } from '@/types/land-supervision'
import '@/styles/land-supervision.scss'
import '@/styles/land-recognition.scss'

const props=defineProps<{sceneCode:LandSceneCode}>()
const user=useUserStore(),store=useLandSupervisionStore(),router=useRouter()
const uploadOpen=ref(false),deleteOpen=ref(false)
const warning=computed(()=>props.sceneCode===LAND_WARNING_SCENE)
const services=ref<MapServiceItem[]>([]),types=ref<RecognitionAbnormalTypeOption[]>([])
const records=ref<LandRecognitionItem[]>([]),active=ref<LandRecognitionItem>(),keyword=ref(''),status=ref<number|''>(''),pageNum=ref(1),total=ref(0)
const loading=ref(false),busy=ref(false),error=ref(''),message=ref(''),contextError=ref(''),owner=ref('')
const beforeId=ref(''),afterId=ref(''),title=ref(''),description=ref(''),abnormalType=ref(''),foundTime=ref(''),priority=ref(1)
const taskName=ref('')
const taskNameSource=ref('')
const sceneName=computed(()=>warning.value?'新增违法违规用地智能预警':'全称监测违法违规用地整改')
const executingDeptName=computed(()=>user.currentUser?.deptList?.find(item=>String(item.deptId)===String(user.activeDeptId))?.deptName||user.currentUser?.deptName||user.organization.name)
const sourceLabel=(item:LandRecognitionItem)=>item.sourceType==='UPLOAD'?'SHP 上传':['DRAW','HAND_DRAW'].includes(item.sourceType||'')?'人工圈定':item.sourceType==='RECOGNITION'?'识别导入':'后台专题对象'
const draft=ref<GeoJSON.Polygon>(),drawing=ref(false),uncertain=ref(false),dispatchOpen=ref(false)
const map=ref<InstanceType<typeof LandSceneMap>>(),focus=ref<LandGeometry>(),view=ref<{center:[number,number];zoom:number;source:symbol}>()
let version=0,detailVersion=0,alive=true
const canWrite=computed(()=>user.hasPermission('special-analysis')&&!store.demo)
const canCreateActive=computed(()=>warning.value||active.value?.sourceType==='UPLOAD')
const geometry=computed(()=>draft.value||landPolygons(active.value?.boundaryGeoJson))
const featureCollection=computed(()=>geometry.value?{type:'FeatureCollection' as const,features:[{type:'Feature' as const,geometry:geometry.value,properties:{}}]}:undefined)
const before=computed(()=>services.value.find(item=>String(item.id)===beforeId.value)),after=computed(()=>services.value.find(item=>String(item.id)===afterId.value))
const canSave=computed(()=>warning.value&&canWrite.value&&!busy.value&&!drawing.value&&!uncertain.value&&draft.value&&title.value.trim()&&description.value.trim()&&abnormalType.value&&afterId.value)
const statuses=[{value:-1,label:'待人工审核'},{value:0,label:'审核通过／无需审核'},{value:4,label:'审核驳回'}]
const statusLabel=(spot:LandRecognitionItem)=>spot.taskId?'已生成任务':statuses.find(item=>item.value===spot.handleStatus)?.label||'未知状态'
async function loadPage(){
  const request=++version;loading.value=true;error.value=''
  try{const page=await getLandRecognitionPage({deptId:user.activeDeptId,sceneCode:props.sceneCode,keyword:keyword.value.trim()||undefined,handleStatus:status.value===''?undefined:status.value,pageNum:pageNum.value,pageSize:10});if(request!==version||!alive)return;records.value=page.records;total.value=page.total;if(active.value){const item=page.records.find(item=>item.id===active.value?.id);if(item)active.value={...active.value,...item,geometryIssue:item.geometryIssue||active.value.geometryIssue,boundaryGeoJson:item.boundaryGeoJson||active.value.boundaryGeoJson}}}
  catch(reason){if(request===version)error.value=reason instanceof Error?reason.message:'图斑列表读取失败'}
  finally{if(request===version)loading.value=false}
}
async function initialize(){
  contextError.value=''
  const results=await Promise.allSettled([listEnabledMapServices(user.activeDeptId),getRecognitionSpotTypes(props.sceneCode),getBizSceneAssignees(user.activeDeptId,props.sceneCode)])
  if(!alive)return
  const [imageResult,typeResult,ownerResult]=results,issues:string[]=[]
  if(imageResult.status==='fulfilled')services.value=imageResult.value.filter(item=>topicRole(item,[])==='imagery');else issues.push('影像目录读取失败')
  if(typeResult.status==='fulfilled')types.value=typeResult.value;else issues.push('异常类型读取失败')
  if(ownerResult.status==='fulfilled')owner.value=ownerResult.value.find(item=>item.sceneCode===props.sceneCode)?.assigneeName||'';else issues.push('场景负责人读取失败')
  contextError.value=issues.join('；');await loadPage()
}
function setMap(instance:unknown){map.value=instance as InstanceType<typeof LandSceneMap>|undefined}
function search(){pageNum.value=1;void loadPage()}
function start(kind:'plot'|'region'){
  if(busy.value||!warning.value||kind!=='plot')return
  error.value='';message.value=''
  if(kind==='plot'&&!afterId.value){error.value='请先选择后期参考影像，再圈定图斑。';return}
  if(uncertain.value){error.value='上次保存结果尚未确认，请先刷新列表核对已保存图斑。';return}
  map.value?.start(kind)
}
function drawn(kind:'region'|'plot',polygon:GeoJSON.Polygon){
  if(!warning.value||kind!=='plot')return
  detailVersion++;draft.value=polygon;active.value=undefined;title.value='';description.value='';abnormalType.value='';foundTime.value='';error.value='';message.value=''
}
async function choose(item:LandRecognitionItem){
  if(busy.value||draft.value||drawing.value)return
  const request=++detailVersion;active.value=item;error.value='';message.value=''
  try{const detail=await getLandRecognitionDetail({deptId:user.activeDeptId,id:item.id});if(request!==detailVersion||!alive)return;if(detail.sceneCode!==props.sceneCode)throw new Error('图斑所属场景不一致');active.value={...detail,area:detail.area??item.area};const shape=landPolygons(detail.boundaryGeoJson);if(shape)focus.value=shape;const ids=detail.mapServices.map(item=>String(item.id));if(ids[0])beforeId.value=ids[0];if(ids[1]||ids[0])afterId.value=ids[1]||ids[0]!}
  catch(reason){if(request===detailVersion)error.value=reason instanceof Error?reason.message:'图斑详情读取失败'}
}
async function save(){
  if(!canSave.value||!draft.value)return
  busy.value=true;error.value='';message.value=''
  try{const spot=await saveLandRecognition({deptId:user.activeDeptId,sceneCode:props.sceneCode,title:title.value.trim(),description:description.value.trim(),abnormalType:abnormalType.value,abnormalTypeName:types.value.find(item=>item.code===abnormalType.value)?.name,regionIds:[],beforeImageId:beforeId.value||undefined,afterImageId:afterId.value,foundTime:foundTime.value||undefined,mapServiceIds:[...new Set([beforeId.value,afterId.value].filter(Boolean))],geometryGeojson:JSON.stringify(draft.value)});if(!alive)return;draft.value=undefined;active.value=spot;focus.value=landPolygons(spot.boundaryGeoJson);message.value=warning.value?'专题图斑已保存，完成人工审核后可生成任务。':'确认违法用地对象已保存，可生成整改任务。';pageNum.value=1;await loadPage()}
  catch(reason){if(!(reason instanceof ApiBusinessError))uncertain.value=true;error.value=(reason instanceof Error?reason.message:'保存失败')+(uncertain.value?' 请刷新图斑列表核对，勿重复保存。':'')}
  finally{busy.value=false}
}
async function review(){
  if(!active.value||busy.value)return
  busy.value=true;error.value='';message.value=''
  try{await reviewLandRecognition(user.activeDeptId||'',props.sceneCode,active.value.id);active.value=await getLandRecognitionDetail({deptId:user.activeDeptId,id:active.value.id});message.value='人工审核通过，可以生成任务并提交场景负责人。';await loadPage()}
  catch(reason){error.value=reason instanceof Error?reason.message:'审核失败'}finally{busy.value=false}
}
async function createTask(){
  if(!active.value||busy.value||!taskName.value.trim())return
  if(!canCreateActive.value){error.value='整改任务仅接收预警转接任务或上传的已确认图斑。';return}
  busy.value=true;error.value='';message.value=''
  try{const task=await createLandRecognitionTask(user.activeDeptId||'',props.sceneCode,active.value.id,priority.value,taskName.value.trim(),{beforeImageId:beforeId.value||undefined,afterImageId:afterId.value||undefined});dispatchOpen.value=false;active.value={...active.value,taskId:task.id,handleStatus:1};message.value='任务已创建';await loadPage()}
  catch(reason){error.value=reason instanceof Error?reason.message:'任务创建失败';dispatchOpen.value=false;try{active.value=await getLandRecognitionDetail({deptId:user.activeDeptId,id:active.value.id})}catch{/* Keep the known source ID for an explicit refresh. */}}finally{busy.value=false}
}
function openTask(){if(active.value?.taskId)void router.push({name:'workspace',params:{sceneId:props.sceneCode,taskId:active.value.taskId}})}
async function afterImport(){await loadPage()}
async function deleteObject(){
  if(!active.value||busy.value||!canWrite.value)return
  busy.value=true;error.value=''
  try{await deleteUploadedLandObject(user.activeDeptId||'',props.sceneCode,active.value.id);active.value=undefined;focus.value=undefined;deleteOpen.value=false;await afterImport();message.value='上传图斑已删除，上传数据集可在上传窗口中单独删除。'}
  catch(reason){error.value=reason instanceof Error?reason.message:'删除失败'}finally{busy.value=false}
}

function discard(){map.value?.stop();draft.value=undefined;uncertain.value=false;error.value='';message.value=''}
watch(status,search)
watch(dispatchOpen,open=>{if(open&&active.value&&taskNameSource.value!==active.value.id){taskName.value=`${active.value.title.slice(0,140)} · ${active.value.spotNo}`;taskNameSource.value=active.value.id}})
void initialize()
onBeforeUnmount(()=>{alive=false;version++;detailVersion++})
</script>
<template>
  <section class="land-topic land-recognition" :aria-label="warning?'违法用地预警识别':'确认违法用地识别'">
    <p v-if="contextError" class="land-error" role="alert">{{ contextError }}</p>
    <p v-if="!canWrite" class="land-error">{{ store.demo?'请退出交互演示后使用真实识别与创建功能。':'当前账号可查看；保存、审核及生成任务需专题分析权限。' }}</p>
    <div class="land-recognition-layout">
      <aside class="land-panel land-recognition-list"><header><h2>识别图斑</h2><span>{{ total }} 个</span></header><form class="land-recognition-search" @submit.prevent="search"><input v-model="keyword" placeholder="图斑名称、编号" aria-label="搜索识别图斑" /><button>搜索</button></form><ElSelect v-model="status" :empty-values="[null,undefined]" class="system-select" popper-class="system-select-options" aria-label="图斑状态"><ElOption value="" label="全部状态"/><ElOption v-for="item in statuses" :key="item.value" :value="item.value" :label="item.label"/></ElSelect><div class="land-recognition-records" :aria-busy="loading"><p v-if="loading">正在读取图斑…</p><p v-else-if="!records.length">{{ warning?'暂无识别图斑，请选择影像并人工圈定。':'暂无已确认图斑，请上传已确认图斑 SHP。' }}</p><button v-for="item in records" :key="item.id" :class="{selected:active?.id===item.id}" :disabled="busy||Boolean(draft)||drawing" @click="choose(item)"><b>{{ item.title }}</b><small>{{ sourceLabel(item) }} · {{ item.spotNo }}</small><span>{{ statusLabel(item) }} · {{ item.abnormalTypeDesc }}</span></button></div><footer class="land-pagination"><button :disabled="pageNum===1||loading" @click="pageNum--;loadPage()">上一页</button><span>{{ pageNum }}/{{ Math.max(1,Math.ceil(total/10)) }}</span><button :disabled="pageNum*10>=total||loading" @click="pageNum++;loadPage()">下一页</button></footer></aside>
      <main class="land-recognition-main">
        <nav class="land-recognition-tools" aria-label="违法用地识别操作">
          <button :disabled="busy" @click="router.push({name:'recognition',params:{tab:'topics'},query:{topic:sceneCode}})">{{ warning?'返回监管对象':'返回专题地图' }}</button>
          <button v-if="warning" class="primary" :disabled="busy||drawing||Boolean(draft)||!canWrite||uncertain" @click="start('plot')"><Plus/>新增违法违规用地任务</button>
          <button :disabled="busy||drawing||Boolean(draft)||!canWrite" @click="uploadOpen=true"><Upload/>上传{{ warning?'疑似':'已确认' }}图斑 SHP</button>
          <button :disabled="loading||busy" @click="loadPage"><Refresh/>刷新</button>
          <button v-if="warning" disabled title="AI识别将在算法接入后开放">AI识别 · 待接入</button>
        </nav>
        <div class="land-recognition-maps"><section v-for="side in ['before','after']" :key="side" class="land-recognition-map"><header><b>{{ side==='before'?'前期影像':warning?'后期影像 · 圈定图斑':'后期影像' }}</b><ElSelect v-if="side==='before'" v-model="beforeId" class="system-select" popper-class="system-select-options" placeholder="请选择前期影像" aria-label="识别前期影像" :disabled="busy||drawing"><ElOption v-for="item in services" :key="String(item.id)" :value="String(item.id)" :label="item.name"/></ElSelect><ElSelect v-else v-model="afterId" class="system-select" popper-class="system-select-options" placeholder="请选择后期影像" aria-label="识别后期影像" :disabled="busy||drawing"><ElOption v-for="item in services" :key="String(item.id)" :value="String(item.id)" :label="item.name"/></ElSelect></header><LandSceneMap v-if="side==='after'" :ref="setMap" :fit-imagery="true" :regions="[]" :objects="[]" :tasks="[]" :imagery="after" :focus="focus" :draft="geometry" :view="view" @view-change="view=$event" @drawing="drawing=$event" @drawn="drawn"/><LandSceneMap v-else :fit-imagery="true" :regions="[]" :objects="[]" :tasks="[]" :imagery="before" :focus="focus" :draft="geometry" :view="view" @view-change="view=$event"/></section></div>
        <footer v-if="warning" class="land-recognition-drawing"><span>{{ drawing?'正在圈定违法用地图斑':'两侧影像同步平移与缩放，在后期影像中圈定一个图斑。' }}</span><button v-if="drawing" @click="map?.stop()">取消绘制</button></footer>
      </main>
      <aside class="land-panel land-recognition-details"><header><h2>{{ draft?'新建识别图斑':'图斑详情' }}</h2><button v-if="draft||uncertain" :disabled="busy" @click="discard">{{ uncertain?'结束本次保存':'取消新增' }}</button></header><p v-if="error" class="land-error" role="alert">{{ error }}</p><p v-if="message" class="land-recognition-success" role="status">{{ message }}</p>
        <form v-if="draft" class="land-recognition-form" @submit.prevent="save"><label>图斑名称 <em>*</em><input v-model="title" maxlength="200" required :disabled="busy||uncertain"/></label><label>违法类型 <em>*</em><ElSelect v-model="abnormalType" class="system-select" popper-class="system-select-options" placeholder="请选择违法类型" :disabled="busy||uncertain" aria-label="违法类型"><ElOption v-for="item in types" :key="item.code" :value="item.code" :label="item.name"/></ElSelect></label><label>发现时间<SpotDateTimePicker v-if="!busy&&!uncertain" v-model="foundTime"/><input v-else :value="foundTime" disabled/></label><label>{{ warning?'疑似问题描述':'确认违法情况及依据' }} <em>*</em><textarea v-model="description" rows="4" maxlength="1000" required :disabled="busy||uncertain"/></label><p>{{ warning?'预警专题对象保存后待人工审核；审核不替代工作台中的现场核查结论确认。':'此处录入已确认的违规用地对象，保存后生成整改任务。' }}</p><button class="primary" :disabled="!canSave"><Plus/>{{ busy?'正在保存…':'保存识别图斑' }}</button></form>
        <template v-else-if="active"><h3>{{ active.title }}</h3><p>{{ active.spotNo }}</p><dl><div><dt>图斑状态</dt><dd>{{ statusLabel(active) }}</dd></div><div><dt>违法类型</dt><dd>{{ active.abnormalTypeDesc }}</dd></div><div><dt>图斑面积</dt><dd>{{ active.area==null?'—':(active.area/(2000/3)).toFixed(2)+' 亩' }}</dd></div><div><dt>发现时间</dt><dd>{{ formatLandTime(active.foundTime) }}</dd></div></dl><p>{{ active.description||'暂无描述' }}</p><p v-if="active.geometryIssue" class="land-error" role="alert">{{ active.geometryIssue }}</p><div class="land-recognition-buttons"><button v-if="active.sourceType==='UPLOAD'&&!active.taskId" :disabled="busy||!canWrite" @click="deleteOpen=true">删除该上传图斑</button><button v-if="active.taskId" class="primary" @click="openTask">进入工作台 →</button><button v-else-if="active.handleStatus===-1" class="primary" :disabled="busy||!canWrite||!!active.geometryIssue" @click="review"><CircleCheck/>人工审核通过</button><button v-else-if="active.handleStatus===0&&canCreateActive" class="primary" :disabled="busy||!canWrite||!!active.geometryIssue" @click="dispatchOpen=true">生成{{ warning?'核查':'整改' }}任务</button></div></template><TaskLocationPreview v-if="featureCollection" :geo-json="featureCollection" title="图斑位置"/>
      </aside>
    </div>
    <LandShpUploadDialog :open="uploadOpen" :scene-code="sceneCode" @close="uploadOpen=false" @imported="afterImport" />
    <Teleport to="body"><div v-if="deleteOpen&&active" class="land-dialog-mask"><section class="land-dialog" role="dialog" aria-modal="true" aria-label="删除上传图斑"><header><h2>删除上传图斑</h2></header><p>确认删除“{{ active.title }}”（{{ active.spotNo }}）？该专题对象将被逻辑删除，上传数据集保留；已有任务的图斑不能直接删除。</p><footer><button type="button" :disabled="busy" @click="deleteOpen=false">取消</button><button type="button" :disabled="busy" @click="deleteObject">确认删除图斑</button></footer><p v-if="error" class="land-error" role="alert">{{ error }}</p></section></div></Teleport>
    <Teleport to="body"><div v-if="dispatchOpen&&active" class="land-dialog-mask">
      <form class="land-dialog land-task-create-dialog" role="dialog" aria-modal="true" :aria-label="warning?'创建核查任务':'创建整改任务'" @submit.prevent="createTask">
        <header><div><h2>创建{{ warning?'核查':'整改' }}任务</h2><p>系统将按“一图斑一任务”生成 1 个任务</p></div><button type="button" :disabled="busy" aria-label="关闭生成任务" @click="dispatchOpen=false">×</button></header>
        <div class="land-create-summary"><article><span>已选图斑</span><strong>1 <small>处</small></strong></article><article><span>所属场景 · 由图斑确定</span><b>{{ sceneName }}</b></article><article><span>执行部门 · 当前场景</span><b>{{ executingDeptName }}</b></article></div>
        <section class="land-create-source"><header><b>任务来源图斑</b><span>可自定义任务名称</span></header><article><i>1</i><div><b>{{ active.title }}</b><p>{{ active.spotNo }} · {{ active.abnormalTypeDesc }}</p><label>任务名称 <em>*</em><input v-model="taskName" type="text" maxlength="200" required :disabled="busy" aria-label="任务名称" placeholder="请输入任务名称" /></label></div><small>{{ statusLabel(active) }}</small></article></section>
        <section class="land-create-priority"><div><b>任务优先级</b><p>应用于本次创建的任务</p></div><div class="land-priority-options"><button v-for="item in [{value:0,label:'低'},{value:1,label:'中'},{value:2,label:'高'}]" :key="item.value" type="button" :class="{active:priority===item.value}" :aria-pressed="priority===item.value" :disabled="busy" @click="priority=item.value">{{ item.label }}</button></div></section>
        <p class="land-create-rule"><b>创建规则</b> 一图斑一任务，保留来源图斑与范围，按上方名称创建，由后台最新配置的场景负责人受理并派发。</p>
        <p>当前场景负责人：<b>{{ owner||'未读取到负责人，请先在后台配置' }}</b></p>
        <footer><button type="button" :disabled="busy" @click="dispatchOpen=false">取消</button><button class="primary" :disabled="busy||!owner||!taskName.trim()">{{ busy?'正在创建…':'确认创建任务' }}</button></footer>
      </form>
    </div></Teleport>
  </section>
</template>
