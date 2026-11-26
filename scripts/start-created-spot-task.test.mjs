import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
let calls=[], results=[]
const deps={
 '@/api/non-grain-assignment': { isNonGrainScene: code=>code==='NON_GRAIN', assignNonGrainReview:async (...args)=>calls.push(['assign',...args]) },
 '@/api/task-workflow': { getTaskWorkflow:async id=>{calls.push(['detail',id]);return results.shift()}, startTaskWorkflow:async (...args)=>calls.push(['start',...args]) },
}
const code=ts.transpileModule(fs.readFileSync('src/utils/start-created-spot-task.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const mod={exports:{}};new Function('require','module','exports',code)(name=>deps[name],mod,mod.exports)
const start=mod.exports.startCreatedSpotTask, task={id:'123',sceneCode:'FORESTRY',deptId:'9'}, flow={status:'RUNNING',currentNode:{id:'node'}}
results=[undefined,flow];await start(task,'','',undefined);assert.deepEqual(calls,[['detail','123'],['start','123','9'],['detail','123']])
calls=[];results=[flow];await start(task,'','',undefined);assert.deepEqual(calls,[['detail','123']])
calls=[];await start({...task,sceneCode:'NON_GRAIN'},'','', '88');assert.deepEqual(calls,[['assign','123','9','88']])
calls=[];results=[undefined,undefined];await assert.rejects(start(task,'','',undefined),/未确认/)
console.log('Created spot tasks: default start, existing flow, non-grain assignment and failure passed')
