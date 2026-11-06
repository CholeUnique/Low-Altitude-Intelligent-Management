import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const load=(path,deps={})=>{const module={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(id=>deps[id]||{},module,module.exports);return module.exports}
const {workflowNodeActor}=load('src/utils/workflow-node-actor.ts')
const completed={id:'a',nodeKey:'IMPLEMENT',status:'COMPLETED',assigneeId:'1',assigneeName:'张三',submitTime:'2026-11-06T10:20:30',createTime:'2026-11-01T08:00:00'}
assert.equal(workflowNodeActor(completed,'1').initial,'张')
assert.equal(workflowNodeActor(completed,'1').mine,true)
assert.match(workflowNodeActor(completed,'1').tooltip,/10:20:30/)
assert.equal(workflowNodeActor(completed,'2').mine,false)
assert.match(workflowNodeActor({...completed,submitTime:undefined},'1').tooltip,/未记录实际处理时间/)
assert(!workflowNodeActor({...completed,submitTime:undefined},'1').tooltip.includes('11-01'),'Creation time must not be reported as processing time')
assert.match(workflowNodeActor({...completed,status:'PROCESSING',submitTime:undefined},'1').tooltip,/办理中/)
assert.equal(workflowNodeActor(undefined,'1').initial,'—')
const {projectTaskListWorkflow}=load('src/utils/task-list-workflow.ts',{'./task-workflow-state':{nonGrainNodeKey:node=>node.nodeKey,workflowNodeDisplayName:node=>node.nodeName}})
const task={id:'task',taskStatus:0,sceneCode:'test',assigneeId:'owner',assigneeName:'任务负责人'}
const current={...completed,id:'f',nodeKey:'FINISH',nodeName:'结案归档',status:'PROCESSING',assigneeId:'current',assigneeName:'李四'}
const flow={status:'RUNNING',timeline:[completed,current],currentNode:current}
const projected=projectTaskListWorkflow(task,flow)
assert.equal(projected.currentHandlerId,'current');assert.equal(projected.currentHandlerName,'李四')
assert.equal(projected.assigneeName,'任务负责人','Do not overwrite the task owner with its current handler')
assert.equal(projectTaskListWorkflow(task,{...flow,status:'FINISHED'}).currentHandlerId,undefined)
assert.equal(projectTaskListWorkflow({...task,taskStatus:4},flow).currentHandlerId,undefined)
assert.equal(projectTaskListWorkflow(task).currentHandlerId,undefined,'Do not infer a current handler from a task owner')
console.log('PASS: actual node actor/time, unknown timing, current handler projection and finished task isolation')
