<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Picture } from '@element-plus/icons-vue'
import LandSceneMap from '@/components/land-supervision/LandSceneMap.vue'
import LandImageComparison from '@/components/land-supervision/LandImageComparison.vue'
import { useLandSupervisionStore } from '@/stores/land-supervision'
import { useUserStore } from '@/stores/user'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import { topicRole } from '@/utils/geographic-topic'
import { LAND_WARNING_SCENE, LAND_SCENE_CONFIG, type LandSceneCode, type LandTask, type LandGeometry, type LandTaskPage } from '@/types/land-supervision'
import { landStageLabels, landTaskStatusLabels, formatLandTime, formatLandMetric } from '@/utils/land-supervision'
import { landSupervisionEnabled, listAllLandTaskRanges } from '@/api/land-supervision'
import '@/styles/land-supervision.scss'
const props=defineProps<{sceneCode:LandSceneCode}>()
const store=useLandSupervisionStore(),user=useUserStore(),router=useRouter()
const warning=computed(()=>props.sceneCode===LAND_WARNING_SCENE)
const name=computed(()=>warning.value?'新增违法违规用地智能预警':'全称监测违法违规用地整改')
const sceneConfig=computed(()=>LAND_SCENE_CONFIG[props.sceneCode])
const checked=ref<string[]>([]),keyword=ref(''),stage=ref(''),pageNum=ref(1)
const statisticsCollapsed=ref(false),tasksCollapsed=ref(false)
const result=ref<LandTaskPage>(),busy=ref(false),error=ref('')
const focus=ref<LandGeometry>(),selected=ref<LandTask>()
const services=ref<MapServiceItem[]>([]),imageError=ref(''),imageryId=ref(''),beforeId=ref(''),afterId=ref(''),comparison=ref(false)
const allTasks=ref<LandTask[]>([]),rangesLoading=ref(false),rangesError=ref('')
const taskItems=ref<HTMLElement>(),taskContextLoading=ref(false),taskContextError=ref('')
const taskContexts=new Map<string,LandTask>()
let selectionRequest=0,mapSelectionRequest=0,syncingTaskSelection=false
let rangesRequest=0
let request=0,queryTimer:ReturnType<typeof setTimeout>|undefined
const imagery=computed(()=>services.value.find(s=>String(s.id)===imageryId.value))
const stats=computed(()=>result.value?.statistics)
const stageOptions=computed(()=>!store.demo?Object.keys(landTaskStatusLabels):warning.value?['DISPATCH','INSPECTION','CONFIRM','TRANSFERRED','CLOSED']:['DISPATCH','RECTIFY','REVIEW','CLOSED'])
const stageLabel=(value:string)=>store.demo?landStageLabels[value as keyof typeof landStageLabels]:landTaskStatusLabels[value]
const taskGeometry=computed(()=>selected.value?.geometry)
const mapTasks=computed(()=>allTasks.value)

async function loadMapTasks(){
  const version=++rangesRequest;rangesLoading.value=true;rangesError.value='';allTasks.value=[]
  try{
    const tasks=store.demo?(await store.page(props.sceneCode,(await store.regions(props.sceneCode)).map(item=>item.id))).records:await listAllLandTaskRanges(user.activeDeptId||'',props.sceneCode)
    if(version!==rangesRequest)return
    allTasks.value=tasks
    const shapes=tasks.flatMap(task=>task.geometry?[task.geometry]:[])
    if(shapes.length)focus.value={type:'MultiPolygon',coordinates:shapes.flatMap(shape=>shape.type==='Polygon'?[shape.coordinates]:shape.coordinates)}
  }catch(reason){if(version===rangesRequest)rangesError.value=reason instanceof Error?reason.message:'任务范围读取失败'}
  finally{if(version===rangesRequest)rangesLoading.value=false}
}
async function loadRegions(){
  checked.value=store.demo?(await store.regions(props.sceneCode)).map(item=>item.id):[]
  focus.value=undefined;void loadMapTasks();await loadPage()
}
async function loadPage(){
  const version=++request;busy.value=true;error.value=''
  try{const data=await store.page(props.sceneCode,checked.value,keyword.value.trim(),stage.value,pageNum.value);if(version!==request)return;result.value=data;if(selected.value&&!data.records.some(t=>t.id===selected.value?.id))selected.value=undefined}
  catch(reason){if(version===request){error.value=reason instanceof Error?reason.message:'任务读取失败';result.value=undefined}}
  finally{if(version===request)busy.value=false}
}
async function demo(){stage.value='';store.enableDemo();await loadRegions()}
async function loadImages(){
  const department=user.activeDeptId
  try{services.value=(await listEnabledMapServices(department)).filter(s=>topicRole(s,[])==='imagery')}
  catch(reason){imageError.value=reason instanceof Error?reason.message:'影像目录读取失败'}
}
function filterChanged(){selectionRequest++;taskContextLoading.value=false;comparison.value=false;pageNum.value=1;selected.value=undefined;if(queryTimer)clearTimeout(queryTimer);queryTimer=setTimeout(()=>void loadPage(),250)}
function revealSelectedTask(){
  const container=taskItems.value
  const button=Array.from(container?.querySelectorAll<HTMLElement>('[data-task-id]')||[]).find(item=>item.dataset.taskId===selected.value?.id)
  if(!container||!button)return
  const area=container.getBoundingClientRect(),row=button.getBoundingClientRect()
  if(row.top<area.top)container.scrollTop+=row.top-area.top
  else if(row.bottom>area.bottom)container.scrollTop+=row.bottom-area.bottom
}
async function chooseTask(task:LandTask){
  mapSelectionRequest++
  const version=++selectionRequest
  comparison.value=false;taskContextError.value=''
  const geometry=task.geometry||allTasks.value.find(item=>item.id===task.id)?.geometry
  selected.value={...task,geometry};focus.value=geometry?{...geometry}:undefined
  beforeId.value=task.beforeImageId||'';afterId.value=task.afterImageId||''
  taskContextLoading.value=true
  try{
    const detail=taskContexts.get(task.id)||await store.detail(task.id)
    if(version!==selectionRequest)return
    taskContexts.set(task.id,detail)
    selected.value={...detail,geometry:detail.geometry||geometry}
    beforeId.value=detail.beforeImageId||task.beforeImageId||'';afterId.value=detail.afterImageId||task.afterImageId||''
    if(!geometry&&detail.geometry)focus.value={...detail.geometry}
  }catch(reason){if(version===selectionRequest)taskContextError.value=reason instanceof Error?reason.message:'任务影像读取失败'}
  finally{if(version===selectionRequest)taskContextLoading.value=false}
}
async function chooseMapTask(id:string){
  const task=mapTasks.value.find(item=>item.id===id)
  if(!task)return
  const version=++mapSelectionRequest;tasksCollapsed.value=false
  if(queryTimer)clearTimeout(queryTimer)
  {
    const targetPage=Math.floor(allTasks.value.findIndex(item=>item.id===id)/10)+1
    if(keyword.value||stage.value||pageNum.value!==targetPage){
      if(queryTimer)clearTimeout(queryTimer)
      syncingTaskSelection=true;keyword.value='';stage.value='';pageNum.value=targetPage
      await nextTick();syncingTaskSelection=false;await loadPage()
      if(version!==mapSelectionRequest)return
    }
  }
  void chooseTask(result.value?.records.find(item=>item.id===id)||task)
  await nextTick();revealSelectedTask()
}
function compareChosen(before:string,after:string){beforeId.value=before;afterId.value=after;comparison.value=false}
function openTask(task:LandTask){void router.push({name:'workspace',params:{sceneId:task.sceneCode,taskId:task.id},query:store.demo?{demo:'1'}:{}})}
watch([keyword,stage],()=>{if(!syncingTaskSelection)filterChanged()})
watch(()=>props.sceneCode,()=>{selected.value=undefined;void loadRegions()},{immediate:true})
void loadImages()
onBeforeUnmount(()=>{request++;rangesRequest++;selectionRequest++;mapSelectionRequest++;if(queryTimer)clearTimeout(queryTimer)})
</script>
<template>
  <section class="land-topic land-regulatory-topic" data-map-labels="layer" :aria-label="name">
    <div v-if="store.demo" class="land-demo-banner">任务及流转均为演示样例，刷新后可能重置；后台配置的负责人在接口接入后生效。</div>
    <div class="land-topic-layout">
      <main class="land-map-panel" :aria-busy="rangesLoading">
        <LandSceneMap :regions="[]" :tasks="mapTasks" all-tasks :selected-id="selected?.id" :focus="focus" :imagery="imagery" @select="chooseMapTask" />
        <nav class="land-map-toolbar" aria-label="场景地图操作"><label><Picture />背景影像<ElSelect v-model="imageryId" :empty-values="[null,undefined]" class="system-select land-imagery-select" popper-class="system-select-options" aria-label="背景影像"><ElOption value="" label="天地图底图" /><ElOption v-for="service in services" :key="String(service.id)" :value="String(service.id)" :label="service.name" /></ElSelect></label></nav>
        <div v-if="error||rangesError" class="land-map-notice" role="alert">{{ error||rangesError }}<button v-if="!store.demo&&!landSupervisionEnabled" @click="demo">查看交互演示</button></div>
        <div v-if="imageError" class="land-image-error">影像目录：{{ imageError }}</div>
        <article v-if="selected" class="land-selected-card"><header><h2>{{ selected.name }}</h2><button aria-label="关闭选中图斑" @click="selected=undefined;selectionRequest++">×</button></header><p>{{ selected.taskNo }} · {{ selected.statusLabel||landStageLabels[selected.stage] }} · {{ Number.isFinite(selected.areaSqm)?(selected.areaSqm/666.6666667).toFixed(2):'—' }} 亩</p><p v-if="selected.description">{{ selected.description }}</p><p v-if="taskContextError" class="land-error" role="alert">{{ taskContextError }}</p><p v-if="!selected.geometry">{{ selected.geometryIssue||'后端尚未返回任务面范围，当前无法地图定位。' }}</p><footer><button :disabled="!selected.geometry||taskContextLoading" @click="comparison=true"><Picture />历史影像对比</button><button class="primary" @click="openTask(selected)">进入工作台 →</button></footer></article>
      </main>
      <aside class="land-right-panel" :class="{'statistics-collapsed':statisticsCollapsed,'tasks-collapsed':tasksCollapsed}">
        <section class="land-statistics land-panel" :class="{'panel-collapsed':statisticsCollapsed}"><header><button class="land-panel-toggle" :aria-expanded="!statisticsCollapsed" @click="statisticsCollapsed=!statisticsCollapsed"><h2>场景统计</h2><span>{{ statisticsCollapsed?'＋':'−' }}</span></button></header><div class="land-stat-grid"><div v-for="metric in sceneConfig.metrics" :key="metric.key"><span>{{ metric.name }}</span><div class="land-stat-value"><b>{{ formatLandMetric(stats?.[metric.key],metric.unit) }}</b><small>{{ metric.unit }}</small></div></div></div></section>
        <section class="land-task-panel land-panel" :class="{'panel-collapsed':tasksCollapsed}"><header><button class="land-panel-toggle" :aria-expanded="!tasksCollapsed" @click="tasksCollapsed=!tasksCollapsed"><h2>{{ warning?'核查任务':'整改任务' }}</h2><span>{{ tasksCollapsed?'＋':'−' }}</span></button></header><div class="land-task-filters"><input v-model="keyword" placeholder="搜索任务名称、编号" aria-label="搜索场景任务" /><ElSelect v-model="stage" :empty-values="[null,undefined]" class="system-select" popper-class="system-select-options" aria-label="筛选任务状态"><ElOption value="" label="全部状态" /><ElOption v-for="value in stageOptions" :key="value" :value="value" :label="stageLabel(value)" /></ElSelect></div><div ref="taskItems" class="land-task-items" :aria-busy="busy"><p v-if="busy" class="land-loading" role="status">正在加载…</p><p v-else-if="!result?.records.length">当前条件下暂无任务</p><button v-for="task in result?.records||[]" :key="task.id" class="land-task-item" :data-task-id="task.id" :class="{selected:selected?.id===task.id}" @click="chooseTask(task)"><span class="land-task-title">{{ task.name }}</span><span class="land-task-stage">{{ task.statusLabel||landStageLabels[task.stage] }}</span><small>{{ task.taskNo }} · {{ task.currentHandlerName||'未指定' }}</small><small v-if="task.deadline">期限：{{ formatLandTime(task.deadline) }}</small></button></div><footer class="land-pagination"><button :disabled="pageNum===1||busy" @click="pageNum--;loadPage()">上一页</button><span>{{ pageNum }} / {{ Math.max(1,Math.ceil((result?.total||0)/10)) }}</span><button :disabled="pageNum*10>=(result?.total||0)||busy" @click="pageNum++;loadPage()">下一页</button></footer></section>
      </aside>
    </div>

    <LandImageComparison v-if="comparison&&taskGeometry" :geometry="taskGeometry" :services="services" :before-id="beforeId" :after-id="afterId" @close="comparison=false" @choose="compareChosen" />
  </section>
</template>
