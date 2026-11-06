<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { GovernanceTaskDetail, GovernanceTaskOperateLog, TaskGeometryFeatureCollection } from '@/api/governance-task'
import type { TaskWorkflow } from '@/api/task-workflow'
import { useFacilityContext } from '@/workspace-components/farmland-facilities/use-facility-context'
import FacilityGeometryMap from '@/workspace-components/farmland-facilities/FacilityGeometryMap.vue'
import FacilityReportImageGallery from '@/components/FacilityReportImageGallery.vue'
import TaskHistory from './TaskHistory.vue'
import { projectTaskListWorkflow } from '@/utils/task-list-workflow'
const props=defineProps<{detail:GovernanceTaskDetail;geometry:TaskGeometryFeatureCollection;flow?:TaskWorkflow;logs:GovernanceTaskOperateLog[];historyLoading?:boolean;historyError?:string}>()
const {facts,contextErrors,contextLoading,displayGeometry,reference}=useFacilityContext(toRef(props,'detail'),toRef(props,'geometry'))
const status = computed(()=>projectTaskListWorkflow(props.detail.task,props.flow).taskStatusDesc)
const text=(value:unknown)=>value==null||value===''?'未提供':String(value).replace('T',' ')
</script>
<template>
  <div class="facility-task-detail">
    <header><div><small>高标准农田工程设施管理 · 任务详情</small><h1>{{ detail.task.name }}</h1><p>{{ detail.task.taskNo }} · {{ status }}</p></div><slot name="actions" /></header>
    <p v-for="error in contextErrors" :key="error" class="context-error" role="alert">{{ error }}</p>
    <div class="facility-detail-grid">
      <section class="facility-detail-card facility-detail-facts"><h2>{{ reference ? '关联设施与处置需求' : '工程任务与建设需求' }}</h2><div class="facility-detail-scroll"><p v-if="contextLoading">正在读取设施档案…</p><dl><template v-for="[label,value] in facts" :key="label"><dt>{{ label }}</dt><dd>{{ text(value) }}</dd></template></dl><p v-if="!reference" class="empty">此任务未关联现有设施，建设位置以任务范围为准。</p></div></section>
      <section class="facility-detail-card facility-detail-map"><h2>建设 / 检修位置</h2><FacilityGeometryMap :geometry="displayGeometry" /></section>
      <section class="facility-detail-card facility-detail-photos"><FacilityReportImageGallery v-if="detail.reportImages.length" :images="detail.reportImages" :dept-id="detail.task.deptId" /><template v-else><h2>上报现场照片</h2><p class="empty">暂无上报现场照片</p></template></section>
      <section class="facility-detail-card facility-detail-history"><TaskHistory :task="detail.task" :flow="flow" :logs="logs" :loading="historyLoading" :error="historyError" dark /></section>
    </div>
  </div>
</template>
<style scoped>
.facility-task-detail{height:100%;min-height:0;display:flex;flex-direction:column;gap:10px;color:#c6e6f2}.facility-task-detail>header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;background:#06304c;border:1px solid #155475;border-radius:6px}.facility-task-detail small,.facility-task-detail p{color:#8fb7c7;font-size:12px}.facility-task-detail h1{font-size:18px;margin:5px 0}.facility-task-detail header p{margin:0}.facility-detail-grid{flex:1;min-height:0;display:grid;grid-template-columns:minmax(280px,.8fr) minmax(0,1.6fr) minmax(250px,.8fr);grid-template-rows:minmax(230px,1.2fr) minmax(190px,.8fr);gap:10px}.facility-detail-card{min-width:0;min-height:0;display:flex;flex-direction:column;background:#04243b;border:1px solid #155475;border-radius:6px;overflow:hidden}.facility-detail-card h2{margin:0;padding:11px 14px;font-size:14px;border-bottom:1px solid #155475}.facility-detail-facts{grid-row:1/-1}.facility-detail-map{grid-column:2}.facility-detail-history{grid-column:3;grid-row:1/-1}.facility-detail-photos{grid-column:2;grid-row:2}.facility-detail-scroll{flex:1;min-height:0;overflow:auto;padding:12px 14px;scrollbar-width:thin}.facility-detail-map :deep(.facility-map){flex:1;border-radius:0}.facility-detail-map :deep(.facility-map-legend){display:none}dl{display:grid;grid-template-columns:90px minmax(0,1fr);margin:0;font-size:12px;line-height:1.7}dt,dd{padding:8px 0;margin:0;border-bottom:1px solid #15547566}dt{color:#8bb0c2}dd{color:#d9eef6;white-space:pre-wrap;overflow-wrap:anywhere}.photo-grid{display:flex;gap:10px;align-content:flex-start;flex-wrap:wrap}.photo-grid a{display:grid;gap:6px;width:140px;text-decoration:none;color:#bbdeed;font-size:11px;overflow-wrap:anywhere}.photo-grid img{width:140px;height:100px;object-fit:cover;border-radius:4px}.empty{color:#85aabd;font-size:12px;line-height:1.7}.context-error{margin:0;padding:8px;background:#5a382c;color:#ffceac!important;border-radius:4px}@media(max-width:1200px){.facility-detail-grid{grid-template-columns:280px minmax(0,1fr);grid-template-rows:300px 200px 250px;overflow:auto}.facility-detail-history{grid-column:1/-1;grid-row:3}.facility-detail-facts{grid-row:1/3}}
</style>
<style scoped>
.facility-task-detail>header :deep(.task-action-toolbar){height:auto;align-items:center}.facility-task-detail>header :deep(.task-action-toolbar button){height:32px;min-height:32px;box-shadow:none;font-size:12px}.facility-detail-facts dl{column-gap:10px}
.facility-detail-photos :deep(.report-gallery){flex:1;min-height:0;overflow:auto;border:0;border-radius:0;background:transparent;scrollbar-width:thin}.facility-detail-photos>.empty{padding:0 14px}
</style>
