import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const module = {exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/task-todo-state.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(module,module.exports)
const {pendingWorkbenchTasks}=module.exports
const pending=(id,override={})=>({id,myWorkState:'pending',taskStatus:1,...override})
const tasks=[
  pending('current'),pending('mine'),pending('handled',{myWorkState:'handled'}),
  pending('scene-history',{myWorkState:'scene'}),pending('closed',{taskStatus:5}),
  pending('finished-flow',{flow:{status:'FINISHED'}}),pending('completed-flow',{flow:{status:'COMPLETED'}}),
  pending('active-flow',{flow:{status:'PROCESSING'}}),
]
const before=JSON.stringify(tasks)
assert.deepEqual(pendingWorkbenchTasks(tasks,'current').map(task=>task.id),['mine','active-flow'],'Exclude current, handled, scene-visible history and archived tasks')
assert.equal(JSON.stringify(tasks),before,'Do not mutate shared todo data')
assert.equal(pendingWorkbenchTasks([]).length,0)
assert.equal(pendingWorkbenchTasks(tasks).length,3,'No current task means all real pending items remain')
console.log('workbench notices: personal pending only, archived excluded, current task excluded and source unchanged passed')
