import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
class ApiBusinessError extends Error { constructor(code) { super(code); this.code = code } }
let scenario = '', calls = [], reads = 0
const flow = { flowInstanceId: 10, currentNode: { id: 1, bizTaskId: 13, status: 'PROCESSING', assigneeId: 9 }, timeline: [] }
const apiClient = { post: async (path, body) => {
  calls.push({ path, body })
  if (path.endsWith('/flow/detail')) { reads++; if ((scenario === 'absent' || scenario === 'race') && reads === 1) throw new ApiBusinessError('10501'); if (scenario === 'error') throw new Error('network'); return flow }
  if (path.endsWith('/start') && scenario === 'race') throw new ApiBusinessError('10508')
} }
const js = ts.transpileModule(readFileSync('src/api/task-workflow.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('require','module','exports',js)(name => { if (name === './client') return { apiClient, ApiBusinessError }; throw new Error(name) },module,module.exports)
for (const mode of ['existing','absent','race']) {
  scenario=mode; calls=[]; reads=0
  const result=await module.exports.ensureFacilityWorkflowStarted('13')
  assert.equal(result.currentNode.assigneeId,'9')
  assert.equal(calls.filter(c=>c.path.endsWith('/start')).length,mode==='existing'?0:1)
  if(mode!=='existing') assert.deepEqual(calls.find(c=>c.path.endsWith('/start')).body,{bizTaskId:'13'})
}
scenario='error';calls=[];reads=0
await assert.rejects(module.exports.ensureFacilityWorkflowStarted('13'),/network/)
assert.equal(calls.filter(c=>c.path.endsWith('/start')).length,0)
console.log('Facility workflow existing, start, concurrent start and failure checks passed')
