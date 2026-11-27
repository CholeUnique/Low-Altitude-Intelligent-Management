<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import LandWorkflowNodePanel from './LandWorkflowNodePanel.vue'
import WorkbenchHeader from '@/workspace-components/shared/WorkbenchHeader.vue'
import TaskAcceptancePanel from '@/workspace-components/shared/TaskAcceptancePanel.vue'
import NonGrainImageryComparison from '@/workspace-components/non-grain/NonGrainImageryComparison.vue'
import TaskRangeThumbnail from '@/components/TaskRangeThumbnail.vue'
import TaskHistory from '@/components/task-center/TaskHistory.vue'
import WorkflowAssigneePicker from '@/workspace-components/shared/WorkflowAssigneePicker.vue'
import UavReviewPhotoPicker from '@/workspace-components/non-grain/UavReviewPhotoPicker.vue'
import ReviewPhotoViewport from '@/workspace-components/non-grain/ReviewPhotoViewport.vue'
import { getMyWorkflowTasks, type MyWorkflowTask } from '@/api/my-workflow-tasks'
import type { WorkbenchUser } from '@/api/workbench-users'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import type { UavMediaMatch } from '@/api/uav-media-match'
import { topicRole } from '@/utils/geographic-topic'
import { inspectionFileError } from '@/utils/inspection-files'
import { useLandSupervisionStore } from '@/stores/land-supervision'
import { useUserStore } from '@/stores/user'
import { LAND_WARNING_SCENE, LAND_RECTIFICATION_SCENE, type LandAction, type LandSceneCode, type LandTask, type LandEvidence } from '@/types/land-supervision'
import { landFlowDefinition } from '@/utils/land-workflow'
import type { TaskGeometryFeatureCollection, TaskAbnormal, GovernanceTaskComparisonImage } from '@/api/governance-task'
import { getGovernanceTaskOperateLogs, type GovernanceTaskOperateLog } from '@/api/governance-task'
import { landWorkflow, landActions, landStageLabels, landActionLabels, landGeometryCenter, validateLandAction, newLandRequestId, formatLandTime } from '@/utils/land-supervision'
import '@/styles/land-supervision.scss'
import '@/workspace-components/non-grain/workspace.scss'
const props=defineProps<{sceneCode:LandSceneCode;taskId:string}>()
const emit=defineEmits<{location:[value:{taskId:string;taskName:string;geometry?:TaskGeometryFeatureCollection}]}>()
const store=useLandSupervisionStore(),user=useUserStore(),router=useRouter()
const task=ref<LandTask>(),loading=ref(false),busy=ref(false),error=ref(''),submitError=ref(''),selectedKey=ref('ACCEPTANCE')
const description=ref(''),conclusion=ref<'YES'|'NO'|''>(''),deadline=ref(''),recipient=ref<WorkbenchUser>(),demoRecipient=ref('')
const evidence=ref<LandEvidence[]>([]),picker=ref(false),photo=ref<LandEvidence>(),services=ref<MapServiceItem[]>([]),imageError=ref('')
const comparisonBefore=ref(''),comparisonAfter=ref('')
const todos=ref<MyWorkflowTask[]>([]),noticeError=ref('')
const logs=ref<GovernanceTaskOperateLog[]>([]),historyError=ref(''),historyLoading=ref(false)
if(!store.demo&&!props.taskId.startsWith('demo-')&&user.hasPermission('task-todo'))void getMyWorkflowTasks(String(user.currentUser?.id||''),user.activeDeptId).then(result=>{todos.value=result.records.filter(t=>t.myWorkState==='pending'&&t.id!==props.taskId);noticeError.value=result.warnings.join('；')}).catch(reason=>{noticeError.value=reason instanceof Error?reason.message:'待办读取失败'})
const nodes=computed(()=>!store.demo?[{key:'ACCEPTANCE',name:'任务受理'},...(task.value?.workflowNodes?.length?task.value.workflowNodes:landFlowDefinition(props.sceneCode).nodes).filter(node=>!['ACCEPTANCE','CLOSED'].includes(node.key)),...(closed.value?[{key:'CLOSED',name:'结束记录'}]:[])]:landWorkflow(props.sceneCode)),warning=computed(()=>props.sceneCode===LAND_WARNING_SCENE)
const title=computed(()=>warning.value?'新增违法违规用地智能预警':'全称监测违法违规用地整改')
const closed=computed(()=>task.value&&['CLOSED','TRANSFERRED','FAILED','CANCELLED'].includes(task.value.stage))
const steps=computed(()=>nodes.value.map((node,index)=>{const instance=task.value?.workflowNodes?.find(item=>item.key===node.key)?.instance;return {...node,instance,order:index+1,viewable:Boolean(viewable(node.key)),status:node.key==='ACCEPTANCE'||instance?.status==='COMPLETED'||(node.key==='CLOSED'&&closed.value)?'completed':currentKey.value===node.key&&!closed.value?'active':'pending'}}))
const currentKey=computed(()=>task.value?.stage==='UNSUPPORTED'?task.value.backendNodeKey:task.value?.stage)
const canOperate=computed(()=>Boolean(task.value?.currentNode?.canOperate)&&selectedKey.value===task.value?.stage&&!closed.value)
const center=computed(()=>task.value?.geometry?landGeometryCenter(task.value.geometry):[0,0] as [number,number])
const history=computed(()=>task.value?.history.filter(h=>h.nodeKey===selectedKey.value||(selectedKey.value==='CLOSED'&&['CONFIRM_CLOSE','CONFIRM_TRANSFER','APPROVE_CLOSE'].includes(h.action)))||[])
const allEvidence=computed(()=>task.value?.history.flatMap(entry=>entry.evidence)||[])
const geometry=computed<TaskGeometryFeatureCollection>(()=>({type:'FeatureCollection',features:task.value?.geometry?[{type:'Feature',geometry:task.value.geometry,properties:{}}]:[]}))
const selectedNode=computed(()=>task.value?.workflowNodes?.find(item=>item.key===selectedKey.value)?.instance)
const selectedName=computed(()=>nodes.value.find(item=>item.key===selectedKey.value)?.name||'任务信息')
const patch=computed<TaskAbnormal|undefined>(()=>task.value?{
  id:task.value.topicObject?.id||task.value.id,bizTaskId:task.value.id,sceneCode:task.value.sceneCode,
  spotNo:task.value.topicObject?.objectNo,abnormalType:task.value.topicObject?.abnormalType||'',
  abnormalTypeDesc:task.value.topicObject?.abnormalType||'',abnormalLevel:0,
  title:task.value.topicObject?.name||task.value.name,description:task.value.description,
  area:task.value.areaSqm,boundaryGeoJson:geometry.value,handleStatus:closed.value?2:0,
}:undefined)
// Preserve the task's saved order. Never substitute an unrelated available image for a missing period.
const comparisonImages=computed<GovernanceTaskComparisonImage[]>(()=>[comparisonBefore.value,comparisonAfter.value].map((id,index)=>{
  const service=services.value.find(item=>String(item.id)===id)
  return {id:`${index}:${id}`,label:service?.name||(id?'关联影像不可用':'未关联该期影像'),mapService:service}
}))
const summaries=computed(()=>[
  {icon:'单',label:'任务编号',value:task.value?.taskNo||'—'},
  {icon:'景',label:'所属场景',value:warning.value?'新增违法违规用地智能预警':'全称监测违法违规用地整改'},
  {icon:'斑',label:warning.value?'疑似图斑数量':'整改地块数量',value:task.value?.geometry?'1 个':'范围未返回'},
  {icon:'人',label:'当前办理人',value:closed.value?'已结束':task.value?.currentHandlerName||'待配置'},
])
const handoff=computed(()=>{
  if(!task.value||selectedKey.value!==task.value.stage)return undefined
  const expected=({CONFIRM:'SUBMIT_INSPECTION',REVIEW:'SUBMIT_RECTIFICATION',INSPECTION:'RETURN_INSPECTION',RECTIFY:'RETURN_RECTIFICATION'} as Record<string,string>)[task.value.stage]
  const last=task.value.history[task.value.history.length-1]
  return last?.action===expected?last:undefined
})
const availableActions=computed(()=>task.value?landActions(task.value):[])
let version=0
async function load(){
  const request=++version;loading.value=true;error.value='';logs.value=[];historyError.value='';historyLoading.value=false
  try{const detail=await store.detail(props.taskId);if(request!==version)return;if(detail.sceneCode!==props.sceneCode)throw new Error('任务与当前场景不一致。');task.value=detail;emit('location',{taskId:detail.id,taskName:detail.name,geometry:detail.geometry?{type:'FeatureCollection',features:[{type:'Feature',geometry:detail.geometry,properties:{}}]}:undefined});description.value='';conclusion.value='';recipient.value=undefined;demoRecipient.value='';deadline.value='';evidence.value=[];comparisonBefore.value=detail.beforeImageId||'';comparisonAfter.value=detail.afterImageId||''}
  catch(reason){if(request===version){task.value=undefined;error.value=reason instanceof Error?reason.message:'任务读取失败'}}
  finally{if(request===version)loading.value=false}
  if(request===version&&task.value&&!store.demo){
    historyLoading.value=true
    const deptId=task.value.workflow?.currentNode?.deptId||task.value.workflow?.timeline.find(node=>node.deptId)?.deptId||user.activeDeptId
    try{const records=await getGovernanceTaskOperateLogs(props.taskId,deptId);if(request===version)logs.value=records}
    catch(reason){if(request===version)historyError.value=reason instanceof Error?reason.message:'处理记录读取失败'}
    finally{if(request===version)historyLoading.value=false}
  }
}
async function afterSubmitted(){await load();if(task.value)selectedKey.value=closed.value?'CLOSED':task.value.backendNodeKey||'ACCEPTANCE'}
function viewable(key:string){return key==='ACCEPTANCE'||currentKey.value===key||(key==='CLOSED'&&closed.value)||task.value?.history.some(h=>h.nodeKey===key)}
function visit(key:string){if(viewable(key)&&!busy.value){selectedKey.value=key;submitError.value=''}}
function returnToTopic(){void router.push({name:'recognition',params:{tab:'topics'},query:{topic:props.sceneCode}})}
function linked(id:string,scene:LandSceneCode){void router.push({name:'workspace',params:{sceneId:scene,taskId:id},query:store.demo?{demo:'1'}:{}})}
async function upload(files:File[],kind:LandEvidence['kind'],mediaId?:string){
  if(!task.value||!canOperate.value||busy.value)return
  submitError.value='';const validation=inspectionFileError(files,true);if(validation){submitError.value=validation;return}
  busy.value=true
  try{for(const file of files)evidence.value.push(await store.upload(task.value,file,kind,mediaId));picker.value=false}
  catch(reason){submitError.value=reason instanceof Error?reason.message:'材料上传失败'}finally{busy.value=false}
}
function chooseFiles(event:Event,kind:LandEvidence['kind']){const input=event.target as HTMLInputElement;const files=Array.from(input.files||[]);input.value='';void upload(files,kind)}
function useUav(value:{file:File;match:UavMediaMatch}){void upload([value.file],'UAV_PHOTO',value.match.mediaId==null?undefined:String(value.match.mediaId))}
async function submit(action:LandAction){
  if(!task.value||!canOperate.value||busy.value)return
  submitError.value=''
  const input={taskId:task.value.id,nodeInstId:task.value.currentNode!.id,expectedVersion:task.value.version,action,requestId:newLandRequestId(),description:description.value.trim(),assigneeId:store.demo?demoRecipient.value:recipient.value?.id,assigneeName:store.demo?demoRecipient.value:recipient.value?.realName||recipient.value?.nickname||recipient.value?.username,deadline:deadline.value||undefined,conclusion:conclusion.value||undefined,evidenceIds:evidence.value.map(e=>e.id)}
  try{validateLandAction(task.value,input,evidence.value);busy.value=true;task.value=await store.action(input,evidence.value);description.value='';conclusion.value='';evidence.value=[];recipient.value=undefined;demoRecipient.value='';selectedKey.value=closed.value?'CLOSED':task.value.stage}
  catch(reason){submitError.value=reason instanceof Error?reason.message:'操作失败，请刷新任务后重试。'}finally{busy.value=false}
}
watch(()=>props.taskId,()=>{selectedKey.value='ACCEPTANCE';void load()},{immediate:true})
void listEnabledMapServices(user.activeDeptId).then(items=>{services.value=items.filter(s=>topicRole(s,[])==='imagery')}).catch(reason=>{imageError.value=reason instanceof Error?reason.message:'影像目录读取失败'})
onBeforeUnmount(()=>{version++})
</script>
<template>
  <div class="land-workspace">
    <WorkbenchHeader :title="title" :task-name="task?.name" :steps="steps" :selected-key="selectedKey" :user-id="String(user.currentUser?.id||'')" :busy="busy" back-label="返回专题" :show-notice="!store.demo&&user.hasPermission('task-todo')" :tasks="todos" :notice-error="noticeError" @back="returnToTopic" @select="visit" @open-all="router.push('/tasks/todo')" @open-task="router.push({name:'workspace',params:{sceneId:$event.sceneCode,taskId:$event.id}})"><template v-if="store.demo" #status><span class="land-workspace-demo">演示</span></template></WorkbenchHeader>
    <div v-if="task?.workflowIssue&&!store.demo" class="land-workspace-demo-strip" role="status">{{ task.workflowIssue }}</div><div v-if="store.demo" class="land-workspace-demo-strip">演示模式：可模拟各节点流转，不写入真实任务；正式处理人由后端场景配置与节点权限决定。</div>
    <main v-if="loading" class="land-workspace-empty" role="status">正在读取任务…</main><main v-else-if="error" class="land-workspace-empty"><p role="alert">{{ error }}</p><button @click="load">重新读取</button><button @click="returnToTopic">返回专题</button></main>
    <main v-else-if="task" class="land-workspace-body">
      <section class="ng-summary ng-summary--compact land-task-summary" aria-label="任务摘要">
        <article v-for="item in summaries" :key="item.label" class="ng-summary-card"><i>{{ item.icon }}</i><span><small>{{ item.label }}</small><b :title="item.value">{{ item.value }}</b></span></article>
      </section>
      <div class="land-workspace-columns">
        <aside class="land-workspace-left">
          <section class="land-workspace-card land-patch-panel">
            <header><h2>待核查图斑 <small>共 {{ task.geometry?'1':'0' }} 个</small></h2></header>
            <article class="land-patch-item" aria-current="true">
              <TaskRangeThumbnail v-if="task.geometry" :geo-json="geometry" />
              <span v-else class="land-patch-missing">暂无范围</span>
              <div><b>{{ patch?.title }}</b><small v-if="patch?.spotNo">{{ patch.spotNo }}</small><span>面积：{{ Number.isFinite(task.areaSqm)?task.areaSqm.toFixed(2):'—' }} ㎡</span><strong>{{ task.statusLabel||landStageLabels[task.stage] }}</strong></div>
            </article>
            <dl class="land-patch-facts"><div><dt>任务名称</dt><dd>{{ task.name }}</dd></div><div><dt>发现说明</dt><dd>{{ task.description||'未填写' }}</dd></div><div><dt>办理期限</dt><dd>{{ task.deadline?formatLandTime(task.deadline):'未设置' }}</dd></div></dl>
            <p v-if="!task.geometry" class="land-workspace-error">{{ task.geometryIssue||'后端未返回任务面范围。' }}</p>
            <div class="land-workspace-buttons"><button v-if="task.sourceTaskId" @click="linked(task.sourceTaskId,LAND_WARNING_SCENE)">查看来源预警任务</button><button v-if="task.linkedTaskId" @click="linked(task.linkedTaskId,LAND_RECTIFICATION_SCENE)">查看关联整改任务 →</button></div>
          </section>
          <section class="land-workspace-card land-record-panel">
            <TaskHistory v-if="!store.demo" :logs="logs" :flow="task.workflow" :loading="historyLoading" :error="historyError" />
            <template v-else><header><h2>任务处理记录</h2><small>{{ task.history.length }} 条</small></header><div class="land-record-scroll"><article v-for="entry in [...task.history].reverse()" :key="entry.id" class="land-history-entry"><header><b>{{ entry.action==='CREATE'?'创建任务':nodes.find(n=>n.key===entry.nodeKey)?.name||'办理记录' }}</b><small>{{ formatLandTime(entry.time) }}</small></header><small>{{ entry.actorName }}</small><p>{{ entry.description }}</p></article></div></template>
          </section>
        </aside>
        <div class="land-workspace-right">
          <NonGrainImageryComparison :key="task.id" :images="comparisonImages" :geometry="geometry" :spot="patch" :allow-image-selection="false" />
          <p v-if="imageError" class="land-workspace-error">{{ imageError }}</p>
          <section class="land-workspace-card land-node-card">
            <header><h2>{{ selectedName }}{{ selectedKey==='ACCEPTANCE'?'':'填报' }}</h2><span class="land-node-status" :class="{complete:selectedNode?.status==='COMPLETED'}">{{ selectedKey==='ACCEPTANCE'?'任务详情':selectedNode?.status==='COMPLETED'?'已完成办理':canOperate?'当前可办理':'只读查看' }}</span></header>
            <dl v-if="selectedKey!=='ACCEPTANCE'" class="land-node-context">
              <div><dt>办理节点</dt><dd>{{ selectedName }}</dd></div><div><dt>当前图斑</dt><dd>{{ patch?.title }}</dd></div>
              <div><dt>办理人</dt><dd>{{ selectedNode?.assigneeName||'—' }}</dd></div><div><dt>{{ selectedNode?.submitTime?'操作时间':'主责部门' }}</dt><dd>{{ selectedNode?.submitTime?formatLandTime(selectedNode.submitTime):selectedNode?.deptName||'—' }}</dd></div>
            </dl>
            <p v-if="task.topicObjectIssue" class="land-workspace-error">来源专题对象：{{ task.topicObjectIssue }}</p>
            <TaskAcceptancePanel v-if="selectedKey==='ACCEPTANCE'&&!store.demo" embedded :task-id="task.id" :topic-object="task.topicObject" />
            <template v-else-if="selectedKey==='ACCEPTANCE'"><dl class="land-acceptance"><div><dt>任务名称</dt><dd>{{ task.name }}</dd></div><div><dt>发现说明</dt><dd>{{ task.description }}</dd></div><div><dt>创建时间</dt><dd>{{ formatLandTime(task.createTime) }}</dd></div><div><dt>优先级</dt><dd>{{ ({2:'高',1:'中',0:'低'} as Record<number,string>)[task.priority]||'中' }}</dd></div></dl></template>
            <div v-if="selectedKey==='ACCEPTANCE'&&!closed&&currentKey&&viewable(currentKey)" class="land-workspace-buttons land-acceptance-actions"><button class="primary" @click="visit(currentKey)">查看当前办理节点 →</button></div>
            <template v-if="selectedKey==='CLOSED'"><p>{{ task.stage==='TRANSFERRED'?'问题已确认，已自动生成关联整改任务。':'任务已结案，历史材料可查看，无法修改。' }}</p><button v-if="task.linkedTaskId" class="primary" @click="linked(task.linkedTaskId,LAND_RECTIFICATION_SCENE)">进入关联整改工作台</button></template>
        <LandWorkflowNodePanel v-if="!store.demo&&!['ACCEPTANCE','CLOSED'].includes(selectedKey)" :key="`${task.id}:${selectedKey}`" :task="task" :node-key="selectedKey" @busy="busy=$event" @submitted="afterSubmitted" />
        <section v-for="entry in store.demo?history:[]" :key="entry.id" class="land-history-entry"><header><b>{{ entry.action==='CREATE'?'创建任务':entry.action==='RECORD'?'节点办理记录':landActionLabels[entry.action] }}</b><small>{{ entry.actorName }} · {{ formatLandTime(entry.time) }}</small></header><p>{{ entry.description }}</p><p v-if="entry.conclusion">现场核查：{{ entry.conclusion==='YES'?'是问题':'不是问题' }}</p><div class="land-evidence-grid"><button v-for="item in entry.evidence" :key="item.id" @click="photo=item"><img v-if="item.url" :src="item.url" :alt="item.name" /><span v-else>未提供图片预览地址 · {{ item.name }}</span></button></div></section>
        <section v-if="store.demo&&handoff" class="land-handoff"><h3>{{ handoff.action.startsWith('RETURN')?'退回原因':'上一步提交材料' }}</h3><small>{{ handoff.actorName }} · {{ formatLandTime(handoff.time) }}</small><p>{{ handoff.description }}</p><div class="land-evidence-grid"><button v-for="item in handoff.evidence" :key="item.id" @click="photo=item"><img v-if="item.url" :src="item.url" :alt="item.name" /><span v-else>未提供图片预览地址 · {{ item.name }}</span></button></div></section><form v-if="store.demo&&canOperate" class="land-workspace-form" @submit.prevent>
          <template v-if="task.stage==='DISPATCH'"><p>确认任务信息后选择{{ warning?'现场核查人':'具体整改人' }}。后续审核将自动流转至本场景配置的负责人。</p><label v-if="store.demo">模拟办理人 <em>*</em><select v-model="demoRecipient" required><option value="">请选择演示办理人</option><option value="演示核查人">演示核查人</option><option value="演示整改人">演示整改人</option></select></label><WorkflowAssigneePicker v-else v-model="recipient" :dept-id="user.activeDeptId" :node-id="task.currentNode?.id" :label="warning?'现场核查人':'具体整改人'" /><label v-if="!warning">整改期限 <em>*</em><input v-model="deadline" type="datetime-local" required /></label></template>
          <label v-if="task.stage==='INSPECTION'">是否存在问题 <em>*</em><select v-model="conclusion" required><option value="">请选择核查结论</option><option value="YES">是问题</option><option value="NO">不是问题</option></select></label>
          <p v-if="task.stage==='CONFIRM'">现场核查结论：<strong>{{ task.conclusion==='YES'?'是问题，确认后自动转入整改':'不是问题，由负责人决定是否结案' }}</strong>。也可退回补充核查。</p>
          <p v-if="task.stage==='REVIEW'">请核对整改说明与历次凭证；不通过时填写原因并退回整改。</p>
          <label>{{ task.stage==='RECTIFY'?'整改说明':'办理说明／审核意见' }} <em>*</em><textarea v-model="description" rows="5" maxlength="2000" required :disabled="busy" /></label>
          <section v-if="['INSPECTION','RECTIFY'].includes(task.stage)" class="land-evidence-editor"><h3>{{ task.stage==='RECTIFY'?'图片凭证（至少一种）':'现场图片（可选）' }}</h3><div class="land-workspace-buttons"><label class="land-upload-button">上传现场照片<input type="file" accept="image/*" multiple :disabled="busy" @change="chooseFiles($event,'PHOTO')" /></label><label class="land-upload-button">上传整改后影像<input type="file" accept="image/*" multiple :disabled="busy" @change="chooseFiles($event,'AFTER_IMAGE')" /></label><button type="button" :disabled="busy" @click="picker=true">获取最新最近无人机照片</button></div><div class="land-evidence-grid"><article v-for="item in evidence" :key="item.id"><button type="button" @click="photo=item"><img v-if="item.url" :src="item.url" :alt="item.name" /><span v-else>未提供图片预览地址 · {{ item.name }}</span></button><small>{{ item.name }}</small><button type="button" :disabled="busy" @click="evidence=evidence.filter(e=>e.id!==item.id)">移除本次凭证</button></article></div></section>
          <p v-if="submitError" class="land-workspace-error" role="alert">{{ submitError }}</p><footer class="land-workspace-buttons"><button v-for="action in availableActions" :key="action" type="button" :class="{primary:!action.startsWith('RETURN')}" :disabled="busy" @click="submit(action)">{{ busy?'正在处理…':landActionLabels[action] }}</button></footer>
        </form>
        <p v-else-if="store.demo&&!closed&&selectedKey===task.stage" class="land-workspace-readonly">当前账号只能查看，办理权限以后台返回的当前节点授权为准。</p>
          </section>
          <section v-if="allEvidence.length" class="land-workspace-card"><header><h2>历次图片凭证</h2></header><div class="land-evidence-grid"><button v-for="item in allEvidence" :key="item.id" :disabled="!item.url" @click="photo=item"><img v-if="item.url" :src="item.url" :alt="item.name" /><span>{{ item.name }}</span></button></div></section>
        </div>
      </div>
    </main>
    <UavReviewPhotoPicker v-if="picker&&task?.geometry" :longitude="center[0]" :latitude="center[1]" :plot-name="task?.name||''" :saving="busy" :save-error="submitError" @close="picker=false" @use="useUav" />
    <Teleport to="body"><div v-if="photo?.url" class="land-evidence-preview" role="dialog" aria-modal="true" aria-label="凭证图片预览"><button aria-label="关闭凭证预览" @click="photo=undefined">×</button><div><ReviewPhotoViewport :src="photo.url" :alt="photo.name" /></div><p>{{ photo.name }}</p></div></Teleport>
  </div>
</template>
<style scoped src="./land-workspace.css"></style>
