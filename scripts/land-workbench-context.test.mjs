import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import {parse,compileScript} from '@vue/compiler-sfc'
import {renderToString} from '@vue/server-renderer'

function load(code,deps){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in deps,`Missing dependency ${name}`);return deps[name]},module,module.exports);return module.exports}
const types=load(readFileSync('src/types/land-supervision.ts','utf8'),{})
const workflow=load(readFileSync('src/utils/land-workflow.ts','utf8'),{'@/types/land-supervision':types})
const renderer=Vue.createRenderer({createComment:()=>({}),insert(){},remove(){},parentNode:()=>null,nextSibling:()=>null})
function mount(file,deps,expose,props){
 const source=readFileSync(file,'utf8').replace('</script>',`defineExpose({${expose}});\n</script>`)
 const component=load(compileScript(parse(source).descriptor,{id:file}).content,deps).default
 component.render=()=>null;let vm
 const app=renderer.createApp({render:()=>Vue.h(component,{...props,ref:instance=>vm=instance})});app.mount({})
 return {app,get vm(){return vm}}
}
const flush=async()=>{for(let i=0;i<10;i++){await Promise.resolve();await Vue.nextTick()}}
const shape={type:'MultiPolygon',coordinates:[[[[119.9,32.5],[119.91,32.5],[119.9,32.51],[119.9,32.5]]],[[[119.92,32.52],[119.93,32.52],[119.92,32.53],[119.92,32.52]]]]}
const node={id:'node-1',nodeKey:'DISTRICT_DISPATCH',nodeName:'区县分局派发',status:'PROCESSING',assigneeId:'owner',assigneeName:'真实办理人',deptId:'task-dept'}
const task={id:'first',sceneCode:types.LAND_WARNING_SCENE,taskNo:'TEST-001',name:'任务标题',stage:node.nodeKey,geometry:shape,areaSqm:100,history:[],beforeImageId:'old',afterImageId:'new',currentNode:{...node,key:node.nodeKey,canOperate:false},workflowNodes:[{key:node.nodeKey,name:node.nodeName,instance:node}],workflow:{flowInstanceId:'real-flow',status:'RUNNING',currentNode:node,timeline:[node]}}
let currentTask=task,completeLogs
const mockLogs=[]
const store={demo:false,detail:async()=>currentTask}
const user={currentUser:{id:'viewer'},activeDeptId:'viewer-dept',hasPermission:()=>false}
const deps={vue:Vue,'vue-router':{useRouter:()=>({push(){}})},'@/stores/user':{useUserStore:()=>user},'@/stores/land-supervision':{useLandSupervisionStore:()=>store},'@/types/land-supervision':types,'@/utils/land-workflow':workflow,'@/utils/land-supervision':{landGeometryCenter:()=>[119.9,32.5],landActions:()=>[],landWorkflow:()=>[]},'@/api/my-workflow-tasks':{},'@/api/map-service':{listEnabledMapServices:async()=>[{id:'new',name:'后期',status:1},{id:'unrelated',name:'无关影像',status:1},{id:'old',name:'前期',status:1}]},'@/utils/geographic-topic':{topicRole:()=> 'imagery'},'@/utils/inspection-files':{},'@/api/governance-task':{getGovernanceTaskOperateLogs:async(id,dept)=>{mockLogs.push({id,dept});if(id==='first')return new Promise(resolve=>completeLogs=resolve);return [{id:'current-log'}]}},'@/styles/land-supervision.scss':{},'@/workspace-components/non-grain/workspace.scss':{}}
for(const key of ['./LandWorkflowNodePanel.vue','@/workspace-components/shared/WorkbenchHeader.vue','@/workspace-components/shared/TaskAcceptancePanel.vue','@/workspace-components/non-grain/NonGrainImageryComparison.vue','@/components/TaskRangeThumbnail.vue','@/components/task-center/TaskHistory.vue','@/workspace-components/shared/WorkflowAssigneePicker.vue','@/workspace-components/non-grain/UavReviewPhotoPicker.vue','@/workspace-components/non-grain/ReviewPhotoViewport.vue'])deps[key]={}
const props=Vue.reactive({sceneCode:types.LAND_WARNING_SCENE,taskId:'first'})
const workspace=mount('src/workspace-components/land-supervision/LandSupervisionWorkspace.vue',deps,'geometry,patch,comparisonImages,selectedKey,visit,canOperate,logs,historyLoading',props)
await flush()
assert.deepEqual(workspace.vm.patch.boundaryGeoJson.features[0].geometry,shape,'Comparison and thumbnail must retain every polygon, including disconnected parts')
assert.deepEqual(workspace.vm.comparisonImages.map(image=>image.mapService.id),['old','new'],'Saved task image order must override catalog ordering')
assert.deepEqual(mockLogs[0],{id:'first',dept:'task-dept'},'Task history uses the actual node department')
workspace.vm.visit('FIELD_COLLECT');assert.equal(workspace.vm.selectedKey,'ACCEPTANCE','Future nodes cannot be visited')
workspace.vm.visit('DISTRICT_DISPATCH');assert.equal(workspace.vm.canOperate,false,'Viewing a task never grants submit permission')
currentTask={...task,id:'second',geometry:undefined,beforeImageId:'unavailable',afterImageId:'new'};props.taskId='second';await flush()
assert.equal(workspace.vm.geometry.features.length,0,'Missing geometry must remain empty instead of showing a fabricated patch')
assert.equal(workspace.vm.comparisonImages[0].mapService,undefined,'Unavailable saved imagery must not be replaced by an unrelated service')
completeLogs([{id:'stale-log'}]);await flush();assert.deepEqual(workspace.vm.logs,[{id:'current-log'}],'A late former-task history response cannot overwrite the current task')
workspace.app.unmount()

const noop=Vue.defineComponent({render:()=>null})
const header=load(compileScript(parse(readFileSync('src/workspace-components/shared/WorkbenchHeader.vue','utf8')).descriptor,{id:'header',inlineTemplate:true}).content,{vue:Vue,'./WorkflowSteps.vue':{default:noop},'./WorkbenchTaskNotice.vue':{default:noop}}).default
const html=await renderToString(Vue.createSSRApp(header,{title:'规范工作台',taskName:'不应显示的副标题',userId:'viewer'}))
assert(html.includes('规范工作台'));assert(!html.includes('不应显示的副标题'),'The common header removes the task subtitle for every workbench')
const mark=Vue.defineComponent({render:()=>Vue.h('span',{class:'workbench-required-mark'},'*')})
const formDeps={vue:Vue,'@/stores/user':{useUserStore:()=>user},'@/stores/land-supervision':{useLandSupervisionStore:()=>store},'@/api/task-workflow':{},'@/utils/land-workflow':workflow,'@/utils/inspection-files':{},'@/utils/land-supervision':{landGeometryCenter:()=>[119.9,32.5],formatLandTime:value=>value||'未记录'},'@/workspace-components/shared/WorkbenchRequiredMark.vue':{default:mark}}
for(const key of ['@/workspace-components/shared/WorkflowAssigneePicker.vue','@/workspace-components/non-grain/UavReviewPhotoPicker.vue','@/workspace-components/non-grain/ReviewPhotoViewport.vue'])formDeps[key]={default:noop}
const form=load(compileScript(parse(readFileSync('src/workspace-components/land-supervision/LandWorkflowNodePanel.vue','utf8')).descriptor,{id:'node-form',inlineTemplate:true}).content,formDeps).default
function formTask(key,editable=true){const actual={...node,nodeKey:key};return {...task,stage:key,currentNode:{...actual,key,canOperate:editable},workflowNodes:[{key,instance:actual}]}}
const fieldHtml=await renderToString(Vue.createSSRApp(form,{task:formTask('FIELD_COLLECT'),nodeKey:'FIELD_COLLECT'}))
assert.match(fieldHtml,/<input[^>]+type="date"[^>]+required/)
assert.match(fieldHtml,/<textarea[^>]+required/)
assert.match(fieldHtml,/<span><span class="workbench-required-mark">\*<\/span>采集日期<\/span>/,'The required mark and label stay in the same row')
const auditHtml=await renderToString(Vue.createSSRApp(form,{task:formTask('SECTION_AUDIT'),nodeKey:'SECTION_AUDIT'}))
assert.match(auditHtml,/type="radio"[^>]+value="NO_PROBLEM"[^>]+required/)
assert.match(auditHtml,/type="radio"[^>]+value="PROBLEM"[^>]+required/)
const readonlyHtml=await renderToString(Vue.createSSRApp(form,{task:formTask('FIELD_COLLECT',false),nodeKey:'FIELD_COLLECT'}))
assert(!readonlyHtml.includes('<form'),'Read-only viewers must never receive a submittable node form')
console.log('PASS: task imagery ordering, complete MultiPolygon context, real history department, read-only permissions, unavailable imagery, stale history isolation, mandatory forms and common subtitle removal')
