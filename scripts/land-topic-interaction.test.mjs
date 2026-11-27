import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import {parse,compileScript} from '@vue/compiler-sfc'

function load(code,deps){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in deps,`Missing dependency ${name}`);return deps[name]},module,module.exports);return module.exports}
const types=load(readFileSync('src/types/land-supervision.ts','utf8'),{})
const scene=types.LAND_WARNING_SCENE
const shape={type:'Polygon',coordinates:[[[119.9,32.5],[119.91,32.5],[119.91,32.51],[119.9,32.5]]]}
const rows=Array.from({length:25},(_,i)=>({id:String(i+1),sceneCode:scene,name:`任务 ${i+1}`,geometry:shape,history:[],stage:'DISPATCH'}))
const routes=[],pages=[]
const store={demo:false,objects:()=>assert.fail('The regulatory page must not load scope objects'),page:async(_,regions,keyword,stage,pageNum=1)=>{pages.push({keyword,stage,pageNum});return {records:rows.slice((pageNum-1)*10,pageNum*10),total:rows.length}},detail:async id=>({...rows.find(item=>item.id===id),beforeImageId:`before-${id}`,afterImageId:`after-${id}`})}
const base={vue:Vue,'vue-router':{useRouter:()=>({push:route=>routes.push(route)})},'@element-plus/icons-vue':{},'@/components/land-supervision/LandSceneMap.vue':{},'@/components/land-supervision/LandShpUploadDialog.vue':{},'@/stores/land-supervision':{useLandSupervisionStore:()=>store},'@/stores/user':{useUserStore:()=>({activeDeptId:'2',hasPermission:()=>true})},'@/api/map-service':{listEnabledMapServices:async()=>[]},'@/utils/geographic-topic':{},'@/types/land-supervision':types,'@/utils/land-supervision':{},'@/styles/land-supervision.scss':{}}
const renderer=Vue.createRenderer({createComment:()=>({}),insert(){},remove(){},parentNode:()=>null,nextSibling:()=>null})
function mount(file,deps,expose,props){
  const source=readFileSync(file,'utf8').replace('</script>',`defineExpose({${expose}});\n</script>`)
  const component=load(compileScript(parse(source).descriptor,{id:file}).content,deps).default
  component.render=()=>null
  let vm
  const app=renderer.createApp({render:()=>Vue.h(component,{...props,ref:instance=>vm=instance})})
  app.mount({})
  return {app,get vm(){return vm}}
}
const flush=async()=>{for(let i=0;i<8;i++){await Promise.resolve();await Vue.nextTick()}}
const overview=mount('src/views/LandSupervisionTopicView.vue',{...base,'@/components/land-supervision/LandImageComparison.vue':{},'@/api/land-supervision':{landSupervisionEnabled:true,listAllLandTaskRanges:async()=>rows}},'allTasks,result,selected,keyword,stage,pageNum,chooseTask,chooseMapTask,beforeId,afterId,tasksCollapsed,taskContextLoading',{sceneCode:scene})
await flush()
assert.equal(overview.vm.allTasks.length,25)
assert.equal(overview.vm.result.records.length,10)
await overview.vm.chooseTask(rows[2])
assert.equal(overview.vm.beforeId,'before-3');assert.equal(overview.vm.afterId,'after-3','Read saved task comparison imagery on row selection')
overview.vm.keyword='filter';overview.vm.stage='1';overview.vm.tasksCollapsed=true
await Vue.nextTick()
await overview.vm.chooseMapTask('25');await flush()
assert.equal(overview.vm.pageNum,3);assert.equal(overview.vm.selected.id,'25')
assert.equal(overview.vm.keyword,'');assert.equal(overview.vm.stage,'');assert.equal(overview.vm.tasksCollapsed,false)
assert(overview.vm.result.records.some(item=>item.id==='25'),'Map clicks reveal the corresponding task on its actual page')
const pending=new Map()
store.detail=id=>new Promise(resolve=>pending.set(id,resolve))
const oldSelection=overview.vm.chooseTask(rows[0]),newSelection=overview.vm.chooseTask(rows[1])
pending.get('2')({...rows[1],beforeImageId:'new-before',afterImageId:'new-after'});await newSelection
pending.get('1')({...rows[0],beforeImageId:'stale-before',afterImageId:'stale-after'});await oldSelection
assert.equal(overview.vm.selected.id,'2');assert.equal(overview.vm.beforeId,'new-before','A slow former selection must not replace current imagery')
overview.app.unmount()

const comparisonProps=Vue.reactive({geometry:shape,services:[],beforeId:'history-before',afterId:'history-after'})
const comparison=mount('src/components/land-supervision/LandImageComparison.vue',{vue:Vue,'@/components/TaskRangeMap.vue':{}},'before,after',comparisonProps)
assert.equal(comparison.vm.before,'history-before')
comparisonProps.beforeId='updated-before';comparisonProps.afterId='updated-after';await Vue.nextTick()
assert.equal(comparison.vm.before,'updated-before');assert.equal(comparison.vm.after,'updated-after','Async saved choices update an already-mounted comparison')
comparison.app.unmount()

const patch={id:'patch',title:'疑似图斑',sceneCode:scene,spotNo:'TO-1',mapServices:[],regionIds:[],handleStatus:0,auditStatus:1,taskId:'new-task'}
const recognition=mount('src/views/LandRecognitionView.vue',{...base,'@/components/TaskLocationPreview.vue':{},'@/workspace-components/spot-identification/SpotDateTimePicker.vue':{},'@/api/scene':{getBizSceneAssignees:async()=>[]},'@/api/recognition-spot':{getRecognitionSpotTypes:async()=>[]},'@/api/land-recognition':{getLandRecognitionPage:async()=>({records:[patch],total:1}),createLandRecognitionTask:async(...args)=>{assert.equal(args[4],'自定义核查任务');return {id:'new-task'}}},'@/api/client':{ApiBusinessError:class extends Error{}},'@/utils/land-supervision-adapter':{landPolygons:()=>shape},'@/styles/land-recognition.scss':{}},'active,taskName,createTask,openTask,message',{sceneCode:scene})
await flush()
recognition.vm.active=patch;recognition.vm.taskName='自定义核查任务'
await recognition.vm.createTask()
assert.equal(routes.length,0,'Successful task creation must stay on the recognition page')
assert.equal(recognition.vm.active.taskId,'new-task');assert.match(recognition.vm.message,/已创建/)
recognition.vm.openTask();assert.equal(routes.length,1);assert.equal(routes[0].params.taskId,'new-task','Only an explicit user click opens the workbench')
recognition.app.unmount()
const rectifyRows=rows.map(row=>({...row,sceneCode:types.LAND_RECTIFICATION_SCENE}))
store.page=async(_scene,_regions,_keyword,_stage,page=1)=>({records:rectifyRows.slice((page-1)*10,page*10),total:rectifyRows.length})
store.detail=async id=>({...rectifyRows.find(row=>row.id===id),beforeImageId:'saved-before',afterImageId:'saved-after'})
const rectifyOverview=mount('src/views/LandSupervisionTopicView.vue',{...base,'@/components/land-supervision/LandImageComparison.vue':{},'@/api/land-supervision':{landSupervisionEnabled:true,listAllLandTaskRanges:async()=>rectifyRows}},'allTasks,result,pageNum,selected,chooseMapTask',{sceneCode:types.LAND_RECTIFICATION_SCENE})
await flush();assert.equal(rectifyOverview.vm.allTasks.length,25,'Rectification maps include every task, not just the first page')
await rectifyOverview.vm.chooseMapTask('25');await flush();assert.equal(rectifyOverview.vm.pageNum,3);assert.equal(rectifyOverview.vm.selected.id,'25')
rectifyOverview.app.unmount()
const confirmed={...patch,sceneCode:types.LAND_RECTIFICATION_SCENE,sourceType:'UPLOAD'};let drawCalls=0,created=0
const rectifyRecognition=mount('src/views/LandRecognitionView.vue',{...base,'@/components/TaskLocationPreview.vue':{},'@/workspace-components/spot-identification/SpotDateTimePicker.vue':{},'@/api/scene':{getBizSceneAssignees:async()=>[]},'@/api/recognition-spot':{getRecognitionSpotTypes:async()=>[]},'@/api/land-recognition':{getLandRecognitionPage:async()=>({records:[confirmed],total:1}),createLandRecognitionTask:async()=>{created++;return {id:'rectify-task'}}},'@/api/client':{ApiBusinessError:class extends Error{}},'@/utils/land-supervision-adapter':{landPolygons:()=>shape},'@/styles/land-recognition.scss':{}},'active,taskName,createTask,start,drawn,draft,map,afterId,canSave',{sceneCode:types.LAND_RECTIFICATION_SCENE})
await flush();rectifyRecognition.vm.map={start(){drawCalls++}};rectifyRecognition.vm.afterId='after'
rectifyRecognition.vm.start('region');rectifyRecognition.vm.start('plot');rectifyRecognition.vm.drawn('plot',shape)
assert.equal(drawCalls,0,'Rectification has no boundary or patch drawing entry')
assert.equal(rectifyRecognition.vm.draft,undefined);assert.equal(rectifyRecognition.vm.canSave,false)
rectifyRecognition.vm.active={...confirmed,sourceType:'DRAW',taskId:undefined};rectifyRecognition.vm.taskName='历史人工图斑'
await rectifyRecognition.vm.createTask();assert.equal(created,0,'New rectification tasks cannot be created from manually drawn objects')
rectifyRecognition.vm.active={...confirmed,taskId:undefined};rectifyRecognition.vm.taskName='已确认上传图斑'
await rectifyRecognition.vm.createTask();assert.equal(created,1,'Uploaded confirmed polygons still create tasks')
rectifyRecognition.app.unmount()
console.log('PASS: both scene maps cover all task pages, no scope dependencies, rectification blocks drawing and accepts uploaded confirmed patches, saved comparison and create-task stay behavior')
