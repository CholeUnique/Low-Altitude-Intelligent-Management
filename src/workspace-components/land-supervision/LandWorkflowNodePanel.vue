<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useLandSupervisionStore } from '@/stores/land-supervision'
import { getTaskWorkflow, submitWorkflowNode } from '@/api/task-workflow'
import type { WorkbenchUser } from '@/api/workbench-users'
import type { UavMediaMatch } from '@/api/uav-media-match'
import type { LandTask, LandEvidence } from '@/types/land-supervision'
import { landFlowDefinition, landNodeSubmission } from '@/utils/land-workflow'
import { inspectionFileError } from '@/utils/inspection-files'
import { landGeometryCenter, formatLandTime } from '@/utils/land-supervision'
import WorkbenchRequiredMark from '@/workspace-components/shared/WorkbenchRequiredMark.vue'
import WorkflowAssigneePicker from '@/workspace-components/shared/WorkflowAssigneePicker.vue'
import UavReviewPhotoPicker from '@/workspace-components/non-grain/UavReviewPhotoPicker.vue'
import ReviewPhotoViewport from '@/workspace-components/non-grain/ReviewPhotoViewport.vue'

const props = defineProps<{task:LandTask;nodeKey:string}>()
const emit = defineEmits<{submitted:[];busy:[value:boolean]}>()
const user=useUserStore(),store=useLandSupervisionStore()
const node=computed(()=>props.task.workflowNodes?.find(item=>item.key===props.nodeKey)?.instance)
const editable=computed(()=>props.task.currentNode?.canOperate && props.task.currentNode.key===props.nodeKey && node.value?.id===props.task.currentNode.id)
const field=computed(()=>['FIELD_COLLECT','FIELD_RECTIFY'].includes(props.nodeKey))
const finish=computed(()=>props.nodeKey.startsWith('FINISH_'))
const rectifying=computed(()=>props.nodeKey==='FIELD_RECTIFY')
const audit=computed(()=>props.nodeKey==='SECTION_AUDIT')
const busy=ref(false),error=ref(''),uncertain=ref(false),picker=ref(false),photo=ref<LandEvidence>()
const opinion=ref(''),description=ref(''),checker=ref(''),checkTime=ref(''),result=ref(''),inDeadline=ref(''),deadline=ref('')
const recipient=ref<WorkbenchUser>(),uploads=ref<LandEvidence[]>([])
const record=computed(()=>node.value?.resultData && typeof node.value.resultData==='object' ? node.value.resultData as Record<string,unknown> : {})
const previous=computed(()=>props.task.history.filter(item=>item.nodeKey===props.nodeKey&&item.id!==node.value?.id))
const files=computed(()=>node.value?.files || [])
const attachments=computed(()=>[...new Set([...files.value.map(file=>file.id),...uploads.value.map(item=>item.id)])])
const route=computed(()=>landFlowDefinition(props.task.sceneCode).routes[props.nodeKey]?.[audit.value?result.value:'FORWARD'])
const nextName=computed(()=>landFlowDefinition(props.task.sceneCode).nodes.find(item=>item.key===route.value?.next)?.name || '下一节点')
const center=computed(()=>props.task.geometry ? landGeometryCenter(props.task.geometry) : undefined)
watch(()=>node.value?.id,()=>{opinion.value='';description.value='';checker.value=user.name;checkTime.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);result.value='';inDeadline.value='';deadline.value='';recipient.value=undefined;uploads.value=[];error.value='';uncertain.value=false},{immediate:true})
function setBusy(value:boolean){busy.value=value;emit('busy',value)}
async function upload(files:File[],kind:LandEvidence['kind'],mediaId?:string){
  if(!editable.value||busy.value||uncertain.value)return
  const issue=inspectionFileError(files,true);if(issue){error.value=issue;return}
  setBusy(true);error.value=''
  try{for(const file of files)uploads.value.push(await store.upload(props.task,file,kind,mediaId));picker.value=false}
  catch(reason){error.value=reason instanceof Error?reason.message:'凭证上传失败'}finally{setBusy(false)}
}
function choose(event:Event,kind:LandEvidence['kind']){const input=event.target as HTMLInputElement;const files=Array.from(input.files||[]);input.value='';void upload(files,kind)}
function useUav(value:{file:File;match:UavMediaMatch}){void upload([value.file],'UAV_PHOTO',value.match.mediaId==null?undefined:String(value.match.mediaId))}
async function submit(){
  if(!editable.value||busy.value||uncertain.value||!node.value)return
  setBusy(true);error.value=''
  let sent=false
  try{
    const latest=await getTaskWorkflow(props.task.id)
    const input=landNodeSubmission(props.task.sceneCode,latest,node.value.id,String(user.currentUser?.id||''),{opinion:opinion.value,description:description.value,checker:checker.value,checkTime:checkTime.value,result:result.value,inDeadline:inDeadline.value,attachment:attachments.value,evidence:uploads.value.map(({id,kind,mediaId})=>({id,kind,mediaId})),target:recipient.value,deadline:deadline.value})
    sent=true;await submitWorkflowNode(input);emit('submitted')
  }catch(reason){
    // A transport failure can occur after the server commits. Force an explicit refresh before another submit.
    uncertain.value=sent;error.value=(reason instanceof Error?reason.message:'提交失败')+(sent?' 请重新读取任务核对处理结果后再操作。':'')
  }finally{setBusy(false)}
}
onBeforeUnmount(()=>emit('busy',false))
</script>
<template>
  <section class="land-live-node">
    <details v-if="previous.length" class="land-prior-records"><summary>历次办理记录 · {{ previous.length }} 次</summary><section v-for="entry in previous" :key="entry.id" class="land-history-entry"><header><b>{{ entry.actorName }}</b><small>{{ formatLandTime(entry.time) }}</small></header><p>{{ entry.description||'未填写意见' }}</p><p v-if="entry.conclusion">结论：{{ entry.conclusion==='YES'?'存在问题／未达标':'无问题／已达标' }}</p><ul><li v-for="item in entry.evidence" :key="item.id">{{ item.name }}</li></ul></section></details>
    <template v-if="!editable">
      <p class="land-workspace-readonly">{{ node?.status==='COMPLETED'?'该节点已完成，历史记录只读。':'由当前节点指定办理人处理，当前账号可查看。' }}</p>
      <dl v-if="node" class="land-acceptance"><div><dt>操作人</dt><dd>{{ node.assigneeName||'未返回' }}</dd></div><div><dt>操作时间</dt><dd>{{ node.status==='PROCESSING'?'办理中，尚未提交':formatLandTime(node.submitTime) }}</dd></div><div v-if="record.checkTime"><dt>办理日期</dt><dd>{{ record.checkTime }}</dd></div><div v-if="record.checker"><dt>办理人员</dt><dd>{{ record.checker }}</dd></div><div v-if="record.description||record.opinion"><dt>说明／意见</dt><dd>{{ record.description||record.opinion }}</dd></div><div v-if="record.result"><dt>审核结论</dt><dd>{{ record.result==='PROBLEM'?'存在问题':record.result==='NO_PROBLEM'?'无问题／整改达标':'已派发／提交' }}</dd></div><div v-if="record.inDeadline"><dt>是否在限期前</dt><dd>{{ record.inDeadline==='YES'?'是':'否' }}</dd></div></dl>
    </template>
    <form v-else class="land-workspace-form" @submit.prevent="submit">
      <fieldset :disabled="busy||uncertain">
        <template v-if="field">
          <div class="land-field-row">
            <label><span><WorkbenchRequiredMark />{{ rectifying?'整改日期':'采集日期' }}</span><input v-model="checkTime" type="date" required /></label>
            <label><span><WorkbenchRequiredMark />{{ rectifying?'整改人员':'采集人员' }}</span><input v-model="checker" maxlength="100" required /></label>
          </div>
          <label><span><WorkbenchRequiredMark />{{ rectifying?'整改说明':'实地说明' }}</span><textarea v-model="description" rows="4" maxlength="2000" required placeholder="请填写现场情况及判定依据" /><small class="land-field-count">{{ description.length }}/2000</small></label>
          <section class="land-evidence-editor"><h3><WorkbenchRequiredMark />现场{{ rectifying?'整改':'核查' }}材料</h3><p>现场照片、{{ rectifying?'整改后影像、':'' }}无人机照片至少一种。</p>
            <div class="land-workspace-buttons"><label class="land-upload-button">上传现场照片<input type="file" accept="image/*" multiple @change="choose($event,'PHOTO')" /></label><label v-if="rectifying" class="land-upload-button">上传整改后影像<input type="file" accept="image/*" multiple @change="choose($event,'AFTER_IMAGE')" /></label><button type="button" :disabled="!center" @click="picker=true">提取最新最近无人机照片</button></div>
            <ul v-if="files.length"><li v-for="file in files" :key="file.id">{{ file.fileName }}（已保存）</li></ul>
            <div class="land-evidence-grid"><button v-for="item in uploads" :key="item.id" type="button" @click="photo=item"><img v-if="item.url" :src="item.url" :alt="item.name"/><span>{{ item.name }}</span></button></div>
          </section>
        </template>
        <label v-else-if="!finish"><span>{{ audit?'审核意见':'派发意见' }}</span><textarea v-model="opinion" rows="4" maxlength="2000" placeholder="请输入办理意见" /><small class="land-field-count">{{ opinion.length }}/2000</small></label>
        <template v-if="audit">
          <fieldset class="land-audit-choice"><legend><WorkbenchRequiredMark />审核结论</legend>
            <label :class="{selected:result==='NO_PROBLEM'}"><input v-model="result" type="radio" name="land-audit-result" value="NO_PROBLEM" required />{{ task.sceneCode==='ILLEGAL_LAND_EARLY_WARN'?'不是问题，结束预警':'整改达标，进入结案' }}</label>
            <label :class="{selected:result==='PROBLEM'}"><input v-model="result" type="radio" name="land-audit-result" value="PROBLEM" required />{{ task.sceneCode==='ILLEGAL_LAND_EARLY_WARN'?'是问题，转入整改':'整改未达标，退回整改' }}</label>
          </fieldset>
          <label v-if="task.sceneCode==='STOCK_ILLEGAL_LAND_RECTIFY'"><span>是否在整改限期前</span><select v-model="inDeadline"><option value="">未填写</option><option value="YES">是</option><option value="NO">否</option></select></label><p v-if="route?.assignee==='prevAssignee'">退回至上一位整改人，保留历次处理材料。</p>
        </template>
        <template v-if="route?.assignee==='manual'"><WorkflowAssigneePicker v-model="recipient" :dept-id="user.activeDeptId" :node-id="node?.id" :label="`${nextName}办理人`" /><label><span><WorkbenchRequiredMark v-if="route.next==='FIELD_RECTIFY'" />{{ route.next==='FIELD_RECTIFY'?'整改期限':'下一节点办理期限（可选）' }}</span><input v-model="deadline" type="datetime-local" :required="route.next==='FIELD_RECTIFY'" /></label></template>
        <p v-if="finish">审核已完成，确认后由后端结束当前流程。</p>
      </fieldset>
      <p v-if="error" class="land-workspace-error" role="alert">{{ error }}</p>
      <footer class="land-workspace-buttons"><button class="primary" :disabled="busy||uncertain">{{ busy?'正在处理…':finish?'确认结束':audit?'提交审核结论':field?'提交科室审核':'确认派发' }}</button><button v-if="uncertain" type="button" @click="emit('submitted')">重新读取任务</button></footer>
    </form>
    <ul v-if="!editable&&files.length"><li v-for="file in files" :key="file.id">{{ file.fileName }}</li></ul>
    <UavReviewPhotoPicker v-if="picker&&center" :longitude="center[0]" :latitude="center[1]" :plot-name="task.name" :saving="busy" :save-error="error" @close="picker=false" @use="useUav" />
    <Teleport to="body"><div v-if="photo?.url" class="land-evidence-preview" role="dialog" aria-label="凭证预览" aria-modal="true"><button aria-label="关闭凭证" @click="photo=undefined">×</button><div><ReviewPhotoViewport :src="photo.url" :alt="photo.name"/></div><p>{{ photo.name }}</p></div></Teleport>
  </section>
</template>
<style scoped src="./land-workspace.css"></style>
<style scoped>
.land-live-node fieldset{display:grid;gap:16px;border:0;padding:0;margin:0;min-width:0}.land-live-node label:not(.land-upload-button){display:grid;gap:7px}.land-live-node ul{padding-left:20px;overflow-wrap:anywhere}.land-live-node :deep(.land-evidence-editor){min-width:0}
</style>

<style scoped>
.land-field-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}.land-live-node label>span,.land-live-node legend{font-weight:600;color:#365c75}.land-field-count{text-align:right}.land-live-node .land-audit-choice{display:grid;grid-template-columns:1fr 1fr;gap:10px}.land-audit-choice legend{margin-bottom:10px}.land-live-node .land-audit-choice label{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #d6e5ef;border-radius:5px;cursor:pointer}.land-audit-choice label.selected{background:#edf7ff;border-color:#1687ef;color:#1687ef}.land-audit-choice input{width:auto;accent-color:#1687ef}.land-workspace-form>footer{justify-content:flex-end;border-top:1px solid #e1eaf2;padding-top:16px}.land-live-node :deep(.workbench-required-mark){margin-right:4px}.land-live-node :is(textarea,input,select):focus-visible{outline:2px solid #1687ef55;outline-offset:1px}@media(max-width:850px){.land-field-row,.land-live-node .land-audit-choice{grid-template-columns:1fr}}
</style>
